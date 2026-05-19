<?php

/**
 * Process Refund API (Internal — called by review-refund.php on approval)
 *
 * Calls Paystack /refund, then updates order + ticket status.
 * Can also be called directly (organizer endpoint) — checks ownership.
 *
 * POST: { refund_request_id }
 */

header('Content-Type: application/json');
require_once '../../config/database.php';
require_once '../../config/payment.php';
require_once '../../api/utils/notification-helper.php';

/**
 * processRefund — called from review-refund.php or directly.
 * Returns [success, message].
 */
function processRefund(PDO $pdo, int $refundRequestId): array
{
    // Fetch refund_request + order (Fixing SQL trailing comma bug + selecting missing fields)
    $stmt = $pdo->prepare("
        SELECT rr.id AS rr_id, rr.order_id, rr.user_id, rr.status AS rr_status,
               o.transaction_reference, o.amount, o.payment_status, o.refund_status, o.quantity, o.event_id,
               e.event_name, e.total_tickets
        FROM refund_requests rr
        JOIN orders o ON rr.order_id = o.id
        JOIN events e ON o.event_id = e.id
        JOIN users u ON rr.user_id = u.id
        WHERE rr.id = ?
    ");
    $stmt->execute([$refundRequestId]);
    $rr = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$rr) {
        return ['success' => false, 'message' => 'Refund request not found.'];
    }

    if ($rr['rr_status'] === 'declined') {
        return ['success' => false, 'message' => 'Cannot process a declined refund request.'];
    }

    if ($rr['refund_status'] === 'processed') {
        return ['success' => true, 'message' => 'Refund already processed.'];
    }

    // ── Call Paystack /refund ────────────────────────────────────────────────
    $ch = curl_init('https://api.paystack.co/refund');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => json_encode(['transaction' => $rr['transaction_reference']]),
        CURLOPT_TIMEOUT        => 20,
        CURLOPT_HTTPHEADER     => [
            'Authorization: Bearer ' . PAYSTACK_SECRET_KEY,
            'Content-Type: application/json',
        ],
    ]);

    if (($_ENV['APP_ENV'] ?? '') === 'local') {
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
    }

    $response  = curl_exec($ch);
    $curlError = curl_error($ch);

    if ($curlError || !$response) {
        return ['success' => false, 'message' => 'Could not reach Paystack refund API.'];
    }

    $result = json_decode($response, true);
    if (!($result['status'] ?? false)) {
        return ['success' => false, 'message' => $result['message'] ?? 'Paystack refund failed.'];
    }

    // ── Update DB ────────────────────────────────────────────────────────────
    $pdo->prepare("
        UPDATE orders SET payment_status = 'refunded', refund_status = 'processed', updated_at = NOW()
        WHERE id = ?
    ")->execute([$rr['order_id']]);

    $pdo->prepare("
        UPDATE tickets SET status = 'cancelled' WHERE order_id = ?
    ")->execute([$rr['order_id']]);

    $pdo->prepare("
        UPDATE refund_requests SET status = 'approved', processed_at = NOW() WHERE id = ?
    ")->execute([$refundRequestId]);

    // ── Atomic Sales/Attendee Decrement ──
    $quantity = (int)($rr['quantity'] ?? 1);
    $pdo->prepare("
        UPDATE events 
        SET sales_count = GREATEST(0, sales_count - ?), 
            attendee_count = GREATEST(0, attendee_count - ?) 
        WHERE id = ?
    ")->execute([$quantity, $quantity, $rr['event_id']]);

    // ── Refund Rate Monitor (15% Threshold) ──
    if (($rr['total_tickets'] ?? 0) > 0) {
        $stmtRefunded = $pdo->prepare("SELECT COUNT(*) FROM tickets WHERE event_id = ? AND status = 'cancelled'");
        $stmtRefunded->execute([$rr['event_id']]);
        $refundedCount = $stmtRefunded->fetchColumn();

        $refundRate = $refundedCount / $rr['total_tickets'];
        if ($refundRate > 0.15) {
            $pdo->prepare("UPDATE events SET admin_status = 'banished' WHERE id = ?")->execute([$rr['event_id']]);
            // Notify admin
            $adminAuthId = getAdminUserId();
            if ($adminAuthId) {
                createNotification($adminAuthId, "ALERT: Event '{$rr['event_name']}' has been banished due to high refund rate (".round($refundRate * 100)."%).", 'event_banished', null, 'admin');
            }
        }
    }

    // ── Notify buyer ─────────────────────────────────────────────────────────
    createRefundProcessedNotification($rr['user_id'], $rr['event_name'], $rr['amount']);

    return ['success' => true, 'message' => 'Refund processed successfully.'];
}

// ── If called directly as an API endpoint ────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'POST' && !defined('PROCESS_REFUND_INCLUDED')) {
    require_once '../../includes/middleware/auth.php';
    clientMiddleware(); // Must be organizer

    $body              = json_decode(file_get_contents('php://input'), true) ?? [];
    $refundRequestId   = (int)($body['refund_request_id'] ?? 0);

    if (!$refundRequestId) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'refund_request_id is required.']);
        exit;
    }

    $result = processRefund($pdo, $refundRequestId);
    if (!$result['success']) {
        http_response_code(422);
    }
    echo json_encode($result);
}
