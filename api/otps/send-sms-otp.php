<?php
/**
 * Send SMS OTP API
 * Rate-limited: 5 OTPs per minute per phone number.
 * OTP expires in 5 minutes.
 */

header('Content-Type: application/json');
require_once '../../config/database.php';
require_once '../../includes/middleware/auth.php'; // Optional auth
require_once '../../includes/helpers/sms-helper.php';
require_once '../../includes/helpers/validation.php';

$phone = trim($_POST['phone'] ?? '');
$purpose = $_POST['purpose'] ?? 'general'; // login, payment, register

if ($_SERVER['REQUEST_METHOD'] !== 'POST' || empty($phone)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'A valid phone number is required.']);
    exit;
}

if (!in_array($purpose, ['general', 'login', 'payment', 'register'], true)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Invalid OTP purpose.']);
    exit;
}

$phoneValidation = validatePhoneNumber($phone);
if (!$phoneValidation['valid']) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => $phoneValidation['error']]);
    exit;
}
$phone = $phoneValidation['normalized'];

// Normalize phone (handled in sms-helper)
try {
    // Rate limit check (5/min per phone)
    $stmt = $pdo->prepare("
        SELECT COUNT(*) as count 
        FROM otps 
        WHERE phone = ? AND purpose = ? AND created_at > DATE_SUB(NOW(), INTERVAL 1 MINUTE)
    ");
    $stmt->execute([$phone, $purpose]);
    $recent_count = $stmt->fetch()['count'];

    if ($recent_count >= 5) {
        echo json_encode(['success' => false, 'message' => 'Too many OTP requests. Try again in 1 minute.']);
        exit;
    }

    // Generate 6-digit OTP
    $otp = sprintf('%06d', random_int(0, 999999));
    $expires_at = date('Y-m-d H:i:s', strtotime('+5 minutes'));

    // Delete old OTPs for this phone/purpose
    $pdo->prepare("DELETE FROM otps WHERE phone = ? AND purpose = ?")->execute([$phone, $purpose]);

    // Store new OTP
    $stmt = $pdo->prepare("
        INSERT INTO otps (phone, otp, purpose, expires_at, attempts, ip_address) 
        VALUES (?, ?, ?, ?, 0, ?)
    ");
    $stmt->execute([$phone, hash_hmac('sha256', $otp, 'eventra-sms-otp-' . $phone), $purpose, $expires_at, $_SERVER['REMOTE_ADDR']]);

    $smsResult = sendSMS($phone, "Your Eventra verification code is {$otp}. It expires in 5 minutes.");

    if ($smsResult['success']) {
        echo json_encode([
            'success' => true,
            'message' => 'OTP sent successfully',
            'expires_in_minutes' => 5,
            'retry_after' => 60 // 1 min between requests
        ]);
    } else {
        // Rollback on SMS failure
        $pdo->prepare("DELETE FROM otps WHERE phone = ? AND purpose = ?")->execute([$phone, $purpose]);
        echo json_encode(['success' => false, 'message' => 'We could not send the verification code. Please try again later.']);
    }

} catch (Throwable $e) {
    http_response_code(500);
    error_log('[SMS OTP] ' . $e->getMessage());
    echo json_encode(['success' => false, 'message' => 'The verification service is temporarily unavailable.']);
}
?>