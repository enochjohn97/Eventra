import 'dart:convert';
import 'package:dio/dio.dart';
import '../../core/network/api_client.dart';
import '../../core/storage/secure_storage.dart';
import '../../core/utils/app_crypto.dart';
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
    try {
      final response = await _dio.get('/tickets');
      final data = _toMap(response.data);
      if (data['success'] != true) {
        throw Exception(
          data['message']?.toString() ?? 'Failed to load tickets',
        );
      }
      final records = (data['tickets'] as List? ?? [])
          .map((ticket) {
            final map = Map<String, dynamic>.from(ticket as Map);
            // Decrypt sensitive ticket fields so the secure-store mirror
            // and the in-memory models only ever hold plaintext inside
            // protected memory.
            if (ApiClient.isCryptoReady) {
              _decryptSensitiveTicketFields(map);
            }
            return map;
          })
          .toList();
      await SecureStorage.savePrivateList('tickets', records);
      return records
          .map((ticket) => TicketModel.fromJson(ticket, baseOrigin: _origin))
          .toList();
    } on DioException catch (error) {
      if (!_isOffline(error)) {
        throw Exception(error.message ?? 'Failed to load tickets');
      }
      final cached = await SecureStorage.getPrivateList('tickets');
      if (cached == null) {
        throw Exception(error.message ?? 'Failed to load tickets');
      }
      // The cached mirror was written from already-decrypted records, so it
      // is safe to read as-is. If the server ever starts returning encrypted
      // tickets for offline consumers, decrypt them here too.
      final decryptedCached =
          cached.map((ticket) {
            final map = Map<String, dynamic>.from(ticket);
            if (ApiClient.isCryptoReady) {
              _decryptSensitiveTicketFields(map);
            }
            return map;
          });
      return decryptedCached
          .map((ticket) => TicketModel.fromJson(ticket, baseOrigin: _origin))
          .toList();
    }
  }

  static void _decryptSensitiveTicketFields(Map<String, dynamic> ticket) {
    for (final field in sensitiveFieldNames) {
      if (ticket.containsKey(field)) {
        final value = ticket[field];
        if (value is String && value.isNotEmpty) {
          final plain = ApiClient.crypto?.decryptString(value);
          if (plain != null) ticket[field] = plain;
        }
      }
    }
  }

  static bool _isOffline(DioException error) =>
      error.type == DioExceptionType.connectionError ||
      error.type == DioExceptionType.connectionTimeout ||
      error.type == DioExceptionType.receiveTimeout ||
      error.type == DioExceptionType.sendTimeout;

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
    late final Response<dynamic> response;
    try {
      response = await _dio.get(
        '/tickets/qr-image.php',
        queryParameters: {'ticket_id': ticketId},
      );
    } on DioException catch (error) {
      throw apiErrorFromDio(error, 'QR code unavailable.');
    }
    final data = _toMap(response.data);
    if (data['success'] != true) {
      throw Exception(data['message']?.toString() ?? 'QR code unavailable.');
    }
    return (
      dataUri: data['data_uri']?.toString() ?? '',
      scansUsed: int.tryParse(data['scans_used']?.toString() ?? '') ?? 0,
      scanLimit: int.tryParse(data['scan_limit']?.toString() ?? '') ?? 5,
      scansRemaining:
          int.tryParse(data['scans_remaining']?.toString() ?? '') ?? 0,
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
