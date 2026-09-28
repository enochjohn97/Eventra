<?php

/**
 * Update User Profile API
 */

header('Content-Type: application/json');
require_once '../../config/database.php';
require_once '../../includes/middleware/auth.php';

$user_id = checkAuth('user');
$user_auth_id = getAuthId();

if (!$user_auth_id) {
    $stmt = $pdo->prepare("SELECT user_auth_id FROM users WHERE id = ?");
    $stmt->execute([$user_id]);
    $user_auth_id = $stmt->fetchColumn();
}

if (!$user_auth_id) {
    http_response_code(404);
    echo json_encode(['success' => false, 'message' => 'User profile not found']);
    exit;
}

$jsonBody = [];
$contentType = $_SERVER['CONTENT_TYPE'] ?? $_SERVER['HTTP_CONTENT_TYPE'] ?? '';
if (stripos($contentType, 'application/json') !== false) {
    $jsonBody = json_decode(file_get_contents('php://input'), true) ?? [];
}

$input = array_merge($_POST, $jsonBody);

$profile_id = $input['profile_id'] ?? $input['id'] ?? $user_id;
$custom_id = trim((string)($input['custom_id'] ?? ''));

$stmt_existing = $pdo->prepare("
    SELECT * FROM users 
    WHERE id = ? 
       OR (custom_id IS NOT NULL AND custom_id != '' AND custom_id = ?) 
       OR user_auth_id = ?
    LIMIT 1
");
$stmt_existing->execute([$profile_id, $custom_id, $user_auth_id]);
$existing = $stmt_existing->fetch() ?: [];

if (!$existing) {
    http_response_code(404);
    echo json_encode(['success' => false, 'message' => 'User profile not found']);
    exit;
}

$targetProfileId = (int)$existing['id'];
$user_auth_id = $existing['user_auth_id'];

$name    = isset($input['name']) && trim((string)$input['name']) !== '' ? trim((string)$input['name']) : ($existing['name'] ?? '');
$phone   = isset($input['phone']) ? trim((string)$input['phone']) : ($existing['phone'] ?? '');

// Validate phone: max 11 digits, digits only
if ($phone !== '' && (!ctype_digit($phone) || strlen($phone) > 11)) {
    echo json_encode(['success' => false, 'message' => 'Phone number must be numeric and at most 11 digits.']);
    exit;
}

$address = isset($input['address']) ? trim((string)$input['address']) : ($existing['address'] ?? '');
$city    = isset($input['city']) ? trim((string)$input['city']) : ($existing['city'] ?? '');
$state   = isset($input['state']) ? trim((string)$input['state']) : ($existing['state'] ?? '');
$country = isset($input['country']) ? trim((string)$input['country']) : ($existing['country'] ?? '');

// Location fields must be text-only (no digits/symbols beyond spacing & basic punctuation)
$locationTextOnly = fn(string $v): bool => $v === '' || (bool)preg_match("/^[A-Za-z\x{00C0}-\x{00D6}\x{00D8}-\x{00F6}\x{00F8}-\x{00FF}][A-Za-z\x{00C0}-\x{00D6}\x{00D8}-\x{00F6}\x{00F8}-\x{00FF}' .,\-]*$/u", $v);
foreach (['city' => $city, 'state' => $state, 'country' => $country] as $locField => $locValue) {
    if (!$locationTextOnly($locValue)) {
        echo json_encode(['success' => false, 'message' => ucfirst($locField) . ' must contain letters only (no numbers or symbols).']);
        exit;
    }
}
$dob     = isset($input['dob']) ? trim((string)$input['dob']) : ($existing['dob'] ?? '');
$gender  = isset($input['gender']) ? trim((string)$input['gender']) : ($existing['gender'] ?? '');

// Full name + gender must be text-only (no digits, no symbols beyond
// letters, spaces, apostrophes, periods and hyphens).
$nameGenderTextOnly = fn(string $v): bool => $v === '' || (bool)preg_match("/^[A-Za-z\x{00C0}-\x{00D6}\x{00D8}-\x{00F6}\x{00F8}-\x{00FF}][A-Za-z\x{00C0}-\x{00D6}\x{00D8}-\x{00F6}\x{00F8}-\x{00FF}'. -]*$/u", $v);
foreach (['name' => $name, 'gender' => $gender] as $textField => $textValue) {
    if (!$nameGenderTextOnly($textValue)) {
        echo json_encode(['success' => false, 'message' => ucfirst($textField) . ' must contain letters only (no digits or symbols).']);
        exit;
    }
}

if (isset($input['email']) && trim((string)$input['email']) !== '') {
    $email = trim((string)$input['email']);
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        echo json_encode(['success' => false, 'message' => 'Invalid email address']);
        exit;
    }
    $duplicate = $pdo->prepare(
        'SELECT id FROM auth_accounts WHERE email = ? AND id <> ? AND deleted_at IS NULL LIMIT 1'
    );
    $duplicate->execute([$email, $user_auth_id]);
    if ($duplicate->fetchColumn()) {
        echo json_encode(['success' => false, 'message' => 'That email is already linked to another account.']);
        exit;
    }
    $pdo->prepare('UPDATE auth_accounts SET email = ? WHERE id = ?')->execute([$email, $user_auth_id]);
}

