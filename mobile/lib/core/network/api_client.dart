import 'package:dio/dio.dart';
import '../config/app_config.dart';
import '../storage/secure_storage.dart';

class ApiClient {
  static final ApiClient _instance = ApiClient._internal();
  late Dio dio;
  String? baseOrigin;

  factory ApiClient() => _instance;

  // Retry delays for Render cold-start (spin-up can take up to 60s)
  static const _retryDelays = [5, 10, 15, 20, 20];

  ApiClient._internal() {
    dio = Dio(BaseOptions(
      baseUrl: AppConfig.apiBaseUrl,
      connectTimeout: const Duration(seconds: 60),
      receiveTimeout: const Duration(seconds: 70),
      followRedirects: true,
      maxRedirects: 5,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    ));

    baseOrigin = AppConfig.apiBaseUrl.replaceAll(RegExp(r'/api/?$'), '');

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
              final retryResponse = await dio.fetch(opts);
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
                final retryResponse = await dio.fetch(error.requestOptions);
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
