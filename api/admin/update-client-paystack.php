<?php

/**
 * Update Client Paystack Details API
 */

header('Content-Type: application/json');
require_once '../../config/database.php';
require_once '../../includes/middleware/auth.php';
require_once '../../config/payment.php';

// Check authentication
$admin_id = adminMiddleware();

$data = json_decode(file_get_contents('php://input'), true);
$client_id = $data['client_id'] ?? null;
// Support either explicit paystack_key (used by some UI paths) or paystack_auth_token
$paystack_key = trim($data['paystack_key'] ?? $data['paystack_auth_token'] ?? '');
$paystack_connection_status = $data['paystack_connection_status'] ?? null;
$paystack_account_status = $data['paystack_account_status'] ?? null;
$paystack_account_reason = trim(strip_tags((string)($data['paystack_account_reason'] ?? '')));
$paystack_account_reason = mb_substr($paystack_account_reason, 0, 500);
$platform_subaccount_code = trim((string)($data['platform_subaccount_code'] ?? ''));
$paystack_public_key = trim($data['paystack_public_key'] ?? '');
$paystack_merchant_id = trim($data['paystack_merchant_id'] ?? '');

if (!$client_id) {
    echo json_encode(['success' => false, 'message' => 'Client ID is required']);
    exit;
}

$statusOnly = !$paystack_key && (
    $paystack_connection_status !== null
    || $paystack_account_status !== null
    || $paystack_public_key !== ''
    || $paystack_merchant_id !== ''
    || $platform_subaccount_code !== ''
);

if (!$paystack_key && !$statusOnly) {
    echo json_encode(['success' => false, 'message' => 'Paystack Key is required']);
    exit;
}

if ($paystack_account_status !== null
    && !in_array($paystack_account_status, ['not_created', 'pending', 'approved', 'declined'], true)) {
    http_response_code(422);
    echo json_encode(['success' => false, 'message' => 'Choose a valid Paystack account review status.']);
    exit;
}
if ($paystack_account_status === 'declined' && $paystack_account_reason === '') {
    http_response_code(422);
    echo json_encode(['success' => false, 'message' => 'Add the reason the Paystack account was declined.']);
    exit;
}
if ($platform_subaccount_code !== '' && !preg_match('/^ACCT_[A-Za-z0-9]+$/', $platform_subaccount_code)) {
    http_response_code(422);
    echo json_encode(['success' => false, 'message' => 'Enter a valid Attoneex subaccount code (ACCT_...).']);
    exit;
}

if ($paystack_key) {
    $isLiveKey = (bool) preg_match('/^sk_live_[A-Za-z0-9]{8,}$/', $paystack_key);
    $isLocalDevelopment = isLocalHost() && ($_ENV['APP_ENV'] ?? '') === 'local';
    $isLocalTestKey = $isLocalDevelopment
        && (bool) preg_match('/^sk_test_[A-Za-z0-9]{8,}$/', $paystack_key);
    if (!$isLiveKey && !$isLocalTestKey) {
        $message = $isLocalDevelopment
            ? 'A valid live secret key is required, or a test key may be used on a local development server.'
            : 'A valid live secret key is required. Test keys are only accepted on a local development server.';
        echo json_encode(['success' => false, 'message' => $message]);
        exit;
    }
}

$env = $paystack_key ? (str_starts_with($paystack_key, 'sk_live_') ? 'live' : 'test') : null;

