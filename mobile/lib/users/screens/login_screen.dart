import 'dart:io';
import 'dart:math' as math;
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
  bool _isLoggingIn = false;

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final config = context.watch<AppConfigProvider>();
    final configError = config.snackbar;
    final googleReady = GoogleAuthService.isConfigured;
    final isBusy = auth.isLoading || _isLoggingIn;

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
                        onPressed: () => _handleLogin(context),
                      ),
              ),
              const SizedBox(height: 16),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _handleLogin(BuildContext context) async {
    setState(() => _isLoggingIn = true);
    try {
      final config = context.read<AppConfigProvider>();
      if (!config.isLoaded) {
        await config.load();
      }
      if (!GoogleAuthService.isConfigured) {
        await GoogleAuthService.configure(config.googleClientId);
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
    } finally {
      if (mounted) setState(() => _isLoggingIn = false);
    }
  }
}

// ---------------------------------------------------------------------------
// Inline Google 'G' logo — drawn with CustomPainter, no network required.
// ---------------------------------------------------------------------------
class _GoogleLogo extends StatelessWidget {
  final double size;
  const _GoogleLogo({this.size = 20});

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: size,
      height: size,
      child: CustomPaint(painter: _GoogleLogoPainter()),
    );
  }
}

class _GoogleLogoPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final cx = size.width / 2;
    final cy = size.height / 2;
    final r = size.width / 2;
    final rect = Rect.fromCircle(center: Offset(cx, cy), radius: r);

    // Red segment  (315° → 45°  i.e. top-right quarter + a bit)
    canvas.drawArc(rect, -math.pi * 0.25, math.pi * 0.75,
        true, Paint()..color = const Color(0xFFEA4335));  // Google Red
    // Blue segment (45° → 165°)
    canvas.drawArc(rect, math.pi * 0.25, math.pi * 0.667,
        true, Paint()..color = const Color(0xFF4285F4));  // Google Blue
    // Green segment (165° → 255°)
    canvas.drawArc(rect, math.pi * 0.917, math.pi * 0.5,
        true, Paint()..color = const Color(0xFF34A853));  // Google Green
    // Yellow segment (255° → 315°)
    canvas.drawArc(rect, math.pi * 1.417, math.pi * 0.333,
        true, Paint()..color = const Color(0xFFFBBC05));  // Google Yellow

    // White inner circle (donut hole)
    canvas.drawCircle(
      Offset(cx, cy),
      r * 0.58,
      Paint()..color = Colors.white,
    );

    // White bar for the crossbar of the 'G'
    final barPaint = Paint()..color = const Color(0xFF4285F4);
    canvas.drawRect(
      Rect.fromLTRB(cx, cy - r * 0.2, cx + r, cy + r * 0.2),
      barPaint,
    );
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class _GoogleButton extends StatelessWidget {
  final VoidCallback onPressed;
  const _GoogleButton({required this.onPressed});

  @override
  Widget build(BuildContext context) {
    const logo = _GoogleLogo(size: 20);

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
          child: const Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              logo,
              SizedBox(width: 10),
              Text(
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
      child: const Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          logo,
          SizedBox(width: 10),
          Text(
            'Continue with Google',
            style: TextStyle(fontWeight: FontWeight.w600),
          ),
        ],
      ),
    );
  }
}

