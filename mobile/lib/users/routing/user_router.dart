import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:webview_flutter/webview_flutter.dart';
import '../../core/network/api_client.dart';
import '../models/event_model.dart';
import '../providers/auth_provider.dart';
import '../screens/checkout_screen.dart';
import '../screens/payment_success_screen.dart';
import '../screens/profile_complete_screen.dart';
import '../screens/splash_screen.dart';
import '../screens/user_shell_screen.dart';

final GlobalKey<NavigatorState> userNavigatorKey = GlobalKey<NavigatorState>();

GoRouter createUserRouter(AuthProvider authProvider) {
  return GoRouter(
    navigatorKey: userNavigatorKey,
    initialLocation: '/',
    refreshListenable: authProvider,
    redirect: (context, state) {
      final path = state.matchedLocation;
      final status = authProvider.status;
      final isPublic =
          path == '/' ||
          path.startsWith('/welcome') ||
          path.startsWith('/onboarding') ||
          path.startsWith('/login');

      if (status == AuthStatus.unknown) return null;
      if (status == AuthStatus.unauthenticated &&
          !isPublic &&
          path != '/profile-complete') {
        return '/login';
      }
      if (status == AuthStatus.profileIncomplete &&
          path != '/profile-complete' &&
          path != '/home' &&
          path != '/checkout' &&
          !isPublic) {
        return '/profile-complete';
      }
      if (status == AuthStatus.authenticated &&
          (path == '/login' || path == '/profile-complete')) {
        return '/home';
      }
      return null;
    },
    routes: [
      GoRoute(path: '/', builder: (_, _) => const SplashScreen()),
      GoRoute(path: '/welcome', redirect: (_, _) => '/login'),
      GoRoute(path: '/onboarding', redirect: (_, _) => '/login'),
      GoRoute(path: '/login', builder: (_, _) => const SplashScreen()),
      GoRoute(
        path: '/profile-complete',
        builder: (_, _) => const ProfileCompleteScreen(),
      ),
      GoRoute(
        path: '/home',
        pageBuilder: (context, state) => CustomTransitionPage<void>(
          key: state.pageKey,
          transitionDuration: const Duration(milliseconds: 550),
          child: const UserShellScreen(),
          transitionsBuilder: (context, animation, secondaryAnimation, child) {
            final transition = CurvedAnimation(
              parent: animation,
              curve: Curves.easeOutCubic,
            );
            return FadeTransition(
              opacity: transition,
              child: ScaleTransition(
                scale: Tween<double>(begin: 1.16, end: 1).animate(transition),
                child: child,
              ),
            );
          },
        ),
      ),
      GoRoute(
        path: '/checkout',
        builder: (context, state) {
          // "Get Ticket" pushes the event itself; "Get for someone else" pushes
          // a payload carrying the gift flag so checkout asks only for the
          // recipient's email.
          final extra = state.extra;
          if (extra is Map) {
            return CheckoutScreen(
              event: extra['event'] as EventModel,
              giftMode: extra['gift'] == true,
            );
          }
          return CheckoutScreen(event: extra as EventModel);
        },
      ),
      GoRoute(
        path: '/payment-success',
        builder: (context, state) {
          final payload = Map<String, dynamic>.from(state.extra as Map);
          return PaymentSuccessScreen(payload: payload);
        },
      ),
      // Legal & policy pages — hosted on the server, rendered in-app via WebView.
      GoRoute(
        path: '/terms',
        builder: (_, _) => const _LegalPage(title: 'Terms & Conditions', path: '/terms.html'),
      ),
      GoRoute(
        path: '/privacy',
        builder: (_, _) => const _LegalPage(title: 'Privacy Policy', path: '/privacy.html'),
      ),
      GoRoute(
        path: '/cookies',
        builder: (_, _) => const _LegalPage(title: 'Cookie Policy', path: '/cookies.html'),
      ),
      GoRoute(
        path: '/delete-data',
        builder: (_, _) => const _LegalPage(title: 'Delete your data', path: '/delete-data.html'),
      ),
    ],
  );
}

/// Renders a server-hosted legal page inside the app using a WebView.
class _LegalPage extends StatefulWidget {
  final String title;
  final String path;
  const _LegalPage({required this.title, required this.path});

  @override
  State<_LegalPage> createState() => _LegalPageState();
}

class _LegalPageState extends State<_LegalPage> {
  late WebViewController _controller;

  @override
  void initState() {
    super.initState();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setNavigationDelegate(
        NavigationDelegate(
          onPageStarted: (_) {},
          onPageFinished: (_) {},
          onWebResourceError: (_) {},
        ),
      )
      ..loadRequest(Uri.parse(
        '${ApiClient().baseOrigin}/${widget.path.replaceFirst(RegExp(r'^/+'), '')}',
      ));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.title)),
      body: WebViewWidget(controller: _controller),
    );
  }
}
