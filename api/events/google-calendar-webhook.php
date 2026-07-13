<?php
header('Content-Type: application/json');
require_once '../../config/env-loader.php';
require_once '../../config/database.php';
require_once '../utils/notification-helper.php';

$token = $_SERVER['HTTP_X_GOOG_CHANNEL_TOKEN'] ?? '';
$expectedToken = $_ENV['GOOGLE_WEBHOOK_SECRET'] ?? getenv('GOOGLE_WEBHOOK_SECRET') ?: '';
if ($expectedToken !== '' && $token !== $expectedToken) {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => 'Invalid webhook token']);
    exit;
}

$input = file_get_contents('php://input');
$payload = json_decode($input, true);
if (!is_array($payload)) {
    echo json_encode(['success' => true, 'message' => 'Webhook received']);
    exit;
}

$eventId = $payload['event']['id'] ?? null;
if (empty($eventId)) {
    echo json_encode(['success' => true, 'message' => 'No event id provided']);
    exit;
}

$stmt = $pdo->prepare("SELECT id, event_name, event_date, event_time, client_id, status FROM events WHERE metadata LIKE ? OR metadata LIKE ? LIMIT 1");
$stmt->execute(["%google_calendar_event_id%", "%$eventId%"]);
$event = $stmt->fetch();
if (!$event) {
    echo json_encode(['success' => true, 'message' => 'Event not found']);
    exit;
}

$eventDateTime = strtotime($event['event_date'] . ' ' . $event['event_time']);
$now = time();
$oneDayBefore = $eventDateTime - 86400;
$tenMinutesBefore = $eventDateTime - 600;

if ($event['status'] === 'draft' && $now >= $oneDayBefore && $now < $oneDayBefore + 1800) {
    $clientAuthId = null;
    $clientStmt = $pdo->prepare("SELECT client_auth_id FROM clients WHERE id = ? LIMIT 1");
    $clientStmt->execute([$event['client_id']]);
    $clientAuthId = $clientStmt->fetchColumn();
    if ($clientAuthId) {
        createNotification($clientAuthId, "Please return to Eventra and publish '{$event['event_name']}' for the upcoming event.", 'event_publish_reminder', null, 'client', 'client');
    }
}

if ($now >= $tenMinutesBefore && $now < $tenMinutesBefore + 600) {
    $clientAuthId = null;
    $clientStmt = $pdo->prepare("SELECT client_auth_id FROM clients WHERE id = ? LIMIT 1");
    $clientStmt->execute([$event['client_id']]);
    $clientAuthId = $clientStmt->fetchColumn();
    if ($clientAuthId) {
        createNotification($clientAuthId, "Your event '{$event['event_name']}' is starting soon. Please prepare for the live session.", 'event_live_reminder', null, 'client', 'client');
    }

    $userStmt = $pdo->prepare("SELECT DISTINCT u.user_auth_id FROM tickets t JOIN users u ON u.id = t.user_id WHERE t.event_id = ?");
    $userStmt->execute([$event['id']]);
    while ($userAuthId = $userStmt->fetchColumn()) {
        createNotification($userAuthId, "Live now: {$event['event_name']} is underway.", 'event_live_now', null, 'user', 'user');
    }
}

echo json_encode(['success' => true, 'message' => 'Webhook processed']);
