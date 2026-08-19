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
      onError: (error, handler) {
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
