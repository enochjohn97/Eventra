import 'package:dio/dio.dart';
import '../../core/network/api_client.dart';

class ClientDashboardService {
  static final Dio _dio = ApiClient().dio;

  static Future<Map<String, dynamic>?> getDashboardStats() async {
    try {
      final response = await _dio.get('/stats/get-client-dashboard-stats.php');
      if (response.statusCode == 200) {
        return response.data;
      }
      return null;
    } catch (e) {
      return null;
    }
  }
}
