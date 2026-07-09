<?php

/**
 * Update Client Paystack Details API
 */

header('Content-Type: application/json');
require_once '../../config/database.php';
require_once '../../includes/middleware/auth.php';

// Check authentication
$admin_id = adminMiddleware();

$data = json_decode(file_get_contents('php://input'), true);
$client_id = $data['client_id'] ?? null;
$paystack_key = $data['paystack_key'] ?? '';

if (!$client_id) {
    echo json_encode(['success' => false, 'message' => 'Client ID is required']);
    exit;
}

if (!$paystack_key) {
    echo json_encode(['success' => false, 'message' => 'Paystack Key is required']);
    exit;
}

try {
    // Validate Paystack Key by hitting Paystack API
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, "https://api.paystack.co/balance");
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        "Authorization: Bearer " . $paystack_key
    ]);
    $result = curl_exec($ch);
    $http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    
    if ($http_code != 200) {
        echo json_encode(['success' => false, 'message' => 'Invalid Paystack Key']);
        exit;
    }

    // Fetch existing metadata
    $stmt = $pdo->prepare("SELECT metadata FROM clients WHERE id = ?");
    $stmt->execute([$client_id]);
    $client = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$client) {
        echo json_encode(['success' => false, 'message' => 'Client not found']);
        exit;
    }

    $meta = json_decode($client['metadata'] ?? '{}', true) ?: [];
    
    $meta['paystack_key'] = $paystack_key;

    $updated_metadata = json_encode($meta);

    $updateStmt = $pdo->prepare("
        UPDATE clients 
        SET metadata = ?,
            updated_at = NOW() 
        WHERE id = ?
    ");
    
    $updateStmt->execute([
        $updated_metadata, 
        $client_id
    ]);

    require_once '../../includes/helpers/entity-resolver.php';
    logSecurityEvent($admin_id, 'admin@eventra.local', 'admin_action', 'local', "Client ID $client_id: Paystack key updated");

    echo json_encode([
        'success' => true,
        'message' => "Client Paystack details updated successfully."
    ]);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database error: ' . $e->getMessage()]);
}
