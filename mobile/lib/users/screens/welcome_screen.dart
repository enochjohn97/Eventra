import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

class WelcomeScreen extends StatelessWidget {
  const WelcomeScreen({super.key});

  static const _images = [
    'https://images.unsplash.com/photo-1533174072545-7a4b6ecd4ae0?w=1200&h=800&fit=crop',
    'https://images.unsplash.com/photo-1501281668745-f7f57925c3b0?w=1200&h=800&fit=crop',
    'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=1200&h=800&fit=crop',
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Stack(
        fit: StackFit.expand,
        children: [
          PageView.builder(
            itemCount: _images.length,
            itemBuilder: (_, i) => Image.network(_images[i], fit: BoxFit.cover),
          ),
          Container(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [Colors.black.withValues(alpha: 0.2), Colors.black.withValues(alpha: 0.85)],
              ),
            ),
          ),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Spacer(),
                  const Text(
                    'Discover Africa\'s\nBest Events',
                    style: TextStyle(color: Colors.white, fontSize: 36, fontWeight: FontWeight.w800, height: 1.1),
                  ),
                  const SizedBox(height: 12),
                  Text(
                    'Concerts, festivals, conferences and more — all in one beautiful app.',
                    style: TextStyle(color: Colors.white.withValues(alpha: 0.9), fontSize: 16, height: 1.4),
                  ),
                  const SizedBox(height: 28),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      onPressed: () => context.go('/onboarding'),
                      child: const Text('Get Started'),
                    ),
                  ),
                  const SizedBox(height: 12),
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton(
                      onPressed: () => context.go('/login'),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: Colors.white,
                        side: const BorderSide(color: Colors.white),
                      ),
                      child: const Text('I already have an account'),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
