import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../main.dart' show PushNotifications;
import '../models/event_model.dart';
import '../providers/favorites_provider.dart';
import '../providers/tickets_provider.dart';
import '../services/user_event_service.dart';
import '../utils/checkout_navigation.dart';
import '../widgets/event_detail_sheet.dart';
import 'favorites_screen.dart';
import 'profile_screen.dart';
import 'tickets_screen.dart';
import 'user_home_screen.dart';

class UserShellScreen extends StatefulWidget {
  const UserShellScreen({super.key});

  @override
  State<UserShellScreen> createState() => _UserShellScreenState();
}

class _UserShellScreenState extends State<UserShellScreen> {
  int _index = 0;

  @override
  void initState() {
    super.initState();
    // A tapped push notification (cold launch OR already-running) stashes the
    // target event id here; consume it and open the event detail sheet.
    PushNotifications.pendingEventId.addListener(_onPushEventChanged);
    // Cold-launch: the value may have been set before this shell mounted.
    WidgetsBinding.instance.addPostFrameCallback((_) => _onPushEventChanged());
  }

  @override
  void dispose() {
    PushNotifications.pendingEventId.removeListener(_onPushEventChanged);
    super.dispose();
  }

  void _onPushEventChanged() {
    final id = PushNotifications.pendingEventId.value;
    if (id == null || !mounted) return;
    // Consume once so re-renders don't re-open the same sheet.
    PushNotifications.pendingEventId.value = null;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _openPushedEvent(id);
    });
  }

  /// Opens the event a push notification referred to (fetched fresh so the
  /// sheet shows live availability/pricing).
  Future<void> _openPushedEvent(int eventId) async {
    try {
      final EventModel event = await UserEventService.fetchEventDetails(eventId);
      if (!mounted) return;
      await showEventDetailSheet(
        context,
        event: event,
        onGetTicket: () {
          Navigator.pop(context);
          openCheckoutForEvent(context, event);
        },
        onGiftTicket: () {
          Navigator.pop(context);
          openCheckoutForEvent(context, event, gift: true);
        },
      );
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('$e')));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final pages = const [
      UserHomeScreen(),
      FavoritesScreen(),
      TicketsScreen(),
      ProfileScreen(),
    ];

    return Scaffold(
      body: IndexedStack(index: _index, children: pages),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) {
          setState(() => _index = i);
          if (i == 1) context.read<FavoritesProvider>().load();
          if (i == 2) context.read<TicketsProvider>().load();
        },
        destinations: const [
          NavigationDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home), label: 'Home'),
          NavigationDestination(icon: Icon(Icons.favorite_border), selectedIcon: Icon(Icons.favorite), label: 'Favorites'),
          NavigationDestination(icon: Icon(Icons.confirmation_number_outlined), selectedIcon: Icon(Icons.confirmation_number), label: 'Tickets'),
          NavigationDestination(icon: Icon(Icons.person_outline), selectedIcon: Icon(Icons.person), label: 'Profile'),
        ],
      ),
    );
  }
}
