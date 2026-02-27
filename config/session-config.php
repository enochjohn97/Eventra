<?php
// Enable strict error reporting for debugging
error_reporting(E_ALL);
ini_set('display_errors', 0);

// Prevent multiple session starts
if (session_status() === PHP_SESSION_ACTIVE) {
    return;
}

// Configure session settings BEFORE starting the session
ini_set('session.use_cookies', '1');
ini_set('session.use_only_cookies', '1');
ini_set('session.cookie_httponly', '1');
ini_set('session.cookie_samesite', 'Lax'); // Changed from Strict to Lax for better CSRF protection and redirect compatibility

ini_set('session.cookie_lifetime', '7200'); // 2 hours
ini_set('session.gc_maxlifetime', '7200'); // 2 hours

// For localhost development, ensure cookies work properly
$currentHost = $_SERVER['HTTP_HOST'] ?? '';
$isLocal = (strpos($currentHost, 'localhost') !== false || strpos($currentHost, '127.0.0.1') !== false);

if ($isLocal) {
    ini_set('session.cookie_domain', '');
    ini_set('session.cookie_path', '/');
    ini_set('session.cookie_secure', '0');
} else {
    // Production settings
    ini_set('session.cookie_secure', '1'); // Require HTTPS in production
}

// Set session save path to a project-local directory for reliability
$session_path = __DIR__ . '/../sessions';
if (!is_dir($session_path)) {
    mkdir($session_path, 0700, true); // More restrictive permissions
}
ini_set('session.save_path', $session_path);

/**
 * Robustly determine the correct session name based on the target portal.
 * This prevents cross-role session leakage.
 */
function getEventraSessionName()
{
    $uri = $_SERVER['REQUEST_URI'] ?? '';
    $referer = $_SERVER['HTTP_REFERER'] ?? '';
    $portalHeader = $_SERVER['HTTP_X_EVENTRA_PORTAL'] ?? '';

    // Priority 1: Explicit Portal Header (Trusted source for internal requests)
    if ($portalHeader === 'admin')
        return 'EVENTRA_ADMIN_SESS';
    if ($portalHeader === 'client')
        return 'EVENTRA_CLIENT_SESS';
    if ($portalHeader === 'user')
        return 'EVENTRA_USER_SESS';

    // Priority 2: Direct Path Detection (Most common for direct browser access)
    if (strpos($uri, '/admin/') !== false) {
        return 'EVENTRA_ADMIN_SESS';
    }
    if (strpos($uri, '/client/') !== false) {
        return 'EVENTRA_CLIENT_SESS';
    }

    // Priority 3: API Context Handling
    if (strpos($uri, '/api/') !== false) {
        // Stats and role-specific endpoints
        if (strpos($uri, '/get-admin') !== false || strpos($uri, '/admin-') !== false)
            return 'EVENTRA_ADMIN_SESS';
        if (strpos($uri, '/get-client') !== false || strpos($uri, '/client-') !== false)
            return 'EVENTRA_CLIENT_SESS';

        // Check Referer for portal context if not explicitly in URI
        if (strpos($referer, '/admin/') !== false)
            return 'EVENTRA_ADMIN_SESS';
        if (strpos($referer, '/client/') !== false)
            return 'EVENTRA_CLIENT_SESS';
    }

    // Default for users/public
    return 'EVENTRA_USER_SESS';
}

// Start the session with a role-specific name
$sessionName = getEventraSessionName();
session_name($sessionName);

// Set cookie params to match the role-specific session and path if needed
$cookieParams = session_get_cookie_params();
session_set_cookie_params([
    'lifetime' => $cookieParams['lifetime'],
    'path' => $cookieParams['path'],
    'domain' => $cookieParams['domain'],
    'secure' => $cookieParams['secure'],
    'httponly' => true,
    'samesite' => 'Lax'

]);

session_start();

// Enforce 30-minute inactivity timeout at the core session level
$timeout_duration = 1800; // 30 minutes
if (isset($_SESSION['last_activity']) && (time() - $_SESSION['last_activity']) > $timeout_duration) {
    // Session expired due to inactivity
    session_unset();
    session_destroy();
    session_start(); // Restart a fresh, empty session explicitly
}
$_SESSION['last_activity'] = time();
