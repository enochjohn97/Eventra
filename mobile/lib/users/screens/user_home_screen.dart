import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/theme/app_theme.dart';
import '../models/event_model.dart';
import '../providers/events_provider.dart';
import '../widgets/event_card.dart';
import '../widgets/event_detail_sheet.dart';
import '../widgets/event_skeleton.dart';
import '../utils/checkout_navigation.dart';

class UserHomeScreen extends StatefulWidget {
  const UserHomeScreen({super.key});

  @override
  State<UserHomeScreen> createState() => _UserHomeScreenState();
}

class _UserHomeScreenState extends State<UserHomeScreen> {
  final _searchCtrl = TextEditingController();
  final _scrollCtrl = ScrollController();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<EventsProvider>().loadEvents(refresh: true);
    });
    _scrollCtrl.addListener(_onScroll);
  }

  void _onScroll() {
    if (_scrollCtrl.position.pixels >= _scrollCtrl.position.maxScrollExtent - 200) {
      context.read<EventsProvider>().loadEvents();
    }
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    _scrollCtrl.dispose();
    super.dispose();
  }

  int _columns(BuildContext context) {
    final w = MediaQuery.sizeOf(context).width;
    if (w >= 900) return 3;
    if (w >= 600) return 2;
    return 1;
  }

  @override
  Widget build(BuildContext context) {
    final eventsProvider = context.watch<EventsProvider>();
    final columns = _columns(context);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Discover Events'),
        actions: [
          PopupMenuButton<String>(
            icon: const Icon(Icons.sort),
            onSelected: (value) {
              eventsProvider.setSort(value);
              eventsProvider.loadEvents(refresh: true);
            },
            itemBuilder: (_) => const [
              PopupMenuItem(value: 'newest', child: Text('Newest')),
              PopupMenuItem(value: 'date', child: Text('Upcoming Date')),
              PopupMenuItem(value: 'price_low', child: Text('Price: Low to High')),
              PopupMenuItem(value: 'price_high', child: Text('Price: High to Low')),
              PopupMenuItem(value: 'popular', child: Text('Popularity')),
              PopupMenuItem(value: 'merit', child: Text('Trending Merit')),
            ],
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: eventsProvider.refresh,
        child: CustomScrollView(
          controller: _scrollCtrl,
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: [
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                child: TextField(
                  controller: _searchCtrl,
                  decoration: InputDecoration(
                    hintText: 'Search events, venues, categories...',
                    prefixIcon: const Icon(Icons.search),
                    suffixIcon: _searchCtrl.text.isNotEmpty
                        ? IconButton(
                            icon: const Icon(Icons.clear),
                            onPressed: () {
                              _searchCtrl.clear();
                              eventsProvider.setSearch('');
                              eventsProvider.loadEvents(refresh: true);
                              setState(() {});
                            },
                          )
                        : null,
                  ),
                  onSubmitted: (v) {
                    eventsProvider.setSearch(v.trim());
                    eventsProvider.loadEvents(refresh: true);
                  },
                  onChanged: (_) => setState(() {}),
                ),
              ),
            ),
            if (eventsProvider.isLoading && eventsProvider.events.isEmpty)
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: EventSkeletonGrid(count: columns * 3),
                ),
              )
            else if (eventsProvider.error != null && eventsProvider.events.isEmpty)
              SliverFillRemaining(
                child: _EmptyState(
                  icon: Icons.cloud_off,
                  title: 'Could not load events',
                  subtitle: eventsProvider.error!,
                  actionLabel: 'Retry',
                  onAction: () => eventsProvider.loadEvents(refresh: true),
                ),
              )
            else if (eventsProvider.events.isEmpty)
              SliverFillRemaining(
                child: _EmptyState(
                  icon: Icons.event_busy,
                  title: 'No events found',
                  subtitle: 'Try adjusting your search or check back later.',
                  actionLabel: 'Refresh',
                  onAction: () => eventsProvider.loadEvents(refresh: true),
                ),
              )
            else
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                sliver: SliverGrid(
                  gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: columns,
                    mainAxisSpacing: 16,
                    crossAxisSpacing: 16,
                    childAspectRatio: 0.78,
                  ),
                  delegate: SliverChildBuilderDelegate(
                    (context, index) {
                      final event = eventsProvider.events[index];
                      return EventCard(
                        event: event,
                        onTap: () => _openEvent(context, event),
                        onFavorite: () => _toggleFavorite(context, event),
                      );
                    },
                    childCount: eventsProvider.events.length,
                  ),
                ),
              ),
            if (eventsProvider.isLoadingMore)
              const SliverToBoxAdapter(
                child: Padding(
                  padding: EdgeInsets.all(16),
                  child: Center(child: CircularProgressIndicator()),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Future<void> _openEvent(BuildContext context, EventModel event) async {
    await showEventDetailSheet(
      context,
      event: event,
      onGetTicket: () {
        Navigator.pop(context);
        openCheckoutForEvent(context, event);
      },
    );
  }

  Future<void> _toggleFavorite(BuildContext context, EventModel event) async {
    try {
      await context.read<EventsProvider>().toggleFavorite(event);
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
      }
    }
  }
}

class _EmptyState extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final String actionLabel;
  final VoidCallback onAction;

  const _EmptyState({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.actionLabel,
    required this.onAction,
  });

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 56, color: AppTheme.textMuted),
            const SizedBox(height: 16),
            Text(title, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
            const SizedBox(height: 8),
            Text(subtitle, textAlign: TextAlign.center, style: const TextStyle(color: AppTheme.textMuted)),
            const SizedBox(height: 20),
            ElevatedButton(onPressed: onAction, child: Text(actionLabel)),
          ],
        ),
      ),
    );
  }
}
