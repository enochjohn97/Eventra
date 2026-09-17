<?php

header('Content-Type: application/json');
require_once '../../includes/middleware/auth.php';
require_once '../../config/database.php';

checkAuth();
$auth_id = getAuthId();
$role = $_SESSION['role'] ?? $_SESSION['user_role'] ?? 'user';

// Get JSON input
$data = json_decode(file_get_contents("php://input"), true);

try {
    $role = $_SESSION['role'] ?? $_SESSION['user_role'] ?? 'user';

    if (isset($data['notification_id'])) {
        // Mark single notification as read
        $stmt = $pdo->prepare("UPDATE notifications SET is_read = 1 WHERE id = ? AND recipient_auth_id = ? AND recipient_role = ?");
        $stmt->execute([$data['notification_id'], $auth_id, $role]);

        echo json_encode([
            'success' => true,
            'message' => 'Notification marked as read'
        ]);
    } elseif (isset($data['mark_all'])) {
        // Mark all notifications as read
        $stmt = $pdo->prepare("UPDATE notifications SET is_read = 1 WHERE recipient_auth_id = ? AND recipient_role = ?");
        $stmt->execute([$auth_id, $role]);

        echo json_encode([
            'success' => true,
            'message' => 'All notifications marked as read'
        ]);
    } else {
        http_response_code(400);
        echo json_encode([
            'success' => false,
            'message' => 'Invalid request. Provide notification_id or mark_all parameter.'
        ]);
    }
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Database error. Please try again or contact support if it persists.'
    ]);
}
