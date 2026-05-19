<?php

header('Content-Type: application/json');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header("Cross-Origin-Opener-Policy: same-origin-allow-popups");
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/helpers/entity-resolver.php';
require_once __DIR__ . '/../utils/id-generator.php';

$data = json_decode(file_get_contents("php://input"), true);


// Verify Google JWT credential using Google tokeninfo endpoint
require_once __DIR__ . '/../../config/env-loader.php';

if (!isset($data['credential']) || empty($data['credential'])) {
    echo json_encode(['success' => false, 'message' => 'Google credential is required.']);
    exit;
}

$jwt = $data['credential'];
$url = 'https://oauth2.googleapis.com/tokeninfo?id_token=' . urlencode($jwt);

$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_TIMEOUT, 10);

if (($_ENV['APP_ENV'] ?? '') === 'local') {
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
}

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
// curl_close($ch); is deprecated in PHP 8.4+ and no longer needed.

if ($httpCode !== 200 || !$response) {
    echo json_encode(['success' => false, 'message' => 'Invalid Google token.']);
    exit;
}

$payload = json_decode($response, true);
$clientId = $_ENV['GOOGLE_CLIENT_ID'] ?? '';

if (empty($clientId) || !isset($payload['aud']) || $payload['aud'] !== $clientId) {
    echo json_encode(['success' => false, 'message' => 'Token audience mismatch.']);
    exit;
}

if (!isset($payload['sub']) || empty($payload['sub']) || !isset($payload['email'])) {
    echo json_encode(['success' => false, 'message' => 'Google information is missing from token.']);
    exit;
}

// Verify if email is verified by Google (Handle both boolean and string "true")
$is_verified = isset($payload['email_verified']) && 
               ($payload['email_verified'] === true || $payload['email_verified'] === "true" || $payload['email_verified'] == 1);

if (!$is_verified) {
    error_log("Google Auth Failed: Email not verified for " . ($payload['email'] ?? 'unknown'));
    echo json_encode([
        'success' => false,
        'message' => 'Your Google account email is not verified. Please verify your Google account email before signing in.'
    ]);
    exit;
}

$google_id = $payload['sub'];
$email = $payload['email'];
$name = $payload['name'] ?? 'Google User';
$profile_pic = $payload['picture'] ?? null;

// Portal Intent Resolution (consistent with check-session.php)
$headers = function_exists('getallheaders') ? getallheaders() : [];
$portal = $_SERVER['HTTP_X_EVENTRA_PORTAL'] ?? $headers['X-Eventra-Portal'] ?? $headers['x-eventra-portal'] ?? 'user';

// Support for dedicated login endpoint overrides
if (isset($auth_intent)) {
    $intent = $auth_intent;
} else {
    $intent = $data['intent'] ?? $portal;
}

if (!in_array($intent, ['client', 'user', 'admin'])) {
    $intent = 'user';
}

