import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/theme/app_theme.dart';
import '../../core/utils/event_utils.dart';
import '../../core/widgets/brand_logo.dart';
import '../models/event_model.dart';
import '../providers/events_provider.dart';
import '../services/app_config_service.dart';
import '../utils/checkout_navigation.dart';
import '../widgets/event_card.dart';
import '../widgets/event_detail_sheet.dart';
import '../widgets/event_skeleton.dart';

class UserHomeScreen extends StatefulWidget {
  const UserHomeScreen({super.key});

  @override
  State<UserHomeScreen> createState() => _UserHomeScreenState();
}

class _UserHomeScreenState extends State<UserHomeScreen> {
  final _searchCtrl = TextEditingController();
  final _searchFocus = FocusNode();
  final _scrollController = ScrollController();
  Timer? _debounce;
  Timer? _holidayTimer;
  List<Holiday> _holidays = const [];
  bool _holidayAlertShown = false;
  bool _isScrolled = false;

  /// Holiday/festive notices repeat while a holiday is actually close by, the
  /// same way the website re-shows them. 3 minutes by default — override with
  /// `--dart-define=HOLIDAY_ALERT_MINUTES=2` (or 5). 0 disables repeating.
  static const _holidayAlertMinutes = int.fromEnvironment(
    'HOLIDAY_ALERT_MINUTES',
    defaultValue: 3,
  );

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_updateScrollState);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final provider = context.read<EventsProvider>();
      _searchCtrl.text = provider.search;
      provider.loadEvents(refresh: true);
    });
    _loadHolidays();
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _holidayTimer?.cancel();
    _searchCtrl.dispose();
    _searchFocus.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  void _updateScrollState() {
    final isScrolled =
        _scrollController.hasClients && _scrollController.offset > 48;
    if (isScrolled != _isScrolled && mounted) {
      setState(() => _isScrolled = isScrolled);
    }
  }

  Future<void> _showSearch() async {
    if (_scrollController.hasClients) {
      await _scrollController.animateTo(
        0,
        duration: const Duration(milliseconds: 250),
        curve: Curves.easeOut,
      );
    }
    if (mounted) _searchFocus.requestFocus();
  }

  // ── Holiday & festive alerts (mirrors the web app's toast alerts) ────────
  Future<void> _loadHolidays() async {
    try {
      final list = await HolidayService.fetch();
      if (!mounted) return;
      setState(() => _holidays = list);
      await _announceHoliday(list);
      _scheduleHolidayRepeat(list);
    } catch (_) {
      // Holidays are best-effort — never disturb discovery when unavailable.
    }
  }

  /// Re-shows the holiday notice every [_holidayAlertMinutes] minutes while a
  /// holiday is today or within 7 days, and stops as soon as none is near — so
  /// a quiet calendar never nags and a busy one keeps reminding.
  void _scheduleHolidayRepeat(List<Holiday> all) {
    _holidayTimer?.cancel();
    _holidayTimer = null;
    if (_holidayAlertMinutes <= 0) return;
    final near =
        HolidayService.today(all) != null ||
        HolidayService.withinDays(all, 7) != null;
    if (!near) return;
    _holidayTimer = Timer.periodic(
      Duration(minutes: _holidayAlertMinutes),
      (_) => _announceHoliday(all, repeat: true),
    );
  }

  Future<void> _announceHoliday(
    List<Holiday> all, {
    bool repeat = false,
  }) async {
    if (!mounted) return;
    if (!repeat) {
      if (_holidayAlertShown) return;
      _holidayAlertShown = true;
    }

    final today = HolidayService.today(all);
    if (today != null) {
      // A repeat pass skips the once-per-install claim so the notice can come
      // back on the interval while the holiday is still current.
      if (!repeat) {
        final ok = await HolidayService.claimAlert('today:${today.date}');
        if (!ok || !mounted) return;
      }
      final head = today.greeting ?? "It's a holiday today!";
      _showHolidaySnack(
        '${today.emoji} $head Today is ${today.title} — ${today.friendlyDate}. Enjoy the celebration!',
      );
      return;
    }

    final next = HolidayService.withinDays(all, 7);
    if (next == null) return;
    if (!repeat) {
      final ok = await HolidayService.claimAlert(
        'upcoming:${next.date}:${next.title}',
      );
      if (!ok || !mounted) return;
    }
    final diff = next.day!.difference(DateTime.parse(_todayIso())).inDays;
    final when = diff <= 0
        ? 'today'
        : (diff == 1 ? 'tomorrow' : 'in $diff days');
    _showHolidaySnack(
      '${next.emoji} Upcoming holiday: ${next.title} $when (${next.friendlyDate}). Get ready!',
    );
  }

  String _todayIso() {
    final now = DateTime.now();
    return '${now.year}-${now.month.toString().padLeft(2, '0')}-${now.day.toString().padLeft(2, '0')}';
  }

  void _showHolidaySnack(String message) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Text(message),
          duration: const Duration(seconds: 7),
          backgroundColor: AppTheme.primaryDark,
          behavior: SnackBarBehavior.floating,
        ),
      );
  }

  // ── Live search (debounced) ──────────────────────────────────────────────
  void _onQueryChanged(String value) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 450), () {
      if (!mounted) return;
      final provider = context.read<EventsProvider>();
      if (provider.search == value.trim()) return;
      provider.applySearch(value.trim());
    });
    setState(() {}); // refresh the clear button
  }

  Future<void> _openFilters(EventsProvider provider) async {
    final applied = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => _FilterSheet(provider: provider),
    );
    if (applied == true && mounted) _searchCtrl.text = '';
  }

  // ── Pagination ───────────────────────────────────────────────────────────
  void _goToPage(int page) {
    final provider = context.read<EventsProvider>();
    provider.goToPage(page);
    _scrollToTop();
  }

  void _scrollToTop() {
    if (!mounted) return;
    final ctx = _gridKey.currentContext;
    if (ctx != null) {
      Scrollable.ensureVisible(
        ctx,
        duration: const Duration(milliseconds: 250),
      );
    }
  }

  final _gridKey = GlobalKey();

  int _columns(BuildContext context) =>
      Breakpoints.gridColumns(MediaQuery.sizeOf(context).width);

  /// Height one card needs: 16:10 image plus the compact text body (see
  /// [Breakpoints.cardExtent]) — shared with the Favorites grid.
  double _cardExtent(BuildContext context, int columns) =>
      Breakpoints.cardExtent(
        gridWidth:
            MediaQuery.sizeOf(context).width - 32, // padding left + right
        columns: columns,
        textScale: MediaQuery.textScalerOf(context).scale(1),
      );

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<EventsProvider>();
    final columns = _columns(context);

    return Scaffold(
      appBar: AppBar(
        title: const BrandLogo(
          size: 27,
          markSize: 23,
          animateEveryMinute: true,
        ),
        actions: [
          // Filter entry point (category / state / priority / price).
          Stack(
            alignment: Alignment.center,
            children: [
              IconButton(
                tooltip: 'Filter events',
                icon: Icon(
                  provider.filters.activeCount > 0
                      ? Icons.filter_alt
                      : Icons.filter_alt_outlined,
                ),
                onPressed: () => _openFilters(provider),
              ),
              if (provider.filters.activeCount > 0)
                Positioned(
                  right: 6,
                  top: 6,
                  child: Container(
                    padding: const EdgeInsets.all(4),
                    decoration: const BoxDecoration(
                      color: AppTheme.accent,
                      shape: BoxShape.circle,
                    ),
                    child: Text(
                      '${provider.filters.activeCount}',
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 9,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                ),
            ],
          ),
          if (_isScrolled)
            IconButton(
              tooltip: 'Search events',
              icon: const Icon(Icons.search),
              onPressed: _showSearch,
            ),
          PopupMenuButton<String>(
            icon: const Icon(Icons.sort),
            onSelected: (value) {
              provider.setSort(value);
              provider.loadEvents(refresh: true);
            },
            itemBuilder: (_) => const [
              PopupMenuItem(value: 'newest', child: Text('Newest')),
              PopupMenuItem(value: 'date', child: Text('Event Date')),
              PopupMenuItem(
                value: 'price_low',
                child: Text('Price: Low to High'),
              ),
              PopupMenuItem(
                value: 'price_high',
                child: Text('Price: High to Low'),
              ),
            ],
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: provider.refresh,
        child: CustomScrollView(
          controller: _scrollController,
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: [
            SliverToBoxAdapter(
              child: Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 720),
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                    child: TextField(
                      controller: _searchCtrl,
                      focusNode: _searchFocus,
                      textInputAction: TextInputAction.search,
                      decoration: InputDecoration(
                        hintText: 'Search',
                        prefixIcon: const Icon(Icons.search),
                        suffixIcon: _searchCtrl.text.isNotEmpty
                            ? IconButton(
                                icon: const Icon(Icons.clear),
                                onPressed: () {
                                  _debounce?.cancel();
                                  _searchCtrl.clear();
                                  provider.applySearch('');
                                  setState(() {});
                                },
                              )
                            : null,
                      ),
                      onChanged: _onQueryChanged,
                      onSubmitted: (v) {
                        _debounce?.cancel();
                        provider.applySearch(v.trim());
                      },
                    ),
                  ),
                ),
              ),
            ),
            if (_holidays.isNotEmpty)
              SliverToBoxAdapter(child: _HolidayStrip(holidays: _holidays)),
            if (provider.isRefreshing)
              const SliverToBoxAdapter(
                child: LinearProgressIndicator(minHeight: 2),
              ),
            if (provider.isLoading && provider.events.isEmpty)
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: EventSkeletonGrid(count: columns * 3),
                ),
              )
            else if (provider.error != null && provider.events.isEmpty)
              SliverFillRemaining(
                hasScrollBody: false,
                child: _EmptyState(
                  icon: Icons.cloud_off,
                  title: 'Could not load events',
                  subtitle: provider.error!,
                  actionLabel: 'Retry',
                  onAction: () => provider.loadEvents(refresh: true),
                ),
              )
            else if (provider.events.isEmpty)
              SliverFillRemaining(
                hasScrollBody: false,
                child: _EmptyState(
                  icon: Icons.event_busy,
                  title: 'No events found',
                  subtitle: provider.filters.hasFilters
                      ? 'No events match your search and filters.'
                      : 'Try adjusting your search or check back later.',
                  actionLabel: provider.filters.hasFilters
                      ? 'Reset filters'
                      : 'Refresh',
                  onAction: () {
                    if (provider.filters.hasFilters) {
                      _searchCtrl.clear();
                      provider.clearFilters();
                    }
                    provider.loadEvents(refresh: true);
                  },
                ),
              )
            else ...[
              SliverPadding(
                key: _gridKey,
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                sliver: SliverGrid(
                  gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: columns,
                    mainAxisSpacing: 14,
                    crossAxisSpacing: 16,
                    mainAxisExtent: _cardExtent(context, columns),
                  ),
                  delegate: SliverChildBuilderDelegate((context, index) {
                    final event = provider.events[index];
                    return TweenAnimationBuilder<double>(
                      key: ValueKey(event.id),
                      tween: Tween(begin: 0, end: 1),
                      duration: Duration(milliseconds: 320 + (index % 4) * 65),
                      curve: Curves.easeOutCubic,
                      builder: (context, value, child) => Opacity(
                        opacity: value.clamp(0.0, 1.0),
                        child: Transform.translate(
                          offset: Offset(0, 20 * (1 - value)),
                          child: Transform.scale(
                            scale: 0.92 + 0.08 * value,
                            child: child,
                          ),
                        ),
                      ),
                      child: EventCard(
                        event: event,
                        onTap: () => _openEvent(context, event),
                        // Passed events offer no favorite affordance.
                        onFavorite: EventUtils.isPassed(event)
                            ? null
                            : () => _toggleFavorite(context, event),
                      ),
                    );
                  }, childCount: provider.events.length),
                ),
              ),
              SliverToBoxAdapter(
                child: _Pagination(
                  currentPage: provider.currentPage,
                  totalPages: provider.totalPages,
                  totalEvents: provider.total,
                  onGoToPage: _goToPage,
                ),
              ),
              const SliverToBoxAdapter(),
            ],
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
      onGiftTicket: () {
        Navigator.pop(context);
        openCheckoutForEvent(context, event, gift: true);
      },
    );
  }

  Future<void> _toggleFavorite(BuildContext context, EventModel event) async {
    try {
      await context.read<EventsProvider>().toggleFavorite(event);
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(e.toString())));
      }
    }
  }
}

