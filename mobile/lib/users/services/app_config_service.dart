import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../core/network/api_client.dart';
import '../../core/network/endpoint_resolver.dart';

class AppConfigService {
  static final Dio _dio = ApiClient().dio;

  static Future<({String googleClientId, String mapsApiKey,
      String paystackPublicKey, String paystackMode, bool paystackIsTestMode,
      String appUrl})> load() async {
    final response = await _dio.get('/config/app');
    final raw = response.data;
    final data = raw is Map<String, dynamic>
        ? raw
        : raw is String
            ? (jsonDecode(raw) as Map<String, dynamic>)
            : throw Exception('Unexpected config response format');
    if (data['success'] != true) {
      throw Exception(data['message']?.toString() ?? 'Failed to load app configuration');
    }
    // The backend reports its own Wi-Fi address here. Remembering it lets the
    // app move off the USB-only loopback and keep talking to the local PHP
    // server with the cable unplugged. Never feed `app_url` back in: on local
    // it is the request host, which would just re-pin loopback.
    EndpointResolver.rememberLanOrigin(data['lan_url']?.toString());

    return (
      googleClientId: data['client_id']?.toString() ?? '',
      mapsApiKey: data['maps_api_key']?.toString() ?? '',
      paystackPublicKey: data['paystack_public_key']?.toString() ?? '',
      paystackMode: data['paystack_mode']?.toString() ?? '',
      paystackIsTestMode: (data['paystack_is_test_mode'] ?? false) == true,
      appUrl: data['app_url']?.toString() ?? ApiClient().baseOrigin ?? '',
    );
  }
}

/// One calendar entry (public holiday / festive period) from the platform's
/// Google Calendar feed.
class Holiday {
  final String date; // yyyy-MM-dd
  final String title;
  final String description;

  const Holiday({required this.date, required this.title, this.description = ''});

  DateTime? get day => DateTime.tryParse(date);

  factory Holiday.fromJson(Map<String, dynamic> json) => Holiday(
        date: json['date']?.toString() ?? '',
        title: json['title']?.toString() ?? '',
        description: json['description']?.toString() ?? '',
      );

  /// Festive emoji, identical mapping to the web's holiday alerts.
  String get emoji {
    final t = title.toLowerCase();
    if (t.contains('christmas')) return '🎄';
    if (t.contains('eid') ||
        t.contains('el-fitr') ||
        t.contains('id el') ||
        t.contains('kabir') ||
        t.contains('maulud') ||
        t.contains('ramadan') ||
        t.contains('sallah') ||
        t.contains('al-hijra')) {
      return '🌙';
    }
    if (t.contains('new year')) return '🎆';
    if (t.contains('easter') || t.contains('good friday') || t.contains('ash wednesday')) {
      return '☝';
    }
    if (t.contains('valentine')) return '❤️';
    if (t.contains('democracy') ||
        t.contains('national day') ||
        t.contains('workers') ||
        t.contains('children')) {
      return '🇳🇬';
    }
    if (t.contains('box')) return '🎁';
    return '🎉';
  }

  /// Greeting used by the alert, mirroring the web implementation.
  String? get greeting {
    final t = title.toLowerCase();
    if (t.contains('christmas')) return 'Merry Christmas!';
    if (t.contains('el-fitr') || t.contains('fitr') || t.contains('id el fitr')) {
      return 'Eid Mubarak! Happy Sallah!';
    }
    if (t.contains('kabir') || t.contains('adha')) return 'Eid al-Adha Mubarak! Happy Sallah!';
    if (t.contains('maulud') || t.contains('mawlid')) return 'Happy Maulud Nabi!';
    if (t.contains('ramadan')) return 'Ramadan Kareem!';
    if (t.contains('new year')) return 'Happy New Year!';
    if (t.contains('good friday')) return 'Blessed Good Friday.';
    if (t.contains('easter')) return 'Happy Easter!';
    if (t.contains('valentine')) return "Happy Valentine's Day!";
    return null;
  }

  /// "Mon, Dec 25, 2026" style label for chips.
  String get friendlyDate {
    final d = day;
    if (d == null) return date;
    const months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ];
    const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    return '${weekdays[d.weekday - 1]}, ${months[d.month - 1]} ${d.day}';
  }
}

/// Google Calendar holiday feed: public holidays and festive periods, the same
/// data the website turns into dashboard toasts. Alerts fire once per holiday
/// per install (persisted), so navigating the app never repeats them.
class HolidayService {
  static final Dio _dio = ApiClient().dio;
  static List<Holiday>? _cache;
  static DateTime? _cachedAt;
  static const Duration _ttl = Duration(hours: 6);
  static const String _shownKey = 'holiday_alerts_shown_v1';

  static Future<List<Holiday>> fetch({bool force = false}) async {
    final cached = _cache;
    if (!force &&
        cached != null &&
        _cachedAt != null &&
        DateTime.now().difference(_cachedAt!) < _ttl) {
      return cached;
    }
    late Response<dynamic> response;
    try {
      response = await _dio.get('/utils/holiday-alerts.php');
    } on DioException {
      // The home screen can be created while endpoint discovery is still
      // switching from the USB loopback to the laptop LAN address.
      if (force) rethrow;
      await EndpointResolver.resolve(force: true);
      return fetch(force: true);
    }
    final raw = response.data;
    final data = raw is Map<String, dynamic>
        ? raw
        : raw is String
            ? (jsonDecode(raw) as Map<String, dynamic>)
            : throw Exception('Unexpected holiday response');
    if (data['success'] != true) {
      throw Exception(data['message']?.toString() ?? 'Holiday calendar unavailable');
    }
    final list = (data['holidays'] as List? ?? [])
        .whereType<Map>()
        .map((h) => Holiday.fromJson(Map<String, dynamic>.from(h)))
        .where((h) => h.date.isNotEmpty && h.title.isNotEmpty)
        .toList()
      ..sort((a, b) => a.date.compareTo(b.date));
    _cache = list;
    _cachedAt = DateTime.now();
    return list;
  }

  /// The next [count] holidays from today onward.
  static List<Holiday> upcoming(List<Holiday> all, {int count = 4}) {
    final today = _todayIso();
    return all.where((h) => h.date.compareTo(today) >= 0).take(count).toList();
  }

  static Holiday? today(List<Holiday> all) {
    final today = _todayIso();
    for (final h in all) {
      if (h.date == today) return h;
    }
    return null;
  }

  /// Nearest holiday within [days] days from today (null when there is none).
  static Holiday? withinDays(List<Holiday> all, int days) {
    final today = DateTime.parse(_todayIso());
    for (final h in all) {
      final d = h.day;
      if (d == null) continue;
      final diff = d.difference(today).inDays;
      if (diff <= 0) continue;
      if (diff > days) return null;
      return h;
    }
    return null;
  }

  /// True when this holiday's alert has not been shown on this device yet.
  /// Marks it as shown immediately so rapid rebuilds can't double-fire.
  static Future<bool> claimAlert(String key) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final shown = prefs.getStringList(_shownKey) ?? <String>[];
      if (shown.contains(key)) return false;
      shown.add(key);
      // Keep the log tidy — only the most recent 40 alerts matter.
      final trimmed = shown.length > 40 ? shown.sublist(shown.length - 40) : shown;
      await prefs.setStringList(_shownKey, trimmed);
      return true;
    } catch (_) {
      return false; // storage unavailable → stay silent rather than spam
    }
  }

  static String _todayIso() {
    final now = DateTime.now();
    final m = now.month.toString().padLeft(2, '0');
    final d = now.day.toString().padLeft(2, '0');
    return '${now.year}-$m-$d';
  }
}
