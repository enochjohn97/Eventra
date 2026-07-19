import 'package:dio/dio.dart';
import '../../core/network/api_client.dart';

class UserPaymentService {
  static final Dio _dio = ApiClient().dio;

  static Future<Map<String, dynamic>?> initializePayment(Map<String, dynamic> data) async {
    try {
      final response = await _dio.post('/payments/initialize.php', data: data);
      if (response.statusCode == 200) {
        return response.data;
      }
      return null;
    } catch (e) {
      return null;
    }
  }
}
