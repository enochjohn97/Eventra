<?php

/**
 * Purchase Ticket API
 * Handles ticket purchases for events
 */

header('Content-Type: application/json');
require_once '../../config/database.php';
require_once '../../config/payment.php';
require_once '../../includes/middleware/auth.php';
require_once '../../api/utils/id-generator.php';

// Check authentication via standardized middleware
$user_id = checkAuth('user');
$auth_id = getAuthId(); // auth_accounts.id

if (!$user_id || !$auth_id) {
    http_response_code(404);
    echo json_encode(['success' => false, 'message' => 'User profile not found']);
    exit;
}

$data = json_decode(file_get_contents("php://input"), true);
$event_id = $data['event_id'] ?? null;
$quantity = (int) ($data['quantity'] ?? 1);
$ticket_type = $data['ticket_type'] ?? 'regular'; // Support VIP/Regular ticket types
$payment_reference = $data['payment_reference'] ?? null;
$referred_by_client_name = $data['referred_by_client'] ?? null;
$selected_locs = $data['selected_locs'] ?? null;

if (!$event_id || $quantity < 1) {
    echo json_encode(['success' => false, 'message' => 'Invalid event ID or quantity']);
    exit;
}

// Validate ticket type
if (!in_array($ticket_type, ['regular', 'vip', 'premium'])) {
    echo json_encode(['success' => false, 'message' => 'Invalid ticket type. Must be regular, vip or premium']);
    exit;
}

// 0. OTP Verification Check (Secure Requirement)
if ($payment_reference && $payment_reference !== 'free') {
    $otp_verified = false;

    if (isset($_SESSION['otp_verified_ref']) && $_SESSION['otp_verified_ref'] === $payment_reference) {
        $otp_verified = true;
    } else {
        // Double check database if session expired but OTP was valid
        // Check that OTP was verified and not expired
        $stmt = $pdo->prepare(
            "SELECT id FROM payment_otps 
             WHERE user_id = ? AND payment_reference = ? 
             AND verified_at IS NOT NULL 
             AND expires_at > NOW() 
             AND attempts < 5 
             ORDER BY verified_at DESC LIMIT 1"
        );
        $stmt->execute([$user_id, $payment_reference]);
        if ($stmt->fetch()) {
            $otp_verified = true;
        }
    }

    if (!$otp_verified) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'OTP verification required before payment confirmation.']);
        exit;
    }

    // Clear session flag after use to prevent reuse in subsequent requests
    unset($_SESSION['otp_verified_ref']);
}

