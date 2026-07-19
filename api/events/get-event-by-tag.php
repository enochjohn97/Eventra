<?php

header('Content-Type: application/json');
require_once '../../config/database.php';

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
        $baseUrl = rtrim($_ENV['APP_URL'] ?? 'https://eventra-website.liveblog365.com', '/');
        if (!empty($event['image_path'])) {
            $path = '/' . ltrim($event['image_path'], '/');
            $event['image_path'] = $path;
            $event['absolute_image_url'] = $baseUrl . $path;
        } else {
            $event['image_path'] = null;
            $event['absolute_image_url'] = 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=1200&h=800&fit=crop';
        }

        echo json_encode(['success' => true, 'event' => $event]);
    } else {
        echo json_encode(['success' => false, 'message' => 'Event not found or not published']);
    }
} catch (PDOException $e) {
    echo json_encode(['success' => false, 'message' => 'Database error: ' . $e->getMessage()]);
}
