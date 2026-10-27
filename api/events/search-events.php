<?php

/**
 * Search Events API
 * Robust search functionality for events
 */

header('Content-Type: application/json');
header('Cache-Control: no-cache, no-store, must-revalidate');
header('Pragma: no-cache');
header('Expires: 0');
require_once '../../config/database.php';
require_once '../../includes/middleware/auth.php';

checkAuthOptional();

try {
    $q = $_GET['q'] ?? '';
    // SECURITY: unbounded q / limit enabled cheap DoS (multi-MB LIKE patterns
    // and huge result sets). Cap both.
    $q = mb_substr(trim((string) $q), 0, 120);
    $limit = min(100, max(1, (int) ($_GET['limit'] ?? 50)));
    $priority = strtolower(trim((string) ($_GET['priority'] ?? '')));
    $category = $_GET['category'] ?? null;
    $state    = trim((string) ($_GET['state'] ?? ''));
    $user_state = trim((string) ($_GET['user_state'] ?? ($_SESSION['user_state'] ?? '')));
    $userStateSql = $pdo->quote(str_replace(' ', '', strtolower($user_state)));
    $sameUserState = "($userStateSql != '' AND FIND_IN_SET($userStateSql, LOWER(REPLACE(e.state, ' ', ''))) > 0)";

    // ── Filter helpers (shared with the mobile discovery sheet) ────────────
    // Merit score drives the trending tag and the `merit` sort.
    $meritScore = "(
        (IFNULL(e.view_count,0) * 0.5)
        + (IFNULL(e.sales_count,0) * 5)
        + (IFNULL(e.attendee_count,0) * 3)
        + (e.is_boosted * 100)
    )";
    // Base price across every tier — used by the Free / price-range filters.
    // Tier prices live in the event metadata JSON (there are no tier columns),
    // so they are extracted safely and default to 0 for legacy rows.
    $tierPrice = static function (string $key): string {
        return "CASE WHEN JSON_VALID(e.metadata)
                     THEN CAST(JSON_UNQUOTE(JSON_EXTRACT(e.metadata, '$." . $key . "')) AS DECIMAL(12,2))
                     ELSE 0 END";
    };
    $effectivePrice = "GREATEST(
        IFNULL(e.price,0),
        IFNULL(" . $tierPrice('regular_price') . ",0),
        IFNULL(" . $tierPrice('vip_price') . ",0),
        IFNULL(" . $tierPrice('premium_price') . ",0)
    )";

    // Build search query base
    $user_role = $_SESSION['user_role'] ?? 'guest';
    $where_clauses = ["e.deleted_at IS NULL"];
    $params = [];

    // Role-based filtering
    if ($user_role === 'client') {
        // Clients only see their own events (drafts, published, etc.)
        $where_clauses[] = "e.client_id = ?";
        $params[] = $_SESSION['client_id'] ?? 0;
    } else {
        // Guests/Users only see published events
        $where_clauses[] = "e.status = 'published'";
    }

    // Detect free-keyword — also match zero-price events
    // Private events stay off every user-facing list (homepage + search);
    // the owning client's own dashboard and the admin console are exempt.
    if ($user_role !== 'admin' && $user_role !== 'client') {
        $where_clauses[] = "IFNULL(e.event_visibility, 'public') <> 'private'";
    }

    $isFreeQuery = (strtolower($q) === 'free');

    // Unified Search logic
    if (!empty($q)) {
        $where_clauses[] = "(
            e.event_name LIKE ? 
            OR c.business_name LIKE ? 
            OR e.state LIKE ? 
            OR e.location LIKE ? 
            OR e.category LIKE ? 
            OR e.priority LIKE ?
            OR e.description LIKE ?
            OR DATE_FORMAT(e.event_date, '%Y-%m-%d') LIKE ?
            OR (? = 1 AND $effectivePrice <= 0)
        )";
        $search_term = "%$q%";
        for ($i = 0; $i < 8; $i++) { // 8 LIKE placeholders above
            $params[] = $search_term;
        }
        $params[] = $isFreeQuery ? 1 : 0;
    }

    // Priority tags — same rules as the ⭐/🔥/📈/📍 labels the server puts on
    // every event (and the web sidebar filters on). The legacy `priority`
    // ENUM is NOT used: it defaults to 'nearby' on every row and would match
    // everything, so only the computed meaning is trusted.
    if ($priority !== '' && $priority !== 'all') {
        switch ($priority) {
            case 'featured':
                $where_clauses[] = "e.is_boosted = 1";
                break;
            case 'hot':
                $where_clauses[] = "IFNULL(e.sales_count,0) >= 50";
                break;
            case 'trending':
                $where_clauses[] = "($meritScore) > 60";
                break;
            case 'nearby':
                $where_clauses[] = "e.event_date >= CURDATE() AND $sameUserState";
                break;
            case 'upcoming':
                $where_clauses[] = "e.event_date >= CURDATE()";
                break;
            default:
                // Unknown tag — fall back to a plain text match so custom
                // labels keep working.
                $where_clauses[] = "LOWER(IFNULL(e.priority,'')) LIKE ?";
                $params[] = '%' . $priority . '%';
        }
    }

    if ($category && $category !== 'all') {
        $where_clauses[] = "e.category = ?";
        $params[] = $category;
    }

    // State — events may cover several states (FIND_IN_SET) or all of them.
    if ($state !== '' && strtolower($state) !== 'all') {
        $where_clauses[] = "(
            FIND_IN_SET(?, e.state) > 0
            OR e.state = 'All States'
            OR e.state = 'all'
            OR e.state LIKE ?
        )";
        $params[] = $state;
        $params[] = '%' . $state . '%';
    }

    // Price — "free" chip plus optional range bounds (base, fee-exclusive).
    $freeOnly = isset($_GET['free']) && $_GET['free'] !== '' && $_GET['free'] !== '0';
    if ($freeOnly) {
        $where_clauses[] = "$effectivePrice <= 0";
    }
    $priceMin = (isset($_GET['price_min']) && $_GET['price_min'] !== '') ? (float) $_GET['price_min'] : null;
    $priceMax = (isset($_GET['price_max']) && $_GET['price_max'] !== '') ? (float) $_GET['price_max'] : null;
    if ($priceMin !== null) {
        $where_clauses[] = "$effectivePrice >= ?";
        $params[] = $priceMin;
    }
    if ($priceMax !== null) {
        $where_clauses[] = "$effectivePrice <= ?";
        $params[] = $priceMax;
    }

    // Identify user for favorites subquery
    $user_id = null;
    if ($user_role === 'admin') {
        $user_id = $_SESSION['admin_id'] ?? null;
    } elseif ($user_role === 'client') {
        $user_id = $_SESSION['client_id'] ?? null;
    } else {
        $user_id = $_SESSION['user_id'] ?? null;
    }

    $favorite_select = "";
    if ($user_id) {
        $favorite_select = ", (SELECT COUNT(*) FROM favorites WHERE user_id = ? AND event_id = e.id) as is_favorite";
    } else {
        $favorite_select = ", 0 as is_favorite";
    }

    $where_sql = implode(' AND ', $where_clauses);

    // Dynamic priority label — same CASE as get-events.php so search results
    // carry identical ⭐/🔥/📈/📍 tags for the mobile app.
    $priorityLabel = "CASE
        WHEN e.is_boosted = 1 THEN '⭐ Featured'
        WHEN IFNULL(e.sales_count,0) >= 50 THEN '🔥 Hot'
        WHEN $meritScore > 60 THEN '📈 Trending'
        WHEN e.event_date >= CURDATE()
             AND $sameUserState THEN '📍 Nearby'
        ELSE ''
    END";

    // Pagination support (offset) so paged mobile search works.
    $offset = max(0, (int) ($_GET['offset'] ?? 0));

    $count_stmt = $pdo->prepare("
        SELECT COUNT(*)
        FROM events e
        LEFT JOIN clients c ON e.client_id = c.id
        WHERE $where_sql
    ");
    $count_stmt->execute($params);
    $total = (int) $count_stmt->fetchColumn();

    $sort_by = $_GET['sort_by'] ?? 'newest';
    $sort_order_sql = match ($sort_by) {
        'popular' => 'e.attendee_count DESC',
        'merit' => "$meritScore DESC",
        'date' => 'e.event_date ASC, e.event_time ASC',
        // Tier prices live in the event metadata JSON, so the legacy `price`
        // column alone (often 0) would make price sorting appear broken.
        'price_low' => "$effectivePrice ASC",
        'price_high' => "$effectivePrice DESC",
        default => 'e.created_at DESC',
    };

    // Execute search
    $sql = "
        SELECT e.*,
               $meritScore AS merit_score,
               $priorityLabel AS priority_label,
               c.business_name as organizer_name, c.profile_pic as client_profile_pic, c.verification_status $favorite_select
        FROM events e
        LEFT JOIN clients c ON e.client_id = c.id
        WHERE $where_sql
        ORDER BY CASE WHEN e.event_date < CURDATE() THEN 1 ELSE 0 END ASC,
                 $sort_order_sql, e.id DESC
        LIMIT ? OFFSET ?
    ";

    // Rebuild params to include user_id for the subquery if needed
    $query_params = [];
    if ($user_id) {
        $query_params[] = $user_id;
    }
    foreach ($params as $p) {
        $query_params[] = $p;
    }
    $query_params[] = $limit;
    $query_params[] = $offset;

    $stmt = $pdo->prepare($sql);

    // Bind parameters
    foreach ($query_params as $key => $value) {
        $stmt->bindValue($key + 1, $value, is_int($value) ? PDO::PARAM_INT : PDO::PARAM_STR);
    }

    $stmt->execute();
    $events = $stmt->fetchAll();

    // Normalize image_path and build absolute_image_url (same as get-events.php).
    $baseUrl = rtrim($_ENV['APP_URL'] ?? '', '/');
    if ($baseUrl === '') {
        $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
        $baseUrl = $scheme . '://' . ($_SERVER['HTTP_HOST'] ?? 'localhost');
    }
    $events = array_map(function ($ev) use ($user_role, $baseUrl) {
        if (!empty($ev['metadata'])) {
            $meta = json_decode($ev['metadata'], true);
            if (is_array($meta)) $ev = array_merge($ev, $meta);
        }
        if ($user_role !== 'admin') {
            unset($ev['is_boosted']);
            unset($ev['priority']); // legacy column
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
            $ev['absolute_image_url'] = $baseUrl . $ev['image_path'];
        }
        return $ev;
    }, $events);

    echo json_encode([
        'success' => true,
        'events' => $events,
        'total' => $total,
        'count' => count($events),
        'q' => $q
    ]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Internal server error. Please try again.']);
}
