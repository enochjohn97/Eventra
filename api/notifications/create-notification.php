<?php

/**
 * Create Notification API
 * Handles notification creation
 */

header('Content-Type: application/json');
require_once '../../config/database.php';
require_once '../utils/notification-helper.php';

// Check authentication
if (!isset($_SESSION['user_id'])) {
    echo json_encode([
        'success' => false,
        'message' => 'Unauthorized'
    ]);
    exit;
}

$data = json_decode(file_get_contents("php://input"), true);

if (!isset($data['recipient_id']) || !isset($data['message'])) {
    echo json_encode([
        'success' => false,
        'message' => 'Missing required fields'
    ]);
    exit;
}

$recipient_id = $data['recipient_id'];
$message = $data['message'];
$type = $data['type'] ?? 'info';
$sender_id = $data['sender_id'] ?? $_SESSION['user_id'];

try {
    $result = createNotification($recipient_id, $message, $type, $sender_id);

    if ($result) {
        echo json_encode([
            'success' => true,
            'message' => 'Notification created successfully'
        ]);
    } else {
        echo json_encode([
            'success' => false,
            'message' => 'Failed to create notification'
        ]);
    }
} catch (Exception $e) {
    echo json_encode([
        'success' => false,
        'message' => 'Request failed. Please try again.'
    ]);
}
