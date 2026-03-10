<?php
/**
 * Get Events API
 * Retrieves events with filtering and pagination
 */
header('Content-Type: application/json');
require_once '../../config/database.php';

require_once '../../includes/middleware/auth.php';

try {
    // Optional check: Use non-blocking auth check to support guest access with stale tokens
    $user_id = checkAuthOptional();

    $client_id = $_GET['client_id'] ?? null;
    $status = $_GET['status'] ?? null;
    $limit = $_GET['limit'] ?? 10;
    $offset = $_GET['offset'] ?? 0;
    $user_role = $_SESSION['user_role'] ?? 'guest';

    // Build query
    $where_clauses = [];
    $params = [];

    // Filter by client_id if provided
    if ($client_id) {
        // If the requester is a client, the frontend might be passing their auth_id.
        // We should ensure we are filtering by the actual client.id (PK)
        $stmt = $pdo->prepare("SELECT id FROM clients WHERE client_auth_id = ? OR id = ?");
        $stmt->execute([$client_id, $client_id]);
        $resolved_client = $stmt->fetch();

        if ($resolved_client) {
            $where_clauses[] = "e.client_id = ?";
            $params[] = $resolved_client['id'];
        } else {
            // If no client found, return empty set
            $where_clauses[] = "1 = 0";
        }
    }

    // Filter by status
    if ($status) {
        $where_clauses[] = "e.status = ?";
        $params[] = $status;
    } else {
        // For public/users, only show published events
        if ($user_role !== 'admin' && $user_role !== 'client') {
            $where_clauses[] = "e.status = 'published'";
        }
    }

    // Exclude soft-deleted events
    $where_clauses[] = "e.deleted_at IS NULL";

    $where_sql = !empty($where_clauses) ? 'WHERE ' . implode(' AND ', $where_clauses) : '';

    // Get total count
    $count_stmt = $pdo->prepare("SELECT COUNT(*) as total FROM events e $where_sql");
    $count_stmt->execute($params);
    $total = $count_stmt->fetch()['total'];

    // Get events with client information and favorite status if user is logged in
    // Get appropriate user_id based on role
    $user_id = null;
    if ($user_role === 'admin') {
        $user_id = $_SESSION['admin_id'] ?? null;
    } elseif ($user_role === 'client') {
        $user_id = $_SESSION['client_id'] ?? null;
    } else {
        $user_id = $_SESSION['user_id'] ?? null;
    }

    // Check if user is logged in for favorites
    $favoriteSubquery = "0 as is_favorite";
    if ($user_id) {
        $favoriteSubquery = "(SELECT COUNT(*) FROM favorites WHERE user_id = ? AND event_id = e.id) as is_favorite";
    }

    $sql = "
        SELECT 
            e.*, 
            c.business_name as organizer_name,
            c.profile_pic as client_profile_pic,
            (c.nin_verified = 1 AND c.bvn_verified = 1) as is_verified,
            $favoriteSubquery
        FROM events e
        JOIN clients c ON e.client_id = c.id
        $where_sql
        ORDER BY e.created_at DESC
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
    $query_params[] = (int) $limit;
    $query_params[] = (int) $offset;

    $stmt = $pdo->prepare($sql);

    // Bind values
    foreach ($query_params as $key => $value) {
        $stmt->bindValue($key + 1, $value, is_int($value) ? PDO::PARAM_INT : PDO::PARAM_STR);
    }

    $stmt->execute();
    $events = $stmt->fetchAll();

    // Get statistics if client_id is provided
    $stats = null;
    $resolved_client_id = isset($resolved_client['id']) ? $resolved_client['id'] : null;

    if ($resolved_client_id) {
        $stats_stmt = $pdo->prepare("
            SELECT 
                COUNT(CASE WHEN deleted_at IS NULL THEN 1 END) as total_events,
                SUM(CASE WHEN status = 'published' AND deleted_at IS NULL THEN 1 ELSE 0 END) as published_events,
                SUM(CASE WHEN status = 'scheduled' AND deleted_at IS NULL THEN 1 ELSE 0 END) as scheduled_events,
                SUM(CASE WHEN status = 'draft' AND deleted_at IS NULL THEN 1 ELSE 0 END) as draft_events,
                SUM(CASE WHEN status = 'restored' AND deleted_at IS NULL THEN 1 ELSE 0 END) as restored_events,
                SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) as deleted_events,
                IFNULL(SUM(CASE WHEN deleted_at IS NULL THEN attendee_count ELSE 0 END), 0) as total_attendees
            FROM events
            WHERE client_id = ?
        ");
        $stats_stmt->execute([$resolved_client_id]);
        $stats = $stats_stmt->fetch();
    }

    echo json_encode([
        'success' => true,
        'events' => $events,
        'total' => $total,
        'stats' => $stats
    ]);

} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database error: ' . $e->getMessage()]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'General error: ' . $e->getMessage()]);
}
