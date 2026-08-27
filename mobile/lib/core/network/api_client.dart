import 'dart:io';
import 'package:dio/dio.dart';
import 'package:dio/io.dart';
import '../storage/secure_storage.dart';

class ApiClient {
  static final ApiClient _instance = ApiClient._internal();
  late Dio dio;
  String? baseOrigin;

  factory ApiClient() => _instance;

  // Retry delays for transient server errors (e.g. brief HTML responses from anti-bot layer)
  static const _retryDelays = [3, 5];

  ApiClient._internal() {
    dio = Dio(BaseOptions(
      connectTimeout: const Duration(seconds: 60),
      receiveTimeout: const Duration(seconds: 70),
      followRedirects: true,
      maxRedirects: 5,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        // Mimic a real mobile browser — WAF on liveblog365.com fingerprints
        // Dart's default UA ("Dart/x.y (dart:io)") and serves an HTML challenge.
        'User-Agent':
            'Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 '
            '(KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
      },
    ));

    // Prevent stale-socket "unsolicited response" on shared/WAF hosts.
    // A short idle timeout ensures pooled connections are dropped before
    // the server closes them on its side (common on liveblog365.com / shared hosts).
    (dio.httpClientAdapter as IOHttpClientAdapter).createHttpClient = () {
      final client = HttpClient();
      client.idleTimeout = const Duration(seconds: 8);
      return client;
    };

    dio.interceptors.add(InterceptorsWrapper(
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
        final contentType = (response.headers.value('content-type') ?? '').toLowerCase();
        final isColdStart = contentType.contains('text/html') || [502, 503, 504].contains(response.statusCode);
        if (isColdStart) {
          // Render cold-start: retry with backoff
          final retryCount = (response.requestOptions.extra['_retryCount'] as int? ?? 0);
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
              return handler.reject(e is DioException ? e : DioException(requestOptions: opts, error: e));
            }
          }
          return handler.reject(DioException(
            requestOptions: response.requestOptions,
            response: response,
            type: DioExceptionType.badResponse,
            message: 'Server is starting up. Please wait a moment and try again.',
          ));
        }
        return handler.next(response);
      },
      onError: (error, handler) async {
        if (error.response != null) {
          final contentType = (error.response?.headers.value('content-type') ?? '').toLowerCase();
          final isColdStart = contentType.contains('text/html') || [502, 503, 504].contains(error.response?.statusCode);
          if (isColdStart) {
            final retryCount = (error.requestOptions.extra['_retryCount'] as int? ?? 0);
            if (retryCount < _retryDelays.length) {
              await Future.delayed(Duration(seconds: _retryDelays[retryCount]));
              error.requestOptions.extra['_retryCount'] = retryCount + 1;
              try {
                final freshDio = Dio(dio.options);
                final retryResponse = await freshDio.fetch(error.requestOptions);
                return handler.resolve(retryResponse);
              } catch (e) {
                return handler.next(e is DioException ? e : DioException(requestOptions: error.requestOptions, error: e));
              }
            }
            return handler.next(DioException(
              requestOptions: error.requestOptions,
              response: error.response,
              type: error.type,
              error: error.error,
              message: 'Server is starting up. Please wait a moment and try again.',
            ));
          }
        }
        if (error.type == DioExceptionType.connectionError ||
            error.type == DioExceptionType.connectionTimeout) {
          return handler.next(DioException(
            requestOptions: error.requestOptions,
            type: error.type,
            message: 'No internet connection or timeout trying to reach: ${error.requestOptions.uri}. Check your network and API URL.',
          ));
        }
        return handler.next(error);
      },
    ));
  }

  void setBypassCookie(String cookie) {
    dio.options.headers['Cookie'] = cookie;
  }

  void syncOrigin(String? appUrl) {
    if (appUrl == null || appUrl.isEmpty) return;
    baseOrigin = appUrl.replaceAll(RegExp(r'/$'), '');
  }

  String absoluteUrl(String? path) {
    if (path == null || path.isEmpty) return '';
    if (path.startsWith('http')) return path;
    final origin = baseOrigin ?? '';
    return '$origin/${path.replaceFirst(RegExp(r'^/'), '')}';
  }
}
