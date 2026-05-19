<?php

/**
 * Get Banks API
 * Returns Paystack supported bank list for Nigeria
 * Results are cached in session for 24 hours to avoid repeated API calls.
 */

header('Content-Type: application/json');
require_once '../../config/database.php';
require_once '../../config/payment.php';
require_once '../../includes/middleware/auth.php';

// Must be authenticated — accept any role (client, admin, or user)
$auth_id = checkAuthOptional();
if (!$auth_id) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Authentication required. Please log in.']);
    exit;
}


// Check session cache (24 hour TTL)
if (session_status() !== PHP_SESSION_ACTIVE) {
    require_once __DIR__ . '/../../config.php';
}

$cacheKey = 'paystack_banks_ng';
$cacheTTL = 86400; // 24 hours

if (
    isset($_SESSION[$cacheKey], $_SESSION[$cacheKey . '_ts']) &&
    (time() - $_SESSION[$cacheKey . '_ts']) < $cacheTTL
) {
    echo json_encode([
        'success' => true,
        'banks'   => $_SESSION[$cacheKey],
        'cached'  => true,
    ]);
    exit;
}

// Fetch from Paystack
$url  = 'https://api.paystack.co/bank?currency=NGN&perPage=200&use_cursor=false';
$ch   = curl_init($url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_TIMEOUT, 15);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Authorization: Bearer ' . PAYSTACK_SECRET_KEY,
    'Cache-Control: no-cache',
]);

if (($_ENV['APP_ENV'] ?? '') === 'local') {
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
}

$response  = curl_exec($ch);
$curlError = curl_error($ch);

if ($curlError || !$response) {
    http_response_code(502);
    echo json_encode(['success' => false, 'message' => 'Could not reach Paystack. Please try again.']);
    exit;
}

$result = json_decode($response, true);

if (!$result || !($result['status'] ?? false)) {
    http_response_code(502);
    echo json_encode(['success' => false, 'message' => 'Failed to retrieve bank list from Paystack.']);
    exit;
}

// Map to lean format: [{name, code}]
$banks = array_map(fn($b) => [
    'name' => $b['name'],
    'code' => $b['code'],
], $result['data'] ?? []);

// Cache in session
$_SESSION[$cacheKey]        = $banks;
$_SESSION[$cacheKey . '_ts'] = time();

echo json_encode(['success' => true, 'banks' => $banks, 'cached' => false]);
