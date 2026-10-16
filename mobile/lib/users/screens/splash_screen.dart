// ignore_for_file: depend_on_referenced_packages

import 'dart:async';
import 'dart:io';
import 'dart:math' as math;
import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../../core/network/endpoint_resolver.dart';
import '../../core/theme/app_theme.dart';
import '../providers/app_config_provider.dart';
import '../providers/auth_provider.dart';
import '../services/google_auth_service.dart';
import '../utils/checkout_navigation.dart';

// Global key so boot-time snackbars can be shown right after navigation
// without needing a specific BuildContext.
final GlobalKey<ScaffoldMessengerState> scaffoldMessengerKey =
    GlobalKey<ScaffoldMessengerState>();

class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen>
    with TickerProviderStateMixin {
  bool _bootStarted = false;
  bool _signedIn = false;
  bool _isSigningIn = false;

  /// 3-second springy entrance for the complete EventOut wordmark.
  late final AnimationController _entryController;
  late final Animation<double> _entryScale;
  late final Animation<double> _entryFade;

  /// Gentle idle float once the entrance is done, so it never looks frozen.
  late final AnimationController _floatController;
  late final Animation<double> _float;

  /// Reveals the subtitle and action row after the wordmark entrance.
  late final AnimationController _revealController;
  late final Animation<double> _subtitleIn;
  late final Animation<double> _buttonIn;

  Timer? _subtitleTimer;
  int _subtitleIndex = 0;

  static const _subtitles = [
    'Discover unforgettable events near you.',
    'Make plans, meet people, make memories.',
    'Your next great experience starts here.',
  ];

  @override
  void initState() {
    super.initState();

    _entryController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 3000),
    );
    _entryScale = Tween<double>(begin: 0.72, end: 1.0).animate(
      CurvedAnimation(parent: _entryController, curve: Curves.elasticOut),
    );
    _entryFade = CurvedAnimation(
      parent: _entryController,
      curve: const Interval(0.0, 0.7, curve: Curves.easeOut),
    );

    _floatController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1900),
    );
    _float = Tween<double>(begin: 0.0, end: -10.0).animate(
      CurvedAnimation(parent: _floatController, curve: Curves.easeInOut),
    );

    _revealController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1100),
    );
    _subtitleIn = CurvedAnimation(
      parent: _revealController,
      curve: const Interval(0.18, 0.75, curve: Curves.easeOutCubic),
    );
    _buttonIn = CurvedAnimation(
      parent: _revealController,
      curve: const Interval(0.45, 1.0, curve: Curves.easeOutCubic),
    );

    // The hosting anti-bot challenge is solved natively inside ApiClient
    // (HostChallenge), so there is no WebView cookie-bypass step to wait for —
    // boot immediately so a signed-in user never sees the intro twice.
    _startBoot();

    // The complete EventOut wordmark takes the stage first for three seconds…
    _entryController.forward().whenComplete(() {
      if (!mounted) return;
      _floatController.repeat(reverse: true);
      // …then the subtitle and button glide in.
      _revealController.forward();
      _subtitleTimer = Timer.periodic(const Duration(seconds: 4), (_) {
        if (mounted) {
          setState(
            () => _subtitleIndex = (_subtitleIndex + 1) % _subtitles.length,
          );
        }
      });
    });
  }

  void _startBoot() {
    if (_bootStarted) return;
    _bootStarted = true;
    _boot();
  }

  Future<void> _handleLogin(BuildContext context) async {
    if (_isSigningIn || _signedIn) return;
    final messenger = ScaffoldMessenger.of(context);
    setState(() => _isSigningIn = true);
    try {
      if (!GoogleAuthService.isConfigured) {
        await GoogleAuthService.configure();
      }
      if (!mounted || !context.mounted) return;
      if (!GoogleAuthService.isConfigured) {
        messenger.showSnackBar(
          const SnackBar(content: Text('Google sign-in is unavailable.')),
        );
        return;
      }

      final auth = context.read<AuthProvider>();
      final ok = await auth.signInWithGoogle();
      if (!mounted) return;
      if (!ok ||
          (auth.status != AuthStatus.authenticated &&
              auth.status != AuthStatus.profileIncomplete)) {
        // A dismissed chooser is a quiet cancellation. Real errors are
        // already exposed through AuthProvider and the splash error message.
        return;
      }

      // The provider only returns true after the Google credential has been
      // exchanged for a valid EventOut session.
      setState(() => _signedIn = true);
    } catch (_) {
      if (mounted) {
        messenger.showSnackBar(
          const SnackBar(
            content: Text('Google sign-in could not start. Please try again.'),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _isSigningIn = false);
    }
  }

  Future<void> _boot() async {
    // Discover whether the live host or a local dev server serves the API
    // before any provider hits the network.
    try {
      await EndpointResolver.resolve().timeout(const Duration(seconds: 20));
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

    if (auth.status == AuthStatus.authenticated ||
        auth.status == AuthStatus.profileIncomplete) {
      context.go('/home');
    }
  }

  @override
  void dispose() {
    _subtitleTimer?.cancel();
    _entryController.dispose();
    _floatController.dispose();
    _revealController.dispose();
    super.dispose();
  }

  Widget _brandLockup() {
    return AnimatedBuilder(
      animation: Listenable.merge([_entryController, _floatController]),
      builder: (context, child) => Opacity(
        opacity: _entryFade.value,
        child: Transform.translate(
          offset: Offset(0, _float.value),
          child: Transform.scale(scale: _entryScale.value, child: child),
        ),
      ),
      child: const _EventOutLockup(size: 48),
    );
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final config = context.watch<AppConfigProvider>();
    final configError = config.snackbar;
    final googleReady = GoogleAuthService.isConfigured;
    final isBusy = auth.isLoading || _isSigningIn;

    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        children: [
          SafeArea(
            child: Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 420),
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(28, 24, 28, 18),
                  child: Column(
                    children: [
                      Expanded(
                        child: Center(
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              _brandLockup(),
                              const SizedBox(height: 30),
                              FadeTransition(
                                opacity: _subtitleIn,
                                child: Text(
                                  _subtitles[_subtitleIndex],
                                  textAlign: TextAlign.center,
                                  style: const TextStyle(
                                    color: Color(0xFF9CA3AF),
                                    fontSize: 14.5,
                                    height: 1.4,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ),
                              if (auth.sessionExpired ||
                                  auth.error != null ||
                                  (configError != null && !googleReady)) ...[
                                const SizedBox(height: 18),
                                Text(
                                  auth.sessionExpired
                                      ? 'Your session expired. Please sign in again.'
                                      : auth.error ??
                                            configError ??
                                            'Google Sign-In is unavailable.',
                                  textAlign: TextAlign.center,
                                  style: const TextStyle(
                                    color: Color(0xFFFF8A8A),
                                  ),
                                ),
                              ],
                            ],
                          ),
                        ),
                      ),
                      FadeTransition(
                        opacity: _buttonIn,
                        child: SizedBox(
                          width: double.infinity,
                          height: 52,
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
}

/// The E-mark and wordmark are one brand name, so they share one layout,
/// color, and animation on the splash screen.
class _EventOutLockup extends StatelessWidget {
  final double size;
  const _EventOutLockup({required this.size});

  static const _brandRed = Color(0xFFB91C1C);

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: 'EventOut',
      child: ExcludeSemantics(
        child: Row(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            Transform.translate(
              offset: const Offset(0, -2),
              child: ColorFiltered(
                colorFilter: const ColorFilter.mode(_brandRed, BlendMode.srcIn),
                child: Image.asset(
                  'assets/images/logo.png',
                  width: size,
                  height: size,
                  fit: BoxFit.contain,
                ),
              ),
            ),
            Transform.translate(
              offset: const Offset(-2.5, 0),
              child: Text(
                'ventOut',
                style: TextStyle(
                  color: _brandRed,
                  fontFamily: 'PlusJakartaSans',
                  fontWeight: FontWeight.w700,
                  fontSize: size * 0.9,
                  height: 1,
                  letterSpacing: -0.5,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Shows a brief centered welcome message after sign-in.
class _GoogleSuccessOverlay extends StatefulWidget {
  final VoidCallback onDone;
  const _GoogleSuccessOverlay({required this.onDone});

  @override
  State<_GoogleSuccessOverlay> createState() => _GoogleSuccessOverlayState();
}

class _GoogleSuccessOverlayState extends State<_GoogleSuccessOverlay>
    with SingleTickerProviderStateMixin {
  late final AnimationController _main;
  late final Animation<double> _contentFade;
  Timer? _gotoTimer;

  @override
  void initState() {
    super.initState();
    _main = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1400),
    );
    _contentFade = CurvedAnimation(
      parent: _main,
      curve: const Interval(0.45, 1.0, curve: Curves.easeOut),
    );

    _main.forward();
    // Show the centered welcome message briefly, then continue to the app.
    _gotoTimer = Timer(const Duration(milliseconds: 1750), widget.onDone);
  }

  @override
  void dispose() {
    _gotoTimer?.cancel();
    _main.dispose();
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
        child: FadeTransition(
          opacity: _contentFade,
          child: const Padding(
            padding: EdgeInsets.symmetric(horizontal: 28),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                Text(
                  'Welcome to EventOut!',
                  textAlign: TextAlign.center,
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
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: Color(0xFF9CA3AF),
                    fontSize: 13.5,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Inline Google 'G' logo — drawn with CustomPainter, no network required.
// ─────────────────────────────────────────────────────────────────────────────
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

// Unused pass-through helper kept for parity with the login-screen button
// shape in case you swap back to a standalone `_GoogleButton` later.
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
