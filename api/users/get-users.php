<?php
/**
 * Get Users API
 * Retrieves users who have interacted with the client's events
 */
header('Content-Type: application/json');
require_once '../../config/database.php';
require_once '../../includes/middleware/auth.php';

try {
    $auth_id = checkAuth('client');

    // Resolve real_client_id from auth_id
    $client_stmt = $pdo->prepare("SELECT id FROM clients WHERE client_auth_id = ?");
    $client_stmt->execute([$auth_id]);
    $client_row = $client_stmt->fetch();

    if (!$client_row) {
        echo json_encode(['success' => false, 'message' => 'Client profile not found.']);
        exit;
    }
    $real_client_id = $client_row['id'];

    // Get unique users who have purchased tickets for this client's events
    $stmt = $pdo->prepare("
        SELECT DISTINCT 
            u.id,
            u.name,
            a.email,
            u.phone,
            u.state,
            u.city,
            u.country,
            u.dob,
            u.gender,
            u.profile_pic,
            a.created_at,
            'active' as status,
            c.business_name as client_name
        FROM users u
        JOIN auth_accounts a ON u.user_auth_id = a.id
        JOIN payments p ON u.id = p.user_id
        JOIN events e ON p.event_id = e.id
        JOIN clients c ON e.client_id = c.id
        WHERE e.client_id = ? AND p.status = 'paid'
        ORDER BY a.created_at DESC
    ");
    $stmt->execute([$real_client_id]);
    $users = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Calculate basic stats
    $total_users = count($users);
    $engaged_users = count(array_filter($users, function ($u) {
        // Simple heuristic for engagement: exists in this list
        return true;
    }));

    echo json_encode([
        'success' => true,
        'users' => $users,
        'stats' => [
            'active_users' => $total_users,
            'engaged_users' => $engaged_users,
            'registered_users' => $total_users
        ]
    ]);

} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database error: ' . $e->getMessage()]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'General error: ' . $e->getMessage()]);
}
