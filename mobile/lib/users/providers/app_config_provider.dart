import 'package:flutter/foundation.dart';
import '../services/app_config_service.dart';
import '../services/google_auth_service.dart';

class AppConfigProvider extends ChangeNotifier {
  bool isLoaded = false;
  bool isLoading = false;
  String? error;
  String googleClientId = '';
  String mapsApiKey = '';
  String paystackPublicKey = '';
  String appUrl = '';

  Future<void> load() async {
    if (isLoaded || isLoading) return;
    isLoading = true;
    notifyListeners();
    try {
      final config = await AppConfigService.load();
      googleClientId = config.googleClientId;
      mapsApiKey = config.mapsApiKey;
      paystackPublicKey = config.paystackPublicKey;
      appUrl = config.appUrl;
      if (googleClientId.isNotEmpty) {
        await GoogleAuthService.configure(serverClientId: googleClientId);
      }
      isLoaded = true;
    } catch (e) {
      error = e.toString().replaceFirst('Exception: ', '');
    } finally {
      isLoading = false;
      notifyListeners();
    }
  }
}
