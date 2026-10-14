import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import '../../core/network/api_exception.dart';
import '../../core/storage/secure_storage.dart';
import '../models/user_model.dart';
import '../services/event_cache_service.dart';
import '../services/google_auth_service.dart';
import '../services/user_profile_service.dart';

enum AuthStatus { unknown, unauthenticated, authenticated, profileIncomplete }

class AuthProvider extends ChangeNotifier {
  AuthStatus status = AuthStatus.unknown;
  UserModel? user;
  String? error;
  bool isLoading = false;

  /// Set when bootstrap found a stored session but the token was rejected
  /// (expired/revoked). The splash screen shows a gentle "session expired"
  /// message instead of pretending the user was never logged in — and silent
  /// Google re-auth has already been attempted by the API interceptor by the
  /// time this is surfaced.
  bool sessionExpired = false;

  /// Set when the app started fully offline but a cached user exists.
  bool offlineWithCache = false;

  Future<void> bootstrap() async {
    isLoading = true;
    sessionExpired = false;
    offlineWithCache = false;
    notifyListeners();

    try {
      final cached = await SecureStorage.getUser();
      final token = await SecureStorage.getToken();
      if (cached != null && token != null) {
        user = UserModel.fromJson(cached);
        try {
          user = await UserProfileService.getProfile();
          await SecureStorage.saveUser(user!.toJson());
        } on ApiException catch (e) {
          if (e.unauthorized) {
            // Interceptor already tried silent Google re-auth. Nothing worked
            // → the token is dead; credentials were cleared there. Surface a
            // "session expired" login instead of a generic one.
            sessionExpired = true;
            user = null;
            status = AuthStatus.unauthenticated;
            return;
          }
          // Non-auth API failure: fall back to the cached profile so the app
          // still opens (server hiccup shouldn't log anyone out).
        } on DioException catch (e) {
          if (e.type == DioExceptionType.connectionError ||
              e.type == DioExceptionType.connectionTimeout) {
            offlineWithCache = true;
          }
        } catch (_) {}
        status = AuthStatus.authenticated;
      } else {
        status = AuthStatus.unauthenticated;
      }
    } catch (_) {
      // Bootstrap is a silent background check — don't surface network
      // errors as user-visible messages; just fall back to unauthenticated.
      status = AuthStatus.unauthenticated;
    } finally {
      isLoading = false;
      notifyListeners();
    }
  }

  Future<bool> signInWithGoogle() async {
    isLoading = true;
    error = null;
    notifyListeners();
    try {
      user = await GoogleAuthService.signIn();
      if (user == null) {
        // User dismissed the Google sheet — not an error. Keep the form
        // exactly as it was.
        isLoading = false;
        notifyListeners();
        return false;
      }
      status = user!.isProfileComplete
          ? AuthStatus.authenticated
          : AuthStatus.profileIncomplete;
      return true;
    } on ApiException catch (e) {
      error = e.message;
      status = AuthStatus.unauthenticated;
      return false;
    } catch (e) {
      error = e.toString().replaceFirst('Exception: ', '');
      status = AuthStatus.unauthenticated;
      return false;
    } finally {
      isLoading = false;
      notifyListeners();
    }
  }

  Future<bool> updateProfile({
    required String name,
    required String email,
    required String phone,
    required String address,
    required String city,
    required String state,
    required String country,
    required String dob,
    required String gender,
  }) async {
    isLoading = true;
    error = null;
    notifyListeners();
    try {
      user = await UserProfileService.updateProfile(
        name: name,
        email: email,
        phone: phone,
        address: address,
        city: city,
        state: state,
        country: country,
        dob: dob,
        gender: gender,
      );
      await SecureStorage.saveUser(user!.toJson());
      status = user!.isProfileComplete
          ? AuthStatus.authenticated
          : AuthStatus.profileIncomplete;
      return true;
    } on ApiException catch (e) {
      error = e.message;
      return false;
    } catch (e) {
      error = e.toString().replaceFirst('Exception: ', '');
      return false;
    } finally {
      isLoading = false;
      notifyListeners();
    }
  }

  Future<void> logout() async {
    await GoogleAuthService.signOut();
    // Drop the offline events preview too — the next user shouldn't see the
    // previous user's feed snapshot.
    await EventCacheService.instance.clearAll();
    user = null;
    error = null;
    sessionExpired = false;
    status = AuthStatus.unauthenticated;
    notifyListeners();
  }

  /// Re-pulls the profile from the server so edits made on the website show
  /// up in the app without a restart (web ⇄ mobile sync on the same email).
  Future<void> refreshProfile() async {
    if (status == AuthStatus.unauthenticated) return;
    try {
      final fresh = await UserProfileService.getProfile();
      user = fresh;
      await SecureStorage.saveUser(fresh.toJson());
      status = fresh.isProfileComplete
          ? AuthStatus.authenticated
          : AuthStatus.profileIncomplete;
      notifyListeners();
    } catch (_) {
      // Best-effort: keep showing the last known profile on failure.
    }
  }

  void markProfileComplete(UserModel updated) {
    user = updated;
    status = updated.isProfileComplete
        ? AuthStatus.authenticated
        : AuthStatus.profileIncomplete;
    notifyListeners();
  }
}
