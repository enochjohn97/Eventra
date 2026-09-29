<?php
// Paystack Production Integration Config
require_once __DIR__ . '/env-loader.php';

define('PAYSTACK_PUBLIC_KEY', $_ENV['PAYSTACK_PUBLIC_KEY'] ?? '');
define('PAYSTACK_SECRET_KEY', $_ENV['PAYSTACK_SECRET_KEY'] ?? '');
define('PAYSTACK_WEBHOOK_SECRET', $_ENV['PAYSTACK_WEBHOOK_SECRET'] ?? '');

/*
 * Platform (Attoneex Tech-Solutions) settlement account — used to collect
 * the platform commission when a client charges on THEIR OWN Paystack
 * account. Create one subaccount named after the platform under every
 * client's Paystack account and attach it to each transaction, so the
 * platform's share settles directly to the platform's bank account.
 *
 * PAYSTACK_PLATFORM_SUBACCOUNT_BANK_CODE : bank code of the platform's
 *       settlement account (Paystack bank list, e.g. 058 = GTBank).
 *       Optional if PAYSTACK_PLATFORM_SETTLEMENT_ACCOUNT_NUMBER is empty.
 * PAYSTACK_PLATFORM_SETTLEMENT_ACCOUNT_NUMBER : the platform's bank account
 *       number (10 digits). Optional — when empty the subaccount is created
 *       with the CLIENT's settlement details instead of failing.
 * PAYSTACK_PLATFORM_SETTLEMENT_ACCOUNT_NAME : label stored with the code.
 * PAYSTACK_PLATFORM_COMMISSION_PERCENT : default split kept by the platform
 *       when no client-specific commission is set (integer, 0-100).
 */
define('PAYSTACK_PLATFORM_BUSINESS_NAME', trim($_ENV['PLATFORM_BUSINESS_NAME'] ?? 'Attoneex Tech-Solutions Nig. Ltd'));
define('PAYSTACK_PLATFORM_BANK_CODE', trim($_ENV['PAYSTACK_PLATFORM_SUBACCOUNT_BANK_CODE'] ?? ''));
define('PAYSTACK_PLATFORM_ACCOUNT_NUMBER', trim($_ENV['PAYSTACK_PLATFORM_SETTLEMENT_ACCOUNT_NUMBER'] ?? ''));
define('PAYSTACK_PLATFORM_ACCOUNT_NAME', trim($_ENV['PAYSTACK_PLATFORM_SETTLEMENT_ACCOUNT_NAME'] ?? 'Attoneex Tech-Solutions Nig. Ltd'));
define('PAYSTACK_PLATFORM_COMMISSION_PERCENT', (float)($_ENV['PAYSTACK_PLATFORM_COMMISSION_PERCENT'] ?? 30.0));

function selectPaystackSecretKey(?string $organizerKey = null): string
{
    $platformKey = PAYSTACK_SECRET_KEY;
    $organizerKey = trim((string) $organizerKey);

    if ($organizerKey !== '' && $platformKey !== '') {
        $platformMode = str_starts_with($platformKey, 'sk_live_') ? 'live' : 'test';
        $organizerMode = str_starts_with($organizerKey, 'sk_live_') ? 'live' : 'test';
        if ($platformMode === $organizerMode) {
            return $organizerKey;
        }
    }

    return $platformKey;
}

/**
 * Helper: call Paystack API
 */
