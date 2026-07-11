<?php
/**
 * Eventra Support Chat - Auth Token Generator
 * Generates a JWT for the authenticated user to connect to Socket.IO
 */

header('Content-Type: application/json');
require_once __DIR__ . '/../../server/config.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/middleware/auth.php';

function base64UrlEncode($text) {
    return str_replace(['+', '/', '='], ['-', '_', ''], base64_encode($text));
}

try {
    $role = $_SESSION['role'] ?? null;
    if (!$role || !in_array($role, ['admin', 'client', 'user'])) {
        http_response_code(401);
        echo json_encode(['success' => false, 'message' => 'Unauthorized']);
        exit;
    }

    $authId = (int)($_SESSION['auth_id'] ?? 0);
    if ($authId <= 0) {
        // Fallback: lookup auth_id from role specific ID if not directly in session
        $roleId = (int)($_SESSION[$role . '_id'] ?? 0);
        $pdo = getPDO();
        if ($role === 'admin') {
            $stmt = $pdo->prepare("SELECT admin_auth_id FROM admins WHERE id = ?");
            $stmt->execute([$roleId]);
            $authId = $stmt->fetchColumn();
        } elseif ($role === 'client') {
            $stmt = $pdo->prepare("SELECT client_auth_id FROM clients WHERE id = ?");
            $stmt->execute([$roleId]);
            $authId = $stmt->fetchColumn();
        } else {
            $stmt = $pdo->prepare("SELECT user_auth_id FROM users WHERE id = ?");
            $stmt->execute([$roleId]);
            $authId = $stmt->fetchColumn();
        }
    }

    if (!$authId) {
         http_response_code(401);
         echo json_encode(['success' => false, 'message' => 'Session invalid']);
         exit;
    }

    $name = $_SESSION['name'] ?? 'Unknown User';

    // Generate JWT manually
    $secret = getenv('JWT_SECRET') ?: 'eventra_super_secret_jwt_key_2026';
    
    $header = json_encode(['typ' => 'JWT', 'alg' => 'HS256']);
    $payload = json_encode([
        'auth_id' => $authId,
        'role' => $role,
        'name' => $name,
        'iat' => time(),
        'exp' => time() + 3600 // 1 hour token
    ]);
    
    $base64UrlHeader = base64UrlEncode($header);
    $base64UrlPayload = base64UrlEncode($payload);
    
    $signature = hash_hmac('sha256', $base64UrlHeader . "." . $base64UrlPayload, $secret, true);
    $base64UrlSignature = base64UrlEncode($signature);
    
    $jwt = $base64UrlHeader . "." . $base64UrlPayload . "." . $base64UrlSignature;
    
    echo json_encode(['success' => true, 'token' => $jwt]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Error generating token']);
}
