import 'package:flutter/foundation.dart';
import '../../core/storage/secure_storage.dart';
import '../models/user_model.dart';
import '../services/google_auth_service.dart';
import '../services/user_profile_service.dart';

enum AuthStatus { unknown, unauthenticated, authenticated, profileIncomplete }

class AuthProvider extends ChangeNotifier {
  AuthStatus status = AuthStatus.unknown;
  UserModel? user;
  String? error;
  bool isLoading = false;

  Future<void> bootstrap() async {
    isLoading = true;
    notifyListeners();

    try {
      final cached = await SecureStorage.getUser();
      final token = await SecureStorage.getToken();
      if (cached != null && token != null) {
        user = UserModel.fromJson(cached);
        try {
          user = await UserProfileService.getProfile();
          await SecureStorage.saveUser(user!.toJson());
        } catch (_) {}
        status = user!.isProfileComplete ? AuthStatus.authenticated : AuthStatus.profileIncomplete;
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
        isLoading = false;
        notifyListeners();
        return false;
      }
      status = user!.isProfileComplete ? AuthStatus.authenticated : AuthStatus.profileIncomplete;
      return true;
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
  }) async {
    isLoading = true;
    error = null;
    notifyListeners();
    try {
      user = await UserProfileService.updateProfile(name: name, email: email, phone: phone);
      await SecureStorage.saveUser(user!.toJson());
      status = user!.isProfileComplete ? AuthStatus.authenticated : AuthStatus.profileIncomplete;
      return true;
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
    user = null;
    status = AuthStatus.unauthenticated;
    notifyListeners();
  }

  void markProfileComplete(UserModel updated) {
    user = updated;
    status = updated.isProfileComplete ? AuthStatus.authenticated : AuthStatus.profileIncomplete;
    notifyListeners();
  }
}
