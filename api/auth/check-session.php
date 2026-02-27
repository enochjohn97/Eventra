<?php
header('Content-Type: application/json');
require_once '../../config/database.php';
require_once '../../includes/helpers/entity-resolver.php';

if (session_status() === PHP_SESSION_NONE) {
    require_once '../../config/session-config.php';
}

$sessionRole = $_SESSION['user_role'] ?? null;
$token = $_SESSION['auth_token'] ?? null;

$user_id = null;

if ($sessionRole === 'admin') {
    $user_id = $_SESSION['admin_id'] ?? null;
} elseif ($sessionRole === 'client') {
    $user_id = $_SESSION['client_id'] ?? null;
} else {
    $user_id = $_SESSION['user_id'] ?? null;
}

if (!$sessionRole || !$user_id || !$token) {
    echo json_encode(['success' => false, 'message' => 'Not authenticated']);
    exit;
}

try {
    // Basic verification of the session (can be expanded)
    $stmt = $pdo->prepare("SELECT a.id, a.email, a.role, a.is_active FROM auth_accounts a JOIN auth_tokens t ON a.id = t.auth_id WHERE t.token = ? AND a.id = ?");
    $stmt->execute([$token, $user_id]);
    $account = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$account || $account['role'] !== $sessionRole) {
        echo json_encode(['success' => false, 'message' => 'Invalid session']);
        exit;
    }

    $user = resolveEntity($account['email']);

    echo json_encode([
        'success' => true,
        'user' => [
            'id' => $user['id'],
            'name' => $user['name'],
            'email' => $user['email'],
            'role' => $user['role'],
            'profile_pic' => $user['profile_pic'] ?? null,
            'token' => $token
        ]
    ]);
} catch (PDOException $e) {
    echo json_encode(['success' => false, 'message' => 'Server error']);
}
