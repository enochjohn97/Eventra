<?php

/**
 * Delete Media API
 * Deletes a media file
 */

header('Content-Type: application/json');
require_once '../../config/database.php';
require_once '../utils/notification-helper.php';

// Check authentication
require_once '../../includes/middleware/auth.php';
$client_id = clientMiddleware();

$data = json_decode(file_get_contents("php://input"), true);
$media_id = $data['media_id'] ?? null;
$permanent = $data['permanent'] ?? false;

if (!$media_id) {
    echo json_encode(['success' => false, 'message' => 'Media ID is required']);
    exit;
}

try {
    // Get media details
    $stmt = $pdo->prepare("SELECT * FROM media WHERE id = ? AND client_id = ?");
    $stmt->execute([$media_id, $client_id]);
    $media = $stmt->fetch();

    if (!$media) {
        echo json_encode(['success' => false, 'message' => 'Media not found or permission denied']);
        exit;
    }

    if ($permanent) {
        // Permanent (hard) delete
        $relativePath = ltrim($media['file_path'], '/');
        $filePath = realpath(__DIR__ . '/../../' . $relativePath);
        if ($filePath && file_exists($filePath) && is_file($filePath)) {
            @unlink($filePath);
        }
        
        $stmt = $pdo->prepare("DELETE FROM media WHERE id = ?");
        $stmt->execute([$media_id]);
        
        $msg = 'Media permanently deleted from disk and database';
    } else {
        // Soft delete (trash)
        $stmt = $pdo->prepare("UPDATE media SET is_deleted = 1, deleted_at = NOW() WHERE id = ?");
        $stmt->execute([$media_id]);
        
        $msg = 'Media moved to trash';
    }

    if ($stmt->rowCount() > 0) {
        // Create notification
        if (function_exists('createMediaDeletedNotification')) {
            createMediaDeletedNotification($client_id, $media['file_name'], 'file');
        }

        echo json_encode([
            'success' => true,
            'message' => $msg
        ]);
    } else {
        echo json_encode(['success' => false, 'message' => 'Action failed or item already processed']);
    }
} catch (Throwable $e) {
    http_response_code(500);
    error_log("[DeleteMedia] Error: " . $e->getMessage());
    echo json_encode(['success' => false, 'message' => 'Internal server error: ' . $e->getMessage()]);
}
