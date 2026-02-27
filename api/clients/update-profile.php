<?php
/**
 * Update Client Profile API
 */
header('Content-Type: application/json');
require_once '../../config/database.php';

// Check authentication
if (!isset($_SESSION['client_id']) || ($_SESSION['user_role'] ?? $_SESSION['role']) !== 'client') {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Unauthorized']);
    exit;
}

$client_id = $_SESSION['client_id'];
$name = $_POST['name'] ?? null;
$business_name = $_POST['business_name'] ?? null;
$phone = $_POST['phone'] ?? null;
$address = $_POST['address'] ?? null;
$city = $_POST['city'] ?? null;
$state = $_POST['state'] ?? null;
$country = $_POST['country'] ?? null;
$job_title = $_POST['job_title'] ?? null;
$company = $_POST['company'] ?? null;
$dob = $_POST['dob'] ?? null;
$gender = $_POST['gender'] ?? null;

if (empty($name)) {
    echo json_encode(['success' => false, 'message' => 'Name is required']);
    exit;
}

try {
    $pdo->beginTransaction();

    // Check if trying to update business name and if it exists
    if (!empty($business_name)) {
        $stmt = $pdo->prepare("SELECT id FROM clients WHERE business_name = ? AND client_auth_id != ? AND deleted_at IS NULL");
        $stmt->execute([$business_name, $client_id]);
        if ($stmt->fetch()) {
            $pdo->rollBack();
            echo json_encode(['success' => false, 'message' => 'Business name already in use']);
            exit;
        }
    }

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
            $new_filename = 'client_' . $client_id . '_' . time() . '.' . $file_ext;
            $upload_path = $upload_dir . $new_filename;

            if (move_uploaded_file($_FILES['profile_pic']['tmp_name'], $upload_path)) {
                $profile_pic = 'uploads/profiles/' . $new_filename;
            }
        }
    }

    // Fetch existing data to fill missing required fields if not provided
    if (empty($business_name)) {
        $stmt_existing = $pdo->prepare("SELECT business_name FROM clients WHERE client_auth_id = ?");
        $stmt_existing->execute([$client_id]);
        $existing = $stmt_existing->fetch();
        if ($existing) {
            $business_name = $existing['business_name'];
        }
    }

    // Prepare Update Query
    $query = "UPDATE clients SET name = ?, business_name = ?, phone = ?, address = ?, city = ?, state = ?, country = ?, job_title = ?, company = ?, dob = ?, gender = ?, updated_at = NOW()";
    // Use existing business_name if not provided so we don't null it out accidentally if it's required in some places
    $params = [$name, $business_name, $phone, $address, $city, $state, $country, $job_title, $company, $dob, $gender];

    if ($profile_pic) {
        $query .= ", profile_pic = ?";
        $params[] = $profile_pic;
    }

    $query .= " WHERE client_auth_id = ?";
    $params[] = $client_id;

    $stmt = $pdo->prepare($query);
    $stmt->execute($params);

    // Fetch updated client data to return
    $stmt = $pdo->prepare("
        SELECT c.*, a.email 
        FROM clients c 
        JOIN auth_accounts a ON c.client_auth_id = a.id 
        WHERE c.client_auth_id = ?
    ");
    $stmt->execute([$client_id]);
    $updated_client = $stmt->fetch(PDO::FETCH_ASSOC);

    // Format for frontend
    if ($updated_client) {
        $updated_client['role'] = 'client';
        if ($updated_client['profile_pic']) {
            $updated_client['profile_pic'] = '/' . $updated_client['profile_pic'];
        }
        // Remove password hash from array before sending
        unset($updated_client['password']);
    }

    // Refresh session activity to ensure profile updates count as user activity
    if (session_status() === PHP_SESSION_ACTIVE) {
        $_SESSION['last_activity'] = time();
    }

    // Notify user about profile update using helper
    require_once '../utils/notification-helper.php';
    createNotification($client_id, "Your profile has been updated successfully.", 'profile_updated', $client_id);

    $pdo->commit();

    echo json_encode([
        'success' => true,
        'message' => 'Profile updated successfully',
        'user' => $updated_client
    ]);

} catch (PDOException $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database error: ' . $e->getMessage()]);
}
