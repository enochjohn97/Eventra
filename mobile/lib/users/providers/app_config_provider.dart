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
    await GoogleAuthService.configure();
    try {
      final config = await AppConfigService.load();
      googleClientId = config.googleClientId;
      mapsApiKey = config.mapsApiKey;
      paystackPublicKey = config.paystackPublicKey;
      appUrl = config.appUrl;
      if (googleClientId.isEmpty) {
        // We no longer rely on the server's googleClientId for mobile sign-in.
        debugPrint(
          'Server googleClientId is empty, but continuing with native config.',
        );
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
