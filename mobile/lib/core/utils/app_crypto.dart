// Payload-level encryption helpers for sensitive API fields.
//
// Transport (HTTPS) protects data in flight. This layer protects the same
// sensitive fields at rest and inside the request/response bodies so that a
// compromised payload (logs, proxy, SQLite, localStorage mirror, dump) still
// cannot read the real values without the device/keyboard-bound key.
//
// Design notes:
//  - The AppKey is derived from platform secure storage, not hardcoded.
//  - Only the fields the app treats as sensitive are encrypted; the rest of
//    the payload stays JSON so the existing services keep working.
//  - Encryption is AES-256-GCM (authenticated) with a random IV per field.
//  - The ciphertext envelope is base64 so it survives JSON transport unchanged.

import 'dart:convert';
import 'dart:math' show Random;
import 'dart:typed_data';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:pointycastle/export.dart';

class AppCrypto {
  AppCrypto._();

  static const _keyStorageKey = 'app_crypto_key';
  static const _keysStorage = FlutterSecureStorage();

  static Future<AppCrypto> create() async {
    final instance = AppCrypto._();
    await instance._ensureKey();
    return instance;
  }

  late final Uint8List _key;
  bool _ready = false;

  bool get ready => _ready;

  Future<void> _ensureKey() async {
    if (_ready) return;
    final raw = await _keysStorage.read(key: _keyStorageKey);
    if (raw != null && raw.isNotEmpty) {
      try {
        final bytes = base64Decode(raw);
        if (bytes.length == 32) {
          _key = bytes;
          _ready = true;
          return;
        }
      } on FormatException {
        // Replace malformed key material with a fresh key below.
      }
    }
    // Fresh install or corrupted key material: provision a new key.
    final newKey = _randomBytes(32);
    await _keysStorage.write(key: _keyStorageKey, value: base64Encode(newKey));
    _key = newKey;
    _ready = true;
  }

  static Uint8List _randomBytes(int length) {
    final target = Uint8List(length);
    final rng = Random.secure();
    for (var i = 0; i < length; i++) {
      target[i] = rng.nextInt(256);
    }
    return target;
  }

  /// Encrypt a UTF-8 string and return a base64 envelope the other side can
  /// decrypt with the same [AppCrypto] instance.
  String encryptString(String plain) {
    if (!ready) return plain;
    final iv = _randomBytes(12);
    final cipher = GCMBlockCipher(AESEngine());
    cipher.init(
      true,
      AEADParameters(KeyParameter(_key), 128, iv, Uint8List(0)),
    );
    final plainBytes = utf8.encode(plain);
    final ciphertext = Uint8List(cipher.getOutputSize(plainBytes.length));
    var length = cipher.processBytes(
      plainBytes,
      0,
      plainBytes.length,
      ciphertext,
      0,
    );
    length += cipher.doFinal(ciphertext, length);
    final out = Uint8List(iv.length + length);
    out.setRange(0, iv.length, iv);
    out.setRange(iv.length, out.length, ciphertext, 0);
    return base64Encode(out);
  }

  /// Decrypt a base64 envelope produced by [encryptString].
  String? decryptString(String? envelope) {
    if (!ready || envelope == null || envelope.isEmpty) return null;
    try {
      final bytes = base64Decode(envelope);
      if (bytes.length < 28) return null;
      final iv = bytes.sublist(0, 12);
      final ciphertext = bytes.sublist(12);
      final cipher = GCMBlockCipher(AESEngine());
      cipher.init(
        false,
        AEADParameters(KeyParameter(_key), 128, iv, Uint8List(0)),
      );
      final plain = Uint8List(cipher.getOutputSize(ciphertext.length));
      var length = cipher.processBytes(
        ciphertext,
        0,
        ciphertext.length,
        plain,
        0,
      );
      length += cipher.doFinal(plain, length);
      return utf8.decode(plain.sublist(0, length));
    } catch (_) {
      return null;
    }
  }
}

/// Sensitive fields that should be encrypted when they appear in outbound
/// request payloads or inbound response payloads that the app persists.
///
/// Keep this list small and explicit. Fields that are only ever transitory
//  (e.g. one-off QR payloads) are intentionally left out unless they are
//  persisted.
const sensitiveFieldNames = <String>{
  'token',
  'refresh_token',
  'access_token',
  'phone',
  'dob',
  'address',
  'custom_id',
  'profile_pic',
  'profile_image',
  'otp',
  'verification_code',
  'code',
  'password',
  'new_password',
  'current_password',
  'card_number',
  'card_token',
  'card_cvv',
  'card_expiry',
  'bank_account',
  'bank_code',
  'bvn',
  'nin',
  'last_four',
  'pin',
  'secret',
  'private_key',
  'recovery_code',
  'reset_token',
  'auth_id',
  'session_token',
  'session_id',
  'tickets.*.barcode',
  'tickets.*.custom_id',
  'user.*.barcode',
  'user.*.custom_id',
};

/// Returns the encryption envelope key for [name] if it is sensitive.
///
/// Nested fields are matched by prefix, e.g. `tickets.0.barcode` matches
/// the `tickets.*.barcode` pattern.
bool isSensitiveField(String name) {
  if (sensitiveFieldNames.contains(name)) return true;
  final nameParts = name.split('.');
  for (final pattern in sensitiveFieldNames) {
    final patternParts = pattern.split('.');
    if (patternParts.length != nameParts.length) continue;
    var matches = true;
    for (var index = 0; index < patternParts.length; index++) {
      if (patternParts[index] != '*' &&
          patternParts[index] != nameParts[index]) {
        matches = false;
        break;
      }
    }
    if (matches) return true;
  }
  return false;
}
