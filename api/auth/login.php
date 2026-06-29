<?php
// Enable error logging without breaking JSON output
ini_set('display_errors', 0);
ini_set('log_errors', 1);
ini_set('error_log', __DIR__ . '/../../logs/php-errors.log');
error_reporting(E_ALL);

// Parse intent FIRST to set correct session name before ANY session initialization
$data = json_decode(file_get_contents("php://input"), true);
$intent = $auth_intent ?? (isset($data['intent']) ? $data['intent'] : 'client');

// Force normalization to remove trailing spaces or handle 'clients' -> 'client'
$intent = strtolower(trim($intent));
$intent = rtrim($intent, 's'); // e.g., 'clients' becomes 'client'

// Set session name BEFORE database.php which might access sessions
if (!in_array($intent, ['admin', 'client', 'user'])) {
    header('Content-Type: application/json');
    echo json_encode(['success' => false, 'message' => 'Invalid authentication path: ' . htmlspecialchars($intent)]);
    exit;
}

// Pre-initialize session with correct name to prevent auto-detection issues
$sessionName = 'EVENTRA_USER_SESS';
if ($intent === 'admin') {
    $sessionName = 'EVENTRA_ADMIN_SESS';
} elseif ($intent === 'client') {
    $sessionName = 'EVENTRA_CLIENT_SESS';
}

session_name($sessionName);

// NOW send the JSON header
header('Content-Type: application/json');

require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../config.php';
require_once __DIR__ . '/../../includes/helpers/entity-resolver.php';

$identity = $data['email'] ?? $data['username'] ?? null;
$password = $data['password'] ?? null;

if (!$identity || !$password) {
    $fieldLabel = ($intent === 'admin') ? 'Username' : 'Username/Email';
    echo json_encode(['success' => false, 'message' => "$fieldLabel and password are required."]);
    exit;
}

$remember_me = isset($data['remember_me']) && $data['remember_me'] === true;