/// Upcoming public holidays / festive days from the platform's Google Calendar
/// feed — the app-side equivalent of the website's holiday alerts.
class _HolidayStrip extends StatelessWidget {
  final List<Holiday> holidays;
  const _HolidayStrip({required this.holidays});

  @override
  Widget build(BuildContext context) {
    final upcoming = HolidayService.upcoming(holidays, count: 5);
    if (upcoming.isEmpty) return const SizedBox.shrink();
    final isToday = upcoming.first.date == _todayIso();

    return SizedBox(
      height: 44,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
        itemCount: upcoming.length,
        separatorBuilder: (_, _) => const SizedBox(width: 8),
        itemBuilder: (context, index) {
          final holiday = upcoming[index];
          final highlight = isToday && index == 0;
          return Container(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: highlight
                  ? AppTheme.primary.withValues(alpha: 0.10)
                  : AppTheme.bgCard,
              borderRadius: BorderRadius.circular(20),
              border: Border.all(
                color: highlight
                    ? AppTheme.primary.withValues(alpha: 0.35)
                    : const Color(0xFFE5E7EB),
              ),
            ),
            child: Text(
              '${holiday.emoji} ${highlight ? 'Today: ' : ''}${holiday.title} · ${holiday.friendlyDate}',
              style: TextStyle(
                fontSize: 12,
                fontWeight: highlight ? FontWeight.w700 : FontWeight.w600,
                color: highlight ? AppTheme.primary : AppTheme.textMain,
              ),
            ),
          );
        },
      ),
    );
  }

  static String _todayIso() {
    final now = DateTime.now();
    return '${now.year}-${now.month.toString().padLeft(2, '0')}-${now.day.toString().padLeft(2, '0')}';
  }
}

