import 'package:flutter/material.dart';

class ClientDashboardScreen extends StatelessWidget {
  const ClientDashboardScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Dashboard'),
        actions: [
          IconButton(
            icon: const Badge(
              label: Text('3'),
              child: Icon(Icons.notifications),
            ),
            onPressed: () {
            
            },
          ),
          IconButton(
            icon: const Icon(Icons.person),
            onPressed: () {
              
            },
          ),
        ],
      ),
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Text('Welcome, Organizer!', style: TextStyle(fontSize: 24)),
            const SizedBox(height: 24),
            ElevatedButton.icon(
              onPressed: () {
               
              },
              icon: const Icon(Icons.add),
              label: const Text('New Event'),
            )
          ],
        ),
      ),
    );
  }
}
