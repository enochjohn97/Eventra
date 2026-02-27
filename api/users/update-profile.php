<?php
/**
 * Update User Profile API
 */
header('Content-Type: application/json');
require_once '../../config/database.php';

// Check authentication
if (!isset($_SESSION['user_id']) || ($_SESSION['user_role'] ?? $_SESSION['role']) !== 'user') {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Unauthorized']);
    exit;
}

$user_id = $_SESSION['user_id'];
$name = $_POST['name'] ?? null;
$phone = $_POST['phone'] ?? null;
$address = $_POST['address'] ?? null;
$city = $_POST['city'] ?? null;
$state = $_POST['state'] ?? null;
$country = $_POST['country'] ?? null;
$dob = $_POST['dob'] ?? null;
$gender = $_POST['gender'] ?? null;

if (empty($name)) {
    echo json_encode(['success' => false, 'message' => 'Name is required']);
    exit;
}

try {
    $pdo->beginTransaction();

    // Handle Profile Picture Upload
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

    // Prepare Update Query
    $query = "UPDATE users SET name = ?, phone = ?, address = ?, city = ?, state = ?, country = ?, dob = ?, gender = ?";
    $params = [$name, $phone, $address, $city, $state, $country, $dob ?: null, $gender ?: null];

    if ($profile_pic) {
        $query .= ", profile_pic = ?";
        $params[] = $profile_pic;
    }

    $query .= " WHERE user_auth_id = ?";
    $params[] = $user_id;

    $stmt = $pdo->prepare($query);
    $stmt->execute($params);

    // Fetch updated user data to return
    $stmt = $pdo->prepare("
        SELECT u.*, a.email 
        FROM users u 
        JOIN auth_accounts a ON u.user_auth_id = a.id 
        WHERE u.user_auth_id = ?
    ");
    $stmt->execute([$user_id]);
    $updated_user = $stmt->fetch(PDO::FETCH_ASSOC);

    // Format for frontend
    if ($updated_user) {
        $updated_user['role'] = 'user';
        if ($updated_user['profile_pic']) {
            $updated_user['profile_pic'] = '/' . $updated_user['profile_pic'];
        }
    }

    // Refresh session activity
    if (session_status() === PHP_SESSION_ACTIVE) {
        $_SESSION['last_activity'] = time();
    }

    // Notify user about profile update using helper
    require_once '../utils/notification-helper.php';
    createNotification($user_id, "Your profile has been updated successfully.", 'profile_updated', $user_id);

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
