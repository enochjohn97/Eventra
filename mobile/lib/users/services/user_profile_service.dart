import 'dart:convert';

import 'package:dio/dio.dart';

import '../../core/network/api_client.dart';
import '../../core/network/api_exception.dart';
import '../../core/utils/app_crypto.dart';
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
        'EventOut server returned an invalid response. Please try again.',
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
    final userMap = Map<String, dynamic>.from(data['user'] as Map);
    // Decrypt any sensitive fields the server returned, so the in-memory
    // model and the secure store hold real values only inside protected memory.
    if (ApiClient.isCryptoReady) {
      _decryptSensitiveUserFields(userMap);
    }
    return UserModel.fromJson(userMap);
  }

  static void _decryptSensitiveUserFields(Map<String, dynamic> user) {
    for (final field in sensitiveFieldNames) {
      if (user.containsKey(field)) {
        final value = user[field];
        if (value is String && value.isNotEmpty && field != 'id') {
          final plain = ApiClient.crypto?.decryptString(value);
          if (plain != null) user[field] = plain;
        }
      }
    }
  }

  static Future<UserModel> updateProfile({
    required String name,
    required String email,
    required String phone,
    required String address,
    required String city,
    required String state,
    required String country,
    required String dob,
    required String gender,
  }) async {
    late Response<dynamic> response;
    try {
      response = await _dio.put(
        '/profile',
        data: {
          'name': name,
          'email': email,
          'phone': phone,
          'address': address,
          'city': city,
          'state': state,
          'country': country,
          'dob': dob,
          'gender': gender,
        },
        // Do not re-encrypt encrypted values from the in-memory model.
        // Sensitive fields in the request body are encrypted at the Dio
        // interceptor level for this call, so keep the body as normal strings.
        options: Options(receiveTimeout: const Duration(seconds: 20)),
      );
    } on DioException catch (error) {
      throw apiErrorFromDio(
        error,
        'Unable to sync your profile with EventOut.',
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
      final next = Map<String, dynamic>.from(data['user'] as Map);
      if (ApiClient.isCryptoReady) {
        _decryptSensitiveUserFields(next);
      }
      return UserModel.fromJson(next);
    }
    // Backend confirmed the update but omitted the user object (legacy web
    // handler shape); rebuild a minimal model from what we sent.
    return UserModel(
      name: name,
      email: email,
      phone: phone,
      address: address,
      city: city,
      state: state,
      country: country,
      dob: dob,
      gender: gender,
      id: 0,
    );
  }
}
