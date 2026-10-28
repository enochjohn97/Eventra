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
import 'users/services/google_auth_service.dart';

// ── Real push notifications (FCM + APNs) ────────────────────────────────────
import 'dart:async' show unawaited;
import 'dart:io' show Platform;
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:app_links/app_links.dart';

/// Entry point Firebase calls when a push arrives while the app is in the
/// background. For notification-payload messages the OS already renders the
/// system banner, so there is nothing to do here — but the handler must exist
/// (and be top-level / static) for Firebase to deliver background events.
@pragma('vm:entry-point')
Future<void> _firebaseBackgroundHandler(RemoteMessage message) async {
  // Intentionally no-op: the system tray draws the banner; tap handling is
  // done on the main isolate via getInitialMessage()/onMessageOpenedApp.
}

/// Sets up real system push notifications and owns the "tap → open event"
/// deep-link state shared between the message handlers and the UI.
///
/// Design notes:
///  * Everything is best-effort and guarded: a missing/placeholder Firebase
///    config must NEVER break the app — push simply stays off.
///  * Foreground messages are not auto-displayed by FCM, so we render them
///    through flutter_local_notifications as a real system banner.
///  * A tapped notification carries `event_id`; we stash it so the home shell
///    can open that event whether the app was cold-launched or already running.
class PushNotifications {
  PushNotifications._();

  static final FlutterLocalNotificationsPlugin _local =
      FlutterLocalNotificationsPlugin();
  static bool _initialized = false;

  /// Event the user tapped a push notification for. Set by any handler,
  /// consumed once by the home shell, then reset to null.
  static final ValueNotifier<int?> pendingEventId = ValueNotifier<int?>(null);

  /// Channel FCM uses for event alerts (must match the Android manifest and
  /// the server-side `channel_id`).
  static const AndroidNotificationChannel eventChannel =
      AndroidNotificationChannel(
    'event_published',
    'Event publications',
    description: 'Alerts when a new event is published',
    importance: Importance.high,
  );

  static Future<void> init() async {
    if (_initialized) return;
    try {
      await Firebase.initializeApp();
      FirebaseMessaging.onBackgroundMessage(_firebaseBackgroundHandler);

      await _local.initialize(
        const InitializationSettings(
          android: AndroidInitializationSettings('@mipmap/ic_launcher'),
          iOS: DarwinInitializationSettings(),
        ),
        onDidReceiveNotificationResponse: _onLocalNotificationTap,
      );
      // Android 8+ requires the channel to exist before anything can show.
      await _local
          .resolvePlatformSpecificImplementation<
              AndroidFlutterLocalNotificationsPlugin>()
          ?.createNotificationChannel(eventChannel);

      final messaging = FirebaseMessaging.instance;
      await messaging.requestPermission(
        alert: true,
        badge: true,
        sound: true,
      );

      // Foreground: render a system banner ourselves.
      FirebaseMessaging.onMessage.listen(_onForegroundMessage);

      // Tap on a background notification (app kept alive) → open the event.
      FirebaseMessaging.onMessageOpenedApp.listen(_onMessageOpened);

      // Tap on a notification that cold-launched the app → open the event.
      final initial = await messaging.getInitialMessage();
      if (initial != null) _onMessageOpened(initial);

      // Register this device so publishes can reach it (now + on rotation).
      final token = await messaging.getToken();
      if (token != null) unawaited(_uploadToken(token));
      messaging.onTokenRefresh.listen(_uploadToken);

      // Deep link from the web popup — isolated so a failure here can't
      // disable push notifications (and vice versa).
      try {
        await _initDeepLinks();
      } catch (e) {
        debugPrint('Deep link init skipped: $e');
      }

      _initialized = true;
    } catch (e) {
      // Misconfigured/absent Firebase — keep the rest of the app working.
      debugPrint('Push notifications disabled (Firebase init): $e');
    }
  }

  static void _onForegroundMessage(RemoteMessage message) {
    final n = message.notification;
    if (n == null) return;
    _local.show(
      n.hashCode,
      n.title ?? 'EventOut',
      n.body ?? '',
      const NotificationDetails(
        android: AndroidNotificationDetails(
          'event_published',
          'Event publications',
          importance: Importance.high,
          priority: Priority.high,
        ),
        iOS: DarwinNotificationDetails(),
      ),
      payload: '${message.data['event_id'] ?? ''}',
    );
  }

  static void _onMessageOpened(RemoteMessage message) {
    _claimEvent(message.data['event_id']?.toString());
  }

  static void _onLocalNotificationTap(NotificationResponse response) {
    _claimEvent(response.payload);
  }

  static void _claimEvent(String? rawId) {
    final id = int.tryParse((rawId ?? '').trim());
    if (id != null && id > 0) pendingEventId.value = id;
  }

  /// Handles `eventout://event?id=N` deep links from the web "View Event"
  /// popup — both on cold start and while the app is already running. Feeds
  /// [pendingEventId], which the home shell already consumes to open the event.
  static Future<void> _initDeepLinks() async {
    final appLinks = AppLinks();
    final initial = await appLinks.getInitialLink();
    if (initial != null) _claimFromDeepLink(initial);
    appLinks.uriLinkStream.listen(_claimFromDeepLink);
  }

  static void _claimFromDeepLink(Uri? uri) {
    if (uri == null || uri.scheme != 'eventout') return;
    _claimEvent(uri.queryParameters['id']);
  }

  /// Registers the FCM token against the signed-in account via the existing
  /// heartbeat endpoint (which upserts into device_push_tokens).
  static Future<void> _uploadToken(String token) async {
    try {
      await ApiClient().dio.post(
        '/users/heartbeat',
        data: {
          'device_token': token,
          'platform': Platform.isIOS ? 'ios' : 'android',
          'device_name': Platform.isIOS ? 'iOS' : 'Android',
          'app_version': const String.fromEnvironment(
            'APP_VERSION',
            defaultValue: '1.0.0',
          ),
        },
      );
    } catch (_) {
      // Best-effort: retried on the next onTokenRefresh / app start.
    }
  }
}

void main() {
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
    // Start push after the API origin is resolved so the token upload (and any
    // later publish push) targets the right host. Never blocks app startup.
    try {
      await PushNotifications.init();
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
                "Couldn't connect to the server.",
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 22, fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 12),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 24),
                child: const Text(
                  "Please check your internet connection and try again later.",
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
