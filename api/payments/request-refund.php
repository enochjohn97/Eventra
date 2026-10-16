<?php

/**
 * Request Refund API
 *
 * POST: { order_id, reason }
 *
 * Conditions: order belongs to user, payment_status=success,
 *             refund_status=none, event is >= REFUND_WINDOW_DAYS away.
 */

header('Content-Type: application/json');
require_once '../../config/database.php';
require_once '../../includes/middleware/auth.php';
require_once '../../api/utils/notification-helper.php';

define('REFUND_WINDOW_DAYS', (int)($_ENV['REFUND_WINDOW_DAYS'] ?? 7));

$auth_id = checkAuth('user');

$body     = json_decode(file_get_contents('php://input'), true) ?? [];
$order_id = (int)($body['order_id'] ?? 0);
$reason   = trim($body['reason'] ?? '');

if (!$order_id || empty($reason)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'order_id and reason are required.']);
    exit;
}

try {
    // Fetch user
    $uStmt = $pdo->prepare("SELECT id FROM users WHERE id = ?");
    $uStmt->execute([$auth_id]);
    $user = $uStmt->fetch(PDO::FETCH_ASSOC);

    if (!$user) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'User not found.']);
        exit;
    }

    // Fetch order with event + organizer info
    $stmt = $pdo->prepare("
        SELECT o.id, o.payment_status, o.refund_status, o.amount,
               e.event_name, e.event_date,
               u.name AS user_name,
               c.id AS organizer_id
        FROM orders o
        JOIN events e ON o.event_id = e.id
        JOIN users u ON o.user_id = u.id
        JOIN clients c ON o.organizer_id = c.id
        WHERE o.id = ? AND o.user_id = ?
    ");
    $stmt->execute([$order_id, $user['id']]);
    $order = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$order) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Order not found.']);
        exit;
    }

    if ($order['payment_status'] !== 'success') {
        echo json_encode(['success' => false, 'message' => 'Only successful payments can be refunded.']);
        exit;
    }

    if ($order['refund_status'] !== 'none') {
        echo json_encode(['success' => false, 'message' => 'A refund request already exists for this order.']);
        exit;
    }

    // Check refund window
    if (!empty($order['event_date'])) {
        $eventTs  = strtotime($order['event_date']);
        $nowTs    = time();
        $daysLeft = ($eventTs - $nowTs) / 86400;

        if ($daysLeft < REFUND_WINDOW_DAYS) {
            echo json_encode([
                'success' => false,
                'message' => "Refund requests must be made at least " . REFUND_WINDOW_DAYS . " days before the event.",
            ]);
            exit;
        }
    }

    $pdo->beginTransaction();

    // Atomically claim the order. The status check above is a read; two
    // concurrent requests could both pass it and insert two refund requests
    // for the same order. refund_requests has no unique key on order_id, so
    // this conditional UPDATE is the only real duplicate guard.
    $claim = $pdo->prepare("
        UPDATE orders SET refund_status = 'requested', updated_at = NOW()
        WHERE id = ? AND refund_status = 'none'
    ");
    $claim->execute([$order_id]);

    if ($claim->rowCount() === 0) {
        $pdo->rollBack();
        echo json_encode(['success' => false, 'message' => 'A refund request already exists for this order.']);
        exit;
    }

    // Insert refund request
    $pdo->prepare("
        INSERT INTO refund_requests (order_id, user_id, reason, status)
        VALUES (?, ?, ?, 'pending')
    ")->execute([$order_id, $user['id'], $reason]);

    $pdo->commit();

    // Notify organizer
    createRefundRequestedNotification(
        $order['organizer_id'],
        $order['user_name'],
        $order['event_name'],
        $order_id,
        'client',
        'user'
    );

    echo json_encode([
        'success' => true,
        'message' => 'Refund request submitted. The organizer will review it shortly.',
    ]);
} catch (PDOException $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    error_log('[request-refund.php] DB error: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Failed to submit refund request.']);
}
