<?php

/**
 * Restore Media API
 * Restores a soft-deleted file or folder
 */

header('Content-Type: application/json');
require_once '../../config/database.php';
require_once '../utils/notification-helper.php';

// Check authentication
require_once '../../includes/middleware/auth.php';
$client_id = clientMiddleware();

$data = json_decode(file_get_contents("php://input"), true);
$id = $data['id'] ?? null;
$type = $data['type'] ?? 'file'; // 'file' or 'folder'

if (!$id) {
    echo json_encode(['success' => false, 'message' => 'ID is required']);
    exit;
}

try {
    $pdo->beginTransaction();

    if ($type === 'folder') {
        // Restore folder
        $stmt = $pdo->prepare("UPDATE media_folders SET is_deleted = 0 WHERE id = ? AND client_id = ?");
        $stmt->execute([$id, $client_id]);

        // Restore all contents
        $stmt2 = $pdo->prepare("UPDATE media SET is_deleted = 0 WHERE folder_id = ? AND client_id = ?");
        $stmt2->execute([$id, $client_id]);
    } else {
        // Get file name before update
        $stmt_name = $pdo->prepare("SELECT file_name FROM media WHERE id = ? AND client_id = ?");
        $stmt_name->execute([$id, $client_id]);
        $item_name = $stmt_name->fetchColumn();

        // Restore file
        $stmt = $pdo->prepare("UPDATE media SET is_deleted = 0 WHERE id = ? AND client_id = ?");
        $stmt->execute([$id, $client_id]);

        // Auto-restore parent folder if missing
        $check = $pdo->prepare("SELECT folder_id FROM media WHERE id = ? AND client_id = ?");
        $check->execute([$id, $client_id]);
        $folder_id = $check->fetchColumn();

        if ($folder_id) {
            $pdo->prepare("UPDATE media_folders SET is_deleted = 0 WHERE id = ? AND client_id = ?")->execute([$folder_id, $client_id]);
        }
    }

    $pdo->commit();

    // Create notification after successful restoration
    if ($item_name) {
        createMediaRestoredNotification($client_id, $item_name, $type);
    }

    echo json_encode([
        'success' => true,
        'message' => ucfirst($type) . ' restored successfully'
    ]);
} catch (PDOException $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database error: ' . $e->getMessage()]);
}
