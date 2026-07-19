import 'package:go_router/go_router.dart';
import 'package:flutter/material.dart';

import '../screens/user_home_screen.dart';

final GlobalKey<NavigatorState> userNavigatorKey = GlobalKey<NavigatorState>();

final GoRouter userRouter = GoRouter(
  navigatorKey: userNavigatorKey,
  initialLocation: '/user-home',
  routes: [
    GoRoute(
      path: '/user-home',
      builder: (context, state) => const UserHomeScreen(),
    ),
  ],
);
