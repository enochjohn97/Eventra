<?php
/**
 * Get Media API
 * Retrieves media files and folders for a client
 */
header('Content-Type: application/json');
require_once '../../config/database.php';

try {
    $user_id = $_GET['client_id'] ?? null;
    $folder_id = $_GET['folder_id'] ?? null;
    $file_type = $_GET['file_type'] ?? null;
    $status = $_GET['status'] ?? 'active';

    if (!$user_id) {
        echo json_encode(['success' => false, 'message' => 'Client ID is required']);
        exit;
    }

    // Get the actual client_id from clients table using user_id from frontend
    $stmt = $pdo->prepare("SELECT id FROM clients WHERE client_auth_id = ?");
    $stmt->execute([$user_id]);
    $client_id = $stmt->fetchColumn();

    if (!$client_id) {
        echo json_encode(['success' => false, 'message' => 'Client profile not found']);
        exit;
    }

    // Build query
    $where_clauses = ["client_id = ?"];
    $params = [$client_id];

    // Filter by folder if provided
    if ($folder_id) {
        $where_clauses[] = "folder_id = ?";
        $params[] = $folder_id;
    } else {
        // If not in a specific folder, only show root files
        $where_clauses[] = "folder_id IS NULL";
    }

    if ($file_type) {
        $where_clauses[] = "file_type = ?";
        $params[] = $file_type;
    }

    // Exclude deleted media based on status
    if ($status === 'trash') {
        $where_clauses[] = "is_deleted = 1";
    } else {
        $where_clauses[] = "is_deleted = 0";
    }

    $where_sql = implode(' AND ', $where_clauses);

    // Get media files
    $stmt = $pdo->prepare("
        SELECT id, file_name as name, file_path, file_size, file_type, folder_name, folder_id 
        FROM media
        WHERE $where_sql
        ORDER BY uploaded_at DESC
    ");
    $stmt->execute($params);
    $media = $stmt->fetchAll();

    // Get statistics
    // Removed total_folders count
    $stats_stmt = $pdo->prepare("
        SELECT 
            COUNT(*) as total_files,
            SUM(file_size) as total_size,
            SUM(CASE WHEN file_type = 'image' THEN 1 ELSE 0 END) as total_images,
            SUM(CASE WHEN file_type = 'video' THEN 1 ELSE 0 END) as total_videos,
            SUM(CASE WHEN file_type = 'document' THEN 1 ELSE 0 END) as total_documents
        FROM media
        WHERE client_id = ? AND is_deleted = ?
    ");
    $stats_stmt->execute([$client_id, $status === 'trash' ? 1 : 0]);
    $stats = $stats_stmt->fetch();

    // Epic requirements summary cards exact values
    $dashboard_stats_stmt = $pdo->prepare("
        SELECT 
            (SELECT COUNT(*) FROM media_folders WHERE client_id = ? AND is_deleted = 0) as folders_created,
            (SELECT COUNT(*) FROM media WHERE client_id = ? AND is_deleted = 0) as media_uploaded,
            (SELECT COUNT(*) FROM media_folders WHERE client_id = ? AND is_deleted = 1) as folders_deleted,
            (SELECT SUM(restoration_count) FROM media_folders WHERE client_id = ?) as folders_restored
    ");
    $dashboard_stats_stmt->execute([$client_id, $client_id, $client_id, $client_id]);
    $dashboard_stats = $dashboard_stats_stmt->fetch(PDO::FETCH_ASSOC);
    $dashboard_stats['folders_restored'] = $dashboard_stats['folders_restored'] ?? 0;

    // Get folder list from database
    $folders_stmt = $pdo->prepare("
        SELECT id, name, created_at
        FROM media_folders
        WHERE client_id = ? AND is_deleted = ?
        ORDER BY created_at DESC
    ");
    $folders_stmt->execute([$client_id, $status === 'trash' ? 1 : 0]);
    $db_folders = $folders_stmt->fetchAll();

    $folders = [];
    foreach ($db_folders as $f) {
        // Count files 
        $count_stmt = $pdo->prepare("SELECT COUNT(*) FROM media WHERE client_id = ? AND folder_id = ? AND is_deleted = ?");
        $count_stmt->execute([$client_id, $f['id'], $status === 'trash' ? 1 : 0]);
        $file_count = $count_stmt->fetchColumn();

        $folders[] = [
            'id' => $f['id'],
            'type' => 'folder',
            'name' => $f['name'],
            'file_count' => $file_count,
            'created_at' => $f['created_at']
        ];
    }

    // Merge folders as virtual "media" items so the frontend maps them properly
    $media = array_merge($folders, $media);

    echo json_encode([
        'success' => true,
        'media' => $media,
        'stats' => $stats,
        'dashboard_stats' => $dashboard_stats,
        'folders' => $folders
    ]);

} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database error: ' . $e->getMessage()]);
}
