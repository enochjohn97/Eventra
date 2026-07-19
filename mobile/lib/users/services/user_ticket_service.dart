import 'package:dio/dio.dart';
import '../../core/network/api_client.dart';

class UserTicketService {
  static final Dio _dio = ApiClient().dio;

  static Future<bool> purchaseTicket(Map<String, dynamic> data) async {
    try {
      final response = await _dio.post('/tickets/purchase-ticket.php', data: data);
      return response.statusCode == 200 || response.statusCode == 201;
    } catch (e) {
      return false;
    }
  }

  static Future<List<dynamic>?> getTickets() async {
    try {
      final response = await _dio.get('/tickets/get-tickets.php');
      if (response.statusCode == 200 && response.data is List) {
        return response.data;
      }
      return null;
    } catch (e) {
      return null;
    }
  }
}
