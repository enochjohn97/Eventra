<?php

/**
 * Google Configuration API
 * Returns Google Client ID for frontend use
 * Does NOT expose client secret
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header("Cross-Origin-Opener-Policy: same-origin-allow-popups");
require_once '../../config/env-loader.php';

try {
    $googleConfig = [
        'success' => true,
        'client_id' => $_ENV['GOOGLE_CLIENT_ID'] ?? '',
        'maps_api_key' => $_ENV['GOOGLE_MAPS_API_KEY'] ?? '',
        'paystack_public_key' => $_ENV['PAYSTACK_PUBLIC_KEY'] ?? '',
        'app_url' => rtrim($_ENV['APP_URL'] ?? '', '/'),
    ];

    if (empty($googleConfig['client_id'])) {
        echo json_encode([
            'success' => false,
            'message' => 'Google Client ID is not configured'
        ]);
        exit;
    }

    echo json_encode($googleConfig);
} catch (Exception $e) {
    echo json_encode([
        'success' => false,
        'message' => 'Failed to load Google configuration'
    ]);
}
