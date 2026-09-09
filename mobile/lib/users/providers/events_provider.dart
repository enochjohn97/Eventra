import 'package:flutter/foundation.dart';
import '../models/event_model.dart';
import '../services/user_event_service.dart';

class EventsProvider extends ChangeNotifier {
  final List<EventModel> events = [];
  bool isLoading = false;
  bool isLoadingMore = false;
  bool hasMore = true;
  String? error;
  String search = '';
  String sort = 'newest';
  int _page = 1;
  int _total = 0;
  static const int _pageSize = 12;

  Future<void> loadEvents({bool refresh = false}) async {
    if (refresh) {
      _page = 1;
      hasMore = true;
      events.clear();
    }
    if (!hasMore && !refresh) return;

    if (_page == 1) {
      isLoading = true;
    } else {
      isLoadingMore = true;
    }
    error = null;
    notifyListeners();

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
      } else {
        events.addAll(result.events);
      }
      _total = result.total;
      hasMore = events.length < _total;
      _page++;
    } catch (e) {
      error = e.toString().replaceFirst('Exception: ', '');
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
