<?php
// Silence warnings/notice output to prevent JSON corruption
if (!headers_sent()) {
    ob_start();
}
error_reporting(0);
ini_set('display_errors', 0);
date_default_timezone_set('Africa/Lagos'); 

// Prevent multiple session starts
if (session_status() === PHP_SESSION_ACTIVE) {
    return;
}

// Configure session settings BEFORE starting the session
ini_set('session.use_cookies', '1');
ini_set('session.use_only_cookies', '1');
ini_set('session.cookie_httponly', '1');
ini_set('session.cookie_samesite', 'Lax');
ini_set('session.cookie_path', '/');

// Try to use project session path, fallback to system temp if permissions denied
    $temp_path = sys_get_temp_dir();
    if (is_writable($temp_path)) {
        ini_set('session.save_path', $temp_path);
    }

// Default timeout (can be overridden by roles)
$timeout_duration = 3600; // 1 hour inactivity timeout

ini_set('session.cookie_lifetime', $timeout_duration); // Set cookie lifetime to match timeout
ini_set('session.gc_maxlifetime', $timeout_duration);

// CSRF Protection Initialization
if (session_status() === PHP_SESSION_NONE) {
    // Session name should be set by the caller (Router or LoginController)
    // If not set, use a fallback that detects the portal context
    if (!session_name() || session_name() === 'PHPSESSID' || session_name() === 'EVENTRA_GUEST_SESS') {
        $headers = function_exists('getallheaders') ? getallheaders() : [];
        $portal = $_SERVER['HTTP_X_EVENTRA_PORTAL'] ?? $headers['X-Eventra-Portal'] ?? $headers['x-eventra-portal'] ?? null;
        
        // If no header, try to detect from URI first (more specific)
        if (!$portal) {
            $uri = $_SERVER['REQUEST_URI'] ?? '';
            
            if (strpos($uri, '/admin/') !== false || strpos($uri, '/api/admin/') !== false) {
                $portal = 'admin';
            } elseif (strpos($uri, '/client/') !== false || strpos($uri, '/api/client/') !== false || strpos($uri, '/api/clients/') !== false || strpos($uri, '/api/stats/get-client-dashboard-stats.php') !== false) {
                $portal = 'client';
            } elseif (strpos($uri, '/user/') !== false || strpos($uri, '/api/user/') !== false) {
                $portal = 'user';
            }
        }
        
        // Fallback to cookies if URI didn't match a specific portal
        if (!$portal) {
            if (isset($_COOKIE['EVENTRA_ADMIN_SESS'])) {
                $portal = 'admin';
            } elseif (isset($_COOKIE['EVENTRA_CLIENT_SESS'])) {
                $portal = 'client';
            } elseif (isset($_COOKIE['EVENTRA_USER_SESS'])) {
                $portal = 'user';
            }
        }
    }

    if ($portal === 'admin') {
        session_name('EVENTRA_ADMIN_SESS');
    } elseif ($portal === 'client') {
        session_name('EVENTRA_CLIENT_SESS');
    } else {
        session_name('EVENTRA_USER_SESS');
    }
}

// Ensure session is started WITH the custom name set above
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

if (!isset($_SESSION['csrf_token'])) {
    $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
}

// The $timeout_duration is 1 hour. Only logout if truly exceeded.
if (isset($_SESSION['last_activity']) && (time() - $_SESSION['last_activity'] > $timeout_duration)) {
    // Session expired due to inactivity
    if (session_status() === PHP_SESSION_ACTIVE) {
        session_unset();
        session_destroy();
    }
}
$_SESSION['last_activity'] = time();
