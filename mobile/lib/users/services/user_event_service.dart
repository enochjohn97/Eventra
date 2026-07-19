import 'package:dio/dio.dart';
import '../../core/network/api_client.dart';

class UserEventService {
  static final Dio _dio = ApiClient().dio;

  static Future<List<dynamic>?> getEvents() async {
    try {
      final response = await _dio.get('/events/get-events.php');
      if (response.statusCode == 200 && response.data is List) {
        return response.data;
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  static Future<Map<String, dynamic>?> getEventDetails(String eventId) async {
    try {
      final response = await _dio.get('/events/get-event-details.php', queryParameters: {
        'event_id': eventId,
      });
      if (response.statusCode == 200) {
        return response.data;
      }
      return null;
    } catch (e) {
      return null;
    }
  }
}
