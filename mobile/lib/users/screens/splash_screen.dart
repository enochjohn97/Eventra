import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../core/config/app_config.dart';
import '../../core/theme/app_theme.dart';
import '../providers/app_config_provider.dart';
import '../providers/auth_provider.dart';

class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> {
  @override
  void initState() {
    super.initState();
    _boot();
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
      body: Container(
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
              style: TextStyle(color: Colors.white, fontSize: 32, fontWeight: FontWeight.w800),
            ),
            SizedBox(height: 24),
            CircularProgressIndicator(color: Colors.white),
          ],
        ),
      ),
    );
  }
}
