<?php
/**
 * Generate OTP API
 * Generates and sends a 6-digit OTP to the user via Email or SMS
 */
header('Content-Type: application/json');
require_once '../../config/database.php';
require_once '../../includes/helpers/email-helper.php';
require_once '../../includes/helpers/sms-helper.php';

// Check authentication
if (!isset($_SESSION['user_id'])) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Unauthorized']);
    exit;
}

$user_id = $_SESSION['user_id'];
$data = json_decode(file_get_contents("php://input"), true);
$channel = $data['channel'] ?? 'email'; // 'email' or 'sms'
$payment_reference = $data['payment_reference'] ?? 'PAY-' . strtoupper(uniqid());

if (!in_array($channel, ['email', 'sms'])) {
    echo json_encode(['success' => false, 'message' => 'Invalid channel']);
    exit;
}

try {
    // 1. Get user details
    $stmt = $pdo->prepare("SELECT email, phone, name FROM users WHERE id = ?");
    $stmt->execute([$user_id]);
    $user = $stmt->fetch();

    if (!$user) {
        echo json_encode(['success' => false, 'message' => 'User not found']);
        exit;
    }

    // 2. Rate limit check (e.g., max 3 OTPs per 5 minutes per user)
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM payment_otps WHERE user_id = ? AND created_at > DATE_SUB(NOW(), INTERVAL 5 MINUTE)");
    $stmt->execute([$user_id]);
    if ($stmt->fetchColumn() >= 3) {
        echo json_encode(['success' => false, 'message' => 'Too many OTP requests. Please try again later.']);
        exit;
    }

    // 3. Generate 6-digit OTP
    $otp = sprintf("%06d", mt_rand(0, 999999));
    $otp_hash = password_hash($otp, PASSWORD_DEFAULT);
    $expires_at = date('Y-m-d H:i:s', strtotime('+10 minutes'));

    // 4. Store in database
    $stmt = $pdo->prepare("INSERT INTO payment_otps (user_id, payment_reference, otp_hash, channel, expires_at) VALUES (?, ?, ?, ?, ?)");
    $stmt->execute([$user_id, $payment_reference, $otp_hash, $channel, $expires_at]);

    // 5. Send OTP
    $sent = false;
    $error_msg = '';

    if ($channel === 'email') {
        $subject = "Your Eventra Verification Code";
        $body = "
            <div style='font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 10px;'>
                <h2 style='color: #ff5a5f;'>Verify Your Payment</h2>
                <p>Hello <strong>{$user['name']}</strong>,</p>
                <p>Your verification code for payment reference <strong>{$payment_reference}</strong> is:</p>
                <div style='font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #333; margin: 20px 0; text-align: center;'>{$otp}</div>
                <p>This code will expire in 10 minutes. If you did not request this, please ignore this email.</p>
                <hr style='border: 0; border-top: 1px solid #eee; margin: 20px 0;'>
                <p style='font-size: 12px; color: #666;'>© " . date('Y') . " Eventra. All rights reserved.</p>
            </div>
        ";
        $emailResult = sendEmail($user['email'], $subject, $body);
        $sent = $emailResult['success'];
        $error_msg = $emailResult['message'];
    } else {
        if (empty($user['phone'])) {
            echo json_encode(['success' => false, 'message' => 'Phone number not found in profile']);
            exit;
        }
        $message = "Your Eventra verification code is: {$otp}. Valid for 10 minutes.";
        $smsResult = sendSMS($user['phone'], $message);
        $sent = $smsResult['success'];
        $error_msg = $smsResult['message'];
    }

    if ($sent) {
        echo json_encode([
            'success' => true,
            'message' => 'OTP sent successfully',
            'payment_reference' => $payment_reference
        ]);
    } else {
        echo json_encode(['success' => false, 'message' => 'Failed to send OTP: ' . $error_msg]);
    }

} catch (PDOException $e) {
    echo json_encode(['success' => false, 'message' => 'Database error: ' . $e->getMessage()]);
}
