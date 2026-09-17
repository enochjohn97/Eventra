<?php

/**
 * Force Delete Event API
 * Permanently deletes an event and its associated data
 */

header('Content-Type: application/json');
require_once '../../config/database.php';
require_once '../utils/notification-helper.php';
require_once '../../includes/middleware/auth.php';

// Check authentication and role (client or admin)
$user_id = checkAuth();
$user_role = $_SESSION['role'] ?? $_SESSION['user_role'] ?? 'user';

$data = json_decode(file_get_contents("php://input"), true);
$event_id = $data['event_id'] ?? null;

if (!$event_id) {
    echo json_encode(['success' => false, 'message' => 'Event ID is required']);
    exit;
}

try {
    // Get event details before deletion
    $stmt = $pdo->prepare("SELECT event_name, client_id, deleted_at FROM events WHERE id = ?");
    $stmt->execute([$event_id]);
    $event = $stmt->fetch();

    if (!$event) {
        echo json_encode(['success' => false, 'message' => 'Event not found']);
        exit;
    }

    if (!$event['deleted_at']) {
        echo json_encode(['success' => false, 'message' => 'Event must be in trash before permanent deletion']);
        exit;
    }

    // Use user_id directly if role is client
    $resolved_user_id = $user_id;

    // Check permissions (client can only delete their own events, admin can delete any)
    if ($user_role === 'client' && $event['client_id'] != $resolved_user_id) {
        echo json_encode(['success' => false, 'message' => 'You do not have permission to delete this event']);
        exit;
    }

    // Permanently delete the event (CASCADE will handle tickets)
    $stmt = $pdo->prepare("DELETE FROM events WHERE id = ?");
    $stmt->execute([$event_id]);

    // Notify admin about permanent deletion if deleted by client
    if ($user_role === 'client') {
        $stmt = $pdo->prepare("SELECT business_name FROM clients WHERE id = ?");
        $stmt->execute([$user_id]);
        $client_info = $stmt->fetch();
        $user_name = $client_info['business_name'] ?? 'A Client';

        $admin_id = getAdminUserId();
        if ($admin_id) {
            $message = "Event '{$event['event_name']}' has been permanently deleted by $user_name";
            createNotification($admin_id, $message, 'event_force_deleted', $user_id, 'admin', 'client');
        }
    }

    echo json_encode([
        'success' => true,
        'message' => 'Event permanently deleted'
    ]);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database error. Please try again or contact support if it persists.']);
}
