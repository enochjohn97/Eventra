<?php

/**
 * API: Upload Media
 * Handles file uploads for events and media gallery with secure validation
 */

header('Content-Type: application/json');
require_once '../../config/database.php';
require_once '../../includes/helpers/file-upload-helper.php';
require_once '../utils/notification-helper.php';

/**
 * Compress image to reduce file size
 * Compresses to 80% quality, max 1200px width
 */
function compressImage($filePath, $extension) {
    if (!extension_loaded('gd')) {
        return $filePath; // GD not available, return original
    }

    try {
        $maxWidth = 1200;
        $quality = 80; // JPEG quality
        
        // Get original image
        $image = null;
        switch ($extension) {
            case 'jpg':
            case 'jpeg':
                $image = imagecreatefromjpeg($filePath);
                break;
            case 'png':
                $image = imagecreatefrompng($filePath);
                break;
            case 'webp':
                $image = imagecreatefromwebp($filePath);
                break;
        }

        if (!$image) return $filePath;

        // Get dimensions
        $width = imagesx($image);
        $height = imagesy($image);

        // Check if resize needed
        if ($width > $maxWidth) {
            $ratio = $maxWidth / $width;
            $newWidth = $maxWidth;
            $newHeight = (int)($height * $ratio);

            $resized = imagecreatetruecolor($newWidth, $newHeight);
            imagecopyresampled($resized, $image, 0, 0, 0, 0, $newWidth, $newHeight, $width, $height);
            $image = $resized;
        }

        // Save compressed image
        $tempPath = $filePath . '.tmp';
        switch ($extension) {
            case 'jpg':
            case 'jpeg':
                imagejpeg($image, $tempPath, $quality);
                break;
            case 'png':
                imagepng($image, $tempPath, 6); // Compression level 6
                break;
            case 'webp':
                imagewebp($image, $tempPath, $quality);
                break;
        }

        // Replace original with compressed version if smaller
        if (filesize($tempPath) < filesize($filePath)) {
            unlink($filePath);
            rename($tempPath, $filePath);
        } else {
            unlink($tempPath);
        }

        chmod($filePath, 0644);
        return $filePath;
    } catch (Exception $e) {
        // Compression failed, return original file
        return $filePath;
    }
}

// Check authentication
require_once '../../includes/middleware/auth.php';
$client_id = clientMiddleware();

if (!isset($_FILES['files'])) {
    echo json_encode(['success' => false, 'message' => 'No files uploaded']);
    exit;
}

