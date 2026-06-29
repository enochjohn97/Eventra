<?php
/**
 * Get All Users API for Admin
 * Retrieves all registered users with role 'user'
 * OPTIMIZED: Eliminated N+1 queries and triple-nested subqueries
 */

// MUST be the first two lines — no whitespace, no BOM before <?php
require_once __DIR__ . '/../../config.php'; 
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/middleware/auth.php';

// Then immediately set JSON response header
header('Content-Type: application/json');

// Handle CORS preflight — must come before any logic
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Check if admin is logged in
checkAuth('admin');

try {
    $limit = isset($_GET['limit']) ? (int) $_GET['limit'] : 10;
    $offset = isset($_GET['offset']) ? (int) $_GET['offset'] : 0;
    $search = $_GET['search'] ?? '';

    $params = [];
    $where_clause = "WHERE p.deleted_at IS NULL AND a.deleted_at IS NULL";

    if (!empty($search)) {
        $where_clause .= " AND (p.name LIKE ? OR a.email LIKE ? OR p.phone LIKE ?)";
        $search_param = "%$search%";
        $params = [$search_param, $search_param, $search_param];
    }

    // Get total count
    $count_sql = "SELECT COUNT(*) FROM users p JOIN auth_accounts a ON p.user_auth_id = a.id $where_clause";
    $count_stmt = $pdo->prepare($count_sql);
    $count_stmt->execute($params);
    $total_records = $count_stmt->fetchColumn();

    // Get users with optimized queries using JOINs instead of subqueries
    $sql = "SELECT p.id, p.custom_id, p.name, a.email, p.profile_pic, p.phone, 
            p.gender, p.dob, p.address, p.city, p.state, p.country,
            a.is_active, IF(a.is_online = 1 AND a.last_seen >= NOW() - INTERVAL 15 MINUTE, 1, 0) as is_online,
            IF(a.is_online = 1 AND a.last_seen >= NOW() - INTERVAL 15 MINUTE, 'active', 'inactive') as status, p.created_at, a.last_login_at, a.email_verified_at,
            COUNT(DISTINCT CASE WHEN t.used = 1 THEN t.id END) as checked_in_count,
            MAX(c.business_name) as client_name
            FROM users p
            JOIN auth_accounts a ON p.user_auth_id = a.id
            LEFT JOIN tickets t ON p.id = t.user_id
            LEFT JOIN payments py ON t.payment_id = py.id
            LEFT JOIN events e ON t.event_id = e.id
            LEFT JOIN clients c ON e.client_id = c.id
            $where_clause
            GROUP BY p.id
            ORDER BY p.created_at DESC 
            LIMIT ? OFFSET ?";

    $stmt = $pdo->prepare($sql);

    $param_idx = 1;
    foreach ($params as $p) {
        $stmt->bindValue($param_idx++, $p);
    }
    $stmt->bindValue($param_idx++, $limit, PDO::PARAM_INT);
    $stmt->bindValue($param_idx++, $offset, PDO::PARAM_INT);

    $stmt->execute();
    $users = $stmt->fetchAll();

    // Get Global Summary Stats (combined into single query)
    $summary_sql = "SELECT 
        (SELECT COUNT(*) FROM users u JOIN auth_accounts a ON u.user_auth_id = a.id WHERE u.deleted_at IS NULL AND a.deleted_at IS NULL) as total_registered,
        (SELECT COUNT(*) FROM users u JOIN auth_accounts a ON u.user_auth_id = a.id WHERE a.is_active = 1 AND u.deleted_at IS NULL AND a.deleted_at IS NULL) as total_active,
        (SELECT COUNT(*) FROM users u JOIN auth_accounts a ON u.user_auth_id = a.id WHERE a.is_online = 1 AND a.last_seen >= NOW() - INTERVAL 15 MINUTE AND u.deleted_at IS NULL AND a.deleted_at IS NULL) as total_checked_in";
    
    $summary_stmt = $pdo->prepare($summary_sql);
    $summary_stmt->execute();
    $summary = $summary_stmt->fetch();

    echo json_encode([
        'success' => true,
        'users' => $users,
        'total' => $total_records,
        'summary' => [
            'total_registered' => (int) $summary['total_registered'],
            'total_active' => (int) $summary['total_active'],
            'total_checked_in' => (int) $summary['total_checked_in']
        ]
    ]);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database error: ' . $e->getMessage()]);
}
