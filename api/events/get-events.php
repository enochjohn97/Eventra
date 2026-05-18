<?php

/**
 * Get Events API
 * Retrieves events with filtering, pagination, merit-based scoring, and waterfall fallback.
 */

header('Content-Type: application/json');
require_once '../../config/database.php';
require_once '../../includes/middleware/auth.php';

try {
    $user_id   = checkAuthOptional();
    $client_id = $_GET['client_id'] ?? null;
    $status    = $_GET['status']    ?? null;
    $limit     = $_GET['limit'] === 'all' ? 10000 : (int)($_GET['limit'] ?? 10);
    $offset    = (int)($_GET['offset'] ?? 0);
    $user_role = $_SESSION['user_role'] ?? 'guest';

    $meritScore = "((IFNULL(e.view_count,0) * 0.3 + IFNULL(e.sales_count,0) * 0.7)
                    * IF(e.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY), 1.2, 1.0))";

    // Dynamic Priority Label Logic
    $priorityLabel = "CASE 
        WHEN e.is_boosted = 1 THEN '⭐ Featured'
        WHEN $meritScore > 200 THEN '📈 Trending'
        WHEN $meritScore > 100 THEN '🔥 Hot'
        WHEN e.created_at >= DATE_SUB(NOW(), INTERVAL 2 DAY) THEN '🕒 Upcoming'
        ELSE '📍 Nearby'
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

        // Process events: parse metadata and strip admin-only fields
        $events = array_map(function($ev) use ($user_role) {
            if (!empty($ev['metadata'])) {
                $meta = json_decode($ev['metadata'], true);
                if (is_array($meta)) $ev = array_merge($ev, $meta);
            }
            if ($user_role !== 'admin') {
                unset($ev['is_boosted']);
                unset($ev['priority']); // legacy
            }
            return $ev;
        }, $events);

        echo json_encode(['success' => true, 'events' => $events, 'total' => count($events), 'waterfall' => true]);
        exit;
    }

    // ── Standard Feed ──────────────────────────────────────────────────────
    $where_clauses = [];
    $params        = [];

    // Client isolation
    if ($user_role === 'client') {
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
    } elseif ($user_role !== 'admin' && $user_role !== 'client') {
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

    // Sort
    $sort_by  = $_GET['sort_by'] ?? 'newest';
    $order_sql = match($sort_by) {
        'popular'    => "e.attendee_count DESC",
        'merit'      => "$meritScore DESC",
        'date'       => "e.event_date ASC, e.event_time ASC",
        'price_low'  => "e.price ASC",
        'price_high' => "e.price DESC",
        default      => "e.created_at DESC",
    };

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

    // Process events: parse metadata and strip admin-only fields
    $events = array_map(function($ev) use ($user_role) {
        if (!empty($ev['metadata'])) {
            $meta = json_decode($ev['metadata'], true);
            if (is_array($meta)) $ev = array_merge($ev, $meta);
        }
        if ($user_role !== 'admin') {
            unset($ev['is_boosted']);
            unset($ev['priority']); // legacy
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
    echo json_encode(['success' => false, 'message' => formatDbErrorMessage($e)]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'General error: ' . $e->getMessage()]);
}

