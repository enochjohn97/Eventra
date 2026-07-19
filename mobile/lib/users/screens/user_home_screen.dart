import 'package:flutter/material.dart';
import '../services/google_auth_service.dart';

class UserHomeScreen extends StatefulWidget {
  const UserHomeScreen({super.key});

  @override
  State<UserHomeScreen> createState() => _UserHomeScreenState();
}

class _UserHomeScreenState extends State<UserHomeScreen> {
  bool _isMapMode = false;
  
  void _toggleMapMode() {
    setState(() {
      _isMapMode = !_isMapMode;
    });
  }

  void _handleProfileTap() async {
    // Attempt Google Sign in
    await GoogleAuthService.signIn();
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Signed in (Mocked)')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Eventra'),
        actions: [
          IconButton(
            icon: Icon(_isMapMode ? Icons.list : Icons.map),
            onPressed: _toggleMapMode,
          ),
          IconButton(
            icon: const Icon(Icons.account_circle),
            onPressed: _handleProfileTap,
          ),
        ],
      ),
      body: Center(
        child: _isMapMode
            ? const Text('Map View Placeholder')
            : const Text('List View Placeholder - Pulls from /events/get-events.php'),
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () {
         
        },
        child: const Icon(Icons.help_outline),
      ),
    );
  }
}
