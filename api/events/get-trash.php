<?php

/**
 * Get Trash API
 * Retrieves soft-deleted events with role-based filtering
 */

header('Content-Type: application/json');
require_once '../../config/database.php';
require_once '../../includes/middleware/auth.php';

// Check authentication and role (client or admin)
$user_id = checkAuth();
$user_role = $_SESSION['role'];

try {
    $limit = $_GET['limit'] ?? 10;
    $offset = $_GET['offset'] ?? 0;

    // Build query based on role
    $where_clauses = ["e.deleted_at IS NOT NULL"];
    $params = [];

    // Use user_id directly if user is client
    if ($user_role === 'client') {
        $where_clauses[] = "e.client_id = ?";
        $params[] = $user_id;
    }
    // Admin can see all trashed events (no additional filter)

    $where_sql = 'WHERE ' . implode(' AND ', $where_clauses);

    // Get total count
    $count_stmt = $pdo->prepare("SELECT COUNT(*) as total FROM events e $where_sql");
    $count_stmt->execute($params);
    $total = $count_stmt->fetch()['total'];

    // Get trashed events with client information
    $sql = "
        SELECT e.*, c.business_name as client_name, c.profile_pic as client_profile_pic
        FROM events e
        LEFT JOIN clients c ON e.client_id = c.id
        $where_sql
        ORDER BY e.deleted_at DESC
        LIMIT ? OFFSET ?
    ";

    $query_params = $params;
    $query_params[] = (int) $limit;
    $query_params[] = (int) $offset;

    $stmt = $pdo->prepare($sql);

    // Bind values
    foreach ($query_params as $key => $value) {
        $stmt->bindValue($key + 1, $value, is_int($value) ? PDO::PARAM_INT : PDO::PARAM_STR);
    }

    $stmt->execute();
    $events = $stmt->fetchAll();

    echo json_encode([
        'success' => true,
        'events' => $events,
        'total' => $total
    ]);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database error. Please try again or contact support if it persists.']);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Unexpected error. Please try again.']);
}
