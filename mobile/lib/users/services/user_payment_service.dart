import 'dart:convert';

import 'package:dio/dio.dart';

import '../../core/network/api_client.dart';

Map<String, dynamic> _toMap(dynamic raw) {
  if (raw is Map<String, dynamic>) return raw;
  if (raw is Map) return Map<String, dynamic>.from(raw);
  if (raw is String) {
    try {
      return jsonDecode(raw) as Map<String, dynamic>;
    } on FormatException {
      throw Exception(
        'EventOut server returned an invalid response. Please try again.',
      );
    }
  }
  throw Exception('Unexpected response format: ${raw.runtimeType}');
}

class UserPaymentService {
  static final Dio _dio = ApiClient().dio;

  static Future<Map<String, dynamic>> initializePayment({
    required int eventId,
    required int quantity,
    required String ticketType,
    required Map<String, String> contactInfo,
  }) async {
    late final Response<dynamic> response;
    try {
      response = await _dio.post(
        '/payments/initialize',
        data: {
          'event_id': eventId,
          'quantity': quantity,
          'ticket_type': ticketType,
          'contact_info': {
            'fname': contactInfo['fname'],
            'lname': contactInfo['lname'],
            'email': contactInfo['email'],
            'phone': contactInfo['phone'],
          },
        },
      );
    } on DioException catch (error) {
      throw apiErrorFromDio(error, 'Payment initialization failed.');
    }
    final data = _toMap(response.data);
    if (data['success'] != true) {
      throw Exception(
        data['message']?.toString() ?? 'Payment initialization failed',
      );
    }
    return data;
  }

  /// Verifies a payment. Returns the raw envelope so callers can inspect
  /// `status`:
  ///  * `success`    — order fulfilled, tickets issued (idempotent)
  ///  * `processing` — webhook mid-flight; poll again
  ///  * other        — not successful (message describes why)
  ///
  /// NOTE: this method no longer throws on `success: false` — "Payment not
  /// successful" is a normal state the caller must branch on, not an
  /// exception.
  static Future<Map<String, dynamic>> verifyPayment(String reference) async {
    final response = await _dio.post(
      '/payments/verify',
      data: {'reference': reference},
    );
    return _toMap(response.data);
  }

  static Future<String> fetchPaystackPublicKey() async {
    final response = await _dio.get('/config/paystack');
    final data = _toMap(response.data);
    if (data['success'] != true ||
        (data['public_key']?.toString().isEmpty ?? true)) {
      throw Exception(data['message']?.toString() ?? 'Paystack not configured');
    }
    return data['public_key'].toString();
  }
}
