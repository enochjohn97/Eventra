<?php

/**
 * Get All Events API for Admin
 * Retrieves all events with client information and pagination
 */

header('Content-Type: application/json');
require_once '../../config/database.php';
require_once '../../includes/middleware/auth.php';

// Check if admin is logged in
checkAuth('admin');

try {
    $limit = isset($_GET['limit']) ? (int) $_GET['limit'] : 1000;
    $offset = isset($_GET['offset']) ? (int) $_GET['offset'] : 0;
    $search = $_GET['search'] ?? '';

    $params = [];
    $where_clause = "";

    if (!empty($search)) {
        $where_clause = "WHERE e.event_name LIKE ? OR u.business_name LIKE ? OR e.state LIKE ?";
        $search_param = "%$search%";
        $params = [$search_param, $search_param, $search_param];
    }

    // Get total count
    $count_sql = "SELECT COUNT(*) FROM events e LEFT JOIN clients u ON e.client_id = u.id $where_clause";
    $count_stmt = $pdo->prepare($count_sql);
    $count_stmt->execute($params);
    $total_records = $count_stmt->fetchColumn();

    // Get global stats
    $stats_sql = "SELECT 
                    COUNT(*) as total,
                    SUM(CASE WHEN status = 'published' AND deleted_at IS NULL THEN 1 ELSE 0 END) as published,
                    SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) as deleted,
                    SUM(CASE WHEN status = 'scheduled' AND deleted_at IS NULL THEN 1 ELSE 0 END) as scheduled,
                    SUM(CASE WHEN status = 'restored' AND deleted_at IS NULL THEN 1 ELSE 0 END) as restored
                  FROM events";
    $stats_stmt = $pdo->query($stats_sql);
    $stats = $stats_stmt->fetch();

    // Get events (including soft-deleted for admin to monitor)
    $sql = "SELECT e.*, u.business_name as client_name, u.custom_id as client_custom_id 
            FROM events e 
            LEFT JOIN clients u ON e.client_id = u.id 
            $where_clause 
            ORDER BY e.created_at DESC 
            LIMIT ? OFFSET ?";

    $stmt = $pdo->prepare($sql);

    // Positional parameters for search, then limit and offset
    $param_idx = 1;
    foreach ($params as $p) {
        $stmt->bindValue($param_idx++, $p);
    }
    $stmt->bindValue($param_idx++, $limit, PDO::PARAM_INT);
    $stmt->bindValue($param_idx++, $offset, PDO::PARAM_INT);

    $stmt->execute();
    $events = $stmt->fetchAll();

    // Process events: parse metadata
    $events = array_map(function($ev) {
        if (!empty($ev['metadata'])) {
            $meta = json_decode($ev['metadata'], true);
            if (is_array($meta)) $ev = array_merge($ev, $meta);
        }
        return $ev;
    }, $events);

    echo json_encode([
        'success' => true,
        'events' => $events,
        'total' => $total_records,
        'stats' => $stats
    ]);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database error. Please try again or contact support if it persists.']);
}