try {
    // 1. Resolve Entity by email
    $user = resolveEntity($email, $intent);

    if ($user) {
        $userRole = strtolower($user['role']);

        // Block Admin Google Login
        if ($userRole === 'admin') {
            logSecurityEvent($user['id'], $email, 'login_failure', 'google', "Admin blocked from Google login.");
            echo json_encode(['success' => false, 'message' => "Admin accounts are restricted to local authentication."]);
            exit;
        }

        // Validate Role Compatibility with Portal Intent
        if ($userRole !== strtolower($intent)) {
            logSecurityEvent($user['id'], $email, 'login_failure', 'google', "Role mismatch: User is $userRole but tried via $intent portal");
            echo json_encode(['success' => false, 'message' => "Access denied. Use the appropriate portal for your " . ucfirst($userRole) . " account."]);
            exit;
        }

        // 3. Enforce Auth Policy
        $policy = getAuthPolicy($userRole, 'google', $user);
        if (!$policy['allowed']) {
            logSecurityEvent($user['id'], $email, 'login_failure', 'google', "Policy Violation: " . $policy['message']);
            echo json_encode(['success' => false, 'message' => $policy['message']]);
            exit;
        }

        // Update provider_id if not set or mismatched (safely update tracking)
        if ($user['auth_provider'] === 'google' && (empty($user['provider_id']) || $user['provider_id'] !== $google_id)) {
            $stmt = $pdo->prepare("UPDATE auth_accounts SET provider_id = ? WHERE id = ?");
            $stmt->execute([$google_id, $user['id']]);
        }

        // Sync Profile Data (UPSERT logic to handle missing profile records)
        $pdo->beginTransaction();
        if ($userRole === 'client') {
            $stmt = $pdo->prepare("
                INSERT INTO clients (client_auth_id, custom_id, business_name, email, name, profile_pic, password) 
                VALUES (?, ?, ?, ?, ?, ?, 'GOOGLE_AUTH')
                ON DUPLICATE KEY UPDATE name = VALUES(name), profile_pic = VALUES(profile_pic)
            ");
            // Check if custom_id already exists for this client (UPSERT case)
            $existingStmt = $pdo->prepare("SELECT custom_id FROM clients WHERE client_auth_id = ?");
            $existingStmt->execute([$user['id']]);
            $existingCustomId = $existingStmt->fetchColumn();
            $customId = $existingCustomId ?: generateClientId($pdo);
            $stmt->execute([$user['id'], $customId, $name, $email, $name, $profile_pic]);
        } else {
            $stmt = $pdo->prepare("
                INSERT INTO users (user_auth_id, custom_id, name, profile_pic) 
                VALUES (?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE name = VALUES(name), profile_pic = VALUES(profile_pic)
            ");
            // Check if custom_id already exists for this user (UPSERT case)
            $existingStmt = $pdo->prepare("SELECT custom_id FROM users WHERE user_auth_id = ?");
            $existingStmt->execute([$user['id']]);
            $existingCustomId = $existingStmt->fetchColumn();
            $customId = $existingCustomId ?: generateUserId($pdo);
            $stmt->execute([$user['id'], $customId, $name, $profile_pic]);
        }
        $pdo->commit();

        // Reload user entity to reflect changes
        $user = resolveEntity($email, $intent);

        // Consistent URL formatting for the response
        if (isset($user['profile_pic']) && $user['profile_pic']) {
            if (!preg_match('/^https?:\/\//i', $user['profile_pic'])) {
                $user['profile_pic'] = '/' . ltrim($user['profile_pic'], '/');
            }
        }
    } else {
        // 4. Registration Flow (Google-only for Users/Clients)
        if ($intent === 'admin') {
            logSecurityEvent(null, $email, 'login_failure', 'google', "Attempted admin registration via Google.");
            echo json_encode(['success' => false, 'message' => 'Admin accounts cannot be created via Google.']);
            exit;
        }

        $registrability = canRegisterAs($email, $intent);
        if (!$registrability['success']) {
            logSecurityEvent(null, $email, 'login_failure', 'google', "Registration blocked: " . $registrability['message']);
            echo json_encode(['success' => false, 'message' => $registrability['message']]);
            exit;
        }

        $pdo->beginTransaction();

        // Create new auth_account
        $stmt = $pdo->prepare("INSERT INTO auth_accounts (email, role, auth_provider, provider_id, username, is_active, email_verified_at) VALUES (?, ?, 'google', ?, ?, 1, NOW())");
        // Using email as username for google users if name is not unique/missing
        $username = explode('@', $email)[0] . '_' . substr(bin2hex(random_bytes(2)), 0, 4);
        $stmt->execute([$email, $intent, $google_id, $username]);
        $auth_id = $pdo->lastInsertId();

        if ($intent === 'client') {
            $customId = generateClientId($pdo);
            $stmt = $pdo->prepare("INSERT INTO clients (client_auth_id, custom_id, business_name, email, name, profile_pic, password) VALUES (?, ?, ?, ?, ?, ?, 'GOOGLE_AUTH')");
            $stmt->execute([$auth_id, $customId, $name, $email, $name, $profile_pic]);
        } else {
            // Default to 'user' role
            $customId = generateUserId($pdo);
            $stmt = $pdo->prepare("INSERT INTO users (user_auth_id, custom_id, name, profile_pic) VALUES (?, ?, ?, ?)");
            $stmt->execute([$auth_id, $customId, $name, $profile_pic]);
        }

        $pdo->commit();
        $user = resolveEntity($email, $intent);
    }

    $userRole = strtolower($user['role']);
    // Set Token
    $token = bin2hex(random_bytes(32));
    $expires_at = date('Y-m-d H:i:s', strtotime('+2 hours'));

    // Delete old tokens
    $stmt = $pdo->prepare("DELETE FROM auth_tokens WHERE auth_id = ?");
    $stmt->execute([$user['id']]);

    $stmt = $pdo->prepare("INSERT INTO auth_tokens (auth_id, token, expires_at, type) VALUES (?, ?, ?, 'access')");
    $stmt->execute([$user['id'], $token, $expires_at]);

    // Update last login
    $pdo->prepare("UPDATE auth_accounts SET last_login_at = NOW(), is_online = 1 WHERE id = ?")->execute([$user['id']]);

    // 4. Set Entity-Scoped Session using centralized config
    if (session_status() === PHP_SESSION_NONE) {
        require_once __DIR__ . '/../../config/session-config.php';
    }

    // Since session-config.php starts a session with a name based on headers/URI,
    // we should ensure the name matches the user's role if we are on a login handler.
    $expectedSessionName = 'EVENTRA_USER_SESS';
    if ($userRole === 'admin') {
        $expectedSessionName = 'EVENTRA_ADMIN_SESS';
    } elseif ($userRole === 'client') {
        $expectedSessionName = 'EVENTRA_CLIENT_SESS';
    }

    // Ensure correct session name before operations
    if (session_name() !== $expectedSessionName) {
        if (session_status() === PHP_SESSION_ACTIVE) {
            session_write_close();
        }
        session_name($expectedSessionName);
    }

    // Start session if not already started
    if (session_status() === PHP_SESSION_NONE) {
        require_once __DIR__ . '/../../config.php';
    }

    // Regenerate session ID for security, but preserve critical data
    if (session_status() === PHP_SESSION_ACTIVE) {
        // Save old CSRF token before regenerating
        $oldCsrfToken = $_SESSION['csrf_token'] ?? null;
        
        // Regenerate session ID with delete_old_session = true
        session_regenerate_id(true);
        
        // Restore CSRF token if it existed
        if ($oldCsrfToken) {
            $_SESSION['csrf_token'] = $oldCsrfToken;
        }
    }

    // Atomic Session Data Assignment
    $_SESSION['auth_token'] = $token; // Retain existing token assignment
    $_SESSION['auth_id'] = $user['id']; // Global auth account ID
    $_SESSION['user_role'] = $userRole;
    $_SESSION['role'] = $userRole; // Normalize for legacy support

    // Set role-specific IDs with fallback creation
    if ($userRole === 'admin') {
        $stmt = $pdo->prepare("SELECT id FROM admins WHERE admin_auth_id = ?");
        $stmt->execute([$user['id']]);
        $adminId = $stmt->fetchColumn();
        if ($adminId) {
            $_SESSION['admin_id'] = $adminId;
        } else {
            // Fallback: create admin profile if it doesn't exist
            $stmt = $pdo->prepare("INSERT INTO admins (admin_auth_id, name) VALUES (?, ?)");
            $stmt->execute([$user['id'], $user['name'] ?? 'Admin']);
            $_SESSION['admin_id'] = $pdo->lastInsertId();
        }
    } elseif ($userRole === 'client') {
        $stmt = $pdo->prepare("SELECT id FROM clients WHERE client_auth_id = ?");
        $stmt->execute([$user['id']]);
        $clientId = $stmt->fetchColumn();
        if ($clientId) {
            $_SESSION['client_id'] = $clientId;
        } else {
            // Fallback: create client profile if it doesn't exist
            $stmt = $pdo->prepare("INSERT INTO clients (client_auth_id, name, business_name, email, profile_pic) VALUES (?, ?, ?, ?, ?)");
            $stmt->execute([$user['id'], $user['name'] ?? 'Client', '', $user['email'] ?? '', $user['profile_pic'] ?? '']);
            $_SESSION['client_id'] = $pdo->lastInsertId();
        }
    } elseif ($userRole === 'user') {
        $stmt = $pdo->prepare("SELECT id FROM users WHERE user_auth_id = ?");
        $stmt->execute([$user['id']]);
        $userId = $stmt->fetchColumn();
        if ($userId) {
            $_SESSION['user_id'] = $userId;
        } else {
            // Fallback: create user profile if it doesn't exist
            $stmt = $pdo->prepare("INSERT INTO users (user_auth_id, name, profile_pic) VALUES (?, ?, ?)");
            $stmt->execute([$user['id'], $user['name'] ?? 'User', $user['profile_pic'] ?? '']);
            $_SESSION['user_id'] = $pdo->lastInsertId();
        }
    }

    $_SESSION['last_activity'] = time();

    // CRITICAL: Write session to disk before sending response
    session_write_close();

    // Log success
    logSecurityEvent($user['id'], $email, 'login_success', 'google', "Logged in as $userRole via portal $intent");

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

    // Redirection logic
    $redirect = 'public/pages/index.html'; // Default for users
    if ($userRole === 'admin') {
        $redirect = 'admin/pages/adminDashboard.html';
    } elseif ($userRole === 'client') {
        $redirect = 'client/pages/clientDashboard.html';
    }

    echo json_encode([
        'success' => true,
        'message' => 'Signed in with Google',
        'redirect' => $redirect,
        'user' => [
            'id' => $user['id'],
            'name' => $user['name'],
            'email' => $user['email'],
            'phone' => $user['phone'] ?? null,
            'role' => $userRole,
            'custom_id' => $user['custom_id'] ?? null,
            'bvn' => $user['bvn'] ?? null,
            'profile_pic' => (function ($pic) {
                if (!$pic) {
                    return null;
                }
                if (preg_match('/^https?:\/\//i', $pic)) {
                    return $pic;
                }
                return '/' . ltrim($pic, '/');
            })($user['profile_pic'] ?? null),
            'profile_image' => (function ($pic) {
                if (!$pic) {
                    return null;
                }
                if (preg_match('/^https?:\/\//i', $pic)) {
                    return $pic;
                }
                return '/' . ltrim($pic, '/');
            })($user['profile_pic'] ?? null),
            'token' => $token
        ]
    ]);
} catch (PDOException $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    echo json_encode(['success' => false, 'message' => 'Auth failed due to server error.']);
}
