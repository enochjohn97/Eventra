<?php

/**
 * Get Events API
 * Retrieves events with filtering, pagination, merit-based scoring, and waterfall fallback.
 */

header('Content-Type: application/json');
// Prevent browsers/CDNs from caching this dynamic endpoint (avoids cross-client image leaks on login screen)
header('Cache-Control: no-cache, no-store, must-revalidate');
header('Pragma: no-cache');
header('Expires: 0');
require_once '../../config/database.php';
require_once '../../includes/middleware/auth.php';

try {
    // ── Retire passed events (2 days after the event date) ──────────────────
    // Runs at most once an hour, on this public feed both the website and the
    // mobile app read — so a finished event disappears from both at the same
    // time. Soft-delete (deleted_at) takes it out of every listing while
    // keeping the tickets/orders/payout rows it is referenced by intact.
    try {
        $purgeMarker = __DIR__ . '/../../logs/passed-events-purge.stamp';
        $lastPurge = is_file($purgeMarker) ? (int) @file_get_contents($purgeMarker) : 0;
        if (time() - $lastPurge > 3600) {
            @file_put_contents($purgeMarker, (string) time(), LOCK_EX);
            $pdo->exec("
                UPDATE events
                SET deleted_at = NOW()
                WHERE deleted_at IS NULL
                  AND event_date IS NOT NULL
                  AND event_date < DATE_SUB(CURDATE(), INTERVAL 2 DAY)
            ");
        }
    } catch (Throwable $purgeEx) {
        error_log('[get-events.php] Passed-event purge skipped: ' . $purgeEx->getMessage());
    }

    $user_id   = checkAuthOptional();
    $client_id = $_GET['client_id'] ?? null;
    $status    = $_GET['status']    ?? null;
    $limit     = ($_GET['limit'] ?? '') === 'all' ? 10000 : (int)($_GET['limit'] ?? 10);
    $offset    = (int)($_GET['offset'] ?? 0);
    $user_role = $_SESSION['user_role'] ?? 'guest';

    $user_state = trim($_GET['user_state'] ?? '');

    // ── Archive: events that have already taken place ────────────────────────
    // Powers the admin/client Archive views. Carries the venue, price and the
    // full sales figures so a passed event stays inspectable after it has been
    // retired from the live catalogue.
    if (($_GET['archived'] ?? '') === '1') {
        $archivedClientId = null;
        if ($user_role !== 'admin') {
            $archivedClientId = $client_id ?: ($_SESSION['client_id'] ?? null);
        } elseif (!empty($client_id)) {
            $archivedClientId = $client_id;
        }
        $where  = 'e.event_date IS NOT NULL AND e.event_date < CURDATE()';
        $params = [];
        if ($archivedClientId) {
            $where .= ' AND e.client_id = ?';
            $params[] = $archivedClientId;
        }
        $aStmt = $pdo->prepare("
            SELECT e.id, e.custom_id, e.event_name, e.event_date, e.event_time, e.price, e.metadata,
                   e.state, e.address, e.location, e.category, e.attendee_count, e.max_capacity,
                   e.status, e.created_at, e.deleted_at, e.image_path,
                   c.business_name AS organizer_name, c.name AS organizer_contact,
                   (SELECT COUNT(*) FROM tickets t WHERE t.event_id = e.id) AS tickets_sold,
                   (SELECT IFNULL(SUM(p.amount), 0) FROM payments p WHERE p.event_id = e.id AND p.status = 'paid') AS revenue
            FROM events e
            LEFT JOIN clients c ON e.client_id = c.id
            WHERE {$where}
            ORDER BY e.event_date DESC
            LIMIT 500
        ");
        $aStmt->execute($params);
        $archived = array_map(function ($event) use ($user_role) {
            if (!empty($event['metadata'])) {
                $metadata = json_decode($event['metadata'], true);
                if (is_array($metadata)) $event = array_merge($event, $metadata);
            }
            unset($event['metadata']);
            if (!empty($event['image_path'])) {
                $image = str_replace('\\', '/', $event['image_path']);
                if (preg_match('#(/public/.+)$#i', $image, $match)) {
                    $event['image_path'] = $match[1];
                } elseif (preg_match('#(public/assets/.+)$#i', $image, $match)) {
                    $event['image_path'] = '/' . $match[1];
                }
            }
            return $event;
        }, $aStmt->fetchAll(PDO::FETCH_ASSOC));
        echo json_encode(['success' => true, 'events' => $archived, 'total' => count($archived)]);
        exit;
    }

    // Sales-driven merit: weight sales heavily, boost very recent events
    $meritScore = "((IFNULL(e.view_count,0) * 0.2 + IFNULL(e.sales_count,0) * 0.8)
                    * IF(e.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY), 1.3, 1.0))";

    // Dynamic Priority Label Logic
    // - Featured  : admin-boosted
    // - Hot       : top 20% by sales_count (high ticket demand)
    // - Trending  : next tier by combined merit
    // - Nearby    : event is upcoming and event state matches user's state (any in list)
    // NOTE: literal emoji characters, NOT \uXXXX escapes — MySQL strips the
    // escape sequences from SQL string literals (utf8mb4 has no unicode-escape
    // syntax), which previously produced mangled labels like "ud83dudccd Nearby".
    $userStateSql = $pdo->quote(str_replace(' ', '', strtolower($user_state)));
    $priorityLabel = "CASE
        WHEN e.is_boosted = 1 THEN '⭐ Featured'
        WHEN IFNULL(e.sales_count,0) >= 50 THEN '🔥 Hot'
        WHEN $meritScore > 60 THEN '📈 Trending'
        WHEN e.event_date >= CURDATE()
             AND $userStateSql != ''
             AND FIND_IN_SET($userStateSql, LOWER(REPLACE(e.state, ' ', ''))) > 0
             THEN '📍 Nearby'
        WHEN e.event_date > CURDATE() THEN ''
        ELSE ''
    END";

    // ── Waterfall Fallback Feed ─────────────────────────────────────────────
    if (($_GET['feed'] ?? '') === 'waterfall') {
        $lat   = isset($_GET['lat'])   ? (float)$_GET['lat']   : null;
        $lng   = isset($_GET['lng'])   ? (float)$_GET['lng']   : null;
        $state = $_GET['state'] ?? null;

        $publicBase = "FROM events e
            LEFT JOIN clients u ON e.client_id = u.id
            WHERE e.deleted_at IS NULL
              AND e.status = 'published'";

        $ticketFilter = "AND (e.ticket_count > 0 OR e.ticket_count IS NULL)";

        // Tier 1: Nearby (Haversine ≤ 50 km)
        $events = [];
        if ($lat !== null && $lng !== null) {
            $nearbySQL = "SELECT e.*,
                u.business_name AS organizer_name,
                u.profile_pic   AS client_profile_pic,
                u.verification_status,
                (u.verification_status = 'verified') AS is_verified,
                0 AS is_favorite,
                $meritScore AS merit_score,
                $priorityLabel AS priority_label,
                (6371 * ACOS(
                    COS(RADIANS(?)) * COS(RADIANS(e.latitude)) *
                    COS(RADIANS(e.longitude) - RADIANS(?)) +
                    SIN(RADIANS(?)) * SIN(RADIANS(e.latitude))
                )) AS distance_km
                $publicBase $ticketFilter
                HAVING distance_km <= 50
                ORDER BY distance_km ASC, merit_score DESC
                LIMIT 10";
            $s = $pdo->prepare($nearbySQL);
            $s->execute([$lat, $lng, $lat]);
            $events = $s->fetchAll();
        }

        // Tier 2: State-wide top 10
        if (empty($events) && $state) {
            $s = $pdo->prepare("SELECT e.*,
                u.business_name AS organizer_name,
                u.profile_pic   AS client_profile_pic,
                u.verification_status,
                (u.verification_status = 'verified') AS is_verified,
                0 AS is_favorite,
                $meritScore AS merit_score,
                $priorityLabel AS priority_label
                $publicBase AND (FIND_IN_SET(?, e.state) OR e.state = 'all' OR e.state = 'All States') $ticketFilter
                ORDER BY merit_score DESC LIMIT 10");
            $s->execute([$state]);
            $events = $s->fetchAll();
        }

        // Tier 3: National top 10 by merit
        if (empty($events)) {
            $s = $pdo->prepare("SELECT e.*,
                u.business_name AS organizer_name,
                u.profile_pic   AS client_profile_pic,
                u.verification_status,
                (u.verification_status = 'verified') AS is_verified,
                0 AS is_favorite,
                $meritScore AS merit_score,
                $priorityLabel AS priority_label
                $publicBase $ticketFilter
                ORDER BY merit_score DESC LIMIT 10");
            $s->execute([]);
            $events = $s->fetchAll();
        }

        // Tier 4: Freshness fallback
        if (empty($events)) {
            $s = $pdo->prepare("SELECT e.*,
                u.business_name AS organizer_name,
                u.profile_pic   AS client_profile_pic,
                u.verification_status,
                (u.verification_status = 'verified') AS is_verified,
                0 AS is_favorite,
                0 AS merit_score,
                $priorityLabel AS priority_label
                $publicBase
                ORDER BY e.created_at DESC LIMIT 10");
            $s->execute([]);
            $events = $s->fetchAll();
        }

        // Process events: parse metadata, strip admin-only fields, and build
        // absolute image URLs (same normalisation as the standard feed).
        $waterfallBaseUrl = rtrim($_ENV['APP_URL'] ?? '', '/');
        if ($waterfallBaseUrl === '') {
            $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
            $waterfallBaseUrl = $scheme . '://' . ($_SERVER['HTTP_HOST'] ?? 'localhost');
        }
        $events = array_map(function($ev) use ($user_role, $waterfallBaseUrl) {
            if (!empty($ev['metadata'])) {
                $meta = json_decode($ev['metadata'], true);
                if (is_array($meta)) $ev = array_merge($ev, $meta);
            }
            if ($user_role !== 'admin') {
                unset($ev['is_boosted']);
                unset($ev['priority']); // legacy
            }
            if ($user_role === 'guest') {
                unset($ev['metadata']);
                unset($ev['client_profile_pic']);
            }
            if (!empty($ev['image_path'])) {
                $img = str_replace('\\', '/', $ev['image_path']);
                if (preg_match('#(/public/.+)$#i', $img, $m)) {
                    $ev['image_path'] = $m[1];
                } elseif (preg_match('#(public/assets/.+)$#i', $img, $m)) {
                    $ev['image_path'] = '/' . $m[1];
                }
                $ev['absolute_image_url'] = $waterfallBaseUrl . $ev['image_path'];
            }
            return $ev;
        }, $events);

        echo json_encode(['success' => true, 'events' => $events, 'total' => count($events), 'waterfall' => true]);
        exit;
    }

    // ── Standard Feed ──────────────────────────────────────────────────────
    $where_clauses = [];
    $params        = [];

    $is_dashboard = ($user_role === 'client' && $client_id !== null);

    // Client isolation
    if ($is_dashboard) {
        $forced_client_id = $_SESSION['client_id'] ?? null;
        $where_clauses[]  = $forced_client_id ? "e.client_id = ?" : "1 = 0";
        if ($forced_client_id) $params[] = $forced_client_id;
    } elseif ($client_id) {
        $stmt = $pdo->prepare("SELECT id FROM clients WHERE client_auth_id = ? OR id = ?");
        $stmt->execute([$client_id, $client_id]);
        $resolved_client = $stmt->fetch();
        if ($resolved_client) {
            $where_clauses[] = "e.client_id = ?";
            $params[]        = $resolved_client['id'];
        } else {
            $where_clauses[] = "1 = 0";
        }
    }

    // Status filter
    if ($status) {
        $where_clauses[] = "e.status = ?";
        $params[]        = $status;
    } elseif ($user_role !== 'admin' && !$is_dashboard) {
        $where_clauses[] = "e.status = 'published'";
    }

    // Exclude soft-deleted
    $where_clauses[] = "e.deleted_at IS NULL";
    $where_sql       = !empty($where_clauses) ? 'WHERE ' . implode(' AND ', $where_clauses) : '';

    // Count
    $count_stmt = $pdo->prepare("SELECT COUNT(*) AS total FROM events e $where_sql");
    $count_stmt->execute($params);
    $total = $count_stmt->fetch()['total'];

    // User id for favorites
    $fav_user_id = null;
    if ($user_role === 'admin')       $fav_user_id = $_SESSION['admin_id']  ?? null;
    elseif ($user_role === 'client')  $fav_user_id = $_SESSION['client_id'] ?? null;
    else                              $fav_user_id = $_SESSION['user_id']    ?? null;

    $favoriteSubquery = $fav_user_id
        ? "(SELECT COUNT(*) FROM favorites WHERE user_id = ? AND event_id = e.id) AS is_favorite"
        : "0 AS is_favorite";

    // Sort. Tier prices are stored in the event metadata JSON (the legacy
    // `price` column is 0 for tiered events), so price sorting compares the
    // highest priced active tier — the same amount the cards display.
    $effectivePrice = "GREATEST(
        IFNULL(e.price,0),
        IFNULL(CASE WHEN JSON_VALID(e.metadata) THEN CAST(JSON_UNQUOTE(JSON_EXTRACT(e.metadata, '$.regular_price')) AS DECIMAL(12,2)) ELSE 0 END,0),
        IFNULL(CASE WHEN JSON_VALID(e.metadata) THEN CAST(JSON_UNQUOTE(JSON_EXTRACT(e.metadata, '$.vip_price')) AS DECIMAL(12,2)) ELSE 0 END,0),
        IFNULL(CASE WHEN JSON_VALID(e.metadata) THEN CAST(JSON_UNQUOTE(JSON_EXTRACT(e.metadata, '$.premium_price')) AS DECIMAL(12,2)) ELSE 0 END,0)
    )";
    $sort_by  = $_GET['sort_by'] ?? 'newest';
    $sort_order_sql = match($sort_by) {
        'popular'    => "e.attendee_count DESC",
        'merit'      => "$meritScore DESC",
        'date'       => "e.event_date ASC, e.event_time ASC",
        'price_low'  => "$effectivePrice ASC",
        'price_high' => "$effectivePrice DESC",
        default      => "e.created_at DESC",
    };
    $order_sql = "CASE WHEN e.event_date < CURDATE() THEN 1 ELSE 0 END ASC, $sort_order_sql, e.id DESC";

    $sql = "SELECT
            e.*,
            $meritScore AS merit_score,
            u.business_name AS organizer_name,
            u.profile_pic   AS client_profile_pic,
            u.verification_status,
            (u.verification_status = 'verified') AS is_verified,
            $priorityLabel AS priority_label,
            $favoriteSubquery
        FROM events e
        LEFT JOIN clients u ON e.client_id = u.id
        $where_sql
        ORDER BY $order_sql
        LIMIT ? OFFSET ?";

    $query_params = [];
    if ($fav_user_id) $query_params[] = $fav_user_id;
    foreach ($params as $p) $query_params[] = $p;
    $query_params[] = $limit;
    $query_params[] = $offset;

    $stmt = $pdo->prepare($sql);
    foreach ($query_params as $key => $value) {
        $stmt->bindValue($key + 1, $value, is_int($value) ? PDO::PARAM_INT : PDO::PARAM_STR);
    }
    $stmt->execute();
    $events = $stmt->fetchAll();

    // Per-tier capacity for the events on this page. Two bulk queries keep the
    // list endpoint free of N+1 lookups; the checkout screen shows the live
    // remaining count per tier (regular / vip / premium).
    $tierCounts = [];
    $eventIds = array_values(array_filter(array_map(fn($e) => (int) ($e['id'] ?? 0), $events)));
    if (!empty($eventIds)) {
        $in = implode(',', array_fill(0, count($eventIds), '?'));
        $soldStmt = $pdo->prepare("
            SELECT event_id, LOWER(ticket_type) AS tier, COUNT(*) AS sold
            FROM tickets
            WHERE event_id IN ($in) AND status <> 'cancelled'
            GROUP BY event_id, tier
        ");
        $soldStmt->execute($eventIds);
        foreach ($soldStmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $tierCounts[(int) $row['event_id']][$row['tier']] = (int) $row['sold'];
        }
        $reservedStmt = $pdo->prepare("
            SELECT event_id,
                   LOWER(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.ticket_type')), 'regular')) AS tier,
                   COALESCE(SUM(CAST(JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.quantity')) AS UNSIGNED)), 0) AS reserved
            FROM orders
            WHERE event_id IN ($in) AND payment_status = 'pending'
              AND created_at >= NOW() - INTERVAL 30 MINUTE
            GROUP BY event_id, tier
        ");
        $reservedStmt->execute($eventIds);
        foreach ($reservedStmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $eid = (int) $row['event_id'];
            $tier = strtolower((string) $row['tier']);
            $tierCounts[$eid][$tier] = ($tierCounts[$eid][$tier] ?? 0) + (int) $row['reserved'];
        }
    }

    // Process events: parse metadata, tiers, strip admin-only fields,
    // and build absolute image URLs.
    $baseUrl = rtrim($_ENV['APP_URL'] ?? '', '/');
    if ($baseUrl === '') {
        $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
        $baseUrl = $scheme . '://' . ($_SERVER['HTTP_HOST'] ?? 'localhost');
    }
    $events = array_map(function($ev) use ($user_role, $tierCounts, $baseUrl) {
        if (!empty($ev['metadata'])) {
            $meta = json_decode($ev['metadata'], true);
            if (is_array($meta)) $ev = array_merge($ev, $meta);
        }
        $capacity = [];
        $remaining = [];
        $used = $tierCounts[(int) ($ev['id'] ?? 0)] ?? [];
        foreach (['regular', 'vip', 'premium'] as $tier) {
            $qty = $ev[$tier . '_quantity'] ?? null;
            $capacity[$tier] = ($qty === null || $qty === '') ? null : (int) $qty;
            $remaining[$tier] = $capacity[$tier] === null
                ? null
                : max(0, $capacity[$tier] - ($used[$tier] ?? 0));
        }
        $ev['tier_capacity'] = $capacity;
        $ev['tier_remaining'] = $remaining;
        if ($user_role !== 'admin') {
            unset($ev['is_boosted']);
            unset($ev['priority']); // legacy
        }
        // Keep private metadata and profile fields out of guest responses.
        if ($user_role === 'guest') {
            unset($ev['metadata']);
            unset($ev['client_profile_pic']);
        }
        // Normalize image_path to a root-relative web path and build absolute URL.
        // The .htaccess on Apache strips /public/ from static file URLs, and the
        // PHP built-in server serves them directly — so /public/assets/... works
        // on both. absolute_image_url is the full resolvable URL for clients.
        if (!empty($ev['image_path'])) {
            $img = str_replace('\\', '/', $ev['image_path']);
            if (preg_match('#(/public/.+)$#i', $img, $m)) {
                $ev['image_path'] = $m[1];
            } elseif (preg_match('#(public/assets/.+)$#i', $img, $m)) {
                $ev['image_path'] = '/' . $m[1];
            }
            $ev['absolute_image_url'] = $baseUrl . $ev['image_path'];
        }
        return $ev;
    }, $events);

    // Stats for client context
    $stats = null;
    $resolved_client_id = isset($resolved_client['id']) ? $resolved_client['id'] : ($_SESSION['client_id'] ?? null);
    if ($resolved_client_id) {
        try {
            $stats_stmt = $pdo->prepare("
                SELECT
                    COUNT(CASE WHEN deleted_at IS NULL THEN 1 END) AS total_events,
                    SUM(CASE WHEN status = 'published' AND deleted_at IS NULL THEN 1 ELSE 0 END) AS published_events,
                    SUM(CASE WHEN status = 'scheduled' AND deleted_at IS NULL THEN 1 ELSE 0 END) AS scheduled_events,
                    SUM(CASE WHEN status = 'draft'     AND deleted_at IS NULL THEN 1 ELSE 0 END) AS draft_events,
                    SUM(CASE WHEN JSON_EXTRACT(metadata, '$.is_restored') = true AND deleted_at IS NULL THEN 1 ELSE 0 END) AS restored_events,
                    COUNT(CASE WHEN deleted_at IS NOT NULL THEN 1 END) AS deleted_events,
                    IFNULL(SUM(CASE WHEN deleted_at IS NULL THEN attendee_count ELSE 0 END), 0) AS total_attendees
                FROM events WHERE client_id = ?
            ");
            $stats_stmt->execute([$resolved_client_id]);
            $stats = $stats_stmt->fetch();
        } catch (PDOException $e) {
            error_log("[Get Events Stats Error] " . $e->getMessage());
        }
    }

    echo json_encode(['success' => true, 'events' => $events, 'total' => $total, 'stats' => $stats]);

} catch (PDOException $e) {
    http_response_code(500);
    error_log('[get-events.php] DB error: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Unable to load events right now. Please try again shortly.']);
} catch (Exception $e) {
    error_log('[get-events.php] Error: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Unable to load events right now. Please try again shortly.']);
}
