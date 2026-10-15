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
 *       own settlement account (Paystack bank list, e.g. 058 = GTBank).
 * PAYSTACK_PLATFORM_SETTLEMENT_ACCOUNT_NUMBER : the platform's bank account
 *       number (10 digits). Both values are required before platform splits
 *       can be created; client bank details must never receive platform funds.
 * PAYSTACK_PLATFORM_SETTLEMENT_ACCOUNT_NAME : label stored with the code.
 */
define('PAYSTACK_PLATFORM_BUSINESS_NAME', trim($_ENV['PLATFORM_BUSINESS_NAME'] ?? 'Attoneex Tech-Solutions Nig. Ltd'));
define('PAYSTACK_PLATFORM_BANK_CODE', trim($_ENV['PAYSTACK_PLATFORM_SUBACCOUNT_BANK_CODE'] ?? ''));
define('PAYSTACK_PLATFORM_ACCOUNT_NUMBER', trim($_ENV['PAYSTACK_PLATFORM_SETTLEMENT_ACCOUNT_NUMBER'] ?? ''));
define('PAYSTACK_PLATFORM_ACCOUNT_NAME', trim($_ENV['PAYSTACK_PLATFORM_SETTLEMENT_ACCOUNT_NAME'] ?? 'Attoneex Tech-Solutions Nig. Ltd'));
define('PAYSTACK_PLATFORM_COMMISSION_PERCENT', 10.0);

