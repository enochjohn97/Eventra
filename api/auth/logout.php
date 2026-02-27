<?php
/**
 * Logout API
 * Handles user logout, clears session, and updates status
 */
header('Content-Type: application/json');
require_once '../../config/database.php';

// Determine session name based on context (referer or path)
if (session_status() === PHP_SESSION_NONE) {
    // Try to guess based on referer first, then path
    $ref = $_SERVER['HTTP_REFERER'] ?? '';

    if (strpos($ref, '/admin/') !== false) {
        session_name('EVENTRA_ADMIN_SESS');
    } elseif (strpos($ref, '/client/') !== false) {
        session_name('EVENTRA_CLIENT_SESS');
    } else {
        session_name('EVENTRA_USER_SESS');
    }
    session_start();
}

try {
    $role = $_SESSION['user_role'] ?? 'user';

    // Resolve user_id based on role
    $user_id = null;
    if ($role === 'admin') {
        $user_id = $_SESSION['admin_id'] ?? null;
    } elseif ($role === 'client') {
        $user_id = $_SESSION['client_id'] ?? null;
    } else {
        $user_id = $_SESSION['user_id'] ?? null;
    }
    $auth_token = $_SESSION['auth_token'] ?? null;

    $table = 'users';
    if ($role === 'client')
        $table = 'clients';
    if ($role === 'admin')
        $table = 'admins';

    if ($user_id) {
        // Get user info for notification
        $stmt = $pdo->prepare("SELECT name FROM $table WHERE id = ?");
        $stmt->execute([$user_id]);
        $user = $stmt->fetch();

        // Create logout notification using helper
        require_once '../utils/notification-helper.php';
        if ($user) {
            createLogoutNotification($user_id, $user['name']);
        }

        // Update status to offline
        $stmt = $pdo->prepare("UPDATE auth_accounts SET is_active = 0 WHERE id = ?");
        $stmt->execute([$user_id]);

        // Delete auth tokens
        $stmt = $pdo->prepare("DELETE FROM auth_tokens WHERE auth_id = ?");
        $stmt->execute([$user_id]);
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
        'message' => 'Logout failed: ' . $e->getMessage()
    ]);
}
