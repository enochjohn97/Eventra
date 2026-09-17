<?php



header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header("Cross-Origin-Opener-Policy: same-origin-allow-popups");
require_once __DIR__ . '/../../config/google.php';

try {
    $googleConfig = [
        'success' => true,
        'client_id' => getGoogleClientId(),
        'maps_api_key' => $_ENV['GOOGLE_MAPS_API_KEY'] ?? '',
        'paystack_public_key' => $_ENV['PAYSTACK_PUBLIC_KEY'] ?? '',
        'app_url' => rtrim($_ENV['APP_URL'] ?? '', '/'),
    ];

    echo json_encode($googleConfig);
} catch (Exception $e) {
    echo json_encode([
        'success' => false,
        'message' => 'Failed to load Google configuration'
    ]);
}
