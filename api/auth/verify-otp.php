<?php
/**
 * OTP Verification Endpoint
 * Handles:
 *   - client_login_otp   : Verify OTP after client login, complete session
 *   - registration_verify: Verify OTP for new account creation
 *   - client_login       : Legacy client login OTP verification
 *   - password_reset     : Legacy password reset OTP verification
 */

header('Content-Type: application/json');
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../config.php';
require_once __DIR__ . '/../../includes/helpers/entity-resolver.php';

$data = json_decode(file_get_contents("php://input"), true);

// Determine intent: new field 'intent' can be 'client_login_otp', 'registration_verify', 'client_login', 'password_reset'
$intent = $data['intent'] ?? 'client_login_otp'; // Default to new flow

// For new flow, we expect auth_id + otp
if ($intent === 'client_login_otp') {
    $auth_id = $data['auth_id'] ?? null;
    $identity = $data['identity'] ?? $data['email'] ?? null;
    $otp = $data['otp'] ?? '';

    if (!$otp) {
        echo json_encode(['success' => false, 'message' => 'Verification code is required.']);
        exit;
    }

    if (!$auth_id && !$identity) {
        echo json_encode(['success' => false, 'message' => 'Identity or Account ID is required.']);
        exit;
    }

    try {
        $pdo = getPDO();

        // If auth_id is missing but identity (email) is provided, resolve it
        if (!$auth_id && $identity) {
            $stmt = $pdo->prepare("SELECT id FROM auth_accounts WHERE (email = ? OR username = ?) AND role = 'client' LIMIT 1");
            $stmt->execute([$identity, $identity]);
            $auth_id = $stmt->fetchColumn();
            
            if (!$auth_id) {
                echo json_encode(['success' => false, 'message' => 'Account not found. Please login again.']);
                exit;
            }
        }

        // 1. Fetch OTP record (hashed)
        $stmt = $pdo->prepare("SELECT token, expires_at FROM auth_tokens WHERE auth_id = ? AND type = 'otp' ORDER BY created_at DESC LIMIT 1");
        $stmt->execute([$auth_id]);
        $record = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$record) {
            echo json_encode(['success' => false, 'message' => 'No OTP request found. Please login again.']);
            exit;
        }

        // 2. Check expiration
        if (strtotime($record['expires_at']) < time()) {
            $pdo->prepare("DELETE FROM auth_tokens WHERE auth_id = ? AND type = 'otp'")->execute([$auth_id]);
            echo json_encode(['success' => false, 'message' => 'OTP has expired. Please login again.']);
            exit;
        }

        // 3. Verify OTP
        if (!password_verify($otp, $record['token'])) {
            echo json_encode(['success' => false, 'message' => 'Invalid verification code.']);
            exit;
        }

        // 4. OTP is valid – delete the OTP token
        $pdo->prepare("DELETE FROM auth_tokens WHERE auth_id = ? AND type = 'otp'")->execute([$auth_id]);

        // 5. Fetch user details (must be client)
        $stmt = $pdo->prepare("
            SELECT a.id, a.email, a.role,
                   c.id as client_id, c.business_name, c.name, c.profile_pic
            FROM auth_accounts a
            LEFT JOIN clients c ON c.client_auth_id = a.id
            WHERE a.id = ? AND a.role = 'client'
        ");
        $stmt->execute([$auth_id]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$user) {
            echo json_encode(['success' => false, 'message' => 'User account not found.']);
            exit;
        }

        // 6. Reset failed attempts and update last login
        $pdo->prepare("UPDATE auth_accounts SET failed_attempts = 0, last_login_at = NOW(), is_online = 1 WHERE id = ?")->execute([$auth_id]);

        // 7. Create session and access token
        $expires_at = date('Y-m-d H:i:s', strtotime('+30 minutes')); // or use remember_me
        $token = bin2hex(random_bytes(32));

        // Delete old access tokens
        $pdo->prepare("DELETE FROM auth_tokens WHERE auth_id = ? AND type = 'access'")->execute([$auth_id]);
        // Insert new access token
        $stmt = $pdo->prepare("INSERT INTO auth_tokens (auth_id, token, expires_at, type) VALUES (?, ?, ?, 'access')");
        $stmt->execute([$auth_id, $token, $expires_at]);

        // 8. Initialize session
        session_name('EVENTRA_CLIENT_SESS');
        if (session_status() === PHP_SESSION_NONE) {
            require_once __DIR__ . '/../../config.php';
        }
        if (session_status() === PHP_SESSION_ACTIVE) {
            session_regenerate_id(true);
        }
        $_SESSION['auth_id'] = $user['id'];
        $_SESSION['client_id'] = $user['client_id'];
        $_SESSION['user_role'] = 'client';
        $_SESSION['role'] = 'client';
        $_SESSION['auth_token'] = $token;
        $_SESSION['last_activity'] = time();
        session_write_close();

        // 9. Log success
        logSecurityEvent($user['id'], $user['email'], 'otp_verified', 'otp', 'Client login OTP verified');

        // 10. Notify admin and client
        require_once __DIR__ . '/../utils/notification-helper.php';
        $admin_id = getAdminUserId();
        if ($admin_id) {
            createClientLoginNotification($admin_id, $user['id'], $user['name'], $user['email']);
        }
        createLoginNotification($user['id'], $user['name'] ?? 'Client', $user['email'], 'client');

        echo json_encode([
            'success' => true,
            'next_step' => 'complete',
            'message' => 'Verification successful',
            'role' => 'client',
            'redirect' => '/client/pages/clientDashboard.html',
            'user' => [
                'id' => $user['id'],
                'profile_id' => (int)$user['client_id'],
                'client_id' => (int)$user['client_id'],
                'name' => $user['name'],
                'email' => $user['email'],
                'role' => 'client',
                'business_name' => $user['business_name'] ?? '',
                'profile_pic' => (function ($pic) {
                    if (!$pic) return null;
                    if (preg_match('/^https?:\/\//i', $pic)) return $pic;
                    return '/' . ltrim($pic, '/');
                })($user['profile_pic'] ?? null),
                'profile_image' => (function ($pic) {
                    if (!$pic) return null;
                    if (preg_match('/^https?:\/\//i', $pic)) return $pic;
                    return '/' . ltrim($pic, '/');
                })($user['profile_pic'] ?? null),
                'token' => $token
            ]
        ]);
        exit;

    } catch (Throwable $e) {
        error_log("Verify OTP (client_login_otp) Error: " . $e->getMessage());
        echo json_encode(['success' => false, 'message' => 'Internal server error.']);
        exit;
    }
}

