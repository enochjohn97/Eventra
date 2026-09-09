import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/theme/app_theme.dart';
import '../providers/favorites_provider.dart';
import '../widgets/event_card.dart';
import '../widgets/event_detail_sheet.dart';
import '../widgets/event_skeleton.dart';
import '../utils/checkout_navigation.dart';

class FavoritesScreen extends StatefulWidget {
  const FavoritesScreen({super.key});

  @override
  State<FavoritesScreen> createState() => _FavoritesScreenState();
}

class _FavoritesScreenState extends State<FavoritesScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<FavoritesProvider>().load();
    });
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<FavoritesProvider>();
    final columns = MediaQuery.sizeOf(context).width >= 600 ? 2 : 1;

    return Scaffold(
      appBar: AppBar(title: const Text('Favorites')),
      body: RefreshIndicator(
        onRefresh: provider.load,
        child: provider.isLoading && provider.favorites.isEmpty
            ? ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.all(16),
                children: [EventSkeletonGrid(count: 3)],
              )
            : provider.favorites.isEmpty
                ? ListView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    children: const [
                      SizedBox(height: 120),
                      Center(child: Text('No favorites yet', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600))),
                      SizedBox(height: 8),
                      Center(child: Text('Tap the heart on events you love.', style: TextStyle(color: AppTheme.textMuted))),
                    ],
                  )
                : GridView.builder(
                    padding: const EdgeInsets.all(16),
                    gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: columns,
                      mainAxisSpacing: 16,
                      crossAxisSpacing: 16,
                      childAspectRatio: 0.78,
                    ),
                    itemCount: provider.favorites.length,
                    itemBuilder: (context, index) {
                      final event = provider.favorites[index];
                      return EventCard(
                        event: event.copyWith(isFavorite: true),
                        onTap: () => showEventDetailSheet(
                          context,
                          event: event,
                          onGetTicket: () {
                            Navigator.pop(context);
                            openCheckoutForEvent(context, event);
                          },
                        ),
                        onFavorite: () async {
                          await provider.removeFavorite(event);
                        },
                      );
                    },
                  ),
      ),
    );
  }
}
