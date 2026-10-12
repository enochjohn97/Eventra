import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'host_challenge.dart';

/// Picks the API origin (live host or local dev server) at runtime.
///
/// Strategy: probe a priority-ordered candidate list with `GET /config/app`
/// (solving the hosting anti-bot challenge inline) and adopt the first healthy
/// origin. The winner is persisted, so subsequent launches go straight to it.
///
/// Candidate order:
///   1. `--dart-define=API_BASE_URL` (explicit override always wins when set
///      *and* reachable — a release build hard-pins production this way)
///   2. Last known-good origin from SharedPreferences (fast path)
///   3. Production default
///   4. Local dev candidates (emulator/simulator/LAN) — only probed when no
///      remote candidate answered, so production users never wait on them
class EndpointResolver {
  EndpointResolver._();

  static const _prefsKey = 'api_endpoint';

  /// Explicit compile-time override (empty when not provided).
  static const _override = String.fromEnvironment('API_BASE_URL');

  /// Extra remote origins, comma-separated:
  /// `--dart-define=API_BASE_URLS=https://new-host.com/api,https://cdn.example.com/api`
  /// Lets a re-hosted backend be added without touching this file.
  static const _extraOrigins = String.fromEnvironment('API_BASE_URLS');

  /// Live platform origin. Override at build time when the backend is moved;
  /// development builds still prefer a reachable local server.
  static const _production = String.fromEnvironment(
    'PRODUCTION_API_BASE_URL',
    defaultValue: 'https://eventra-website.liveblog365.com/api',
  );

  /// Local dev-server origins. A dev build prefers whichever of these answers
  /// (USB `adb reverse`, emulator loopback, or a LAN host) so the same build
  /// works against `php -S` locally and against the live platform in
  /// production without any rebuild.
  static const _localCandidates = [
    'http://10.0.2.2:8000/api', // Android emulator → host loopback
    'http://127.0.0.1:8000/api', // iOS simulator / Flutter web on the host
    'http://localhost:8000/api', // Flutter web / desktop on the host
  ];

  /// Origin the app itself is served from (Flutter web only). Web and API are
  /// normally deployed together, so `<origin>/api` is the most likely live
  /// endpoint and lets a deployed web build target its own host with no
  /// rebuild. Empty on native builds.
  static List<String> get _runtimeCandidates {
    if (!kIsWeb) return const [];
    final base = Uri.base;
    if (!base.hasScheme || base.host.isEmpty) return const [];
    return ['${base.scheme}://${base.authority}/api'];
  }

  static bool _resolved = false;

  static Future<bool>? _inflight;

  /// Origin currently adopted by [ApiClient].
  static String? _current;

  static bool get resolved => _resolved;

  static String? get current => _current;

  /// Probe until one origin answers with real API JSON. Safe to call multiple
  /// times — concurrent callers share one probe, and after the first success
  /// it is a no-op.
  static Future<bool> resolve({bool force = false}) {
    if (_resolved && !force) return Future.value(true);
    if (!force && _inflight != null) return _inflight!;
    final future = _doResolve();
    _inflight = future;
    return future;
  }

  static Future<bool> _doResolve() async {
    final prefs = await SharedPreferences.getInstance();
    final saved = prefs.getString(_prefsKey);

    final local = <String>[];
    final remote = <String>[];
    void add(List<String> into, String? url) {
      if (url == null || url.isEmpty) return;
      final normalized = url.replaceFirst(RegExp(r'/$'), '');
      final parsed = Uri.tryParse(normalized);
      if (parsed == null || parsed.host.isEmpty) return;
      if (!into.contains(normalized)) into.add(normalized);
    }

    // An explicit `--dart-define=API_BASE_URL` always wins inside its group.
    add(_isLocalOrigin(_override) ? local : remote, _override);
    for (final raw in _extraOrigins.split(',')) {
      final url = raw.trim();
      if (url.isEmpty) continue;
      add(_isLocalOrigin(url) ? local : remote, url);
    }
    // Last known-good origin keeps the fast path, in its own group.
    if (saved != null) add(_isLocalOrigin(saved) ? local : remote, saved);
    for (final candidate in _localCandidates) {
      add(local, candidate);
    }
    // On web the API is served from the page's own origin: that is the live
    // endpoint for a deployed build, and loopback for a local dev build.
    for (final runtime in _runtimeCandidates) {
      add(_isLocalOrigin(runtime) ? local : remote, runtime);
    }
    add(remote, _production);

    // Both groups are probed at the same time so the two never add up to
    // sequential timeouts. Which answer wins depends on the build:
    //
    //  * dev build (`flutter run` — USB device, emulator, desktop): a reachable
    //    local `php -S` server wins immediately. Before, the remote host was
    //    probed first, so a device that *could* reach the dev server was still
    //    pinned to the live host — every screen then failed with 'hosting
    //    security check' / 'could not load events'.
    //  * release build (installed on the live platform): the live host wins,
    //    and a local server is only used when nothing remote answers.
    final localProbe = _probeLocal(local);
    final remoteProbe = _probeAll(remote);
    final winner = kReleaseMode
        ? (await remoteProbe ?? await localProbe)
        : (await localProbe ?? await remoteProbe);

    if (winner != null) return _adopt(prefs, winner);

    // Nothing answered (offline, or the API moved). With a configured live
    // origin, pin it so requests target the real host instead of retrying
    // dead dev-server addresses; without one, stay unresolved so the app keeps
    // retrying discovery rather than adopting an empty origin.
    if (_production.isNotEmpty) {
      await _adopt(prefs, _production);
    }
    _inflight = null;
    return false;
  }

