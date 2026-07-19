import 'package:go_router/go_router.dart';
import 'package:flutter/material.dart';

import '../screens/client_login_screen.dart';
import '../screens/client_signup_screen.dart';
import '../screens/client_dashboard_screen.dart';

final GlobalKey<NavigatorState> clientNavigatorKey = GlobalKey<NavigatorState>();

final GoRouter clientRouter = GoRouter(
  navigatorKey: clientNavigatorKey,
  initialLocation: '/client-login',
  routes: [
    GoRoute(
      path: '/client-login',
      builder: (context, state) => const ClientLoginScreen(),
    ),
    GoRoute(
      path: '/client-signup',
      builder: (context, state) => const ClientSignupScreen(),
    ),
    GoRoute(
      path: '/client-dashboard',
      builder: (context, state) => const ClientDashboardScreen(),
    ),
  ],
);
