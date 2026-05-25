<?php

/**
 * Paystack Webhook Handler — Marketplace Edition
 *
 * Handles: charge.success | charge.failed | refund.processed
 */

header('Content-Type: application/json');
require_once '../../config/database.php';
require_once '../../config/payment.php';
require_once '../../includes/helpers/ticket-helper.php';
require_once '../../includes/helpers/email-helper.php';
require_once '../../includes/helpers/sms-helper.php';
require_once '../../api/utils/notification-helper.php';

$input = file_get_contents('php://input');

// ── Signature Verification ───────────────────────────────────────────────────
$signature = $_SERVER['HTTP_X_PAYSTACK_SIGNATURE'] ?? '';
if (!verifyPaystackSignature($input, $signature)) {
    http_response_code(401);
    exit;
}

http_response_code(200); // Acknowledge early

$event = json_decode($input, true);
$type  = $event['event'] ?? '';
$data  = $event['data']  ?? [];

// ── Shared helper: fetch order by reference ──────────────────────────────────
function fetchOrder(PDO $pdo, string $reference): ?array
{
    $stmt = $pdo->prepare("
        SELECT o.*,
               e.event_name, e.event_date, e.event_time, e.address, e.location, e.image_path, e.locations, e.state,
               u.id AS user_id, u.name AS user_name,
               a.id AS user_auth_id, a.email AS user_email, u.phone AS user_phone,
               c.client_auth_id AS organizer_auth_id,
               c.email AS organizer_email
        FROM orders o
        JOIN events  e  ON o.event_id    = e.id
        JOIN users   u  ON o.user_id     = u.id
        JOIN auth_accounts a ON u.user_auth_id = a.id
        JOIN clients c  ON o.organizer_id = c.id
        WHERE o.transaction_reference = ?
    ");
    $stmt->execute([$reference]);
    return $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
}

// ── Shared helper: post-payment processing (idempotent) ──────────────────────
function processSuccessfulPayment(PDO $pdo, array $order, array $psData): void
{
    // Idempotency guard: already processed?
    if ($order['payment_status'] === 'success') {
        return;
    }

    $pdo->beginTransaction();

    try {
        // Update order
        $pdo->prepare("
            UPDATE orders
            SET payment_status  = 'success',
                payment_method  = ?,
                updated_at      = NOW()
            WHERE id = ?
        ")->execute([
            $psData['channel'] ?? 'card',
            $order['id'],
        ]);

        // 0. Extract quantity and ticket_type from metadata
        $metadata    = $psData['metadata'] ?? [];
        $quantity    = max(1, (int)($metadata['quantity']    ?? 1));
        $ticket_type = $metadata['ticket_type'] ?? 'regular';

        // Increment event attendee count and sales count, decrement stock atomically
        $stmtStock = $pdo->prepare("
            UPDATE events 
            SET ticket_count = CASE WHEN ticket_count IS NULL THEN NULL ELSE ticket_count - ? END, 
                sales_count = sales_count + ?,
                attendee_count = attendee_count + ? 
            WHERE id = ? AND (ticket_count IS NULL OR ticket_count >= ?)
        ");
        $stmtStock->execute([$quantity, $quantity, $quantity, $order['event_id'], $quantity]);
        if ($stmtStock->rowCount() === 0) {
            // Already handled by idempotency or sold out
            $pdo->rollBack();
            return;
        }

        // Check if tickets already exist (idempotency) via payment reference
        $tStmt = $pdo->prepare("
            SELECT t.id, t.barcode 
            FROM tickets t 
            JOIN payments p ON t.payment_id = p.id 
            WHERE p.reference = ?
        ");
        $tStmt->execute([$order['transaction_reference']]);
        $existingTickets = $tStmt->fetchAll(PDO::FETCH_ASSOC);

        if (empty($existingTickets)) {
            // Load ID Generator
            require_once '../../api/utils/id-generator.php';

            // 1. Insert into payments table first with custom_id
            $paymentCustomId = generatePaymentId($pdo);
            $payStmt = $pdo->prepare("
                INSERT INTO payments (event_id, user_id, custom_id, reference, amount, quantity, ticket_type, status, paystack_response, payment_id, transaction_id, paid_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'paid', ?, ?, ?, NOW())
            ");
            $payStmt->execute([
                $order['event_id'],
                $order['user_id'],
                $paymentCustomId,
                $order['transaction_reference'],
                $order['amount'],
                $quantity,
                $ticket_type,
                json_encode($psData),
                $psData['id'] ?? null,
                $psData['reference'] ?? null
            ]);
            $payment_id = $pdo->lastInsertId();

            // 2. Loop to generate multiple tickets
            $barcodes = [];
            $pdfPaths = [];
            for ($i = 0; $i < $quantity; $i++) {
                // Generate consistent TKT-{UUID} barcode
                $barcode = 'TKT-' . strtoupper(bin2hex(random_bytes(10)));
                $ticketCustomId = generateTicketId($pdo);

                $pdo->prepare("
                    INSERT INTO tickets (user_id, event_id, payment_id, order_id, custom_id, barcode, status)
                    VALUES (?, ?, ?, ?, ?, ?, 'valid')
                ")->execute([
                    $order['user_id'],
                    $order['event_id'],
                    $payment_id,
                    $order['id'],
                    $ticketCustomId,
                    $barcode,
                ]);
                $ticket_id = $pdo->lastInsertId();

                $ticketData = [
                    'barcode'        => $barcode,
                    'event_id'       => $order['event_id'],
                    'user_id'        => $order['user_id'],
                    'order_id'       => $order['id'],
                    'event_name'     => $order['event_name'],
                    'event_date'     => $order['event_date'],
                    'event_time'     => $order['event_time'],
                    'location'       => $order['location'] ?? $order['address'],
                    'address'        => $order['address'],
                    'state'          => $order['state'] ?? null,
                    'locations'      => $order['locations'] ?? null,
                    'user_name'      => $order['user_name'],
                    'payment_status' => 'paid',
                    'event_image'    => $order['image_path'] ?? null,
                ];

                try {
                    $qrCodePath = generateTicketQRCode($ticketData);
                    if ($qrCodePath && file_exists($qrCodePath)) {
                        $pdo->prepare("UPDATE tickets SET qr_code_path = ? WHERE id = ?")
                            ->execute([toPublicRelativePath($qrCodePath), $ticket_id]);
                        $ticketData['qr_path'] = $qrCodePath;
                    }

                    $pdfPath = generateTicketPDF($ticketData);
                    if ($pdfPath && file_exists($pdfPath)) {
                        $pdfPaths[] = $pdfPath;
                    } else {
                        error_log("[Webhook] PDF missing after generation for barcode $barcode (ticket $ticket_id)");
                    }
                } catch (\Throwable $genError) {
                    // Log structured failure — ticket row exists in DB but PDF/QR were not generated.
                    // Email will be suppressed for this ticket; operator must re-generate manually.
                    error_log(sprintf(
                        '[Webhook] Ticket generation FAILED | barcode=%s ticket_id=%d order=%d error=%s',
                        $barcode,
                        $ticket_id,
                        $order['id'],
                        $genError->getMessage()
                    ));
                    // Continue to next ticket — don't abort the whole webhook response
                }

                $barcodes[] = $barcode;
            }

            $barcode = $barcodes[0]; // Primary for email notified
        } else {
            $barcode = $existingTickets[0]['barcode'];
            $pdfPath = __DIR__ . '/../../uploads/tickets/pdfs/ticket_' . $barcode . '.pdf';
            if (!file_exists($pdfPath)) {
                $ticketData = [
                    'barcode'        => $barcode,
                    'event_id'       => $order['event_id'],
                    'user_id'        => $order['user_id'],
                    'order_id'       => $order['id'],
                    'event_name'     => $order['event_name'],
                    'event_date'     => $order['event_date'],
                    'event_time'     => $order['event_time'],
                    'location'       => $order['location'] ?? $order['address'],
                    'address'        => $order['address'],
                    'state'          => $order['state'] ?? null,
                    'locations'      => $order['locations'] ?? null,
                    'user_name'      => $order['user_name'],
                    'payment_status' => 'paid',
                    'event_image'    => $order['image_path'] ?? null,
                ];
                $pdfPath = generateTicketPDF($ticketData);
            }
            $barcode = $existingTickets[0]['barcode'];
        }

        $pdo->commit();

        // ── Send notifications (outside transaction) ──────────────────────────
        // Email with PDF ticket(s)
        if (!empty($pdfPaths)) {
            EmailHelper::sendTicketEmailFull($order['user_email'], [
                'barcode'    => $barcode,
                'event_name' => $order['event_name'],
                'event_date' => $order['event_date'],
                'event_time' => $order['event_time'],
                'location'   => $order['location'] ?? $order['state'] ?? 'Nigeria',
                'address'    => $order['address'],
                'event_image'=> $order['image_path'],
                'user_name'  => $order['user_name'],
                'order_id'   => $order['id'],
                'amount'     => $order['amount'],
            ], $pdfPaths);
        }

        // SMS to buyer
        if (!empty($order['user_phone'])) {
            // SMS disabled per requirement
            /* sendSMS(
                $order['user_phone'],
                "Hi {$order['user_name']}, your ticket for {$order['event_name']} is confirmed! Check your email for the PDF ticket."
            ); */
        }

        // In-app: buyer
        createPaymentSuccessNotification($order['user_auth_id'], $order['event_name'], $order['amount']);
        createTicketIssuedNotification($order['user_auth_id'], $order['event_name'], $barcode ?? '');

        // In-app: organizer (new sale alert)
        createNewSaleNotification($order['organizer_auth_id'], $order['user_name'], $order['event_name'], $order['amount'], $order['user_auth_id']);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        error_log('[Webhook] processSuccessfulPayment error: ' . $e->getMessage());
    }
}

// ── Event Routing ────────────────────────────────────────────────────────────
try {
    switch ($type) {
        case 'charge.success':
            $reference = $data['reference'] ?? '';
            if (!$reference) {
                break;
            }

            $order = fetchOrder($pdo, $reference);
            if (!$order) {
                error_log("[Webhook] charge.success: order not found for reference {$reference}");
                break;
            }

            processSuccessfulPayment($pdo, $order, $data);
            break;

        case 'charge.failed':
            $reference = $data['reference'] ?? '';
            if (!$reference) {
                break;
            }

            $pdo->prepare("
                UPDATE orders SET payment_status = 'failed', updated_at = NOW()
                WHERE transaction_reference = ? AND payment_status = 'pending'
            ")->execute([$reference]);

            // Optionally notify buyer
            $order = fetchOrder($pdo, $reference);
            if ($order) {
                createNotification(
                    $order['user_auth_id'],
                    "Your payment for {$order['event_name']} failed. Please try again.",
                    'payment_failed',
                    null,
                    'user'
                );
            }
            break;

        case 'refund.processed':
            $reference = $data['transaction_reference'] ?? $data['reference'] ?? '';
            if (!$reference) {
                break;
            }

            $pdo->prepare("
                UPDATE orders
                SET payment_status = 'refunded',
                    refund_status  = 'processed',
                    updated_at     = NOW()
                WHERE transaction_reference = ?
            ")->execute([$reference]);

            // Mark ticket as cancelled and get quantities
            $oStmt = $pdo->prepare("SELECT id, event_id, quantity, amount FROM orders WHERE transaction_reference = ?");
            $oStmt->execute([$reference]);
            $orderRow = $oStmt->fetch(PDO::FETCH_ASSOC);

            if ($orderRow) {
                $quantity = (int)($orderRow['quantity'] ?? 1);
                $event_id = $orderRow['event_id'];

                $pdo->prepare("
                    UPDATE tickets SET status = 'cancelled' WHERE order_id = ?
                ")->execute([$orderRow['id']]);

                // Update refund_requests status
                $pdo->prepare("
                    UPDATE refund_requests SET status = 'approved', processed_at = NOW()
                    WHERE order_id = ? AND status IN ('pending', 'approved')
                ")->execute([$orderRow['id']]);

                // ── Update Sales Statistics ──
                $pdo->prepare("
                    UPDATE events 
                    SET sales_count = GREATEST(0, sales_count - ?),
                        attendee_count = GREATEST(0, attendee_count - ?)
                    WHERE id = ?
                ")->execute([$quantity, $quantity, $event_id]);

                // ── Refund Rate Check (Banish Event if > 15%) ──
                $stmtEv = $pdo->prepare("SELECT event_name, total_tickets FROM events WHERE id = ?");
                $stmtEv->execute([$event_id]);
                $ev = $stmtEv->fetch();
                if ($ev && ($ev['total_tickets'] ?? 0) > 0) {
                    $stmtRefunded = $pdo->prepare("SELECT COUNT(*) FROM tickets WHERE event_id = ? AND status = 'cancelled'");
                    $stmtRefunded->execute([$event_id]);
                    $refundedCount = $stmtRefunded->fetchColumn();

                    $refundRate = $refundedCount / $ev['total_tickets'];
                    if ($refundRate > 0.15) {
                        $pdo->prepare("UPDATE events SET admin_status = 'banished' WHERE id = ?")->execute([$event_id]);
                        // Admin-Only Notification
                        $adminAuthId = getAdminUserId();
                        if ($adminAuthId) {
                            createNotification($adminAuthId, "ALERT: Event '{$ev['event_name']}' has been banished due to a high refund rate (".round($refundRate * 100)."%).", 'event_banished', null, 'admin');
                        }
                    }
                }

                $fullOrder = fetchOrder($pdo, $reference);
                if ($fullOrder) {
                    createRefundProcessedNotification(
                        $fullOrder['user_auth_id'],
                        $fullOrder['event_name'],
                        $fullOrder['amount']
                    );
                }
            }
            break;

        default:
            // Unhandled event — acknowledged (200 already sent)
            break;
    }
} catch (Throwable $e) {
    error_log('[Paystack Webhook] Unhandled error: ' . $e->getMessage());
}
