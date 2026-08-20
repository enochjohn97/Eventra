/// App configuration loaded via --dart-define at build time.
class AppConfig {
  /// API base URL including /api suffix.
  /// Android emulator: http://10.0.2.2/api
  /// iOS simulator: http://127.0.0.1:8000/api
  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'https://eventra-website.liveblog365.com/api',
  );

  static const String appName = 'Eventra';

  static const onboardingKey = 'onboarding_complete';
}
