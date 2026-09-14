<?php

header('Content-Type: application/json');
require_once __DIR__ . '/../../config/database.php';

$data = json_decode(file_get_contents("php://input"), true);
$email = $data['email'] ?? null;
$otpCode = $data['otp_code'] ?? null;

if (!$email || !$otpCode) {
    echo json_encode(['success' => false, 'message' => 'Email and OTP are required.']);
    exit;
}

try {
    // Get the user account (any role)
    $stmt = $pdo->prepare("SELECT id FROM auth_accounts WHERE email = ? AND deleted_at IS NULL");
    $stmt->execute([$email]);
    $account = $stmt->fetch();

    if (!$account) {
        echo json_encode(['success' => false, 'message' => 'Account not found.']);
        exit;
    }

    // Verify OTP token
    $stmt = $pdo->prepare("
        SELECT id, token FROM auth_tokens
        WHERE auth_id = ? AND type = 'otp' AND revoked = 0 AND expires_at > NOW()
        ORDER BY id DESC LIMIT 1
    ");
    $stmt->execute([$account['id']]);
    $token = $stmt->fetch();

    if (!$token || !password_verify((string) $otpCode, $token['token'])) {
        echo json_encode(['success' => false, 'message' => 'Invalid or expired OTP code.']);
        exit;
    }

    $resetToken = bin2hex(random_bytes(32));
    $stmt = $pdo->prepare("INSERT INTO auth_tokens (auth_id, token, type, expires_at) VALUES (?, ?, 'reset_password', DATE_ADD(NOW(), INTERVAL 10 MINUTE))");
    $stmt->execute([$account['id'], $resetToken]);
    $pdo->prepare("UPDATE auth_tokens SET revoked = 1 WHERE id = ?")->execute([$token['id']]);

    echo json_encode(['success' => true, 'message' => 'OTP verified successfully.', 'reset_token' => $resetToken]);
} catch (PDOException $e) {
    error_log("OTP verification error: " . $e->getMessage());
    echo json_encode(['success' => false, 'message' => 'Database error occurred.']);
}
?>