try {
    if ($paystack_key) {
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
    }

    // Fetch existing metadata
    $stmt = $pdo->prepare("SELECT metadata, paystack_auth_token FROM clients WHERE id = ?");
    $stmt->execute([$client_id]);
    $client = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$client) {
        echo json_encode(['success' => false, 'message' => 'Client not found']);
        exit;
    }

    $storedMeta = json_decode($client['metadata'] ?? '{}', true) ?: [];
    $effectivePaystackKey = $paystack_key ?: trim((string)($client['paystack_auth_token'] ?? $storedMeta['paystack_auth_token'] ?? ''));
    if ($paystack_key || $platform_subaccount_code !== '') {
        if ($effectivePaystackKey === '') {
            http_response_code(422);
            echo json_encode([
                'success' => false,
                'message' => 'Save the client Paystack secret key before adding an Attoneex subaccount code.',
            ]);
            exit;
        }
        $platform = ensurePlatformSubaccount(
            $pdo,
            (int)$client_id,
            $effectivePaystackKey,
            PAYSTACK_PLATFORM_COMMISSION_PERCENT,
            $platform_subaccount_code !== '' ? $platform_subaccount_code : null
        );
        if (empty($platform['success']) || empty($platform['subaccount_code'])) {
            http_response_code(422);
            echo json_encode([
                'success' => false,
                'message' => $platform['message'] ?? 'The Attoneex settlement subaccount could not be configured. Check the code and settlement details, then try again.',
            ]);
            exit;
        }
    }

    // ensurePlatformSubaccount updates this row's metadata, so read it after
    // the Paystack call before merging connection settings.
    $stmt = $pdo->prepare("SELECT metadata FROM clients WHERE id = ?");
    $stmt->execute([$client_id]);
    $client = $stmt->fetch(PDO::FETCH_ASSOC);

    $meta = json_decode($client['metadata'] ?? '{}', true) ?: [];
    $previousAccountStatus = (string)($meta['paystack_account_status'] ?? 'not_created');
    
    if ($paystack_key) {
        $meta['paystack_key'] = $paystack_key;
        $meta['paystack_env'] = $env;
        $meta['paystack_auth_token'] = $paystack_key;
        $meta['paystack_connection_status'] = 'connected';
    }
    if ($paystack_public_key !== '') $meta['paystack_public_key'] = $paystack_public_key;
    if ($paystack_merchant_id !== '') $meta['paystack_merchant_id'] = $paystack_merchant_id;
    if ($paystack_connection_status !== null) $meta['paystack_connection_status'] = $paystack_connection_status;
    if ($paystack_account_status !== null) {
        $meta['paystack_account_status'] = $paystack_account_status;
        $meta['paystack_account_reason'] = $paystack_account_status === 'declined' ? $paystack_account_reason : null;
        $meta['paystack_account_reviewed_at'] = in_array($paystack_account_status, ['approved', 'declined'], true)
            ? date('Y-m-d H:i:s')
            : null;
    }

    $updated_metadata = json_encode($meta);
    $sets = ['metadata = ?', 'updated_at = NOW()'];
    $params = [$updated_metadata];
    if ($paystack_connection_status !== null) { $sets[] = 'paystack_connection_status = ?'; $params[] = $paystack_connection_status; }
    if ($paystack_public_key !== '') { $sets[] = 'paystack_public_key = ?'; $params[] = $paystack_public_key; }
    if ($paystack_merchant_id !== '') { $sets[] = 'paystack_merchant_id = ?'; $params[] = $paystack_merchant_id; }
    if ($paystack_key) { $sets[] = 'paystack_auth_token = ?'; $params[] = $paystack_key; $sets[] = "settlement_verification_status = 'verified'"; $sets[] = "paystack_connection_status = 'connected'"; }
    $params[] = $client_id;

    $updateStmt = $pdo->prepare("UPDATE clients SET " . implode(', ', $sets) . " WHERE id = ?");
    $updateStmt->execute($params);

    // Account decisions are useful to every admin, including the admin who
    // made the update. The notification metadata powers the review modal.
    $isAccountDecision = in_array($paystack_account_status, ['approved', 'declined'], true);
    if ($isAccountDecision && $previousAccountStatus !== $paystack_account_status) {
        require_once '../../api/utils/notification-helper.php';
        $detailsStmt = $pdo->prepare("SELECT c.client_auth_id, c.name, c.business_name, c.company, c.phone, a.email FROM clients c JOIN auth_accounts a ON c.client_auth_id = a.id WHERE c.id = ? AND c.deleted_at IS NULL");
        $detailsStmt->execute([$client_id]);
        $business = $detailsStmt->fetch(PDO::FETCH_ASSOC) ?: [];
        $businessName = (string)(($business['business_name'] ?? '') ?: ($business['company'] ?? '') ?: ($business['name'] ?? '') ?: 'Client');
        $message = $paystack_account_status === 'approved'
            ? "Paystack account approved for {$businessName}."
            : "Paystack account declined for {$businessName}. Reason: {$paystack_account_reason}";
        $reviewData = [
            'client_id' => (int)$client_id,
            'business_name' => $businessName,
            'client_name' => (string)($business['name'] ?? ''),
            'company' => (string)($business['company'] ?? ''),
            'email' => (string)($business['email'] ?? ''),
            'phone' => (string)($business['phone'] ?? ''),
            'status' => $paystack_account_status,
            'reason' => $paystack_account_status === 'declined' ? $paystack_account_reason : '',
            'reviewed_at' => $meta['paystack_account_reviewed_at'],
        ];
        $recipients = $pdo->query("SELECT DISTINCT admin_auth_id FROM admins WHERE admin_auth_id IS NOT NULL")->fetchAll(PDO::FETCH_COLUMN);
        $senderAuthId = (int)getAuthId();
        foreach ($recipients as $recipientAuthId) {
            createNotification(
                (int)$recipientAuthId,
                $message,
                'paystack_account_review',
                $senderAuthId,
                'admin',
                'admin',
                $reviewData
            );
        }
    }

    require_once '../../includes/helpers/entity-resolver.php';
    logSecurityEvent($admin_id, 'admin@EventOut.local', 'admin_action', 'local', "Client ID $client_id: Paystack key updated");

    echo json_encode([
        'success' => true,
        'message' => $platform_subaccount_code !== ''
            ? 'Attoneex subaccount verified and the platform split is ready.'
            : ($paystack_key
                ? 'Client Paystack account connected and the 10% Attoneex settlement split is ready.'
                : ($paystack_account_status !== null
                    ? 'Paystack account review status updated successfully.'
                    : 'Client Paystack details updated successfully.'))
    ]);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database error. Please try again or contact support if it persists.']);
}
