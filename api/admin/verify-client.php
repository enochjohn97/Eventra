<?php

/**
 * Verify Client NIN/BVN API
 */

header('Content-Type: application/json');
require_once '../../config/database.php';
require_once '../../includes/middleware/auth.php';

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
    // Fetch current metadata and update it
    $fetchStmt = $pdo->prepare("SELECT metadata FROM clients WHERE id = ?");
    $fetchStmt->execute([$client_id]);
    $currentMeta = json_decode($fetchStmt->fetchColumn() ?? '{}', true) ?: [];
    $currentMeta[$type . '_verified'] = (bool)(int)$status;
    $currentMeta[$type . '_admin_verified_at'] = date('Y-m-d H:i:s');

    $stmt = $pdo->prepare("
        UPDATE clients 
        SET metadata = ?, updated_at = NOW() 
        WHERE id = ?
    ");
    $stmt->execute([json_encode($currentMeta), $client_id]);

    if ($stmt->rowCount() > 0) {
        // If status is 1 (verified), also update the main verification_status ENUM
        if ($status == 1) {
            $stmtStatus = $pdo->prepare("UPDATE clients SET verification_status = 'verified' WHERE id = ?");
            $stmtStatus->execute([$client_id]);
        }

        // Notify client about verification
        require_once '../utils/notification-helper.php';
        $status_text = $status ? 'verified' : 'unverified';

        if ($client_id) {
            // We need the auth_id for notifications
            $stmtAuth = $pdo->prepare("SELECT client_auth_id FROM clients WHERE id = ?");
            $stmtAuth->execute([$client_id]);
            $recipient_auth_id = $stmtAuth->fetchColumn();

            $admin_auth_id = getAuthId();
            createNotification(
                $recipient_auth_id,
                "Your " . strtoupper($type) . " has been marked as $status_text by an administrator.",
                'verification_update',
                $admin_auth_id,
                'client',
                'admin'
            );
        }

        require_once '../../includes/helpers/entity-resolver.php';
        logSecurityEvent($admin_id, 'admin@eventra.local', 'admin_action', 'local', "Client ID $client_id: $type verification set to $status");

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
