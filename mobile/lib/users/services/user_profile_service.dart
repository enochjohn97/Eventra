import 'dart:convert';
import 'package:dio/dio.dart';
import '../../core/network/api_client.dart';
import '../models/user_model.dart';

Map<String, dynamic> _toMap(dynamic raw) {
  if (raw is Map<String, dynamic>) return raw;
  if (raw is Map) return Map<String, dynamic>.from(raw);
  if (raw is String) return jsonDecode(raw) as Map<String, dynamic>;
  throw Exception('Unexpected response format: ${raw.runtimeType}');
}

class UserProfileService {
  static final Dio _dio = ApiClient().dio;

  static Future<UserModel> getProfile() async {
    final response = await _dio.get('/profile');
    final data = _toMap(response.data);
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
      'address': ?address,
      'city': ?city,
      'state': ?state,
      'country': ?country,
    });
    final data = _toMap(response.data);
    if (data['success'] != true) {
      throw Exception(data['message']?.toString() ?? 'Failed to update profile');
    }
    if (data['user'] != null) {
      return UserModel.fromJson(Map<String, dynamic>.from(data['user'] as Map));
    }
    return UserModel(name: name, email: email, phone: phone, id: 0);
  }
}
