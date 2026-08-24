import 'package:dio/dio.dart';
import '../config/app_config.dart';
import '../storage/secure_storage.dart';

class ApiClient {
  static final ApiClient _instance = ApiClient._internal();
  late Dio dio;
  String? baseOrigin;

  factory ApiClient() => _instance;

  ApiClient._internal() {
    dio = Dio(BaseOptions(
      baseUrl: AppConfig.apiBaseUrl,
      connectTimeout: const Duration(seconds: 20),
      receiveTimeout: const Duration(seconds: 30),
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-Eventra-Portal': 'user',
        'User-Agent':
            'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36 Eventra/1.0',
      },
    ));

    baseOrigin = AppConfig.apiBaseUrl.replaceAll(RegExp(r'/api/?$'), '');

    dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) async {
        final token = await SecureStorage.getToken();
        if (token != null && token.isNotEmpty) {
          options.headers['Authorization'] = 'Bearer $token';
        }
        return handler.next(options);
      },
      onResponse: (response, handler) {
        final contentType = (response.headers.value('content-type') ?? '').toLowerCase();
        if (contentType.contains('text/html')) {
          return handler.reject(DioException(
            requestOptions: response.requestOptions,
            response: response,
            type: DioExceptionType.badResponse,
            message: 'Server returned an HTML page instead of JSON. The API host may be blocking this request (bot-protection).',
          ));
        }
        return handler.next(response);
      },
      onError: (error, handler) {
        if (error.response != null) {
          final contentType = (error.response?.headers.value('content-type') ?? '').toLowerCase();
          if (contentType.contains('text/html')) {
            return handler.next(DioException(
              requestOptions: error.requestOptions,
              response: error.response,
              type: error.type,
              error: error.error,
              message: 'Server returned an HTML page instead of JSON. The API host may be blocking this request (bot-protection).',
            ));
          }
        }
        if (error.type == DioExceptionType.connectionError ||
            error.type == DioExceptionType.connectionTimeout) {
          return handler.next(DioException(
            requestOptions: error.requestOptions,
            type: error.type,
            message: 'No internet connection. Check your network and API URL.',
          ));
        }
        return handler.next(error);
      },
    ));
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
