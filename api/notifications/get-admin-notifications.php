<?php
/**
 * Get Admin Notifications API
 * Retrieves notifications specifically for administrators
 */

// Protect output
if (!headers_sent()) {
    ob_start();
}

require_once '../../config/database.php';
require_once '../../includes/middleware/auth.php';

// Set JSON response header
header('Content-Type: application/json');

// Lightweight short-circuit: if no session cookie and no Authorization header, return 401 without opening DB
$hasSessionCookie = isset($_COOKIE['EVENTRA_ADMIN_SESS']) || isset($_COOKIE['EVENTRA_CLIENT_SESS']) || isset($_COOKIE['EVENTRA_USER_SESS']);
$hasAuthHeader = !empty($_SERVER['HTTP_AUTHORIZATION']) || !empty($_SERVER['REDIRECT_HTTP_AUTHORIZATION']) || !empty($_SERVER['HTTP_ACCESS_TOKEN']);

if (!$hasSessionCookie && !$hasAuthHeader) {
    http_response_code(401);
    if (ob_get_length()) ob_clean();
    echo json_encode(['success' => false, 'message' => 'Unauthorized. Please log in.']);
    exit;
}

// Perform auth check
try {
    checkAuth('admin');
    $admin_auth_id = getAuthId();
    $role = $_SESSION['role'] ?? 'admin';

    // Verify user is indeed admin
    if ($role !== 'admin' || !$admin_auth_id) {
        http_response_code(403);
        if (ob_get_length()) ob_clean();
        echo json_encode(['success' => false, 'message' => 'Access denied. Admin only.']);
        exit;
    }

    // Lazy-load PDO
    $pdo = getPDO();

    // Auto-delete notifications older than 7 days (non-critical cleanup)
    try {
        $pdo->prepare("DELETE FROM notifications WHERE created_at < DATE_SUB(NOW(), INTERVAL 7 DAY)")->execute();
    } catch (Exception $e) {
        // silence cleanup errors
    }

    // Fetch notifications for admin, ordered by newest first
    // Join with clients, admins, and users to get sender details regardless of role
    $stmt = $pdo->prepare("
        SELECT n.*, 
               CASE 
                   WHEN n.sender_role = 'client' THEN c.business_name 
                   WHEN n.sender_role = 'admin' THEN ad.name
                   ELSE u.name 
               END as sender_name,
               CASE 
                   WHEN n.sender_role = 'client' THEN c.profile_pic 
                   WHEN n.sender_role = 'admin' THEN ad.profile_pic
                   ELSE u.profile_pic 
               END as sender_profile_pic
        FROM notifications n
        LEFT JOIN clients c ON n.sender_auth_id = c.client_auth_id AND n.sender_role = 'client'
        LEFT JOIN admins ad ON n.sender_auth_id = ad.admin_auth_id AND n.sender_role = 'admin'
        LEFT JOIN users u ON n.sender_auth_id = u.user_auth_id AND (n.sender_role = 'user' OR n.sender_role IS NULL)
        WHERE n.recipient_auth_id = ? AND n.recipient_role = 'admin'
        ORDER BY n.created_at DESC
        LIMIT 20
    ");
    $stmt->execute([$admin_auth_id]);
    $notifications = [];
    $seenNotificationIds = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $notification) {
        $notificationId = (int) ($notification['id'] ?? 0);
        if ($notificationId && isset($seenNotificationIds[$notificationId])) continue;
        if ($notificationId) $seenNotificationIds[$notificationId] = true;
        $notifications[] = $notification;
    }

    // TRUE unread total (same fix as get-notifications.php) — the previous
    // page-count approach capped the admin badge at the LIMIT of 20.
    $unread_stmt = $pdo->prepare("
        SELECT COUNT(*) FROM notifications n
        WHERE n.recipient_auth_id = ? AND n.recipient_role = 'admin' AND n.is_read = 0
    ");
    $unread_stmt->execute([$admin_auth_id]);
    $unread_count = (int) $unread_stmt->fetchColumn();

    if (ob_get_length()) ob_clean();
    echo json_encode([
        'success' => true,
        'notifications' => $notifications,
        'unread_count' => (int) $unread_count,
        'timestamp' => date('Y-m-d H:i:s')
    ]);
} catch (PDOException $e) {
    error_log('Admin notifications DB error: ' . $e->getMessage());
    http_response_code(503);
    if (ob_get_length()) ob_clean();
    echo json_encode([
        'success' => false,
        'message' => 'Service temporarily unavailable. Please try again later.'
    ]);
} catch (Exception $e) {
    error_log('Admin notifications error: ' . $e->getMessage());
    http_response_code(500);
    if (ob_get_length()) ob_clean();
    echo json_encode([
        'success' => false,
        'message' => 'An internal server error occurred.'
    ]);
}
