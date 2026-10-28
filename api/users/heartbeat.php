<?php

/**
 * Heartbeat API
 * Called every 60 seconds from authenticated pages to maintain online status.
 */

header('Content-Type: application/json');
require_once '../../config/database.php';
require_once '../../includes/middleware/auth.php';

$auth_id = checkAuth(); // any role

try {
    // Update auth_accounts for real-time status tracking
    $pdo->prepare("UPDATE auth_accounts SET last_seen = NOW(), is_online = 1 WHERE id = ?")->execute([$auth_id]);

    // Role-specific status sync - maintain online status.
    // NOTE (2026-09-25): admins.status is enum('active','suspended','deleted') —
    // writing 'online' threw a PDOException here (caught, but it meant the
    // heartbeat always failed for admins). Admin presence is already tracked
    // via auth_accounts.is_online above.
    $role = $_SESSION['role'] ?? $_SESSION['user_role'] ?? 'user';
    try {
        if ($role === 'client') {
            $pdo->prepare("UPDATE clients SET status = 'online' WHERE client_auth_id = ?")->execute([$auth_id]);
        } elseif ($role === 'user') {
            $pdo->prepare("UPDATE users SET status = 'online' WHERE user_auth_id = ?")->execute([$auth_id]);
        }
    } catch (PDOException $statusErr) {
        error_log('[heartbeat.php] Non-fatal status sync failure: ' . $statusErr->getMessage());
    }

    // ── Push token registration ──────────────────────────────────────────
    // The mobile app posts its FCM registration token here (on launch and on
    // token refresh) so publishing events can push a real system notification.
    // Best-effort: a missing table/config must never fail the heartbeat.
    $pushRegistered = false;
    $deviceToken = $_POST['device_token'] ?? null;
    if (is_string($deviceToken) && trim($deviceToken) !== '') {
        try {
            require_once __DIR__ . '/../utils/notification-helper.php';
            // The FK targets auth_accounts.id — checkAuth() returns the
            // profile id (users.id / clients.id), so resolve the auth id.
            $pushAuthId = function_exists('getAuthId') ? (getAuthId() ?: $auth_id) : $auth_id;
            $pushRegistered = registerDeviceToken(
                $pushAuthId,
                trim($deviceToken),
                (string) ($_POST['platform'] ?? 'android'),
                isset($_POST['device_name']) ? mb_substr((string) $_POST['device_name'], 0, 150) : null,
                isset($_POST['app_version']) ? mb_substr((string) $_POST['app_version'], 0, 50) : null
            );
        } catch (Throwable $pushErr) {
            error_log('[heartbeat.php] Non-fatal push-token registration failure: ' . $pushErr->getMessage());
        }
    }

    echo json_encode(['success' => true, 'ts' => time(), 'push_registered' => $pushRegistered]);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['success' => false]);
}
