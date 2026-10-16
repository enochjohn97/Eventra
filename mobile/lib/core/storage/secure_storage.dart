import 'dart:convert';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class SecureStorage {
  static const _storage = FlutterSecureStorage();

  static const encodeUser = true;

  static const _keyToken = 'auth_token';
  static const _keyUser = 'auth_user';
  static const _keyRefreshToken = 'refresh_token';

  /// Save the session token. Tokens are sensitive credentials and must never
  /// be persisted as plaintext outside the encrypted platform keystore.
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

  /// Persist the current user profile. Profile data is sensitive PII and is
  /// stored only in the platform secure store (encrypted at rest), not in any
  /// world-readable mirror like SharedPreferences or plain files.
  static Future<void> saveUser(Map<String, dynamic> user) async {
    // Keep only the fields the app needs locally; strip anything that would
    // otherwise get re-serialized into a less-protected store.
    final safe = Map<String, dynamic>.fromEntries(
      user.entries.where((entry) => _allowedUserField(entry.key)),
    );
    await _storage.write(key: _keyUser, value: jsonEncode(safe));
  }

  static bool _allowedUserField(String key) {
    const allowed = <String>{
      'id',
      'name',
      'email',
      'phone',
      'dob',
      'gender',
      'country',
      'state',
      'city',
      'address',
      'custom_id',
      'profile_pic',
      'profile_image',
      'role',
      'status',
      'created_at',
      'updated_at',
    };
    return allowed.contains(key);
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

  static Future<void> savePrivateList(
    String name,
    List<Map<String, dynamic>> items,
  ) async {
    final userId = (await getUser())?['id']?.toString();
    if (userId == null || userId.isEmpty || userId == '0') return;
    await _storage.write(
      key: 'offline_${name}_$userId',
      value: jsonEncode(items),
    );
  }

  static Future<List<Map<String, dynamic>>?> getPrivateList(String name) async {
    final userId = (await getUser())?['id']?.toString();
    if (userId == null || userId.isEmpty || userId == '0') return null;
    final raw = await _storage.read(key: 'offline_${name}_$userId');
    if (raw == null) return null;
    final decoded = jsonDecode(raw);
    if (decoded is! List) {
      throw const FormatException('Cached account data is invalid.');
    }
    return decoded
        .whereType<Map>()
        .map((item) => Map<String, dynamic>.from(item))
        .toList();
  }

  /// Wipe session material (token, user, refresh token). Used on logout or
  /// when a token is rejected so a dead credential cannot linger in secure
  /// storage.
  static Future<void> clearAll() async {
    await _storage.deleteAll();
  }

  /// Read or write arbitrary sensitive app state under a namespaced key.
  /// Use this for things that should not land in plain-text localStorage/
  /// SharedPreferences mirrors.
  static Future<void> setPrivate(String key, String value) async {
    await _storage.write(key: 'private.$key', value: value);
  }

  static Future<String?> getPrivate(String key) async {
    return _storage.read(key: 'private.$key');
  }

  static Future<void> deletePrivate(String key) async {
    await _storage.delete(key: 'private.$key');
  }
}
