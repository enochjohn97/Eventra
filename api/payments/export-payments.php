<?php

/**
 * Export Payments API
 * Exports payment records as CSV, PDF, or Excel.
 * Respects same filters as get-payments.php.
 * Role-based: users export own payments, admin exports all.
 */

require_once '../../config/database.php';
require_once '../../includes/middleware/auth.php';

if (session_status() === PHP_SESSION_NONE) {
    require_once '../../config/session-config.php';
}

$sessionRole = $_SESSION['user_role'] ?? null;
if (!$sessionRole || !in_array($sessionRole, ['user', 'admin', 'client'])) {
    http_response_code(401);
    echo 'Unauthorized.';
    exit;
}

$isAdmin = ($sessionRole === 'admin');
$format = strtolower($_GET['format'] ?? 'csv');
$status = $_GET['status'] ?? '';
$dateRange = $_GET['date_range'] ?? 'all';
$dateFrom = $_GET['date_from'] ?? '';
$dateTo = $_GET['date_to'] ?? '';
$search = trim($_GET['search'] ?? '');
$sort = $_GET['sort'] ?? 'date_desc';

$orderMap = [
    'date_desc' => 'p.created_at DESC',
    'date_asc' => 'p.created_at ASC',
    'amount_desc' => 'p.amount DESC',
    'amount_asc' => 'p.amount ASC',
    'status' => 'p.status ASC',
];
$orderBy = $orderMap[$sort] ?? 'p.created_at DESC';

// Date filter
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

$statusWhere = '';
$statusParams = [];
if ($status && in_array($status, ['pending', 'paid', 'failed', 'refunded'])) {
    $statusWhere = ' AND p.status = ?';
    $statusParams[] = $status;
}

$searchWhere = '';
$searchParams = [];
if ($search) {
    $searchWhere = ' AND (p.reference LIKE ? OR e.event_name LIKE ? OR p.status LIKE ?)';
    $like = "%$search%";
    $searchParams = [$like, $like, $like];
}

$scopeWhere = '';
$scopeParams = [];
if ($sessionRole === 'user') {
    $scopeWhere = ' AND p.user_id = ?';
    $scopeParams[] = $authId;
}

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
        COUNT(t.id) AS ticket_count
    FROM payments p
    LEFT JOIN events e ON p.event_id = e.id
    LEFT JOIN users u ON p.user_id = u.id
    LEFT JOIN auth_accounts au ON u.user_auth_id = au.id
    LEFT JOIN tickets t ON t.payment_id = p.id
    WHERE 1=1 $scopeWhere $dateWhere $statusWhere $searchWhere
    GROUP BY p.id
    ORDER BY $orderBy
    LIMIT 5000
";

$stmt = $pdo->prepare($sql);
$stmt->execute($params);
$payments = $stmt->fetchAll();

$filename = 'eventout_payments_' . date('Ymd_His');

if ($format === 'csv') {
    header('Content-Type: text/csv');
    header("Content-Disposition: attachment; filename=\"{$filename}.csv\"");
    $out = fopen('php://output', 'w');
    fputcsv($out, ['ID', 'Reference', 'Event', 'Buyer', 'Email', 'Amount (₦)', 'Tickets', 'Status', 'Date']);
    foreach ($payments as $p) {
        fputcsv($out, [
            $p['id'],
            $p['reference'],
            $p['event_name'],
            $p['buyer_name'],
            $p['buyer_email'],
            number_format((float) $p['amount'], 2),
            $p['ticket_count'],
            ucfirst($p['status']),
            $p['created_at']
        ]);
    }
    fclose($out);
} elseif ($format === 'pdf') {
    // Generate a simple HTML-to-PDF response (inline HTML for browser print)
    header('Content-Type: text/html');
    $rows = '';
    foreach ($payments as $p) {
        $statusColor = match ($p['status']) {
            'paid' => '#10b981',
            'failed' => '#ef4444',
            'refunded' => '#f59e0b',
            default => '#6b7280',
        };
        $rows .= "<tr>
            <td>{$p['reference']}</td>
            <td>" . htmlspecialchars($p['event_name']) . "</td>
            <td>" . htmlspecialchars($p['buyer_name']) . "</td>
            <td>₦" . number_format((float) $p['amount'], 2) . "</td>
            <td>{$p['ticket_count']}</td>
            <td style='color:{$statusColor};font-weight:700'>" . ucfirst($p['status']) . "</td>
            <td>{$p['created_at']}</td>
        </tr>";
    }
    echo "<!DOCTYPE html><html><head><meta charset='UTF-8'><title>Payments Export</title>
    <style>body{font-family:Inter,sans-serif;padding:2rem}table{width:100%;border-collapse:collapse}
    th{background:#1e293b;color:white;padding:.5rem 1rem;text-align:left}
    td{padding:.5rem 1rem;border-bottom:1px solid #e2e8f0}
    h1{color:#1e293b}@media print{button{display:none}}</style></head>
    <body><h1>EventOut — Payment Records</h1>
    <p>Generated: " . date('F j, Y g:i A') . "</p>
    <p><button onclick='window.print()'>🖨️ Print / Save as PDF</button></p>
    <table><thead><tr>
        <th>Reference</th><th>Event</th><th>Buyer</th><th>Amount</th>
        <th>Tickets</th><th>Status</th><th>Date</th>
    </tr></thead><tbody>$rows</tbody></table></body></html>";
} elseif ($format === 'excel') {
    // Excel-compatible TSV with XML header
    header('Content-Type: application/vnd.ms-excel');
    header("Content-Disposition: attachment; filename=\"{$filename}.xls\"");
    $out = fopen('php://output', 'w');
    fputcsv($out, ['ID', 'Reference', 'Event', 'Buyer', 'Email', 'Amount (N)', 'Tickets', 'Status', 'Date'], "\t");
    foreach ($payments as $p) {
        fputcsv($out, [
            $p['id'],
            $p['reference'],
            $p['event_name'],
            $p['buyer_name'],
            $p['buyer_email'],
            number_format((float) $p['amount'], 2),
            $p['ticket_count'],
            ucfirst($p['status']),
            $p['created_at']
        ], "\t");
    }
    fclose($out);
} else {
    header('Content-Type: application/json');
    echo json_encode(['success' => false, 'message' => 'Invalid format. Use csv, pdf, or excel.']);
}
