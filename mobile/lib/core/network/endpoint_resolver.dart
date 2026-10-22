// ignore_for_file: unused_element

import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'host_challenge.dart';

/// Picks a local API origin at runtime.
///
/// Strategy: probe a priority-ordered candidate list with `GET /config/app`
/// and adopt the first healthy origin. Remote origins are never used.
///
/// Candidate order:
///   1. Local `--dart-define=API_BASE_URL` when reachable
///   2. A reachable local dev server (USB, emulator, or LAN)
class EndpointResolver {
  EndpointResolver._();

  static const _prefsKey = 'api_endpoint';

  /// Last LAN origin the backend advertised for itself (`lan_url`). Preferred
  /// over USB loopback whenever it answers — see [rememberLanOrigin].
  static const _lanKey = 'api_lan_origin';

  /// Explicit compile-time override (empty when not provided).
  /// Leave empty when using the localhost PHP dev server for Google sign-in
  /// testing; EndpointResolver will then probe the configured local dev hosts.
  static const _override = String.fromEnvironment('API_BASE_URL', defaultValue: '');

  /// Local dev-server hosts, comma separated `host[:port]`:
  /// `--dart-define=LOCAL_API_HOSTS=192.168.1.43:8000,127.0.0.1:8000`.
  ///
  /// Deliberately NOT hardcoded to one machine's Wi-Fi address: a stale IP is
  /// the classic cause of "the app only works while the cable is plugged in"
  /// (it fights the real host and adds a dead candidate to every probe).
  /// The only loopback entries here are for emulators/simulators; a physical
  /// device must use a LAN origin discovered at runtime (see _discoverLanOrigin)
  /// or an explicit --dart-define=API_BASE_URL.
  static const _localHosts = String.fromEnvironment(
    'LOCAL_API_HOSTS',
    defaultValue: 'localhost:8000,127.0.0.1:8000',
  );


  /// Origins derived from [_localHosts]. 127.0.0.1 = USB `adb reverse` /
  /// iOS simulator, localhost = loopback, 10.0.2.2 = Android emulator. The
  /// laptop's Wi-Fi address is learned at runtime instead (see
  /// [rememberLanOrigin]) so it never has to be hardcoded.
  static List<String> get _localCandidates {
    final list = <String>[];
    for (final raw in _localHosts.split(',')) {
      final host = raw.trim();
      if (host.isEmpty) continue;
      final url = 'http://$host/api';
      if (!list.contains(url)) list.add(url);
    }
    return list;
  }

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

  /// LAN origin learned from the backend (see [rememberLanOrigin]).
  static String? _lanOrigin;

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
    var saved = prefs.getString(_prefsKey);
    // Purge an origin remembered from a previous backend: a stale remote host
    // must not win the fast path and re-break the app after the switch to the
    // local server.
    if (saved != null && !_isLocalOrigin(saved)) {
      await prefs.remove(_prefsKey);
      saved = null;
    }

    final local = <String>[];
    void add(List<String> into, String? url) {
      final normalized = _normalize(url);
      if (normalized == null) return;
      if (!into.contains(normalized)) into.add(normalized);
    }

    if (_isLocalOrigin(_override)) add(local, _override);
    // The Wi-Fi origin the backend reported for itself goes first: it is the
    // only local address that keeps answering after the USB cable is pulled.
    var lanOrigin = _lanOrigin ?? prefs.getString(_lanKey);
    if (lanOrigin != null && !_isLocalOrigin(lanOrigin)) {
      await prefs.remove(_lanKey);
      lanOrigin = null;
    }
    _lanOrigin = lanOrigin;
    add(local, lanOrigin);

    // Last known-good origin keeps the fast path — but never persist a raw
    // loopback origin (localhost / 127.0.0.1): those only work on the same
    // machine and survive neither a network switch nor a cold start where the
    // dev server was started after the app.
    // On a local dev machine, probe the compile-time localhost override first,
    // before the broader candidate list, so the splash can reach php -S without
    // waiting on a LAN sweep or a stale remembered IP.
    if (_override != '' &&
        _isLocalOrigin(_override) &&
        await _probe(
          _override.replaceFirst(RegExp(r'/$'), ''),
          quick: true,
        )) {
      return _adopt(prefs, _override.replaceFirst(RegExp(r'/$'), ''));
    }
    if (saved != null && !_isLoopbackOrigin(saved)) {
      add(local, saved);
    }

    for (final candidate in _localCandidates) {
      add(local, candidate);
    }
    // On web the API is served from the page's own origin: that is the live
    // endpoint for a deployed build, and loopback for a local dev build.
    for (final runtime in _runtimeCandidates) {
      if (_isLocalOrigin(runtime)) add(local, runtime);
    }

    final configured = await _probeLocal(local);
    final winner = configured ?? await _discoverLanOrigin();

    if (winner != null) return _adopt(prefs, winner);

