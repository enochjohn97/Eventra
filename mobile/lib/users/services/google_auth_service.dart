import 'package:flutter/foundation.dart';
import 'package:dio/dio.dart';
import '../../core/network/api_client.dart';
import '../../core/storage/secure_storage.dart';

class GoogleAuthService {
  static final Dio _dio = ApiClient().dio;

  static Future<dynamic> signIn() async {
    try {
      debugPrint('Google Sign-In Mock: Attempting to sign in');
      
      // Simulate getting ID token from Google SignIn SDK
      const mockIdToken = 'mock_google_id_token';

      // Send the ID token to our backend
      final response = await _dio.post('/auth/google-handler.php', data: {
        'idToken': mockIdToken,
      });

      if (response.statusCode == 200 && response.data['token'] != null) {
        await SecureStorage.saveToken(response.data['token']);
        return response.data; // Return the user data
      }
      return null;
    } catch (error) {
      debugPrint('Google Sign-In Error: $error');
      return null;
    }
  }

  static Future<void> signOut() async {
    debugPrint('Google Sign-In Mock: Attempting to sign out');
    await SecureStorage.clearAll();
  }
}

