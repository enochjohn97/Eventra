<?php

header('Content-Type: application/json');
require_once '../../includes/middleware/auth.php';
require_once '../../config/database.php';

$user_id = checkAuth(); // Ensure user is logged in

try {
    // Fetch unread notifications for the user
    $stmt = $pdo->prepare("
        SELECT 
            n.id,
            n.recipient_auth_id,
            n.sender_auth_id,
            n.message,
            n.type,
            n.metadata,
            n.is_read,
            n.created_at,
            COALESCE(u.name, c.business_name, adm.name) as sender_name,
            n.sender_role
        FROM notifications n
        LEFT JOIN users u ON n.sender_auth_id = u.user_auth_id AND n.sender_role = 'user'
        LEFT JOIN clients c ON n.sender_auth_id = c.client_auth_id AND n.sender_role = 'client'
        LEFT JOIN admins adm ON n.sender_auth_id = adm.admin_auth_id AND n.sender_role = 'admin'
        WHERE n.recipient_auth_id = ? AND n.is_read = 0
        ORDER BY n.created_at DESC
        LIMIT 50
    ");
    $stmt->execute([$user_id]);
    $notifications = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Fetch active users/clients/admins status for dashboard
    $usersStatus = [];
    $role = $_SESSION['role'] ?? 'user';
    
    if ($role === 'admin' || $role === 'client') {
        // Get list of active users in the system
        $sql = "
            SELECT 
                a.id as auth_id,
                COALESCE(u.name, c.business_name, adm.name) as name,
                a.role,
                a.is_online,
                COALESCE(u.status, c.status, adm.status, 'offline') as status,
                a.last_seen
            FROM auth_accounts a
            LEFT JOIN users u ON a.id = u.user_auth_id
            LEFT JOIN clients c ON a.id = c.client_auth_id
            LEFT JOIN admins adm ON a.id = adm.admin_auth_id
            WHERE a.id != ? AND a.is_active = 1
            ORDER BY a.is_online DESC, a.last_seen DESC
        ";
        $stmt = $pdo->prepare($sql);
        $stmt->execute([$user_id]);
        $usersStatus = $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    echo json_encode([
        'success' => true,
        'notifications' => $notifications,
        'unread_count' => count($notifications),
        'users_status' => $usersStatus,
        'current_user' => [
            'id' => $user_id,
            'role' => $role
        ]
    ]);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Database error. Please try again or contact support if it persists.'
    ]);
}
