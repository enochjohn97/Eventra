<?php

/**
 * Paystack Configuration API
 * Returns Paystack Public Key for frontend inline popup use
 * Does NOT expose secret key
 */

header('Content-Type: application/json');
// NOTE: '*' was removed — a wildcard with credentials leaks the public key
// context cross-origin. Same-origin + allowlisted origins are enough (checkout
// is always served from this app).
require_once '../../config/database.php';

try {
    $paystackConfig = [
        'success' => true,
        'public_key' => $_ENV['PAYSTACK_PUBLIC_KEY'] ?? '',
        'is_test_mode' => str_starts_with($_ENV['PAYSTACK_PUBLIC_KEY'] ?? '', 'pk_test_')
    ];

    if (empty($paystackConfig['public_key'])) {
        echo json_encode([
            'success' => false,
            'message' => 'Paystack Public Key is not configured'
        ]);
        exit;
    }

    echo json_encode($paystackConfig);
} catch (Exception $e) {
    echo json_encode([
        'success' => false,
        'message' => 'Failed to load Paystack configuration'
    ]);
}
