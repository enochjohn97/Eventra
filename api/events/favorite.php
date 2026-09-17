<?php

/**
 * Toggle Favorite API
 */

header('Content-Type: application/json');
require_once '../../config/database.php';
require_once '../../includes/middleware/auth.php';

// First, try Bearer token to get auth_id
$auth_id = validateBearerToken('user');
$user_id = null;

if ($auth_id) {
    // Auth ID from Bearer token - resolve to user_id
    $stmt = $pdo->prepare("SELECT id FROM users WHERE user_auth_id = ?");
    $stmt->execute([$auth_id]);
    $user_id = $stmt->fetchColumn();
} else {
    // Fall back to session-based authentication
    if (session_status() === PHP_SESSION_NONE) {
        require_once __DIR__ . '/../../config/session-config.php';
    }
    
    $user_id = $_SESSION['user_id'] ?? null;
    $role = $_SESSION['role'] ?? null;
    
    if ($user_id && $role !== 'user') {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Unauthorized. User role required.']);
        exit;
    }
}

if (!$user_id) {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => 'Unauthorized. Please log in.']);
    exit;
}

$data = json_decode(file_get_contents("php://input"), true);

if (!isset($data['event_id'])) {
    echo json_encode(['success' => false, 'message' => 'Event ID is required']);
    exit;
}

$event_id = $data['event_id'];

try {
    // Check if already favorited
    $stmt = $pdo->prepare("SELECT id FROM favorites WHERE user_id = ? AND event_id = ?");
    $stmt->execute([$user_id, $event_id]);
    $favorite = $stmt->fetch();

    if ($favorite) {
        // Remove from favorites
        $stmt = $pdo->prepare("DELETE FROM favorites WHERE user_id = ? AND event_id = ?");
        $stmt->execute([$user_id, $event_id]);
        $is_favorite = false;
        $message = "Removed from favorites";
    } else {
        // Add to favorites
        $stmt = $pdo->prepare("INSERT INTO favorites (user_id, event_id) VALUES (?, ?)");
        $stmt->execute([$user_id, $event_id]);
        $is_favorite = true;
        $message = "Added to favorites";
    }

    echo json_encode([
        'success' => true,
        'message' => $message,
        'is_favorite' => $is_favorite
    ]);
} catch (PDOException $e) {
    echo json_encode(['success' => false, 'message' => 'Database error. Please try again or contact support if it persists.']);
}
