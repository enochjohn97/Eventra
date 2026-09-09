<?php

/**
 * Entity Resolver Helper
 * Centralized logic for resolving auth entities and enforcing policies.
 */

/**
 * Resolves an authentication entity (admin, client, or user) from the database.
 *
 * @param string $identifier Email or Username
 * @param string|null $role Expected role (admin, client, user)
 * @return array|null The resolved user data or null if not found
 */
function resolveEntity($identifier, $role = null)
{
    $pdo = getPDO();

    if (is_numeric($identifier)) {
        $query = "SELECT a.* FROM auth_accounts a WHERE a.id = ?";
        $params = [$identifier];
    } else {
        $query = "SELECT a.* FROM auth_accounts a WHERE (a.email = ? OR a.username = ?)";
        $params = [$identifier, $identifier];
    }

    if ($role) {
        $query .= " AND a.role = ?";
        $params[] = $role;
    }

    // Ensure we only resolve active, non-deleted accounts
    $query .= " AND a.deleted_at IS NULL AND a.is_active = 1";

    $stmt = $pdo->prepare($query);
    $stmt->execute($params);
    $account = $stmt->fetch();

    if (!$account) {
        return null;
    }

    $userId = $account['id'];
    $userRole = $account['role'];
    $profile = [];

    // Fetch role-specific profile data
    if ($userRole === 'admin') {
        $stmt = $pdo->prepare("SELECT * FROM admins WHERE admin_auth_id = ?");
        $stmt->execute([$userId]);
        $profile = $stmt->fetch() ?: [];
    } elseif ($userRole === 'client') {
        $stmt = $pdo->prepare("SELECT * FROM clients WHERE client_auth_id = ?");
        $stmt->execute([$userId]);
        $profile = $stmt->fetch() ?: [];
    } elseif ($userRole === 'user') {
        $stmt = $pdo->prepare("SELECT * FROM users WHERE user_auth_id = ?");
        $stmt->execute([$userId]);
        $profile = $stmt->fetch() ?: [];
    }

    // Merge account and profile data
    // Profiles (admins, clients, users) take priority for specific fields like 'status'
    $merged = array_merge($account, $profile);

    // CRITICAL: Ensure 'id' always refers to auth_accounts.id (the global auth ID)
    // role-specific tables also have an 'id' which can overwrite the auth ID during merge.
    $merged['id'] = $userId;
    $merged['profile_id'] = $profile['id'] ?? null;

    // Ensure account email/username always wins as it is the auth source of truth
    if (isset($account['email'])) {
        $merged['email'] = $account['email'];
    }
    if (isset($account['username'])) {
        $merged['username'] = $account['username'];
    }
    return $merged;
}

/**
 * Enforces authentication policies based on role and login method.
 *
 * @param string $role The user's role
 * @param string $method The login method (password, google)
 * @param array $user The user's data
 * @return array Policy result ['allowed' => bool, 'message' => string]
 */
function getAuthPolicy($role, $method, $user)
{
    // 1. Check if account is active
    if (isset($user['is_active']) && !$user['is_active']) {
        return ['allowed' => false, 'message' => 'Account is deactivated.'];
    }

    // 2. Role-specific restrictions
    if ($role === 'admin') {
        // Admin accounts must only use local password login
        if ($method !== 'password') {
            return ['allowed' => false, 'message' => 'Admin accounts must use password authentication.'];
        }
        
        // Admin specific status check
        if (isset($user['status']) && !empty($user['status']) && $user['status'] !== 'active') {
            return ['allowed' => false, 'message' => "This admin account is " . $user['status'] . "."];
        }
    } elseif ($role === 'client') {
        // Client specific status checks if needed
        if (isset($user['status']) && $user['status'] === 'suspended') {
            return ['allowed' => false, 'message' => 'Account is suspended. Please contact support.'];
        }
    }

    // 3. Check for account lock
    if (isset($user['locked_until']) && $user['locked_until']) {
        if (strtotime($user['locked_until']) > time()) {
            return ['allowed' => false, 'message' => 'Account is temporarily locked. Please try again later.'];
        }
    }

    return ['allowed' => true, 'message' => 'Success'];
}

/**
 * Checks if a user is allowed to register with the given email and role.
 *
 * @param string $email The email to check
 * @param string $role The target role
 * @return array Result ['success' => bool, 'message' => string]
 */
function canRegisterAs($email, $role)
{
    $pdo = getPDO();

    // Check if email already exists in auth_accounts (considering active accounts only)
    $stmt = $pdo->prepare("SELECT role, deleted_at FROM auth_accounts WHERE email = ?");
    $stmt->execute([$email]);
    $existing = $stmt->fetch();

    if ($existing && $existing['deleted_at'] === null) {
        if ($existing['role'] === $role) {
            return ['success' => false, 'message' => 'An account with this email already exists for this role.'];
        } else {
            return ['success' => false, 'message' => "This email is already registered as a " . $existing['role'] . ". Contact support if you need to change your role."];
        }
    }

    return ['success' => true, 'message' => 'Available'];
}

/**
 * Security logging helper (Mock or implementation if missing)
 */
if (!function_exists('logSecurityEvent')) {
    function logSecurityEvent($auth_id, $username, $event_type, $method, $details)
    {
        $pdo = getPDO();
        try {
            $stmt = $pdo->prepare("INSERT INTO auth_logs (auth_id, username, event_type, auth_method, details, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?)");
            $stmt->execute([
                $auth_id,
                $username,
                $event_type,
                $method,
                $details,
                $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1',
                $_SERVER['HTTP_USER_AGENT'] ?? 'System'
            ]);
        } catch (Exception $e) {
            // Silently fail logging to avoid crashing the main flow
            error_log("Failed to log security event: " . $e->getMessage());
        }
    }
}
