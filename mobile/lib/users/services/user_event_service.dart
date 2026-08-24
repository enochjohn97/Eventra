import 'dart:convert';
import 'package:dio/dio.dart';
import '../../core/network/api_client.dart';
import '../models/event_model.dart';

Map<String, dynamic> _toMap(dynamic raw) {
  if (raw is Map<String, dynamic>) return raw;
  if (raw is Map) return Map<String, dynamic>.from(raw);
  if (raw is String) return jsonDecode(raw) as Map<String, dynamic>;
  throw Exception('Unexpected response format: ${raw.runtimeType}');
}

class UserEventService {
  static final Dio _dio = ApiClient().dio;
  static String? get _origin => ApiClient().baseOrigin;

  static Future<({List<EventModel> events, int total})> fetchEvents({
    int page = 1,
    int limit = 12,
    String? search,
    String? sort,
  }) async {
    final params = <String, dynamic>{
      'page': page,
      'limit': limit,
      if (sort != null && sort.isNotEmpty) 'sort': sort,
      if (search != null && search.isNotEmpty) 'search': search,
    };

    final response = await _dio.get('/events', queryParameters: params);
    final data = _toMap(response.data);
    if (data['success'] != true) {
      throw Exception(data['message']?.toString() ?? 'Failed to load events');
    }

    final list = (data['events'] as List? ?? [])
        .map((e) => EventModel.fromJson(Map<String, dynamic>.from(e as Map), baseOrigin: _origin))
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
    final response = await _dio.post('/favorites/toggle', data: {'event_id': eventId});
    final data = _toMap(response.data);
    return data['is_favorite'] == true;
  }

  static Future<List<EventModel>> fetchFavorites({int page = 1, int limit = 50}) async {
    final response = await _dio.get('/favorites', queryParameters: {'page': page, 'limit': limit});
    final data = _toMap(response.data);
    if (data['success'] != true) {
      throw Exception(data['message']?.toString() ?? 'Failed to load favorites');
    }
    return (data['events'] as List? ?? [])
        .map((e) => EventModel.fromJson(Map<String, dynamic>.from(e as Map), baseOrigin: _origin))
        .toList();
  }
}
