<?php
// Lightweight heartbeat: avoid opening DB unless necessary
if (!headers_sent()) {
    ob_start();
}
error_reporting(0);

/**
 * Universal Heartbeat API
 * Called frequently from authenticated pages. Keep it cheap.
 */

header('Content-Type: application/json');
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../includes/middleware/auth.php';

// If there's no session cookie and no Authorization header, short-circuit without DB
$hasSessionCookie = isset($_COOKIE['EVENTRA_ADMIN_SESS']) || isset($_COOKIE['EVENTRA_CLIENT_SESS']) || isset($_COOKIE['EVENTRA_USER_SESS']);
$hasAuthHeader = !empty($_SERVER['HTTP_AUTHORIZATION']) || !empty($_SERVER['REDIRECT_HTTP_AUTHORIZATION']) || !empty($_SERVER['HTTP_ACCESS_TOKEN']);

if (!$hasSessionCookie && !$hasAuthHeader) {
    ob_clean();
    echo json_encode(['success' => true, 'ts' => time(), 'note' => 'no_auth']);
    exit;
}

// Ensure session is active
if (session_status() === PHP_SESSION_NONE) {
    require_once __DIR__ . '/../config/session-config.php';
}

// Rate-limit DB writes: only touch DB if more than 60s since last update
$now = time();
$last_hb = $_SESSION['last_heartbeat_update'] ?? 0;
if (($now - $last_hb) < 60) {
    ob_clean();
    echo json_encode(['success' => true, 'ts' => $now, 'note' => 'skip']);
    exit;
}

// Update session timestamp immediately to avoid race conditions
$_SESSION['last_heartbeat_update'] = $now;

// If no auth id yet (anonymous session), return success
$auth_id = getAuthId();
if (!$auth_id) {
    ob_clean();
    echo json_encode(['success' => true, 'ts' => $now, 'note' => 'no_auth_id']);
    exit;
}

try {
    // Lazy-load PDO and perform a single cheap update
    require_once __DIR__ . '/../config/database.php';
    $pdo = getPDO();
    $stmt = $pdo->prepare("UPDATE auth_accounts SET last_seen = NOW(), is_online = 1 WHERE id = ?");
    $stmt->execute([$auth_id]);

    ob_clean();
    echo json_encode(['success' => true, 'ts' => $now]);
} catch (PDOException $e) {
    error_log('Heartbeat DB error: ' . $e->getMessage());
    if (!headers_sent()) header('Content-Type: application/json');
    http_response_code(503);
    ob_clean();
    echo json_encode(['success' => false, 'message' => 'Service temporarily unavailable.']);
    exit;
}
