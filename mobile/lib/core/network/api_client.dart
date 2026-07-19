import 'package:dio/dio.dart';
import '../storage/secure_storage.dart';

class ApiClient {
  static final ApiClient _instance = ApiClient._internal();
  late Dio dio;

  // Change this to your local dev IP if needed (e.g. 10.0.2.2 for Android emulator)
  static const String baseUrl = 'https://your-domain/api'; 

  factory ApiClient() {
    return _instance;
  }

  ApiClient._internal() {
    dio = Dio(BaseOptions(
      baseUrl: baseUrl,
      connectTimeout: const Duration(seconds: 10),
      receiveTimeout: const Duration(seconds: 10),
    ));

    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          // Add auth token to headers
          final token = await SecureStorage.getToken();
          if (token != null) {
            options.headers['Authorization'] = 'Bearer $token';
          }
          return handler.next(options);
        },
        onError: (DioException e, handler) async {
          if (e.response?.statusCode == 401) {
            // Implement silent token refresh here if needed
            // final success = await _refreshToken();
            // if (success) {
            //   final opts = e.requestOptions;
            //   opts.headers['Authorization'] = 'Bearer ${await SecureStorage.getToken()}';
            //   final cloneReq = await dio.fetch(opts);
            //   return handler.resolve(cloneReq);
            // }
          }
          return handler.next(e);
        },
      ),
    );
  }
}
