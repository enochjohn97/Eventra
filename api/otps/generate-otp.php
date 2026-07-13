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
require_once __DIR__ . '/../../includes/helpers/response-helper.php';

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
    require_once __DIR__ . '/../../server/config.php';
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
    $otp_hash = hash_hmac('sha256', $otp, 'eventra-payment-otp-' . $user_id);
    // Requirement: 5-minute maximum expiry
    $expires_at = date('Y-m-d H:i:s', strtotime('+5 minutes'));
    $expires_human = date('H:i', strtotime('+5 minutes'));

    // 4. Store in database
    $stmt = $pdo->prepare("INSERT INTO payment_otps (user_id, payment_reference, otp_hash, channel, expires_at) VALUES (?, ?, ?, ?, ?)");
    $stmt->execute([$user_id, $payment_reference, $otp_hash, $channel, $expires_at]);

    $maskedDestination = ($channel === 'email')
        ? preg_replace('/(?<=.{2}).(?=.*@)/u', '*', $user['email'])
        : preg_replace('/\d(?=\d{4})/', '*', $user['phone']);

    $deliveryChannel = $channel;
    $deliveryUser = $user;
    $deliveryOtp = $otp;

    finishResponseThen(json_encode([
        'success' => true,
        'message' => "OTP sent to {$maskedDestination}. It expires in 5 minutes.",
        'payment_reference' => $payment_reference,
        'expires_in_minutes' => 5
    ]), function () use ($deliveryChannel, $deliveryUser, $deliveryOtp) {
        if ($deliveryChannel === 'email') {
            EmailHelper::sendVerificationOTP(
                $deliveryUser['email'],
                $deliveryUser['name'] ?? 'User',
                $deliveryOtp,
                'complete your payment',
                5
            );
        } else {
            sendSMS($deliveryUser['phone'], "Your Eventra payment verification code is {$deliveryOtp}. It expires in 5 minutes.");
        }
    });
} catch (PDOException $e) {
    echo json_encode(['success' => false, 'message' => 'Database error: ' . $e->getMessage()]);
}