function paystackRequest(string $method, string $path, array $payload = [], ?string $secretKeyOverride = null): array
{
    $secretKey = $secretKeyOverride ?? (defined('PAYSTACK_SECRET_KEY') ? PAYSTACK_SECRET_KEY : '');

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

/**
 * Ensures a "platform" subaccount (Attoneex Tech-Solutions Nig. Ltd) exists
 * under a CLIENT's own Paystack account and returns its code, so the
 * platform's commission settles directly to the platform's bank account
 * whenever a transaction runs on the client's integration.
 *
 * Cached as metadata.paystack_platform_subaccount on the clients row so the
 * Paystack API is only hit once per client. The client's OWN subaccount_code
 * (used for the opposite flow — platform-key charges) is never touched.
 *
 * @return array ['success' => bool, 'subaccount_code' => ?string, 'percentage_charge' => float, 'message' => string]
 */
function ensurePlatformSubaccount($pdo, int $client_id, string $clientSecretKey, ?float $commissionPercent = null): array
{
    $commission = $commissionPercent ?? PAYSTACK_PLATFORM_COMMISSION_PERCENT;
    if ($commission < 0) $commission = 0.0;
    if ($commission > 100) $commission = 100.0;

    // 1. Cached?
    $stmt = $pdo->prepare('SELECT metadata FROM clients WHERE id = ? LIMIT 1');
    $stmt->execute([$client_id]);
    $metaRow = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$metaRow) {
        return ['success' => false, 'subaccount_code' => null, 'percentage_charge' => $commission, 'message' => 'Client not found'];
    }
    $meta = json_decode($metaRow['metadata'] ?? '{}', true) ?: [];
    $keyFingerprint = substr(sha1($clientSecretKey), 0, 16);
    if (!empty($meta['paystack_platform_subaccount']['code'])
        && ($meta['paystack_platform_subaccount']['key_fingerprint'] ?? '') === $keyFingerprint) {
        return [
            'success' => true,
            'subaccount_code' => (string)$meta['paystack_platform_subaccount']['code'],
            'percentage_charge' => (float)($meta['paystack_platform_subaccount']['percentage_charge'] ?? $commission),
            'message' => 'cached',
        ];
    }
    // A cached code from a DIFFERENT integration (e.g. the client's old test
    // key) is invalid for the current key — fall through and re-create under
    // the active integration.

    // 2. Create it under the CLIENT's account.
    //    Bank details: prefer the platform's own configured settlement
    //    account; gracefully degrade to the client's stored settlement
    //    details when the platform's are not configured, so the split still
    //    works (the client can then update the destination bank account in
    //    the Paystack dashboard without any code change).
    $bankCode = PAYSTACK_PLATFORM_BANK_CODE;
    $accountNumber = PAYSTACK_PLATFORM_ACCOUNT_NUMBER;
    $degraded = false;
    if ($bankCode === '' || $accountNumber === '') {
        $c = $pdo->prepare('SELECT settlement_bank_code, settlement_account_number FROM clients WHERE id = ? LIMIT 1');
        $c->execute([$client_id]);
        $row = $c->fetch(PDO::FETCH_ASSOC) ?: [];
        $bankCode = $bankCode !== '' ? $bankCode : (string)($row['settlement_bank_code'] ?? '');
        $accountNumber = $accountNumber !== '' ? $accountNumber : (string)($row['settlement_account_number'] ?? '');
        if ($bankCode === '' || $accountNumber === '') {
            // No usable details anywhere — do NOT guess. The transaction
            // proceeds without a platform split (Paystack rejects a subaccount
            // with placeholder bank details anyway).
            error_log("[ensurePlatformSubaccount] client #{$client_id}: no platform settlement details configured and client has none — skipping platform split.");
            return ['success' => false, 'subaccount_code' => null, 'percentage_charge' => $commission, 'message' => 'No settlement details available for platform subaccount'];
        }
        $degraded = true;
    }

    $payload = [
        'business_name' => PAYSTACK_PLATFORM_BUSINESS_NAME,
        'settlement_bank' => $bankCode,
        'account_number' => $accountNumber,
        'percentage_charge' => $commission,
    ];
    $res = paystackRequest('POST', '/subaccount', $payload, $clientSecretKey);

    if (!$res['ok']) {
        $msg = $res['body']['message'] ?? $res['error'] ?? 'Unknown Paystack error';
        error_log("[ensurePlatformSubaccount] client #{$client_id}: create failed: " . $msg);
        return ['success' => false, 'subaccount_code' => null, 'percentage_charge' => $commission, 'message' => $msg];
    }

    $code = (string)($res['body']['data']['subaccount_code'] ?? '');
    if ($code === '') {
        return ['success' => false, 'subaccount_code' => null, 'percentage_charge' => $commission, 'message' => 'Paystack returned no subaccount_code'];
    }

    // 3. Cache on the clients row (does not touch the client's own code).
    //    key_fingerprint ties the code to the integration it was created
    //    under; a later key change invalidates the cache automatically.
    $meta['paystack_platform_subaccount'] = [
        'code' => $code,
        'business_name' => PAYSTACK_PLATFORM_BUSINESS_NAME,
        'percentage_charge' => $commission,
        'key_fingerprint' => $keyFingerprint,
        'degraded_bank_details' => $degraded,
        'created_at' => date('c'),
    ];
    $upd = $pdo->prepare('UPDATE clients SET metadata = ?, updated_at = NOW() WHERE id = ?');
    $upd->execute([json_encode($meta), $client_id]);

    return ['success' => true, 'subaccount_code' => $code, 'percentage_charge' => $commission, 'message' => 'created'];
}

function verifyPaystackSignature($payload, $signature_header)
{
    $secret = !empty(PAYSTACK_WEBHOOK_SECRET) ? PAYSTACK_WEBHOOK_SECRET : PAYSTACK_SECRET_KEY;
    if (empty($secret))
        return false;
    return hash_equals(hash_hmac('sha512', $payload, $secret), $signature_header);
}