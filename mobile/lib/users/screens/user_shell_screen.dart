import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/favorites_provider.dart';
import '../providers/tickets_provider.dart';
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
