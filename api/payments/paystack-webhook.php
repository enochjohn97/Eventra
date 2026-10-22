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
$signature = $_SERVER['HTTP_X_PAYSTACK_SIGNATURE'] ?? '';

// ── Dynamic Signature Verification ───────────────────────────────────────────
// Client Paystack accounts sign their own webhook payloads.
$unverified_event = json_decode($input, true);
$reference = $unverified_event['data']['reference'] ?? '';

$activeSecretKey = !empty(PAYSTACK_WEBHOOK_SECRET) ? PAYSTACK_WEBHOOK_SECRET : PAYSTACK_SECRET_KEY;
if (empty($activeSecretKey)) {
    // No secret configured — signature verification is impossible. Respond
    // cleanly instead of letting the empty HMAC key produce a misleading
    // pass/fail. Ops still see the problem in the error log.
    error_log('[Paystack Webhook] No webhook/secret key configured — rejecting payload.');
    http_response_code(503);
    echo json_encode(['success' => false, 'message' => 'Webhook not configured.']);
    exit;
}

if ($reference) {
    $keyStmt = $pdo->prepare("
        SELECT c.paystack_connection_status, c.paystack_auth_token
        FROM orders o
        JOIN clients c ON o.organizer_id = c.id
        WHERE o.transaction_reference = ?
        LIMIT 1
    ");
    $keyStmt->execute([$reference]);
    $orgPaystack = $keyStmt->fetch(PDO::FETCH_ASSOC);
    if ($orgPaystack && ($orgPaystack['paystack_connection_status'] ?? '') === 'connected' && !empty($orgPaystack['paystack_auth_token'])) {
        $activeSecretKey = selectPaystackSecretKey($orgPaystack['paystack_auth_token']);
    }
}

if (!hash_equals(hash_hmac('sha512', $input, $activeSecretKey), $signature)) {
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
    // Idempotency guard (fast path): already processed?
    if ($order['payment_status'] === 'success') {
        return;
    }

    // ── ATOMIC CLAIM: prevent webhook/verify-payment races double-issuing tickets ──
    // Only ONE worker may win this claim; the loser exits quietly.
    $claim = $pdo->prepare("
        UPDATE orders
        SET payment_status = 'processing'
        WHERE id = ? AND payment_status = 'pending'
    ");
    $claim->execute([$order['id']]);
    if ($claim->rowCount() === 0) {
        return; // Another request already claimed/is processing this order
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
        $metadata     = $psData['metadata'] ?? [];
        $quantity     = max(1, (int)($metadata['quantity']    ?? 1));
        $ticket_type  = $metadata['ticket_type'] ?? 'regular';
        $contactInfo  = $metadata['contact_info'] ?? [];
        $buyerName    = !empty($contactInfo)
            ? trim(($contactInfo['fname'] ?? '') . ' ' . ($contactInfo['lname'] ?? ''))
            : ($metadata['buyer_name'] ?? $order['user_name']);
        $buyerEmail   = !empty($contactInfo['email']) ? $contactInfo['email']
            : ($metadata['buyer_email'] ?? $order['user_email']);

        // Gift purchases ("Get for someone else") belong to the recipient. The
        // payment row stays attributed to the payer, but the tickets and the
        // confirmation email follow the recipient account — mirroring the
        // verify-payment fulfilment path so both workers behave identically.
        $orderMeta = json_decode($order['metadata'] ?? '{}', true) ?: [];
        $giftRecipientUserId  = (int) ($orderMeta['gift_recipient_user_id'] ?? 0);
        $giftRecipientAuthId  = (int) ($orderMeta['gift_recipient_auth_id'] ?? 0);
        $giftRecipientEmail   = trim((string) ($orderMeta['gift_recipient_email'] ?? ''));
        $isGift = $giftRecipientUserId > 0 && filter_var($giftRecipientEmail, FILTER_VALIDATE_EMAIL);
        $ticketOwnerId = $isGift ? $giftRecipientUserId : (int) $order['user_id'];
        if ($isGift) {
            $buyerEmail = $giftRecipientEmail;
            $buyerName  = $orderMeta['gift_recipient_name'] ?? $buyerName;
        }

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
            // Sold out — release the processing claim and record failure
            $pdo->rollBack();
            $pdo->prepare("UPDATE orders SET payment_status = 'failed', updated_at = NOW() WHERE id = ?")
                ->execute([$order['id']]);
            error_log('[Webhook] Sold out during fulfillment for order ' . $order['id']);
            return;
        }

        // Initialize delivery collections so the idempotent-replay branch below
        // (tickets already exist) still reaches post-commit without undefined vars.
        $barcodes = [];
        $ticketDataMap = [];

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
            $ticketDataMap = [];
            for ($i = 0; $i < $quantity; $i++) {
                // Generate consistent TKT-{UUID} barcode
                $barcode = 'TKT-' . strtoupper(bin2hex(random_bytes(10)));
                $ticketCustomId = generateTicketId($pdo);

                $pdo->prepare("
                    INSERT INTO tickets (user_id, event_id, payment_id, order_id, custom_id, barcode, status)
                    VALUES (?, ?, ?, ?, ?, ?, 'valid')
                ")->execute([
                    $ticketOwnerId,
                    $order['event_id'],
                    $payment_id,
                    $order['id'],
                    $ticketCustomId,
                    $barcode,
                ]);
                $ticket_id = $pdo->lastInsertId();

                $ticketData = [
                    'barcode'        => $barcode,
                    'ticket_id'      => $ticketCustomId,
                    'custom_id'      => $ticketCustomId,
                    'event_id'       => $order['event_id'],
                    'user_id'        => $ticketOwnerId,
                    'order_id'       => $order['id'],
                    'event_name'     => $order['event_name'],
                    'event_date'     => $order['event_date'],
                    'event_time'     => $order['event_time'],
                    'location'       => $order['location'] ?? $order['address'],
                    'address'        => $order['address'],
                    'state'          => $order['state'] ?? null,
                    'locations'      => $order['locations'] ?? null,
                    'user_name'      => $buyerName,
                    'buyer_name'     => $buyerName,
                    'buyer_email'    => $buyerEmail,
                    'payment_status' => 'paid',
                    'event_image'    => $order['image_path'] ?? null,
                    'ticket_type'    => $ticket_type,
                    'amount'         => $order['amount'] / max(1, $quantity),
                    'quantity'       => 1,
                ];


                try {
                    $qrCodePath = generateTicketQRCode($ticketData);
                    if ($qrCodePath && file_exists($qrCodePath)) {
                        $pdo->prepare("UPDATE tickets SET qr_code_path = ? WHERE id = ?")
                            ->execute([toPublicRelativePath($qrCodePath), $ticket_id]);
                        $ticketData['qr_path'] = $qrCodePath;
                        if (function_exists('base64_encode_image')) {
                            $b64 = base64_encode_image($qrCodePath);
                            if ($b64 !== '') {
                                $ticketData['qr_base64'] = $b64;
                            }
                        }
                    }
                } catch (\Throwable $genError) {
                    error_log(sprintf(
                        '[Webhook] Ticket generation FAILED | barcode=%s ticket_id=%d order=%d error=%s',
                        $barcode,
                        $ticket_id,
                        $order['id'],
                        $genError->getMessage()
                    ));
                    // Continue to next ticket — don't abort the whole webhook response
                }

                $ticketDataMap[$barcode] = $ticketData;
                $barcodes[] = $barcode;
            }

            $barcode = $barcodes[0]; // Primary for email notified
        } else {
            $barcode = $existingTickets[0]['barcode'];
        }

        // ── Post-commit: notifications + email/SMS run AFTER the transaction commits ──
        // Captured in a closure so the DB transaction can commit instantly and the
        // buyer's ticket data is durable before any slow network I/O happens.
        $GLOBALS['_webhook_post_commit'] = function () use ($barcodes, $ticketDataMap, $buyerName, $buyerEmail, $order, $isGift, $giftRecipientAuthId, $giftRecipientEmail) {
            // One consolidated, attachment-free email per purchase: the QR is
            // embedded in the HTML body; PDFs are never emailed.
            $emailData = null;
            foreach ($barcodes as $bc) {
                $td = $ticketDataMap[$bc] ?? [
                    'barcode'     => $bc,
                    'ticket_id'   => $bc,
                    'custom_id'   => $bc,
                    'event_name'  => $order['event_name'],
                    'event_date'  => $order['event_date'],
                    'event_time'  => $order['event_time'],
                    'location'    => $order['location'] ?? $order['state'] ?? 'Nigeria',
                    'address'     => $order['address'],
                    'event_image' => $order['image_path'],
                    'user_name'   => $buyerName,
                    'buyer_name'  => $buyerName,
                    'buyer_email' => $buyerEmail,
                    'order_id'    => $order['id'],
                    'amount'      => $order['amount'],
                ];
                if ($emailData === null) {
                    $emailData = $td;
                }
            }
            if ($emailData !== null) {
                $emailRecipients = $isGift
                    ? [$order['user_email'], $giftRecipientEmail]
                    : [$emailData['buyer_email'] ?? $order['user_email']];
                foreach (array_unique($emailRecipients) as $emailRecipient) {
                    if (filter_var($emailRecipient, FILTER_VALIDATE_EMAIL)) {
                        EmailHelper::sendTicketEmailFull($emailRecipient, $emailData);
                    }
                }
            }

            // SMS to buyer
            if (!empty($order['user_phone'])) {
                sendSMS(
                    $order['user_phone'],
                    "Hi {$order['user_name']}, your ticket for {$order['event_name']} is confirmed! Check your email for the PDF ticket.",
                    'ticket_confirmation',
                    ['auth_id' => (int) $order['user_auth_id']]
                );
            }

            // In-app: the ticket holder. For a gift that is the recipient, so the
            // ticket notice lands in the recipient's notification feed.
            $ticketNoticeAuthId = $isGift && $giftRecipientAuthId > 0
                ? $giftRecipientAuthId
                : (int) $order['user_auth_id'];
            createPaymentSuccessNotification($order['user_auth_id'], $order['event_name'], $order['amount']);
            createTicketIssuedNotification($ticketNoticeAuthId, $order['event_name'], $barcodes[0] ?? '');
            if ($isGift) {
                // Let the recipient know who sent it.
                @createNotification(
                    $ticketNoticeAuthId,
                    "You received a ticket for {$order['event_name']} from {$order['user_name']}.",
                    'ticket_issued',
                    (int) $order['user_auth_id'],
                    'user',
                    'user',
                    ['event_id' => (int) $order['event_id'], 'gift' => true]
                );
            }

            // In-app: organizer (new sale alert)
            createNewSaleNotification($order['organizer_auth_id'], $order['user_name'], $order['event_name'], $order['amount'], $order['user_auth_id']);
        };

        $pdo->commit();

        // Run post-commit delivery work (email, SMS, notifications)
        if (isset($GLOBALS['_webhook_post_commit'])) {
            $postCommit = $GLOBALS['_webhook_post_commit'];
            unset($GLOBALS['_webhook_post_commit']);
            $postCommit();
        }
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        // Release the processing claim so a retry can re-process this order
        $pdo->prepare("UPDATE orders SET payment_status = 'pending' WHERE id = ? AND payment_status = 'processing'")
            ->execute([$order['id']]);
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
