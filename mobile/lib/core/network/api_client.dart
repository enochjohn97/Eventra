import 'dart:io';

import 'package:dio/dio.dart';
import 'package:dio/io.dart';

import '../storage/secure_storage.dart';
import 'api_exception.dart';
import 'endpoint_resolver.dart';
import 'host_challenge.dart';

class ApiClient {
  static final ApiClient _instance = ApiClient._internal();
  late Dio dio;
  String? baseOrigin;

  factory ApiClient() => _instance;

  // Retry delays for transient server errors (e.g. brief HTML responses from
  // anti-bot layer) — also gives the challenge solver up to 4 fresh attempts,
  // which matters on flaky mobile connections that truncate the challenge HTML.
  static const _retryDelays = [2, 3, 5];

  /// Start on the live API so Google sign-in works before discovery finishes
  /// and when no local PHP server is running. `API_BASE_URL` remains the
  /// explicit override for local development.
  static const _productionBaseUrl = String.fromEnvironment(
    'PRODUCTION_API_BASE_URL',
    defaultValue: 'https://eventra-website.liveblog365.com/api',
  );
  static const _defaultBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: _productionBaseUrl,
  );

  ApiClient._internal() {
    final parsedBaseUrl = Uri.tryParse(_defaultBaseUrl);
    if (parsedBaseUrl == null ||
        !parsedBaseUrl.hasScheme ||
        (parsedBaseUrl.scheme != 'http' && parsedBaseUrl.scheme != 'https') ||
        parsedBaseUrl.host.isEmpty) {
      throw StateError('API_BASE_URL must be a valid HTTP or HTTPS URL.');
    }
    baseOrigin = '${parsedBaseUrl.scheme}://${parsedBaseUrl.authority}';

    // NOTE: `dio` is created exactly once. Services (GoogleAuthService,
    // AppConfigService, …) capture `ApiClient().dio` in static fields, so the
    // instance must never be replaced — [setBaseUrl] mutates its options.
    _createDio(_defaultBaseUrl);

    // Let EndpointResolver switch this client to whichever origin (live or
    // local) actually serves the API.
    EndpointResolver.registerAdopter(setBaseUrl);
  }

  void _createDio(String url) {
    dio = Dio(
      BaseOptions(
        baseUrl: url.replaceFirst(RegExp(r'/$'), ''),
        // Long enough for the shared host's cold start; individual requests
        // override this downward where appropriate (see user_profile_service).
        connectTimeout: const Duration(seconds: 120),
        receiveTimeout: const Duration(seconds: 120),
        followRedirects: true,
        maxRedirects: 5,
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          // NOTE: no `Connection: close` — keep-alive lets the anti-bot
          // challenge and its replay share one connection, and avoids the
          // mid-body resets ('Connection closed while receiving data') the
          // shared host produces on mobile networks.
          'User-Agent': 'Dart/3.12.2 (EventOut Mobile)',
          'X-Requested-With': 'XMLHttpRequest',
        },
      ),
    );

    // Keep connections alive long enough for the shared host to finish responses.
    (dio.httpClientAdapter as IOHttpClientAdapter).createHttpClient = () {
      final client = HttpClient();
      client.idleTimeout = const Duration(seconds: 30);
      return client;
    };

    // Preserve a challenge cookie obtained by [EndpointResolver] across switches.
    final existingCookie = _bypassCookie;
    if (existingCookie != null) {
      dio.options.headers['Cookie'] = existingCookie;
    }

    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          final token = await SecureStorage.getToken();
          if (token != null && token.isNotEmpty) {
            options.headers['Authorization'] = 'Bearer $token';
          }
          // Track retry count via extra map
          options.extra['_retryCount'] ??= 0;
          return handler.next(options);
        },
        onResponse: (response, handler) async {
          final contentType = (response.headers.value('content-type') ?? '')
              .toLowerCase();
          final body = _bodyAsString(response.data);
          final isHtml =
              contentType.contains('text/html') || _looksLikeHtml(body);

          // ── Hosting anti-bot challenge (AES JS puzzle → __test cookie) ────
          // Solving it natively is instant and works the same on Android/iOS
          // and against local or live hosts — no WebView required.
          if (isHtml && HostChallenge.isChallenge(body)) {
            final opts = response.requestOptions;
            final solved = HostChallenge.solve(body);
            if (solved != null) {
              setBypassCookie(solved);
              // CRITICAL: a replayed RequestOptions never re-reads
              // dio.options.headers, so the bypass cookie must be attached
              // to the request itself or the host serves the challenge again.
              opts.headers['Cookie'] = solved;
            }
            // ALWAYS replay, even when the inline solve failed (truncated
            // challenge body on a flaky connection): _replay re-fetches a
            // fresh challenge page and solves it there, instead of failing
            // the request outright with 'hosting security check'.
            try {
              final retryResponse = await _replay(opts);
              if (retryResponse != null) {
                return handler.resolve(retryResponse);
              }
            } catch (e) {
              return handler.reject(
                e is DioException
                    ? e
                    : DioException(requestOptions: opts, error: e),
              );
            }
            return handler.reject(
              DioException(
                requestOptions: response.requestOptions,
                response: response,
                type: DioExceptionType.badResponse,
                message:
                    'Eventra could not pass the hosting security check. '
                    'Please try again in a moment.',
              ),
            );
          }

          final isColdStart =
              [502, 503, 504].contains(response.statusCode) ||
              contentType.contains('text/html');
          if (isColdStart) {
            // Cold start / WAF page: wait briefly, then replay on a fresh
            // connection until the host answers with real API data.
            final opts = response.requestOptions;
            await Future.delayed(Duration(seconds: _retryDelays[0]));
            try {
              final retryResponse = await _replay(opts);
              if (retryResponse != null) {
                return handler.resolve(retryResponse);
              }
            } catch (e) {
              return handler.reject(
                e is DioException
                    ? e
                    : DioException(requestOptions: opts, error: e),
              );
            }
            return handler.reject(
              DioException(
                requestOptions: response.requestOptions,
                response: response,
                type: DioExceptionType.badResponse,
                message:
                    'Server is starting up. Please wait a moment and try again.',
              ),
            );
          }
          return handler.next(response);
        },
        onError: (error, handler) async {
          if (error.response != null) {
            final contentType =
                (error.response?.headers.value('content-type') ?? '')
                    .toLowerCase();
            final body = _bodyAsString(error.response?.data);
            final isHtml =
                contentType.contains('text/html') || _looksLikeHtml(body);

            // HTML error body = anti-bot challenge — solve and replay instead
            // of failing (mirrors the success-path handling above).
            if (isHtml && HostChallenge.isChallenge(body)) {
              final opts = error.requestOptions;
              final solved = HostChallenge.solve(body);
              if (solved != null) {
                setBypassCookie(solved);
                // Replay never re-reads dio.options.headers — attach the
                // bypass cookie to the request itself (see onResponse).
                opts.headers['Cookie'] = solved;
              }
              // Replay unconditionally: _replay re-fetches and re-solves a
              // fresh challenge when the inline solve failed (truncated
              // body) so a flaky first response never fails the request.
              try {
                final retryResponse = await _replay(opts);
                if (retryResponse != null) {
                  return handler.resolve(retryResponse);
                }
              } catch (e) {
                return handler.next(
                  e is DioException
                      ? e
                      : DioException(requestOptions: opts, error: e),
                );
              }
              return handler.next(
                DioException(
                  requestOptions: error.requestOptions,
                  response: error.response,
                  type: DioExceptionType.badResponse,
                  message:
                      'Eventra could not pass the hosting security check. '
                      'Please try again in a moment.',
                ),
              );
            }

            final isColdStart = [
              502,
              503,
              504,
            ].contains(error.response?.statusCode);
            if (isHtml) {
              final opts = error.requestOptions;
              await Future.delayed(Duration(seconds: _retryDelays[0]));
              try {
                final retryResponse = await _replay(opts);
                if (retryResponse != null) {
                  return handler.resolve(retryResponse);
                }
              } catch (e) {
                return handler.next(
                  e is DioException
                      ? e
                      : DioException(requestOptions: opts, error: e),
                );
              }
              return handler.next(
                DioException(
                  requestOptions: opts,
                  response: error.response,
                  type: DioExceptionType.badResponse,
                  message: 'Service temporarily unavailable. Please try again.',
                ),
              );
            }
            if (isColdStart) {
              final opts = error.requestOptions;
              await Future.delayed(Duration(seconds: _retryDelays[0]));
              try {
                final retryResponse = await _replay(opts);
                if (retryResponse != null) {
                  return handler.resolve(retryResponse);
                }
              } catch (e) {
                return handler.next(
                  e is DioException
                      ? e
                      : DioException(requestOptions: opts, error: e),
                );
              }
              return handler.next(
                DioException(
                  requestOptions: opts,
                  response: error.response,
                  type: error.type,
                  error: error.error,
                  message:
                      'Server is starting up. Please wait a moment and try again.',
                ),
              );
            }

            // ── Session auto-recovery ────────────────────────────────────────
            // The backend issues opaque 2h access tokens in auth_tokens and
            // has no refresh-token endpoint. When a token expires mid-use the
            // only correct recovery is a silent Google re-sign-in, which
            // mints a fresh token. It must not run for the auth call itself
            // (no token involved) or for auth/config endpoints, and each
            // request retries at most once to avoid loops.
            final code = error.response?.statusCode;
            final path = error.requestOptions.uri.path;
            final isAuthEndpoint =
                path.endsWith('/auth/google') || path.contains('/config/');
            final alreadyRetried =
                (error.requestOptions.extra['_authRecovered'] as bool?) == true;
            if ((code == 401 || code == 403) &&
                !isAuthEndpoint &&
                !alreadyRetried) {
              final recovered = await _trySilentRecovery(error.requestOptions);
              if (recovered != null) {
                error.requestOptions.extra['_authRecovered'] = true;
                try {
                  final retry = await _recoveryDio.fetch(error.requestOptions);
                  return handler.resolve(retry);
                } catch (e) {
                  return handler.next(
                    e is DioException
                        ? e
                        : DioException(
                            requestOptions: error.requestOptions,
                            error: e,
                          ),
                  );
                }
              }
              // Silent recovery failed (user cancelled, no network, etc.).
              // Drop the dead token so the next bootstrap lands on the login
              // screen instead of looping through rejected requests.
              await SecureStorage.clearAll();
            }
          }
          if (error.type == DioExceptionType.connectionError ||
              error.type == DioExceptionType.connectionTimeout) {
            final opts = error.requestOptions;
            // The adopted origin is unreachable (live host down, or the local
            // dev server was started after boot / moved to another port).
            // Re-discover once, so the app heals itself into whichever origin
            // actually serves the API instead of failing every screen.
            final alreadyRecovered =
                (opts.extra['_endpointRecovered'] as bool?) == true;
            if (!alreadyRecovered) {
              final moved = await EndpointResolver.recover();
              if (moved) {
                opts.extra['_endpointRecovered'] = true;
                try {
                  final retry = await _recoveryDio.fetch(opts);
                  return handler.resolve(retry);
                } catch (_) {
                  // Fall through to the friendly transport error below.
                }
              }
            }
            return handler.next(
              DioException(
                requestOptions: error.requestOptions,
                type: error.type,
                message:
                    'No internet connection or timeout trying to reach: ${error.requestOptions.uri}. Check your network and API URL.',
              ),
            );
          }
          return handler.next(error);
        },
      ),
    );
  }

  static String _bodyAsString(dynamic data) {
    if (data == null) return '';
    if (data is String) return data;
    try {
      return data.toString();
    } catch (_) {
      return '';
    }
  }

  /// Replays [opts] on a fresh Dio instance (no interceptors — avoids
  /// recursive retry loops and reuses no poisoned HttpClient connection that
  /// previously received an HTML/WAF response) until the host answers with
  /// real API data instead of an HTML page.
  ///
  /// Returns the first non-HTML response, or null when every attempt still
  /// returned HTML — callers must reject in that case so an HTML body never
  /// reaches a JSON parser (it surfaces as a raw FormatException otherwise).
  Future<Response<dynamic>?> _replay(RequestOptions opts) async {
    for (var attempt = 0; attempt < _retryDelays.length + 1; attempt++) {
      if (attempt > 0) {
        await Future.delayed(Duration(seconds: _retryDelays[attempt - 1]));
      }
      final freshDio = Dio(dio.options);
      final Response<dynamic> res;
      try {
        res = await freshDio.fetch(opts);
      } on DioException catch (error) {
        final failedResponse = error.response;
        if (failedResponse == null) {
          // Transport-level failure on a retry — surface it to the caller.
          rethrow;
        }
        final failedContentType =
            (failedResponse.headers.value('content-type') ?? '').toLowerCase();
        final failedBody = _bodyAsString(failedResponse.data);
        if (!failedContentType.contains('text/html') &&
            !_looksLikeHtml(failedBody)) {
          rethrow;
        }
        if (HostChallenge.isChallenge(failedBody)) {
          final cookie = HostChallenge.solve(failedBody);
          if (cookie != null) {
            setBypassCookie(cookie);
            opts.headers['Cookie'] = cookie;
          }
        }
        continue;
      }
      final contentType = (res.headers.value('content-type') ?? '')
          .toLowerCase();
      final body = _bodyAsString(res.data);
      if (!contentType.contains('text/html') && !_looksLikeHtml(body)) {
        return res;
      }
      // Host still serving an HTML page — attach a fresh challenge cookie
      // (if any) and try again on the next loop iteration.
      if (HostChallenge.isChallenge(body)) {
        final cookie = HostChallenge.solve(body);
        if (cookie != null) {
          setBypassCookie(cookie);
          opts.headers['Cookie'] = cookie;
        }
      }
    }
    return null;
  }

  static bool _looksLikeHtml(String body) {
    final head = body.trimLeft().toLowerCase();
    return head.startsWith('<!doctype html') || head.startsWith('<html');
  }

  /// Fresh Dio instance for recovery retries. No interceptors: a retry must
  /// never recurse back into the recovery logic.
  Dio get _recoveryDio => Dio(dio.options);

  /// Attempts a silent Google re-authentication and returns true if a fresh
  /// backend token was stored. Kept as a late-bound hook to avoid a static
  /// import cycle: GoogleAuthService registers itself at startup via
  /// [registerSilentRecovery].
  static Future<bool?> Function()? _silentRecoveryHook;

  static void registerSilentRecovery(Future<bool> Function() hook) {
    _silentRecoveryHook = hook;
  }

  static Future<bool?> _trySilentRecovery(RequestOptions options) async {
    final hook = _silentRecoveryHook;
    if (hook == null) return null;
    try {
      return await hook();
    } catch (_) {
      return null;
    }
  }

  String? _bypassCookie;

  /// Cookie obtained from the hosting anti-bot challenge. Attached to every
  /// request until the host issues a new one (solved inline by the interceptor).
  void setBypassCookie(String cookie) {
    _bypassCookie = cookie;
    dio.options.headers['Cookie'] = cookie;
  }

  /// Switch the API origin at runtime (used by [EndpointResolver] after it
  /// determines whether the live host or a local server serves the API).
  ///
  /// Mutates the existing [dio] rather than replacing it: every service holds
  /// a reference to `ApiClient().dio`.
  void setBaseUrl(String url) {
    final parsed = Uri.tryParse(url);
    if (parsed == null ||
        !parsed.hasScheme ||
        (parsed.scheme != 'http' && parsed.scheme != 'https') ||
        parsed.host.isEmpty) {
      return;
    }
    final normalized = url.replaceFirst(RegExp(r'/$'), '');
    if (dio.options.baseUrl == normalized) return;
    dio.options.baseUrl = normalized;
    baseOrigin = '${parsed.scheme}://${parsed.authority}';
  }

  void syncOrigin(String? appUrl) {
    if (appUrl == null || appUrl.isEmpty) return;
    final uri = Uri.tryParse(appUrl);
    if (uri == null || !uri.hasScheme || uri.host.isEmpty) return;
    baseOrigin = '${uri.scheme}://${uri.authority}';
  }

  String absoluteUrl(String? path) {
    if (path == null || path.isEmpty) return '';
    if (path.startsWith('http')) return path;
    final origin = baseOrigin ?? '';
    return '$origin/${path.replaceFirst(RegExp(r'^/'), '')}';
  }
}

/// Convenience mapping of any error into the local [ApiException] type.
///
/// Dio surfaces API failures as [DioException] with a `response`, while the
/// backend itself signals business failures inside a 200 envelope
/// (`{"success": false, ...}`). Services call this after unwrapping the
/// envelope; it converts transport-level failures into the same type so UI
/// code handles one exception class.
ApiException apiErrorFromDio(Object error, String fallback) {
  if (error is ApiException) return error;
  if (error is DioException) {
    final data = error.response?.data;
    if (data is Map) {
      final message = data['message']?.toString();
      if (message != null && message.isNotEmpty) {
        return ApiException(message, statusCode: error.response?.statusCode);
      }
    }
    return ApiException(
      error.message ?? fallback,
      statusCode: error.response?.statusCode,
    );
  }
  return ApiException(error.toString());
}
