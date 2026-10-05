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

  /// EvenOut platform fee applied to every base price so the app shows the
  /// same amount the buyer is charged (identical to the web app's math).
  static double applyPlatformFee(double base) => base > 0 ? (base * 1.1).roundToDouble() : 0;

  /// Active ticket tiers for an event, in display order.
  static List<String> activeTiers(EventModel event) {
    final modes = (event.ticketTypeMode ?? 'all')
        .split(',')
        .map((m) => m.trim().toLowerCase())
        .where((m) => m.isNotEmpty)
        .toList();
    if (modes.isEmpty || modes.contains('all')) {
      return ['regular', 'vip', 'premium'];
    }
    return modes;
  }

  /// Base price for a tier (before the platform fee).
  static double basePriceForTier(EventModel event, String tier) {
    switch (tier) {
      case 'vip':
        return event.vipPrice ?? 0;
      case 'premium':
        return event.premiumPrice ?? 0;
      default:
        return event.regularPrice ?? event.price;
    }
  }

  /// Tier display label, e.g. "Regular, VIP" — mirrors the web card label.
  static String tierLabel(EventModel event) {
    final tiers = activeTiers(event);
    return tiers.map((t) => t[0].toUpperCase() + t.substring(1)).join(', ');
  }

  /// Card/summary price exactly like the web app:
  ///  * "all" mode      → legacy price + fee, or "Free"
  ///  * explicit tiers  → "₦min - ₦max" over the ACTIVE tiers (+ fee)
  static String formatPrice(EventModel event) {
    final tiers = activeTiers(event);
    final isAll = tiers.length == 3;

    if (isAll) {
      final withFee = applyPlatformFee(event.price);
      return withFee > 0 ? '₦${_comma(withFee)}' : 'Free';
    }

    final prices = tiers
        .map((t) => applyPlatformFee(basePriceForTier(event, t)))
        .where((p) => p > 0)
        .toList()
      ..sort();

    if (prices.isEmpty) {
      // Tiers exist but all priced 0 — fall back to legacy price.
      final withFee = applyPlatformFee(event.price);
      return withFee > 0 ? '₦${_comma(withFee)}' : 'Free';
    }
    if (prices.length == 1) return '₦${_comma(prices.first)}';
    return '₦${_comma(prices.first)} - ₦${_comma(prices.last)}';
  }

  /// True when the event charges nothing across every active tier.
  static bool isFree(EventModel event) => !formatPrice(event).startsWith('₦');

  /// Upcoming / Sold Out / Passed — same rules as the web cards.
  static ({String label, int colorValue}) statusBadge(EventModel event) {
    final today = DateTime.now();
    final todayMid = DateTime(today.year, today.month, today.day);
    DateTime? evDay;
    if (event.eventDate != null && event.eventDate!.isNotEmpty) {
      try {
        evDay = DateTime.parse(event.eventDate!.split(' ').first);
      } catch (_) {}
    }
    if (evDay != null && evDay.isBefore(todayMid)) {
      return (label: 'Passed', colorValue: 0xFF6B7280);
    }
    if (event.isSoldOut) {
      return (label: 'Sold Out', colorValue: 0xFFEF4444);
    }
    return (label: 'Upcoming', colorValue: 0xFF722F37);
  }

  /// Priority tag exactly as the web renders it: server label is
  /// authoritative; "upcoming" is never shown as a badge; icons match.
  static String? priorityBadge(EventModel event) {
    final raw = (event.priorityLabel ?? '').trim();
    if (raw.isEmpty) return null;
    if (raw.toLowerCase().contains('upcoming')) return null;
    return raw;
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
