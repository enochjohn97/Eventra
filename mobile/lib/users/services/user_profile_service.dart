import 'dart:convert';

import 'package:dio/dio.dart';

import '../../core/network/api_client.dart';
import '../../core/network/api_exception.dart';
import '../models/user_model.dart';

Map<String, dynamic> _toMap(dynamic raw) {
  if (raw is Map<String, dynamic>) return raw;
  if (raw is Map) return Map<String, dynamic>.from(raw);
  if (raw is String) {
    try {
      final decoded = jsonDecode(raw);
      if (decoded is Map) return Map<String, dynamic>.from(decoded);
    } on FormatException {
      throw const ApiException(
        'Eventra server returned an invalid response. Please try again.',
      );
    }
  }
  throw const ApiException('Unexpected response format');
}

class UserProfileService {
  static final Dio _dio = ApiClient().dio;

  static Future<UserModel> getProfile() async {
    final response = await _dio.get('/profile');
    final data = _toMap(response.data);
    if (data['success'] != true || data['user'] is! Map) {
      throw ApiException(
        data['message']?.toString() ?? 'Failed to load profile',
        statusCode: response.statusCode,
      );
    }
    return UserModel.fromJson(
      Map<String, dynamic>.from(data['user'] as Map),
    );
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
    late Response<dynamic> response;
    try {
      response = await _dio.put(
        '/profile',
        data: {
          'name': name,
          'email': email,
          'phone': phone,
          'address': ?address,
          'city': ?city,
          'state': ?state,
          'country': ?country,
        },
        options: Options(receiveTimeout: const Duration(seconds: 20)),
      );
    } on DioException catch (error) {
      throw apiErrorFromDio(
        error,
        'Unable to sync your profile with Eventra.',
      );
    }
    final data = _toMap(response.data);
    if (data['success'] != true) {
      throw ApiException(
        data['message']?.toString() ?? 'Failed to update profile',
        statusCode: response.statusCode,
      );
    }
    if (data['user'] is Map) {
      return UserModel.fromJson(
        Map<String, dynamic>.from(data['user'] as Map),
      );
    }
    // Backend confirmed the update but omitted the user object (legacy web
    // handler shape); rebuild a minimal model from what we sent.
    return UserModel(name: name, email: email, phone: phone, id: 0);
  }
}
