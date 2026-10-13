import 'dart:convert';
import 'package:dio/dio.dart';
import '../../core/network/api_client.dart';
import '../../core/storage/secure_storage.dart';
import '../models/event_model.dart';

Map<String, dynamic> _toMap(dynamic raw) {
  if (raw is Map<String, dynamic>) return raw;
  if (raw is Map) return Map<String, dynamic>.from(raw);
  if (raw is String) {
    try {
      return jsonDecode(raw) as Map<String, dynamic>;
    } on FormatException {
      throw Exception(
        'EventOut server returned an invalid response. Please try again.',
      );
    }
  }
  throw Exception('Unexpected response format: ${raw.runtimeType}');
}

class UserEventService {
  static final Dio _dio = ApiClient().dio;
  static String? get _origin => ApiClient().baseOrigin;

  /// Server-side discovery query. Any filter present is applied by the
  /// backend (same rules the web sidebar uses), so paging stays correct
  /// instead of filtering only the 12 items already on screen.
  static Future<({List<EventModel> events, int total})> fetchEvents({
    int page = 1,
    int limit = 12,
    String? search,
    String? sort,
    String? category,
    String? state,
    String? priority,
    bool freeOnly = false,
    int? priceMin,
    int? priceMax,
  }) async {
    final params = <String, dynamic>{
      'page': page,
      'limit': limit,
      if (sort != null && sort.isNotEmpty) 'sort': sort,
      // `search` is what makes the router use the search handler; the filter
      // params below are understood by that handler even without a keyword.
      if (search != null && search.isNotEmpty) 'search': search,
      if (category != null && category.isNotEmpty) 'category': category,
      if (state != null && state.isNotEmpty) 'state': state,
      if (priority != null && priority.isNotEmpty) 'priority': priority,
      if (freeOnly) 'free': '1',
      'price_min': ?priceMin,
      'price_max': ?priceMax,
    };

    late Response<dynamic> response;
    try {
      response = await _dio.get('/events', queryParameters: params);
    } on DioException catch (error) {
      throw Exception(error.message ?? 'Failed to load events');
    }
    final data = _toMap(response.data);
    if (data['success'] != true) {
      throw Exception(data['message']?.toString() ?? 'Failed to load events');
    }

    final list = (data['events'] as List? ?? [])
        .map(
          (e) => EventModel.fromJson(
            Map<String, dynamic>.from(e as Map),
            baseOrigin: _origin,
          ),
        )
        .toList();
    final total = int.tryParse(data['total']?.toString() ?? '') ?? list.length;
    return (events: list, total: total);
  }

  static Future<EventModel> fetchEventDetails(int id) async {
    final response = await _dio.get('/events/$id');
    final data = _toMap(response.data);
    if (data['success'] != true || data['event'] == null) {
      throw Exception(data['message']?.toString() ?? 'Event not found');
    }
    return EventModel.fromJson(
      Map<String, dynamic>.from(data['event'] as Map),
      baseOrigin: _origin,
    );
  }

  static Future<bool> toggleFavorite(int eventId) async {
    final response = await _dio.post(
      '/favorites/toggle',
      data: {'event_id': eventId},
    );
    final data = _toMap(response.data);
    return data['is_favorite'] == true;
  }

  /// Removes every favorite for the signed-in user ("Clear all" on the
  /// Favorites tab). Returns how many rows the server deleted.
  static Future<int> clearFavorites() async {
    final response = await _dio.post(
      '/favorites/toggle',
      data: {'clear_all': true},
    );
    final data = _toMap(response.data);
    if (data['success'] != true) {
      throw Exception(
        data['message']?.toString() ?? 'Failed to clear favorites',
      );
    }
    return int.tryParse(data['cleared']?.toString() ?? '') ?? 0;
  }

  static Future<List<EventModel>> fetchFavorites({
    int page = 1,
    int limit = 50,
  }) async {
    try {
      final response = await _dio.get(
        '/favorites',
        queryParameters: {'page': page, 'limit': limit},
      );
      final data = _toMap(response.data);
      if (data['success'] != true) {
        throw Exception(
          data['message']?.toString() ?? 'Failed to load favorites',
        );
      }
      final records = (data['events'] as List? ?? [])
          .map((event) => Map<String, dynamic>.from(event as Map))
          .toList();
      await SecureStorage.savePrivateList('favorites', records);
      return records
          .map((event) => EventModel.fromJson(event, baseOrigin: _origin))
          .toList();
    } on DioException catch (error) {
      if (!_isOffline(error)) {
        throw Exception(error.message ?? 'Failed to load favorites');
      }
      final cached = await SecureStorage.getPrivateList('favorites');
      if (cached == null) {
        throw Exception(error.message ?? 'Failed to load favorites');
      }
      return cached
          .map((event) => EventModel.fromJson(event, baseOrigin: _origin))
          .toList();
    }
  }

  static bool _isOffline(DioException error) =>
      error.type == DioExceptionType.connectionError ||
      error.type == DioExceptionType.connectionTimeout ||
      error.type == DioExceptionType.receiveTimeout ||
      error.type == DioExceptionType.sendTimeout;
}
