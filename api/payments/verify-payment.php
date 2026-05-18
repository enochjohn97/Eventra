<?php

/**
 * Verify Payment API — Idempotent Fallback
 *
 * Called by the frontend after Paystack redirect.
 * If the webhook already processed the payment, returns the existing order state.
 * If not (webhook delay), verifies with Paystack and runs post-payment processing.
 */

header('Content-Type: application/json');
require_once '../../config/database.php';
require_once '../../config/payment.php';
require_once '../../includes/middleware/auth.php';
require_once '../../includes/helpers/ticket-helper.php';
require_once '../../includes/helpers/email-helper.php';
require_once '../../includes/helpers/sms-helper.php';
require_once '../../api/utils/notification-helper.php';

// Load shared webhook helper (processSuccessfulPayment is defined there)
// We replicate it inline here to keep the file self-contained.

$auth_id = checkAuth('user');

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
        SELECT o.id, o.payment_status, o.amount, o.event_id, o.user_id, o.organizer_id,
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
        echo json_encode([
            'success' => true,
            'status' => 'success',
            'message' => 'Payment already verified.',
            'amount' => (float) $order['amount'],
            'event_name' => $order['event_name'],
            'reference' => $reference,
        ]);
        exit;
    }

    // ── Verify with Paystack ─────────────────────────────────────────────────
    $url = 'https://api.paystack.co/transaction/verify/' . rawurlencode($reference);
    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 15,
        CURLOPT_HTTPHEADER => [
            'Authorization: Bearer ' . PAYSTACK_SECRET_KEY,
            'Cache-Control: no-cache',
        ],
    ]);
    $response = curl_exec($ch);
    $curlError = curl_error($ch);

    if ($curlError || !$response) {
        http_response_code(502);
        echo json_encode(['success' => false, 'message' => 'Could not reach payment gateway. Please try again.']);
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
    // (Same logic as webhook; fully idempotent)

    $pdo->beginTransaction();

    try {
        // 0. Extract quantity and ticket_type from metadata
        $metadata = $result['data']['metadata'] ?? [];
        $quantity = max(1, (int) ($metadata['quantity'] ?? 1));
        $ticket_type = $metadata['ticket_type'] ?? 'regular';
        $selected_locs = $metadata['selected_locs'] ?? null;

        // 1. Update order status
        $pdo->prepare("
            UPDATE orders SET payment_status = 'success', payment_method = ?, updated_at = NOW()
            WHERE id = ? AND payment_status != 'success'
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
        $stmt->execute([$quantity, $quantity, $quantity, $order['event_id'], $quantity]);

        if ($stmt->rowCount() === 0) {
            // Check if it's because it's sold out or event doesn't exist
            $pdo->rollBack();
            http_response_code(409); // Conflict
            echo json_encode(['success' => false, 'message' => 'Event sold out or tickets are no longer available in the requested quantity.']);
            exit;
        }

        // 3. Handle Payment and Ticket (Idempotent)
        $tStmt = $pdo->prepare("
            SELECT t.id, t.barcode 
            FROM tickets t 
            JOIN payments p ON t.payment_id = p.id 
            WHERE p.reference COLLATE utf8mb4_unicode_ci = ?
        ");
        $tStmt->execute([$reference]);
        $existingTickets = $tStmt->fetchAll(PDO::FETCH_ASSOC);

        $barcode = null;
        if (empty($existingTickets)) {
            require_once '../../api/utils/id-generator.php';
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

            // 3. Generate QR codes and PDFs synchronously for immediate delivery
            $pdfPaths = [];
            $barcodes = [];
            $ticket_ids = [];
            
            for ($i = 0; $i < $quantity; $i++) {
                $ticketCustomId = generateTicketId($pdo);
                $barcode = $ticketCustomId;

                $pdo->prepare("
                    INSERT INTO tickets (user_id, event_id, payment_id, order_id, custom_id, barcode, status)
                    VALUES (?, ?, ?, ?, ?, ?, 'valid')
                ")->execute([
                    $order['user_id'],
                    $order['event_id'],
                    $payment_id,
                    $order['id'],
                    $ticketCustomId,
                    $barcode
                ]);
                $ticket_id = $pdo->lastInsertId();
                $ticket_ids[] = $ticket_id;
                $barcodes[] = $barcode;

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
                    'user_name'      => $order['user_name'],
                    'payment_status' => 'paid',
                    'event_image'    => $order['image_path'] ?? null,
                    'amount'         => $order['amount'],
                    'ticket_type'    => $ticket_type,
                    'quantity'       => $quantity,
                    'selected_locs'  => $selected_locs
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

                    $pdfPath = generateTicketPDF($ticketData);
                    if ($pdfPath && file_exists($pdfPath)) {
                        $pdfPaths[] = $pdfPath;
                    }
                } catch (\Throwable $genError) {
                    error_log("[verify-payment.php] Ticket generation FAILED | barcode=$barcode error=" . $genError->getMessage());
                }
            }
            
            $barcode = $barcodes[0]; 
            $pdo->commit();

            // ── Send notifications (outside transaction) ──────────────────────────
            if (!empty($pdfPaths)) {
                // Use the enriched ticketData (from the last generated ticket) so QR is included
                $emailTicket = $ticketData;
                EmailHelper::sendTicketEmailFull($order['user_email'], $emailTicket, $pdfPaths);
            }

            // SMS
            if (!empty($order['user_phone'])) {
                sendSMS($order['user_phone'], "Hi {$order['user_name']}, your ticket for {$order['event_name']} is confirmed! Check your email for the PDF.");
            }

            // In-app notifications
            createPaymentSuccessNotification($user_auth_accounts_id, $order['event_name'], $order['amount']);
            createTicketIssuedNotification($user_auth_accounts_id, $order['event_name'], $barcode);
            
            if (!empty($order['organizer_auth_id'])) {
                createNewSaleNotification($order['organizer_auth_id'], $order['user_name'], $order['event_name'], $order['amount'], $user_auth_accounts_id);
            }
        } else {
            $pdo->commit();
            $barcode = $existingTickets[0]['barcode']; 
        }

        echo json_encode([
            'success' => true,
            'status' => 'success',
            'message' => 'Payment verified successfully.',
            'reference' => $reference,
            'amount' => (float) $order['amount'],
            'event_name' => $order['event_name'],
            'barcode' => $barcode,
        ]);
    } catch (Exception $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $e;
    }
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    error_log('[verify-payment.php] Fatal error: ' . $e->getMessage() . ' in ' . $e->getFile() . ':' . $e->getLine());
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Verification failed: ' . $e->getMessage(),
        'error_info' => $e->getFile() . ':' . $e->getLine()
    ]);
}
