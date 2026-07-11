<?php
/**
 * Eventra Support Chat - Upload Attachment
 * Minimal file upload endpoint for Socket.IO chat attachments.
 * File paths are stored to be sent via Socket.IO
 */

header('Content-Type: application/json');
require_once __DIR__ . '/../../server/config.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/middleware/auth.php';
require_once __DIR__ . '/../../includes/helpers/file-upload-helper.php';

try {
    $role = $_SESSION['role'] ?? null;
    if (!$role || !in_array($role, ['admin', 'client', 'user'])) {
        http_response_code(401);
        echo json_encode(['success' => false, 'message' => 'Unauthorized']);
        exit;
    }

    if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'No file uploaded or upload error']);
        exit;
    }

    // Since this is for chat, we accept a broader set but limit size
    $file = $_FILES['file'];
    $maxSize = 20 * 1024 * 1024; // 20 MB
    
    if ($file['size'] > $maxSize) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'File size exceeds 20MB limit']);
        exit;
    }

    $fileName = basename($file['name']);
    $fileExtension = strtolower(pathinfo($fileName, PATHINFO_EXTENSION));
    $mimeType = mime_content_type($file['tmp_name']);
    
    $allowedExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'zip', 'rar'];
    if (!in_array($fileExtension, $allowedExtensions)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Unsupported file type']);
        exit;
    }

    $fileType = 'other';
    if (in_array($fileExtension, ['jpg', 'jpeg', 'png', 'gif', 'webp'])) $fileType = 'image';
    elseif ($fileExtension === 'pdf') $fileType = 'pdf';
    elseif (in_array($fileExtension, ['doc', 'docx'])) $fileType = 'word';
    elseif (in_array($fileExtension, ['xls', 'xlsx'])) $fileType = 'excel';
    elseif (in_array($fileExtension, ['zip', 'rar'])) $fileType = 'archive';

    // Create unique name
    $uniqueName = uniqid('chat_') . '_' . time() . '.' . $fileExtension;
    
    $uploadDir = __DIR__ . '/../../public/uploads/chat/';
    if (!is_dir($uploadDir)) {
        mkdir($uploadDir, 0777, true);
    }
    
    $targetPath = $uploadDir . $uniqueName;
    $dbPath = "/public/uploads/chat/" . $uniqueName;
    
    if (move_uploaded_file($file['tmp_name'], $targetPath)) {
        echo json_encode([
            'success' => true,
            'message' => 'File uploaded successfully',
            'attachment' => [
                'file_name' => $fileName,
                'file_path' => $dbPath,
                'file_type' => $fileType,
                'file_size' => $file['size']
            ]
        ]);
    } else {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Failed to move uploaded file']);
    }

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Internal server error']);
}
