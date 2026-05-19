<?php
/**
 * Get Users API
 * Retrieves users who have interacted with the client's events
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

try {
    $real_client_id = checkAuth('client');

    // Verify the client profile exists
    $client_stmt = $pdo->prepare("SELECT id FROM clients WHERE id = ?");
    $client_stmt->execute([$real_client_id]);
    $client_row = $client_stmt->fetch();

    if (!$client_row) {
        echo json_encode(['success' => false, 'message' => 'Client profile not found.']);
        exit;
    }

    // Get ALL registered users (who have logged in to the system)
    // Also calculate stats about their engagement with this client's events
    $stmt = $pdo->prepare("
        SELECT 
            u.id,
            u.custom_id,
            u.name,
            aa.email,
            u.phone,
            u.state,
            u.city,
            u.country,
            u.dob,
            u.gender,
            u.profile_pic,
            aa.created_at,
            aa.is_online as status,
            COALESCE(COUNT(DISTINCT t.id), 0) as ticket_count,
            COALESCE(SUM(CASE WHEN p.status = 'paid' THEN 1 ELSE 0 END), 0) as paid_count
        FROM users u
        JOIN auth_accounts aa ON u.user_auth_id = aa.id
        LEFT JOIN tickets t ON u.id = t.user_id AND t.event_id IN (
            SELECT id FROM events WHERE client_id = ?
        )
        LEFT JOIN payments p ON u.id = p.user_id AND p.status = 'paid' AND p.event_id IN (
            SELECT id FROM events WHERE client_id = ?
        )
        GROUP BY u.id
        ORDER BY aa.created_at DESC
    ");
    $stmt->execute([$real_client_id, $real_client_id]);
    $users = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Calculate detailed stats for this client
    $total_registered_users = count($users);
    
    // Active users = users who have logged in (is_online = 1)
    $active_users = count(array_filter($users, function($user) {
        return $user['status'] == 1;
    }));
    
    // Engaged users = users with paid tickets for this client's events
    $engaged_users = count(array_filter($users, function($user) {
        return (int)$user['paid_count'] > 0;
    }));

    echo json_encode([
        'success' => true,
        'users' => $users,
        'stats' => [
            'registered_users' => $total_registered_users,
            'active_users' => $active_users,
            'engaged_users' => $engaged_users
        ]
    ]);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database error: ' . $e->getMessage()]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'General error: ' . $e->getMessage()]);
}
