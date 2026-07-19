import 'package:dio/dio.dart';
import '../../core/network/api_client.dart';

class UserProfileService {
  static final Dio _dio = ApiClient().dio;

  static Future<Map<String, dynamic>?> getProfile() async {
    try {
      final response = await _dio.get('/users/get-profile.php');
      if (response.statusCode == 200) {
        return response.data;
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  static Future<bool> updateProfile(Map<String, dynamic> data) async {
    try {
      final response = await _dio.post('/users/update-profile.php', data: data);
      return response.statusCode == 200;
    } catch (e) {
      return false;
    }
  }
}
