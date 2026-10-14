<?php

header('Content-Type: application/json');
require_once '../../config/database.php';
require_once '../../includes/middleware/auth.php';

$authenticatedUser = checkAuthOptional();

$tag = $_GET['tag'] ?? null;

if (!$tag) {
    echo json_encode(['success' => false, 'message' => 'Tag is required']);
    exit;
}

try {
    $stmt = $pdo->prepare("
        SELECT e.*, u.name as client_name, u.profile_pic as client_profile_pic 
        FROM events e
        LEFT JOIN clients u ON e.client_id = u.id
        WHERE e.tag = ? AND e.status = 'published'
    ");
    $stmt->execute([$tag]);
    $event = $stmt->fetch();

    if ($event) {
        // Sanitize and enhance event data
        // Derive the origin from the request when unconfigured, so the retired
        // shared host is never baked into image URLs again.
        $baseUrl = rtrim($_ENV['APP_URL'] ?? '', '/');
        if ($baseUrl === '') {
            $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
            $baseUrl = $scheme . '://' . ($_SERVER['HTTP_HOST'] ?? 'localhost');
        }
        if (!$authenticatedUser) {
            $event['image_path'] = null;
            $event['absolute_image_url'] = null;
            unset($event['metadata'], $event['client_profile_pic']);
        } elseif (!empty($event['image_path'])) {
            $path = '/' . ltrim($event['image_path'], '/');
            $event['image_path'] = $path;
            $event['absolute_image_url'] = $baseUrl . $path;
        } else {
            $event['image_path'] = null;
            // Local splash placeholder (allowed) — no external dummy image
            $event['absolute_image_url'] = rtrim($baseUrl, '/') . '/public/assets/imgs/login.png';
        }

        echo json_encode(['success' => true, 'event' => $event]);
    } else {
        echo json_encode(['success' => false, 'message' => 'Event not found or not published']);
    }
} catch (PDOException $e) {
    echo json_encode(['success' => false, 'message' => 'Database error. Please try again or contact support if it persists.']);
}
