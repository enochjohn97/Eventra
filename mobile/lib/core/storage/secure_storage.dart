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
      // Handle double-encoded JSON: decode again if still a String
      if (decoded is String) decoded = jsonDecode(decoded);
      if (decoded is Map) return Map<String, dynamic>.from(decoded);
      return null;
    } catch (_) {
      return null;
    }
  }

  static Future<void> clearAll() async {
    await _storage.deleteAll();
  }
}
