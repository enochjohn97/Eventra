// One-off verification: reproduce the mobile app's request flow against the
// live host (challenge → solve → replay) without an emulator.
// Run: dart run tool/verify_live.dart
// ignore_for_file: avoid_print
import 'package:dio/dio.dart';
import 'package:eventra_mobile/core/network/host_challenge.dart';

Future<void> main() async {
  final dio = Dio(
    BaseOptions(
      connectTimeout: const Duration(seconds: 20),
      receiveTimeout: const Duration(seconds: 20),
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'Dart/3.12.2 (EvenOut Mobile)',
        'X-Requested-With': 'XMLHttpRequest',
      },
    ),
  );

  const base = 'https://eventra-website.liveblog365.com/api';

  for (final path in ['/config/app']) {
    var response = await dio.get<dynamic>('$base$path');
    var data = response.data;

    if (data is String && HostChallenge.isChallenge(data)) {
      final cookie = HostChallenge.solve(data);
      if (cookie == null) {
        print('FAIL: could not solve challenge for $path');
        continue;
      }
      print('challenge solved → $cookie');
      dio.options.headers['Cookie'] = cookie;
      response = await dio.get<dynamic>('$base$path');
      data = response.data;
    }

    final type = response.headers.value('content-type') ?? '';
    if (data is Map && data['success'] == true) {
      print('OK $path → ${response.statusCode} $type');
    } else {
      print('FAIL $path → ${response.statusCode} $type → $data');
    }
  }

  // POST /auth/google must also pass the challenge (Google sign-in path).
  const path = '/auth/google';
  var response = await dio.post<dynamic>('$base$path',
      data: {'credential': 'invalid', 'intent': 'user'});
  var data = response.data;
  if (data is String && HostChallenge.isChallenge(data)) {
    final cookie = HostChallenge.solve(data);
    if (cookie == null) {
      print('FAIL: could not solve challenge for POST $path');
    } else {
      print('challenge solved (POST) → $cookie');
      dio.options.headers['Cookie'] = cookie;
      response = await dio.post<dynamic>('$base$path',
          data: {'credential': 'invalid', 'intent': 'user'});
      data = response.data;
    }
  }
  final type = response.headers.value('content-type') ?? '';
  // Backend answers JSON ({"success":false,"message":"Invalid Google token."})
  // once the challenge is passed — that proves the sign-in API is reachable.
  if (data is Map) {
    print('OK POST $path → ${response.statusCode} $type → $data');
  } else {
    print('FAIL POST $path → ${response.statusCode} $type → $data');
  }

  dio.close(force: true);
}
