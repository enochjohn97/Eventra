<?php

/**
 * Get User Tickets API
 * Returns tickets purchased by the authenticated end-user.
 */

header('Content-Type: application/json');
header('Cache-Control: no-cache, no-store, must-revalidate');
require_once __DIR__ . '/../../server/config.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/middleware/auth.php';

$user_id = checkAuth('user');

if (!$user_id) {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => 'Unauthorized.']);
    exit;
}

// Resolve users.id if checkAuth returned auth_accounts.id
$profileStmt = $pdo->prepare('SELECT id FROM users WHERE id = ? OR user_auth_id = ? LIMIT 1');
$profileStmt->execute([$user_id, $user_id]);
$resolvedUserId = $profileStmt->fetchColumn();

if (!$resolvedUserId) {
    http_response_code(404);
    echo json_encode(['success' => false, 'message' => 'User profile not found.']);
    exit;
}

try {
    $stmt = $pdo->prepare("
        SELECT
            t.id,
            t.custom_id,
            t.barcode,
            t.ticket_code,
            t.ticket_type,
            t.status,
            t.used,
            t.qr_code_path,
            t.created_at AS purchase_date,
            e.id AS event_id,
            e.custom_id AS event_custom_id,
            e.event_name,
            e.event_date,
            e.event_time,
            e.address,
            e.location,
            e.image_path AS event_image,
            e.category,
            p.amount,
            p.reference,
            p.status AS payment_status,
            c.business_name AS organizer_name
        FROM tickets t
        JOIN events e ON t.event_id = e.id
        LEFT JOIN payments p ON t.payment_id = p.id
        LEFT JOIN clients c ON e.client_id = c.id
        WHERE t.user_id = ?
        ORDER BY t.created_at DESC
    ");
    $stmt->execute([$resolvedUserId]);
    $tickets = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $baseUrl = rtrim($_ENV['APP_URL'] ?? SITE_URL ?? '', '/');

    foreach ($tickets as &$ticket) {
        $ticket['amount'] = isset($ticket['amount']) ? (float)$ticket['amount'] : 0.0;
        if (!empty($ticket['event_image'])) {
            $img = str_replace('\\', '/', $ticket['event_image']);
            if (preg_match('#(/public/.+)$#i', $img, $m)) {
                $ticket['event_image'] = $m[1];
            } elseif (preg_match('#(public/assets/.+)$#i', $img, $m)) {
                $ticket['event_image'] = '/' . $m[1];
            }
            $ticket['absolute_event_image'] = $baseUrl . '/' . ltrim($ticket['event_image'], '/');
        }
        if (!empty($ticket['qr_code_path'])) {
            $qr = str_replace('\\', '/', $ticket['qr_code_path']);
            if (preg_match('#(/public/.+)$#i', $qr, $m)) {
                $ticket['qr_code_path'] = $m[1];
            }
            $ticket['absolute_qr_url'] = $baseUrl . '/' . ltrim($ticket['qr_code_path'], '/');
        }
    }
    unset($ticket);

    echo json_encode([
        'success' => true,
        'tickets' => $tickets,
        'total' => count($tickets),
    ]);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => formatDbErrorMessage($e)]);
}
