<?php
/**
 * Get Media API
 * Retrieves media files and folders for a client
 */

// MUST be the first two lines — no whitespace, no BOM before <?php
require_once __DIR__ . '/../../server/config.php'; 
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/middleware/auth.php';

// Then immediately set JSON response header
header('Content-Type: application/json');

// Handle CORS preflight — must come before any logic
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

try {
    $client_id = checkAuth('client');  // checkAuth now returns client_id directly

    // ──────────────────────────────────────────────────────────────────────────
    // Media Retrieval Logic
    // ──────────────────────────────────────────────────────────────────────────

    $folder_id = $_GET['folder_id'] ?? null;
    $file_type = $_GET['file_type'] ?? null;
    $status = $_GET['status'] ?? 'active';

    $is_trash = ($status === 'trash' ? 1 : 0);

    // Build query for current view (files)
    $where_clauses = ["m.client_id = ?", "m.is_deleted = ?"];
    $params = [$client_id, $is_trash];

    if ($folder_id) {
        $where_clauses[] = "m.folder_id = ?";
        $params[] = $folder_id;
    } else {
        $where_clauses[] = "m.folder_id IS NULL";
    }

    if ($file_type) {
        $where_clauses[] = "m.file_type = ?";
        $params[] = $file_type;
    }

    $where_sql = implode(' AND ', $where_clauses);

    // 1. Get media files for current view
    $stmt = $pdo->prepare("
        SELECT m.id, m.file_name as name, m.file_path, m.file_size, m.file_type, m.folder_id, m.uploaded_at,
               COALESCE(e.event_name, 'Unassigned') as event_association
        FROM media m
        LEFT JOIN events e ON m.file_path COLLATE utf8mb4_unicode_ci = e.image_path COLLATE utf8mb4_unicode_ci
        WHERE $where_sql
        ORDER BY m.uploaded_at DESC
    ");
    $stmt->execute($params);
    $media_files = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // 2. Ensure "Event Assets" exists and Get all folders for current view
    $check_stmt = $pdo->prepare("SELECT id FROM media_folders WHERE client_id = ? AND name = 'Event Assets' LIMIT 1");
    $check_stmt->execute([$client_id]);
    if (!$check_stmt->fetch()) {
        $create_stmt = $pdo->prepare("INSERT INTO media_folders (client_id, name, is_deleted, created_at) VALUES (?, 'Event Assets', 0, NOW())");
        $create_stmt->execute([$client_id]);
    }

    // Auto-fix misplaced files: move files with 'Event Assets' name into the corresponding folder ID
    $pdo->prepare("
        UPDATE media 
        SET folder_id = (SELECT id FROM media_folders WHERE client_id = ? AND name = 'Event Assets' AND is_deleted = 0 LIMIT 1)
        WHERE client_id = ? AND folder_id IS NULL AND folder_name = 'Event Assets'
    ")->execute([$client_id, $client_id]);

    // Sync missing event images into media table
    $pdo->prepare("
        INSERT INTO media (client_id, folder_id, folder_name, file_name, file_path, file_type, is_deleted)
        SELECT e.client_id, 
               (SELECT id FROM media_folders mf WHERE mf.client_id = e.client_id AND mf.name = 'Event Assets' AND mf.is_deleted = 0 LIMIT 1),
               'Event Assets',
               SUBSTRING_INDEX(e.image_path, '/', -1),
               e.image_path,
               'image',
               0
        FROM events e
        WHERE e.image_path IS NOT NULL 
          AND e.image_path != ''
          AND e.client_id = ?
          AND NOT EXISTS (
              SELECT 1 FROM media m WHERE m.file_path = e.image_path COLLATE utf8mb4_unicode_ci
          )
    ")->execute([$client_id]);

    $folders_sql = "SELECT id, name, created_at FROM media_folders WHERE client_id = ? AND is_deleted = ?";
    $f_params = [$client_id, $is_trash];

    $f_stmt = $pdo->prepare($folders_sql);
    $f_stmt->execute($f_params);
    $db_folders = $f_stmt->fetchAll(PDO::FETCH_ASSOC);

    $folders = [];
    foreach ($db_folders as $f) {
        $count_stmt = $pdo->prepare("SELECT COUNT(*) FROM media WHERE folder_id = ? AND client_id = ? AND is_deleted = ?");
        $count_stmt->execute([$f['id'], $client_id, $is_trash]);
        $folders[] = [
            'id' => $f['id'],
            'type' => 'folder',
            'name' => $f['name'],
            'file_count' => (int)$count_stmt->fetchColumn(),
            'created_at' => $f['created_at']
        ];
    }

    // 3. Overall Dashboard Stats (Filtered by client)
    $ds_stmt = $pdo->prepare("
        SELECT 
            (SELECT COUNT(*) FROM media_folders WHERE client_id = ? AND is_deleted = 0) as folders_total,
            (SELECT COUNT(*) FROM media WHERE client_id = ? AND is_deleted = 0) as files_total,
            (SELECT SUM(file_size) FROM media WHERE client_id = ? AND is_deleted = 0) as storage_total,
            (SELECT COUNT(*) FROM media WHERE client_id = ? AND is_deleted = 1) as deleted_media,
            (SELECT COUNT(*) FROM media_folders WHERE client_id = ? AND is_deleted = 1) as deleted_folders,
            (SELECT COALESCE(SUM(restoration_count), 0) FROM media_folders WHERE client_id = ?) as restored_folders
    ");
    $ds_stmt->execute([$client_id, $client_id, $client_id, $client_id, $client_id, $client_id]);
    $ds = $ds_stmt->fetch(PDO::FETCH_ASSOC);

    echo json_encode([
        'success' => true,
        'media' => array_merge($folders, $media_files),
        'stats' => [
            'total_folders' => (int)($ds['folders_total'] ?? 0),
            'total_files' => (int)($ds['files_total'] ?? 0),
            'total_size' => (float)($ds['storage_total'] ?? 0),
            'total_deleted' => (int)($ds['deleted_media'] ?? 0),
            'total_deleted_folders' => (int)($ds['deleted_folders'] ?? 0),
            'total_restored_folders' => (int)($ds['restored_folders'] ?? 0)
        ],
        'folders' => $folders
    ]);
} catch (PDOException $e) {
    error_log("[Get Media DB Error] " . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database error: ' . $e->getMessage()]);
} catch (Throwable $e) {
    error_log("[Get Media Global Error] " . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Internal server error: ' . $e->getMessage()]);
}
