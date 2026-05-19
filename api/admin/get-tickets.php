<?php
/**
 * Get All Tickets API for Admin
 * Returns all tickets globalwide with full details.
 * Revenue = SUM(event.price) per valid ticket.
 */

// MUST be the first two lines — no whitespace, no BOM before <?php
require_once __DIR__ . '/../../config.php'; 
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
checkAuth('admin');

try {
    $limit  = min(1000, max(1, (int)($_GET['limit']  ?? 500)));
    $offset = max(0, (int)($_GET['offset'] ?? 0));
    $search = trim($_GET['search'] ?? '');
    $status = trim($_GET['status'] ?? '');

    $where  = '1=1';
    $params = [];

    if ($search !== '') {
        $like    = "%$search%";
        $where  .= " AND (e.event_name LIKE ? OR u.name LIKE ? OR t.ticket_code LIKE ? OR t.custom_id LIKE ?)";
        $params  = array_merge($params, [$like, $like, $like, $like]);
    }
    if ($status !== '' && in_array($status, ['valid', 'used', 'cancelled'])) {
        $where  .= ' AND t.status = ?';
        $params[] = $status;
    }

    // Count
    $countSql = "SELECT COUNT(*) FROM tickets t
                 JOIN events e ON t.event_id = e.id
                 LEFT JOIN users u  ON t.user_id  = u.id
                 WHERE $where";
    $cStmt = $pdo->prepare($countSql);
    $cStmt->execute($params);
    $total = (int)$cStmt->fetchColumn();

    // Tickets
    $sql = "
        SELECT
            t.id,
            t.custom_id,
            t.ticket_code,
            t.barcode,
            t.ticket_type,
            t.qr_code_path AS qr_path,
            t.qr_code_data AS qr_data,
            t.status,
            t.used,
            t.created_at,
            e.event_name,
            e.image_path  AS event_image,
            e.category,
            e.price       AS event_price,
            e.event_date,
            u.name        AS user_name,
            p.amount,
            p.quantity,
            p.status      AS payment_status,
            p.reference,
            p.custom_id   AS payment_custom_id,
            c.business_name AS organiser_name
        FROM tickets t
        JOIN events e   ON t.event_id  = e.id
        LEFT JOIN payments p ON t.payment_id= p.id
        LEFT JOIN users u    ON t.user_id   = u.id
        LEFT JOIN clients c  ON e.client_id = c.id
        WHERE $where
        ORDER BY t.created_at DESC
        LIMIT $limit OFFSET $offset
    ";
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $tickets = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Normalise
    foreach ($tickets as &$t) {
        $t['event_price']   = (float)$t['event_price'];
        $t['amount']        = isset($t['amount']) ? (float)$t['amount'] : 0.0;
        $quantity           = (isset($t['quantity']) && (int)$t['quantity'] > 0) ? (int)$t['quantity'] : 1;
        $paid_per_ticket    = $t['amount'] / $quantity;
        
        $price_to_use = max($paid_per_ticket, $t['event_price']);

        $ticket_type_label = !empty($t['ticket_type']) ? ucfirst(strtolower((string)$t['ticket_type'])) : 'Regular';

        if ($price_to_use <= 0) {
            $t['price_display'] = 'Free';
            $t['ticket_type_display'] = 'Free';
        } else {
            $t['price_display'] = '₦' . number_format($price_to_use, 2);
            if ($ticket_type_label !== 'Regular' && $ticket_type_label !== 'Free') {
                 $t['price_display'] .= ' (' . $ticket_type_label . ')';
            }
            $t['ticket_type_display'] = $ticket_type_label;
        }

        // For legacy template compat
        $t['total_price'] = $price_to_use;

        if (!empty($t['qr_path'])) {
            $qr = str_replace('\\', '/', $t['qr_path']);
            if (preg_match('#(public/assets/.+)$#i', $qr, $m)) {
                $t['qr_path'] = $m[1];
            } else {
                $t['qr_path'] = ltrim($qr, '/');
            }
        }
        if (!empty($t['event_image'])) {
            $img = str_replace('\\', '/', $t['event_image']);
            if (preg_match('#(/public/.+)$#i', $img, $m)) {
                $t['event_image'] = $m[1];
            } elseif (preg_match('#(public/assets/.+)$#i', $img, $m)) {
                $t['event_image'] = '/' . $m[1];
            }
        }
    }
    unset($t);

    // Stats
    $statsSql = "
        SELECT
            COUNT(*)                                                              AS total_tickets,
            SUM(CASE WHEN t.status = 'used'      THEN 1 ELSE 0 END)             AS used_tickets,
            SUM(CASE WHEN t.status = 'cancelled' THEN 1 ELSE 0 END)             AS cancelled_tickets,
            COALESCE(SUM(CASE WHEN p.status='paid' AND p.quantity > 0 THEN (p.amount / p.quantity) ELSE 0 END), 0) AS total_revenue
        FROM tickets t
        LEFT JOIN payments p ON t.payment_id = p.id
        JOIN events e   ON t.event_id   = e.id
    ";
    $sStmt = $pdo->query($statsSql);
    $stats = $sStmt->fetch(PDO::FETCH_ASSOC);
    $stats['total_tickets']    = (int)$stats['total_tickets'];
    $stats['used_tickets']     = (int)$stats['used_tickets'];
    $stats['cancelled_tickets'] = (int)$stats['cancelled_tickets'];
    $stats['total_revenue']    = (float)$stats['total_revenue'];
    $stats['remaining_tickets'] = $stats['total_tickets'] - $stats['used_tickets'] - $stats['cancelled_tickets'];

    echo json_encode([
        'success' => true,
        'tickets' => $tickets,
        'stats'   => $stats,
        'total'   => $total,
    ]);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database error: ' . $e->getMessage()]);
}
