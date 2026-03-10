<?php
header('Content-Type: application/json');
require_once '../../config/database.php';
require_once '../../includes/middleware/admin-auth.php';

// Check authentication
$admin_id = adminMiddleware();

$data = json_decode(file_get_contents('php://input'), true);
$client_id = $data['client_id'] ?? null;
$status = $data['status'] ?? null; // 1 for approve, 0 for decline

if (!$client_id || !in_array($status, [0, 1], true)) {
    echo json_encode(['success' => false, 'message' => 'Invalid parameters. Need client_id and status (0 or 1).']);
    exit;
}

try {
    $stmt = $pdo->prepare("UPDATE clients SET is_verified = ?, updated_at = NOW() WHERE id = ?");
    $stmt->execute([(int)$status, $client_id]);

    if ($stmt->rowCount() > 0) {
        $status_text = $status ? 'Approved' : 'Declined';
        
        // Notify client about approval
        require_once '../utils/notification-helper.php';
        
        // Need to get client_auth_id to send notification
        $clientStmt = $pdo->prepare("SELECT client_auth_id FROM clients WHERE id = ?");
        $clientStmt->execute([$client_id]);
        $client = $clientStmt->fetch();
        
        if ($client) {
            $msg = $status ? "Congratulations! Your Event Planner profile has been verified and approved." : "Your Event Planner profile verification has been declined.";
            createNotification($client['client_auth_id'], $msg, 'account_status', $admin_id);
        }

        echo json_encode([
            'success' => true,
            'message' => "Client profile successfully " . strtolower($status_text)
        ]);
    } else {
        echo json_encode(['success' => false, 'message' => 'Client not found or no changes made.']);
    }

} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database error: ' . $e->getMessage()]);
}
