<?php
// Paystack Production Integration Config
require_once __DIR__ . '/env-loader.php';

define('PAYSTACK_PUBLIC_KEY', $_ENV['PAYSTACK_PUBLIC_KEY'] ?? '');
define('PAYSTACK_SECRET_KEY', $_ENV['PAYSTACK_SECRET_KEY'] ?? '');
define('PAYSTACK_WEBHOOK_SECRET', $_ENV['PAYSTACK_WEBHOOK_SECRET'] ?? '');

/**
 * Helper: call Paystack API
 */
function paystackRequest(string $method, string $path, array $payload = []): array
{
    $secretKey = defined('PAYSTACK_SECRET_KEY') ? PAYSTACK_SECRET_KEY : '';

    // Masked key for logging
    $maskedKey = !empty($secretKey)
        ? substr($secretKey, 0, 4) . '...' . substr($secretKey, -4)
        : 'MISSING';

    $url = 'https://api.paystack.co' . $path;
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 20);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Authorization: Bearer ' . $secretKey,
        'Content-Type: application/json',
        'Cache-Control: no-cache',
    ]);

    if (($_ENV['APP_ENV'] ?? '') === 'local') {
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
    }

    if ($method === 'POST') {
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
    }
    elseif ($method === 'PUT') {
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, 'PUT');
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
    }

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlError = curl_error($ch);

    if ($curlError || !$response) {
        error_log("[Paystack API] [Error] Curl: " . ($curlError ?: 'Empty response'));
        return ['ok' => false, 'code' => $httpCode, 'body' => null, 'error' => $curlError ?: 'Empty response'];
    }

    $result = json_decode($response, true);
    if ($httpCode === 401) {
        error_log("[Paystack API] [Error] 401 Unauthorized for path {$path}. Check PAYSTACK_SECRET_KEY.");
    }

    return [
        'ok' => ($httpCode >= 200 && $httpCode < 300),
        'code' => $httpCode,
        'body' => $result,
        'error' => null
    ];
}

/**
 * Ensures a client has a subaccount in Paystack
 * Returns ['success' => bool, 'subaccount_code' => string, 'message' => string]
 */
function ensureSubaccount($pdo, $client_auth_id, $bank_code, $account_number, $business_name, $email, $existing_subaccount_code = null)
{
    $subPayload = [
        'business_name' => $business_name,
        'settlement_bank' => $bank_code,
        'account_number' => $account_number,
        'percentage_charge' => 30.0, // Platform takes 30% commission
    ];

    if ($existing_subaccount_code) {
        $res = paystackRequest('PUT', "/subaccount/{$existing_subaccount_code}", $subPayload);
    }
    else {
        $subPayload['primary_contact_email'] = $email;
        $res = paystackRequest('POST', '/subaccount', $subPayload);
    }

    if (!$res['ok']) {
        $msg = $res['body']['message'] ?? $res['error'] ?? 'Unknown Paystack error';
        
        $isTestMode = (defined('PAYSTACK_SECRET_KEY') && str_starts_with(PAYSTACK_SECRET_KEY, 'sk_test'));
        if ($isTestMode) {
            error_log("[Paystack Test Mode] Subaccount creation/update failed: " . $msg);
            $mock_code = $existing_subaccount_code ?: 'SETTLE_MOCK_' . strtoupper(substr(md5((string)$client_auth_id), 0, 8));
            $mock_id = 0;
            
            // Save mock data so the UI reflects the "setup"
            $stmt = $pdo->prepare("UPDATE clients SET subaccount_code = ?, subaccount_id = ? WHERE client_auth_id = ?");
            $stmt->execute([$mock_code, $mock_id, $client_auth_id]);

            return [
                'success' => true, 
                'subaccount_code' => $mock_code, 
                'subaccount_id' => $mock_id,
                'is_mock' => true,
                'message' => "Mocked subaccount due to Test Mode"
            ];
        }

        return ['success' => false, 'message' => "Paystack: " . $msg];
    }

    $code = $res['body']['data']['subaccount_code'] ?? $existing_subaccount_code;
    $id = $res['body']['data']['id'] ?? null;

    // Update local database with subaccount info
    $stmt = $pdo->prepare("UPDATE clients SET subaccount_code = ?, subaccount_id = ? WHERE client_auth_id = ?");
    $stmt->execute([$code, $id, $client_auth_id]);

    return ['success' => true, 'subaccount_code' => $code, 'subaccount_id' => $id];
}

function verifyPaystackSignature($payload, $signature_header)
{
    $secret = !empty(PAYSTACK_WEBHOOK_SECRET) ? PAYSTACK_WEBHOOK_SECRET : PAYSTACK_SECRET_KEY;
    if (empty($secret))
        return false;
    return hash_equals(hash_hmac('sha512', $payload, $secret), $signature_header);
}