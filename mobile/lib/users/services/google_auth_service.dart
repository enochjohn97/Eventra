// ignore_for_file: avoid_print

import 'dart:convert';
import 'dart:io';
import 'package:dio/dio.dart';
import 'package:dio/io.dart';
import 'package:flutter/foundation.dart';
import 'package:google_sign_in/google_sign_in.dart';
import '../../core/network/api_client.dart';
import '../../core/storage/secure_storage.dart';
import '../models/user_model.dart';

class GoogleAuthService {
  // Retry delays (seconds) for WAF/bot-challenge HTML responses.
  static const _retryDelays = [3, 5];

  /// Returns a fresh, isolated Dio instance for Google auth requests.
  /// - Separate connection pool (no stale-socket "unsolicited response").
  /// - Forwards WAF bypass cookie from the app singleton so the server
  ///   does not serve an HTML challenge page.
  /// - Inline HTML-detect + retry interceptor (mirrors ApiClient logic).
  static Dio _newAuthDio() {
    final singleton = ApiClient();

    // Build options from scratch — only copy the stable fields.
    final opts = BaseOptions(
      baseUrl: singleton.dio.options.baseUrl,
      connectTimeout: singleton.dio.options.connectTimeout,
      receiveTimeout: singleton.dio.options.receiveTimeout,
      followRedirects: true,
      maxRedirects: 5,
      validateStatus: (status) {
        return status != null && status < 600;
      },
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Connection': 'close',
        // Match the User-Agent used in ApiClient to ensure the WAF bypass cookie remains valid.
        'User-Agent':
            'Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 '
            '(KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
        // Forward the WAF/bot-challenge bypass cookie if one was set.
        if (singleton.dio.options.headers.containsKey('Cookie'))
          'Cookie': singleton.dio.options.headers['Cookie'],
      },
    );

    final dio = Dio(opts);

    // Fresh HttpClient with a short idle-timeout — completely separate pool.
    (dio.httpClientAdapter as IOHttpClientAdapter).createHttpClient = () {
      final client = HttpClient();
      client.idleTimeout = const Duration(milliseconds: 1);
      return client;
    };

    // Retry on HTML responses (WAF challenge) — same logic as ApiClient.
    dio.interceptors.add(InterceptorsWrapper(
      onResponse: (response, handler) async {
        final ct = (response.headers.value('content-type') ?? '').toLowerCase();
        if (ct.contains('text/html') ||
            [502, 503, 504].contains(response.statusCode)) {
          final retryCount =
              (response.requestOptions.extra['_retryCount'] as int? ?? 0);
          if (retryCount < _retryDelays.length) {
            await Future.delayed(
                Duration(seconds: _retryDelays[retryCount]));
            final reqOpts = response.requestOptions
              ..extra['_retryCount'] = retryCount + 1;
            try {
              // Fresh Dio for the retry — no interceptors to avoid loops.
              final retryDio = Dio(opts);
              (retryDio.httpClientAdapter as IOHttpClientAdapter)
                  .createHttpClient = () {
                final c = HttpClient();
                c.idleTimeout = const Duration(milliseconds: 1);
                return c;
              };
              return handler.resolve(await retryDio.fetch(reqOpts));
            } catch (e) {
              return handler.reject(e is DioException
                  ? e
                  : DioException(requestOptions: reqOpts, error: e));
            }
          }
        }
        return handler.next(response);
      },
      onError: (error, handler) async {
        if (error.response != null) {
          final ct = (error.response!.headers.value('content-type') ?? '')
              .toLowerCase();
          if (ct.contains('text/html') ||
              [502, 503, 504].contains(error.response!.statusCode)) {
            final retryCount =
                (error.requestOptions.extra['_retryCount'] as int? ?? 0);
            if (retryCount < _retryDelays.length) {
              await Future.delayed(
                  Duration(seconds: _retryDelays[retryCount]));
              error.requestOptions.extra['_retryCount'] = retryCount + 1;
              try {
                final retryDio = Dio(opts);
                (retryDio.httpClientAdapter as IOHttpClientAdapter)
                    .createHttpClient = () {
                  final c = HttpClient();
                  c.idleTimeout = const Duration(milliseconds: 1);
                  return c;
                };
                return handler
                    .resolve(await retryDio.fetch(error.requestOptions));
              } catch (e) {
                return handler.next(e is DioException
                    ? e
                    : DioException(
                        requestOptions: error.requestOptions, error: e));
              }
            }
          }
        }
        return handler.next(error);
      },
    ));

    return dio;
  }

  static final GoogleSignIn _googleSignIn = GoogleSignIn.instance;

  static bool _initialized = false;

  static bool get isConfigured => _initialized;

  static Future<void> configure() async {
    if (_initialized) return;

    String? clientId;
    if (defaultTargetPlatform == TargetPlatform.iOS) {
      clientId = '76953809917-eguefgb6sgetu8a7g5grjh966il7slq6.apps.googleusercontent.com';
    } else if (defaultTargetPlatform == TargetPlatform.android) {
      clientId = '76953809917-eetkrdqtda43el15vir4dpghhml53dnr.apps.googleusercontent.com';
    }

    await _googleSignIn.initialize(
      clientId: clientId,
      serverClientId: '76953809917-o7bf7c7qbvpu7qglejqe77as5gb609fb.apps.googleusercontent.com',
    );
    _initialized = true;
  }

  static Future<void> signInSilently() async {
    try {
      await _googleSignIn.attemptLightweightAuthentication();
    } catch (_) {}
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
      account = await _googleSignIn.authenticate(
        scopeHint: const ['email', 'profile'],
      );
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
    final dio = _newAuthDio();
    try {
      print('------------------- [API REQUEST LOG] -------------------');
      print('Sending Request to: ${dio.options.baseUrl}/auth/google-handler.php');

      response = await dio.post(
        '/auth/google-handler.php',
        data: {'credential': idToken, 'intent': 'user'},
        options: Options(responseType: ResponseType.plain),
      );

      print('STATUS CODE: ${response.statusCode}');
      print('RESPONSE HEADERS: ${response.headers}');
      print('RAW RESPONSE BODY:');
      print(response.data);
      print('---------------------------------------------------------');
    } on DioException catch (e) {
      print('=================== [DIO EXCEPTION] ===================');
      print('TYPE: ${e.type}');
      print('MESSAGE: ${e.message}');
      print('ERROR RESPONSE: ${e.response?.data}');
      print('=======================================================');
      final body = e.response?.data?.toString() ?? '';
      debugPrint('[GoogleAuth] Request URL : ${e.requestOptions.uri}');
      debugPrint('[GoogleAuth] Status      : ${e.response?.statusCode}');
      debugPrint(
        '[GoogleAuth] Body (200ch): ${body.length > 200 ? body.substring(0, 200) : body}',
      );
      rethrow;
    } catch (e, stackTrace) {
      print('UNEXPECTED ERROR: $e');
      print(stackTrace);
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
      await _googleSignIn.signOut();
    } catch (_) {}
    await SecureStorage.clearAll();
  }
}
