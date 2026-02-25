<?php
/**
 * Mark Notification as Read API
 * Marks one or more notifications as read
 */
header('Content-Type: application/json');
require_once '../../config/database.php';
require_once '../../includes/middleware/auth.php';

// Check authentication
$user_id = checkAuth();

$data = json_decode(file_get_contents("php://input"), true);

// Support marking single or multiple notifications
$notification_ids = [];
if (isset($data['notification_id'])) {
    $notification_ids = [$data['notification_id']];
} elseif (isset($data['notification_ids']) && is_array($data['notification_ids'])) {
    $notification_ids = $data['notification_ids'];
} elseif (isset($data['mark_all']) && $data['mark_all'] === true) {
    // Mark all notifications as read for this user
    try {
        $stmt = $pdo->prepare("UPDATE notifications SET is_read = 1 WHERE recipient_auth_id = ? AND is_read = 0");
        $stmt->execute([$user_id]);

        echo json_encode([
            'success' => true,
            'message' => 'All notifications marked as read',
            'affected_rows' => $stmt->rowCount()
        ]);
        exit;
    } catch (PDOException $e) {
        error_log("Error marking all notifications as read: " . $e->getMessage());
        echo json_encode([
            'success' => false,
            'message' => 'Failed to mark notifications as read'
        ]);
        exit;
    }
}

if (empty($notification_ids)) {
    echo json_encode([
        'success' => false,
        'message' => 'No notification IDs provided'
    ]);
    exit;
}

try {
    // Build placeholders for IN clause
    $placeholders = str_repeat('?,', count($notification_ids) - 1) . '?';

    // Mark notifications as read (only if they belong to the current user)
    $query = "UPDATE notifications SET is_read = 1 
              WHERE id IN ($placeholders) AND recipient_auth_id = ? AND is_read = 0";

    $params = array_merge($notification_ids, [$user_id]);
    $stmt = $pdo->prepare($query);
    $stmt->execute($params);

    echo json_encode([
        'success' => true,
        'message' => 'Notifications marked as read',
        'affected_rows' => $stmt->rowCount()
    ]);

} catch (PDOException $e) {
    error_log("Error marking notifications as read: " . $e->getMessage());
    echo json_encode([
        'success' => false,
        'message' => 'Failed to mark notifications as read'
    ]);
}
