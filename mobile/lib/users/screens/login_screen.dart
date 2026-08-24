import 'dart:io';
import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../../core/theme/app_theme.dart';
import '../providers/app_config_provider.dart';
import '../providers/auth_provider.dart';
import '../services/google_auth_service.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final config = context.read<AppConfigProvider>();
      if (!config.isLoaded) config.load();
    });
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final config = context.watch<AppConfigProvider>();
    final configError = config.snackbar;
    final googleReady = GoogleAuthService.isConfigured;
    final isBusy = auth.isLoading || config.isLoading;

    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Spacer(flex: 1),
              Container(
                width: 64,
                height: 64,
                decoration: BoxDecoration(
                  color: AppTheme.primary.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(16),
                ),
                child: const Icon(
                  Icons.celebration_rounded,
                  color: AppTheme.primary,
                  size: 36,
                ),
              ),
              const SizedBox(height: 24),
              const Text(
                'Welcome to Eventra',
                style: TextStyle(fontSize: 28, fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 8),
              const Text(
                'Sign in to discover events, save favorites, and get tickets.',
                style: TextStyle(color: AppTheme.textMuted, height: 1.4),
              ),
              const Spacer(flex: 2),
              if (auth.error != null ||
                  (configError != null && !googleReady)) ...[
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: AppTheme.error.withValues(alpha: 0.08),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text(
                    auth.error ??
                        configError ??
                        'Google Sign-In is unavailable.',
                    style: const TextStyle(color: AppTheme.error),
                  ),
                ),
                const SizedBox(height: 12),
              ],
              SizedBox(
                width: double.infinity,
                child: isBusy
                    ? Center(
                        child: Platform.isIOS
                            ? const CupertinoActivityIndicator()
                            : const CircularProgressIndicator(),
                      )
                    : _GoogleButton(
                        onPressed: googleReady
                            ? () => _handleLogin(context)
                            : () => _retryConfig(context),
                      ),
              ),
              const SizedBox(height: 16),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _retryConfig(BuildContext context) async {
    await context.read<AppConfigProvider>().load(force: true);
  }

  Future<void> _handleLogin(BuildContext context) async {
    final config = context.read<AppConfigProvider>();
    // Trigger load if not loaded, but don't await it so we don't block the Google Sign-In native UI
    if (!config.isLoaded && !config.isLoading) {
      config.load();
    }
    if (!GoogleAuthService.isConfigured) {
      await GoogleAuthService.configure();
    }
    if (!context.mounted || !GoogleAuthService.isConfigured) return;

    final auth = context.read<AuthProvider>();
    final ok = await auth.signInWithGoogle();
    if (!context.mounted) return;
    if (!ok) return;
    if (auth.status == AuthStatus.profileIncomplete) {
      context.go('/profile-complete');
    } else {
      context.go('/home');
    }
  }
}

class _GoogleButton extends StatelessWidget {
  final VoidCallback onPressed;
  const _GoogleButton({required this.onPressed});

  static const _googleLogoUrl =
      'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c1/Google_%22G%22_logo.svg/120px-Google_%22G%22_logo.svg.png';

  @override
  Widget build(BuildContext context) {
    final logo = Image.network(
      _googleLogoUrl,
      width: 20,
      height: 20,
      fit: BoxFit.contain,
    );

    if (Platform.isIOS) {
      return CupertinoButton(
        padding: EdgeInsets.zero,
        onPressed: onPressed,
        child: Container(
          height: 52,
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: Colors.grey.shade300),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              logo,
              const SizedBox(width: 10),
              const Text(
                'Continue with Google',
                style: TextStyle(
                  color: AppTheme.textMain,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ),
      );
    }
    return ElevatedButton(
      onPressed: onPressed,
      style: ElevatedButton.styleFrom(
        backgroundColor: Colors.white,
        foregroundColor: AppTheme.textMain,
        elevation: 1,
        padding: const EdgeInsets.symmetric(vertical: 14),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          logo,
          const SizedBox(width: 10),
          const Text(
            'Continue with Google',
            style: TextStyle(fontWeight: FontWeight.w600),
          ),
        ],
      ),
    );
  }
}
