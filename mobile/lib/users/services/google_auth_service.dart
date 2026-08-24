import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:google_sign_in/google_sign_in.dart';
import '../../core/network/api_client.dart';
import '../../core/storage/secure_storage.dart';
import '../models/user_model.dart';

class GoogleAuthService {
  static final Dio _dio = ApiClient().dio;
  static GoogleSignIn? _googleSignIn;

  static bool _initialized = false;

  static bool get isConfigured => _googleSignIn != null && _initialized;

  static Future<void> configure() async {
    _googleSignIn ??= GoogleSignIn.instance;
    if (_initialized) return;
    await _googleSignIn!.initialize();
    _initialized = true;
  }

  static String? _resolveProfilePic(String? pic) {
    if (pic == null || pic.isEmpty) return null;
    if (pic.startsWith('http')) return pic;
    return ApiClient().absoluteUrl(pic);
  }

  /// Recursively decodes any JSON strings found inside maps or lists.
  /// This ensures that even if the server returns a field as a JSON string,
  /// it will be converted to the appropriate Dart type (Map, List, etc.).
  static dynamic _deepDecode(dynamic value) {
    if (value is String) {
      final trimmed = value.trim();
      if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
          (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
        try {
          return _deepDecode(jsonDecode(trimmed));
        } catch (_) {
          return value; // Not valid JSON; return as is
        }
      }
      return value;
    } else if (value is Map) {
      return value.map((k, v) => MapEntry(k.toString(), _deepDecode(v)));
    } else if (value is List) {
      return value.map(_deepDecode).toList();
    }
    return value;
  }

  /// Converts any decoded value to a `Map<String, dynamic>`.
  /// Throws an [Exception] if the value is not a Map after decoding.
  static Map<String, dynamic> _asMap(dynamic value) {
    final decoded = _deepDecode(value);
    if (decoded is Map<String, dynamic>) return decoded;
    if (decoded is Map) {
      // Ensure we return a Map<String, dynamic> specifically
      return Map<String, dynamic>.from(decoded);
    }
    throw Exception('Invalid data format: expected an object.');
  }

  static Future<UserModel?> signIn() async {
    if (!_initialized) await configure();

    GoogleSignInAccount account;
    try {
      // v7.2.0: authenticate() is the correct method (signIn() does not exist)
      account = await _googleSignIn!.authenticate();
    } on GoogleSignInException catch (e) {
      debugPrint('Google sign-in failed: ${e.code} – ${e.description}');
      return null;
    } catch (e) {
      debugPrint('Google sign-in cancelled or failed: $e');
      return null;
    }

    // v7.2.0: .authentication is a synchronous getter, NOT a Future
    final idToken = account.authentication.idToken;
    if (idToken == null || idToken.isEmpty) {
      throw Exception('Google did not return an ID token.');
    }

    late Response<dynamic> response;
    try {
      response = await _dio.post(
        '/auth/google',
        data: {'credential': idToken, 'intent': 'user'},
      );
    } on DioException catch (e) {
      final body = e.response?.data?.toString() ?? '';
      debugPrint('[GoogleAuth] Request URL : ${e.requestOptions.uri}');
      debugPrint('[GoogleAuth] Status      : ${e.response?.statusCode}');
      debugPrint(
        '[GoogleAuth] Body (200ch): ${body.length > 200 ? body.substring(0, 200) : body}',
      );
      rethrow;
    }

    // Guard: reject HTML responses (bot-challenge / WAF page) before JSON decode.
    final contentType = (response.headers.value('content-type') ?? '')
        .toLowerCase();
    if (contentType.contains('text/html')) {
      final snippet = response.data.toString();
      debugPrint(
        '[GoogleAuth] HTML response received from /auth/google – possible WAF/bot-challenge.',
      );
      debugPrint('[GoogleAuth] URL     : ${response.requestOptions.uri}');
      debugPrint('[GoogleAuth] Headers : ${response.requestOptions.headers}');
      debugPrint(
        '[GoogleAuth] Snippet : ${snippet.length > 300 ? snippet.substring(0, 300) : snippet}',
      );
      throw Exception(
        'Server returned an HTML page instead of JSON. '
        'The API host may be blocking this request (bot-protection). '
        'Check the debug log for the full request URL and headers.',
      );
    }

    Map<String, dynamic> data;
    try {
      data = _asMap(response.data);
    } catch (e) {
      String errStr = response.data.toString();
      if (errStr.length > 100) errStr = '${errStr.substring(0, 100)}...';
      throw Exception('Server error: $errStr');
    }

    if (data['success'] != true) {
      throw Exception(
        data['message']?.toString() ?? 'Google authentication failed',
      );
    }

    // Extract token from either `data['token']` or `data['user']['token']`.
    // `data['user']` may be a Map or a JSON string – handle both safely.
    String? token;
    if (data['token'] != null) {
      token = data['token'].toString();
    } else {
      final userField = data['user'];
      if (userField != null) {
        try {
          final userMap = _asMap(userField);
          token = userMap['token']?.toString();
        } catch (_) {
          // Ignore if userField is not a Map/JSON object
          token = null;
        }
      }
    }

    if (token == null || token.isEmpty) {
      throw Exception('Authentication token missing from server response.');
    }

    await SecureStorage.saveToken(token);

    Map<String, dynamic> userJson;
    try {
      // `_asMap` will decode `data['user']` even if it is a JSON string
      userJson = _asMap(data['user']);
    } catch (_) {
      throw Exception('Invalid user data format.');
    }

    // Add the token to the user map (it may already be there, but we ensure)
    userJson['token'] = token;

    final googleName = account.displayName?.trim();
    final googleEmail = account.email.trim();
    final googlePhoto = account.photoUrl;

    if (googleName != null && googleName.isNotEmpty) {
      userJson['name'] = googleName;
    }
    if (googleEmail.isNotEmpty) {
      userJson['email'] = googleEmail;
    }
    final profilePic =
        _resolveProfilePic(googlePhoto) ??
        _resolveProfilePic(userJson['profile_pic']?.toString()) ??
        _resolveProfilePic(userJson['profile_image']?.toString());
    if (profilePic != null) {
      userJson['profile_pic'] = profilePic;
      userJson['profile_image'] = profilePic;
    }

    // Save the user map to secure storage
    await SecureStorage.saveUser(userJson);

    try {
      return UserModel.fromJson(userJson);
    } catch (e, st) {
      debugPrint('UserModel.fromJson failed on: $userJson');
      debugPrint('$e\n$st');
      rethrow;
    }
  }

  static Future<void> signOut() async {
    try {
      await _googleSignIn?.signOut();
    } catch (_) {}
    await SecureStorage.clearAll();
  }
}
