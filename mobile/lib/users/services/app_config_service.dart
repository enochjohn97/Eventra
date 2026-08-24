import 'dart:convert';
import 'package:dio/dio.dart';
import '../../core/network/api_client.dart';

class AppConfigService {
  static final Dio _dio = ApiClient().dio;

  static Future<({String googleClientId, String mapsApiKey, String paystackPublicKey, String appUrl})> load() async {
    final response = await _dio.get('/config/app');
    final raw = response.data;
    final data = raw is Map<String, dynamic>
        ? raw
        : raw is String
            ? (jsonDecode(raw) as Map<String, dynamic>)
            : throw Exception('Unexpected config response format');
    if (data['success'] != true) {
      throw Exception(data['message']?.toString() ?? 'Failed to load app configuration');
    }
    return (
      googleClientId: data['client_id']?.toString() ?? '',
      mapsApiKey: data['maps_api_key']?.toString() ?? '',
      paystackPublicKey: data['paystack_public_key']?.toString() ?? '',
      appUrl: data['app_url']?.toString() ?? ApiClient().baseOrigin ?? '',
    );
  }
}
