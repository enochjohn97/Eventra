import 'package:intl/intl.dart';
import '../../users/models/event_model.dart';

class EventUtils {
  /// Filter vocabularies — identical to the web app (public/js/utils.js) so a
  /// filter chosen in the app matches the same events the website returns.
  static const List<String> nigeriaStates = [
    'Abia',
    'Adamawa',
    'Akwa Ibom',
    'Anambra',
    'Bauchi',
    'Bayelsa',
    'Benue',
    'Borno',
    'Cross River',
    'Delta',
    'Ebonyi',
    'Edo',
    'Ekiti',
    'Enugu',
    'Gombe',
    'Imo',
    'Jigawa',
    'Kaduna',
    'Kano',
    'Katsina',
    'Kebbi',
    'Kogi',
    'Kwara',
    'Lagos',
    'Nasarawa',
    'Niger',
    'Ogun',
    'Ondo',
    'Osun',
    'Oyo',
    'Plateau',
    'Rivers',
    'Sokoto',
    'Taraba',
    'Yobe',
    'Zamfara',
    'FCT',
  ];

  static const List<String> eventCategories = [
    'Conference',
    'Workshop',
    'Seminar',
    'Entertainment',
    'Sport & Fitness',
    'Exhibition',
    'Networking',
    'Festival',
    'Concert',
    'Business',
    'Education',
    'Social',
    'Personal',
    'Community',
    'Religion',
    'Cultural',
    'Technology',
    'Art',
    'Health',
    'Food',
    'Agriculture',
    'Tourism',
    'Fashion',
    'Real Estate',
    'Awards',
    'Charity',
    'Finance',
    'Gaming',
    'Political',
    'Creative',
    'Entrepreneurship & Innovation',
    'Other',
  ];

  /// Priority tags exactly as the web offers them.
  static const List<String> priorityTags = [
    'Featured',
    'Hot',
    'Trending',
    'Nearby',
    'Upcoming',
  ];

  /// Price buckets used by the app's filter sheet. Values are the backend
  /// contract: free / price_max / price_min+price_max.
  static const List<({String label, bool free, int? min, int? max})>
  priceBuckets = [
    (label: 'Free', free: true, min: null, max: null),
    (label: 'Under ₦5,000', free: false, min: null, max: 5000),
    (label: '₦5,000 – ₦20,000', free: false, min: 5000, max: 20000),
    (label: '₦20,000 – ₦50,000', free: false, min: 20000, max: 50000),
    (label: '₦50,000+', free: false, min: 50000, max: null),
  ];

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

  /// EventOut platform fee applied to every base price so the app shows the
  /// same amount the buyer is charged (identical to the web app's math).
  static double applyPlatformFee(double base) =>
      base > 0 ? (base * 1.1).roundToDouble() : 0;

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
  ///
  /// Tier prices are stored in two places: the legacy `event.price` column and
  /// the merged top-level tier fields the backend expands from event metadata
  /// (`regular_price / vip_price / premium_price`). The web card reads those
  /// expanded fields, so this must too — otherwise every tiered paid event with
  /// `price = 0` in the legacy column is wrongly shown as FREE.
  static String formatPrice(EventModel event) {
    final tiers = activeTiers(event);
    final configuredModes = (event.ticketTypeMode ?? 'all')
        .split(',')
        .map((mode) => mode.trim().toLowerCase())
        .where((mode) => mode.isNotEmpty)
        .toList();
    final isLegacySinglePrice =
        configuredModes.isEmpty || configuredModes.contains('all');

    if (isLegacySinglePrice) {
      // Legacy single price applies the platform fee, same as the web card.
      final withFee = applyPlatformFee(event.price);
      if (withFee > 0) return '₦${_comma(withFee)}';
    }

    final prices =
        tiers
            .map((t) => applyPlatformFee(basePriceForTier(event, t)))
            .where((p) => p > 0)
            .toList()
          ..sort();

    if (prices.isEmpty) {
      // Tiers exist but every active tier is priced 0 — fall back to the
      // legacy price so a tiered event priced only on the legacy column still
      // renders its real amount instead of becoming FREE.
      final withFee = applyPlatformFee(event.price);
      if (withFee > 0) return '₦${_comma(withFee)}';
      return event.isFree == false ? 'Price unavailable' : 'Free';
    }
    if (prices.length == 1) return '₦${_comma(prices.first)}';
    return '₦${_comma(prices.first)} - ₦${_comma(prices.last)}';
  }

  /// True when the event charges nothing across every active tier.
  static bool isFree(EventModel event) {
    final modes = activeTiers(event);
    if (modes.any((tier) => basePriceForTier(event, tier) > 0) ||
        event.price > 0) {
      return false;
    }
    return event.isFree ?? true;
  }

  /// True when the event's date is already behind today (same rule as the web).
  static bool isPassed(EventModel event) =>
      statusBadge(event).label == 'Passed';

  /// Passed events cannot be bought into and offer no share/favorite affordances.
  static bool canBuyTickets(EventModel event) =>
      !isPassed(event) && !event.isSoldOut;

  /// The web shows the tier picker only when the organizer enabled MORE THAN
  /// ONE specific tier — `all` means the legacy single price, so no picker.
  static bool showTierSelector(EventModel event) {
    final modes = (event.ticketTypeMode ?? 'all')
        .split(',')
        .map((m) => m.trim().toLowerCase())
        .where((m) => m.isNotEmpty)
        .toList();
    return modes.length > 1 && !modes.contains('all');
  }

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
    if (isPassed(event)) return null;
    final raw = (event.priorityLabel ?? '').trim();
    if (raw.isEmpty) return null;
    if (raw.toLowerCase().contains('upcoming')) return null;
    return raw;
  }

  /// Fee-inclusive price for one tier, e.g. "₦2,200" or "Free".
  static String tierPriceLabel(EventModel event, String tier) {
    final withFee = applyPlatformFee(basePriceForTier(event, tier));
    return withFee > 0 ? '₦${_comma(withFee)}' : 'Free';
  }

  static String tierName(String tier) =>
      tier.isEmpty ? tier : tier[0].toUpperCase() + tier.substring(1);

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
