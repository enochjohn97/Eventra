<?php

/**
 * Get Default Media Templates
 * Returns list of default images from uploads/media/default folder
 * These are starter templates for event creation
 */

header('Content-Type: application/json');
require_once __DIR__ . '/../../server/config.php';
require_once __DIR__ . '/../../config/database.php';

try {
    $mediaDir = realpath(MEDIA_PATH . 'default');
    if (!$mediaDir) {
        // Fallback to legacy uploads path
        $mediaDir = realpath(__DIR__ . '/../../uploads/media/default');
    }
    
    if (!$mediaDir || !is_dir($mediaDir)) {
        echo json_encode([
            'success' => false,
            'message' => 'Default media folder not found',
            'templates' => []
        ]);
        exit;
    }

    $templates = [];
    $files = scandir($mediaDir);
    
    foreach ($files as $file) {
        if ($file === '.' || $file === '..' || $file === 'index.php') {
            continue;
        }
        
        $filePath = $mediaDir . '/' . $file;
        if (is_file($filePath) && preg_match('/\.(svg|jpg|jpeg|png|gif|webp)$/i', $file)) {
            $templates[] = [
                'filename' => $file,
                'url' => UPLOAD_URL . 'default/' . $file,
                'type' => pathinfo($file, PATHINFO_EXTENSION),
                'size' => filesize($filePath),
                'uploaded_at' => date('Y-m-d H:i:s', filemtime($filePath))
            ];
        }
    }

    // Sort by filename
    usort($templates, function($a, $b) {
        return strcmp($a['filename'], $b['filename']);
    });

    echo json_encode([
        'success' => true,
        'message' => 'Default templates retrieved successfully',
        'templates' => $templates,
        'total' => count($templates)
    ]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Error: ' . $e->getMessage(),
        'templates' => []
    ]);
}
?>
