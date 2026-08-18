<?php

/**
 * Delete Folder API
 * Soft-deletes a folder and all its contents
 */

header('Content-Type: application/json');
require_once '../../config/database.php';
require_once '../utils/notification-helper.php';

// Check authentication
require_once '../../includes/middleware/auth.php';
$client_id = clientMiddleware();

$data = json_decode(file_get_contents("php://input"), true);
$folder_id = $data['folder_id'] ?? null;

if (!$folder_id) {
    echo json_encode(['success' => false, 'message' => 'Folder ID is required']);
    exit;
}
$permanent = $data['permanent'] ?? false;

try {
    $pdo->beginTransaction();

    // Verify folder
    $stmt = $pdo->prepare("SELECT * FROM media_folders WHERE id = ? AND client_id = ?");
    $stmt->execute([$folder_id, $client_id]);
    if (!$stmt->fetch()) {
        echo json_encode(['success' => false, 'message' => 'Folder not found']);
        exit;
    }

    if ($permanent) {
        $stmt_media = $pdo->prepare("SELECT file_path FROM media WHERE folder_id = ? AND client_id = ?");
        $stmt_media->execute([$folder_id, $client_id]);
        while($file = $stmt_media->fetch()) {
            $filePath = realpath(__DIR__ . '/../../' . ltrim($file['file_path'], '/'));
            if ($filePath && file_exists($filePath) && is_file($filePath)) {
                @unlink($filePath);
            }
        }
        $pdo->prepare("DELETE FROM media WHERE folder_id = ? AND client_id = ?")->execute([$folder_id, $client_id]);
        $pdo->prepare("DELETE FROM media_folders WHERE id = ? AND client_id = ?")->execute([$folder_id, $client_id]);
        $pdo->commit();
        echo json_encode(['success' => true, 'message' => 'Folder and contents permanently deleted']);
        exit;
    }

    // Soft delete folder
    $upd_folder = $pdo->prepare("UPDATE media_folders SET is_deleted = 1 WHERE id = ? AND client_id = ?");
    $upd_folder->execute([$folder_id, $client_id]);

    // Soft delete contained media
    $upd_media = $pdo->prepare("UPDATE media SET is_deleted = 1 WHERE folder_id = ? AND client_id = ?");
    $upd_media->execute([$folder_id, $client_id]);

    $pdo->commit();

    // Trigger notification
    $stmt = $pdo->prepare("SELECT name FROM media_folders WHERE id = ?");
    $stmt->execute([$folder_id]);
    $folder_name = $stmt->fetchColumn();
    if ($folder_name) {
        createMediaDeletedNotification($client_id, $folder_name, 'folder');
    }

    echo json_encode([
        'success' => true,
        'message' => 'Folder and contents deleted successfully'
    ]);
} catch (PDOException $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database error: ' . $e->getMessage()]);
}