// -------------------------------------------------------------------
// Legacy / Other Intents (registration_verify, client_login, password_reset)
// -------------------------------------------------------------------

if ((!isset($data['identity']) && !isset($data['email'])) || !isset($data['otp'])) {
    echo json_encode(['success' => false, 'message' => 'Identity and OTP are required.']);
    exit;
}

$identity = $data['identity'] ?? $data['email'];
$otp = $data['otp'] ?? null;
// $intent already set above

try {
    // 0. Connect to temporary pending session for registration_verify
    if ($intent === 'registration_verify') {
        session_name('EVENTRA_PENDING_SESS');
    }
    require_once __DIR__ . '/../../config/session-config.php';
    $pdo = getPDO();

    // 1. Handle Registration Verification Intent
    if ($intent === 'registration_verify') {
        if (!isset($_SESSION['pending_registration'])) {
            echo json_encode(['success' => false, 'message' => 'Verification context expired or missing. Please try signing up again.']);
            exit;
        }

        $pending = $_SESSION['pending_registration'];

        // Basic safety check for email mismatch
        if ($pending['email'] !== $identity) {
            echo json_encode(['success' => false, 'message' => 'Email mismatch.']);
            exit;
        }

        // Verify OTP
        if ($pending['otp'] !== $otp) {
            echo json_encode(['success' => false, 'message' => 'Invalid verification code.']);
            exit;
        }

        // Check expiry
        if (time() > $pending['expires_at']) {
            unset($_SESSION['pending_registration']);
            echo json_encode(['success' => false, 'message' => 'Verification code expired. Please try signing up again.']);
            exit;
        }

        // OTP is valid! Persist records.
        $pdo->beginTransaction();
        try {
            require_once __DIR__ . '/../utils/id-generator.php';
            require_once __DIR__ . '/../utils/notification-helper.php';

            $email = $pending['email'];
            $hashedPassword = $pending['password'];
            $role = $pending['role'];
            $name = $pending['name'];

            // Create auth_account
            $username = explode('@', $email)[0] . '_' . substr(bin2hex(random_bytes(2)), 0, 4);
            $stmt = $pdo->prepare("INSERT INTO auth_accounts (email, password, role, auth_provider, is_active, username) VALUES (?, ?, ?, 'local', 1, ?)");
            $stmt->execute([$email, $hashedPassword, $role, $username]);
            $auth_id = $pdo->lastInsertId();

            $role_id = null;
            $customId = null;

            // Insert into role-specific table
            if ($role === 'client') {
                $customId = generateClientId($pdo);
                $business_name = $pending['business_name'] ?? $name;
                $stmt = $pdo->prepare("INSERT INTO clients (client_auth_id, custom_id, business_name, name, verification_status) VALUES (?, ?, ?, ?, 'pending')");
                $stmt->execute([$auth_id, $customId, $business_name, $name]);
            } elseif ($role === 'admin') {
                $stmt = $pdo->prepare("INSERT INTO admins (admin_auth_id, name) VALUES (?, ?)");
                $stmt->execute([$auth_id, $name]);
                $role_id = $pdo->lastInsertId();
            } elseif ($role === 'user') {
                $customId = generateUserId($pdo);
                $stmt = $pdo->prepare("INSERT INTO users (user_auth_id, custom_id, name) VALUES (?, ?, ?)");
                $stmt->execute([$auth_id, $customId, $name]);
                $role_id = $pdo->lastInsertId();
            }

            $pdo->commit();

            // Clear pending session and switch to authenticated session
            session_unset();
            session_destroy();

            if (isset($_COOKIE[session_name()])) {
                setcookie(session_name(), '', time() - 3600, '/');
            }

            if ($role === 'client') {
                session_name('EVENTRA_CLIENT_SESS');
            } elseif ($role === 'admin') {
                session_name('EVENTRA_ADMIN_SESS');
            } else {
                session_name('EVENTRA_USER_SESS');
            }

            session_start();

            logSecurityEvent($auth_id, $email, 'registration_success', 'password', "New $role registered via OTP: $name");

            // Complete Login Flow
            $_SESSION['auth_id'] = $auth_id;
            $_SESSION['user_role'] = $role;
            $_SESSION['role'] = $role;

            if ($role === 'client') {
                $stmt = $pdo->prepare("SELECT id FROM clients WHERE client_auth_id = ?");
                $stmt->execute([$auth_id]);
                $_SESSION['client_id'] = $stmt->fetchColumn();
                $dashboard = '/client/pages/clientDashboard.html';
            } elseif ($role === 'admin') {
                $stmt = $pdo->prepare("SELECT id FROM admins WHERE admin_auth_id = ?");
                $stmt->execute([$auth_id]);
                $_SESSION['admin_id'] = $stmt->fetchColumn();
                $dashboard = '/admin/pages/adminDashboard.html';
            } else {
                $stmt = $pdo->prepare("SELECT id FROM users WHERE user_auth_id = ?");
                $stmt->execute([$auth_id]);
                $_SESSION['user_id'] = $stmt->fetchColumn();
                $dashboard = '/public/pages/index.html';
            }

            // Generate access token
            $token = bin2hex(random_bytes(32));
            $expires_at_token = date('Y-m-d H:i:s', strtotime('+2 hours'));
            $pdo->prepare("INSERT INTO auth_tokens (auth_id, token, expires_at, type) VALUES (?, ?, ?, 'access')")->execute([$auth_id, $token, $expires_at_token]);
            $_SESSION['auth_token'] = $token;

            echo json_encode([
                'success' => true,
                'message' => 'Verification successful! Logged in.',
                'redirect' => $dashboard,
                'user' => [
                    'id' => $auth_id,
                    'name' => $name,
                    'role' => $role,
                    'token' => $token
                ]
            ]);
            exit;

        } catch (Exception $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $e;
        }
    }

    // ── LEGACY FLOWS (Login/Password Reset) ───────────────────────────
    $user = resolveEntity($identity, 'client');
    $auth_id = $user['id'] ?? null;

    if (!$auth_id) {
        echo json_encode(['success' => false, 'message' => 'Invalid request.']);
        exit;
    }

    // Verify OTP for existing accounts (plain text OTP stored directly)
    $stmt = $pdo->prepare("
        SELECT id FROM auth_tokens 
        WHERE auth_id = ? AND token = ? AND type = 'otp' 
        AND revoked = 0 AND expires_at > NOW()
        ORDER BY created_at DESC LIMIT 1
    ");
    $stmt->execute([$auth_id, $otp]);
    $token_row = $stmt->fetch();

    if ($token_row) {
        // OTP is valid. Revoke it.
        $pdo->prepare("UPDATE auth_tokens SET revoked = 1 WHERE id = ?")->execute([$token_row['id']]);

        if ($intent === 'client_login') {
            // Reset failed attempts
            $pdo->prepare("UPDATE auth_accounts SET failed_attempts = 0, last_login_at = NOW(), is_online = 1 WHERE id = ?")->execute([$auth_id]);

            // Generate access token
            $token = bin2hex(random_bytes(32));
            $expires_at = date('Y-m-d H:i:s', strtotime('+2 hours'));
            $pdo->prepare("INSERT INTO auth_tokens (auth_id, token, expires_at, type) VALUES (?, ?, ?, 'access')")->execute([$auth_id, $token, $expires_at]);

            // Set role-specific PK
            $stmt = $pdo->prepare("SELECT id, name, business_name FROM clients WHERE client_auth_id = ?");
            $stmt->execute([$auth_id]);
            $client = $stmt->fetch();

            // Session already started earlier; ensure proper session name
            if (session_name() !== 'EVENTRA_CLIENT_SESS') {
                session_write_close();
                session_name('EVENTRA_CLIENT_SESS');
                session_start();
            }

            $_SESSION['auth_id'] = $auth_id;
            $_SESSION['client_id'] = $client['id'];
            $_SESSION['user_role'] = 'client';
            $_SESSION['role'] = 'client';
            $_SESSION['auth_token'] = $token;

            echo json_encode([
                'success' => true,
                'message' => 'Login verified.',
                'redirect' => '/client/pages/clientDashboard.html',
                'user' => [
                    'id' => $auth_id,
                    'name' => $client['name'],
                    'role' => 'client',
                    'token' => $token
                ]
            ]);
        } else {
            // Password Reset Flow
            $reset_token = bin2hex(random_bytes(32));
            $expires_at  = date('Y-m-d H:i:s', strtotime('+30 minutes'));

            $stmt = $pdo->prepare("INSERT INTO auth_tokens (auth_id, token, type, expires_at) VALUES (?, ?, 'reset_password', ?)");
            $stmt->execute([$auth_id, $reset_token, $expires_at]);

            echo json_encode([
                'success' => true,
                'message' => 'OTP verified successfully.',
                'reset_token' => $reset_token
            ]);
        }
    } else {
        echo json_encode(['success' => false, 'message' => 'Invalid or expired OTP.']);
    }
} catch (PDOException $e) {
    error_log("Verify OTP Error: " . $e->getMessage());
    echo json_encode(['success' => false, 'message' => 'Database error: ' . $e->getMessage()]);
} catch (Throwable $e) {
    error_log("Verify OTP Critical Error: " . $e->getMessage());
    echo json_encode(['success' => false, 'message' => 'Internal server error.']);
}