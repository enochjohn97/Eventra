import 'dart:convert';

import 'package:path/path.dart' as p;
import 'package:sqflite/sqflite.dart';

import '../../core/network/api_client.dart';
import '../models/event_model.dart';

/// Persistent cache of the events feed for an instant, offline-friendly start.
///
/// Strategy (see README "Sync architecture"):
///  * Only the first page of each feed variant is persisted — enough to paint
///    the home grid immediately; older pages are cheap to re-fetch.
///  * Rows are keyed by sort and search, so the last feed remains available
///    when endpoint discovery switches between local and live environments.
///  * Cached data is a preview; every launch still refreshes it from the
///    network when possible.
class EventCacheService {
  EventCacheService._();
  static final EventCacheService instance = EventCacheService._();

  static const _dbName = 'eventra_cache.db';
  static const _dbVersion = 1;
  static const _table = 'cached_events';
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

  static String keyFor({required String sort, String? search}) =>
      'feed:$sort:${search?.trim() ?? ''}';

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
      var rows = await db.query(
        _table,
        where: 'cache_key = ?',
        whereArgs: [cacheKey],
        orderBy: 'position ASC',
      );
      if (rows.isEmpty && cacheKey.startsWith('feed:')) {
        final legacyKeys = await db.query(
          _table,
          columns: ['cache_key'],
          where: 'cache_key LIKE ?',
          whereArgs: ['%:${cacheKey.substring('feed:'.length)}'],
          orderBy: 'cached_at DESC',
          limit: 1,
        );
        if (legacyKeys.isNotEmpty) {
          final legacyKey = legacyKeys.first['cache_key'] as String;
          rows = await db.query(
            _table,
            where: 'cache_key = ?',
            whereArgs: [legacyKey],
            orderBy: 'position ASC',
          );
          await db.update(
            _table,
            {'cache_key': cacheKey},
            where: 'cache_key = ?',
            whereArgs: [legacyKey],
          );
        }
      }
      if (rows.isEmpty) return null;

      // Pass the origin that is live right now so restored events rebuild
      // their image URLs for the current environment instead of keeping the
      // origin they were cached from.
      final origin = ApiClient().baseOrigin;
      return rows
          .map(
            (row) => EventModel.fromJson(
              jsonDecode(row['payload'] as String) as Map<String, dynamic>,
              baseOrigin: origin,
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
