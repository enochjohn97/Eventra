import 'package:flutter/foundation.dart';
import '../../core/network/api_client.dart';
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

  Future<void> load({bool force = false}) async {
    if ((isLoaded && !force) || isLoading) return;
    isLoading = true;
    error = null;
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
        error = 'Google Client ID is not configured on the server.';
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
