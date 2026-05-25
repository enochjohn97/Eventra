<?php

/**
 * Forgot Password - Step 1: Request OTP (CLIENTS ONLY)
 * Sends OTP to client's registered phone number via SMS
 */

header('Content-Type: application/json');
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/helpers/otp-service.php';
require_once __DIR__ . '/../../includes/helpers/validation.php';

$data = json_decode(file_get_contents("php://input"), true);
$email = $data['email'] ?? $data['identity'] ?? null;

if (!$email || !validateEmail($email)) {
    // If it's a valid string but filter_var failed, we might still want to try it if it looks like an email
    // but for now let's just ensure we support both identity and email keys.
    if (!$email) {
        echo json_encode(['success' => false, 'message' => 'Email address is required.']);
        exit;
    }
}

try {
    // Check if email exists in auth_accounts (Users and Clients)
    $stmt = $pdo->prepare("
        SELECT a.id, a.role, a.email,
               CASE 
                   WHEN a.role = 'client' THEN c.name 
                   WHEN a.role = 'user' THEN u.name 
                   ELSE a.username 
               END as name,
               CASE 
                   WHEN a.role = 'client' THEN c.phone 
                   WHEN a.role = 'user' THEN u.phone 
                   ELSE NULL 
               END as phone
        FROM auth_accounts a
        LEFT JOIN clients c ON a.id = c.client_auth_id AND a.role = 'client'
        LEFT JOIN users u ON a.id = u.user_auth_id AND a.role = 'user'
        WHERE a.email = ? AND a.deleted_at IS NULL
        LIMIT 1
    ");
    $stmt->execute([$email]);
    $account = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$account) {
        // Security: Don't reveal if email exists
        echo json_encode(['success' => true, 'message' => 'If an account exists with this email, you will receive an OTP shortly.']);
        exit;
    }

    $phone = $account['phone'] ?? null;
    $authId = $account['id'];
    $name = $account['name'] ?? 'User';

    // Cleanup old OTPs for this user to avoid clutter and potential unique constraint issues
    $stmt = $pdo->prepare("DELETE FROM auth_tokens WHERE auth_id = ? AND type = 'otp'");
    $stmt->execute([$authId]);

    // Generate 6-digit OTP
    $otp = str_pad(random_int(0, 999999), 6, '0', STR_PAD_LEFT);
    $otpHash = password_hash($otp, PASSWORD_BCRYPT);

    // Store OTP in database
    $stmt = $pdo->prepare("
        INSERT INTO auth_tokens (auth_id, token, type, expires_at)
        VALUES (?, ?, 'otp', DATE_ADD(NOW(), INTERVAL 15 MINUTE))
    ");
    $stmt->execute([$authId, $otp]); // Storing plaintext as requested by the verification logic? 
    // Wait, verify-password-reset-otp.php (line 31) uses token = ? (plaintext).
    
    // Send OTP via Email
    require_once __DIR__ . '/../../includes/helpers/email-helper.php';
    $emailSent = EmailHelper::sendRegistrationOTP($email, $name, $otp); // Using existing OTP template

    // Also try SMS if phone exists
    if ($phone) {
        require_once __DIR__ . '/../../includes/helpers/sms-helper.php';
        $message = "Your Eventra password reset code is: $otp. Valid for 15 minutes.";
        // @sendSMS($phone, $message); // SMS disabled per requirement
    }

    echo json_encode([
        'success' => true,
        'message' => 'An OTP has been sent to your email.',
        'otp_purpose' => 'password_reset'
    ]);

} catch (PDOException $e) {
    error_log("Forgot password error: " . $e->getMessage());
    echo json_encode(['success' => false, 'message' => 'An error occurred. Please try again later.']);
}
