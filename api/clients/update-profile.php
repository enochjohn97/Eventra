<?php
/**
 * Update Client Profile API
 */
header('Content-Type: application/json');
require_once '../../config/database.php';
require_once '../../includes/middleware/auth.php';

// Check authentication
$client_id = clientMiddleware();
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

$nin = $_POST['nin'] ?? null;
$bvn = $_POST['bvn'] ?? null;
$account_name = $_POST['account_name'] ?? null;
$account_number = $_POST['account_number'] ?? null;
$bank_name = $_POST['bank_name'] ?? null;

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

    // Fetch existing data for comparison and filling missing fields
    $stmt_existing = $pdo->prepare("SELECT business_name, nin, bvn FROM clients WHERE client_auth_id = ?");
    $stmt_existing->execute([$client_id]);
    $existing = $stmt_existing->fetch();
    
    if (empty($business_name) && $existing) {
        $business_name = $existing['business_name'];
    }

    // Dojah Mock Verification Logic
    $nin_verified = null;
    $bvn_verified = null;

    function verifyWithDojahMock($type, $number) {
        if (empty($number)) return 0;
        
        $protocol = isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? 'https' : 'http';
        $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
        
        // Construct the mock URL safely. Assuming this file is in api/clients and the mock is in api/admin
        $script_dir = dirname($_SERVER['SCRIPT_NAME']); // e.g., /api/clients
        $base_url = rtrim(dirname($script_dir), '/'); // e.g., /api
        $url = "$protocol://$host$base_url/admin/dojah-mock.php";
        
        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode(['type' => $type, 'number' => $number]));
        curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch, CURLOPT_TIMEOUT, 3);
        
        $result = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        
        if ($httpCode === 200 && $result) {
            $data = json_decode($result, true);
            if (isset($data['success']) && $data['success']) {
                return $data['data']['verified'] ? 1 : 0;
            }
        }
        
        // Fallback for local testing environments where cURL might fail
        $last_digit = substr(trim($number), -1);
        if ($last_digit === '1') return 1;
        if ($last_digit === '0') return 0;
        return (rand(1, 100) <= 80) ? 1 : 0;
    }

    $verify_updates = "";
    $verify_params = [];

    if ($existing) {
        if (!empty($nin) && $nin !== $existing['nin']) {
            $nin_verified = verifyWithDojahMock('nin', $nin);
            $verify_updates .= ", nin_verified = ?";
            $verify_params[] = $nin_verified;
        }
        if (!empty($bvn) && $bvn !== $existing['bvn']) {
            $bvn_verified = verifyWithDojahMock('bvn', $bvn);
            $verify_updates .= ", bvn_verified = ?";
            $verify_params[] = $bvn_verified;
        }
    }

    // Prepare Update Query
    $query = "UPDATE clients SET name = ?, business_name = ?, phone = ?, address = ?, city = ?, state = ?, country = ?, job_title = ?, company = ?, dob = ?, gender = ?, nin = ?, bvn = ?, account_name = ?, account_number = ?, bank_name = ?{$verify_updates}, updated_at = NOW()";
    // Use existing business_name if not provided so we don't null it out accidentally if it's required in some places
    $params = [$name, $business_name, $phone, $address, $city, $state, $country, $job_title, $company, $dob, $gender, $nin, $bvn, $account_name, $account_number, $bank_name];
    $params = array_merge($params, $verify_params);

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
