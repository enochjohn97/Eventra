// ignore_for_file: avoid_print

import 'package:flutter/foundation.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:dio/dio.dart';
import '../../core/network/api_client.dart';
import '../../core/storage/secure_storage.dart';
import '../models/user_model.dart';

class GoogleAuthService {
  static final GoogleSignIn _googleSignIn = GoogleSignIn.instance;

  static bool _initialized = false;

  static bool get isConfigured => _initialized;

  static Future<void> configure() async {
    if (_initialized) return;

    const serverClientId = String.fromEnvironment(
      'GOOGLE_SERVER_CLIENT_ID',
      defaultValue:
          '76953809917-o7bf7c7qbvpu7qglejqe77as5gb609fb.apps.googleusercontent.com',
    );

    const androidClientId = String.fromEnvironment(
      'GOOGLE_ANDROID_CLIENT_ID',
      defaultValue:
          '76953809917-eetkrdqtda43el15vir4dpghhml53dnr.apps.googleusercontent.com',
    );
    const iosClientId = String.fromEnvironment(
      'GOOGLE_IOS_CLIENT_ID',
      defaultValue:
          '76953809917-eguefgb6sgetu8a7g5grjh966il7slq6.apps.googleusercontent.com',
    );
    String? clientId;
    if (defaultTargetPlatform == TargetPlatform.iOS) {
      clientId = iosClientId.isEmpty ? null : iosClientId;
    } else if (defaultTargetPlatform == TargetPlatform.android) {
      clientId = androidClientId.isEmpty ? null : androidClientId;
    }

    await _googleSignIn.initialize(
      clientId: clientId,
      serverClientId: serverClientId,
    );
    _initialized = true;
  }

  static Future<void> signInSilently() async {
    try {
      await _googleSignIn.attemptLightweightAuthentication();
    } catch (_) {}
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

    try {
      final response = await ApiClient().dio.post(
        '/auth/google-handler.php',
        data: {'credential': idToken, 'intent': 'user'},
        options: Options(receiveTimeout: const Duration(seconds: 20)),
      );
      final data = response.data is Map
          ? Map<String, dynamic>.from(response.data as Map)
          : <String, dynamic>{};
      if (data['success'] != true || data['user'] is! Map) {
        throw Exception(data['message']?.toString() ?? 'Google sync failed');
      }
      final token = data['token']?.toString();
      if (token == null || token.isEmpty) {
        throw Exception('Server authentication token missing');
      }
      final userJson = Map<String, dynamic>.from(data['user'] as Map);
      await SecureStorage.saveToken(token);
      await SecureStorage.saveUser(userJson);
      return UserModel.fromJson(userJson);
    } on DioException catch (e) {
      final status = e.response?.statusCode;
      throw Exception(
        status == null
            ? 'Unable to reach Eventra. Check your connection.'
            : 'Google sync failed (HTTP $status). Please try again.',
      );
    }
  }

  static Future<void> signOut() async {
    try {
      await _googleSignIn.signOut();
    } catch (_) {}
    await SecureStorage.clearAll();
  }
}
