<?php
header('Content-Type: application/json');
require_once '../../config/database.php';
require_once '../../includes/helpers/entity-resolver.php';

$data = json_decode(file_get_contents("php://input"), true);


// Verify Google JWT credential using Google tokeninfo endpoint
require_once '../../config/env-loader.php';

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
$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

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

$google_id = $payload['sub'];
$email = $payload['email'];
$name = $payload['name'] ?? 'Google User';
$profile_pic = $payload['picture'] ?? null;

// Implicit Intent Resolution (from dedicated login pages)
$intent = $data['intent'] ?? 'user';
if (!in_array($intent, ['client', 'user', 'admin'])) {
    $intent = 'user';
}

try {
    // 1. Resolve Entity by email
    $user = resolveEntity($email);

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
            $stmt = $pdo->prepare("INSERT INTO clients (client_auth_id, business_name, email, name, profile_pic, password) VALUES (?, ?, ?, ?, ?, 'GOOGLE_AUTH')");
            $stmt->execute([$auth_id, $name, $email, $name, $profile_pic]);
        } else {
            // Default to 'user' role
            $stmt = $pdo->prepare("INSERT INTO users (user_auth_id, name, profile_pic) VALUES (?, ?, ?)");
            $stmt->execute([$auth_id, $name, $profile_pic]);
        }

        $pdo->commit();
        $user = resolveEntity($email);
    }

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

    // 4. Set Entity-Scoped Session
    $userRole = strtolower($user['role']);
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
            'role' => $userRole,
            'profile_pic' => $user['profile_pic'] ?? null,
            'token' => $token
        ]
    ]);
} catch (PDOException $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    echo json_encode(['success' => false, 'message' => 'Auth failed due to server error.']);
}
