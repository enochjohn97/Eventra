import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../services/client_dashboard_service.dart';

class ClientDashboardScreen extends StatefulWidget {
  const ClientDashboardScreen({super.key});

  @override
  State<ClientDashboardScreen> createState() => _ClientDashboardScreenState();
}

class _ClientDashboardScreenState extends State<ClientDashboardScreen> {
  Map<String, dynamic>? stats;
  bool isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadStats();
  }

  Future<void> _loadStats() async {
    final data = await ClientDashboardService.getDashboardStats();
    setState(() {
      stats = data ?? {'events': 0, 'tickets': 0, 'users': 0, 'media': 0, 'recent_events': []};
      isLoading = false;
    });
  }

  Widget _buildStatCard(String title, String value, IconData icon, Color color) {
    return Card(
      elevation: 2,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(title, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Colors.grey)),
                Icon(icon, color: color, size: 28),
              ],
            ),
            const Spacer(),
            Text(value, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold)),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Dashboard Overview'),
        actions: [
          IconButton(
            icon: const Badge(
              label: Text('3'),
              child: Icon(Icons.notifications),
            ),
            onPressed: () {},
          ),
          IconButton(
            icon: const Icon(Icons.person),
            onPressed: () {},
          ),
        ],
      ),
      body: isLoading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _loadStats,
              child: SingleChildScrollView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.all(16.0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text('Overview', style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold)),
                        ElevatedButton.icon(
                          onPressed: () => context.push('/client-create-event').then((_) => _loadStats()),
                          icon: const Icon(Icons.add),
                          label: const Text('New Event'),
                        )
                      ],
                    ),
                    const SizedBox(height: 16),
                    GridView.count(
                      shrinkWrap: true,
                      physics: const NeverScrollableScrollPhysics(),
                      crossAxisCount: 2,
                      crossAxisSpacing: 16,
                      mainAxisSpacing: 16,
                      childAspectRatio: 1.5,
                      children: [
                        _buildStatCard('Events', '${stats?['events'] ?? 0}', Icons.event, Colors.purple),
                        _buildStatCard('Tickets', '${stats?['tickets'] ?? 0}', Icons.local_activity, Colors.blue),
                        _buildStatCard('Users', '${stats?['users'] ?? 0}', Icons.people, Colors.orange),
                        _buildStatCard('Media', '${stats?['media'] ?? 0}', Icons.image, Colors.red),
                      ],
                    ),
                    const SizedBox(height: 24),
                    const Text('Analytics Chart', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
                    const SizedBox(height: 16),
                    Container(
                      height: 150,
                      decoration: BoxDecoration(
                        color: Colors.blue.withOpacity(0.1),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: Colors.blue.withOpacity(0.3)),
                      ),
                      child: const Center(
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(Icons.bar_chart, size: 48, color: Colors.blue),
                            SizedBox(height: 8),
                            Text('Chart Data Placeholder', style: TextStyle(color: Colors.blue)),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 24),
                    const Text('Recent Events', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
                    const SizedBox(height: 16),
                    _buildRecentEvents(),
                  ],
                ),
              ),
            ),
    );
  }

  Widget _buildRecentEvents() {
    List recent = stats?['recent_events'] ?? [];
    if (recent.isEmpty) {
      return Container(
        padding: const EdgeInsets.all(24),
        alignment: Alignment.center,
        child: const Text('No events published yet.', style: TextStyle(color: Colors.grey)),
      );
    }
    return ListView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      itemCount: recent.length,
      itemBuilder: (context, index) {
        final ev = recent[index];
        return Card(
          margin: const EdgeInsets.only(bottom: 8),
          child: ListTile(
            leading: const CircleAvatar(
              backgroundColor: Colors.purple,
              child: Icon(Icons.event_available, color: Colors.white),
            ),
            title: Text(ev['title'] ?? 'Unnamed Event'),
            subtitle: Text('Status: ${ev['status'] ?? 'Published'}'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () {},
          ),
        );
      },
    );
  }
}
