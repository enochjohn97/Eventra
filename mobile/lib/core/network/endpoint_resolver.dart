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

  /// Known live origins, most-authoritative first. Add the new host here (or
  /// pass it via `API_BASE_URLS`) when the backend moves platforms.
  static const _production = 'https://eventra-website.liveblog365.com/api';

  static const _localCandidates = [
    'http://10.0.2.2:8000/api', // Android emulator → host loopback
    'http://127.0.0.1:8000/api', // iOS simulator / local
    'http://localhost:8000/api',
  ];

  static bool _resolved = false;

  static Future<bool>? _inflight;

  static bool get resolved => _resolved;

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

    final candidates = <String>[];
    void add(String? url) {
      if (url == null || url.isEmpty) return;
      final normalized = url.replaceFirst(RegExp(r'/$'), '');
      if (Uri.tryParse(normalized) == null) return;
      if (!candidates.contains(normalized)) candidates.add(normalized);
    }

    add(_override.isEmpty ? null : _override);
    for (final raw in _extraOrigins.split(',')) {
      add(raw.trim());
    }
    // A stale *local dev* origin (php -S from a previous run) must never be
    // probed before the live host — that is what forced developers to start
    // the local server before sign-in worked. Local origins are demoted to
    // the fallback pass below; only remote last-known-good origins keep the
    // fast path.
    if (saved != null && !_isLocalOrigin(saved)) add(saved);
    add(_production);
    if (saved != null && _isLocalOrigin(saved)) add(saved);

    // Remote candidates first; only fall back to local dev servers if none of
    // them answer (a production device should not hang on 10.0.2.2).
    final winner = await _probeAll(candidates) ??
        await _probeAll([
          ...candidates,
          ..._localCandidates.map((u) => u.replaceFirst(RegExp(r'/$'), '')),
        ]);

    if (winner != null) return _adopt(prefs, winner);

    // Nothing answered (offline, or the API moved): pin the production origin
    // so the app deterministically targets the live host instead of retrying
    // dead dev-server addresses on every request.
    await _adopt(prefs, _production);
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

  /// True when [base] answers `GET {base}/config/app` with API JSON, including
  /// hosts that first return the anti-bot challenge page.
  static Future<bool> _probe(String base) async {
    final dio = Dio(
      BaseOptions(
        baseUrl: base,
        connectTimeout: const Duration(seconds: 5),
        receiveTimeout: const Duration(seconds: 8),
        headers: {
          'Accept': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
      ),
    );

    try {
      for (var attempt = 0; attempt < 2; attempt++) {
        final response = await dio.get<dynamic>('/config/app');
        final data = response.data;

        if (data is Map) {
          return data['success'] == true;
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
    await prefs.setString(_prefsKey, url);
    // Applied lazily through the callback so EndpointResolver never imports
    // ApiClient (ApiClient's services import this file's package graph).
    _onAdopt?.call(url);
    _resolved = true;
    debugPrint('EndpointResolver → using API at $url');
    return true;
  }

  static void Function(String url)? _onAdopt;

  /// Registered by ApiClient at startup to receive the chosen base URL.
  static void registerAdopter(void Function(String url) adopter) {
    _onAdopt = adopter;
  }
}
