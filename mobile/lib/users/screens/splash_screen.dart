// ignore_for_file: depend_on_referenced_packages

import 'dart:async';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../../core/network/endpoint_resolver.dart';
import '../../core/widgets/brand_logo.dart';
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

class _SplashScreenState extends State<SplashScreen>
    with TickerProviderStateMixin {
  bool _bootStarted = false;

  /// 3-second springy entrance: the mark expands past its final size, then
  /// settles with a couple of decaying bounces.
  late final AnimationController _entryController;
  late final Animation<double> _entryScale;
  late final Animation<double> _entryFade;

  /// Gentle idle float once the entrance is done, so it never looks frozen.
  late final AnimationController _floatController;
  late final Animation<double> _float;

  /// Drives the staged reveal of the wordmark, subtitle and button.
  late final AnimationController _revealController;
  late final Animation<double> _titleIn;
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
    _entryScale = TweenSequence<double>([
      TweenSequenceItem(
        tween: Tween<double>(
          begin: 0.32,
          end: 1.16,
        ).chain(CurveTween(curve: Curves.easeOutCubic)),
        weight: 56,
      ),
      TweenSequenceItem(
        tween: Tween<double>(
          begin: 1.16,
          end: 0.94,
        ).chain(CurveTween(curve: Curves.easeInOut)),
        weight: 16,
      ),
      TweenSequenceItem(
        tween: Tween<double>(
          begin: 0.94,
          end: 1.07,
        ).chain(CurveTween(curve: Curves.easeOut)),
        weight: 15,
      ),
      TweenSequenceItem(
        tween: Tween<double>(
          begin: 1.07,
          end: 1.0,
        ).chain(CurveTween(curve: Curves.easeInOut)),
        weight: 13,
      ),
    ]).animate(_entryController);
    _entryFade = CurvedAnimation(
      parent: _entryController,
      curve: const Interval(0.0, 0.28, curve: Curves.easeOut),
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
    _titleIn = CurvedAnimation(
      parent: _revealController,
      curve: const Interval(0.0, 0.55, curve: Curves.easeOutCubic),
    );
    _subtitleIn = CurvedAnimation(
      parent: _revealController,
      curve: const Interval(0.18, 0.75, curve: Curves.easeOutCubic),
    );
    _buttonIn = CurvedAnimation(
      parent: _revealController,
      curve: const Interval(0.45, 1.0, curve: Curves.easeOutCubic),
    );

    // Logo takes the stage first for three seconds…
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

    // The hosting anti-bot challenge is solved natively inside ApiClient
    // (HostChallenge), so there is no WebView cookie-bypass step to wait for —
    // boot immediately so a signed-in user never sees the intro twice.
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

    if (auth.status == AuthStatus.authenticated) {
      context.go('/home');
    } else if (auth.status == AuthStatus.profileIncomplete) {
      context.go('/profile-complete');
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

  Widget _reveal({
    required Animation<double> animation,
    required Widget child,
  }) {
    return AnimatedBuilder(
      animation: animation,
      builder: (context, c) => Opacity(
        opacity: animation.value,
        child: Transform.translate(
          offset: Offset(0, 26 * (1 - animation.value)),
          child: c,
        ),
      ),
      child: child,
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF08090D),
      body: DecoratedBox(
        decoration: const BoxDecoration(
          gradient: RadialGradient(
            center: Alignment(0, -0.25),
            radius: 1.0,
            colors: [Color(0xFF16171E), Color(0xFF08090D)],
          ),
        ),
        child: SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(28, 24, 28, 24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                const Spacer(),
                // ── Brand mark: springy 3s entrance + idle float ─────────
                Row(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.center,
                  children: [
                    AnimatedBuilder(
                      animation: Listenable.merge([_entryController, _floatController]),
                      builder: (context, child) => Opacity(
                        opacity: _entryFade.value,
                        child: Transform.translate(
                          offset: Offset(0, _float.value),
                          child: Transform.scale(scale: _entryScale.value, child: child),
                        ),
                      ),
                      child: const BrandLogo(size: 86, showWordmark: false),
                    ),
                    _reveal(
                      animation: _titleIn,
                      child: const Text(
                        'ventOut',
                        style: TextStyle(
                          color: Colors.white,
                          fontFamily: 'serif',
                          fontSize: 36,
                          fontWeight: FontWeight.w700,
                          letterSpacing: -1.0,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                SizedBox(
                  height: 46,
                  child: _reveal(
                    animation: _subtitleIn,
                    child: AnimatedSwitcher(
                      duration: const Duration(milliseconds: 550),
                      transitionBuilder: (child, animation) => FadeTransition(
                        opacity: animation,
                        child: SlideTransition(
                          position: animation.drive(
                            Tween(
                              begin: const Offset(0, 0.4),
                              end: Offset.zero,
                            ),
                          ),
                          child: child,
                        ),
                      ),
                      child: Text(
                        _subtitles[_subtitleIndex],
                        key: ValueKey(_subtitleIndex),
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          color: Color(0xFFC7CBD3),
                          fontSize: 17.5,
                          height: 1.70,
                        ),
                      ),
                    ),
                  ),
                ),
                const Spacer(),
                _reveal(
                  animation: _buttonIn,
                  child: SizedBox(
                    width: double.infinity,
                    height: 56,
                    child: ElevatedButton(
                      onPressed: () => context.go('/login'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFFFF4D5A),
                        foregroundColor: Colors.white,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(18),
                        ),
                      ),
                      child: const Text(
                        'Get Started',
                        style: TextStyle(
                          fontWeight: FontWeight.w800,
                          fontSize: 17,
                        ),
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 6),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
