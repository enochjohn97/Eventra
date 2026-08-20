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
  static String? _serverClientId;

  static bool get isConfigured =>
      _googleSignIn != null && (_serverClientId?.isNotEmpty ?? false);

  static Future<void> configure({required String serverClientId}) async {
    if (serverClientId.isEmpty) return;
    _serverClientId = serverClientId;
    _googleSignIn = GoogleSignIn.instance;
    await _googleSignIn!.initialize(serverClientId: serverClientId);
  }

  static String? _resolveProfilePic(String? pic) {
    if (pic == null || pic.isEmpty) return null;
    if (pic.startsWith('http')) return pic;
    return ApiClient().absoluteUrl(pic);
  }

  static Future<UserModel?> signIn() async {
    if (_googleSignIn == null && _serverClientId != null) {
      await configure(serverClientId: _serverClientId!);
    }
    if (_googleSignIn == null) {
      throw Exception(
        'Google Sign-In is not configured. Check your connection and try again.',
      );
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

    final response = await _dio.post(
      '/auth/google',
      data: {'credential': idToken, 'intent': 'user'},
    );

    Map<String, dynamic> data;
    if (response.data is String) {
      try {
        data = jsonDecode(response.data) as Map<String, dynamic>;
      } catch (e) {
        String errStr = response.data.toString();
        // ignore: prefer_interpolation_to_compose_strings
        if (errStr.length > 100) errStr = errStr.substring(0, 100) + '...';
        throw Exception('Server error: $errStr');
      }
    } else {
      data = response.data as Map<String, dynamic>;
    }
    if (data['success'] != true) {
      throw Exception(
        data['message']?.toString() ?? 'Google authentication failed',
      );
    }

    final token =
        data['token']?.toString() ?? data['user']?['token']?.toString();
    if (token == null || token.isEmpty) {
      throw Exception('Authentication token missing from server response.');
    }

    await SecureStorage.saveToken(token);

    final userJson = Map<String, dynamic>.from(data['user'] as Map);
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
