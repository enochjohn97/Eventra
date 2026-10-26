<?php

register_shutdown_function(function () {
    $err = error_get_last();
    if ($err && in_array($err['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR], true)) {
        if (!headers_sent()) {
            http_response_code(500);
            header('Content-Type: application/json');
        }
        $msg = $err['message'] . ' in ' . $err['file'] . ':' . $err['line'];
        error_log('[verify-payment.php] FATAL shutdown: ' . $msg);
        // Only emit body if nothing has been sent yet (Content-Length:0 scenario)
        if (ob_get_level() > 0) {
            ob_end_clean();
        }
        echo json_encode(['success' => false, 'message' => 'Internal server error. Please try again or contact support.']);
    }
});

header('Content-Type: application/json');
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../config/payment.php';
require_once __DIR__ . '/../../includes/middleware/auth.php';


require_once __DIR__ . '/../../api/utils/notification-helper.php';

// Load shared webhook helper (processSuccessfulPayment is defined there)
// We replicate it inline here to keep the file self-contained.

// Authentication is normally required, BUT the Paystack callback can land
// here after the PHP session/Bearer token has expired or been rotated (e.g.
// a fresh Google login invalidated the token used at checkout). The payment
// reference itself is a 128-bit random secret bound to exactly one order, so
// possession of it is sufficient authorization to VERIFY (and only ever
// marks the order it belongs to — no PII beyond the buyer's own ticket).
$auth_id = null;
if (session_status() === PHP_SESSION_NONE) {
    require_once __DIR__ . '/../../server/config.php';
}
try {
    $authCheck = checkAuthOptional();
} catch (Throwable $authEx) {
    $authCheck = null;
}
if (!empty($authCheck)) {
    // Resolve the users.id for the authenticated caller (session may carry
    // users.id or auth_accounts.id)
    $tmpStmt = $pdo->prepare("SELECT id FROM users WHERE id = ? OR user_auth_id = ? LIMIT 1");
    $tmpStmt->execute([(int) $authCheck, (int) $authCheck]);
    $auth_id = (int) $tmpStmt->fetchColumn();
}

$body = json_decode(file_get_contents('php://input'), true) ?? [];
$reference = trim($body['reference'] ?? $_GET['reference'] ?? '');

if (!$reference) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Payment reference is required.']);
    exit;
}

// Anonymous callback: authorize via the reference's owning user
if (empty($auth_id)) {
    $refStmt = $pdo->prepare("SELECT user_id FROM orders WHERE transaction_reference = ? LIMIT 1");
    $refStmt->execute([$reference]);
    $refUserId = $refStmt->fetchColumn();
    if (!$refUserId) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Order not found. Please contact support with your reference.']);
        exit;
    }
    $auth_id = (int) $refUserId;
}

$body = json_decode(file_get_contents('php://input'), true) ?? [];
$reference = trim($body['reference'] ?? $_GET['reference'] ?? '');

if (!$reference) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Payment reference is required.']);
    exit;
}

/**
 * Helper: Resolve users.id from auth_id (handles both auth_accounts.id and users.id from session)
 */
function resolveUserId($pdo, $auth_id)
{
    // Try auth_accounts.id → users.user_auth_id
    $stmt = $pdo->prepare("SELECT id, user_auth_id FROM users WHERE user_auth_id = ? LIMIT 1");
    $stmt->execute([$auth_id]);
    $user = $stmt->fetch();
    if ($user)
        return $user;

    // Fallback: direct users.id (session-based)
    $stmt = $pdo->prepare("SELECT id, user_auth_id FROM users WHERE id = ? LIMIT 1");
    $stmt->execute([$auth_id]);
    return $stmt->fetch();
}