    // Leave discovery unlocked so a dev server started later can be found.
    _resolved = false;
    _inflight = null;
    return false;
  }

  /// Records the LAN origin the backend advertises for itself (`lan_url` in
  /// `GET /config/app`, e.g. `http://192.168.1.43:8000`).
  ///
  /// Called once the app has reached the server through *any* origin — USB
  /// loopback included — so it can switch to the Wi-Fi address and keep working
  /// with the cable unplugged. Triggering a re-probe here is safe: the value is
  /// remembered before resolving, so this can only fire once per address.
  static void rememberLanOrigin(String? url) {
    final normalized = _normalize(url);
    if (normalized == null || !_isLocalOrigin(normalized)) return;
    if (_lanOrigin == normalized) return;

    _lanOrigin = normalized;
    SharedPreferences.getInstance()
        .then((prefs) => prefs.setString(_lanKey, normalized))
        .ignore();

    if (_current != null && _current != normalized) {
      _resolved = false;
      _inflight = null;
      resolve(force: true);
    }
  }

  static String? _normalize(String? url) {
    if (url == null || url.isEmpty) return null;
    var normalized = url.replaceFirst(RegExp(r'/$'), '');
    final parsed = Uri.tryParse(normalized);
    if (parsed == null || parsed.host.isEmpty) return null;
    if (!normalized.endsWith('/api')) {
      normalized = '$normalized/api';
    }
    return normalized;
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

  /// True for pure loopback hosts (localhost / 127.0.0.1 / ::1) that never
  /// work from a physical device and must not be persisted across launches.
  static bool _isLoopbackOrigin(String url) {
    final host = Uri.tryParse(url)?.host ?? '';
    return host == 'localhost' || host == '127.0.0.1' || host == '::1';
  }

  /// Finds a dev server on the phone's own network by probing the local /24.
  ///
  /// The laptop's address cannot be known in advance (DHCP hands out a new one
  /// on the next network) and hardcoding it is exactly what broke before. The
  /// phone already knows its own address and subnet, so the same /24 is probed
  /// concurrently in small batches with a tight timeout — a full pass takes
  /// about a second, and the winner is persisted so later launches skip it.
  ///
  /// Only checks port 8000 on the device's private IPv4 subnet, and is skipped
  /// when the device is not on a private IPv4 network.
  static Future<String?> _discoverLanOrigin() async {
    // Runs in release too: on a real handset a release build is often the only
    // thing being tested against the laptop's dev server, and without this the
    // app could only ever reach it over USB loopback — so unplugging the cable
    // killed the feed. The sweep is bounded (a /24 in batches) and only
    // private networks are touched.
    List<NetworkInterface> interfaces;
    try {
      interfaces = await NetworkInterface.list(
        type: InternetAddressType.IPv4,
        includeLoopback: false,
      );
    } catch (_) {
      return null;
    }

    // Cellular interfaces often get private 10.x addresses too, but cannot
    // reach a PHP server running on the developer's Wi-Fi. Skip those ranges
    // and check Wi-Fi before any remaining private interfaces.
    interfaces =
        interfaces
            .where(
              (iface) => !RegExp(
                r'(ccmni|rmnet|pdp|wwan)',
                caseSensitive: false,
              ).hasMatch(iface.name),
            )
            .toList()
          ..sort((a, b) {
            final aWifi = RegExp(
              r'(wlan|wifi)',
              caseSensitive: false,
            ).hasMatch(a.name);
            final bWifi = RegExp(
              r'(wlan|wifi)',
              caseSensitive: false,
            ).hasMatch(b.name);
            return (aWifi ? 0 : 1).compareTo(bWifi ? 0 : 1);
          });

    final candidates = <String>[];
    for (final iface in interfaces) {
      for (final address in iface.addresses) {
        if (!_isPrivateIPv4(address.address)) continue;
        final subnet = address.address.substring(
          0,
          address.address.lastIndexOf('.'),
        );
        for (var host = 1; host <= 254; host++) {
          final url = 'http://$subnet.$host:8000/api';
          if (!candidates.contains(url)) candidates.add(url);
        }
      }
    }
    if (candidates.isEmpty) return null;

    const batchSize = 48;
    for (var start = 0; start < candidates.length; start += batchSize) {
      final batch = candidates.sublist(
        start,
        (start + batchSize).clamp(0, candidates.length),
      );
      final answers = await Future.wait(batch.map(_quickProbe));
      for (var i = 0; i < batch.length; i++) {
        if (answers[i]) return batch[i];
      }
    }
    return null;
  }

  static bool _isPrivateIPv4(String ip) =>
      ip.startsWith('192.168.') ||
      ip.startsWith('10.') ||
      RegExp(r'^172\.(1[6-9]|2\d|3[01])\.').hasMatch(ip);

  /// Minimal probe used while sweeping the LAN: no retries, no challenge
  /// solving, sub-second budget — it must fail fast on 250+ silent hosts.
  static Future<bool> _quickProbe(String base) async {
    final dio = Dio(
      BaseOptions(
        baseUrl: base,
        connectTimeout: const Duration(milliseconds: 450),
        receiveTimeout: const Duration(milliseconds: 700),
        validateStatus: (status) => status != null,
        headers: const {'Accept': 'application/json'},
      ),
    );
    try {
      final response = await dio.get<dynamic>('/config/app');
      final data = response.data;
      return response.statusCode == 200 &&
          data is Map &&
          data['success'] == true;
    } catch (_) {
      return false;
    } finally {
      dio.close(force: true);
    }
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
        // Bound each local candidate so a missing dev server fails promptly.
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

  /// Re-runs discovery after a request failed to reach the adopted local
  /// origin (dev server started after boot, network switched).
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
