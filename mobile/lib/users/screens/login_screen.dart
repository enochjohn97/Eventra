import 'dart:async';
import 'dart:io';
import 'dart:math' as math;
import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/brand_logo.dart';
import '../providers/app_config_provider.dart';
import '../providers/auth_provider.dart';
import '../services/google_auth_service.dart';
import '../utils/checkout_navigation.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen>
    with TickerProviderStateMixin {
  bool _isLoggingIn = false;
  bool _signedIn = false;

  /// One-shot bounce-in when the screen appears…
  late final AnimationController _introController;
  late final Animation<double> _introScale;
  late final Animation<double> _introFade;

  /// …then a continuous, gentle bounce so the mark feels alive and catchy.
  late final AnimationController _bounceController;
  late final Animation<double> _bounce;

  @override
  void initState() {
    super.initState();
    _introController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1100),
    );
    _introScale = Tween<double>(begin: 0.45, end: 1.0).animate(
      CurvedAnimation(parent: _introController, curve: Curves.elasticOut),
    );
    _introFade = CurvedAnimation(
      parent: _introController,
      curve: const Interval(0.0, 0.5, curve: Curves.easeOut),
    );

    _bounceController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1700),
    );
    _bounce = Tween<double>(begin: 0.0, end: -12.0).animate(
      CurvedAnimation(parent: _bounceController, curve: Curves.easeInOut),
    );

    _introController.forward().whenComplete(() {
      if (mounted) _bounceController.repeat(reverse: true);
    });
  }

  @override
  void dispose() {
    _introController.dispose();
    _bounceController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final config = context.watch<AppConfigProvider>();
    final configError = config.snackbar;
    final googleReady = GoogleAuthService.isConfigured;
    final isBusy = auth.isLoading || _isLoggingIn;

    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        children: [
          SafeArea(
            child: Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 420),
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 28),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      // ── Logo + wordmark, dead centre, bouncy ─────────────
                      AnimatedBuilder(
                        animation: Listenable.merge([
                          _introController,
                          _bounceController,
                        ]),
                        builder: (context, child) => Opacity(
                          opacity: _introFade.value,
                          child: Transform.translate(
                            offset: Offset(0, _bounce.value),
                            child: Transform.scale(
                              scale: _introScale.value,
                              child: child,
                            ),
                          ),
                        ),
                        // FittedBox keeps the wide calligraphy lockup inside
                        // narrow screens instead of overflowing the column.
                        child: const FittedBox(
                          fit: BoxFit.scaleDown,
                          child: BrandLogo(size: 76, showWordmark: false),
                        ),
                      ),
                      const SizedBox(height: 18),
                      FadeTransition(
                        opacity: _introFade,
                        child: const Column(
                          children: [
                            Text(
                              '',
                              textAlign: TextAlign.center,
                              style: TextStyle(
                                color: Color(0xFF9CA3AF),
                                fontSize: 14.5,
                                height: 1.4,
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 30),
                      if (auth.sessionExpired ||
                          auth.error != null ||
                          (configError != null && !googleReady)) ...[
                        Text(
                          auth.sessionExpired
                              ? 'Your session expired. Please sign in again.'
                              : auth.error ??
                                    configError ??
                                    'Google Sign-In is unavailable.',
                          textAlign: TextAlign.center,
                          style: const TextStyle(color: Color(0xFFFF8A8A)),
                        ),
                        const SizedBox(height: 16),
                      ],
                      // Google button lifted up closer to the brand block.
                      SizedBox(
                        width: double.infinity,
                        child: isBusy
                            ? Center(
                                child: Platform.isIOS
                                    ? const CupertinoActivityIndicator(
                                        color: Colors.white,
                                      )
                                    : const CircularProgressIndicator(
                                        color: Colors.white,
                                      ),
                              )
                            : _GoogleButton(
                                onPressed: () => _handleLogin(context),
                              ),
                      ),
                      const SizedBox(height: 16),
                      const Text(
                        'By continuing you agree to our Terms & Privacy Policy.',
                        textAlign: TextAlign.center,
                        style: TextStyle(color: Colors.white, fontSize: 14.5),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
          // ── Post-sign-in celebration ─────────────────────────────────────
          if (_signedIn)
            Positioned.fill(
              child: _GoogleSuccessOverlay(
                onDone: () {
                  if (!mounted) return;
                  if (!PendingCheckout.resume(context)) {
                    context.go('/home');
                  }
                },
              ),
            ),
        ],
      ),
    );
  }

  Future<void> _handleLogin(BuildContext context) async {
    final messenger = ScaffoldMessenger.of(context);
    setState(() => _isLoggingIn = true);
    try {
      if (!GoogleAuthService.isConfigured) {
        await GoogleAuthService.configure();
      }
      if (!context.mounted || !GoogleAuthService.isConfigured) return;

      final auth = context.read<AuthProvider>();
      final ok = await auth.signInWithGoogle();
      if (!ok) {
        if (auth.error == null) {
          messenger.showSnackBar(
            const SnackBar(
              content: Text(
                'Google sign-in did not complete. Please try again.',
              ),
            ),
          );
        }
        return;
      }
      if (!mounted) return;
      // Play the success animation, then continue into the app.
      setState(() => _signedIn = true);
    } finally {
      if (mounted) setState(() => _isLoggingIn = false);
    }
  }
}

// ---------------------------------------------------------------------------
// Sign-in success animation: the logo pops in with a bouncy scale, a pulsing
// halo ripples out, and a checkmark draws itself before we move on.
// ---------------------------------------------------------------------------
class _GoogleSuccessOverlay extends StatefulWidget {
  final VoidCallback onDone;
  const _GoogleSuccessOverlay({required this.onDone});

  @override
  State<_GoogleSuccessOverlay> createState() => _GoogleSuccessOverlayState();
}

class _GoogleSuccessOverlayState extends State<_GoogleSuccessOverlay>
    with TickerProviderStateMixin {
  late final AnimationController _main;
  late final AnimationController _halo;
  late final AnimationController _check;
  late final Animation<double> _logoScale;
  late final Animation<double> _contentFade;
  Timer? _gotoTimer;

  @override
  void initState() {
    super.initState();
    _main = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1400),
    );
    _logoScale = Tween<double>(
      begin: 0.2,
      end: 1.0,
    ).animate(CurvedAnimation(parent: _main, curve: Curves.elasticOut));
    _contentFade = CurvedAnimation(
      parent: _main,
      curve: const Interval(0.45, 1.0, curve: Curves.easeOut),
    );

    _halo = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1300),
    )..repeat();

    _check = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 620),
    );

    _main.forward();
    Future<void>.delayed(const Duration(milliseconds: 650), () {
      if (mounted) _check.forward();
    });
    // Leave enough time for the whole flourish, then hand back control.
    _gotoTimer = Timer(const Duration(milliseconds: 1750), widget.onDone);
  }

  @override
  void dispose() {
    _gotoTimer?.cancel();
    _main.dispose();
    _halo.dispose();
    _check.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: const BoxDecoration(
        gradient: RadialGradient(
          colors: [Color(0xFF15161C), Color(0xFF000000)],
          radius: 0.9,
        ),
      ),
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            SizedBox(
              width: 200,
              height: 200,
              child: Stack(
                alignment: Alignment.center,
                children: [
                  // Rippling halo rings behind the mark.
                  AnimatedBuilder(
                    animation: _halo,
                    builder: (context, _) {
                      final t = _halo.value;
                      return Opacity(
                        opacity: (1 - t) * 0.55,
                        child: Transform.scale(
                          scale: 0.7 + t * 0.85,
                          child: Container(
                            width: 150,
                            height: 150,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              border: Border.all(
                                color: AppTheme.primary,
                                width: 2,
                              ),
                            ),
                          ),
                        ),
                      );
                    },
                  ),
                  ScaleTransition(
                    scale: _logoScale,
                    child: const BrandLogo(
                      size: 104,
                      showWordmark: false,
                      animateEveryMinute: false,
                    ),
                  ),
                  // Checkmark badge that draws in under the logo.
                  Positioned(
                    bottom: 18,
                    right: 34,
                    child: AnimatedBuilder(
                      animation: _check,
                      builder: (context, _) => Opacity(
                        opacity: _check.value,
                        child: Transform.scale(
                          scale: 0.6 + _check.value * 0.4,
                          child: Container(
                            width: 46,
                            height: 46,
                            decoration: const BoxDecoration(
                              color: Colors.white,
                              shape: BoxShape.circle,
                            ),
                            child: CustomPaint(
                              painter: _CheckPainter(_check.value),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),
            FadeTransition(
              opacity: _contentFade,
              child: const Column(
                children: [
                  Text(
                    'Welcome to EventOut!',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 22,
                      fontWeight: FontWeight.w800,
                      letterSpacing: -0.4,
                    ),
                  ),
                  SizedBox(height: 6),
                  Text(
                    'You\u2019re signed in. Let\u2019s find your next event.',
                    style: TextStyle(color: Color(0xFF9CA3AF), fontSize: 13.5),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Draws a smooth check that reveals left-to-right as [progress] goes 0 → 1.
class _CheckPainter extends CustomPainter {
  final double progress;
  const _CheckPainter(this.progress);

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = AppTheme.primary
      ..style = PaintingStyle.stroke
      ..strokeWidth = 4
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;

    final p1 = Offset(size.width * 0.30, size.height * 0.52);
    final p2 = Offset(size.width * 0.45, size.height * 0.67);
    final p3 = Offset(size.width * 0.72, size.height * 0.34);

    final path = Path()..moveTo(p1.dx, p1.dy);
    if (progress <= 0.4) {
      final t = progress / 0.4;
      path.lineTo(p1.dx + (p2.dx - p1.dx) * t, p1.dy + (p2.dy - p1.dy) * t);
    } else {
      path.lineTo(p2.dx, p2.dy);
      final t = (progress - 0.4) / 0.6;
      path.lineTo(p2.dx + (p3.dx - p2.dx) * t, p2.dy + (p3.dy - p2.dy) * t);
    }
    canvas.drawPath(path, paint);
  }

  @override
  bool shouldRepaint(covariant _CheckPainter oldDelegate) =>
      oldDelegate.progress != progress;
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
    final strokeWidth = size.width * 0.2;

    Paint createPaint(Color color) {
      return Paint()
        ..color = color
        ..style = PaintingStyle.stroke
        ..strokeWidth = strokeWidth
        ..strokeCap = StrokeCap.butt;
    }

    canvas.drawArc(
      rect,
      -math.pi * 0.25,
      math.pi * 0.25,
      false,
      createPaint(const Color(0xFFEA4335)),
    );
    canvas.drawArc(
      rect,
      0,
      math.pi * 0.3,
      false,
      createPaint(const Color(0xFF4285F4)),
    );
    canvas.drawArc(
      rect,
      math.pi * 0.3,
      math.pi * 0.45,
      false,
      createPaint(const Color(0xFF34A853)),
    );
    canvas.drawArc(
      rect,
      math.pi * 0.75,
      math.pi * 1.0,
      false,
      createPaint(const Color(0xFFFBBC05)),
    );

    final barPaint = Paint()..color = const Color(0xFF4285F4);
    canvas.drawRect(
      Rect.fromLTRB(cx, cy - strokeWidth / 2, cx + r, cy + strokeWidth / 2),
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
            borderRadius: BorderRadius.circular(14),
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
                  fontWeight: FontWeight.w700,
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
        elevation: 2,
        padding: const EdgeInsets.symmetric(vertical: 16),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
      child: const Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          logo,
          SizedBox(width: 10),
          Text(
            'Continue with Google',
            style: TextStyle(fontWeight: FontWeight.w700),
          ),
        ],
      ),
    );
  }
}
