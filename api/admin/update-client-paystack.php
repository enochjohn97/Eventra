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
// Support either explicit paystack_key (used by some UI paths) or paystack_auth_token
$paystack_key = trim($data['paystack_key'] ?? $data['paystack_auth_token'] ?? '');

if (!$client_id) {
    echo json_encode(['success' => false, 'message' => 'Client ID is required']);
    exit;
}

if (!$paystack_key) {
    echo json_encode(['success' => false, 'message' => 'Paystack Key is required']);
    exit;
}

// Basic format validation: accept only secret keys starting with sk_test_ or sk_live_
if (!preg_match('/^sk_(test|live)_[A-Za-z0-9]{8,}$/', $paystack_key)) {
    echo json_encode(['success' => false, 'message' => 'Invalid Paystack Key format. Use a secret key starting with sk_test_ or sk_live_.']);
    exit;
}

// Determine environment from prefix
$env = strpos($paystack_key, 'sk_test_') === 0 ? 'test' : 'live';

try {
    // Validate Paystack Key by hitting Paystack API balance endpoint
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, "https://api.paystack.co/balance");
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);
    curl_setopt($ch, CURLOPT_TIMEOUT, 8);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        "Authorization: Bearer " . $paystack_key,
        "Accept: application/json"
    ]);
        // If running on localhost (developer testing), disable strict SSL verification
        // This avoids "unable to get local issuer certificate" when local CA bundle
        // is not available. DO NOT disable in production.
        $host = $_SERVER['HTTP_HOST'] ?? $_SERVER['SERVER_NAME'] ?? '';
        $remoteAddr = $_SERVER['REMOTE_ADDR'] ?? '';
        $is_local = (strpos($host, 'localhost') !== false) || $remoteAddr === '127.0.0.1' || $remoteAddr === '::1';
        if ($is_local) {
            curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
            curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 0);
        }
    $result = curl_exec($ch);
    $http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlErr = curl_error($ch);
    curl_close($ch);

    if ($curlErr) {
        // Network issues should be surfaced clearly
        echo json_encode(['success' => false, 'message' => 'Could not validate key with Paystack: ' . $curlErr]);
        exit;
    }

    if ($http_code != 200) {
        // Try to extract message from Paystack response if available
        $body = json_decode($result, true);
        $msg = $body['message'] ?? 'Invalid Paystack Key';
        echo json_encode(['success' => false, 'message' => $msg]);
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
    
    // Save the secret and detected environment in metadata
    $meta['paystack_key'] = $paystack_key;
    $meta['paystack_env'] = $env;

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
