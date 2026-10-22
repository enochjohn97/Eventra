<?php

header('Content-Type: application/json');
require_once '../../config/database.php';
require_once '../../includes/middleware/auth.php';

// Check authentication
$admin_id = checkAuth('admin');

$client_id = $_GET['id'] ?? null;
if (!$client_id) {
    echo json_encode(['success' => false, 'message' => 'Client ID is required']);
    exit;
}

try {
    // 1. Get Client Info
    $stmt = $pdo->prepare("
        SELECT c.*, a.email
        FROM clients c
        JOIN auth_accounts a ON c.client_auth_id = a.id
        WHERE c.id = ? AND c.deleted_at IS NULL
    ");
    $stmt->execute([$client_id]);
    $client = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$client) {
        echo json_encode(['success' => false, 'message' => 'Client not found']);
        exit;
    }

    // Remove sensitive data
    unset($client['password']);
    
    $meta = json_decode($client['metadata'] ?? '{}', true) ?: [];
    // Never expose any stored Paystack secret key to the UI.
    $client['paystack_key'] = '';
    $client['has_paystack_key'] = !empty($client['paystack_auth_token'])
        || !empty($meta['paystack_auth_token'])
        || !empty($meta['paystack_key']);
    unset($client['paystack_auth_token']);
    $client['bank_code'] = $client['settlement_bank_code'] ?? $meta['bank_code'] ?? '';
    $client['bank_name'] = $client['settlement_bank_name'] ?? $meta['bank_name'] ?? '';
    $client['account_number'] = $client['settlement_account_number'] ?? $meta['account_number'] ?? '';
    $client['account_name'] = $client['settlement_account_name'] ?? $meta['account_name'] ?? '';
    $client['paystack_account_status'] = $meta['paystack_account_status'] ?? 'not_created';
    $client['paystack_account_reason'] = $meta['paystack_account_reason'] ?? '';
    $client['paystack_account_reviewed_at'] = $meta['paystack_account_reviewed_at'] ?? null;
    $platformSubaccount = $meta['paystack_platform_subaccount'] ?? [];
    $client['paystack_platform_subaccount_code'] = $platformSubaccount['code'] ?? '';
    if (empty($client['subaccount_code']) && !empty($client['paystack_platform_subaccount_code'])) {
        $client['subaccount_code'] = $client['paystack_platform_subaccount_code'];
    }
    // Stable modal contract. Keep flat fields too for existing dashboard code.
    $client['settlement_account'] = [
        'bank_name' => $client['bank_name'],
        'bank_code' => $client['bank_code'],
        'account_number' => $client['account_number'],
        'account_name' => $client['account_name'],
        'verification_status' => $client['settlement_verification_status'] ?? 'pending',
        'status' => $client['settlement_verification_status'] ?? 'pending',
    ];
    // Sanitize corrupt data URIs on the fly for the admin UI
    $fieldsToClean = ['profile_pic', 'kyc_nin_file', 'kyc_bvn_file', 'kyc_voter_card_file', 'kyc_driver_license_file', 'kyc_cac_file'];
    foreach ($fieldsToClean as $field) {
        if (isset($client[$field]) && strpos($client[$field], 'data:') === 0) {
            $client[$field] = null;
        }
    }

    // BVN is an 11-digit number stored in kyc_bvn (or metadata).
    $bvnVerified = !empty($meta['bvn_verified']);
    $client['bvn_verified'] = $bvnVerified ? 1 : 0;
    $rawBvn = trim((string)($client['kyc_bvn'] ?? $meta['bvn_number'] ?? ''));
    $maskedBvn = $meta['bvn_number_masked'] ?? ($rawBvn !== '' ? (substr($rawBvn, 0, 3) . '*****' . substr($rawBvn, -3)) : '');
    $client['kyc_bvn'] = $rawBvn;
    $client['bvn_masked'] = $maskedBvn;
    $client['bvn_verified_at'] = $meta['bvn_verified_at'] ?? null;
    $client['bvn_provider'] = $meta['bvn_provider'] ?? null;
    $client['nin_verified'] = !empty($meta['nin_verified']) ? 1 : 0;
    $client['nin_masked'] = $meta['nin_number_masked'] ?? '';

    $client['kyc_documents'] = [
        'bvn' => [
            'url' => $client['kyc_bvn_file'] ?? null,
            'status' => $bvnVerified
                ? 'verified'
                : (!empty($rawBvn) ? 'provided' : (!empty($client['kyc_bvn_file']) ? 'uploaded' : 'missing')),
            'verified' => $bvnVerified,
            'masked' => $maskedBvn,
            'number' => $rawBvn,
        ],
        'nin' => ['url' => $client['kyc_nin_file'] ?? null, 'status' => !empty($client['kyc_nin_file']) ? 'uploaded' : 'missing'],
        'cac' => ['url' => $client['kyc_cac_file'] ?? null, 'status' => !empty($client['kyc_cac_file']) ? 'uploaded' : 'missing'],
        'voters_card' => ['url' => $client['kyc_voter_card_file'] ?? null, 'status' => !empty($client['kyc_voter_card_file']) ? 'uploaded' : 'missing'],
        'drivers_license' => ['url' => $client['kyc_driver_license_file'] ?? null, 'status' => !empty($client['kyc_driver_license_file']) ? 'uploaded' : 'missing'],
    ];
    unset($client['metadata']);


    // 2. Get Events by Client
    $evtStmt = $pdo->prepare("
        SELECT id, event_name, event_date, status, price, attendee_count as tickets_sold
        FROM events 
        WHERE client_id = ? AND deleted_at IS NULL
        ORDER BY created_at DESC
    ");
    $evtStmt->execute([$client_id]);
    $events = $evtStmt->fetchAll(PDO::FETCH_ASSOC);

    // 3. Get Buyers for this client's events
    $buyStmt = $pdo->prepare("
        SELECT u.id, u.name, u.profile_pic, a.email, COUNT(t.id) as tickets_bought
        FROM users u
        JOIN auth_accounts a ON u.user_auth_id = a.id
        JOIN tickets t ON t.user_id = u.id
        JOIN events e ON t.event_id = e.id
        WHERE e.client_id = ?
        GROUP BY u.id, u.name, u.profile_pic, a.email
        ORDER BY tickets_bought DESC
    ");
    $buyStmt->execute([$client_id]);
    $buyers = $buyStmt->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode([
        'success' => true,
        'client' => $client,
        'events' => $events,
        'buyers' => $buyers
    ]);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database error. Please try again or contact support if it persists.']);
}
