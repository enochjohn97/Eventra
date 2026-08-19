import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:google_sign_in/google_sign_in.dart';
import '../../core/network/api_client.dart';
import '../../core/storage/secure_storage.dart';
import '../models/user_model.dart';

class GoogleAuthService {
  static final Dio _dio = ApiClient().dio;
  static GoogleSignIn? _googleSignIn;
  static String? _serverClientId;

  static Future<void> configure({required String serverClientId}) async {
    _serverClientId = serverClientId;
    _googleSignIn = GoogleSignIn.instance;
    await _googleSignIn!.initialize(serverClientId: serverClientId);
  }

  static Future<UserModel?> signIn() async {
    if (_googleSignIn == null && _serverClientId != null) {
      await configure(serverClientId: _serverClientId!);
    }
    if (_googleSignIn == null) {
      throw Exception('Google Sign-In is not configured. Load app config first.');
    }

    GoogleSignInAccount account;
    try {
      account = await _googleSignIn!.authenticate();
    } catch (e) {
      debugPrint('Google sign-in cancelled or failed: $e');
      return null;
    }

    final auth = account.authentication;
    final idToken = auth.idToken;
    if (idToken == null || idToken.isEmpty) {
      throw Exception('Google did not return an ID token.');
    }

    final response = await _dio.post('/auth/google', data: {'credential': idToken});
    final data = response.data as Map<String, dynamic>;
    if (data['success'] != true) {
      throw Exception(data['message']?.toString() ?? 'Google authentication failed');
    }

    final token = data['token']?.toString() ?? data['user']?['token']?.toString();
    if (token == null || token.isEmpty) {
      throw Exception('Authentication token missing from server response.');
    }

    await SecureStorage.saveToken(token);

    final userJson = Map<String, dynamic>.from(data['user'] as Map);
    userJson['token'] = token;
    await SecureStorage.saveUser(userJson);

    return UserModel.fromJson(userJson);
  }

  static Future<void> signOut() async {
    try {
      await _googleSignIn?.signOut();
    } catch (_) {}
    await SecureStorage.clearAll();
  }
}