function selectPaystackSecretKey(?string $organizerKey = null): string
{
    $organizerKey = trim((string) $organizerKey);

    if ($organizerKey !== '') {
        return $organizerKey;
    }

    return PAYSTACK_SECRET_KEY;
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
        'percentage_charge' => PAYSTACK_PLATFORM_COMMISSION_PERCENT,
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

/** Reactivate a verified platform subaccount and confirm its intended split. */
function activatePlatformSubaccount(string $code, string $secretKey, float $mainAccountPercent): array
{
    $updated = paystackRequest(
        'PUT',
        '/subaccount/' . rawurlencode($code),
        ['active' => true, 'percentage_charge' => $mainAccountPercent],
        $secretKey
    );
    if (!$updated['ok']) {
        return ['success' => false, 'message' => $updated['body']['message'] ?? $updated['error'] ?? 'Could not activate the Attoneex subaccount'];
    }

    $details = $updated['body']['data'] ?? [];
    if (!array_key_exists('active', $details) || !array_key_exists('percentage_charge', $details)) {
        $check = paystackRequest('GET', '/subaccount/' . rawurlencode($code), [], $secretKey);
        if (!$check['ok'] || empty($check['body']['data'])) {
            return ['success' => false, 'message' => 'Paystack could not confirm the Attoneex subaccount activation'];
        }
        $details = $check['body']['data'];
    }

    if (!filter_var($details['active'] ?? false, FILTER_VALIDATE_BOOLEAN)) {
        return ['success' => false, 'message' => 'Paystack did not activate the Attoneex subaccount'];
    }
    if (abs((float)($details['percentage_charge'] ?? -1) - $mainAccountPercent) > 0.01) {
        return ['success' => false, 'message' => 'Paystack did not apply the requested platform split'];
    }

    return ['success' => true, 'data' => $details];
}

/**
 * Ensures a "platform" subaccount (Attoneex Tech-Solutions Nig. Ltd) exists
 * under a CLIENT's own Paystack account and returns its code, so the
 * platform's commission settles directly to the platform's bank account
 * whenever a transaction runs on the client's integration.
 *
 * Cached as metadata.paystack_platform_subaccount on the clients row so the
 * subaccount is created once and revalidated before checkout. The client's
 * OWN subaccount_code (used for platform-key charges) is never touched.
 *
 * @return array ['success' => bool, 'subaccount_code' => ?string, 'percentage_charge' => float, 'message' => string]
 */
function ensurePlatformSubaccount($pdo, int $client_id, string $clientSecretKey, ?float $commissionPercent = null, ?string $manualSubaccountCode = null): array
{
    $commission = $commissionPercent ?? PAYSTACK_PLATFORM_COMMISSION_PERCENT;
    if ($commission < 0) $commission = 0.0;
    if ($commission > 100) $commission = 100.0;
    // Paystack's percentage_charge is the share paid to the main account.
    // Here the organizer is the main account and Attoneex is the subaccount.
    $mainAccountPercent = round(100 - $commission, 2);

    // 1. Cached?
    $stmt = $pdo->prepare('SELECT metadata FROM clients WHERE id = ? LIMIT 1');
    $stmt->execute([$client_id]);
    $metaRow = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$metaRow) {
        return ['success' => false, 'subaccount_code' => null, 'percentage_charge' => $commission, 'message' => 'Client not found'];
    }
    $meta = json_decode($metaRow['metadata'] ?? '{}', true) ?: [];
    $keyFingerprint = substr(sha1($clientSecretKey), 0, 16);
    $cachedPlatform = $meta['paystack_platform_subaccount'] ?? [];
    $cachedCode = (string)($cachedPlatform['code'] ?? '');
    $manualCode = trim((string)$manualSubaccountCode);
    if ($manualCode === '' && ($cachedPlatform['source'] ?? '') === 'manual') {
        $manualCode = $cachedCode;
    }
    $sameIntegration = $cachedCode !== ''
        && ($cachedPlatform['key_fingerprint'] ?? '') === $keyFingerprint;
    $cachedBankIsPlatform = empty($cachedPlatform['degraded_bank_details']);

    // A manually-created code is usable without platform bank variables as
    // long as Paystack confirms it belongs to the platform and has the right
    // split. Cache it per integration so the read-only check is done once.
    if ($manualCode !== '') {
        if (!preg_match('/^ACCT_[A-Za-z0-9]+$/', $manualCode)) {
            return ['success' => false, 'subaccount_code' => null, 'percentage_charge' => $commission, 'message' => 'The Attoneex subaccount code is invalid'];
        }
        $manual = paystackRequest('GET', '/subaccount/' . rawurlencode($manualCode), [], $clientSecretKey);
        if (!$manual['ok'] || empty($manual['body']['data'])) {
            $msg = $manual['body']['message'] ?? $manual['error'] ?? 'Paystack could not find this subaccount under the client account';
            return ['success' => false, 'subaccount_code' => null, 'percentage_charge' => $commission, 'message' => $msg];
        }
        $details = $manual['body']['data'];
        $actualName = strtolower(trim((string)($details['business_name'] ?? '')));
        $expectedName = strtolower(trim(PAYSTACK_PLATFORM_BUSINESS_NAME));
        $nameMatches = $actualName !== '' && (
            $actualName === $expectedName
            || str_contains($actualName, $expectedName)
            || str_contains($expectedName, $actualName)
            || (str_contains($expectedName, 'attoneex') && str_contains($actualName, 'attoneex'))
        );
        if (!$nameMatches) {
            return ['success' => false, 'subaccount_code' => null, 'percentage_charge' => $commission, 'message' => 'That subaccount is not named for the Attoneex platform'];
        }
        if (PAYSTACK_PLATFORM_ACCOUNT_NUMBER !== ''
            && preg_replace('/\D/', '', (string)($details['account_number'] ?? '')) !== preg_replace('/\D/', '', PAYSTACK_PLATFORM_ACCOUNT_NUMBER)) {
            return ['success' => false, 'subaccount_code' => null, 'percentage_charge' => $commission, 'message' => 'The Attoneex subaccount settlement account does not match the configured platform account'];
        }

        if (!filter_var($details['active'] ?? false, FILTER_VALIDATE_BOOLEAN)
            || abs((float)($details['percentage_charge'] ?? -1) - $mainAccountPercent) > 0.01) {
            $enabled = activatePlatformSubaccount($manualCode, $clientSecretKey, $mainAccountPercent);
            if (empty($enabled['success'])) {
                return ['success' => false, 'subaccount_code' => null, 'percentage_charge' => $commission, 'message' => $enabled['message'] ?? 'Could not activate the Attoneex subaccount'];
            }
            $details = $enabled['data'];
        }

        $storedMainPercent = (float)($details['percentage_charge'] ?? -1);
        if (abs($storedMainPercent - $mainAccountPercent) > 0.01) {
            $updated = paystackRequest(
                'PUT',
                '/subaccount/' . rawurlencode($manualCode),
                ['percentage_charge' => $mainAccountPercent],
                $clientSecretKey
            );
            if (!$updated['ok']) {
                $msg = $updated['body']['message'] ?? $updated['error'] ?? 'Could not configure the platform split on the Attoneex subaccount';
                return ['success' => false, 'subaccount_code' => null, 'percentage_charge' => $commission, 'message' => $msg];
            }
            $updatedData = $updated['body']['data'] ?? [];
            if (isset($updatedData['percentage_charge'])
                && abs((float)$updatedData['percentage_charge'] - $mainAccountPercent) > 0.01) {
                return ['success' => false, 'subaccount_code' => null, 'percentage_charge' => $commission, 'message' => 'Paystack did not apply the requested platform split'];
            }
        }

        $meta['paystack_platform_subaccount'] = [
            'code' => $manualCode,
            'business_name' => $details['business_name'] ?? PAYSTACK_PLATFORM_BUSINESS_NAME,
            'percentage_charge' => $commission,
            'main_account_percentage_charge' => $mainAccountPercent,
            'key_fingerprint' => $keyFingerprint,
            'degraded_bank_details' => false,
            'source' => 'manual',
            'created_at' => $cachedPlatform['created_at'] ?? date('c'),
        ];
        $upd = $pdo->prepare('UPDATE clients SET metadata = ?, updated_at = NOW() WHERE id = ?');
        $upd->execute([json_encode($meta), $client_id]);

        return ['success' => true, 'subaccount_code' => $manualCode, 'percentage_charge' => $commission, 'message' => 'manual subaccount verified'];
    }

    if ($sameIntegration
        && $cachedBankIsPlatform
        && ($cachedPlatform['source'] ?? 'automatic') !== 'manual'
        && (float)($cachedPlatform['percentage_charge'] ?? -1) === $commission
        && (float)($cachedPlatform['main_account_percentage_charge'] ?? -1) === $mainAccountPercent) {
        $cached = paystackRequest('GET', '/subaccount/' . rawurlencode($cachedCode), [], $clientSecretKey);
        if ($cached['ok'] && !empty($cached['body']['data'])) {
            $details = $cached['body']['data'];
            $name = strtolower(trim((string)($details['business_name'] ?? '')));
            if (!str_contains($name, 'attoneex')) {
                return ['success' => false, 'subaccount_code' => null, 'percentage_charge' => $commission, 'message' => 'The saved platform subaccount does not belong to Attoneex'];
            }
            if (PAYSTACK_PLATFORM_ACCOUNT_NUMBER !== ''
                && preg_replace('/\D/', '', (string)($details['account_number'] ?? '')) !== preg_replace('/\D/', '', PAYSTACK_PLATFORM_ACCOUNT_NUMBER)) {
                return ['success' => false, 'subaccount_code' => null, 'percentage_charge' => $commission, 'message' => 'The saved Attoneex subaccount settlement account does not match the configured platform account'];
            }
            if (!filter_var($details['active'] ?? false, FILTER_VALIDATE_BOOLEAN)
                || abs((float)($details['percentage_charge'] ?? -1) - $mainAccountPercent) > 0.01) {
                $enabled = activatePlatformSubaccount($cachedCode, $clientSecretKey, $mainAccountPercent);
                if (empty($enabled['success'])) {
                    return ['success' => false, 'subaccount_code' => null, 'percentage_charge' => $commission, 'message' => $enabled['message'] ?? 'Could not activate the Attoneex subaccount'];
                }
                $details = $enabled['data'];
            }
            return ['success' => true, 'subaccount_code' => $cachedCode, 'percentage_charge' => $commission, 'message' => 'cached and active'];
        }

        $lookupMessage = (string)($cached['body']['message'] ?? $cached['error'] ?? 'Could not verify the saved Attoneex subaccount');
        $staleCode = in_array((int)($cached['code'] ?? 0), [400, 404], true)
            && (bool)preg_match('/invalid.*subaccount|subaccount.*(not found|does not exist)/i', $lookupMessage);
        if (!$staleCode) {
            return ['success' => false, 'subaccount_code' => null, 'percentage_charge' => $commission, 'message' => $lookupMessage];
        }

        error_log("[ensurePlatformSubaccount] client #{$client_id}: cached Attoneex subaccount is invalid; creating a replacement.");
        unset($meta['paystack_platform_subaccount']);
        $stmt = $pdo->prepare('UPDATE clients SET metadata = ?, updated_at = NOW() WHERE id = ?');
        $stmt->execute([json_encode($meta), $client_id]);
        $cachedCode = '';
        $sameIntegration = false;
        $cachedBankIsPlatform = false;
    }
    // A cached code from a different integration cannot be reused. A code
    // created with a client's bank details or a stale commission must be
    // repaired using the platform's own settlement details.

    // 2. Create or repair the platform subaccount under the CLIENT's account.
    $bankCode = PAYSTACK_PLATFORM_BANK_CODE;
    $accountNumber = PAYSTACK_PLATFORM_ACCOUNT_NUMBER;
    if ($bankCode === '' || $accountNumber === '') {
        error_log("[ensurePlatformSubaccount] client #{$client_id}: platform settlement details are not configured.");
        return ['success' => false, 'subaccount_code' => null, 'percentage_charge' => $commission, 'message' => 'Platform settlement bank details are not configured'];
    }

    $payload = [
        'business_name' => PAYSTACK_PLATFORM_BUSINESS_NAME,
        'settlement_bank' => $bankCode,
        'account_number' => $accountNumber,
        'percentage_charge' => $mainAccountPercent,
    ];
    if ($sameIntegration) {
        $payload['active'] = true;
        $res = paystackRequest('PUT', '/subaccount/' . rawurlencode($cachedCode), $payload, $clientSecretKey);
    } else {
        $res = paystackRequest('POST', '/subaccount', $payload, $clientSecretKey);
    }

    if (!$res['ok']) {
        $msg = $res['body']['message'] ?? $res['error'] ?? 'Unknown Paystack error';
        error_log("[ensurePlatformSubaccount] client #{$client_id}: create failed: " . $msg);
        return ['success' => false, 'subaccount_code' => null, 'percentage_charge' => $commission, 'message' => $msg];
    }

    $code = (string)($res['body']['data']['subaccount_code'] ?? $cachedCode);
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
        'main_account_percentage_charge' => $mainAccountPercent,
        'key_fingerprint' => $keyFingerprint,
        'degraded_bank_details' => false,
        'source' => 'automatic',
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
