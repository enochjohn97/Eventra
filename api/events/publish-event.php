<?php

/**
 * Publish Event API
 * Publishes a scheduled or draft event
 */

// Buffer output so stray PHP warnings don't corrupt the JSON response
ob_start();

header('Content-Type: application/json');
require_once '../../config/database.php';
require_once '../../includes/middleware/auth.php';

// Check authentication
$user_id = clientMiddleware();
$role = $_SESSION['role'] ?? 'client';

$data = json_decode(file_get_contents("php://input"), true);
$event_id = $data['event_id'] ?? null;

if (!$event_id) {
    ob_end_clean();
    echo json_encode(['success' => false, 'message' => 'Event ID is required']);
    exit;
}

try {
    // Use user_id directly (it is client_id from clientMiddleware)
    $resolved_client_id = $user_id;

    // Get event details with client auth id - Scoped to client
    $sql = "SELECT e.*, c.client_auth_id 
            FROM events e 
            JOIN clients c ON e.client_id = c.id 
            WHERE e.id = ?";
    $params = [$event_id];

    if ($role !== 'admin') {
        $sql .= " AND e.client_id = ?";
        $params[] = $resolved_client_id;
    }

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $event = $stmt->fetch();

    if (!$event) {
        ob_end_clean();
        echo json_encode(['success' => false, 'message' => 'Event not found']);
        exit;
    }

    // Check if user is the client who created the event or admin
    if ($role !== 'admin' && $event['client_id'] != $resolved_client_id) {
        ob_end_clean();
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'You do not have permission to publish this event']);
        exit;
    }

    // Begin transaction
    $pdo->beginTransaction();

    // Update event status to published
    $sql = "UPDATE events SET status = 'published' WHERE id = ?";
    $params = [$event_id];

    if ($role !== 'admin') {
        $sql .= " AND client_id = ?";
        $params[] = $resolved_client_id;
    }

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);

    // Commit the DB change FIRST — publish is persisted regardless of notification outcome
    $pdo->commit();

    // Send notifications (non-critical — errors are logged but never roll back the publish)
    try {
        require_once '../utils/notification-helper.php';

        $message = "Your event '{$event['event_name']}' has been published and is now live!";
        $auth_id = $_SESSION['auth_id'] ?? null;
        $client_auth_id = $event['client_auth_id'];

        createNotification($client_auth_id, $message, 'event_published', $auth_id, 'client', ($role === 'admin' ? 'admin' : 'client'));

        // Notify Admin
        $admin_id = getAdminUserId();
        if ($admin_id && $auth_id != $admin_id) {
            $admin_message = "Event '{$event['event_name']}' has been published.";
            createNotification($admin_id, $admin_message, 'event_published', $auth_id, 'admin', 'client');
        }
    } catch (Throwable $notif_err) {
        error_log("[Publish Event Notification Error] " . $notif_err->getMessage());
    }

    ob_end_clean();
    echo json_encode([
        'success' => true,
        'message' => 'Event published successfully'
    ]);
} catch (Throwable $e) {
    // Roll back the DB change so the event is NOT published on error
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    ob_end_clean();
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Server error. Please try again.']);
}
