<?php
/**
 * Get Payments API
 * Returns paginated, filterable payment list.
 * Users/Clients: own payments only. Admins: all payments.
 */

// MUST be the first two lines — no whitespace, no BOM before <?php
require_once __DIR__ . '/../../server/config.php'; 
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/middleware/auth.php';

// Then immediately set JSON response header
header('Content-Type: application/json');

// Handle CORS preflight — must come before any logic
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Authenticate via robust middleware
$auth_id = checkAuth(['user', 'admin', 'client']);
$sessionRole = $_SESSION['user_role'] ?? $_SESSION['role'] ?? null;

if (!$sessionRole) {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => 'Access denied. Role not found in session.']);
    exit();
}

$isAdmin = ($sessionRole === 'admin');

// ─── Query parameters ──────────────────────────────────────────────────────
$page = max(1, (int) ($_GET['page'] ?? 1));
$limit = min(100, max(1, (int) ($_GET['limit'] ?? 20)));
$offset = ($page - 1) * $limit;
$sort = $_GET['sort'] ?? 'date_desc';
$dateRange = $_GET['date_range'] ?? 'all';
$status = $_GET['status'] ?? '';
$search = trim($_GET['search'] ?? '');
$dateFrom = $_GET['date_from'] ?? '';
$dateTo = $_GET['date_to'] ?? '';

// ─── Sorting ───────────────────────────────────────────────────────────────
$orderMap = [
    'date_desc' => 'p.created_at DESC',
    'date_asc' => 'p.created_at ASC',
    'amount_desc' => 'p.amount DESC',
    'amount_asc' => 'p.amount ASC',
    'status' => 'p.status ASC',
];
$orderBy = $orderMap[$sort] ?? 'p.created_at DESC';

// ─── Date range ────────────────────────────────────────────────────────────
$dateWhere = '';
$dateParams = [];
switch ($dateRange) {
    case 'today':
        $dateWhere = ' AND DATE(p.created_at) = CURDATE()';
        break;
    case '7days':
        $dateWhere = ' AND p.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)';
        break;
    case '30days':
        $dateWhere = ' AND p.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)';
        break;
    case 'custom':
        if ($dateFrom) {
            $dateWhere .= ' AND DATE(p.created_at) >= ?';
            $dateParams[] = $dateFrom;
        }
        if ($dateTo) {
            $dateWhere .= ' AND DATE(p.created_at) <= ?';
            $dateParams[] = $dateTo;
        }
        break;
}

// ─── Status filter ─────────────────────────────────────────────────────────
$statusWhere = '';
$statusParams = [];
if ($status && in_array($status, ['pending', 'paid', 'failed', 'refunded'])) {
    $statusWhere = ' AND p.status = ?';
    $statusParams[] = $status;
}

// ─── Search ────────────────────────────────────────────────────────────────
$searchWhere = '';
$searchParams = [];
if ($search) {
    $searchWhere = ' AND (p.reference LIKE ? OR p.custom_id LIKE ? OR e.event_name LIKE ? OR p.status LIKE ?)';
    $like = "%$search%";
    $searchParams = [$like, $like, $like, $like];
}

// ─── Scope: user vs admin vs client ─────────────────────────────────────────
$scopeWhere = '';
$scopeParams = [];

if ($sessionRole === 'user') {
    $userId = $_SESSION['user_id'] ?? null;
    if (!$userId) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'User ID not found in session.']);
        exit();
    }
    $scopeWhere = ' AND p.user_id = ?';
    $scopeParams[] = $userId;
} elseif ($sessionRole === 'client') {
    $clientAuthId = $_SESSION['auth_id'] ?? null;
    if (!$clientAuthId) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Client identity not found in session.']);
        exit();
    }
    // Filter payments by events belonging to this client
    $scopeWhere = ' AND e.client_id = (SELECT id FROM clients WHERE client_auth_id = ? LIMIT 1)';
    $scopeParams[] = $clientAuthId;
}

// ─── Build Queries ──────────────────────────────────────────────────────────
$params = array_merge($scopeParams, $dateParams, $statusParams, $searchParams);

$sql = "
    SELECT
        p.id, p.custom_id, p.reference, p.amount, p.status, p.paid_at, p.created_at,
        e.event_name, e.event_date, e.image_path AS event_image,
        c.business_name AS client_name, c.custom_id AS client_custom_id,
        u.name AS buyer_name, u.custom_id AS user_custom_id,
        au.email AS buyer_email,
        (SELECT COUNT(*) FROM tickets t WHERE t.payment_id = p.id) AS ticket_count
    FROM payments p
    LEFT JOIN events e ON p.event_id = e.id
    LEFT JOIN clients c ON e.client_id = c.id
    LEFT JOIN users u ON p.user_id = u.id
    LEFT JOIN auth_accounts au ON u.user_auth_id = au.id
    WHERE 1=1
    $scopeWhere $dateWhere $statusWhere $searchWhere
    ORDER BY $orderBy
    LIMIT $limit OFFSET $offset
";

$countSql = "
    SELECT COUNT(*) as total FROM payments p
    LEFT JOIN events e ON p.event_id = e.id
    WHERE 1=1 $scopeWhere $dateWhere $statusWhere $searchWhere
";

// Stats query
$statsSql = "
    SELECT 
        COUNT(*) as total_payments,
        COUNT(CASE WHEN p.status = 'paid' THEN 1 END) as successful_payments,
        COUNT(CASE WHEN p.status = 'failed' THEN 1 END) as failed_payments,
        SUM(CASE WHEN p.status = 'paid' THEN p.amount ELSE 0 END) as total_revenue
    FROM payments p
    LEFT JOIN events e ON p.event_id = e.id
    WHERE 1=1 $scopeWhere
";

try {
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $payments = $stmt->fetchAll();

    $countStmt = $pdo->prepare($countSql);
    $countStmt->execute($params);
    $total = (int) $countStmt->fetchColumn();

    $statsStmt = $pdo->prepare($statsSql);
    $statsStmt->execute($scopeParams);
    $stats = $statsStmt->fetch(PDO::FETCH_ASSOC);

    // Format data
    foreach ($payments as &$p) {
        $p['amount'] = (float) $p['amount'];
        $created = strtotime($p['created_at']);
        $diff = time() - $created;
        if ($diff < 60) {
            $p['relative_time'] = 'Just now';
        } elseif ($diff < 3600) {
            $p['relative_time'] = floor($diff / 60) . ' min ago';
        } elseif ($diff < 86400) {
            $p['relative_time'] = floor($diff / 3600) . ' hr ago';
        } else {
            $p['relative_time'] = date('M d, Y', $created);
        }
    }

    echo json_encode([
        'success' => true,
        'payments' => $payments,
        'stats' => [
            'total' => (int)($stats['total_payments'] ?? 0),
            'successful' => (int)($stats['successful_payments'] ?? 0),
            'failed' => (int)($stats['failed_payments'] ?? 0),
            'revenue' => (float)($stats['total_revenue'] ?? 0)
        ],
        'total' => $total,
        'page' => $page,
        'pages' => (int) ceil($total / $limit),
    ]);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database error: ' . $e->getMessage()]);
}
