<?php

/**
 * API: Get Single Event
 * Returns event details by ID
 */

header('Content-Type: application/json');
require_once '../../config/database.php';

$event_id = $_GET['id'] ?? null;

if (!$event_id) {
    echo json_encode(['success' => false, 'message' => 'Event ID required']);
    exit;
}

try {
    $stmt = $pdo->prepare("
        SELECT e.*, c.name as client_name, c.business_name, a.email as client_email,
               c.verification_status, c.profile_pic as client_profile_pic
        FROM events e
        LEFT JOIN clients c ON e.client_id = c.id
        LEFT JOIN auth_accounts a ON c.client_auth_id = a.id
        WHERE e.id = ?
    ");
    $stmt->execute([$event_id]);
    $event = $stmt->fetch();

    if ($event) {
        // Parse metadata if it exists
        if (!empty($event['metadata'])) {
            $metadata = json_decode($event['metadata'], true);
            if (is_array($metadata)) {
                $event = array_merge($event, $metadata);
            }
        }
        echo json_encode(['success' => true, 'event' => $event]);
    } else {
        echo json_encode(['success' => false, 'message' => 'Event not found']);
    }
} catch (PDOException $e) {
    echo json_encode(['success' => false, 'message' => 'Database error. Please try again or contact support if it persists.']);
}
