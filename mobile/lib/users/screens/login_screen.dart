import 'dart:io';
import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../../core/theme/app_theme.dart';
import '../providers/auth_provider.dart';

class LoginScreen extends StatelessWidget {
  const LoginScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();

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
                child: const Icon(Icons.celebration_rounded, color: AppTheme.primary, size: 36),
              ),
              const SizedBox(height: 24),
              const Text('Welcome to Eventra', style: TextStyle(fontSize: 28, fontWeight: FontWeight.w800)),
              const SizedBox(height: 8),
              const Text(
                'Sign in to discover events, save favorites, and get tickets.',
                style: TextStyle(color: AppTheme.textMuted, height: 1.4),
              ),
              const Spacer(flex: 2),
              if (auth.error != null) ...[
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: AppTheme.error.withValues(alpha: 0.08),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text(auth.error!, style: const TextStyle(color: AppTheme.error)),
                ),
                const SizedBox(height: 12),
              ],
              SizedBox(
                width: double.infinity,
                child: auth.isLoading
                    ? Center(child: Platform.isIOS ? const CupertinoActivityIndicator() : const CircularProgressIndicator())
                    : _GoogleButton(onPressed: () => _handleLogin(context)),
              ),
              const SizedBox(height: 16),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _handleLogin(BuildContext context) async {
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

  @override
  Widget build(BuildContext context) {
    if (Platform.isIOS) {
      return CupertinoButton(
        padding: EdgeInsets.zero,
        onPressed: onPressed,
        child: Container(
          height: 52,
          decoration: BoxDecoration(
            color: Colors.black,
            borderRadius: BorderRadius.circular(12),
          ),
          child: const Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(CupertinoIcons.globe, color: Colors.white),
              SizedBox(width: 10),
              Text('Continue with Google', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w600)),
            ],
          ),
        ),
      );
    }
    return ElevatedButton.icon(
      onPressed: onPressed,
      icon: const Icon(Icons.g_mobiledata, size: 28),
      label: const Text('Continue with Google'),
      style: ElevatedButton.styleFrom(backgroundColor: Colors.white, foregroundColor: AppTheme.textMain, elevation: 1),
    );
  }
}
