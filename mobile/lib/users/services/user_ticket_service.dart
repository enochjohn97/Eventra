import 'package:dio/dio.dart';
import '../../core/network/api_client.dart';
import '../models/ticket_model.dart';

class UserTicketService {
  static final Dio _dio = ApiClient().dio;
  static String? get _origin => ApiClient().baseOrigin;

  static Future<List<TicketModel>> getTickets() async {
    final response = await _dio.get('/tickets');
    final data = response.data as Map<String, dynamic>;
    if (data['success'] != true) {
      throw Exception(data['message']?.toString() ?? 'Failed to load tickets');
    }
    return (data['tickets'] as List? ?? [])
        .map((t) => TicketModel.fromJson(Map<String, dynamic>.from(t as Map), baseOrigin: _origin))
        .toList();
  }

  static Future<void> sendTicketEmail({String? reference, String? barcode, int? ticketId}) async {
    final response = await _dio.post('/tickets/send', data: {
      'reference': ?reference,
      'barcode': ?barcode,
      'ticket_id': ?ticketId,
    });
    final data = response.data as Map<String, dynamic>;
    if (data['success'] != true) {
      throw Exception(data['message']?.toString() ?? 'Failed to send ticket email');
    }
  }
}
