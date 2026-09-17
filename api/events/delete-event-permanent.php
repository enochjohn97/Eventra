<?php

/**
 * Permanently Delete Event API
 * Permanently removes an event from the database (hard delete)
 */

header('Content-Type: application/json');
require_once '../../config/database.php';
require_once '../../includes/middleware/auth.php';
require_once '../utils/notification-helper.php';

// Check authentication (client or admin)
$user_id = checkAuth();
$user_role = $_SESSION['role'] ?? $_SESSION['user_role'] ?? 'user';

$data = json_decode(file_get_contents("php://input"), true);
$event_id = $data['event_id'] ?? null;

if (!$event_id) {
    echo json_encode(['success' => false, 'message' => 'Event ID is required']);
    exit;
}

try {
    // Get event details
    // Get event details - Scoped
    $sql = "SELECT event_name, client_id, deleted_at FROM events WHERE id = ?";
    $params = [$event_id];

    if ($user_role === 'client') {
        $sql .= " AND client_id = ?";
        $params[] = $user_id;
    }

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
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

    // Check permissions
    if ($user_role === 'client' && $event['client_id'] != $resolved_user_id) {
        echo json_encode(['success' => false, 'message' => 'You do not have permission to delete this event']);
        exit;
    }

    // Permanently delete the event (hard delete)
    $sql = "DELETE FROM events WHERE id = ?";
    $params = [$event_id];

    if ($user_role === 'client') {
        $sql .= " AND client_id = ?";
        $params[] = $user_id;
    }

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);

    // Notify admin about permanent deletion if deleted by client
    if ($user_role === 'client') {
        $stmt = $pdo->prepare("SELECT business_name FROM clients WHERE id = ?");
        $stmt->execute([$user_id]);
        $client_info = $stmt->fetch();
        $user_name = $client_info['business_name'] ?? 'A Client';

        $admin_id = getAdminUserId();
        if ($admin_id) {
            $message = "Event '{$event['event_name']}' has been permanently deleted by $user_name";
            createNotification($admin_id, $message, 'event_deleted_permanent', $user_id, 'admin', 'client');
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
