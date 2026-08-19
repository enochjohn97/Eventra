import 'package:flutter/foundation.dart';
import '../models/event_model.dart';
import '../services/user_event_service.dart';

class FavoritesProvider extends ChangeNotifier {
  List<EventModel> favorites = [];
  bool isLoading = false;
  String? error;

  Future<void> load() async {
    isLoading = true;
    error = null;
    notifyListeners();
    try {
      favorites = await UserEventService.fetchFavorites();
    } catch (e) {
      error = e.toString().replaceFirst('Exception: ', '');
    } finally {
      isLoading = false;
      notifyListeners();
    }
  }

  Future<void> removeFavorite(EventModel event) async {
    try {
      await UserEventService.toggleFavorite(event.id);
      favorites.removeWhere((e) => e.id == event.id);
      notifyListeners();
    } catch (e) {
      error = e.toString();
      notifyListeners();
      rethrow;
    }
  }
}
