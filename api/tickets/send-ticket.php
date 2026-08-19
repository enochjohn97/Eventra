<?php

/**
 * Send Ticket Email API
 * Resends ticket confirmation email for a payment reference or ticket barcode.
 */

header('Content-Type: application/json');
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/middleware/auth.php';
require_once __DIR__ . '/../../includes/helpers/email-helper.php';
require_once __DIR__ . '/../../includes/helpers/ticket-helper.php';

$user_id = checkAuth('user');

$body = json_decode(file_get_contents('php://input'), true) ?? [];
$reference = trim($body['reference'] ?? $_POST['reference'] ?? '');
$barcode = trim($body['barcode'] ?? $_POST['barcode'] ?? '');
$ticket_id = (int)($body['ticket_id'] ?? $_POST['ticket_id'] ?? 0);

if ($reference === '' && $barcode === '' && $ticket_id <= 0) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'reference, barcode, or ticket_id is required.']);
    exit;
}

$profileStmt = $pdo->prepare('SELECT u.id, u.name, a.email FROM users u JOIN auth_accounts a ON u.user_auth_id = a.id WHERE u.id = ? OR u.user_auth_id = ? LIMIT 1');
$profileStmt->execute([$user_id, $user_id]);
$userRow = $profileStmt->fetch(PDO::FETCH_ASSOC);

if (!$userRow) {
    http_response_code(404);
    echo json_encode(['success' => false, 'message' => 'User profile not found.']);
    exit;
}

$resolvedUserId = (int)$userRow['id'];

try {
    $sql = "
        SELECT t.*, e.event_name, e.event_date, e.event_time, e.address, e.location, e.image_path,
               p.amount, p.reference, p.status AS payment_status
        FROM tickets t
        JOIN events e ON t.event_id = e.id
        LEFT JOIN payments p ON t.payment_id = p.id
        WHERE t.user_id = ?
    ";
    $params = [$resolvedUserId];

    if ($ticket_id > 0) {
        $sql .= ' AND t.id = ?';
        $params[] = $ticket_id;
    } elseif ($barcode !== '') {
        $sql .= ' AND t.barcode = ?';
        $params[] = $barcode;
    } else {
        $sql .= ' AND p.reference = ?';
        $params[] = $reference;
    }

    $sql .= ' LIMIT 1';

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $ticket = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$ticket) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Ticket not found.']);
        exit;
    }

    $ticketData = [
        'barcode' => $ticket['barcode'],
        'ticket_id' => $ticket['custom_id'] ?? $ticket['barcode'],
        'custom_id' => $ticket['custom_id'] ?? $ticket['barcode'],
        'event_id' => $ticket['event_id'],
        'user_id' => $resolvedUserId,
        'event_name' => $ticket['event_name'],
        'event_date' => $ticket['event_date'],
        'event_time' => $ticket['event_time'],
        'location' => $ticket['location'] ?? $ticket['address'] ?? 'Nigeria',
        'address' => $ticket['address'] ?? '',
        'event_image' => $ticket['image_path'] ?? '',
        'user_name' => $userRow['name'],
        'buyer_name' => $userRow['name'],
        'buyer_email' => $userRow['email'],
        'payment_status' => $ticket['payment_status'] ?? 'paid',
        'amount' => (float)($ticket['amount'] ?? 0),
        'ticket_type' => $ticket['ticket_type'] ?? 'regular',
        'quantity' => 1,
    ];

    if (!empty($ticket['qr_code_path']) && file_exists(__DIR__ . '/../../' . ltrim($ticket['qr_code_path'], '/'))) {
        $ticketData['qr_path'] = __DIR__ . '/../../' . ltrim($ticket['qr_code_path'], '/');
    } else {
        $qrPath = generateTicketQRCode($ticketData);
        if ($qrPath && file_exists($qrPath)) {
            $pdo->prepare('UPDATE tickets SET qr_code_path = ? WHERE id = ?')
                ->execute([toPublicRelativePath($qrPath), $ticket['id']]);
            $ticketData['qr_path'] = $qrPath;
        }
    }

    $sent = EmailHelper::sendTicketEmailFull($userRow['email'], $ticketData, []);

    if (!$sent) {
        http_response_code(502);
        echo json_encode(['success' => false, 'message' => 'Failed to send ticket email. Check mail configuration.']);
        exit;
    }

    echo json_encode([
        'success' => true,
        'message' => 'Ticket email sent successfully.',
        'email' => $userRow['email'],
        'barcode' => $ticket['barcode'],
    ]);
} catch (Throwable $e) {
    error_log('[send-ticket.php] ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Failed to send ticket email.']);
}
