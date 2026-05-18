<?php

/**
 * Create Media Folder API
 * Creates a new folder for organizing media files
 */

header('Content-Type: application/json');
require_once '../../config/database.php';
require_once '../utils/notification-helper.php';

// Check authentication
require_once '../../includes/middleware/auth.php';
$client_id = clientMiddleware();

$data = json_decode(file_get_contents("php://input"), true);
$folder_name = $data['folder_name'] ?? '';

if (empty($folder_name)) {
    echo json_encode(['success' => false, 'message' => 'Folder name is required']);
    exit;
}

try {
    // Create physical folder
    $upload_dir = "../../uploads/media/client_$client_id/$folder_name/";
    if (!is_dir($upload_dir)) {
        mkdir($upload_dir, 0777, true);
    }

    // Insert into database
    $stmt = $pdo->prepare("INSERT INTO media_folders (client_id, name) VALUES (?, ?)");
    $stmt->execute([$client_id, $folder_name]);
    $folder_id = $pdo->lastInsertId();

    // Trigger notification (recipient must be auth_accounts.id, not clients.id)
    $client_auth_id = getAuthId();
    if ($client_auth_id) {
        createFolderCreatedNotification($client_auth_id, $folder_name);
    }

    echo json_encode([
        'success' => true,
        'message' => 'Folder created successfully',
        'folder_name' => $folder_name,
        'folder_id' => $folder_id
    ]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Error creating folder: ' . $e->getMessage()]);
}
