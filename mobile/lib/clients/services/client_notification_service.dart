import 'package:dio/dio.dart';
import '../../core/network/api_client.dart';

class ClientNotificationService {
  static final Dio _dio = ApiClient().dio;

  static Future<List<dynamic>?> getRealtimeNotifications() async {
    try {
      final response = await _dio.get('/notifications/realtime.php');
      if (response.statusCode == 200 && response.data is List) {
        return response.data;
      }
      return null;
    } catch (e) {
      return null;
    }
  }
}
