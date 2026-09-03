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

$stmt_existing = $pdo->prepare("SELECT * FROM users WHERE user_auth_id = ?");
$stmt_existing->execute([$user_auth_id]);
$existing = $stmt_existing->fetch() ?: [];

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
$dob     = isset($input['dob']) ? trim((string)$input['dob']) : ($existing['dob'] ?? '');
$gender  = isset($input['gender']) ? trim((string)$input['gender']) : ($existing['gender'] ?? '');

if (isset($input['email']) && trim((string)$input['email']) !== '') {
    $email = trim((string)$input['email']);
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        echo json_encode(['success' => false, 'message' => 'Invalid email address']);
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
            $mime = mime_content_type($_FILES['profile_pic']['tmp_name']);
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

    $query .= " WHERE user_auth_id = ?";
    $params[] = $user_auth_id;

    $stmt = $pdo->prepare($query);
    $stmt->execute($params);

    $stmt = $pdo->prepare("
        SELECT u.*, a.email, a.username, a.role
        FROM users u
        JOIN auth_accounts a ON u.user_auth_id = a.id
        WHERE u.user_auth_id = ?
    ");
    $stmt->execute([$user_auth_id]);
    $updated_user = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($updated_user) {
        $profileId = (int)$updated_user['id'];
        $updated_user['profile_id'] = $profileId;
        $updated_user['id'] = (int)$user_auth_id;
        $updated_user['role'] = 'user';
        if (!empty($updated_user['profile_pic']) && !preg_match('/^(https?:\/\/|data:)/i', $updated_user['profile_pic'])) {
            $updated_user['profile_pic'] = '/' . ltrim($updated_user['profile_pic'], '/');
        }
        unset($updated_user['password']);
    }

    if (session_status() === PHP_SESSION_ACTIVE) {
        $_SESSION['last_activity'] = time();
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
    echo json_encode(['success' => false, 'message' => 'Database error: ' . $e->getMessage()]);
}
