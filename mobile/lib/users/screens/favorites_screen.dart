import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/theme/app_theme.dart';
import '../../core/utils/event_utils.dart';
import '../../core/widgets/adaptive_dialogs.dart';
import '../../core/widgets/brand_logo.dart';
import '../providers/events_provider.dart';
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
    final width = MediaQuery.sizeOf(context).width;
    final columns = Breakpoints.gridColumns(width);

    return Scaffold(
      appBar: AppBar(
        title: const BrandLogo(
          size: 27,
          markSize: 23,
          animateEveryMinute: true,
        ),
        actions: [
          if (provider.favorites.isNotEmpty)
            TextButton(
              onPressed: provider.isLoading ? null : () => _clearAll(provider),
              child: const Text('Clear all'),
            ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: provider.load,
        child: provider.isLoading && provider.favorites.isEmpty
            ? ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.all(16),
                children: [EventSkeletonGrid(count: 3)],
              )
            : provider.favorites.isEmpty && provider.error != null
            ? ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                children: [
                  const SizedBox(height: 120),
                  Center(
                    child: Text(
                      provider.error!,
                      textAlign: TextAlign.center,
                      style: const TextStyle(color: AppTheme.textMuted),
                    ),
                  ),
                  const SizedBox(height: 8),
                  const Center(
                    child: Text(
                      'Pull down to retry.',
                      style: TextStyle(color: AppTheme.textMuted),
                    ),
                  ),
                ],
              )
            : provider.favorites.isEmpty
            ? ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                children: const [
                  SizedBox(height: 120),
                  Center(
                    child: Text(
                      'No favorites yet',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  SizedBox(height: 8),
                  Center(
                    child: Text(
                      'Tap the heart on events you love.',
                      style: TextStyle(color: AppTheme.textMuted),
                    ),
                  ),
                ],
              )
            : GridView.builder(
                padding: const EdgeInsets.all(16),
                // Always scrollable so pull-to-refresh works even with a short
                // list, and long lists scroll normally.
                physics: const AlwaysScrollableScrollPhysics(),
                gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: columns,
                  mainAxisSpacing: 16,
                  crossAxisSpacing: 16,
                  mainAxisExtent: Breakpoints.cardExtent(
                    gridWidth: width - 32,
                    columns: columns,
                    textScale: MediaQuery.textScalerOf(context).scale(1),
                  ),
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
                      onGiftTicket: () {
                        Navigator.pop(context);
                        openCheckoutForEvent(context, event, gift: true);
                      },
                    ),
                    // Passed events show no heart here either.
                    onFavorite: EventUtils.isPassed(event)
                        ? null
                        : () async {
                            await provider.removeFavorite(event);
                          },
                  );
                },
              ),
      ),
    );
  }

  /// "Clear all" — confirms first, then wipes favorites server-side and resets
  /// the heart state on the home feed so the two tabs never disagree.
  Future<void> _clearAll(FavoritesProvider provider) async {
    final confirmed = await showAdaptiveConfirm(
      context,
      title: 'Clear all favorites?',
      message: 'This removes every event from your favorites.',
      confirm: 'Clear all',
      isDestructive: true,
    );
    if (confirmed != true || !mounted) return;

    try {
      await provider.clearAll();
      if (!mounted) return;
      final events = context.read<EventsProvider>().events;
      for (final event in events) {
        if (event.isFavorite) {
          context.read<EventsProvider>().updateFavoriteState(event.id, false);
        }
      }
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(
          const SnackBar(
            content: Text('All favorites cleared'),
            behavior: SnackBarBehavior.floating,
          ),
        );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text(e.toString())));
    }
  }
}
