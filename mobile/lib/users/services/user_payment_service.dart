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
    String? giftRecipientName,
    String? giftRecipientPhone,
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
          if (giftRecipientEmail != null && giftRecipientEmail.trim().isNotEmpty) ...{
            'gift_recipient_email': giftRecipientEmail.trim().toLowerCase(),
            if (giftRecipientName != null && giftRecipientName.trim().isNotEmpty)
              'gift_recipient_name': giftRecipientName.trim(),
            if (giftRecipientPhone != null && giftRecipientPhone.trim().isNotEmpty)
              'gift_recipient_phone': giftRecipientPhone.trim(),
          },
        },
      );
    } on DioException catch (error) {
      final body = error.response?.data;
      if (body is Map) {
        if (body['limit_exceeded'] == true) {
          throw GiftLimitExceededException(
            body['message']?.toString() ??
                'You have exceeded the limit of 50 temporary accounts.',
            _storeLinks(body['store_links']),
            creationCount: int.tryParse(body['creation_count']?.toString() ?? '') ?? 50,
            creationLimit: int.tryParse(body['creation_limit']?.toString() ?? '') ?? 50,
          );
        }
        if (body['recipient_not_registered'] == true) {
          throw GiftRecipientNotRegisteredException(
            body['message']?.toString() ??
                'That person has no EventOut account yet.',
            _storeLinks(body['store_links']),
          );
        }
      }
      throw apiErrorFromDio(error, 'Payment initialization failed.');
    }
    final data = _toMap(response.data);
    if (data['success'] != true) {
      if (data['limit_exceeded'] == true) {
        throw GiftLimitExceededException(
          data['message']?.toString() ??
              'You have exceeded the limit of 50 temporary accounts.',
          _storeLinks(data['store_links']),
          creationCount: int.tryParse(data['creation_count']?.toString() ?? '') ?? 50,
          creationLimit: int.tryParse(data['creation_limit']?.toString() ?? '') ?? 50,
        );
      }
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

  /// Check quota for temporary account creations by the current user.
  static Future<({
    int creationCount,
    int creationLimit,
    int creationsLeft,
    String? warning,
    bool limitExceeded,
    GiftStoreLinks storeLinks,
  })> checkRecipientQuota() async {
    try {
      final response = await _dio.get('/payments/recipient-quota');
      final data = _toMap(response.data);
      final links = _storeLinks(data['store_links']);
      return (
        creationCount: int.tryParse(data['creation_count']?.toString() ?? '') ?? 0,
        creationLimit: int.tryParse(data['creation_limit']?.toString() ?? '') ?? 50,
        creationsLeft: int.tryParse(data['creations_left']?.toString() ?? '') ?? 50,
        warning: data['warning']?.toString(),
        limitExceeded: data['limit_exceeded'] == true,
        storeLinks: links,
      );
    } catch (_) {
      return (
        creationCount: 0,
        creationLimit: 50,
        creationsLeft: 50,
        warning: null,
        limitExceeded: false,
        storeLinks: _storeLinks(null),
      );
    }
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

/// Thrown when the 50 temporary accounts limit is exceeded.
class GiftLimitExceededException implements Exception {
  final String message;
  final GiftStoreLinks storeLinks;
  final int creationCount;
  final int creationLimit;

  GiftLimitExceededException(
    this.message,
    this.storeLinks, {
    this.creationCount = 50,
    this.creationLimit = 50,
  });

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
  final String? giftWarning;
  final int? creationsLeft;
  final int? creationCount;

  InitializeResult({
    required this.raw,
    required this.authorizationUrl,
    required this.reference,
    required this.orderId,
    required this.amount,
    required this.organizerPaystackMode,
    required this.isFree,
    this.giftWarning,
    this.creationsLeft,
    this.creationCount,
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
      giftWarning: data['gift_warning']?.toString(),
      creationsLeft: int.tryParse(data['creations_left']?.toString() ?? ''),
      creationCount: int.tryParse(data['creation_count']?.toString() ?? ''),
    );
  }
}
