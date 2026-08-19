import 'package:dio/dio.dart';
import '../../core/network/api_client.dart';

class UserPaymentService {
  static final Dio _dio = ApiClient().dio;

  static Future<Map<String, dynamic>> initializePayment({
    required int eventId,
    required int quantity,
    required String ticketType,
    required Map<String, String> contactInfo,
  }) async {
    final response = await _dio.post('/payments/initialize', data: {
      'event_id': eventId,
      'quantity': quantity,
      'ticket_type': ticketType,
      'contact_info': {
        'fname': contactInfo['fname'],
        'lname': contactInfo['lname'],
        'email': contactInfo['email'],
        'phone': contactInfo['phone'],
      },
    });
    final data = response.data as Map<String, dynamic>;
    if (data['success'] != true) {
      throw Exception(data['message']?.toString() ?? 'Payment initialization failed');
    }
    return data;
  }

  static Future<Map<String, dynamic>> verifyPayment(String reference) async {
    final response = await _dio.post('/payments/verify', data: {'reference': reference});
    final data = response.data as Map<String, dynamic>;
    if (data['success'] != true) {
      throw Exception(data['message']?.toString() ?? 'Payment verification failed');
    }
    return data;
  }

  static Future<String> fetchPaystackPublicKey() async {
    final response = await _dio.get('/config/paystack');
    final data = response.data as Map<String, dynamic>;
    if (data['success'] != true || (data['public_key']?.toString().isEmpty ?? true)) {
      throw Exception(data['message']?.toString() ?? 'Paystack not configured');
    }
    return data['public_key'].toString();
  }
}