if ($name === '') {
    echo json_encode(['success' => false, 'message' => 'Name is required']);
    exit;
}

try {
    $pdo->beginTransaction();


    $profile_pic = null;
    if (isset($_FILES['profile_pic']) && $_FILES['profile_pic']['error'] === UPLOAD_ERR_OK) {
        $file_ext = strtolower(pathinfo($_FILES['profile_pic']['name'], PATHINFO_EXTENSION));
        $allowed_exts = ['jpg', 'jpeg', 'png', 'gif'];

        if (in_array($file_ext, $allowed_exts)) {
            // mime_content_type() may be undefined (no fileinfo extension) —
            // use finfo, then fall back to the extension map.
            if (function_exists('mime_content_type')) {
                $mime = mime_content_type($_FILES['profile_pic']['tmp_name']);
            } elseif (function_exists('finfo_open')) {
                $finfo = finfo_open(FILEINFO_MIME_TYPE);
                $mime = $finfo ? finfo_file($finfo, $_FILES['profile_pic']['tmp_name']) : null;
                if ($finfo) finfo_close($finfo);
            } else {
                $mime = null;
            }
            if (!$mime) {
                $mime_map = ['jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'png' => 'image/png', 'gif' => 'image/gif'];
                $mime = $mime_map[$file_ext] ?? 'image/png';
            }
            $base64 = base64_encode(file_get_contents($_FILES['profile_pic']['tmp_name']));
            $profile_pic = 'data:' . $mime . ';base64,' . $base64;
        }
    }

    $query = "UPDATE users SET name = ?, phone = ?, address = ?, city = ?, state = ?, country = ?, dob = ?, gender = ?, updated_at = NOW()";
    $params = [
        $name,
        $phone !== '' ? $phone : null,
        $address !== '' ? $address : null,
        $city !== '' ? $city : null,
        $state !== '' ? $state : null,
        $country !== '' ? $country : null,
        $dob !== '' ? $dob : null,
        $gender !== '' ? $gender : null,
    ];

    if ($profile_pic) {
        $query .= ", profile_pic = ?";
        $params[] = $profile_pic;
    }

    $query .= " WHERE id = ?";
    $params[] = $targetProfileId;

    $stmt = $pdo->prepare($query);
    $stmt->execute($params);

    $stmt = $pdo->prepare("
        SELECT u.*, a.email, a.username, a.role
        FROM users u
        JOIN auth_accounts a ON u.user_auth_id = a.id
        WHERE u.id = ?
    ");
    $stmt->execute([$targetProfileId]);
    $updated_user = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($updated_user) {
        $profileId = (int)$updated_user['id'];
        $updated_user['profile_id'] = $profileId;
        $updated_user['id'] = (int)$user_auth_id;
        $updated_user['role'] = 'user';
        if (!empty($updated_user['profile_pic']) && !preg_match('/^(https?:\/\/|data:)/i', $updated_user['profile_pic'])) {
            $updated_user['profile_pic'] = '/' . ltrim($updated_user['profile_pic'], '/');
        }
        $updated_user['profile_image'] = $updated_user['profile_pic'];
        unset($updated_user['password']);
    }

    if (session_status() === PHP_SESSION_ACTIVE) {
        $_SESSION['last_activity'] = time();
        $_SESSION['user_name'] = $name;
        $_SESSION['user_id'] = $targetProfileId;
    }

    $pdo->commit();

    try {
        require_once '../utils/notification-helper.php';
        createNotification($user_auth_id, "Your profile has been updated successfully.", 'profile_updated', $user_auth_id);
    } catch (Throwable $e) {
        error_log("Profile updated but failed to send notification: " . $e->getMessage());
    }

    echo json_encode([
        'success' => true,
        'message' => 'Profile updated successfully',
        'user' => $updated_user
    ]);
} catch (PDOException $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database error. Please try again or contact support if it persists.']);
}
