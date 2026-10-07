// ignore_for_file: avoid_print

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:google_sign_in/google_sign_in.dart';

import '../../core/network/api_client.dart';
import '../../core/network/api_exception.dart';
import '../../core/network/endpoint_resolver.dart';
import '../../core/storage/secure_storage.dart';
import '../models/user_model.dart';

/// Google Sign-In → backend session exchange.
///
/// Plugin notes (google_sign_in 7.2.0):
///  * `authenticate()` throws [GoogleSignInException] for all failures
///    (cancellation included) — there is no null return.
///  * On Android the plugin drives Credential Manager and sends the token to
///    the **serverClientId** audience; the Android "client" ID is ignored on
///    Android. On iOS the token audience is the iOS client ID.
///  * `account.authentication` is a synchronous getter in v7 (NOT a Future).
///
/// Backend contract (api/auth/google-handler.php): POST /auth/google with
/// `{"credential": "<google id_token>", "intent": "user"}`. The backend calls
/// Google's tokeninfo endpoint and accepts a token whose `aud` matches ANY of
/// {web server, android, ios} client IDs — so the audiences above are exactly
/// what it validates against. It returns
/// `{"success": true, "token": "...", "user": {...}}`; the token is an opaque
/// 64-hex-char access token (auth_tokens table, 2h TTL) used as
/// `Authorization: Bearer <token>` on every later call.
class GoogleAuthService {
  static final GoogleSignIn _googleSignIn = GoogleSignIn.instance;
  static final Dio _dio = ApiClient().dio;

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

    // NOTE: the iOS client ID is intentionally NOT passed here — iOS resolves
    // it from GIDClientID in Info.plist (and the reversed-client-id URL scheme
    // handles the redirect back into the app), which must stay in sync with
    // GOOGLE_IOS_CLIENT_ID in the backend .env. On Android the clientId below
    // is informational — Credential Manager always uses serverClientId as the
    // token audience.
    final String? clientId =
        defaultTargetPlatform == TargetPlatform.iOS ? null : androidClientId;

    await _googleSignIn.initialize(
      clientId: clientId,
      serverClientId: serverClientId,
    );

    // Let the API client silently re-authenticate when the backend reports
    // the 2h session token expired (the backend has no refresh-token flow).
    ApiClient.registerSilentRecovery(silentlyReauthenticate);

    _initialized = true;
  }

  /// Fire-and-forget silent sign-in used on app start.
  static Future<void> signInSilently() async {
    try {
      await _googleSignIn.attemptLightweightAuthentication();
    } catch (_) {}
  }

  /// Interactive sign-in. Returns the EventOut user, or null when the user
  /// dismissed the Google sheet (cancellation is not an error).
  ///
  /// Throws [ApiException] with a user-presentable message on real failures.
  static Future<UserModel?> signIn() async {
    if (!_initialized) await configure();

    GoogleSignInAccount account;
    try {
      account = await _googleSignIn.authenticate(
        scopeHint: const ['email', 'profile'],
      );
    } on GoogleSignInException catch (e) {
      // Map the plugin's structured codes to precise, actionable messages
      // instead of dumping raw enum text on the user.
      switch (e.code) {
        case GoogleSignInExceptionCode.canceled:
        case GoogleSignInExceptionCode.interrupted:
          return null;
        case GoogleSignInExceptionCode.clientConfigurationError:
        case GoogleSignInExceptionCode.providerConfigurationError:
          debugPrint(
            'Google sign-in config error: ${e.code} – ${e.description}',
          );
          throw const ApiException(
            'Sign-in is misconfigured on this device. '
            'Check the OAuth client IDs / SHA-1 fingerprint setup.',
          );
        case GoogleSignInExceptionCode.uiUnavailable:
          throw const ApiException(
            'Google sign-in UI could not open. Update Google Play services '
            'and try again.',
          );
        case GoogleSignInExceptionCode.unknownError:
        case GoogleSignInExceptionCode.userMismatch:
          debugPrint(
            'Google sign-in failed: ${e.code} – ${e.description}',
          );
          throw const ApiException(
            'Google sign-in failed. Please try again.',
          );
      }
    } catch (e) {
      debugPrint('Google sign-in cancelled or failed: $e');
      return null;
    }

    // v7: `.authentication` is a synchronous getter, NOT a Future.
    final idToken = account.authentication.idToken;
    if (idToken == null || idToken.isEmpty) {
      // Authenticate() should always yield an ID token; an empty value means
      // the credential came back without one (rare Play services state).
      throw const ApiException(
        'Google did not return an ID token. '
        'Update Google Play services and try again.',
      );
    }

    return exchangeTokenWithBackend(idToken);
  }

  /// Exchanges a Google ID token for an EventOut session (shared by
  /// interactive and silent sign-in).
  ///
  /// When the currently-picked API origin refuses connections (e.g. the local
  /// dev server was adopted at launch and later stopped), we force the
  /// endpoint resolver to re-probe — which falls back to the live host — and
  /// retry once, so sign-in never depends on a locally-running server.
  static Future<UserModel> exchangeTokenWithBackend(
    String idToken, {
    bool retried = false,
  }) async {
    final Response<dynamic> response;
    try {
      response = await _dio.post(
        '/auth/google',
        data: {'credential': idToken, 'intent': 'user'},
      );
    } on DioException catch (error) {
      final connectionLost =
          error.type == DioExceptionType.connectionError ||
          error.type == DioExceptionType.connectionTimeout ||
          error.type == DioExceptionType.sendTimeout ||
          error.type == DioExceptionType.receiveTimeout;
      if (connectionLost && !retried) {
        final reResolved = await EndpointResolver.resolve(force: true);
        if (reResolved) {
          return exchangeTokenWithBackend(idToken, retried: true);
        }
      }
      throw apiErrorFromDio(error, 'EventOut could not complete Google sign-in.');
    }

    final data = response.data is Map
        ? Map<String, dynamic>.from(response.data as Map)
        : <String, dynamic>{};
    final userJson = data['user'] is Map
        ? Map<String, dynamic>.from(data['user'] as Map)
        : null;
    final serverToken = data['token']?.toString();
    if (data['success'] != true || serverToken == null || userJson == null) {
      throw ApiException(
        data['message']?.toString() ??
            'EventOut could not complete Google sign-in.',
        statusCode: response.statusCode,
      );
    }

    await SecureStorage.saveToken(serverToken);
    await SecureStorage.saveUser(userJson);
    return UserModel.fromJson(userJson);
  }

  /// Silent Google re-auth + token exchange. Used by the API client's 401/403
  /// recovery interceptor when the 2h backend token expires mid-session.
  /// Returns false when the user must sign in manually (no cached Google
  /// session, cancellation, or any hard failure).
  static Future<bool> silentlyReauthenticate() async {
    if (!_initialized) return false;
    try {
      // attemptLightweightAuthentication resolves to null when there is no
      // cached Google session (or it returns null when the platform doesn't
      // support silent sign-in) — both mean the user must sign in manually.
      final account = await _googleSignIn.attemptLightweightAuthentication();
      final idToken = account?.authentication.idToken;
      if (idToken == null || idToken.isEmpty) return false;
      await exchangeTokenWithBackend(idToken);
      return true;
    } catch (_) {
      return false;
    }
  }

  static Future<void> signOut() async {
    try {
      await _googleSignIn.signOut();
    } catch (_) {}
    await SecureStorage.clearAll();
  }
}
