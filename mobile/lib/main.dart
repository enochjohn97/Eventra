// ignore_for_file: use_build_context_synchronously

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import 'core/theme/app_theme.dart';
import 'core/network/api_client.dart';
import 'core/network/endpoint_resolver.dart';
import 'users/providers/app_config_provider.dart';
import 'users/providers/auth_provider.dart';
import 'users/providers/events_provider.dart';
import 'users/providers/favorites_provider.dart';
import 'users/providers/tickets_provider.dart';
import 'users/routing/user_router.dart';
import 'users/screens/splash_screen.dart';
import 'users/services/google_auth_service.dart';void main() {
  WidgetsFlutterBinding.ensureInitialized();

  ApiClient();
  // Discover the API origin (live host vs local dev server) in the background
  // while the first frame renders; splash awaits the same future before any
  // provider hits the network.
  // Using --dart-define=API_BASE_URL=<LAN-IP>:8000 to target local PHP server.
  // On a physical phone, use the computer's current Wi-Fi IPv4 address, not
  // the router address. If omitted or stale, EndpointResolver searches the
  // phone's private subnet for the local PHP API.
  EndpointResolver.resolve().then((resolved) {
    if (!resolved) {
      runApp(const _LocalDevHintApp());
    }
  });
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

    _initializeAuthAndConfig();
  }

  Future<void> _initializeAuthAndConfig() async {
    // Never race the endpoint probe: config.load() must hit the origin that
    // EndpointResolver settles on.
    try {
      await EndpointResolver.resolve().timeout(const Duration(seconds: 20));
    } catch (_) {}
    try {
      await GoogleAuthService.configure();
    } catch (_) {}
    try {
      await _configProvider.load();
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
        title: 'EventOut',
        debugShowCheckedModeBanner: false,
        theme: AppTheme.lightTheme,
        routerConfig: _router,
        scaffoldMessengerKey: scaffoldMessengerKey,
      ),
    );
  }
}

class _LocalDevHintApp extends StatelessWidget {
  const _LocalDevHintApp();

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'EventOut',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        brightness: Brightness.light,
        colorScheme: const ColorScheme.light(
          surface: Color(0xFFF5F5DC),
          primary: Color(0xFFB91C1C),
          onSurface: Color(0xFF111827),
        ),
        scaffoldBackgroundColor: const Color(0xFFF5F5DC),
      ),      home: Scaffold(
        appBar: AppBar(
          title: const Text('EventOut'),
        ),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,              children: [
              const Icon(Icons.cloud_off, size: 48, color: Color(0xFFB91C1C)),
              const SizedBox(height: 20),
              const Text(
                "Can't find the PHP API on this Wi-Fi network.",
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 22, fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 12),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 24),
                child: const Text(
                  "Keep the phone and computer on the same Wi-Fi. If you set "
                  "API_BASE_URL, use the computer's IPv4 address, not the "
                  "router address (often 192.168.1.1).",
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Color(0xFF666666), fontSize: 16),
                ),
              ),

              const SizedBox(height: 24),
              ElevatedButton(
                onPressed: () {
                  EndpointResolver.resolve(force: true).then((ok) {
                    if (ok) {
                      Navigator.of(context).pushReplacement(
                        MaterialPageRoute(
                          builder: (_) => const SplashScreen(),
                        ),
                      );
                    }
                  });
                },
                style: ElevatedButton.styleFrom(
                  minimumSize: const Size.fromHeight(48),
                ),
                child: const Text('Retry'),
              ),
            ],
          ),
        ),
        ),
        drawer: const Drawer(
          child: Column(
            children: [
              ListTile(
                leading: Icon(Icons.info_outline),
                title: Text('Local dev server'),
                subtitle: Text('php -S 0.0.0.0:8000 server/index.php'),
              ),
            ],
          ),            ),
        ),
    );
  }
}

// Alias export for main_user.dart
typedef UserApp = EventraUserApp;
