import 'dart:convert';

import 'package:path/path.dart' as p;
import 'package:sqflite/sqflite.dart';

import '../models/event_model.dart';

/// Persistent cache of the events feed for an instant, offline-friendly start.
///
/// Strategy (see README "Sync architecture"):
///  * Only the first page of each feed variant is persisted — enough to paint
///    the home grid immediately; older pages are cheap to re-fetch.
///  * Rows are keyed by API origin, sort, and search so local and live
///    events cannot be mixed when endpoint discovery switches environments.
///  * Entries expire after [maxAge]; providers treat cache as a *preview* and
///    always refresh from the network afterwards, so this never drifts out of
///    sync with the web app — worst case is showing slightly old data for the
///    moment before the refresh lands.
class EventCacheService {
  EventCacheService._();
  static final EventCacheService instance = EventCacheService._();

  static const _dbName = 'eventra_cache.db';
  static const _dbVersion = 1;
  static const _table = 'cached_events';
  static const _maxAge = Duration(minutes: 30);

  Database? _db;

  Future<Database> get _database async {
    if (_db != null && _db!.isOpen) return _db!;
    final dir = await getDatabasesPath();
    _db = await openDatabase(
      p.join(dir, _dbName),
      version: _dbVersion,
      onCreate: (db, version) async {
        await db.execute('''
          CREATE TABLE $_table (
            cache_key TEXT NOT NULL,
            position INTEGER NOT NULL,
            payload TEXT NOT NULL,
            cached_at INTEGER NOT NULL,
            PRIMARY KEY (cache_key, position)
          )
        ''');
      },
    );
    return _db!;
  }

  static String keyFor({
    required String sort,
    String? search,
    String? origin,
  }) => 'feed:${origin ?? 'unknown'}:$sort:${search?.trim() ?? ''}';

  /// Persists a page of events. Page 1 replaces the stored page; higher
  /// pages are appended (used only if callers choose to persist them).
  Future<void> savePage(
    String cacheKey,
    List<EventModel> events, {
    int page = 1,
  }) async {
    if (page != 1 || events.isEmpty) return;
    try {
      final db = await _database;
      final now = DateTime.now().millisecondsSinceEpoch;
      await db.transaction((txn) async {
        await txn.delete(_table, where: 'cache_key = ?', whereArgs: [cacheKey]);
        for (var i = 0; i < events.length; i++) {
          await txn.insert(_table, {
            'cache_key': cacheKey,
            'position': i,
            'payload': jsonEncode(events[i].toJson()),
            'cached_at': now,
          });
        }
      });
    } catch (_) {
      // Cache failures must never break the app — network is the source of
      // truth, this is only a convenience.
    }
  }

  /// Returns the cached first page for [cacheKey], or null when missing,
  /// expired, or unreadable.
  Future<List<EventModel>?> loadPage(String cacheKey) async {
    try {
      final db = await _database;
      final rows = await db.query(
        _table,
        where: 'cache_key = ?',
        whereArgs: [cacheKey],
        orderBy: 'position ASC',
      );
      if (rows.isEmpty) return null;

      final cachedAt = (rows.first['cached_at'] as int?) ?? 0;
      final age = DateTime.now().millisecondsSinceEpoch - cachedAt;
      if (age > _maxAge.inMilliseconds) {
        await db.delete(_table, where: 'cache_key = ?', whereArgs: [cacheKey]);
        return null;
      }

      return rows
          .map(
            (row) => EventModel.fromJson(
              jsonDecode(row['payload'] as String) as Map<String, dynamic>,
            ),
          )
          .toList();
    } catch (_) {
      return null;
    }
  }

  /// Clears all cached feeds (called on logout so the next user starts fresh).
  Future<void> clearAll() async {
    try {
      final db = await _database;
      await db.delete(_table);
    } catch (_) {}
  }
}
