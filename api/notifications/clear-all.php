<?php

/**
 * Clear All Notifications API
 * Deletes all notifications for the authenticated user
 */

header('Content-Type: application/json');
require_once '../../config/database.php';
require_once '../../includes/middleware/auth.php';

// Check authentication
checkAuth();
$auth_id = getAuthId();

try {
    $stmt = $pdo->prepare("DELETE FROM notifications WHERE recipient_auth_id = ?");
    $stmt->execute([$auth_id]);

    echo json_encode([
        'success' => true,
        'message' => 'All notifications cleared successfully'
    ]);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database error. Please try again or contact support if it persists.']);
}
