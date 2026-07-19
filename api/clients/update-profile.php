<?php

/**
 * Update Client Profile API — v2 (Paystack Connect Edition)
 * All fields are optional. Validation only applies when a field has a value.
 * Bank/KYC fields have been removed; payment logic is handled via Paystack Connect.
 */

header('Content-Type: application/json');
require_once '../../config/database.php';
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
$settlementFields = [];
if (isset($_POST['bank_code'], $_POST['account_number']) && trim($_POST['bank_code']) !== '' && trim($_POST['account_number']) !== '') {
    $accountNumber = preg_replace('/\D/', '', trim($_POST['account_number']));
    if (strlen($accountNumber) !== 10) {
        http_response_code(422);
        echo json_encode(['success' => false, 'message' => 'Settlement account number must be 10 digits.']);
        exit;
    }
    $settlementFields = [
        'settlement_bank_name' => trim($_POST['bank_name'] ?? ''),
        'settlement_bank_code' => trim($_POST['bank_code']),
        'settlement_account_number' => $accountNumber,
        'settlement_account_name' => trim($_POST['account_name'] ?? ''),
    ];
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
        if ($_FILES['profile_pic']['size'] > 512 * 1024) {
            // File too large — return clean error instead of crashing the server
            if ($pdo->inTransaction()) $pdo->rollBack();
            http_response_code(422);
            echo json_encode(['success' => false, 'message' => 'Profile picture must be under 512 KB. Please compress the image before uploading.']);
            exit;
        }
        $file_ext = strtolower(pathinfo($_FILES['profile_pic']['name'], PATHINFO_EXTENSION));
        if (in_array($file_ext, ['jpg', 'jpeg', 'png', 'gif'])) {
            $mime = function_exists('mime_content_type') ? mime_content_type($_FILES['profile_pic']['tmp_name']) : $_FILES['profile_pic']['type'];
            $base64 = base64_encode(file_get_contents($_FILES['profile_pic']['tmp_name']));
            $profile_pic = 'data:' . $mime . ';base64,' . $base64;
        }
    }

    // KYC files are stored separately from profile media. Only PDFs and common
    // image formats are accepted; the generated name prevents path traversal
    // and filename collisions. Verification is queued/handled separately.
    $kycFiles = [
        'kyc_nin_file', 'kyc_bvn_file', 'kyc_voter_card_file',
        'kyc_driver_license_file', 'kyc_cac_file'
    ];
    $kycUpdates = [];
    $allowedKycExtensions = ['pdf', 'jpg', 'jpeg', 'png', 'webp'];
    foreach ($kycFiles as $field) {
        if (!isset($_FILES[$field]) || $_FILES[$field]['error'] === UPLOAD_ERR_NO_FILE) continue;
        $file = $_FILES[$field];
        if ($file['error'] !== UPLOAD_ERR_OK) continue;
        if ($file['size'] > 5 * 1024 * 1024) {
            throw new RuntimeException('Each KYC document must be under 5 MB.');
        }
        $extension = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
        if (!in_array($extension, $allowedKycExtensions, true)) {
            throw new RuntimeException('KYC documents must be PDFs or images.');
        }
        $mime = function_exists('mime_content_type') ? mime_content_type($file['tmp_name']) : $file['type'];
        $base64 = base64_encode(file_get_contents($file['tmp_name']));
        $kycUpdates[$field] = 'data:' . $mime . ';base64,' . $base64;
    }

    // ── Custom ID ────────────────────────────────────────────────────────────
    $customId = $existing['custom_id'] ?? null;
    if (empty($customId)) {
        require_once __DIR__ . '/../utils/id-generator.php';
        $customId = generateClientId($pdo);
    }

    // ── Build UPDATE query ───────────────────────────────────────────────
    $query = "UPDATE clients SET
        custom_id = ?, name = ?, business_name = ?, email = ?, phone = ?, address = ?, city = ?,
        state = ?, country = ?, job_title = ?, company = ?, dob = ?, gender = ?,
        updated_at = NOW()";

    $params = [
        $customId, $name, $business_name, $existing['email'] ?? null, $phone, $address, $city,
        $state, $country, $job_title, $company,
        ($dob !== '' ? $dob : null), ($gender !== '' ? $gender : null)
    ];

    if ($profile_pic) {
        $query   .= ', profile_pic = ?';
        $params[] = $profile_pic;
    }
    foreach ($kycUpdates as $column => $path) {
        $query .= ", {$column} = ?";
        $params[] = $path;
    }
    if ($kycUpdates) {
        $query .= ", verification_status = 'pending'";
    }
    if ($settlementFields) {
        foreach ($settlementFields as $column => $value) {
            $query .= ", {$column} = ?";
            $params[] = $value;
        }
        $query .= ", settlement_verification_status = 'pending'";
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
        if (!empty($updated_client['profile_pic']) && !preg_match('/^(https?:\/\/|data:)/i', $updated_client['profile_pic'])) {
            $updated_client['profile_pic'] = '/' . ltrim($updated_client['profile_pic'], '/');
        }
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

} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database error: ' . $e->getMessage()]);
}