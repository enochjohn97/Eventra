import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../models/event_model.dart';
import '../providers/auth_provider.dart';
import '../screens/checkout_screen.dart';
import '../screens/login_screen.dart';
import '../screens/onboarding_screen.dart';
import '../screens/payment_success_screen.dart';
import '../screens/profile_complete_screen.dart';
import '../screens/splash_screen.dart';
import '../screens/user_shell_screen.dart';
import '../screens/welcome_screen.dart';

final GlobalKey<NavigatorState> userNavigatorKey = GlobalKey<NavigatorState>();

GoRouter createUserRouter(AuthProvider authProvider) {
  return GoRouter(
    navigatorKey: userNavigatorKey,
    initialLocation: '/',
    refreshListenable: authProvider,
    redirect: (context, state) {
      final path = state.matchedLocation;
      final status = authProvider.status;
      final isPublic = path == '/' ||
          path.startsWith('/welcome') ||
          path.startsWith('/onboarding') ||
          path.startsWith('/login');

      if (status == AuthStatus.unknown) return null;
      if (status == AuthStatus.unauthenticated && !isPublic && path != '/profile-complete') {
        return '/login';
      }
      if (status == AuthStatus.profileIncomplete && path != '/profile-complete' && !isPublic) {
        return '/profile-complete';
      }
      if (status == AuthStatus.authenticated && (path == '/login' || path == '/profile-complete')) {
        return '/home';
      }
      return null;
    },
    routes: [
      GoRoute(path: '/', builder: (_, __) => const SplashScreen()),
      GoRoute(path: '/welcome', builder: (_, __) => const WelcomeScreen()),
      GoRoute(path: '/onboarding', builder: (_, __) => const OnboardingScreen()),
      GoRoute(path: '/login', builder: (_, __) => const LoginScreen()),
      GoRoute(path: '/profile-complete', builder: (_, __) => const ProfileCompleteScreen()),
      GoRoute(path: '/home', builder: (_, __) => const UserShellScreen()),
      GoRoute(
        path: '/checkout',
        builder: (context, state) {
          final event = state.extra as EventModel;
          return CheckoutScreen(event: event);
        },
      ),
      GoRoute(
        path: '/payment-success',
        builder: (context, state) {
          final payload = Map<String, dynamic>.from(state.extra as Map);
          return PaymentSuccessScreen(payload: payload);
        },
      ),
    ],
  );
}
