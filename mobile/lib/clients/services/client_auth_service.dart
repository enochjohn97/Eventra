import 'package:dio/dio.dart';
import '../../core/network/api_client.dart';
import '../../core/storage/secure_storage.dart';

class ClientAuthService {
  static final Dio _dio = ApiClient().dio;

  static Future<bool> login(String email, String password, {String? otp}) async {
    try {
      final Map<String, dynamic> requestData = {
        'email': email,
        'password': password,
        'intent': 'client',
      };
      if (otp != null) {
        requestData['otp'] = otp;
      }
      final response = await _dio.post('/auth/login.php', data: requestData);

      if (response.statusCode == 200 && response.data['token'] != null) {
        await SecureStorage.saveToken(response.data['token']);
        if (response.data['refresh_token'] != null) {
          await SecureStorage.saveRefreshToken(response.data['refresh_token']);
        }
        return true;
      }
      return false;
    } catch (e) {
      return false;
    }
  }

  static Future<bool> register(String name, String email, String password) async {
    try {
      final response = await _dio.post('/auth/register.php', data: {
        'name': name,
        'email': email,
        'password': password,
        'role': 'client',
      });
      return response.statusCode == 200 || response.statusCode == 201;
    } catch (e) {
      return false;
    }
  }

  static Future<void> logout() async {
    await SecureStorage.clearAll();
  }
}
