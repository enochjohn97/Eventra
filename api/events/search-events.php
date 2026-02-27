<?php
/**
 * Search Events API
 * Robust search functionality for events
 */
header('Content-Type: application/json');
require_once '../../config/database.php';

try {
    $q = $_GET['q'] ?? '';
    $limit = (int) ($_GET['limit'] ?? 50);

    // Build search query
    $where_clauses = ["e.status = 'published'", "e.deleted_at IS NULL"];
    $params = [];

    // Unified Search logic
    if (!empty($q)) {
        $where_clauses[] = "(
            e.event_name LIKE ? 
            OR c.business_name LIKE ? 
            OR e.state LIKE ? 
            OR e.location LIKE ? 
            OR e.category LIKE ? 
            OR DATE_FORMAT(e.event_date, '%Y-%m-%d') LIKE ?
        )";
        $search_term = "%$q%";
        // Bind for each field in the OR clause
        $params[] = $search_term; // event_name
        $params[] = $search_term; // business_name (organizer)
        $params[] = $search_term; // state
        $params[] = $search_term; // location
        $params[] = $search_term; // category
        $params[] = $search_term; // event_date
    }

    $where_sql = implode(' AND ', $where_clauses);

    // Execute search (Default to upcoming date order as requested)
    $sql = "
        SELECT e.*, c.business_name as organizer_name, c.profile_pic as client_profile_pic
        FROM events e
        LEFT JOIN clients c ON e.client_id = c.id
        WHERE $where_sql
        ORDER BY e.event_date ASC
        LIMIT ?
    ";

    $params[] = $limit;

    $stmt = $pdo->prepare($sql);

    // Bind parameters
    foreach ($params as $key => $value) {
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

