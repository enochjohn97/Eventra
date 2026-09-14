// ignore_for_file: avoid_print

import 'package:flutter/foundation.dart';
import 'package:google_sign_in/google_sign_in.dart';
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

    final name = account.displayName?.trim();
    final email = account.email.trim();
    final userJson = {
      'id': 0,
      'name': name?.isNotEmpty == true ? name : 'User',
      'email': email,
      'profile_pic': account.photoUrl,
      'profile_image': account.photoUrl,
      'role': 'user',
    };

    // Native Google authentication is intentionally independent of the web API.
    await SecureStorage.saveToken(idToken);
    await SecureStorage.saveUser(userJson);
    return UserModel.fromJson(userJson);
  }

  static Future<void> signOut() async {
    try {
      await _googleSignIn.signOut();
    } catch (_) {}
    await SecureStorage.clearAll();
  }
}
