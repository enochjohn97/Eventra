<?php
/**
 * Get Tickets API
 * Retrieves tickets purchased for the client's events.
 * Revenue = SUM(event.price) per paid ticket row.
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

try {
    $returned_id = checkAuth('client');

    // Use the returned ID (should be client_id from checkAuth)
    $real_client_id = $returned_id;
    
    // If we get a falsy value or 0, something went wrong
    if (!$real_client_id) {
        http_response_code(401);
        throw new Exception("Authentication failed: Invalid client session");
    }

    // Get tickets with related information
    $stmt = $pdo->prepare("
        SELECT
            t.id,
            t.custom_id,
            t.barcode,
            t.qr_code_path AS qr_path,
            t.qr_code_data AS qr_data,
            t.ticket_type,
            t.used,
            t.status,
            t.created_at AS purchase_date,
            e.event_name,
            e.image_path AS event_image,
            e.category AS event_category,
            e.price AS event_price,
            e.ticket_type AS event_ticket_type,
            u.name AS buyer_name,
            p.amount,
            p.ticket_type AS payment_ticket_type,
            p.status AS payment_status,
            p.reference,
            c.business_name AS organiser_name
        FROM tickets t
        LEFT JOIN payments p ON t.payment_id = p.id
        LEFT JOIN users u ON t.user_id = u.id
        JOIN events e ON t.event_id = e.id
        JOIN clients c ON e.client_id = c.id
        WHERE e.client_id = ?
        ORDER BY t.created_at DESC
    ");
    $stmt->execute([$real_client_id]);
    $tickets = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Normalise price display, ticket type and event category
    foreach ($tickets as &$ticket) {
        // Ensure numeric values
        $ticket['event_price'] = isset($ticket['event_price']) ? (float)$ticket['event_price'] : 0.0;
        $ticket['amount'] = isset($ticket['amount']) ? (float)$ticket['amount'] : 0.0;

        // Determine ticket_type precedence: ticket row -> payment -> event -> default
        $ticket['ticket_type'] = !empty($ticket['ticket_type'])
            ? $ticket['ticket_type']
            : (!empty($ticket['payment_ticket_type']) ? $ticket['payment_ticket_type'] : (!empty($ticket['event_ticket_type']) ? $ticket['event_ticket_type'] : 'regular'));
        $ticket['ticket_type'] = strtolower($ticket['ticket_type']);

        // Normalize event category
        $ticket['event_category'] = !empty($ticket['event_category']) ? $ticket['event_category'] : 'General';

        if (!empty($ticket['qr_path'])) {
            $qr = str_replace('\\', '/', $ticket['qr_path']);
            if (preg_match('#(public/assets/.+)$#i', $qr, $m)) {
                $ticket['qr_path'] = $m[1];
            } else {
                $ticket['qr_path'] = ltrim($qr, '/');
            }
        }
        if (!empty($ticket['event_image'])) {
            $img = str_replace('\\', '/', $ticket['event_image']);
            if (preg_match('#(/public/.+)$#i', $img, $m)) {
                $ticket['event_image'] = $m[1];
            } elseif (preg_match('#(public/assets/.+)$#i', $img, $m)) {
                $ticket['event_image'] = '/' . $m[1];
            }
        }

        // Price display: prefer paid amount when payment is paid, otherwise event price, else Free
        if (!empty($ticket['payment_status']) && strtolower($ticket['payment_status']) === 'paid' && $ticket['amount'] > 0) {
            $ticket['price_display'] = number_format($ticket['amount'], 2);
        } elseif (!empty($ticket['event_price']) && $ticket['event_price'] > 0) {
            $ticket['price_display'] = number_format($ticket['event_price'], 2);
        } else {
            $ticket['price_display'] = 'Free';
        }

        $ticket['ticket_type_display'] = ($ticket['amount'] <= 0 && $ticket['event_price'] <= 0)
            ? 'Free'
            : ucfirst($ticket['ticket_type']);
    }
    unset($ticket);

    // Stats: revenue = SUM(e.price) per paid ticket
    $stats_stmt = $pdo->prepare("
        SELECT
            COUNT(t.id)                                                                            AS total_tickets,
            COALESCE(SUM(CASE WHEN p.status = 'paid' THEN e.price ELSE 0 END), 0)                  AS total_revenue,
            SUM(CASE WHEN p.status = 'pending' THEN 1 ELSE 0 END)                                  AS pending_tickets,
            SUM(CASE WHEN t.status = 'cancelled' OR p.status = 'refunded' THEN 1 ELSE 0 END)       AS cancelled_tickets
        FROM tickets t
        LEFT JOIN payments p ON t.payment_id = p.id
        JOIN events e   ON t.event_id = e.id
        WHERE e.client_id = ?
    ");
    $stats_stmt->execute([$real_client_id]);
    $stats = $stats_stmt->fetch(PDO::FETCH_ASSOC);

    $stats['total_tickets']    = (int)   ($stats['total_tickets']    ?? 0);
    $stats['total_revenue']    = (float) ($stats['total_revenue']    ?? 0.0);
    $stats['pending_tickets']  = (int)   ($stats['pending_tickets']  ?? 0);
    $stats['cancelled_tickets'] = (int)   ($stats['cancelled_tickets'] ?? 0);

    echo json_encode([
        'success' => true,
        'tickets' => $tickets,
        'stats'   => $stats,
    ]);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database error: ' . $e->getMessage()]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'General error: ' . $e->getMessage()]);
}
