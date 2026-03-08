<?php
/**
 * Get Payments API
 * Returns paginated, filterable payment list.
 * Users: own payments only. Admins: all payments.
 */
header('Content-Type: application/json');
require_once '../../config/database.php';
require_once '../../includes/middleware/auth.php';

// Authenticate — accept both user and admin
if (session_status() === PHP_SESSION_NONE) {
    require_once '../../config/session-config.php';
}

$sessionRole = $_SESSION['user_role'] ?? null;
if (!$sessionRole || !in_array($sessionRole, ['user', 'admin', 'client'])) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Unauthorized.']);
    exit;
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
    $searchWhere = ' AND (p.reference LIKE ? OR e.event_name LIKE ? OR p.status LIKE ?)';
    $like = "%$search%";
    $searchParams = [$like, $like, $like];
}

// ─── Scope: user vs admin ──────────────────────────────────────────────────
$scopeWhere = '';
$scopeParams = [];
if (!$isAdmin) {
    // Resolve user profile ID
    $authId = $_SESSION['client_id'] ?? $_SESSION['user_id'] ?? null;
    if ($sessionRole === 'user') {
        $stmt = $pdo->prepare("SELECT id FROM users WHERE user_auth_id = ?");
        $stmt->execute([$authId]);
        $profile = $stmt->fetch();
        if (!$profile) {
            echo json_encode(['success' => true, 'payments' => [], 'total' => 0]);
            exit;
        }
        $scopeWhere = ' AND p.user_id = ?';
        $scopeParams[] = $profile['id'];
    }
}

// ─── Build Query ───────────────────────────────────────────────────────────
$params = array_merge($scopeParams, $dateParams, $statusParams, $searchParams);

$sql = "
    SELECT
        p.id,
        p.reference,
        p.amount,
        p.status,
        p.paid_at,
        p.created_at,
        e.event_name,
        e.event_date,
        COALESCE(u.name, 'Guest') AS buyer_name,
        COALESCE(au.email, '') AS buyer_email,
        GROUP_CONCAT(t.barcode SEPARATOR ', ') AS ticket_barcodes,
        COUNT(t.id) AS ticket_count,
        c.name AS client_name,
        e.image_path AS event_image
    FROM payments p
    LEFT JOIN events e ON p.event_id = e.id
    LEFT JOIN users u ON p.user_id = u.id
    LEFT JOIN auth_accounts au ON u.user_auth_id = au.id
    LEFT JOIN tickets t ON t.payment_id = p.id
    LEFT JOIN clients c ON e.client_id = c.id
    WHERE 1=1
    $scopeWhere
    $dateWhere
    $statusWhere
    $searchWhere
    GROUP BY p.id
    ORDER BY $orderBy
    LIMIT $limit OFFSET $offset
";

$countSql = "
    SELECT COUNT(DISTINCT p.id) as total
    FROM payments p
    LEFT JOIN events e ON p.event_id = e.id
    LEFT JOIN users u ON p.user_id = u.id
    WHERE 1=1
    $scopeWhere
    $dateWhere
    $statusWhere
    $searchWhere
";

try {
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $payments = $stmt->fetchAll();

    $countStmt = $pdo->prepare($countSql);
    $countStmt->execute($params);
    $total = (int) $countStmt->fetchColumn();

    // Compute relative time
    foreach ($payments as &$p) {
        $p['amount'] = (float) $p['amount'];
        $created = strtotime($p['created_at']);
        $diff = time() - $created;

        if ($diff < 60)
            $p['relative_time'] = 'Just now';
        elseif ($diff < 3600)
            $p['relative_time'] = floor($diff / 60) . ' min ago';
        elseif ($diff < 86400)
            $p['relative_time'] = floor($diff / 3600) . ' hr ago';
        elseif ($diff < 604800)
            $p['relative_time'] = floor($diff / 86400) . ' days ago';
        else
            $p['relative_time'] = date('M d, Y', $created);
    }

    echo json_encode([
        'success' => true,
        'payments' => $payments,
        'total' => $total,
        'page' => $page,
        'limit' => $limit,
        'pages' => (int) ceil($total / $limit),
    ]);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database error: ' . $e->getMessage()]);
}
