<?php
/**
 * Verify Client NIN/BVN API
 */
header('Content-Type: application/json');
require_once '../../config/database.php';
require_once '../../includes/middleware/admin-auth.php';

// Check authentication
$admin_id = adminMiddleware();

$data = json_decode(file_get_contents('php://input'), true);
$client_id = $data['client_id'] ?? null;
$type = $data['type'] ?? null; // 'nin' or 'bvn'
$status = $data['status'] ?? null; // 1 or 0

if (!$client_id || !in_array($type, ['nin', 'bvn']) || $status === null) {
    echo json_encode(['success' => false, 'message' => 'Invalid parameters']);
    exit;
}

try {
    $field = $type === 'nin' ? 'nin_verified' : 'bvn_verified';
    
    $stmt = $pdo->prepare("UPDATE clients SET $field = ?, updated_at = NOW() WHERE id = ?");
    $stmt->execute([(int)$status, $client_id]);

    if ($stmt->rowCount() > 0) {
        // Notify client about verification
        require_once '../utils/notification-helper.php';
        $status_text = $status ? 'verified' : 'unverified';
        
        // Need to get client_auth_id to send notification
        $clientStmt = $pdo->prepare("SELECT client_auth_id FROM clients WHERE id = ?");
        $clientStmt->execute([$client_id]);
        $client = $clientStmt->fetch();
        
        if ($client) {
            createNotification($client['client_auth_id'], "Your " . strtoupper($type) . " has been marked as $status_text by an administrator.", 'verification_update', $admin_id);
        }

        echo json_encode([
            'success' => true,
            'message' => strtoupper($type) . " verification status updated successfully."
        ]);
    } else {
        echo json_encode(['success' => false, 'message' => 'Client not found or no changes made.']);
    }

} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database error: ' . $e->getMessage()]);
}
