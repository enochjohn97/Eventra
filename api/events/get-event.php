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
        SELECT e.*, u.name as client_name, u.email as client_email
        FROM events e
        LEFT JOIN clients u ON e.client_id = u.id
        WHERE e.id = ?
    ");
    $stmt->execute([$event_id]);
    $event = $stmt->fetch();

    if ($event) {
        echo json_encode(['success' => true, 'event' => $event]);
    } else {
        echo json_encode(['success' => false, 'message' => 'Event not found']);
    }
} catch (PDOException $e) {
    echo json_encode(['success' => false, 'message' => 'Database error: ' . $e->getMessage()]);
}
