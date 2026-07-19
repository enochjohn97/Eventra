import 'package:dio/dio.dart';
import '../../core/network/api_client.dart';
import 'dart:io';

class ClientEventService {
  static final Dio _dio = ApiClient().dio;

  static Future<bool> createEvent(Map<String, dynamic> data, {File? coverImage}) async {
    try {
      FormData formData = FormData.fromMap(data);
      if (coverImage != null) {
        formData.files.add(MapEntry(
          'cover_image',
          await MultipartFile.fromFile(coverImage.path),
        ));
      }
      final response = await _dio.post('/events/create-event.php', data: formData);
      return response.statusCode == 200 || response.statusCode == 201;
    } catch (e) {
      return false;
    }
  }

  static Future<bool> updateEvent(String eventId, Map<String, dynamic> data) async {
    try {
      data['event_id'] = eventId;
      final response = await _dio.post('/events/update-event.php', data: data);
      return response.statusCode == 200;
    } catch (e) {
      return false;
    }
  }

  static Future<bool> deleteEvent(String eventId) async {
    try {
      final response = await _dio.post('/events/delete-event.php', data: {'event_id': eventId});
      return response.statusCode == 200;
    } catch (e) {
      return false;
    }
  }
}