try {
    // 1. Resolve Entity (Centralized Backend Decision)
    $user = resolveEntity($identity, $intent);

    if (!$user) {
        logSecurityEvent(null, $identity, 'login_failure', 'password', "Identity not found.");
        $fieldLabel = ($intent === 'admin') ? 'username' : 'email';
        echo json_encode(['success' => false, 'message' => "Invalid $fieldLabel or password."]);
        exit;
    }

    // 2. Validate Role Compatibility & Provider Policy
    $userRole = strtolower($user['role'] ?? '');
    $effectiveIntent = strtolower($intent);

    // Enforce role-specific portal entry
    if ($userRole !== $effectiveIntent) {
        logSecurityEvent($user['id'], $identity, 'login_failure', 'password', "Role mismatch: User is $userRole but tried as $effectiveIntent");
        $targetPortal = ucfirst($userRole);
        echo json_encode(['success' => false, 'message' => "Access denied. This is a $targetPortal account. Please use the appropriate portal."]);
        exit;
    }

    // Enforce Admin Local-Only Policy
    if ($userRole === 'admin' && $user['auth_provider'] !== 'local') {
        logSecurityEvent($user['id'], $identity, 'login_failure', 'password', "Admin account attempted login with non-local state.");
        echo json_encode(['success' => false, 'message' => "Admin accounts must use local authentication."]);
        exit;
    }

    // Account Status Check
    if (isset($user['is_active']) && $user['is_active'] == 0) {
        logSecurityEvent($user['id'], $identity, 'login_failure', 'password', "Account is inactive.");
        echo json_encode(['success' => false, 'message' => "Your account is inactive. Please contact support."]);
        exit;
    }

    // Check account lock BEFORE password verification (timing attack prevention)
    if ($user['locked_until'] && strtotime($user['locked_until']) > time()) {
        echo json_encode(['success' => false, 'message' => 'Account is temporarily locked. Please try again later.']);
        exit;
    }

    if (password_verify($password, $user['password'])) {
        // --- 3. Enforce Auth Policy ---
        $policy = getAuthPolicy($userRole, 'password', $user);
        if (!$policy['allowed']) {
            logSecurityEvent($user['id'], $identity, 'login_failure', 'password', "Policy Violation: " . $policy['message']);
            http_response_code(403);
            echo json_encode(['success' => false, 'message' => $policy['message']]);
            exit;
        }

        // --- CLIENT LOGIN OTP FLOW (with fault‑tolerant email helper) ---
        if ($userRole === 'client') {
            $otp = sprintf("%06d", random_int(0, 999999));
            $otp_hash = password_hash($otp, PASSWORD_DEFAULT);
            $otp_expires_at = date('Y-m-d H:i:s', strtotime('+10 minutes'));

            $pdo = getPDO();
            $pdo->prepare("DELETE FROM auth_tokens WHERE auth_id = ? AND type = 'otp'")->execute([$user['id']]);
            $stmt = $pdo->prepare("INSERT INTO auth_tokens (auth_id, token, expires_at, type) VALUES (?, ?, ?, 'otp')");
            $stmt->execute([$user['id'], $otp_hash, $otp_expires_at]);

            // Load email helper (new version is fault‑tolerant)
            $emailSent = false;
            $emailMessage = 'Email service unavailable (check logs).';
            $emailHelperLoaded = false;

            try {
                $emailHelperPath = __DIR__ . '/../../includes/helpers/email-helper.php';
                if (file_exists($emailHelperPath)) {
                    include_once $emailHelperPath;
                }
            } catch (Throwable $e) {
                error_log('[AUTH] EmailHelper load failed: ' . $e->getMessage());
                echo json_encode(['success' => false, 'message' => 'Login service temporarily unavailable. Please try again.']);
                exit;
            }

            if (class_exists('EmailHelper')) {
                $emailHelperLoaded = true;
                $subject = "Your Eventra Client Login Code";
                $message = "Your one-time login verification code is: <strong>$otp</strong><br>It expires in 10 minutes.";
                $emailResult = EmailHelper::sendEmail($user['email'], $subject, "<h2>Login Verification</h2><p>$message</p>");
                $emailSent = $emailResult['success'];
                if (!$emailSent) {
                    error_log("OTP for client {$user['email']} (Auth ID: {$user['id']}): $otp (Email delivery failed: {$emailResult['message']})");
                } else {
                    error_log("OTP for client {$user['email']} sent successfully.");
                }
                $emailMessage = $emailResult['message'];
            } else {
                error_log("OTP for client {$user['email']} (Auth ID: {$user['id']}): $otp (EmailHelper class not available)");
            }

            // Return explicit next_step for frontend
            echo json_encode([
                'success' => true,
                'otp_required' => true,
                'next_step' => 'otp_verification',
                'message' => $emailHelperLoaded ? ($emailSent ? 'A verification code has been sent to your email.' : 'A verification code has been generated (email delivery issue).') : 'A verification code has been generated (check logs).',
                'user_email' => $user['email'], // optional: to display on OTP modal
                'auth_id' => $user['id']        // optional: for resend OTP functionality
            ]);
            exit;
        }

        // Reset failed attempts on success
        $pdo->prepare("UPDATE auth_accounts SET failed_attempts = 0, last_login_at = NOW(), is_online = 1 WHERE id = ?")->execute([$user['id']]);

        // Update role-specific status when user logs in
        $expires_in = $remember_me ? '+30 days' : '+7 days'; // Increased from 30 minutes to 7 days
        $expires_at = date('Y-m-d H:i:s', strtotime($expires_in));

        // Generate a new access token
        $token = bin2hex(random_bytes(32));

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

        // Ensure correct session name before operations
        if (session_name() !== $expectedSessionName) {
            if (session_status() === PHP_SESSION_ACTIVE) {
                session_write_close();
            }
            session_name($expectedSessionName);
        }

        // Ensure session is initialized via centralized config
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

        // Strict Role-Specific Session Keys + Universal auth_id
        $_SESSION['auth_id'] = $user['id']; // Global auth account ID
        $profileId = null;
        if ($userRole === 'admin') {
            $stmt = $pdo->prepare("SELECT id FROM admins WHERE admin_auth_id = ?");
            $stmt->execute([$user['id']]);
            $adminId = $stmt->fetchColumn();
            if ($adminId) {
                $_SESSION['admin_id'] = $adminId;
                $profileId = (int)$adminId;
            } else {
                $stmt = $pdo->prepare("INSERT INTO admins (admin_auth_id, name) VALUES (?, ?)");
                $stmt->execute([$user['id'], $user['name'] ?? 'Admin']);
                $_SESSION['admin_id'] = $pdo->lastInsertId();
                $profileId = (int)$_SESSION['admin_id'];
            }
        } elseif ($userRole === 'client') {
            $stmt = $pdo->prepare("SELECT id FROM clients WHERE client_auth_id = ?");
            $stmt->execute([$user['id']]);
            $clientId = $stmt->fetchColumn();
            if ($clientId) {
                $_SESSION['client_id'] = $clientId;
                $profileId = (int)$clientId;
            } else {
                $stmt = $pdo->prepare("INSERT INTO clients (client_auth_id, name, business_name) VALUES (?, ?, ?)");
                $stmt->execute([$user['id'], $user['name'] ?? 'Client', $user['business_name'] ?? '']);
                $_SESSION['client_id'] = $pdo->lastInsertId();
                $profileId = (int)$_SESSION['client_id'];
            }
        } elseif ($userRole === 'user') {
            $stmt = $pdo->prepare("SELECT id FROM users WHERE user_auth_id = ?");
            $stmt->execute([$user['id']]);
            $userId = $stmt->fetchColumn();
            if ($userId) {
                $_SESSION['user_id'] = $userId;
                $profileId = (int)$userId;
            } else {
                $stmt = $pdo->prepare("INSERT INTO users (user_auth_id, name) VALUES (?, ?)");
                $stmt->execute([$user['id'], $user['name'] ?? 'User']);
                $_SESSION['user_id'] = $pdo->lastInsertId();
                $profileId = (int)$_SESSION['user_id'];
            }
        }

        $_SESSION['user_role'] = $userRole;
        $_SESSION['role'] = $userRole; // Normalize for legacy API support
        $_SESSION['auth_token'] = $token;
        $_SESSION['last_activity'] = time();

        // CRITICAL: Write session to disk before sending response
        session_write_close();

        // Log success
        logSecurityEvent($user['id'], $identity, 'login_success', 'password', "Logged in as $userRole (Role ID: " . ($_SESSION[$userRole . '_id'] ?? 'N/A') . ") via portal $effectiveIntent");

        // Notify admin of login activity
        require_once __DIR__ . '/../utils/notification-helper.php';
        $admin_id = getAdminUserId();
        if ($admin_id) {
            if ($userRole === 'client') {
                createClientLoginNotification($admin_id, $user['id'], $user['name'] ?? 'Client', $identity);
            } elseif ($userRole === 'user') {
                createUserLoginNotification($admin_id, $user['id'], $user['name'] ?? 'User', $identity);
            } elseif ($userRole === 'admin') {
                createAdminLoginNotification($user['id']);
            }
        }

        // Role-Based Redirects (absolute paths for JS redirect)
        $redirect = '/public/pages/index.html'; // Default for users
        if ($userRole === 'admin') {
            $redirect = '/admin/pages/adminDashboard.html';
        } elseif ($userRole === 'client') {
            $redirect = '/client/pages/clientDashboard.html';
        }

        echo json_encode([
            'success' => true,
            'next_step' => 'complete',
            'message' => 'Login successful',
            'role' => $userRole,
            'redirect' => $redirect,
            'user' => [
                'id' => $user['id'],
                'profile_id' => $profileId,
                'name' => $user['name'],
                'email' => $user['email'],
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
        exit;
    } else {
        // Increment failed attempts
        $pdo->prepare("UPDATE auth_accounts SET failed_attempts = failed_attempts + 1 WHERE id = ?")->execute([$user['id']]);

        // Lock account if failures exceed threshold
        if (($user['failed_attempts'] ?? 0) >= 5) {
            $lockTime = date('Y-m-d H:i:s', strtotime('+15 minutes'));
            $pdo->prepare("UPDATE auth_accounts SET locked_until = ? WHERE id = ?")->execute([$lockTime, $user['id']]);
        }

        logSecurityEvent($user['id'], $identity, 'login_failure', 'password', "Invalid password.");
        $fieldLabel = ($intent === 'admin') ? 'username' : 'email';
        echo json_encode(['success' => false, 'message' => "Invalid $fieldLabel or password."]);
    }
} catch (Throwable $e) {
    error_log("[" . date('Y-m-d H:i:s') . "] AUTH ERROR in " . __FILE__ . ":" . __LINE__ . " - " . $e->getMessage() . "\nStack trace:\n" . $e->getTraceAsString());
    echo json_encode(['success' => false, 'message' => 'Database error occurred']);
}