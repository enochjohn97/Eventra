import 'dart:typed_data';

import 'package:pointycastle/export.dart';

/// Native solver for the openresty "AES JS challenge" some shared hosts put in
/// front of the API (e.g. `/aes.js` + `__test` cookie).
///
/// The challenge page ships three hex blobs — AES key `a`, IV `b`, ciphertext
/// `c` — and asks the browser to compute
/// `document.cookie="__test="+toHex(slowAES.decrypt(c, 2 /*CBC*/, a, b))`.
/// We reproduce exactly that (AES-128-CBC decrypt, lowercase hex) in Dart and
/// replay the request with the resulting cookie. No WebView, no user action,
/// identical behaviour on Android and iOS and against any host (local or live).
class HostChallenge {
  HostChallenge._();

  static final RegExp _numbers = RegExp(r'toNumbers\("([0-9a-fA-F]+)"\)');
  static final RegExp _cookieName = RegExp(r'document\.cookie\s*=\s*"([^"=]+)');

  /// True when [body] is the anti-bot challenge page rather than app HTML.
  static bool isChallenge(String? body) =>
      body != null && body.contains('toNumbers(') && body.contains('slowAES');

  /// Solves the challenge found in [html] and returns the full `name=value`
  /// cookie to replay on subsequent requests, or null when unsolvable.
  static String? solve(String html) {
    if (!isChallenge(html)) return null;

    final blobs =
        _numbers.allMatches(html).map((m) => m.group(1)!).toList();
    if (blobs.length < 3) return null;

    final key = _unhex(blobs[0]);
    final iv = _unhex(blobs[1]);
    final cipher = _unhex(blobs[2]);
    if (key == null || key.length != 16) return null;
    if (iv == null || iv.length != 16) return null;
    if (cipher == null || cipher.isEmpty || cipher.length % 16 != 0) return null;

    final Uint8List plain;
    try {
      final aes = CBCBlockCipher(AESEngine());
      aes.init(false, ParametersWithIV(KeyParameter(key), iv));
      plain = Uint8List(cipher.length);
      for (var off = 0; off < cipher.length; off += 16) {
        aes.processBlock(cipher, off, plain, off);
      }
    } catch (_) {
      return null;
    }

    // slowAES only unpads multi-block payloads (unpadBytesOut is a no-op for a
    // single 16-byte block), so mirror that before hex-encoding.
    final bytes = plain.length > 16 ? _unpad(plain) : plain;
    final hex = bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
    final name = _cookieName.firstMatch(html)?.group(1) ?? '__test';
    return '$name=$hex';
  }

  static Uint8List? _unhex(String s) {
    if (s.length.isOdd) return null;
    final out = Uint8List(s.length ~/ 2);
    for (var i = 0; i < out.length; i++) {
      final v = int.tryParse(s.substring(i * 2, i * 2 + 2), radix: 16);
      if (v == null) return null;
      out[i] = v;
    }
    return out;
  }

  static Uint8List _unpad(Uint8List data) {
    final pad = data.isEmpty ? 0 : data.last;
    if (pad < 1 || pad > 16 || pad > data.length) return data;
    for (var i = data.length - pad; i < data.length; i++) {
      if (data[i] != pad) return data;
    }
    return Uint8List.sublistView(data, 0, data.length - pad);
  }
}
