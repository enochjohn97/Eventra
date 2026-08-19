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
    $limit = (int) ($_GET['limit'] ?? 50);
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
        )";
        $search_term = "%$q%";
        $params[] = $search_term;
        $params[] = $search_term;
        $params[] = $search_term;
        $params[] = $search_term;
        $params[] = $search_term;
        $params[] = $search_term;
        $params[] = $search_term;
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

    // Execute search
    $sql = "
        SELECT e.*, c.business_name as organizer_name, c.profile_pic as client_profile_pic, c.verification_status $favorite_select
        FROM events e
        LEFT JOIN clients c ON e.client_id = c.id
        WHERE $where_sql
        ORDER BY e.event_date ASC
        LIMIT ?
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

    $stmt = $pdo->prepare($sql);

    // Bind parameters
    foreach ($query_params as $key => $value) {
        $stmt->bindValue($key + 1, $value, is_int($value) ? PDO::PARAM_INT : PDO::PARAM_STR);
    }

    $stmt->execute();
    $events = $stmt->fetchAll();

    echo json_encode([
        'success' => true,
        'events' => $events,
        'count' => count($events),
        'q' => $q
    ]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Internal server error: ' . $e->getMessage()]);
}
