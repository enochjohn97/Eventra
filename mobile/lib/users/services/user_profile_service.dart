import 'package:dio/dio.dart';
import '../../core/network/api_client.dart';
import '../models/user_model.dart';

class UserProfileService {
  static final Dio _dio = ApiClient().dio;

  static Future<UserModel> getProfile() async {
    final response = await _dio.get('/profile');
    final data = response.data as Map<String, dynamic>;
    if (data['success'] != true || data['user'] == null) {
      throw Exception(data['message']?.toString() ?? 'Failed to load profile');
    }
    return UserModel.fromJson(Map<String, dynamic>.from(data['user'] as Map));
  }

  static Future<UserModel> updateProfile({
    required String name,
    required String email,
    required String phone,
    String? address,
    String? city,
    String? state,
    String? country,
  }) async {
    final response = await _dio.put('/profile', data: {
      'name': name,
      'email': email,
      'phone': phone,
      if (address != null) 'address': address,
      if (city != null) 'city': city,
      if (state != null) 'state': state,
      if (country != null) 'country': country,
    });
    final data = response.data as Map<String, dynamic>;
    if (data['success'] != true) {
      throw Exception(data['message']?.toString() ?? 'Failed to update profile');
    }
    if (data['user'] != null) {
      return UserModel.fromJson(Map<String, dynamic>.from(data['user'] as Map));
    }
    return UserModel(name: name, email: email, phone: phone, id: 0);
  }
}
