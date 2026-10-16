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

  /// Result of a successful payment initialization.
  ///
  /// `organizerPaystackMode` is 'live' when the organizer's Paystack account is
  /// using a live key, and 'test' when it is still using a test key. That mode is
  /// what Paystack shows on its hosted checkout page (the TEST badge), so the app
  /// mirrors it here so shoppers are not surprised by it.
  static Future<InitializeResult> initializePayment({
    required int eventId,
    required int quantity,
    required String ticketType,
    required Map<String, String> contactInfo,
    String? giftRecipientEmail,
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
          if (giftRecipientEmail != null && giftRecipientEmail.trim().isNotEmpty)
            'gift_recipient_email': giftRecipientEmail.trim().toLowerCase(),
        },
      );
    } on DioException catch (error) {
      // A gift to an address with no EventOut account is a normal, expected
      // outcome — surface the store links so the app can send them to the right
      // store instead of showing a generic failure.
      final body = error.response?.data;
      if (body is Map && body['recipient_not_registered'] == true) {
        throw GiftRecipientNotRegisteredException(
          body['message']?.toString() ??
              'That person has no EventOut account yet.',
          _storeLinks(body['store_links']),
        );
      }
      throw apiErrorFromDio(error, 'Payment initialization failed.');
    }
    final data = _toMap(response.data);
    if (data['success'] != true) {
      if (data['recipient_not_registered'] == true) {
        throw GiftRecipientNotRegisteredException(
          data['message']?.toString() ??
              'That person has no EventOut account yet.',
          _storeLinks(data['store_links']),
        );
      }
      throw Exception(
        data['message']?.toString() ?? 'Payment initialization failed',
      );
    }
    return InitializeResult.fromMap(data);
  }

  static GiftStoreLinks _storeLinks(dynamic raw) {
    final map = raw is Map ? raw : const {};
    return GiftStoreLinks(
      android: map['android']?.toString() ??
          'https://play.google.com/store/apps/details?id=com.example.eventra_mobile',
      ios: map['ios']?.toString() ?? 'https://apps.apple.com/search?term=EventOut',
    );
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

  /// Mirrors the organizer key mode already decided by
  /// [initializePayment] so callers that only need the mode don't have to
  /// re-parse the full result.
  static String organizerPaystackModeFromResult(Map<String, dynamic> result) {
    final mode = (result['organizer_paystack_mode'] ?? '').toString().toLowerCase();
    return mode.isEmpty ? 'unknown' : mode;
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

/// Store links used when a gift recipient has not installed EventOut yet.
class GiftStoreLinks {
  final String android;
  final String ios;

  const GiftStoreLinks({required this.android, required this.ios});
}

/// Thrown when a "Get for someone else" recipient has no EventOut account.
/// The app offers the store links so they can register, then the buyer retries.
class GiftRecipientNotRegisteredException implements Exception {
  final String message;
  final GiftStoreLinks storeLinks;

  GiftRecipientNotRegisteredException(this.message, this.storeLinks);

  @override
  String toString() => message;
}

class InitializeResult {
  final Map<String, dynamic> raw;
  final String authorizationUrl;
  final String reference;
  final int orderId;
  final num amount;
  final String organizerPaystackMode;
  final bool isFree;

  InitializeResult({
    required this.raw,
    required this.authorizationUrl,
    required this.reference,
    required this.orderId,
    required this.amount,
    required this.organizerPaystackMode,
    required this.isFree,
  });

  factory InitializeResult.fromMap(Map<String, dynamic> data) {
    final amount = data['amount'] ?? 0;
    return InitializeResult(
      raw: data,
      authorizationUrl: data['authorization_url']?.toString() ?? '',
      reference: data['reference']?.toString() ?? '',
      orderId: (data['order_id'] ?? 0) as int,
      amount: amount is num ? amount : num.tryParse(amount.toString()) ?? 0,
      organizerPaystackMode: (data['organizer_paystack_mode'] ?? '').toString().toLowerCase(),
      isFree: data['is_free'] == true ||
          (amount is num ? amount <= 0 : num.tryParse(amount.toString()) != null && num.parse(amount.toString()) <= 0),
    );
  }
}
