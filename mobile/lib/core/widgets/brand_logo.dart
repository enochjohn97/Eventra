// ignore_for_file: deprecated_member_use

import 'dart:async';
import 'dart:math' as math;
import 'package:flutter/material.dart';

/// The official EventOut brand lockup. The supplied PNG is the E-mark; the
/// adjacent `ventOut` text completes the name with no visual gap.
class BrandLogo extends StatefulWidget {
  final double size;
  final double? markSize;
  final bool showWordmark;
  final bool white;
  final bool animateEveryMinute;

  const BrandLogo({
    super.key,
    this.size = 28,
    this.markSize,
    this.showWordmark = true,
    this.white = false,
    this.animateEveryMinute = true,
  });

  @override
  State<BrandLogo> createState() => _BrandLogoState();
}

class _BrandLogoState extends State<BrandLogo>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  Timer? _animationTimer;
  final math.Random _random = math.Random();
  int _animation = 0;

  /// Five distinct animation styles the logo cycles through.
  static const _count = 5;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1000),
    );
    // Every mounted logo gets the requested entrance bounce; the timer then
    // selects another motion automatically after 30 seconds.
    _controller.forward();
    _setAnimationTimer(widget.animateEveryMinute);
  }

  @override
  void didUpdateWidget(covariant BrandLogo oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.animateEveryMinute != widget.animateEveryMinute) {
      _setAnimationTimer(widget.animateEveryMinute);
    }
  }

  void _setAnimationTimer(bool enabled) {
    _animationTimer?.cancel();
    if (!enabled) return;
    _animationTimer = Timer.periodic(const Duration(seconds: 30), (_) {
      if (!mounted) return;
      final previous = _animation;
      final choices = List.generate(_count, (i) => i)..remove(previous);
      setState(() => _animation = choices[_random.nextInt(choices.length)]);
      _controller.reset();
      _controller.forward();
    });
  }

  @override
  void dispose() {
    _animationTimer?.cancel();
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, child) {
        final t = _controller.value;
        final env = (1 - math.cos(t * math.pi * 2)) / 2;
        final transform = switch (_animation) {
          0 => Matrix4.diagonal3Values(1 + env * 0.18, 1 + env * 0.18, 1),
          1 => Matrix4.translationValues(0, -env * 12, 0),
          2 =>
            Matrix4.identity()
              ..setEntry(0, 0, 1 + env * 0.1)
              ..setEntry(1, 1, 1 - env * 0.06)
              ..setEntry(0, 2, env * 0.08),
          3 => Matrix4.diagonal3Values(1 + env * 0.14, 1 - env * 0.05, 1),
          _ => Matrix4.rotationZ(env * 0.10),
        };
        return Transform(
          alignment: Alignment.center,
          transform: transform,
          child: child,
        );
      },
      child: widget.showWordmark
          ? Row(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                _mark(widget.markSize ?? widget.size),
                Transform.translate(
                  offset: const Offset(-2, 0),
                  child: Text(
                    'ventOut',
                    style: TextStyle(
                      color: widget.white
                          ? Colors.white
                          : const Color(0xFFF64B54),
                      fontFamily: 'PlusJakartaSans',
                      fontWeight: FontWeight.w700,
                      fontSize: widget.size * 0.85,
                      height: 1.0,
                      letterSpacing: -0.5,
                    ),
                  ),
                ),
              ],
            )
          : _mark(widget.size),
    );
  }

  Widget _mark(double size) => ColorFiltered(
    colorFilter: widget.white
        ? const ColorFilter.mode(Colors.white, BlendMode.srcIn)
        : const ColorFilter.mode(Colors.white, BlendMode.dst),
    child: Image.asset(
      'assets/images/logo.png',
      height: size,
      width: size,
      fit: BoxFit.contain,
      semanticLabel: 'EventOut logo',
    ),
  );
}

/// Renders the brand mark SVG tintable to the brand red or white.
class SvgLogo extends StatelessWidget {
  final double markWidth;
  final double markHeight;
  final bool white;
  final String semanticLabel;

  const SvgLogo({
    super.key,
    required this.markWidth,
    required this.markHeight,
    this.white = false,
    this.semanticLabel = 'logo',
  });

  @override
  Widget build(BuildContext context) {
    final target = white ? Colors.white : const Color(0xFFF64B54);
    return ColoredBox(
      color: Colors.transparent,
      child: SizedBox(
        width: markWidth,
        height: markHeight,
        child: Padding(
          padding: const EdgeInsets.all(1.5),
          child: ColorFiltered(
            colorFilter: ColorFilter.matrix([
              target.red / 255.0,
              0,
              0,
              0,
              0,
              0,
              target.green / 255.0,
              0,
              0,
              0,
              0,
              0,
              target.blue / 255.0,
              0,
              0,
              0,
              0,
              0,
              1,
              0,
            ]),
            child: Image.asset(
              'assets/images/logo.png',
              fit: BoxFit.contain,
              excludeFromSemantics: true,
            ),
          ),
        ),
      ),
    );
  }
}
