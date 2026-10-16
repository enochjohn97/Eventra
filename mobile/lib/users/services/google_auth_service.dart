// ignore_for_file: avoid_print

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:google_sign_in/google_sign_in.dart';

import '../../core/network/api_client.dart';
import '../../core/network/api_exception.dart';
import '../../core/network/endpoint_resolver.dart';
import '../../core/storage/secure_storage.dart';
import '../models/user_model.dart';
import 'user_profile_service.dart';

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
    final String? clientId = defaultTargetPlatform == TargetPlatform.iOS
        ? null
        : androidClientId;

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

    GoogleSignInAccount? account;
    try {
      // Prefer the non-button Google ID flow (one-tap / account chooser).
      // It mints the token for the *web* (server) client ID and does not
      // require this app's package name + SHA-1 to be registered as an
      // Android OAuth client — which is exactly what the button flow
      // (GetSignInWithGoogleOption) enforces and what fails on this device
      // with Google's UNREGISTERED_ON_API_CONSOLE error.
      account = await _googleSignIn.attemptLightweightAuthentication();
      account ??= await _googleSignIn.authenticate(
        scopeHint: const ['email', 'profile'],
      );
    } on GoogleSignInException catch (e) {
      // Map the plugin's structured codes to precise, actionable messages
      // instead of dumping raw enum text on the user.
      switch (e.code) {
        case GoogleSignInExceptionCode.canceled:
          return null;
        case GoogleSignInExceptionCode.interrupted:
          debugPrint('Google sign-in interrupted: ${e.description}');
          throw const ApiException(
            'Google sign-in was interrupted. Please try again.',
          );
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
          debugPrint('Google sign-in failed: ${e.code} – ${e.description}');
          throw const ApiException('Google sign-in failed. Please try again.');
      }
    } catch (e) {
      debugPrint('Google sign-in failed unexpectedly: $e');
      throw const ApiException(
        'Google sign-in failed unexpectedly. Please try again.',
      );
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
  /// When the current API origin is unreachable or returns a hosting error
  /// page, re-probe the available origins and retry once if appropriate.
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
      final statusCode = error.response?.statusCode;
      final body = error.response?.data;
      final contentType = (error.response?.headers.value('content-type') ?? '')
          .toLowerCase();
      final isHtml =
          contentType.contains('text/html') ||
          (body is String &&
              RegExp(
                r'^\s*<(?:!doctype\s+html|html\b)',
                caseSensitive: false,
              ).hasMatch(body));
      final unavailableHtml =
          isHtml && const [502, 503, 504].contains(statusCode);

      if ((connectionLost || unavailableHtml) && !retried) {
        final previousBaseUrl = _dio.options.baseUrl;
        final reResolved = await EndpointResolver.resolve(force: true);
        final originChanged = previousBaseUrl != _dio.options.baseUrl;
        if ((connectionLost && reResolved) ||
            (unavailableHtml && originChanged)) {
          return exchangeTokenWithBackend(idToken, retried: true);
        }
      }
      throw apiErrorFromDio(
        error,
        'EventOut could not complete Google sign-in.',
      );
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
    try {
      final profile = await UserProfileService.getProfile();
      await SecureStorage.saveUser(profile.toJson());
      return profile;
    } on DioException catch (error) {
      throw apiErrorFromDio(error, 'Could not load your saved profile.');
    }
  }

  /// Keep the Google ID token out of any world-readable mirror. It is a
  /// credential and should live only in secure storage when cached.
  static Future<void> cacheGoogleToken(String idToken) async {
    await SecureStorage.setPrivate('google_id_token', idToken);
  }

  static Future<String?> getCachedGoogleToken() async {
    return SecureStorage.getPrivate('google_id_token');
  }

  static Future<void> clearGoogleCachedToken() async {
    await SecureStorage.deletePrivate('google_id_token');
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
