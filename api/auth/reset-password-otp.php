<?php

header('Content-Type: application/json');
require_once __DIR__ . '/../../config/database.php';

$data = json_decode(file_get_contents('php://input'), true) ?? [];
$resetToken = trim((string) ($data['reset_token'] ?? ''));
$password = (string) ($data['password'] ?? '');
$passwordConfirm = (string) ($data['password_confirm'] ?? $password);

if ($resetToken === '' || $password === '') {
	http_response_code(400);
	echo json_encode(['success' => false, 'message' => 'Your reset session has expired. Request a new code.']);
	exit;
}
if ($password !== $passwordConfirm || strlen($password) < 8) {
	http_response_code(400);
	echo json_encode(['success' => false, 'message' => 'Passwords must match and be at least 8 characters long.']);
	exit;
}

try {
	$stmt = $pdo->prepare("SELECT id, auth_id FROM auth_tokens WHERE token = ? AND type = 'reset_password' AND revoked = 0 AND expires_at > NOW() LIMIT 1");
	$stmt->execute([$resetToken]);
	$token = $stmt->fetch(PDO::FETCH_ASSOC);
	if (!$token) {
		http_response_code(400);
		echo json_encode(['success' => false, 'message' => 'Your reset session has expired. Request a new code.']);
		exit;
	}

	$pdo->beginTransaction();
	$pdo->prepare('UPDATE auth_accounts SET password = ? WHERE id = ?')->execute([password_hash($password, PASSWORD_DEFAULT), $token['auth_id']]);
	$pdo->prepare("UPDATE auth_tokens SET revoked = 1 WHERE auth_id = ? AND type IN ('access', 'otp', 'reset_password')")->execute([$token['auth_id']]);
	$pdo->commit();
	echo json_encode(['success' => true, 'message' => 'Your password has been reset successfully.']);
} catch (Throwable $e) {
	if ($pdo->inTransaction()) $pdo->rollBack();
	error_log('[Password reset] ' . $e->getMessage());
	http_response_code(500);
	echo json_encode(['success' => false, 'message' => 'We could not reset your password. Please try again later.']);
}
?>
