import 'package:intl/intl.dart';
import '../../users/models/event_model.dart';

class EventUtils {
  static String formatDate(String? dateStr) {
    if (dateStr == null || dateStr.isEmpty) return 'Date TBA';
    try {
      final date = DateTime.parse(dateStr.split('T').first);
      return DateFormat('EEE, MMM d, yyyy').format(date);
    } catch (_) {
      return dateStr;
    }
  }

  static String formatTime(String? timeStr) {
    if (timeStr == null || timeStr.isEmpty) return 'Time TBA';
    try {
      final parts = timeStr.split(':');
      if (parts.length >= 2) {
        var hours = int.parse(parts[0]);
        final minutes = parts[1];
        final ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12;
        if (hours == 0) hours = 12;
        return '$hours:$minutes $ampm';
      }
    } catch (_) {}
    return timeStr;
  }

  static String formatPrice(EventModel event) {
    final modes = (event.ticketTypeMode ?? 'all')
        .split(',')
        .map((m) => m.trim().toLowerCase())
        .where((m) => m.isNotEmpty)
        .toList();

    if (modes.isEmpty || modes.contains('all')) {
      return event.price > 0 ? '₦${_comma(event.price)}' : 'Free';
    }

    final prices = <double>[];
    if (modes.contains('regular')) prices.add(event.regularPrice ?? event.price);
    if (modes.contains('vip')) prices.add(event.vipPrice ?? 0);
    if (modes.contains('premium')) prices.add(event.premiumPrice ?? 0);
    prices.removeWhere((p) => p <= 0);

    if (prices.isEmpty) return 'Free';
    prices.sort();
    if (prices.length == 1) return '₦${_comma(prices.first)}';
    return '₦${_comma(prices.first)} - ₦${_comma(prices.last)}';
  }

  static String _comma(double value) {
    final fmt = NumberFormat('#,##0', 'en_NG');
    return fmt.format(value);
  }

  static String venueLine(EventModel event) {
    final parts = <String>{};
    for (final value in [event.location, event.address, event.state]) {
      if (value != null && value.trim().isNotEmpty) {
        parts.add(value.trim());
      }
    }
    return parts.isEmpty ? 'Venue TBA' : parts.join(', ');
  }

  static String mapsQuery(EventModel event) {
    if (event.latitude != null && event.longitude != null) {
      return '${event.latitude},${event.longitude}';
    }
    return venueLine(event);
  }
}
