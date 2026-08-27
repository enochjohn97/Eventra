import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import 'core/theme/app_theme.dart';
import 'core/network/api_client.dart';
import 'users/providers/app_config_provider.dart';
import 'users/providers/auth_provider.dart';
import 'users/providers/events_provider.dart';
import 'users/providers/favorites_provider.dart';
import 'users/providers/tickets_provider.dart';
import 'users/routing/user_router.dart';
import 'users/services/google_auth_service.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  
  if (kDebugMode) {
    debugPrint('\n======================================================');
    debugPrint('This will NOT work on a physical device. Ensure you are on an Android Emulator.');
    debugPrint('======================================================\n');
  }

  ApiClient();
  runApp(const EventraUserApp());
}

class EventraUserApp extends StatefulWidget {
  const EventraUserApp({super.key});

  @override
  State<EventraUserApp> createState() => _EventraUserAppState();
}

class _EventraUserAppState extends State<EventraUserApp> {
  late final AuthProvider _authProvider;
  late final GoRouter _router;
  late final AppConfigProvider _configProvider;

  @override
  void initState() {
    super.initState();
    _authProvider = AuthProvider();
    _router = createUserRouter(_authProvider);
    _configProvider = AppConfigProvider();
    
    // Pre-load network handshakes sequentially without blocking UI
    _initializeAuthAndConfig();
  }

  Future<void> _initializeAuthAndConfig() async {
    try {
      await _configProvider.load();
      await GoogleAuthService.configure(_configProvider.googleClientId);
      // signInSilently() removed – Google sign-in only triggers on button press.
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider.value(value: _configProvider),
        ChangeNotifierProvider.value(value: _authProvider),
        ChangeNotifierProvider(create: (_) => EventsProvider()),
        ChangeNotifierProvider(create: (_) => FavoritesProvider()),
        ChangeNotifierProvider(create: (_) => TicketsProvider()),
      ],
      child: MaterialApp.router(
        title: 'Eventra',
        debugShowCheckedModeBanner: false,
        theme: AppTheme.lightTheme,
        routerConfig: _router,
      ),
    );
  }
}

// Alias export for main_user.dart
typedef UserApp = EventraUserApp;
