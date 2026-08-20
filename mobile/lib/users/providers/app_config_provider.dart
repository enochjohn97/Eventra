import 'package:flutter/foundation.dart';
import '../services/app_config_service.dart';
import '../services/google_auth_service.dart';

class AppConfigProvider extends ChangeNotifier {
  bool isLoaded = false;
  bool isLoading = false;
  String? snackbar;
  String googleClientId = '';
  String mapsApiKey = '';
  String paystackPublicKey = '';
  String appUrl = '';

  Future<void> load({bool force = false}) async {
    if ((isLoaded && !force) || isLoading) return;
    isLoading = true;
    snackbar = null;
    notifyListeners();
    try {
      final config = await AppConfigService.load();
      googleClientId = config.googleClientId;
      mapsApiKey = config.mapsApiKey;
      paystackPublicKey = config.paystackPublicKey;
      appUrl = config.appUrl;
      if (googleClientId.isNotEmpty) {
        await GoogleAuthService.configure(serverClientId: googleClientId);
      } else {
        snackbar = 'Google Client ID is not configured on the server.';
      }
      isLoaded = true;
    } catch (e) {
      snackbar = e.toString().replaceFirst('Exception: ', '');
    } finally {
      isLoading = false;
      notifyListeners();
    }
  }
}
