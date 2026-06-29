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



$stmt_existing = $pdo->prepare("SELECT * FROM users WHERE user_auth_id = ?");
$stmt_existing->execute([$user_auth_id]);
$existing = $stmt_existing->fetch() ?: [];

$name    = isset($_POST['name']) && trim($_POST['name']) !== '' ? trim($_POST['name']) : ($existing['name'] ?? '');
$phone   = isset($_POST['phone']) ? trim($_POST['phone']) : ($existing['phone'] ?? '');
$address = isset($_POST['address']) ? trim($_POST['address']) : ($existing['address'] ?? '');
$city    = isset($_POST['city']) ? trim($_POST['city']) : ($existing['city'] ?? '');
$state   = isset($_POST['state']) ? trim($_POST['state']) : ($existing['state'] ?? '');
$country = isset($_POST['country']) ? trim($_POST['country']) : ($existing['country'] ?? '');
$dob     = isset($_POST['dob']) ? trim($_POST['dob']) : ($existing['dob'] ?? '');
$gender  = isset($_POST['gender']) ? trim($_POST['gender']) : ($existing['gender'] ?? '');

if ($name === '') {
    echo json_encode(['success' => false, 'message' => 'Name is required']);
    exit;
}

try {
    $pdo->beginTransaction();

    $profile_pic = null;
    if (isset($_FILES['profile_pic']) && $_FILES['profile_pic']['error'] === UPLOAD_ERR_OK) {
        $upload_dir = '../../uploads/profiles/';
        if (!is_dir($upload_dir)) {
            mkdir($upload_dir, 0755, true);
        }

        $file_ext = strtolower(pathinfo($_FILES['profile_pic']['name'], PATHINFO_EXTENSION));
        $allowed_exts = ['jpg', 'jpeg', 'png', 'gif'];

        if (in_array($file_ext, $allowed_exts)) {
            $new_filename = 'user_' . $user_id . '_' . time() . '.' . $file_ext;
            $upload_path = $upload_dir . $new_filename;

            if (move_uploaded_file($_FILES['profile_pic']['tmp_name'], $upload_path)) {
                $profile_pic = 'uploads/profiles/' . $new_filename;
            }
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
        if (!empty($updated_user['profile_pic']) && !preg_match('/^https?:\/\//i', $updated_user['profile_pic'])) {
            $updated_user['profile_pic'] = '/' . ltrim($updated_user['profile_pic'], '/');
        }
        unset($updated_user['password']);
    }

    if (session_status() === PHP_SESSION_ACTIVE) {
        $_SESSION['last_activity'] = time();
    }

    require_once '../utils/notification-helper.php';
    createNotification($user_auth_id, "Your profile has been updated successfully.", 'profile_updated', $user_auth_id);

    $pdo->commit();

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
