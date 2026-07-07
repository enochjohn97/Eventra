<?php

header('Content-Type: application/json');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Cache-Control: post-check=0, pre-check=0', false);
header('Pragma: no-cache');
error_reporting(0); // Suppress warnings for clean JSON output
ini_set('display_errors', 0);
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/helpers/entity-resolver.php';

// Polyfill for getallheaders() - required for InfinityFree and some shared hosting
if (!function_exists('getallheaders')) {
    function getallheaders()
    {
        $headers = [];
        
        // Check for Apache's mod_php or CGI
        if (function_exists('apache_request_headers')) {
            return apache_request_headers();
        }
        
        // Manual header collection from $_SERVER (works for CGI, FastCGI, etc.)
        foreach ($_SERVER as $name => $value) {
            if (substr($name, 0, 5) === 'HTTP_') {
                // Convert HTTP_X_FORWARDED_FOR to X-Forwarded-For
                $header = str_replace(' ', '-', ucwords(strtolower(str_replace('_', ' ', substr($name, 5)))));
                $headers[$header] = $value;
            } elseif (in_array($name, ['CONTENT_TYPE', 'CONTENT_LENGTH', 'CONTENT_MD5'])) {
                // These don't have HTTP_ prefix but are still headers
                $header = str_replace('_', '-', ucwords(strtolower($name)));
                $headers[$header] = $value;
            }
        }
        
        return $headers;
    }
}

// 1. Resolve Portal Intent from Headers for Correct Session Targeting
$headers = getallheaders();
$portal = $_GET['portal'] ?? $_SERVER['HTTP_X_EVENTRA_PORTAL'] ?? $headers['X-Eventra-Portal'] ?? $headers['x-eventra-portal'] ?? null;

// Fallback: detect from Referer for reliability on client-side redirects
if (!$portal) {
    $referer = $_SERVER['HTTP_REFERER'] ?? '';
    if (strpos($referer, '/admin/') !== false) {
        $portal = 'admin';
    } elseif (strpos($referer, '/client/') !== false) {
        $portal = 'client';
    } else {
        $portal = 'user';
    }
}

// 2. Set Role-Specific Session Name BEFORE starting session
$expectedSessionName = 'EVENTRA_USER_SESS';
if ($portal === 'admin') {
    $expectedSessionName = 'EVENTRA_ADMIN_SESS';
} elseif ($portal === 'client') {
    $expectedSessionName = 'EVENTRA_CLIENT_SESS';
}

if (session_name() !== $expectedSessionName) {
    if (session_status() === PHP_SESSION_ACTIVE) {
        session_write_close();
    }
    session_name($expectedSessionName);
}

if (session_status() === PHP_SESSION_NONE) {
    require_once __DIR__ . '/../../server/config.php';
}

// --- Resolve session state ---
$sessionRole = $_SESSION['user_role'] ?? $_SESSION['role'] ?? null;
$token       = $_SESSION['auth_token'] ?? null;
// $authId is auth_accounts.id — used to verify the token in the DB
$authId      = $_SESSION['auth_id'] ?? null;
// $user_id is the role-specific profile ID (admins.id, clients.id, users.id)
$user_id     = null;

if ($sessionRole === 'admin') {
    $user_id = $_SESSION['admin_id'] ?? null;
} elseif ($sessionRole === 'client') {
    $user_id = $_SESSION['client_id'] ?? null;
} else {
    $user_id = $_SESSION['user_id'] ?? null;
}

// Fallback to Bearer Token if session token is not set
if (!$token) {
    $authHeader = $headers['Authorization'] ?? $headers['authorization'] ?? '';
    if (preg_match('/Bearer\s(\S+)/', $authHeader, $matches)) {
        $token = $matches[1];
    }
}

// Fallback to Role detection from header if session role is not set
if (!$sessionRole) {
    if ($portal && $portal !== 'user') {
        $sessionRole = $portal;
    }
}

// Token-only fallback: rebuild $authId and $user_id from the token when session is missing
if ($token && (!$authId || !$user_id)) {
    $stmt = $pdo->prepare("
        SELECT t.auth_id, a.role
        FROM auth_tokens t
        JOIN auth_accounts a ON a.id = t.auth_id
        WHERE t.token = ? AND t.expires_at > NOW()
    ");
    $stmt->execute([$token]);
    $tokenRow = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($tokenRow) {
        $authId = (int) $tokenRow['auth_id'];

        // Let the token's actual role override if session had none
        if (!$sessionRole || $sessionRole === 'user') {
            $sessionRole = strtolower($tokenRow['role']);
        }

        // Derive the role-specific profile ID from the correct table
        if ($sessionRole === 'admin') {
            $s2 = $pdo->prepare("SELECT id FROM admins WHERE admin_auth_id = ?");
        } elseif ($sessionRole === 'client') {
            $s2 = $pdo->prepare("SELECT id FROM clients WHERE client_auth_id = ?");
        } else {
            $s2 = $pdo->prepare("SELECT id FROM users WHERE user_auth_id = ?");
        }
        $s2->execute([$authId]);
        $user_id = $s2->fetchColumn();
    }
}

if (!$sessionRole || !$user_id || !$authId || !$token) {
    echo json_encode(['success' => false, 'message' => 'Not authenticated']);
    exit;
}

try {
    // Verify the token against the auth_accounts.id (NOT the profile id)
    $stmt = $pdo->prepare("
        SELECT a.id, a.email, a.role, a.is_active
        FROM auth_accounts a
        JOIN auth_tokens t ON a.id = t.auth_id
        WHERE t.token = ? AND a.id = ? AND t.expires_at > NOW() AND t.revoked = 0
    ");
    $stmt->execute([$token, $authId]);
    $account = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$account || strtolower($account['role']) !== strtolower($sessionRole)) {
        echo json_encode(['success' => false, 'message' => 'Invalid session']);
        exit;
    }

    // Update last_seen heartbeat
    $pdo->prepare("UPDATE auth_accounts SET last_seen = NOW() WHERE id = ?")->execute([$account['id']]);

    $user = resolveEntity($account['email'], $account['role']);

    echo json_encode([
        'success' => true,
        'user' => [
            'id'            => $user['id'],
            'name'          => $user['name'],
            'email'         => $user['email'],
            'phone'         => $user['phone'] ?? null,
            'role'          => $user['role'],
            'dob'           => $user['dob'] ?? null,
            'gender'        => $user['gender'] ?? null,
            'country'       => $user['country'] ?? null,
            'city'          => $user['city'] ?? null,
            'state'         => $user['state'] ?? null,
            'address'       => $user['address'] ?? null,
            'profile_image' => (function ($pic) {
                if (!$pic) {
                    return null;
                }
                if (preg_match('/^https?:\/\//i', $pic)) {
                    return $pic;
                }
                return '/' . ltrim($pic, '/');
            })($user['profile_pic'] ?? null),
            'custom_id'     => $user['custom_id'] ?? null,
            'bvn'           => $user['bvn'] ?? null,
            'token'         => $token
        ]
    ]);
} catch (PDOException $e) {
    echo json_encode(['success' => false, 'message' => 'Server error']);
}
