<?php

/**
 * Logout API
 * Handles user logout, clears session, and updates status
 */

header('Content-Type: application/json');
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../utils/notification-helper.php';

// Ensure centralized session configuration is used
if (session_status() === PHP_SESSION_NONE) {
    require_once __DIR__ . '/../../config/session-config.php';
}

try {
    $role = $_SESSION['user_role'] ?? 'user';

    $auth_id = $_SESSION['auth_id'] ?? null;
    $auth_token = $_SESSION['auth_token'] ?? null;

    $table = 'users'; // default
    if ($role === 'client') {
        $table = 'clients';
    }
    if ($role === 'admin') {
        $table = 'admins';
    }

    if ($auth_id) {
        // Create logout notification based on role
        if ($role === 'client') {
            // Notify admin about client logout
            $stmt = $pdo->prepare("SELECT business_name FROM clients WHERE client_auth_id = ?");
            $stmt->execute([$auth_id]);
            $clientData = $stmt->fetch();
            $clientName = $clientData['business_name'] ?? 'Client';
            
            $adminId = getAdminUserId();
            if ($adminId) {
                $message = "Client '{$clientName}' has logged out";
                createNotification($adminId, $message, 'client_logout', $auth_id, 'admin', 'client');
            }
        } elseif ($role === 'admin') {
            // Create admin logout notification
            createAdminLogoutNotification($auth_id);
        } elseif ($role === 'user') {
            // Notify admin about user logout
            $stmt = $pdo->prepare("SELECT name FROM users WHERE user_auth_id = ?");
            $stmt->execute([$auth_id]);
            $userData = $stmt->fetch();
            $userName = $userData['name'] ?? 'User';
            
            $adminId = getAdminUserId();
            if ($adminId) {
                $message = "User '{$userName}' has logged out";
                createNotification($adminId, $message, 'user_logout', $auth_id, 'admin', 'user');
            }
        }

        // Update status to offline (only mark is_online = 0, NOT is_active!)
        $stmt = $pdo->prepare("UPDATE auth_accounts SET is_online = 0, last_seen = NOW() WHERE id = ?");
        $stmt->execute([$auth_id]);

        // Update role-specific status to 'offline'
        if ($role === 'client') {
            $pdo->prepare("UPDATE clients SET status = 'offline' WHERE client_auth_id = ?")->execute([$auth_id]);
        } elseif ($role === 'admin') {
            $pdo->prepare("UPDATE admins SET status = 'offline' WHERE admin_auth_id = ?")->execute([$auth_id]);
        } elseif ($role === 'user') {
            $pdo->prepare("UPDATE users SET status = 'offline' WHERE user_auth_id = ?")->execute([$auth_id]);
        }

        // Delete auth tokens
        $stmt = $pdo->prepare("DELETE FROM auth_tokens WHERE auth_id = ?");
        $stmt->execute([$auth_id]);
    }

    // Clear session
    session_unset();
    session_destroy();

    // Clear all possible session cookies
    $params = session_get_cookie_params();
    $possibleNames = ['EVENTRA_CLIENT_SESS', 'EVENTRA_ADMIN_SESS', 'EVENTRA_USER_SESS'];
    foreach ($possibleNames as $name) {
        setcookie(
            $name,
            '',
            time() - 42000,
            $params["path"],
            $params["domain"],
            $params["secure"],
            $params["httponly"]
        );
    }

    if (isset($_COOKIE['remember_token'])) {
        setcookie('remember_token', '', time() - 3600, '/');
    }
    if (isset($_COOKIE['pending_role'])) {
        setcookie('pending_role', '', time() - 3600, '/');
    }

    echo json_encode([
        'success' => true,
        'message' => 'Logged out successfully'
    ]);
} catch (PDOException $e) {
    echo json_encode([
        'success' => false,
        'message' => 'Logout failed. Please try again.'
    ]);
}
