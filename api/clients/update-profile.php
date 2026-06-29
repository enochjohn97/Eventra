<?php

/**
 * Update Client Profile API — v2
 * All fields are optional. Validation only applies when a field has a value.
 */

header('Content-Type: application/json');
require_once '../../config/database.php';
require_once '../../config/payment.php';
require_once '../../includes/middleware/auth.php';

$client_id = checkAuth('client');

$stmt = $pdo->prepare("SELECT client_auth_id FROM clients WHERE id = ?");
$stmt->execute([$client_id]);
$client_auth_id = $stmt->fetchColumn();

if (!$client_auth_id) {
    http_response_code(404);
    echo json_encode(['success' => false, 'message' => 'Client profile not found']);
    exit;
}


    // Fetch ALL existing data to handle partial updates properly
    $stmt_existing = $pdo->prepare("
        SELECT c.*, a.email
        FROM clients c
        JOIN auth_accounts a ON c.client_auth_id = a.id
        WHERE c.client_auth_id = ?
    ");
    $stmt_existing->execute([$client_auth_id]);
    $existing = $stmt_existing->fetch() ?: [];

    // ── Fields fallback to existing if empty (fixes data wipe on partial update) ──
    $name           = isset($_POST['name']) && trim($_POST['name']) !== '' ? trim($_POST['name']) : ($existing['name'] ?? '');
    $business_name  = isset($_POST['business_name']) && trim($_POST['business_name']) !== '' ? trim($_POST['business_name']) : ($existing['business_name'] ?? '');
    $phone          = isset($_POST['phone']) && trim($_POST['phone']) !== '' ? trim($_POST['phone']) : ($existing['phone'] ?? '');
    $address        = isset($_POST['address']) && trim($_POST['address']) !== '' ? trim($_POST['address']) : ($existing['address'] ?? '');
    $city           = isset($_POST['city']) && trim($_POST['city']) !== '' ? trim($_POST['city']) : ($existing['city'] ?? '');
    $state          = isset($_POST['state']) && trim($_POST['state']) !== '' ? trim($_POST['state']) : ($existing['state'] ?? '');
    $country        = isset($_POST['country']) && trim($_POST['country']) !== '' ? trim($_POST['country']) : ($existing['country'] ?? '');
    $job_title      = isset($_POST['job_title']) && trim($_POST['job_title']) !== '' ? trim($_POST['job_title']) : ($existing['job_title'] ?? '');
    $company        = isset($_POST['company']) && trim($_POST['company']) !== '' ? trim($_POST['company']) : ($existing['company'] ?? '');
    $dob            = isset($_POST['dob']) && trim($_POST['dob']) !== '' ? trim($_POST['dob']) : ($existing['dob'] ?? '');
    $gender         = isset($_POST['gender']) && trim($_POST['gender']) !== '' ? trim($_POST['gender']) : ($existing['gender'] ?? '');
    $account_number = isset($_POST['account_number']) && trim($_POST['account_number']) !== '' ? trim($_POST['account_number']) : ($existing['account_number'] ?? '');
    $bank_code      = isset($_POST['bank_code']) && trim($_POST['bank_code']) !== '' ? trim($_POST['bank_code']) : ($existing['bank_code'] ?? '');
    $bank_name      = isset($_POST['bank_name']) && trim($_POST['bank_name']) !== '' ? trim($_POST['bank_name']) : ($existing['bank_name'] ?? '');
    $account_name   = isset($_POST['account_name']) && trim($_POST['account_name']) !== '' ? trim($_POST['account_name']) : ($existing['account_name'] ?? '');

    // ── Conditional strict-length validations (only when non-empty) ───────────
    if ($account_number !== '' && (strlen($account_number) !== 10 || !ctype_digit($account_number))) {
        echo json_encode(['success' => false, 'message' => 'Account Number must be exactly 10 digits']);
        exit;
    }

    try {
        $pdo->beginTransaction();

        if (!empty($business_name) && isset($existing['business_name']) && $business_name !== $existing['business_name']) {
            $stmt = $pdo->prepare("SELECT id FROM clients WHERE business_name = ? AND client_auth_id != ? AND deleted_at IS NULL");
            $stmt->execute([$business_name, $client_auth_id]);
            if ($stmt->fetch()) {
                $pdo->rollBack();
                echo json_encode(['success' => false, 'message' => 'Business name already in use']);
                exit;
            }
        }

    // ── Profile Picture Upload ───────────────────────────────────────────
    $profile_pic = null;
    if (isset($_FILES['profile_pic']) && $_FILES['profile_pic']['error'] === UPLOAD_ERR_OK) {
        $upload_dir = '../../uploads/profiles/';
        if (!is_dir($upload_dir)) mkdir($upload_dir, 0755, true);
        $file_ext = strtolower(pathinfo($_FILES['profile_pic']['name'], PATHINFO_EXTENSION));
        if (in_array($file_ext, ['jpg', 'jpeg', 'png', 'gif'])) {
            $new_filename = 'client_' . $client_id . '_' . time() . '.' . $file_ext;
            if (move_uploaded_file($_FILES['profile_pic']['tmp_name'], $upload_dir . $new_filename)) {
                $profile_pic = 'uploads/profiles/' . $new_filename;
            }
        }
    }

    // ── KYC File Uploads ─────────────────────────────────────────────────
    $kyc_upload_dir = '../../uploads/kyc/';
    if (!is_dir($kyc_upload_dir)) mkdir($kyc_upload_dir, 0755, true);

    $kyc_fields = ['kyc_nin_file', 'kyc_bvn_file', 'kyc_voter_card_file', 'kyc_driver_license_file', 'kyc_cac_file', 'kyc_other_file'];
    $kyc_paths  = [];
    $allowed_kyc_exts = ['pdf', 'jpg', 'jpeg', 'png'];

    $required_kyc = ['kyc_nin_file', 'kyc_bvn_file', 'kyc_voter_card_file', 'kyc_driver_license_file', 'kyc_cac_file'];
    foreach ($required_kyc as $req_field) {
        if (empty($existing[$req_field]) && (!isset($_FILES[$req_field]) || $_FILES[$req_field]['error'] !== UPLOAD_ERR_OK)) {
            $pdo->rollBack();
            echo json_encode(['success' => false, 'message' => 'All KYC documents are required. Missing: ' . str_replace('kyc_', '', $req_field)]);
            exit;
        }
    }

    foreach ($kyc_fields as $field) {
        if (isset($_FILES[$field]) && $_FILES[$field]['error'] === UPLOAD_ERR_OK) {
            $ext = strtolower(pathinfo($_FILES[$field]['name'], PATHINFO_EXTENSION));
            if (in_array($ext, $allowed_kyc_exts)) {
                $fname = 'kyc_' . $client_id . '_' . $field . '_' . time() . '.' . $ext;
                $dest  = $kyc_upload_dir . $fname;
                if (move_uploaded_file($_FILES[$field]['tmp_name'], $dest)) {
                    $kyc_paths[$field] = 'uploads/kyc/' . $fname;
                }
            }
        }
    }

    // ── Verification state ───────────────────────────────────────────────
    $nin_verified = $existing['nin_verified'] ?? 0;
    $bvn_verified = $existing['bvn_verified'] ?? 0;

    $sensitive_changed = (
        ($account_number !== '' && $account_number !== ($existing['account_number'] ?? '')) ||
        ($bank_code      !== '' && $bank_code      !== ($existing['bank_code']      ?? ''))
    );

    if ($sensitive_changed) {
        $new_verification_status = 'pending';
        $nin_verified = 0;
        $bvn_verified = 0;
    } else {
        $new_verification_status = $existing['verification_status'] ?? 'pending';
    }

    $resolved_account_name = $existing['account_name'] ?? null;
    $auth_email            = $existing['email']         ?? '';

    // ── Subaccount resolution ────────────────────────────────────────────
    if (!empty($bank_code) && !empty($account_number)) {
        $bank_changed = (
            $account_number !== ($existing['account_number'] ?? '') ||
            $bank_code      !== ($existing['bank_code']      ?? '') ||
            empty($existing['subaccount_code'])
        );

        if ($bank_changed) {
            $subResult = ensureSubaccount(
                $pdo,
                $client_auth_id,
                $bank_code,
                $account_number,
                $business_name ?: $name,
                $auth_email,
                $existing['subaccount_code'] ?? null
            );

            if (!$subResult['success']) {
                $pdo->rollBack();
                echo json_encode(['success' => false, 'message' => 'Payment Setup Failed: ' . $subResult['message']]);
                exit;
            }

            // Prefer user-submitted name > API resolved name > existing DB name
            $resolved_account_name = !empty($account_name)
                ? $account_name
                : ($subResult['account_name'] ?? ($existing['account_name'] ?? null));
        } else {
            $resolved_account_name = !empty($account_name) ? $account_name : ($existing['account_name'] ?? null);
        }
    } elseif (!empty($account_name)) {
        $resolved_account_name = $account_name;
    }

    // ── Custom ID ────────────────────────────────────────────────────────────────────
    $customId = $existing['custom_id'] ?? null;
    if (empty($customId)) {
        require_once __DIR__ . '/../utils/id-generator.php';
        $customId = generateClientId($pdo);
    }

    // ── Build UPDATE query ───────────────────────────────────────────────
    $query = "UPDATE clients SET
        custom_id = ?, name = ?, business_name = ?, phone = ?, address = ?, city = ?,
        state = ?, country = ?, job_title = ?, company = ?, dob = ?, gender = ?,
        nin_verified = ?, bvn_verified = ?,
        account_name = ?, account_number = ?, bank_name = ?, bank_code = ?,
        verification_status = ?, updated_at = NOW()";

    $params = [
        $customId, $name, $business_name, $phone, $address, $city,
        $state, $country, $job_title, $company,
        ($dob !== '' ? $dob : null), ($gender !== '' ? $gender : null),
        $nin_verified, $bvn_verified,
        $resolved_account_name,
        ($account_number !== '' ? $account_number : null),
        ($bank_name      !== '' ? $bank_name      : null),
        ($bank_code      !== '' ? $bank_code      : null),
        $new_verification_status,
    ];

    if ($profile_pic) {
        $query   .= ', profile_pic = ?';
        $params[] = $profile_pic;
    }

    // Append KYC columns dynamically
    foreach ($kyc_paths as $col => $path) {
        $query   .= ", {$col} = ?";
        $params[] = $path;
    }

    $query   .= ' WHERE client_auth_id = ?';
    $params[] = $client_auth_id;

    $stmt = $pdo->prepare($query);
    $stmt->execute($params);

    // Fetch updated client + email for complete user object
    $stmt = $pdo->prepare("
        SELECT c.*, a.email, a.username, a.role
        FROM clients c
        JOIN auth_accounts a ON c.client_auth_id = a.id
        WHERE c.client_auth_id = ?
    ");
    $stmt->execute([$client_auth_id]);
    $updated_client = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($updated_client) {
        $profileId = (int)$updated_client['id'];
        $updated_client['profile_id'] = $profileId;
        $updated_client['client_id'] = $profileId;
        $updated_client['id'] = (int)$client_auth_id;
        $updated_client['role'] = 'client';
        if (!empty($updated_client['profile_pic'])) {
            $updated_client['profile_pic'] = '/' . ltrim($updated_client['profile_pic'], '/');
        }
        unset($updated_client['password']);
    }

    if (session_status() === PHP_SESSION_ACTIVE) {
        $_SESSION['last_activity'] = time();
    }

    require_once '../utils/notification-helper.php';
    createNotification($client_auth_id, "Your profile has been updated successfully.", 'profile_updated', $client_auth_id, 'client', 'client');

    $admin_id = getAdminUserId();
    if ($admin_id) {
        $client_name = $updated_client['business_name'] ?? $updated_client['name'];
        createClientProfileUpdatedNotification($admin_id, $client_auth_id, $client_name);
    }

    $pdo->commit();

    echo json_encode([
        'success' => true,
        'message' => 'Profile updated successfully',
        'user'    => $updated_client,
    ]);

} catch (PDOException $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database error: ' . $e->getMessage()]);
}