try {
    $user_row = resolveUserId($pdo, $auth_id);

    if (!$user_row) {
        error_log("[verify-payment.php] User profile not found for auth_id: $auth_id");
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'User profile not found. Please complete your registration.']);
        exit;
    }

    $user_id = $user_row['id'];
    $user_auth_accounts_id = $user_row['user_auth_id'];

    // ── Check existing order ─────────────────────────────────────────────────
    $oStmt = $pdo->prepare("
        SELECT o.id, o.payment_status, o.amount, o.event_id, o.user_id, o.organizer_id, o.metadata,
               e.event_name, e.event_date, e.event_time, e.address, e.location, e.image_path,
               u.name AS user_name, u.phone AS user_phone,
               a.id AS user_auth_accounts_id, a.email AS user_email,
               c.client_auth_id AS organizer_auth_id
        FROM orders o
        JOIN events e ON o.event_id = e.id
        JOIN users u ON o.user_id = u.id
        JOIN auth_accounts a ON u.user_auth_id = a.id
        LEFT JOIN clients c ON o.organizer_id = c.id
        WHERE o.transaction_reference = ?
          AND o.user_id = ?
    ");
    $oStmt->execute([$reference, $user_id]);
    $order = $oStmt->fetch(PDO::FETCH_ASSOC);

    if (!$order) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Order not found. Please contact support with your reference.']);
        exit;
    }

    // ── Already marked success — no further action needed ────────────────────
    if ($order['payment_status'] === 'success') {
        $ticketStmt = $pdo->prepare("
            SELECT t.barcode, t.user_id FROM tickets t
            JOIN payments p ON p.id = t.payment_id
            WHERE p.reference COLLATE utf8mb4_unicode_ci = ?
            ORDER BY t.id
        ");
        $ticketStmt->execute([$reference]);
        $allTickets = $ticketStmt->fetchAll(PDO::FETCH_ASSOC);
        $barcodes = array_column($allTickets, 'barcode');
        $buyerBarcodes = array_column(array_filter(
            $allTickets,
            static fn(array $ticket): bool => (int) $ticket['user_id'] === (int) $order['user_id']
        ), 'barcode');
        echo json_encode([
            'success' => true,
            'status' => 'success',
            'message' => 'Payment already verified.',
            'amount' => (float) $order['amount'],
            'event_name' => $order['event_name'],
            'reference' => $reference,
            'barcode' => $buyerBarcodes[0] ?? null,
            'barcodes' => $barcodes,
            'buyer_barcodes' => $buyerBarcodes,
        ]);
        exit;
    }

    // Verify with the same standalone client account that initialized payment.
    $verifyKeyStmt = $pdo->prepare("
        SELECT c.paystack_connection_status, c.paystack_auth_token
        FROM orders o
        JOIN clients c ON o.organizer_id = c.id
        WHERE o.transaction_reference = ?
        LIMIT 1
    ");
    $verifyKeyStmt->execute([$reference]);
    $orgPaystack = $verifyKeyStmt->fetch(PDO::FETCH_ASSOC);
    $activeVerifyKey = selectPaystackSecretKey(
        $orgPaystack && ($orgPaystack['paystack_connection_status'] ?? '') === 'connected'
            ? $orgPaystack['paystack_auth_token']
            : null
    );

    // ── Verify with Paystack ─────────────────────────────────────────────────
    $url = 'https://api.paystack.co/transaction/verify/' . rawurlencode($reference);
    $response = false;
    $curlError = '';

    if (function_exists('curl_init')) {
        $ch = curl_init();
        curl_setopt_array($ch, [
            CURLOPT_URL => $url,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 15,
            CURLOPT_HTTPHEADER => [
                'Authorization: Bearer ' . $activeVerifyKey,
                'Cache-Control: no-cache',
            ],
        ]);

        if (($_ENV['APP_ENV'] ?? '') === 'local') {
            curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
            curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
        }

        $response = curl_exec($ch);
        $curlError = curl_error($ch);
        curl_close($ch);
    }

    if (!$response) {
        // Fallback to file_get_contents if cURL fails or is disabled
        $context = stream_context_create([
            'http' => [
                'method' => 'GET',
                'header' => [
                    'Authorization: Bearer ' . $activeVerifyKey,
                    'Cache-Control: no-cache'
                ],
                'timeout' => 15,
                'ignore_errors' => true
            ]
        ]);
        $response = @file_get_contents($url, false, $context);
    }

    if (!$response) {
        http_response_code(400); // Treat as 400 to prevent shared hosts from intercepting 500 and serving HTML
        echo json_encode([
            'success' => false,
            'message' => 'Failed to connect to Paystack API. Please try again later. ' . $curlError
        ]);
        exit;
    }

    $result = json_decode($response, true);
    $psStatus = $result['data']['status'] ?? 'unknown';

    if (!$result || !($result['status'] ?? false) || $psStatus !== 'success') {
        // Mark as failed if Paystack says it failed
        if ($psStatus === 'failed') {
            $pdo->prepare("UPDATE orders SET payment_status = 'failed' WHERE transaction_reference = ?")
                ->execute([$reference]);
        }
        echo json_encode([
            'success' => false,
            'status' => $psStatus,
            'message' => 'Payment not successful.',
        ]);
        exit;
    }

    // ── Paystack confirmed success — run post-payment processing ─────────────
    // (Same logic as webhook; fully idempotent via atomic claim)

    // ── ATOMIC CLAIM: only ONE worker (webhook or verify) fulfills this order ──
    // If the webhook already claimed/is processing it, return success — the
    // tickets will exist momentarily and the polling UI will pick them up.
    $claim = $pdo->prepare("
        UPDATE orders
        SET payment_status = 'processing'
        WHERE id = ? AND payment_status = 'pending'
    ");
    $claim->execute([$order['id']]);
    if ($claim->rowCount() === 0) {
        $current = $pdo->prepare("SELECT payment_status FROM orders WHERE id = ?");
        $current->execute([$order['id']]);
        $statusNow = (string) $current->fetchColumn();

        if ($statusNow === 'success') {
            // Webhook finished first
            echo json_encode([
                'success'    => true,
                'status'     => 'success',
                'message'    => 'Payment verified successfully.',
                'reference'  => $reference,
                'amount'     => (float) $order['amount'],
                'event_name' => $order['event_name'],
            ]);
            exit;
        }
        if ($statusNow === 'processing') {
            // Webhook is mid-flight — client should poll get-order.php
            echo json_encode([
                'success'    => true,
                'status'     => 'processing',
                'message'    => 'Payment confirmed; tickets are being finalized.',
                'reference'  => $reference,
            ]);
            exit;
        }
        // 'failed' — but Paystack just confirmed success, so fulfill anyway
        // (covers a transient webhook failure that mis-marked the order).
    }

    $pdo->beginTransaction();

    try {
        $metadata = $result['data']['metadata'] ?? [];
        $quantity = max(1, (int) ($metadata['quantity'] ?? 1));
        $ticket_type = $metadata['ticket_type'] ?? 'regular';
        $selected_locs = $metadata['selected_locs'] ?? null;
        $dbMeta = json_decode($order['metadata'] ?? '{}', true) ?? [];
        $ticket_user_name = $metadata['user_name'] ?? $dbMeta['user_name'] ?? $order['user_name'] ?? 'Guest';

        // Gift purchases issue the purchased quantity to both the buyer and
        // recipient, each with independent ticket IDs.
        $giftRecipientUserId = (int) ($dbMeta['gift_recipient_user_id'] ?? 0);
        $giftRecipientAuthId = (int) ($dbMeta['gift_recipient_auth_id'] ?? 0);
        $giftRecipientEmail = trim((string) ($dbMeta['gift_recipient_email'] ?? ''));
        $isGift = $giftRecipientUserId > 0 && filter_var($giftRecipientEmail, FILTER_VALIDATE_EMAIL);
        $issuedQuantity = $quantity * ($isGift ? 2 : 1);
        $ticketOwners = [[
            'user_id' => (int) $order['user_id'],
            'auth_id' => (int) $order['user_auth_accounts_id'],
            'name' => $ticket_user_name,
            'email' => trim((string) ($metadata['buyer_email'] ?? $order['user_email'])),
        ]];
        if ($isGift) {
            $ticketOwners[] = [
                'user_id' => $giftRecipientUserId,
                'auth_id' => $giftRecipientAuthId,
                'name' => (string) ($dbMeta['gift_recipient_name'] ?? $ticket_user_name),
                'email' => $giftRecipientEmail,
            ];
        }

        // 1. Update order status (now 'processing' from the claim)
        $pdo->prepare("
            UPDATE orders SET payment_status = 'success', payment_method = ?, updated_at = NOW()
            WHERE id = ?
        ")->execute([$result['data']['channel'] ?? 'card', $order['id']]);

        // 2. Atomic ticket decrement and attendee/sales count increment
        // Ensures we don't oversell even with high concurrency.
        $stmt = $pdo->prepare("
            UPDATE events 
            SET ticket_count = CASE WHEN ticket_count IS NULL THEN NULL ELSE ticket_count - ? END, 
                attendee_count = attendee_count + ?, 
                sales_count = sales_count + ? 
            WHERE id = ? AND (ticket_count IS NULL OR ticket_count >= ?)
        ");
        $stmt->execute([$issuedQuantity, $issuedQuantity, $issuedQuantity, $order['event_id'], $issuedQuantity]);

        if ($stmt->rowCount() === 0) {
            // Sold out — release claim and record failure
            $pdo->rollBack();
            $pdo->prepare("UPDATE orders SET payment_status = 'failed' WHERE id = ?")
                ->execute([$order['id']]);
            http_response_code(409); // Conflict
            echo json_encode(['success' => false, 'message' => 'Event sold out or tickets are no longer available in the requested quantity.']);
            exit;
        }

        // 3. Handle Payment and Ticket (Idempotent)
        $tStmt = $pdo->prepare("
            SELECT t.id, t.barcode, t.user_id
            FROM tickets t 
            JOIN payments p ON t.payment_id = p.id 
            WHERE p.reference COLLATE utf8mb4_unicode_ci = ?
        ");
        $tStmt->execute([$reference]);
        $existingTickets = $tStmt->fetchAll(PDO::FETCH_ASSOC);

        $barcode = null;
        $allBarcodes = [];
        $buyerBarcodes = [];
        $ticketJobReady = false;
        $processorPath = '';
        if (empty($existingTickets)) {
            require_once __DIR__ . '/../../api/utils/id-generator.php';
            $paymentCustomId = generatePaymentId($pdo);

            // Save to payments table
            $payStmt = $pdo->prepare("
                INSERT INTO payments (event_id, user_id, custom_id, reference, amount, quantity, ticket_type, status, paystack_response, payment_id, transaction_id, paid_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'paid', ?, ?, ?, NOW())
            ");
            $payStmt->execute([
                $order['event_id'],
                $order['user_id'],
                $paymentCustomId,
                $reference,
                $order['amount'],
                $quantity,
                $ticket_type,
                json_encode($result['data']),
                (string) ($result['data']['id'] ?? ''),
                (string) ($result['data']['reference'] ?? '')
            ]);
            $payment_id = $pdo->lastInsertId();

            // 3. Queue background job for QR/PDF generation and notifications
            $pdfPaths = [];
            $barcodes = [];
            $ticket_ids = [];
            $ticket_owner_ids = [];
            $ticket_owner_names = [];
            $ticket_owner_auth_ids = [];

            foreach ($ticketOwners as $owner) {
                for ($i = 0; $i < $quantity; $i++) {
                    $ticketCustomId = generateTicketId($pdo);
                    $barcode = $ticketCustomId;

                    $pdo->prepare("
                        INSERT INTO tickets (user_id, event_id, payment_id, order_id, custom_id, barcode, status)
                        VALUES (?, ?, ?, ?, ?, ?, 'valid')
                    ")->execute([
                        $owner['user_id'],
                        $order['event_id'],
                        $payment_id,
                        $order['id'],
                        $ticketCustomId,
                        $barcode
                    ]);
                    $ticket_id = $pdo->lastInsertId();
                    $ticket_ids[] = $ticket_id;
                    $barcodes[] = $barcode;
                    $allBarcodes[] = $barcode;
                    $ticket_owner_ids[] = $owner['user_id'];
                    $ticket_owner_names[] = $owner['name'];
                    $ticket_owner_auth_ids[] = $owner['auth_id'];
                    if ((int) $owner['user_id'] === (int) $order['user_id']) {
                        $buyerBarcodes[] = $barcode;
                    }
                }
            }

            $ticketData = [
                'event_id'       => $order['event_id'],
                'user_id'        => (int) $order['user_id'],
                'order_id'       => $order['id'],
                'event_name'     => $order['event_name'],
                'event_date'     => $order['event_date'],
                'event_time'     => $order['event_time'],
                'location'       => $order['location'] ?? $order['address'],
                'address'        => $order['address'],
                'user_name'      => $ticketOwners[0]['name'],
                'payment_status' => 'paid',
                'event_image'    => $order['image_path'] ?? null,
                'amount'         => $order['amount'],
                'ticket_type'    => $ticket_type,
                'quantity'       => $quantity,
                'selected_locs'  => $selected_locs
            ];
            
            $barcode = $barcodes[0]; 
            $pdo->commit();

            $jobData = [
                'type' => 'generate_tickets_and_notify',
                'reference' => $reference,
                'payment_id' => $payment_id,
                'order_id' => $order['id'],
                'barcodes' => $barcodes,
                'ticket_ids' => $ticket_ids,
                'ticket_owner_ids' => $ticket_owner_ids,
                'ticket_owner_names' => $ticket_owner_names,
                'ticket_owner_auth_ids' => $ticket_owner_auth_ids,
                'ticket_owner_emails' => array_map(
                    static fn(array $owner): string => $owner['email'],
                    array_merge(...array_map(
                        static fn(array $owner): array => array_fill(0, $quantity, $owner),
                        $ticketOwners
                    ))
                ),
                'ticket_data' => $ticketData,
                'user_email' => $isGift
                    ? $giftRecipientEmail
                    : ($metadata['buyer_email'] ?? $order['user_email']),
                'ticket_emails' => $isGift
                    ? [$order['user_email'], $giftRecipientEmail]
                    : [$metadata['buyer_email'] ?? $order['user_email']],
                'user_phone' => $order['user_phone'],
                'user_auth_accounts_id' => $isGift && $giftRecipientAuthId > 0
                    ? $giftRecipientAuthId
                    : $order['user_auth_accounts_id'],
                'organizer_auth_id' => $order['organizer_auth_id'] ?? null,
                'quantity' => $quantity
            ];

            $processorPath = __DIR__ . '/../utils/process-ticket-queue.php';
            $ticketJobReady = true;
        } else {
            $pdo->commit();
            foreach ($existingTickets as $existingTicket) {
                $allBarcodes[] = $existingTicket['barcode'];
                if ((int) $existingTicket['user_id'] === (int) $order['user_id']) {
                    $buyerBarcodes[] = $existingTicket['barcode'];
                }
            }
            $barcode = $buyerBarcodes[0] ?? ($existingTickets[0]['barcode'] ?? null);
        }

        $responsePayload = json_encode([
            'success'    => true,
            'status'     => 'success',
            'message'    => 'Payment verified successfully.',
            'reference'  => $reference,
            'amount'     => (float) $order['amount'],
            'event_name' => $order['event_name'],
            'barcode'    => $buyerBarcodes[0] ?? $barcode,
            'barcodes'   => $allBarcodes,
            'buyer_barcodes' => $buyerBarcodes,
        ]);

        echo $responsePayload;

        if (function_exists('fastcgi_finish_request')) {
            fastcgi_finish_request();
        }

        if (!empty($ticketJobReady)) {
            if (!defined('RUNNING_INLINE')) { define('RUNNING_INLINE', true); }
            global $globalJobData;
            $globalJobData = $jobData;
            include_once $processorPath;
        }

    } catch (Exception $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        // Release the processing claim so a retry can re-process this order
        $pdo->prepare("UPDATE orders SET payment_status = 'pending' WHERE id = ? AND payment_status = 'processing'")
            ->execute([$order['id']]);
        throw $e;
    }
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    error_log('[verify-payment.php] Fatal error: ' . $e->getMessage() . ' in ' . $e->getFile() . ':' . $e->getLine());
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'message' => 'Verification failed. Please contact support if the issue persists.'
    ]);
}
