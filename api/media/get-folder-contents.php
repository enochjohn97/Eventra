<?php

/**
 * Get Folder Contents API
 * Retrieves media files within a specific folder
 */

header('Content-Type: application/json');
require_once '../../config/database.php';

require_once '../../includes/middleware/auth.php';
$client_id = clientMiddleware();

try {
    $folder_id = $_GET['folder_id'] ?? null;
    $status = $_GET['status'] ?? 'active';

    if (!$folder_id) {
        echo json_encode(['success' => false, 'message' => 'Folder ID is required']);
        exit;
    }

    // Build query
    $where_clauses = ["client_id = ?", "folder_id = ?"];
    $params = [$client_id, $folder_id];

    // Exclude deleted media based on status
    if ($status === 'trash') {
        $where_clauses[] = "is_deleted = 1";
    } else {
        $where_clauses[] = "is_deleted = 0";
    }

    $where_sql = implode(' AND ', $where_clauses);

    // Get files
    $stmt = $pdo->prepare("
        SELECT id, file_name as name, file_path, file_size, file_type, mime_type, uploaded_at
        FROM media
        WHERE $where_sql
        ORDER BY uploaded_at DESC
    ");
    $stmt->execute($params);
    $files = $stmt->fetchAll();

    // Get folder name
    $stmt = $pdo->prepare("SELECT name FROM media_folders WHERE id = ?");
    $stmt->execute([$folder_id]);
    $folder_name = $stmt->fetchColumn();

    echo json_encode([
        'success' => true,
        'folder_name' => $folder_name,
        'files' => $files,
        'count' => count($files)
    ]);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database error: ' . $e->getMessage()]);
}
