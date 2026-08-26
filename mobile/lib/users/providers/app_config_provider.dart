import 'package:flutter/foundation.dart';
import '../services/app_config_service.dart';
import '../services/google_auth_service.dart';

class AppConfigProvider extends ChangeNotifier {
  bool isLoaded = false;
  bool isLoading = false;
  String? snackbar;
  String googleClientId =
      '76953809917-o7bf7c7qbvpu7qglejqe77as5gb609fb.apps.googleusercontent.com';
  String mapsApiKey = '[GCP_API_KEY]';
  String paystackPublicKey =
      'pk_test_ba48887507e3b7e82566b3b5fec96edf38d5007b';
  String appUrl = 'https://eventra-website.liveblog365.com/api/';

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
      if (googleClientId.isEmpty) {
        // We no longer rely on the server's googleClientId for mobile sign-in.
        debugPrint(
          'Server googleClientId is empty, but continuing with native config.',
        );
      }
      await GoogleAuthService.configure(googleClientId);
      isLoaded = true;
    } catch (e) {
      snackbar = e.toString().replaceFirst('Exception: ', '');
    } finally {
      isLoading = false;
      notifyListeners();
    }
  }
}
