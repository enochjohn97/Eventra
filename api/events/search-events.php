<?php

/**
 * Search Events API
 * Robust search functionality for events
 */

header('Content-Type: application/json');
require_once '../../config/database.php';
require_once '../../includes/middleware/auth.php';

checkAuthOptional();

try {
    $q = $_GET['q'] ?? '';
    // SECURITY: unbounded q / limit enabled cheap DoS (multi-MB LIKE patterns
    // and huge result sets). Cap both.
    $q = mb_substr(trim((string) $q), 0, 120);
    $limit = min(100, max(1, (int) ($_GET['limit'] ?? 50)));
    $priority = $_GET['priority'] ?? null;
    $category = $_GET['category'] ?? null;

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
            OR DATE_FORMAT(e.event_date, '%Y-%m-%d') LIKE ?
            OR (? = 1 AND (e.price = 0 OR e.price IS NULL))
        )";
        $search_term = "%$q%";
        $params[] = $search_term;
        $params[] = $search_term;
        $params[] = $search_term;
        $params[] = $search_term;
        $params[] = $search_term;
        $params[] = $search_term;
        $params[] = $search_term;
        $params[] = $isFreeQuery ? 1 : 0;
    }

    if ($priority && $priority !== 'all') {
        $where_clauses[] = "e.priority = ?";
        $params[] = $priority;
    }

    if ($category && $category !== 'all') {
        $where_clauses[] = "e.category = ?";
        $params[] = $category;
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
    $meritScore = "(
        (IFNULL(e.view_count,0) * 0.5)
        + (IFNULL(e.sales_count,0) * 5)
        + (IFNULL(e.attendee_count,0) * 3)
        + (e.is_boosted * 100)
    )";
    $user_state = $_SESSION['user_state'] ?? '';
    $userStateSql = $pdo->quote($user_state);
    $priorityLabel = "CASE
        WHEN e.is_boosted = 1 THEN '⭐ Featured'
        WHEN IFNULL(e.sales_count,0) >= 50 THEN '🔥 Hot'
        WHEN $meritScore > 60 THEN '📈 Trending'
        WHEN e.event_date = CURDATE()
             AND $userStateSql != ''
             AND (
                 FIND_IN_SET($userStateSql, e.state) > 0
                 OR e.state = 'All States'
                 OR e.state = 'all'
             ) THEN '📍 Nearby'
        ELSE ''
    END";

    // Pagination support (offset) so paged mobile search works.
    $offset = max(0, (int) ($_GET['offset'] ?? 0));

    // Execute search
    $sql = "
        SELECT e.*,
               $meritScore AS merit_score,
               $priorityLabel AS priority_label,
               c.business_name as organizer_name, c.profile_pic as client_profile_pic, c.verification_status $favorite_select
        FROM events e
        LEFT JOIN clients c ON e.client_id = c.id
        WHERE $where_sql
        ORDER BY e.event_date ASC
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

    // Normalize image_path exactly like get-events.php
    $events = array_map(function ($ev) use ($user_role) {
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
        }
        return $ev;
    }, $events);

    echo json_encode([
        'success' => true,
        'events' => $events,
        'total' => count($events),
        'count' => count($events),
        'q' => $q
    ]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Internal server error. Please try again.']);
}