try {
    $pdo->beginTransaction();

    // 1. Get event details & Capacity Check
    $stmt = $pdo->prepare("SELECT * FROM events WHERE id = ? AND status = 'published' FOR UPDATE");
    $stmt->execute([$event_id]);
    $event = $stmt->fetch();

    if (!$event) {
        $pdo->rollBack();
        echo json_encode(['success' => false, 'message' => 'Event not found or not available']);
        exit;
    }

    // Merge metadata if present
    if (!empty($event['metadata'])) {
        $meta = json_decode($event['metadata'], true);
        if (is_array($meta)) {
            $event = array_merge($event, $meta);
        }
    }

    if ($event['max_capacity'] !== null && ($event['attendee_count'] + $quantity) > $event['max_capacity']) {
        $pdo->rollBack();
        echo json_encode(['success' => false, 'message' => 'Sorry, this event is sold out or has insufficient capacity.']);
        exit;
    }

    // 2. Calculate total price (support VIP/Regular/Premium pricing)
    $total_price = 0;
    if ($ticket_type === 'vip') {
        $total_price = (float) ($event['vip_price'] ?? $event['price']) * $quantity;
    } elseif ($ticket_type === 'premium') {
        $total_price = (float) ($event['premium_price'] ?? $event['price']) * $quantity;
    } else {
        $total_price = (float) ($event['regular_price'] ?? $event['price']) * $quantity;
    }

    // 3. Referral Logic
    $referred_by_id = null;
    if ($referred_by_client_name) {
        $stmt = $pdo->prepare("SELECT id FROM clients WHERE name = ? OR REPLACE(LOWER(name), ' ', '-') = ?");
        $stmt->execute([$referred_by_client_name, $referred_by_client_name]);
        $referred_by_id = $stmt->fetchColumn() ?: null;
    }

    // 4. Handle Payment Binding & Verification
    $payment_id = null;
    if ($total_price > 0) {
        if (!$payment_reference) {
            $pdo->rollBack();
            echo json_encode(['success' => false, 'message' => 'Payment reference required for paid events.']);
            exit;
        }

        // --- Payment Verification Logic ---
        $verificationSuccess = false;
        $gatewayResponse = "";

        // --- Real Paystack Verification ---
        $url = "https://api.paystack.co/transaction/verify/" . rawurlencode($payment_reference);
        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            "Authorization: Bearer " . PAYSTACK_SECRET_KEY,
            "Cache-Control: no-cache",
        ]);

        if (($_ENV['APP_ENV'] ?? '') === 'local') {
            curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
            curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
        }

        $gatewayResponse = curl_exec($ch);
        // curl_close($ch); is deprecated in PHP 8.4+ and no longer needed.

        $paystackResult = json_decode($gatewayResponse);
        if ($paystackResult && $paystackResult->status && $paystackResult->data->status === 'success') {
            $verificationSuccess = true;

            // Extra check: amount match
            $expectedAmountKobo = round($total_price * 100);
            if ($paystackResult->data->amount < $expectedAmountKobo) {
                $verificationSuccess = false;
                $gatewayResponse = json_encode(['success' => false, 'message' => 'Amount mismatch on gateway.']);
            }
            
            // Extract selected_locs from metadata if not already provided
            if (!$selected_locs && isset($paystackResult->data->metadata->selected_locs)) {
                $selected_locs = $paystackResult->data->metadata->selected_locs;
            }
        }

        if (!$verificationSuccess) {
            $pdo->rollBack();
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Payment verification failed. No valid transaction found.']);
            exit;
        }

        // --- Save Payment Record ---
        $paystack_id = (string)$paystackResult->data->id;
        $transaction_id = (string)$paystackResult->data->gateway_response;
        $customId = generatePaymentId($pdo);

        $stmt = $pdo->prepare("INSERT INTO payments (event_id, user_id, custom_id, reference, amount, status, paystack_response, payment_id, transaction_id, ticket_type, quantity, paid_at) VALUES (?, ?, ?, ?, ?, 'paid', ?, ?, ?, ?, ?, NOW())");
        $stmt->execute([$event_id, $user_id, $customId, $payment_reference, $total_price, $gatewayResponse, $paystack_id, $transaction_id, $ticket_type, $quantity]);
        $payment_id = $pdo->lastInsertId();
    } else {
        // Free ticket
        $ref = 'FREE-' . strtoupper(bin2hex(random_bytes(8)));
        $customId = generatePaymentId($pdo);
        $stmt = $pdo->prepare("INSERT INTO payments (event_id, user_id, custom_id, reference, amount, status, paystack_response, payment_id, transaction_id, ticket_type, quantity, paid_at) VALUES (?, ?, ?, ?, ?, 'paid', '{\"status\": \"free\"}', ?, ?, ?, ?, NOW())");
        $stmt->execute([$event_id, $user_id, $customId, $ref, 0, 'free_' . uniqid(), 'free_' . uniqid(), $ticket_type, $quantity]);
        $payment_id = $pdo->lastInsertId();
    }

    // 5. Insert tickets with full identity binding
    $stmt = $pdo->prepare("INSERT INTO tickets (user_id, event_id, payment_id, custom_id, barcode, ticket_code, ticket_type, status, used, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'valid', 0, NOW())");
    $tickets_generated = [];

    for ($i = 0; $i < $quantity; $i++) {
        // Generate cryptographically secure UUID-based barcode with TKT- prefix
        $barcode = 'TKT-' . strtoupper(bin2hex(random_bytes(10)));
        $ticket_code = strtoupper(bin2hex(random_bytes(4))); // Short human-readable code
        $customId = generateTicketId($pdo);
        $stmt->execute([$user_id, $event_id, $payment_id, $customId, $barcode, $ticket_code, $ticket_type]);
        $tickets_generated[] = $barcode;
    }

    // 6. Update event attendee count
    $stmt = $pdo->prepare("UPDATE events SET attendee_count = attendee_count + ? WHERE id = ?");
    $stmt->execute([$quantity, $event_id]);

    $pdo->commit();

    // Return response immediately — PDF/email generation continues after flush
    $responsePayload = json_encode([
        'success' => true,
        'message' => 'Ticket purchased successfully',
        'tickets' => $tickets_generated,
        'barcode' => $tickets_generated[0] ?? null,
        'quantity' => $quantity,
        'total_price' => $total_price,
        'event_name' => $event['event_name']
    ]);
    header('Content-Type: application/json');
    header('Content-Length: ' . strlen($responsePayload));
    echo $responsePayload;
    
    // Ensure the script continues running in the background for email/PDF processing
    ignore_user_abort(true);
    set_time_limit(0);
    if (session_id()) {
        session_write_close();
    }

    if (function_exists('fastcgi_finish_request')) {
        fastcgi_finish_request();
    } else {
        while (ob_get_level() > 0) { ob_end_flush(); }
        flush();
    }

    // 7. Post-Processing: QR/PDF Generation and Email
    require_once '../../includes/helpers/ticket-helper.php';
    require_once '../../includes/helpers/email-helper.php';
    
    // Fetch user details for ticket and email
    $stmt = $pdo->prepare("SELECT u.name, a.email FROM users u JOIN auth_accounts a ON u.user_auth_id = a.id WHERE u.id = ?");
    $stmt->execute([$user_id]);
    $user = $stmt->fetch();
    
    if (!$user) {
        error_log("[purchase-ticket.php] Critical Error: User not found for ID $user_id after successful purchase.");
        return;
    }

    $allTicketData = [];

    foreach ($tickets_generated as $barcode) {
        $ticketData = [
            'barcode'        => $barcode,
            'ticket_id'      => $barcode,
            'event_id'       => $event_id,
            'user_id'        => $user_id,
            'payment_id'     => $payment_id,
            'order_id'       => $payment_id,
            'event_name'     => $event['event_name'],
            'event_date'     => $event['event_date'],
            'event_time'     => $event['event_time'],
            'location'       => $event['location'] ?? $event['address'],
            'address'        => $event['address'] ?? null,
            'state'          => $event['state'] ?? null,
            'locations'      => $event['locations'] ?? null,
            'user_name'      => $user['name'],
            'payment_status' => 'paid',
            'event_image'    => $event['image_path'] ?? null,
            'ticket_type'    => $ticket_type,
            'amount'         => $total_price / max(1, $quantity), // per-ticket amount
            'quantity'       => 1,
            'selected_locs'  => $selected_locs,
        ];

        try {
            $qrCodePath = generateTicketQRCode($ticketData);
            if ($qrCodePath && file_exists($qrCodePath)) {
                $pdo->prepare("UPDATE tickets SET qr_code_path = ? WHERE barcode = ?")
                    ->execute([toPublicRelativePath($qrCodePath), $barcode]);
                $ticketData['qr_path'] = $qrCodePath;
                if (function_exists('base64_encode_image')) {
                    $b64 = base64_encode_image($qrCodePath);
                    if ($b64 !== '') {
                        $ticketData['qr_base64'] = $b64;
                    }
                }
            }
        } catch (\Throwable $genError) {
            error_log("[purchase-ticket.php] QR generation FAILED | barcode=$barcode error=" . $genError->getMessage());
        }

        $allTicketData[] = $ticketData;
    }

    // Send one email per ticket (each has its own QR code)
    foreach ($allTicketData as $ticketData) {
        try {
            EmailHelper::sendTicketEmailFull($user['email'], $ticketData, []);
        } catch (\Throwable $mailErr) {
            error_log("[purchase-ticket.php] Email FAILED | barcode={$ticketData['barcode']} error=" . $mailErr->getMessage());
        }
    }

    // 8. Notifications
    try {
        require_once '../utils/notification-helper.php';
        // ... (rest of notification logic)
        $clientAuthStmt = $pdo->prepare("SELECT client_auth_id FROM clients WHERE id = ?");
        $clientAuthStmt->execute([$event['client_id']]);
        $client_auth_id = $clientAuthStmt->fetchColumn();

        $admin_id = function_exists('getAdminUserId') ? getAdminUserId() : null;
        if ($admin_id && $client_auth_id && function_exists('createTicketPurchaseNotification')) {
            createTicketPurchaseNotification(
                $admin_id,
                $client_auth_id,
                $auth_id,
                $user['name'],
                $user['email'],
                $event['event_name'],
                $quantity,
                $total_price
            );
        }
        
        // Individual ticket issued notifications
        foreach ($tickets_generated as $barcode) {
            createTicketIssuedNotification($auth_id, $event['event_name'], $barcode);
        }
    } catch (Exception $e) {
        error_log("Notification Error: " . $e->getMessage());
    }
} catch (PDOException $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database error: ' . $e->getMessage()]);
} catch (Exception $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'General error: ' . $e->getMessage()]);
}
