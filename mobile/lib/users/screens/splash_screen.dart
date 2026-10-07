import 'dart:async';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../core/config/app_config.dart';
import '../../core/network/endpoint_resolver.dart';
import '../providers/app_config_provider.dart';
import '../providers/auth_provider.dart';

// Global key so boot-time snackbars can be shown right after navigation
// without needing a specific BuildContext.
final GlobalKey<ScaffoldMessengerState> scaffoldMessengerKey =
    GlobalKey<ScaffoldMessengerState>();

class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> {
  bool _bootStarted = false;

  @override
  void initState() {
    super.initState();
    // The hosting anti-bot challenge is solved natively inside ApiClient
    // (HostChallenge), so there is no longer a WebView cookie-bypass step to
    // wait for — boot immediately.
    _startBoot();
  }

  void _startBoot() {
    if (_bootStarted) return;
    _bootStarted = true;
    _boot();
  }

  Future<void> _boot() async {
    // Discover whether the live host or a local dev server serves the API
    // before any provider hits the network.
    try {
      await EndpointResolver.resolve()
          .timeout(const Duration(seconds: 20));
    } catch (_) {}
    if (!mounted) return;

    final config = context.read<AppConfigProvider>();
    final auth = context.read<AuthProvider>();
    try {
      await config.load().timeout(const Duration(seconds: 8));
    } catch (_) {}
    if (!mounted) return;
    try {
      await auth.bootstrap().timeout(const Duration(seconds: 8));
    } catch (_) {
      auth.status = AuthStatus.unauthenticated;
    }
    if (!mounted) return;

    final prefs = await SharedPreferences.getInstance();
    if (!mounted) return;

    final onboardingDone = prefs.getBool(AppConfig.onboardingKey) ?? false;

    if (!onboardingDone) {
      context.go('/welcome');
      return;
    }
    if (auth.status == AuthStatus.authenticated) {
      context.go('/home');
    } else if (auth.status == AuthStatus.profileIncomplete) {
      context.go('/profile-complete');
    } else {
      // Distinguish a real expiry from a fresh install: the API client has
      // already attempted silent Google re-auth before we get here.
      final message = auth.sessionExpired
          ? 'Your session expired. Please sign in again.'
          : null;
      context.go('/login');
      if (message != null) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          scaffoldMessengerKey.currentState?.showSnackBar(
            SnackBar(content: Text(message)),
          );
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        width: double.infinity,
        color: Colors.white,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Image.asset(
              'assets/images/logo-wordmark.svg',
              width: 112,
              height: 112,
              fit: BoxFit.contain,
            ),
            const SizedBox(height: 14),
            RichText(
              text: const TextSpan(
                text: 'venOut',
                style: TextStyle(
                  color: Color(0xFF101A2E),
                  fontSize: 34,
                  fontWeight: FontWeight.w800,
                  letterSpacing: -1,
                ),
              ),
            ),
            const SizedBox(height: 28),
            const CircularProgressIndicator(color: Color(0xFFFF5A5F)),
          ],
        ),
      ),
    );
  }
}
