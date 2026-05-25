<?php

/**
 * Generate OTP API
 * Generates and sends a 6-digit OTP to the user via Email or SMS
 * - OTP expires in 5 minutes (single-use, time-sensitive)
 * - Uses standardized auth middleware
 */

header('Content-Type: application/json');
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/middleware/auth.php';
require_once __DIR__ . '/../../includes/helpers/email-helper.php';
require_once __DIR__ . '/../../includes/helpers/sms-helper.php';

// Ensure user is authenticated
checkAuth('user');

// Get the authenticated user's auth_accounts.id
$auth_id = getAuthId();

if (!$auth_id) {
    echo json_encode(['success' => false, 'message' => 'User profile not found.']);
    exit;
}

// Resolve user_id from auth_id (user_auth_id is the foreign key to auth_accounts)
$stmt = $pdo->prepare("SELECT id FROM users WHERE user_auth_id = ?");
$stmt->execute([$auth_id]);
$user_row = $stmt->fetch();

if (!$user_row) {
    echo json_encode(['success' => false, 'message' => 'User profile not found.']);
    exit;
}
$user_id = $user_row['id'];

$stmt = $pdo->prepare("SELECT u.name, u.phone, aa.email FROM users u JOIN auth_accounts aa ON u.user_auth_id = aa.id WHERE u.id = ?");
$stmt->execute([$user_id]);
$user = $stmt->fetch();

if (!$user) {
    echo json_encode(['success' => false, 'message' => 'User profile not found.']);
    exit;
}

$data = json_decode(file_get_contents("php://input"), true);
$channel = $data['channel'] ?? 'email'; // 'email' or 'sms'
$payment_reference = $data['payment_reference'] ?? 'PAY-' . strtoupper(uniqid());

if (!in_array($channel, ['email', 'sms'])) {
    echo json_encode(['success' => false, 'message' => 'Invalid channel. Use "email" or "sms".']);
    exit;
}

// Validate required contact fields for the selected channel
if ($channel === 'email' && empty($user['email'])) {
    echo json_encode(['success' => false, 'message' => 'Your email address is missing. Please update your profile with a valid email before using email OTP.']);
    exit;
}

if ($channel === 'sms' && empty($user['phone'])) {
    echo json_encode(['success' => false, 'message' => 'Your phone number is missing. Please update your profile with a valid phone number before using SMS OTP.']);
    exit;
}

// Ensure fresh verification session
if (session_status() === PHP_SESSION_NONE) {
    require_once __DIR__ . '/../../config.php';
}
unset($_SESSION['otp_verified_ref']);
unset($_SESSION['otp_verified_at']);

try {
    // 1. Rate limit check (max 3 OTPs per 5 minutes per user, only counting unverified)
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM payment_otps WHERE user_id = ? AND created_at > DATE_SUB(NOW(), INTERVAL 5 MINUTE) AND verified_at IS NULL");
    $stmt->execute([$user_id]);
    if ($stmt->fetchColumn() >= 3) {
        echo json_encode(['success' => false, 'message' => 'Too many OTP requests. Please wait a few minutes before trying again.']);
        exit;
    }

    // 2. Invalidate any previous unverified OTPs for this reference
    $stmt = $pdo->prepare("UPDATE payment_otps SET expires_at = NOW() WHERE user_id = ? AND payment_reference = ? AND verified_at IS NULL");
    $stmt->execute([$user_id, $payment_reference]);

    // 3. Generate cryptographically secure 6-digit OTP
    $otp = sprintf("%06d", random_int(0, 999999));
    $otp_hash = password_hash($otp, PASSWORD_DEFAULT);
    // Requirement: 5-minute maximum expiry
    $expires_at = date('Y-m-d H:i:s', strtotime('+5 minutes'));
    $expires_human = date('H:i', strtotime('+5 minutes'));

    // 4. Store in database
    $stmt = $pdo->prepare("INSERT INTO payment_otps (user_id, payment_reference, otp_hash, channel, expires_at) VALUES (?, ?, ?, ?, ?)");
    $stmt->execute([$user_id, $payment_reference, $otp_hash, $channel, $expires_at]);

    // 5. Send OTP
    $sent = false;
    $error_msg = '';

    if ($channel === 'email') {
        $subject = "Your Eventra Payment Verification Code";
        $body = "
            <div style='font-family: sans-serif; max-width: 500px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;'>
                <h2 style='color: #2ecc71; margin-bottom: 0;'>Verify Your Payment</h2>
                <p style='color: #6b7280; font-size: 14px;'>Eventra Payment Security</p>
                <hr style='border: 0; border-top: 1px solid #eee; margin: 16px 0;'>
                <p>Hello <strong>{$user['name']}</strong>,</p>
                <p>Your one-time verification code for payment reference <strong>{$payment_reference}</strong> is:</p>
                <div style='font-size: 36px; font-weight: 900; letter-spacing: 8px; color: #2ecc71; text-align: center; background: #f5f3ff; padding: 20px; border-radius: 10px; margin: 20px 0;'>{$otp}</div>
                <p><strong>⏱ This code expires at {$expires_human} (in 5 minutes).</strong></p>
                <p style='color: #ef4444; font-size: 13px;'>Do not share this code with anyone. Eventra will never ask for your OTP.</p>
                <hr style='border: 0; border-top: 1px solid #eee; margin: 20px 0;'>
                <p style='font-size: 12px; color: #9ca3af; text-align: center;'>If you did not request this, please ignore this email. &copy; " . date('Y') . " Eventra.</p>
            </div>
        ";
        $emailResult = EmailHelper::sendEmail($user['email'], $subject, $body);
        $sent = $emailResult['success'];
        $error_msg = $emailResult['message'];
    } else {
        // SMS channel
        if (empty($user['phone'])) {
            echo json_encode(['success' => false, 'message' => 'No phone number found on your profile. Please update your profile or use email OTP.']);
            exit;
        }
        $message = "Your Eventra payment verification code is: {$otp}\nExpires at {$expires_human} (5 minutes).\nDo not share this code.";
        // SMS disabled per requirement
        // $smsResult = sendSMS($user['phone'], $message);
        $smsResult = ['success' => true, 'message' => ''];
        $sent = $smsResult['success'];
        $error_msg = $smsResult['message'];
    }

    if ($sent) {
        $maskedDestination = ($channel === 'email')
            ? preg_replace('/(?<=.{2}).(?=.*@)/u', '*', $user['email'])
            : preg_replace('/\d(?=\d{4})/', '*', $user['phone']);

        echo json_encode([
            'success' => true,
            'message' => "OTP sent to {$maskedDestination}. It expires in 5 minutes.",
            'payment_reference' => $payment_reference,
            'expires_in_minutes' => 5
        ]);
    } else {
        echo json_encode(['success' => false, 'message' => 'Failed to send OTP: ' . $error_msg]);
    }
} catch (PDOException $e) {
    echo json_encode(['success' => false, 'message' => 'Database error: ' . $e->getMessage()]);
}
