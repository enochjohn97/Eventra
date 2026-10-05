import 'dart:io';

import 'package:dio/dio.dart';
import 'package:dio/io.dart';

import '../storage/secure_storage.dart';
import 'api_exception.dart';

class ApiClient {
  static final ApiClient _instance = ApiClient._internal();
  late Dio dio;
  String? baseOrigin;

  factory ApiClient() => _instance;

  // Retry delays for transient server errors (e.g. brief HTML responses from anti-bot layer)
  static const _retryDelays = [3, 5];

  ApiClient._internal() {
    const apiBaseUrl = String.fromEnvironment(
      'API_BASE_URL',
      defaultValue: 'https://eventra-website.liveblog365.com/api',
    );
    final parsedBaseUrl = Uri.tryParse(apiBaseUrl);
    if (parsedBaseUrl == null ||
        !parsedBaseUrl.hasScheme ||
        (parsedBaseUrl.scheme != 'http' && parsedBaseUrl.scheme != 'https') ||
        parsedBaseUrl.host.isEmpty) {
      throw StateError('API_BASE_URL must be a valid HTTP or HTTPS URL.');
    }
    baseOrigin = '${parsedBaseUrl.scheme}://${parsedBaseUrl.authority}';

    dio = Dio(
      BaseOptions(
        baseUrl: apiBaseUrl.replaceFirst(RegExp(r'/$'), ''),
        // Long enough for the shared host's cold start; individual requests
        // override this downward where appropriate (see user_profile_service).
        connectTimeout: const Duration(seconds: 120),
        receiveTimeout: const Duration(seconds: 120),
        followRedirects: true,
        maxRedirects: 5,
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Connection': 'close',
          'User-Agent': 'Dart/3.12.2 (EvenOut Mobile)',
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
          final contentType =
              (response.headers.value('content-type') ?? '').toLowerCase();
          final isColdStart = [502, 503, 504].contains(response.statusCode) ||
              contentType.contains('text/html');
          // HTML 200 = hosting WAF/security challenge — retry with backoff
          // (same logic as 5xx cold-start below; do NOT reject immediately).
          if (isColdStart) {
            // Render cold-start: retry with backoff
            final retryCount =
                (response.requestOptions.extra['_retryCount'] as int? ?? 0);
            if (retryCount < _retryDelays.length) {
              await Future.delayed(Duration(seconds: _retryDelays[retryCount]));
              final opts = response.requestOptions;
              opts.extra['_retryCount'] = retryCount + 1;
              try {
                // Use a fresh Dio instance to avoid reusing the poisoned HttpClient
                // connection that received the HTML/WAF response.
                // Intentionally NOT copying interceptors — prevents recursive retry loops.
                final freshDio = Dio(dio.options);
                final retryResponse = await freshDio.fetch(opts);
                return handler.resolve(retryResponse);
              } catch (e) {
                return handler.reject(
                  e is DioException
                      ? e
                      : DioException(requestOptions: opts, error: e),
                );
              }
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
            final isColdStart = [
              502,
              503,
              504,
            ].contains(error.response?.statusCode);
            if (contentType.contains('text/html')) {
              // HTML error body = WAF/security challenge — treat as cold-start
              // and fall through to the retry logic below rather than failing.
              final retryCount =
                  (error.requestOptions.extra['_retryCount'] as int? ?? 0);
              if (retryCount < _retryDelays.length) {
                await Future.delayed(
                  Duration(seconds: _retryDelays[retryCount]),
                );
                error.requestOptions.extra['_retryCount'] = retryCount + 1;
                try {
                  final freshDio = Dio(dio.options);
                  final retryResponse = await freshDio.fetch(error.requestOptions);
                  return handler.resolve(retryResponse);
                } catch (e) {
                  return handler.next(
                    e is DioException
                        ? e
                        : DioException(requestOptions: error.requestOptions, error: e),
                  );
                }
              }
              return handler.next(
                DioException(
                  requestOptions: error.requestOptions,
                  response: error.response,
                  type: DioExceptionType.badResponse,
                  message: 'Service temporarily unavailable. Please try again.',
                ),
              );
            }
            if (isColdStart) {
              final retryCount =
                  (error.requestOptions.extra['_retryCount'] as int? ?? 0);
              if (retryCount < _retryDelays.length) {
                await Future.delayed(
                  Duration(seconds: _retryDelays[retryCount]),
                );
                error.requestOptions.extra['_retryCount'] = retryCount + 1;
                try {
                  final freshDio = Dio(dio.options);
                  final retryResponse = await freshDio.fetch(
                    error.requestOptions,
                  );
                  return handler.resolve(retryResponse);
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
              return handler.next(
                DioException(
                  requestOptions: error.requestOptions,
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

  /// Fresh Dio instance for recovery retries. No interceptors: a retry must
  /// never recurse back into the recovery logic.
  late final Dio _recoveryDio = Dio(dio.options);

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

  void setBypassCookie(String cookie) {
    dio.options.headers['Cookie'] = cookie;
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
        return ApiException(
          message,
          statusCode: error.response?.statusCode,
        );
      }
    }
    return ApiException(
      error.message ?? fallback,
      statusCode: error.response?.statusCode,
    );
  }
  return ApiException(error.toString());
}
