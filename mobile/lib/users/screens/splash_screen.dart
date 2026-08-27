import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:webview_flutter/webview_flutter.dart';
import '../../core/config/app_config.dart';
import '../../core/network/api_client.dart';
import '../../core/theme/app_theme.dart';
import '../providers/app_config_provider.dart';
import '../providers/auth_provider.dart';

class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> {
  late final WebViewController _webViewController;
  bool _bypassed = false;
  Timer? _bypassTimeout;

  @override
  void initState() {
    super.initState();
    _initBypass();
  }

  void _initBypass() {
    if (kDebugMode) {
      _boot();
      return;
    }

    _webViewController = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setNavigationDelegate(
        NavigationDelegate(
          onPageFinished: (String url) async {
            if (_bypassed) return;
            try {
              final cookies = await _webViewController
                  .runJavaScriptReturningResult('document.cookie');
              final cookieStr = cookies.toString().replaceAll('"', '');
              if (cookieStr.contains('__test=')) {
                _bypassed = true;
                _bypassTimeout?.cancel();

                // Extract only the __test cookie from all cookies
                final parts = cookieStr.split(';');
                final testCookie = parts.firstWhere(
                  (p) => p.trim().startsWith('__test='),
                  orElse: () => '',
                );
                if (testCookie.isNotEmpty) {
                  ApiClient().setBypassCookie(testCookie.trim());
                }

                _boot();
              }
            } catch (_) {}
          },
        ),
      );

    _bypassTimeout = Timer(const Duration(seconds: 8), () {
      if (!_bypassed) {
        _bypassed = true;
        _boot();
      }
    });
  }

  @override
  void dispose() {
    _bypassTimeout?.cancel();
    super.dispose();
  }

  Future<void> _boot() async {
    final config = context.read<AppConfigProvider>();
    final auth = context.read<AuthProvider>();
    await config.load();
    await auth.bootstrap();
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
      context.go('/login');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Stack(
        children: [
          Positioned(
            top: 0,
            left: 0,
            width: 1,
            height: 1,
            child: Opacity(
              opacity: 0.01,
              child: WebViewWidget(controller: _webViewController),
            ),
          ),

          Container(
            width: double.infinity,
            decoration: const BoxDecoration(
              gradient: LinearGradient(
                colors: [AppTheme.primary, AppTheme.primaryDark],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
            ),
            child: const Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(Icons.celebration_rounded, size: 72, color: Colors.white),
                SizedBox(height: 16),
                Text(
                  AppConfig.appName,
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 32,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                SizedBox(height: 24),
                CircularProgressIndicator(color: Colors.white),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
