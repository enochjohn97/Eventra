import 'package:flutter/foundation.dart';
import '../../core/network/endpoint_resolver.dart';
import '../models/event_model.dart';
import '../services/event_cache_service.dart';
import '../services/user_event_service.dart';

/// Active discovery filters. Mirrors the web app's sidebar (category, state,
/// priority, price) and sort dropdown so the app and website return the same
/// events for the same selections.
class EventFilters {
  String search = '';
  String sort = 'newest';
  String? category;
  String? state;

  /// featured | hot | trending | nearby | upcoming
  String? priority;
  bool freeOnly = false;
  int? priceMin;
  int? priceMax;

  int get activeCount => [
    if (search.trim().isNotEmpty) search,
    if (category != null) category,
    if (state != null) state,
    if (priority != null) priority,
    if (freeOnly) 'free',
    if (priceMin != null || priceMax != null) 'price',
  ].length;

  bool get hasFilters => activeCount > 0;

  void clear() {
    search = '';
    sort = 'newest';
    category = null;
    state = null;
    priority = null;
    freeOnly = false;
    priceMin = null;
    priceMax = null;
  }
}

class EventsProvider extends ChangeNotifier {
  final List<EventModel> events = [];
  final EventFilters filters = EventFilters();

  bool isLoading = false;
  bool isLoadingMore = false;

  /// True while the UI is showing the persisted cache preview and the fresh
  /// network fetch is still in flight.
  bool isRefreshing = false;

  String? error;
  int _total = 0;
  int _page = 1;
  int _requestId = 0;
  static const int pageSize = 12;

  // ── Convenience accessors kept for the existing screens ──────────────────
  String get search => filters.search;
  String get sort => filters.sort;

  /// Pages available on the server for the current filters (at least 1).
  int get totalPages => _total <= 0 ? 1 : ((_total + pageSize - 1) ~/ pageSize);

  int get currentPage => _page;
  int get total => _total;

  String get _cacheKey => EventCacheService.keyFor(
    sort: filters.sort,
    search: filters.search,
  );

  /// Loads the current page. `refresh` restarts from page 1.
  Future<void> loadEvents({bool refresh = false}) async {
    if (isLoading || isLoadingMore) return;
    if (refresh) _page = 1;

    final requestId = ++_requestId;

    if (_page == 1) {
      isLoading = true;
      error = null;
      notifyListeners();
      // Offline-friendly start: paint the cached first page immediately, then
      // let the network refresh replace it. The cache is only consulted when
      // the grid is empty (initial load), never over fresh data.
      if (events.isEmpty && !filters.hasFilters) {
        final cached = await EventCacheService.instance.loadPage(_cacheKey);
        if (cached != null && cached.isNotEmpty && events.isEmpty) {
          events
            ..clear()
            ..addAll(cached);
          isRefreshing = true;
          notifyListeners();
        }
      }
    } else {
      isLoadingMore = true;
      notifyListeners();
    }

    // The live host is a shared box that is occasionally still waking up, so an
    // empty first page retries by itself before surfacing an error. Without
    // this, opening the app before the host answered left the discovery grid
    // stuck on its skeleton until the user manually pulled to refresh.
    const maxAttempts = 4;
    for (var attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        // Bounded so a host that accepts the connection but never answers
        // cannot pin the grid on its skeleton — the timeout surfaces as a
        // failure and the loop retries instead of waiting minutes.
        final result = await UserEventService.fetchEvents(
          page: _page,
          limit: pageSize,
          search: filters.search.trim().isEmpty ? null : filters.search.trim(),
          sort: filters.sort,
          category: filters.category,
          state: filters.state,
          priority: filters.priority,
          freeOnly: filters.freeOnly,
          priceMin: filters.priceMin,
          priceMax: filters.priceMax,
        ).timeout(const Duration(seconds: 22));
        // A newer request (keystroke / page change) won the race — drop this one.
        if (requestId != _requestId) return;

        events
          ..clear()
          ..addAll(result.events);
        isRefreshing = false;
        _total = result.total;
        _page = _page.clamp(1, totalPages);
        error = null;
        // Persist only the unfiltered first page — it's the one the next launch
        // shows, and cached filter results would be misleading.
        if (_page == 1 && !filters.hasFilters) {
          EventCacheService.instance.savePage(_cacheKey, result.events);
        }
        break;
      } catch (e) {
        if (requestId != _requestId) return;
        // Keep retrying only while there is nothing on screen to replace it;
        // a failed page-change or pull-to-refresh reports immediately.
        final willRetry = attempt < maxAttempts && events.isEmpty;
        if (willRetry) {
          // The dev server may have started after the app did (or the phone
          // just joined the Wi-Fi). Re-run host discovery so the retry can
          // actually land on it instead of repeating a dead address.
          await EndpointResolver.resolve(force: true);
          await Future<void>.delayed(Duration(seconds: attempt * 2));
          if (requestId != _requestId) return;
          continue;
        }
        error = e.toString().replaceFirst('Exception: ', '');
        if (events.isNotEmpty && _page == 1) isRefreshing = false;
      }
    }
    // Clear the busy flags for this request — success or final failure.
    if (requestId == _requestId) {
      isLoading = false;
      isLoadingMore = false;
      notifyListeners();
    }
  }

  Future<void> refresh() => loadEvents(refresh: true);

  /// Jump to a specific result page (1-based); keeps the current filters.
  Future<void> goToPage(int page) async {
    final target = page.clamp(1, totalPages);
    if (target == _page) return;
    _page = target;
    events.clear();
    notifyListeners();
    await loadEvents();
  }

  void setSearch(String value) {
    if (filters.search == value) return;
    filters.search = value;
  }

  void setSort(String value) {
    filters.sort = value;
  }

  void setCategory(String? value) {
    filters.category = value;
  }

  void setState(String? value) {
    filters.state = value;
  }

  void setPriority(String? value) {
    filters.priority = value;
  }

  void setPriceBucket({required bool freeOnly, int? min, int? max}) {
    filters.freeOnly = freeOnly;
    filters.priceMin = min;
    filters.priceMax = max;
  }

  void clearFilters() {
    filters.clear();
    _page = 1;
  }

  /// Live search: called from the search field after a short debounce.
  Future<void> applySearch(String value) {
    setSearch(value);
    return loadEvents(refresh: true);
  }

  Future<void> applyFilters() => loadEvents(refresh: true);

  Future<bool> toggleFavorite(EventModel event) async {
    try {
      final isFav = await UserEventService.toggleFavorite(event.id);
      final index = events.indexWhere((e) => e.id == event.id);
      if (index >= 0) {
        events[index] = events[index].copyWith(isFavorite: isFav);
        notifyListeners();
        // Keep the cache's favorite flags roughly in sync; a failed write is
        // harmless since the next successful refresh overwrites the page.
        EventCacheService.instance.savePage(_cacheKey, events.take(pageSize).toList());
      }
      return isFav;
    } catch (e) {
      error = e.toString();
      notifyListeners();
      rethrow;
    }
  }

  void updateFavoriteState(int eventId, bool isFavorite) {
    final index = events.indexWhere((e) => e.id == eventId);
    if (index >= 0) {
      events[index] = events[index].copyWith(isFavorite: isFavorite);
      notifyListeners();
    }
  }
}
