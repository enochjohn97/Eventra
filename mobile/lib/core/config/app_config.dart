import 'package:flutter/foundation.dart';

/// App configuration loaded via --dart-define at build time.
class AppConfig {
  /// API base URL including /api suffix.
  /// Default is the production backend URL.
  /// To use the emulator, pass: --dart-define=API_BASE_URL=http://10.0.2.2:8000/api
  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'https://eventra-website.liveblog365.com/api',
  );

  static const String appName = 'Eventra';

  static const onboardingKey = 'onboarding_complete';
}
