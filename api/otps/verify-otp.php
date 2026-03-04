<?php
/**
 * Verify OTP API
 * Verifies the provided OTP against the stored hash
 */
header('Content-Type: application/json');
require_once '../../config/database.php';

// Check authentication
if (!isset($_SESSION['user_id'])) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Unauthorized']);
    exit;
}

$user_id = $_SESSION['user_id'];
$data = json_decode(file_get_contents("php://input"), true);
$otp = $data['otp'] ?? '';
$payment_reference = $data['payment_reference'] ?? '';

if (empty($otp) || empty($payment_reference)) {
    echo json_encode(['success' => false, 'message' => 'OTP and payment reference required']);
    exit;
}

try {
    // 1. Fetch the latest OTP for this user and reference
    $stmt = $pdo->prepare("SELECT * FROM payment_otps WHERE user_id = ? AND payment_reference = ? ORDER BY created_at DESC LIMIT 1");
    $stmt->execute([$user_id, $payment_reference]);
    $record = $stmt->fetch();

    if (!$record) {
        echo json_encode(['success' => false, 'message' => 'No OTP found for this transaction']);
        exit;
    }

    // 2. Check expiration
    if (strtotime($record['expires_at']) < time()) {
        echo json_encode(['success' => false, 'message' => 'OTP has expired. Please request a new one.']);
        exit;
    }

    // 3. Check attempt count
    if ($record['attempts'] >= 5) {
        echo json_encode(['success' => false, 'message' => 'Too many failed attempts. This OTP is now locked. Please request a new one.']);
        exit;
    }

    // 4. Verify OTP hash
    if (password_verify($otp, $record['otp_hash'])) {
        // Success: Mark OTP as verified in DB for persistent verification
        $stmt = $pdo->prepare("UPDATE payment_otps SET verified_at = NOW() WHERE id = ?");
        $stmt->execute([$record['id']]);

        // Optional: Save verification in session for extra security on the purchase endpoint
        $_SESSION['otp_verified_ref'] = $payment_reference;

        echo json_encode(['success' => true, 'message' => 'OTP verified successfully']);
    } else {
        // Fail: Increment attempts
        $stmt = $pdo->prepare("UPDATE payment_otps SET attempts = attempts + 1 WHERE id = ?");
        $stmt->execute([$record['id']]);

        $remaining = 4 - $record['attempts'];
        echo json_encode([
            'success' => false,
            'message' => 'Invalid OTP code.',
            'remaining_attempts' => $remaining
        ]);
    }

} catch (PDOException $e) {
    echo json_encode(['success' => false, 'message' => 'Database error: ' . $e->getMessage()]);
}