  /// True for loopback / RFC1918 / emulator hosts (local `php -S` dev server).
  static bool _isLocalOrigin(String url) {
    final host = Uri.tryParse(url)?.host ?? '';
    return host == 'localhost' ||
        host == '127.0.0.1' ||
        host == '::1' ||
        host == '10.0.2.2' ||
        host.startsWith('192.168.') ||
        host.startsWith('10.') ||
        RegExp(r'^172\.(1[6-9]|2\d|3[01])\.').hasMatch(host);
  }

  static Future<String?> _probeAll(List<String> candidates) async {
    final seen = <String>{};
    for (final candidate in candidates) {
      if (!seen.add(candidate)) continue;
      if (await _probe(candidate)) return candidate;
    }
    return null;
  }

  /// Probes every local candidate at once (they are all loopback/LAN, so they
  /// fail instantly when absent) and returns the first that answered in
  /// priority order, not whichever raced ahead.
  static Future<String?> _probeLocal(List<String> candidates) async {
    if (candidates.isEmpty) return null;
    final answers = await Future.wait(
      candidates.map((candidate) => _probe(candidate, quick: true)),
    );
    for (var i = 0; i < candidates.length; i++) {
      if (answers[i]) return candidates[i];
    }
    return null;
  }

  /// True when [base] answers `GET {base}/config/app` with API JSON, including
  /// hosts that first return the anti-bot challenge page.
  static Future<bool> _probe(String base, {bool quick = false}) async {
    final dio = Dio(
      BaseOptions(
        baseUrl: base,
        // Bounded so a dead/unreachable candidate cannot eat the splash
        // timeout (main.dart awaits resolve() for at most 20s before it falls
        // back to the last-known-good / production origin). The local pass is
        // tighter still: a local error (fatal HTML, no server) must not delay
        // the live path.
        connectTimeout: Duration(seconds: quick ? 2 : 5),
        receiveTimeout: Duration(seconds: quick ? 3 : 8),
        validateStatus: (status) => status != null,
        headers: {
          'Accept': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
      ),
    );

    try {
      final attempts = quick ? 1 : 2;
      for (var attempt = 0; attempt < attempts; attempt++) {
        if (attempt > 0) {
          // The local PHP dev server is single-threaded and can queue this
          // probe behind a slow DB-backed request — retry before giving up.
          await Future.delayed(const Duration(seconds: 1));
        }
        final Response<dynamic> response;
        try {
          response = await dio.get<dynamic>('/config/app');
        } on DioException catch (_) {
          continue;
        }
        final data = response.data;

        if (data is Map) {
          return response.statusCode != null &&
              response.statusCode! >= 200 &&
              response.statusCode! < 300 &&
              data['success'] == true;
        }
        if (data is String && HostChallenge.isChallenge(data)) {
          final cookie = HostChallenge.solve(data);
          if (cookie == null) return false;
          dio.options.headers['Cookie'] = cookie;
          continue;
        }
        return false;
      }
    } catch (_) {
      return false;
    } finally {
      dio.close(force: true);
    }
    return false;
  }

  static Future<bool> _adopt(SharedPreferences prefs, String url) async {
    _current = url;
    await prefs.setString(_prefsKey, url);
    // Applied lazily through the callback so EndpointResolver never imports
    // ApiClient (ApiClient's services import this file's package graph).
    _onAdopt?.call(url);
    _resolved = true;
    debugPrint('EndpointResolver → using API at $url');
    return true;
  }

  /// Re-runs discovery after a request failed to *reach* the adopted origin
  /// (live host down, dev server started after boot, network switched).
  /// Returns true when the adopted origin actually moved, so the caller can
  /// safely replay the failed request against the new one.
  static Future<bool> recover() async {
    final previous = _current;
    _resolved = false;
    _inflight = null;
    try {
      await resolve();
    } catch (_) {
      return false;
    }
    return _current != null && _current != previous;
  }

  static void Function(String url)? _onAdopt;

  /// Registered by ApiClient at startup to receive the chosen base URL.
  static void registerAdopter(void Function(String url) adopter) {
    _onAdopt = adopter;
  }
}
