

class AppConfig {

  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'https://eventra-xka9.onrender.com/api',
  );

  static const String appName = 'Eventra';

  static const onboardingKey = 'onboarding_complete';
}
