<?php

/**
 * Restore Event API
 * Restores a soft-deleted event
 */

header('Content-Type: application/json');
require_once '../../config/database.php';
require_once '../utils/notification-helper.php';
require_once '../../includes/middleware/auth.php';

$headers = getallheaders();
$headersLower = array_change_key_case($headers, CASE_LOWER);
$portal = $headersLower['x-eventra-portal'] ?? null;

if ($portal === 'client') {
    $user_id = checkAuth('client');
    $user_role = 'client';
} elseif ($portal === 'admin') {
    $user_id = checkAuth('admin');
    $user_role = 'admin';
} else {
    $user_role = $_SESSION['role'] ?? null;
    if ($user_role === 'client') {
        $user_id = checkAuth('client');
    } elseif ($user_role === 'admin') {
        $user_id = checkAuth('admin');
    } else {
        http_response_code(401);
        echo json_encode(['success' => false, 'message' => 'Unauthorized']);
        exit;
    }
}

$data = json_decode(file_get_contents("php://input"), true);
$event_id = $data['event_id'] ?? null;

if (!$event_id) {
    echo json_encode(['success' => false, 'message' => 'Event ID is required']);
    exit;
}

try {
    // Get event details before restoration - Scoped
    $sql = "SELECT e.event_name, e.client_id, e.deleted_at, c.client_auth_id 
            FROM events e 
            JOIN clients c ON e.client_id = c.id 
            WHERE e.id = ?";
    $params = [$event_id];

    if ($user_role === 'client') {
        $sql .= " AND e.client_id = ?";
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
        echo json_encode(['success' => false, 'message' => 'Event is not in trash']);
        exit;
    }

    // Check permissions (client can only restore their own events, admin can restore any)
    if ($user_role === 'client' && $event['client_id'] != $user_id) {
        echo json_encode(['success' => false, 'message' => 'You do not have permission to restore this event']);
        exit;
    }

    // Restore the event (set deleted_at to NULL, status to 'draft', and tag as restored in metadata)
    $sql = "UPDATE events 
            SET deleted_at = NULL, 
                status = 'draft',
                metadata = JSON_SET(IFNULL(metadata, '{}'), '$.is_restored', true)
            WHERE id = ?";
    $params = [$event_id];

    if ($user_role === 'client') {
        $sql .= " AND client_id = ?";
        $params[] = $user_id;
    }

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);

    // Metadata for notifications
    $metadata = ['event_id' => $event_id, 'event_name' => $event['event_name']];
    $auth_id = getAuthId();

    // Send notifications for restoration activity
    if ($user_role === 'client') {
        // Client restored their event - notify admin
        $stmt = $pdo->prepare("SELECT business_name FROM clients WHERE id = ?");
        $stmt->execute([$user_id]);
        $client_info = $stmt->fetch();
        $user_name = $client_info['business_name'] ?? 'A Client';

        $admin_id = getAdminUserId();
        if ($admin_id) {
            $message = "Event '{$event['event_name']}' has been restored by $user_name";
            createNotification($admin_id, $message, 'event_restored', $auth_id, 'admin', 'client', $metadata);
        }
        createNotification($auth_id, "Your event '{$event['event_name']}' has been restored to draft.", 'event_restored', $auth_id, 'client', 'client', $metadata);
    } else {
        // Admin restored the event - notify the client owner
        $message = "Your event '{$event['event_name']}' has been restored.";
        $client_auth_id = $event['client_auth_id'];
        createNotification($client_auth_id, $message, 'event_restored', $auth_id, 'client', 'admin', $metadata);
    }

    echo json_encode([
        'success' => true,
        'message' => 'Event restored successfully'
    ]);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database error: ' . $e->getMessage()]);
}
