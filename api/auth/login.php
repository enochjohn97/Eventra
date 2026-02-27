<?php
header('Content-Type: application/json');
require_once '../../config/database.php';
require_once '../../includes/helpers/entity-resolver.php';

$data = json_decode(file_get_contents("php://input"), true);

if (!isset($data['email']) || !isset($data['password'])) {
    echo json_encode(['success' => false, 'message' => 'Email and password are required.']);
    exit;
}

$email = $data['email'];
$password = $data['password'];

// Support for dedicated login endpoint overrides
if (isset($auth_intent)) {
    $intent = $auth_intent;
} else {
    $intent = $data['intent'] ?? 'client';
}
$remember_me = isset($data['remember_me']) && $data['remember_me'] === true;

if (!in_array($intent, ['admin', 'client', 'user'])) {
    echo json_encode(['success' => false, 'message' => 'Invalid authentication path.']);
    exit;
}

try {
    // 1. Resolve Entity (Centralized Backend Decision)
    $user = resolveEntity($email);

    if (!$user) {
        logSecurityEvent(null, $email, 'login_failure', 'password', "Identity not found.");
        echo json_encode(['success' => false, 'message' => 'Invalid email or password.']);
        exit;
    }

    // 2. Validate Role Compatibility & Provider Policy
    $userRole = strtolower($user['role'] ?? '');
    $effectiveIntent = strtolower($intent);

    // Enforce role-specific portal entry
    if ($userRole !== $effectiveIntent) {
        logSecurityEvent($user['id'], $email, 'login_failure', 'password', "Role mismatch: User is $userRole but tried as $effectiveIntent");
        $targetPortal = ucfirst($userRole);
        echo json_encode(['success' => false, 'message' => "Access denied. This is a $targetPortal account. Please use the appropriate portal."]);
        exit;
    }

    // Enforce Admin Local-Only Policy
    if ($userRole === 'admin' && $user['auth_provider'] !== 'local') {
        logSecurityEvent($user['id'], $email, 'login_failure', 'password', "Admin account attempted login with non-local state.");
        echo json_encode(['success' => false, 'message' => "Admin accounts must use local authentication."]);
        exit;
    }

    // Account Status Check
    if (isset($user['is_active']) && $user['is_active'] == 0) {
        // Only allow login if account is active, or handle activation logic if required.
        // For now, let's keep the user's requirement: check is_active = 1
        logSecurityEvent($user['id'], $email, 'login_failure', 'password', "Account is inactive.");
        echo json_encode(['success' => false, 'message' => "Your account is inactive. Please contact support."]);
        exit;
    }

    if (password_verify($password, $user['password'])) {
        // Enforce account locking
        if ($user['locked_until'] && strtotime($user['locked_until']) > time()) {
            echo json_encode(['success' => false, 'message' => 'Account is temporarily locked. Please try again later.']);
            exit;
        }

        // 3. Enforce Auth Policy
        $policy = getAuthPolicy($userRole, 'password', $user);
        if (!$policy['allowed']) {
            logSecurityEvent($user['id'], $email, 'login_failure', 'password', "Policy Violation: " . $policy['message']);
            echo json_encode(['success' => false, 'message' => $policy['message']]);
            exit;
        }

        // Reset failed attempts on success
        $pdo->prepare("UPDATE auth_accounts SET failed_attempts = 0, last_login_at = NOW(), is_online = 1 WHERE id = ?")->execute([$user['id']]);

        // Generate alphanumeric access token
        $token = bin2hex(random_bytes(32));
        $expires_in = $remember_me ? '+30 days' : '+2 hours'; // Extended from 30m for better UX, but sliding window in middleware handles refresh
        $expires_at = date('Y-m-d H:i:s', strtotime($expires_in));

        // Delete old tokens for this auth identity
        $stmt = $pdo->prepare("DELETE FROM auth_tokens WHERE auth_id = ?");
        $stmt->execute([$user['id']]);

        // Store new token in database
        $stmt = $pdo->prepare("INSERT INTO auth_tokens (auth_id, token, expires_at, type) VALUES (?, ?, ?, 'access')");
        $stmt->execute([$user['id'], $token, $expires_at]);

        // 4. Set Entity-Scoped Session
        $expectedSessionName = 'EVENTRA_USER_SESS';
        if ($userRole === 'admin') {
            $expectedSessionName = 'EVENTRA_ADMIN_SESS';
        } elseif ($userRole === 'client') {
            $expectedSessionName = 'EVENTRA_CLIENT_SESS';
        }

        if (session_name() !== $expectedSessionName) {
            session_write_close();
            session_name($expectedSessionName);
            session_start();
            session_regenerate_id(true);
            $_SESSION = [];
        }

        // Strict Role-Specific Session Keys
        if ($userRole === 'admin') {
            $_SESSION['admin_id'] = $user['id'];
        } elseif ($userRole === 'client') {
            $_SESSION['client_id'] = $user['id'];
        } else {
            $_SESSION['user_id'] = $user['id'];
        }

        $_SESSION['user_role'] = $userRole;
        $_SESSION['auth_token'] = $token;

        // Log success
        logSecurityEvent($user['id'], $email, 'login_success', 'password', "Logged in as $userRole via portal $effectiveIntent");

        // Notify admin of login activity
        require_once __DIR__ . '/../utils/notification-helper.php';
        $admin_id = getAdminUserId();
        if ($admin_id) {
            if ($userRole === 'client') {
                createClientLoginNotification($admin_id, $user['id'], $user['name'] ?? 'Client', $email);
            } elseif ($userRole === 'user') {
                createUserLoginNotification($admin_id, $user['id'], $user['name'] ?? 'User', $email);
            }
        }

        // Role-Based Redirects
        $redirect = 'index.html'; // Default for users
        if ($userRole === 'admin') {
            $redirect = 'admin/pages/adminDashboard.html';
        } elseif ($userRole === 'client') {
            $redirect = 'client/pages/clientDashboard.html';
        }

        echo json_encode([
            'success' => true,
            'message' => 'Login successful',
            'role' => $userRole,
            'redirect' => $redirect,
            'user' => [
                'id' => $user['id'],
                'name' => $user['name'],
                'email' => $user['email'],
                'role' => $userRole,
                'profile_pic' => $user['profile_pic'] ?? null,
                'token' => $token
            ]
        ]);
    } else {
        // Increment failed attempts
        $pdo->prepare("UPDATE auth_accounts SET failed_attempts = failed_attempts + 1 WHERE id = ?")->execute([$user['id']]);

        // Lock account if failures exceed threshold
        if (($user['failed_attempts'] ?? 0) >= 5) {
            $lockTime = date('Y-m-d H:i:s', strtotime('+15 minutes'));
            $pdo->prepare("UPDATE auth_accounts SET locked_until = ? WHERE id = ?")->execute([$lockTime, $user['id']]);
        }

        logSecurityEvent($user['id'], $email, 'login_failure', 'password', "Invalid password.");
        echo json_encode(['success' => false, 'message' => 'Invalid email or password.']);
    }
} catch (PDOException $e) {
    echo json_encode(['success' => false, 'message' => 'Database error occurred.']);
}
