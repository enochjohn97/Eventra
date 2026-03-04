<?php
/**
 * Initialize Payment API
 * Generates a unique pending payment reference
 */
header('Content-Type: application/json');
require_once '../../config/database.php';
require_once '../../includes/middleware/auth.php';

$auth_id = checkAuth('user');

try {
    $reference = 'PAY-' . strtoupper(uniqid());

    // In a real scenario, we might pre-record a 'pending' state in the payments table
    // but here we just return a unique ref for the OTP/Payment flow to follow.

    echo json_encode([
        'success' => true,
        'reference' => $reference
    ]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Initialization failed']);
}
