import 'package:dio/dio.dart';
import '../../core/network/api_client.dart';
import 'dart:io';

class ClientProfileService {
  static final Dio _dio = ApiClient().dio;

  static Future<bool> updateProfile(Map<String, dynamic> data) async {
    try {
      final response = await _dio.post('/clients/update-profile.php', data: data);
      return response.statusCode == 200;
    } catch (e) {
      return false;
    }
  }

  static Future<bool> updateBankDetails(Map<String, dynamic> data) async {
    try {
      final response = await _dio.post('/clients/bank-details.php', data: data);
      return response.statusCode == 200;
    } catch (e) {
      return false;
    }
  }

  static Future<bool> verifyIdentity(File documentFile) async {
    try {
      FormData formData = FormData.fromMap({
        'document': await MultipartFile.fromFile(documentFile.path),
      });
      final response = await _dio.post('/clients/verify-identity.php', data: formData);
      return response.statusCode == 200;
    } catch (e) {
      return false;
    }
  }
}
