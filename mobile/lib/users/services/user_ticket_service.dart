import 'dart:convert';
import 'package:dio/dio.dart';
import '../../core/network/api_client.dart';
import '../models/ticket_model.dart';

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

class UserTicketService {
  static final Dio _dio = ApiClient().dio;
  static String? get _origin => ApiClient().baseOrigin;

  static Future<List<TicketModel>> getTickets() async {
    final response = await _dio.get('/tickets');
    final data = _toMap(response.data);
    if (data['success'] != true) {
      throw Exception(data['message']?.toString() ?? 'Failed to load tickets');
    }
    return (data['tickets'] as List? ?? [])
        .map(
          (t) => TicketModel.fromJson(
            Map<String, dynamic>.from(t as Map),
            baseOrigin: _origin,
          ),
        )
        .toList();
  }

  /// Proof-of-validity check — the mobile equivalent of the web app's
  /// "Check Ticket" modal (unlimited checks by ticket ID / barcode).
  /// Returns the proof payload (event name, image, tier, price, statuses...).
  static Future<Map<String, dynamic>> checkTicket(String ticketId) async {
    final response = await _dio.post(
      '/tickets/check',
      data: {'mode': 'id', 'ticket_id': ticketId},
    );
    final data = _toMap(response.data);
    if (data['success'] != true) {
      throw Exception(
        data['message']?.toString() ?? 'Ticket could not be verified.',
      );
    }
    return Map<String, dynamic>.from(data['data'] as Map);
  }

  /// Live QR image for a ticket ID (server-rendered PNG data URI) plus its
  /// remaining scan allowance.
  static Future<
    ({String dataUri, int scansUsed, int scanLimit, int scansRemaining})
  >
  fetchTicketQr(String ticketId) async {
    final response = await _dio.get(
      '/tickets/qr-image.php',
      queryParameters: {'ticket_id': ticketId},
    );
    final data = _toMap(response.data);
    if (data['success'] != true) {
      throw Exception(data['message']?.toString() ?? 'QR code unavailable.');
    }
    return (
      dataUri: data['data_uri']?.toString() ?? '',
      scansUsed: int.tryParse(data['scans_used']?.toString() ?? '') ?? 0,
      scanLimit: int.tryParse(data['scan_limit']?.toString() ?? '') ?? 5,
      scansRemaining: int.tryParse(data['scans_remaining']?.toString() ?? '') ?? 0,
    );
  }

  static Future<void> sendTicketEmail({
    String? reference,
    String? barcode,
    int? ticketId,
  }) async {
    final response = await _dio.post(
      '/tickets/send',
      data: {
        'reference': ?reference,
        'barcode': ?barcode,
        'ticket_id': ?ticketId,
      },
    );
    final data = response.data as Map<String, dynamic>;
    if (data['success'] != true) {
      throw Exception(
        data['message']?.toString() ?? 'Failed to send ticket email',
      );
    }
  }
}
