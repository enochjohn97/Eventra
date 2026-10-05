import 'package:flutter/material.dart';

/// The official Eventra brand lockup: coral E-monogram badge + "eventra."
/// wordmark. Used on every screen header so the brand is always visible.
///
/// [variant] white renders the wordmark in white for dark/photo backgrounds.
class BrandLogo extends StatelessWidget {
  final double size;
  final bool showWordmark;
  final bool white;

  const BrandLogo({
    super.key,
    this.size = 34,
    this.showWordmark = true,
    this.white = false,
  });

  @override
  Widget build(BuildContext context) {
    final wordmarkColor = white ? Colors.white : const Color(0xFF101A2E);
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Image.asset(
          'assets/images/logo.png',
          width: size,
          height: size,
          fit: BoxFit.contain,
        ),
        if (showWordmark) ...[
          const SizedBox(width: 8),
          RichText(
            text: TextSpan(
            text: 'Eventra',
              style: TextStyle(
                color: wordmarkColor,
                fontSize: size * 0.55,
                fontWeight: FontWeight.w800,
                letterSpacing: -0.5,
              ),
              children: const [
                TextSpan(text: '.', style: TextStyle(color: Color(0xFFFF5A5F))),
              ],
            ),
          ),
        ],
      ],
    );
  }
}