try {
    $pdo->beginTransaction();
    $folder_name = $_POST['folder_name'] ?? 'Event Assets';
    $folder_id = $_POST['folder_id'] ?? null;

    // Resolve folder if ID is provided
    if ($folder_id) {
        $stmt = $pdo->prepare("SELECT name FROM media_folders WHERE id = ? AND client_id = ? AND is_deleted = 0");
        $stmt->execute([$folder_id, $client_id]);
        $fetched_name = $stmt->fetchColumn();

        if ($fetched_name) {
            $folder_name = $fetched_name;
        } else {
            // Invalid folder ID, fall back to root/default
            $folder_id = null;
            $folder_name = 'Event Assets';
        }
    } elseif ($folder_name !== 'Event Assets') {
        // Fallback to name-based lookup (legacy/robustness)
        $stmt = $pdo->prepare("SELECT id FROM media_folders WHERE client_id = ? AND name = ? AND is_deleted = 0 LIMIT 1");
        $stmt->execute([$client_id, $folder_name]);
        $folder_id = $stmt->fetchColumn() ?: null;

        // Auto-create if not exists (only for name-based uploads)
        if (!$folder_id) {
            $stmt = $pdo->prepare("INSERT INTO media_folders (client_id, name) VALUES (?, ?)");
            $stmt->execute([$client_id, $folder_name]);
            $folder_id = $pdo->lastInsertId();
        }
    }

    // Create upload directory if not exists (use secure permissions: 0755)
    $uploadDir = '../../public/uploads/media/client_' . $client_id . '/' . ($folder_name !== 'Event Assets' ? $folder_name . '/' : '');
    if (!file_exists($uploadDir)) {
        mkdir($uploadDir, 0755, true);
    }

    $uploadedFiles = [];
    $files = $_FILES['files'];

    // Handle multiple files
    $fileCount = is_array($files['name']) ? count($files['name']) : 1;

    for ($i = 0; $i < $fileCount; $i++) {
        $fileName = is_array($files['name']) ? $files['name'][$i] : $files['name'];
        $fileTmpName = is_array($files['tmp_name']) ? $files['tmp_name'][$i] : $files['tmp_name'];
        $fileSize = is_array($files['size']) ? $files['size'][$i] : $files['size'];
        $fileType = is_array($files['type']) ? $files['type'][$i] : $files['type'];

        // Validate file before processing
        $validation = FileUploadValidator::validateFile(
            ['name' => $fileName, 'tmp_name' => $fileTmpName, 'size' => $fileSize, 'type' => $fileType],
            ['allowed_types' => ['image', 'video', 'pdf', 'document']]
        );

        if (!$validation['valid']) {
            $pdo->rollBack();
            echo json_encode(['success' => false, 'message' => 'File validation failed: ' . $validation['error']]);
            exit;
        }

        // Generate safe filename
        $fileExtension = strtolower(pathinfo($fileName, PATHINFO_EXTENSION));
        $uniqueFileName = FileUploadValidator::generateSafeFilename($fileName, 'media');
        $filePath = $uploadDir . $uniqueFileName;

        // Move uploaded file
        if (move_uploaded_file($fileTmpName, $filePath)) {
            // Set secure file permissions (0644)
            chmod($filePath, 0644);

            // Determine file type FIRST (before compress call)
            $fileExtensionLower = strtolower($fileExtension);
            $fileEnum = 'other';
            if (in_array($fileExtensionLower, ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'])) {
                $fileEnum = 'image';
            } elseif (in_array($fileExtensionLower, ['mp4', 'mov', 'avi', 'mkv', 'webm'])) {
                $fileEnum = 'video';
            } elseif ($fileExtensionLower === 'pdf') {
                $fileEnum = 'pdf';
            } elseif (in_array($fileExtensionLower, ['doc', 'docx'])) {
                $fileEnum = 'word';
            } elseif (in_array($fileExtensionLower, ['xls', 'xlsx'])) {
                $fileEnum = 'excel';
            } elseif (in_array($fileExtensionLower, ['ppt', 'pptx'])) {
                $fileEnum = 'powerpoint';
            } elseif (in_array($fileExtensionLower, ['zip', 'rar', '7z'])) {
                $fileEnum = 'archive';
            }

            // Compress image if applicable
            if (in_array($fileExtensionLower, ['jpg', 'jpeg', 'png', 'webp'])) {
                $filePath = compressImage($filePath, $fileExtensionLower);
            }

            // Save to database
            $stmt = $pdo->prepare("
                INSERT INTO media (client_id, folder_id, folder_name, file_name, file_extension, file_path, file_type, file_size, mime_type)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ");

            $dbFilePath = '/public/uploads/media/client_' . $client_id . '/' . ($folder_name !== 'Event Assets' ? $folder_name . '/' : '') . $uniqueFileName;

            $stmt->execute([
                $client_id,
                $folder_id,
                $folder_name,
                htmlspecialchars($fileName),
                $fileExtensionLower,
                $dbFilePath,
                $fileEnum,
                $fileSize,
                $fileType
            ]);

            $uploadedFiles[] = [
                'id' => $pdo->lastInsertId(),
                'name' => htmlspecialchars($fileName),
                'path' => $dbFilePath
            ];
        }
    }

    if (count($uploadedFiles) > 0) {
        $msg_filename = $uploadedFiles[0]['name'];
        if (count($uploadedFiles) > 1) {
            $msg_filename .= " and " . (count($uploadedFiles) - 1) . " others";
        }
        // The notification-helper.php is already required at the top of the file.
        $client_auth_id = getAuthId();
        if ($client_auth_id) {
            createMediaUploadedNotification($client_auth_id, $msg_filename, $folder_name);
        }
    }

    $pdo->commit();

    echo json_encode([
        'success' => true,
        'message' => count($uploadedFiles) . ' file(s) uploaded successfully',
        'files' => $uploadedFiles
    ]);
} catch (Exception $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    echo json_encode(['success' => false, 'message' => 'Upload error: ' . $e->getMessage()]);
}