/// Numbered pager — same idea as the web discovery grid, so results are browsed
/// page by page instead of an endless scroll.
class _Pagination extends StatelessWidget {
  final int currentPage;
  final int totalPages;
  final int totalEvents;
  final void Function(int page) onGoToPage;

  const _Pagination({
    required this.currentPage,
    required this.totalPages,
    required this.totalEvents,
    required this.onGoToPage,
  });

  @override
  Widget build(BuildContext context) {
    if (totalPages <= 1) {
      return Padding(
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
        child: Center(
          child: Text(
            '$totalEvents event${totalEvents == 1 ? '' : 's'}',
            style: const TextStyle(color: AppTheme.textMuted, fontSize: 12.5),
          ),
        ),
      );
    }

    // Sliding window of page numbers around the current page.
    const window = 2;
    var start = (currentPage - window).clamp(1, totalPages);
    var end = (currentPage + window).clamp(1, totalPages);
    if (end - start < window * 2) {
      start = (end - window * 2).clamp(1, totalPages);
      end = (start + window * 2).clamp(1, totalPages);
    }
    final pages = [for (var p = start; p <= end; p++) p];

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 28),
      child: Column(
        children: [
          Text(
            'Page $currentPage of $totalPages · $totalEvents event${totalEvents == 1 ? '' : 's'}',
            style: const TextStyle(color: AppTheme.textMuted, fontSize: 12.5),
          ),
          const SizedBox(height: 10),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              IconButton(
                tooltip: 'Previous page',
                onPressed: currentPage > 1
                    ? () => onGoToPage(currentPage - 1)
                    : null,
                icon: const Icon(Icons.chevron_left),
              ),
              for (final page in pages)
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 3),
                  child: InkWell(
                    borderRadius: BorderRadius.circular(20),
                    onTap: page == currentPage ? null : () => onGoToPage(page),
                    child: Container(
                      width: 36,
                      height: 36,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        color: page == currentPage
                            ? AppTheme.primary
                            : Colors.transparent,
                        shape: BoxShape.circle,
                        border: Border.all(
                          color: page == currentPage
                              ? AppTheme.primary
                              : const Color(0xFFE5E7EB),
                        ),
                      ),
                      child: Text(
                        '$page',
                        style: TextStyle(
                          fontWeight: FontWeight.w700,
                          color: page == currentPage
                              ? Colors.white
                              : AppTheme.textMain,
                        ),
                      ),
                    ),
                  ),
                ),
              IconButton(
                tooltip: 'Next page',
                onPressed: currentPage < totalPages
                    ? () => onGoToPage(currentPage + 1)
                    : null,
                icon: const Icon(Icons.chevron_right),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// Discovery filters: category, state, priority tag and price bucket — the
/// same facets the website's sidebar offers.
class _FilterSheet extends StatefulWidget {
  final EventsProvider provider;
  const _FilterSheet({required this.provider});

  @override
  State<_FilterSheet> createState() => _FilterSheetState();
}

class _FilterSheetState extends State<_FilterSheet> {
  String? _category;
  String? _state;
  String? _priority;
  bool _freeOnly = false;
  int? _priceMin;
  int? _priceMax;
  int? _priceBucket; // index into EventUtils.priceBuckets

  @override
  void initState() {
    super.initState();
    final f = widget.provider.filters;
    _category = f.category;
    _state = f.state;
    _priority = f.priority;
    _freeOnly = f.freeOnly;
    _priceMin = f.priceMin;
    _priceMax = f.priceMax;
    for (var i = 0; i < EventUtils.priceBuckets.length; i++) {
      final b = EventUtils.priceBuckets[i];
      if (b.free == f.freeOnly &&
          b.min == f.priceMin &&
          b.max == f.priceMax &&
          b.free) {
        _priceBucket = i;
        break;
      }
      if (!b.free &&
          !f.freeOnly &&
          b.min == f.priceMin &&
          b.max == f.priceMax) {
        _priceBucket = i;
        break;
      }
    }
  }

  void _selectBucket(int? index) {
    setState(() {
      _priceBucket = index;
      if (index == null) {
        _freeOnly = false;
        _priceMin = null;
        _priceMax = null;
      } else {
        final b = EventUtils.priceBuckets[index];
        _freeOnly = b.free;
        _priceMin = b.min;
        _priceMax = b.max;
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final sheetHeight = MediaQuery.sizeOf(context).height * 0.85;
    return ConstrainedBox(
      constraints: BoxConstraints(maxHeight: sheetHeight, maxWidth: 720),
      child: Padding(
        padding: EdgeInsets.only(
          left: 20,
          right: 20,
          top: 16,
          bottom: MediaQuery.viewInsetsOf(context).bottom + 20,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Text(
                  'Filter events',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
                ),
                const Spacer(),
                TextButton(
                  onPressed: () {
                    setState(() {
                      _category = null;
                      _state = null;
                      _priority = null;
                      _freeOnly = false;
                      _priceMin = null;
                      _priceMax = null;
                      _priceBucket = null;
                    });
                  },
                  child: const Text('Reset'),
                ),
              ],
            ),
            const SizedBox(height: 4),
            Flexible(
              child: ListView(
                shrinkWrap: true,
                children: [
                  _label('Category'),
                  DropdownButtonFormField<String>(
                    initialValue: _category,
                    isExpanded: true,
                    hint: const Text('All categories'),
                    items: [
                      const DropdownMenuItem(
                        value: null,
                        child: Text('All categories'),
                      ),
                      for (final c in EventUtils.eventCategories)
                        DropdownMenuItem(value: c, child: Text(c)),
                    ],
                    onChanged: (v) => setState(() => _category = v),
                  ),
                  const SizedBox(height: 16),
                  _label('State'),
                  DropdownButtonFormField<String>(
                    initialValue: _state,
                    isExpanded: true,
                    hint: const Text('All states'),
                    items: [
                      const DropdownMenuItem(
                        value: null,
                        child: Text('All states'),
                      ),
                      for (final s in EventUtils.nigeriaStates)
                        DropdownMenuItem(value: s, child: Text(s)),
                    ],
                    onChanged: (v) => setState(() => _state = v),
                  ),
                  const SizedBox(height: 16),
                  _label('Priority'),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      for (final tag in EventUtils.priorityTags)
                        _filterChip(
                          label: tag,
                          selected: _priority == tag.toLowerCase(),
                          onSelected: (selected) => setState(
                            () =>
                                _priority = selected ? tag.toLowerCase() : null,
                          ),
                        ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  _label('Price'),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      _filterChip(
                        label: 'Any price',
                        selected: _priceBucket == null,
                        onSelected: (_) => _selectBucket(null),
                      ),
                      for (var i = 0; i < EventUtils.priceBuckets.length; i++)
                        _filterChip(
                          label: EventUtils.priceBuckets[i].label,
                          selected: _priceBucket == i,
                          onSelected: (_) => _selectBucket(i),
                        ),
                    ],
                  ),
                  const SizedBox(height: 24),
                ],
              ),
            ),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: () {
                  final p = widget.provider;
                  p.setCategory(_category);
                  p.setState(_state);
                  p.setPriority(_priority);
                  p.setPriceBucket(
                    freeOnly: _freeOnly,
                    min: _priceMin,
                    max: _priceMax,
                  );
                  p.loadEvents(refresh: true);
                  Navigator.pop(context, true);
                },
                child: const Text('Apply filters'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// Selected chips are filled with the brand blue and MUST read in white —
  /// the default chip styling kept a dark label on the blue background.
  Widget _filterChip({
    required String label,
    required bool selected,
    required ValueChanged<bool> onSelected,
  }) {
    return ChoiceChip(
      label: Text(label),
      selected: selected,
      onSelected: onSelected,
      showCheckmark: false,
      selectedColor: AppTheme.primary,
      backgroundColor: Colors.white,
      labelStyle: TextStyle(
        fontWeight: FontWeight.w600,
        color: selected ? Colors.white : AppTheme.textMain,
      ),
      side: BorderSide(
        color: selected ? AppTheme.primary : const Color(0xFFE5E7EB),
      ),
    );
  }

  Widget _label(String text) => Padding(
    padding: const EdgeInsets.only(bottom: 8),
    child: Text(text, style: const TextStyle(fontWeight: FontWeight.w700)),
  );
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
            Text(
              title,
              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 8),
            Text(
              subtitle,
              textAlign: TextAlign.center,
              style: const TextStyle(color: AppTheme.textMuted),
            ),
            const SizedBox(height: 20),
            ElevatedButton(onPressed: onAction, child: Text(actionLabel)),
          ],
        ),
      ),
    );
  }
}
