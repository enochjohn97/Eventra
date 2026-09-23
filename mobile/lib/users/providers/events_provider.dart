import 'package:flutter/foundation.dart';
import '../models/event_model.dart';
import '../services/event_cache_service.dart';
import '../services/user_event_service.dart';

class EventsProvider extends ChangeNotifier {
  final List<EventModel> events = [];
  bool isLoading = false;
  bool isLoadingMore = false;
  bool hasMore = true;

  /// True while the UI is showing the persisted cache preview and the fresh
  /// network fetch is still in flight.
  bool isRefreshing = false;

  String? error;
  String search = '';
  String sort = 'newest';
  int _page = 1;
  int _total = 0;
  static const int _pageSize = 12;

  String get _cacheKey =>
      EventCacheService.keyFor(sort: sort, search: search);

  Future<void> loadEvents({bool refresh = false}) async {
    if (isLoading || isLoadingMore) return;
    if (refresh) {
      _page = 1;
      hasMore = true;
    }
    if (!hasMore && !refresh) return;

    // Offline-friendly start: paint the cached first page immediately, then
    // let the network refresh replace it. The cache is only consulted when
    // the grid is empty (initial load), never over fresh data.
    if (_page == 1) {
      isLoading = true;
      error = null;
      notifyListeners();
      if (events.isEmpty) {
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

    try {
      final result = await UserEventService.fetchEvents(
        page: _page,
        limit: _pageSize,
        search: search.isEmpty ? null : search,
        sort: sort,
      );
      if (_page == 1) {
        events
          ..clear()
          ..addAll(result.events);
        isRefreshing = false;
        // Persist only the first page — it's the one the next launch shows.
        EventCacheService.instance.savePage(_cacheKey, result.events);
      } else {
        events.addAll(result.events);
      }
      _total = result.total;
      hasMore = events.length < _total;
      _page++;
      error = null;
    } catch (e) {
      error = e.toString().replaceFirst('Exception: ', '');
      // Keep cached events visible; only surface the error when there is
      // nothing to show at all.
      if (events.isNotEmpty && _page == 1) isRefreshing = false;
    } finally {
      isLoading = false;
      isLoadingMore = false;
      notifyListeners();
    }
  }

  Future<void> refresh() => loadEvents(refresh: true);

  void setSearch(String value) {
    search = value;
  }

  void setSort(String value) {
    sort = value;
  }

  Future<void> searchAndReload() => loadEvents(refresh: true);

  Future<bool> toggleFavorite(EventModel event) async {
    try {
      final isFav = await UserEventService.toggleFavorite(event.id);
      final index = events.indexWhere((e) => e.id == event.id);
      if (index >= 0) {
        events[index] = events[index].copyWith(isFavorite: isFav);
        notifyListeners();
        // Keep the cache's favorite flags roughly in sync; a failed write is
        // harmless since the next successful refresh overwrites the page.
        EventCacheService.instance.savePage(_cacheKey, events.take(_pageSize).toList());
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
