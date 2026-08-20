import 'dart:convert';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class SecureStorage {
  static const _storage = FlutterSecureStorage();

  static const _keyToken = 'auth_token';
  static const _keyUser = 'auth_user';
  static const _keyRefreshToken = 'refresh_token';

  static Future<void> saveToken(String token) async {
    await _storage.write(key: _keyToken, value: token);
  }

  static Future<String?> getToken() async {
    return _storage.read(key: _keyToken);
  }

  static Future<void> saveRefreshToken(String token) async {
    await _storage.write(key: _keyRefreshToken, value: token);
  }

  static Future<String?> getRefreshToken() async {
    return _storage.read(key: _keyRefreshToken);
  }

  static Future<void> saveUser(Map<String, dynamic> user) async {
    await _storage.write(key: _keyUser, value: jsonEncode(user));
  }

  static Future<Map<String, dynamic>?> getUser() async {
    final raw = await _storage.read(key: _keyUser);
    if (raw == null || raw.isEmpty) return null;

    try {
      dynamic decoded = jsonDecode(raw);

      // Handle double‑encoded JSON (e.g., stored as a JSON string of a JSON string)
      if (decoded is String) {
        try {
          decoded = jsonDecode(decoded);
        } catch (_) {
          // Not double‑encoded or second layer is invalid → cannot be a Map
          return null;
        }
      }

      // Only return if the final decoded value is a Map
      if (decoded is Map) {
        // Explicit conversion to Map<String, dynamic>
        return Map<String, dynamic>.from(decoded);
      }

      // If it's a List, int, bool, etc., it's not a valid user object
      return null;
    } catch (_) {
      // Invalid JSON or other decoding error
      return null;
    }
  }

  static Future<void> clearAll() async {
    await _storage.deleteAll();
  }
}