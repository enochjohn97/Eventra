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
    $publicKey = $_ENV['PAYSTACK_PUBLIC_KEY'] ?? '';

    $isTestMode = str_starts_with($publicKey, 'pk_test_');
    $isLiveMode = str_starts_with($publicKey, 'pk_live_');

    $paystackConfig = [
        'success' => true,
        'public_key' => $publicKey,
        'is_test_mode' => $isTestMode,
        'mode' => $isLiveMode ? 'live' : ($isTestMode ? 'test' : 'unconfigured'),
        'mode_scope' => 'platform',
        'note' => 'This endpoint reports the platform Paystack key only. Checkout is charged to the event organizer Paystack account, which may still be in test mode even when this platform key is live.',
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
