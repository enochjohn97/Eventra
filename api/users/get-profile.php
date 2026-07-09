<?php

/**
 * Get User Profile API
 * Retrieves user or client profile information
 */

header('Content-Type: application/json');
require_once '../../config/database.php';
require_once '../../includes/middleware/auth.php';

// Hydrate session first — must happen before any $_SESSION access
checkAuth();

$auth_id = getAuthId();
$user_id = $_GET['user_id'] ?? $auth_id;

// If no auth at all, reject
if (!$auth_id) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Authentication required']);
    exit;
}

// Check if requesting own profile or has admin role (use strict comparison to prevent type confusion)
$role = $_SESSION['role'] ?? '';
if ((int)$user_id !== (int)$auth_id && $role !== 'admin') {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => 'Access denied']);
    exit;
}

try {
    require_once '../../includes/helpers/entity-resolver.php';

    // Use the robust entity resolver
    $user = resolveEntity($user_id, $_SESSION['role']);

    if (!$user && isset($_SESSION['role'])) {
        $user = resolveEntity($user_id); // Fallback if role is not in session or mismatch exists
    }

    if (!$user) {
        echo json_encode(['success' => false, 'message' => 'User not found']);
        exit;
    }

    // Remove password from response
    unset($user['password']);

    // Add profile_id (the actual users/clients/admins table ID)
    // The 'id' in merged data is from auth_accounts, we need the profile table ID
    $userRole = strtolower($user['role'] ?? '');
    if ($userRole === 'user') {
        // For users, the 'id' in users table is the profile_id
        $stmt = $pdo->prepare("SELECT id as profile_id FROM users WHERE user_auth_id = ?");
        $stmt->execute([$user['id']]);
        $profileData = $stmt->fetch();
        if ($profileData) {
            $user['profile_id'] = $profileData['profile_id'];
        }
    } elseif ($userRole === 'client') {
        $stmt = $pdo->prepare("SELECT id as profile_id FROM clients WHERE client_auth_id = ?");
        $stmt->execute([$user['id']]);
        $profileData = $stmt->fetch();
        if ($profileData) {
            $user['profile_id'] = $profileData['profile_id'];
        }
    } elseif ($userRole === 'admin') {
        $stmt = $pdo->prepare("SELECT id as profile_id FROM admins WHERE admin_auth_id = ?");
        $stmt->execute([$user['id']]);
        $profileData = $stmt->fetch();
        if ($profileData) {
            $user['profile_id'] = $profileData['profile_id'];
        }
    }

    // Ensure profile_pic has leading slash for absolute path parsing
    if (!empty($user['profile_pic']) && strpos($user['profile_pic'], '/') !== 0) {
        $user['profile_pic'] = '/' . $user['profile_pic'];
    }

    echo json_encode([
        'success' => true,
        'user' => $user
    ]);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database error: ' . $e->getMessage()]);
}
