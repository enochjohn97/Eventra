<?php
/**
 * Get Notifications API
 * Retrieves notifications for a user
 */

// MUST be the first two lines — no whitespace, no BOM before <?php
require_once __DIR__ . '/../../config.php';
// database.php is loaded lazily by the auth middleware when needed
require_once __DIR__ . '/../../includes/middleware/auth.php';

// Then immediately set JSON response header
header('Content-Type: application/json');

// Handle CORS preflight — must come before any logic
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Lightweight auth short-circuit: if there's no session cookie and no Authorization header, return 401 WITHOUT opening DB
$hasSessionCookie = isset($_COOKIE['EVENTRA_ADMIN_SESS']) || isset($_COOKIE['EVENTRA_CLIENT_SESS']) || isset($_COOKIE['EVENTRA_USER_SESS']);
$hasAuthHeader = !empty($_SERVER['HTTP_AUTHORIZATION']) || !empty($_SERVER['REDIRECT_HTTP_AUTHORIZATION']) || !empty($_SERVER['HTTP_ACCESS_TOKEN']);

if (!$hasSessionCookie && !$hasAuthHeader) {
    http_response_code(401);
    ob_clean();
    echo json_encode(['success' => false, 'message' => 'Unauthorized. Please log in.']);
    exit;
}

// Proceed with standard auth (this may lazily open DB if a bearer token is present)
checkAuth();
$auth_id = getAuthId();
$role = $_SESSION['role'] ?? $_SESSION['user_role'] ?? 'user';

$limit = $_GET['limit'] ?? 20;
$offset = $_GET['offset'] ?? 0;
$is_read = $_GET['is_read'] ?? null;

if (!$auth_id) {
    http_response_code(401);
    ob_clean();
    echo json_encode(['success' => false, 'message' => 'Unauthorized. Please log in.']);
    exit;
}

try {
    // Lazy-load PDO
    if (!function_exists('getPDO')) {
        require_once __DIR__ . '/../../config/database.php';
    }
    $pdo = getPDO();

    // Probabilistic cleanup (5% chance) to reduce DB load while keeping table clean
    if (rand(1, 100) <= 5) {
        $cleanup_stmt = $pdo->prepare("DELETE FROM notifications WHERE created_at < DATE_SUB(NOW(), INTERVAL 30 DAY)");
        $cleanup_stmt->execute();
    }

    // Build query — match auth_id and legacy rows stored with profile id (clients.id, etc.)
    $recipientIds = [(int) $auth_id];
    if ($role === 'client' && !empty($_SESSION['client_id'])) {
        $recipientIds[] = (int) $_SESSION['client_id'];
    } elseif ($role === 'admin' && !empty($_SESSION['admin_id'])) {
        $recipientIds[] = (int) $_SESSION['admin_id'];
    } elseif ($role === 'user' && !empty($_SESSION['user_id'])) {
        $recipientIds[] = (int) $_SESSION['user_id'];
    }
    $recipientIds = array_values(array_unique(array_filter($recipientIds)));

    $idPlaceholders = implode(', ', array_fill(0, count($recipientIds), '?'));
    $where_clauses = ["recipient_auth_id IN ($idPlaceholders)", "recipient_role = ?"];
    $params = array_merge($recipientIds, [$role]);

    if ($is_read !== null) {
        $where_clauses[] = "is_read = ?";
        $params[] = (int) $is_read;
    }

    $where_sql = implode(' AND ', $where_clauses);

    // Get notifications with sender information based on sender_role
    $sql = "
        SELECT 
            n.*,
            CASE 
                WHEN n.sender_role = 'admin' THEN ad.name
                WHEN n.sender_role = 'client' THEN c.business_name
                ELSE u.name
            END as sender_name,
            CASE 
                WHEN n.sender_role = 'admin' THEN ad.profile_pic
                WHEN n.sender_role = 'client' THEN c.profile_pic
                ELSE u.profile_pic
            END as sender_profile_pic
        FROM notifications n
        LEFT JOIN admins ad ON n.sender_auth_id = ad.admin_auth_id AND n.sender_role = 'admin'
        LEFT JOIN clients c ON n.sender_auth_id = c.client_auth_id AND n.sender_role = 'client'
        LEFT JOIN users u ON n.sender_auth_id = u.user_auth_id AND (n.sender_role = 'user' OR n.sender_role IS NULL)
        WHERE $where_sql
        ORDER BY n.created_at DESC
        LIMIT ? OFFSET ?
    ";

    $params[] = (int) $limit;
    $params[] = (int) $offset;

    $stmt = $pdo->prepare($sql);

    // Bind positionally but ensure integers for LIMIT/OFFSET
    foreach ($params as $key => $value) {
        $stmt->bindValue($key + 1, $value, is_int($value) ? PDO::PARAM_INT : PDO::PARAM_STR);
    }

    $stmt->execute();
    $notifications = $stmt->fetchAll();

    // Get unread count
    $count_stmt = $pdo->prepare("SELECT COUNT(*) as unread FROM notifications WHERE recipient_auth_id IN ($idPlaceholders) AND recipient_role = ? AND is_read = 0");
    $count_stmt->execute(array_merge($recipientIds, [$role]));
    $unread_count = $count_stmt->fetch()['unread'];

    ob_clean();
    echo json_encode([
        'success' => true,
        'notifications' => $notifications,
        'unread_count' => $unread_count,
        'server_time' => date('c')
    ]);
} catch (PDOException $e) {
    http_response_code(503);
    ob_clean();
    echo json_encode(['success' => false, 'message' => 'Service temporarily unavailable.']);
}
