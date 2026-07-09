<?php

header('Content-Type: application/json');
require_once __DIR__ . '/../../server/config.php';
require_once __DIR__ . '/../../config/database.php';
require_once '../../config/payment.php';
require_once '../../includes/middleware/auth.php';

// Must be a logged-in user
$user_id_or_auth_id = checkAuth('user');

// ── Input ────────────────────────────────────────────────────────────────────
$body          = json_decode(file_get_contents('php://input'), true) ?? [];
$event_id      = (int)($body['event_id']    ?? $_POST['event_id']    ?? 0);
$quantity      = max(1, (int)($body['quantity']    ?? $_POST['quantity']    ?? 1));
$ticket_type   = $body['ticket_type'] ?? $_POST['ticket_type'] ?? 'regular';
$otp_reference = $body['otp_reference'] ?? $_POST['otp_reference'] ?? null;
$selected_locs = $body['selected_locs'] ?? $_POST['selected_locs'] ?? null;

if (!$event_id) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'event_id is required.']);
    exit;
}

try {
    // ── Determine actual auth_id and user_id ──────────────────────────────────
    // checkAuth returns auth_accounts.id if token-based, or users.id if session-based
    // We need both to properly complete the order
    
    $auth_id = null;
    $user_id = null;
    $user_email = null;
    $user_name = null;
    
    // First, assume it's an auth_accounts.id from Bearer token
    $uStmt = $pdo->prepare("
        SELECT u.id AS user_id, u.name, a.id AS auth_id, a.email 
        FROM users u 
        JOIN auth_accounts a ON u.user_auth_id = a.id 
        WHERE a.id = ?
    ");
    $uStmt->execute([$user_id_or_auth_id]);
    $user = $uStmt->fetch(PDO::FETCH_ASSOC);

    if (!$user) {
        // Try as users.id from session
        $uStmt = $pdo->prepare("
            SELECT u.id AS user_id, u.name, a.id AS auth_id, a.email 
            FROM users u 
            JOIN auth_accounts a ON u.user_auth_id = a.id 
            WHERE u.id = ?
        ");
        $uStmt->execute([$user_id_or_auth_id]);
        $user = $uStmt->fetch(PDO::FETCH_ASSOC);
    }

    if (!$user) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'User profile not found. Please ensure your profile is complete.']);
        exit;
    }

    $auth_id = $user['auth_id'];
    $user_id = $user['user_id'];
    $user_email = $user['email'];
    $user_name = $user['name'];

    // ── Fetch event + organizer Paystack Connect details ───────────────────────
    $eStmt = $pdo->prepare("
        SELECT e.id, e.event_name, e.price, e.status, e.max_capacity, e.attendee_count,
               e.event_date, e.event_time, e.state, e.address, e.location, e.image_path,
               e.metadata, e.client_id AS organizer_id,
               c.subaccount_code, c.verification_status,
               c.paystack_connection_status, c.paystack_auth_token, c.paystack_public_key,
               c.paystack_merchant_id, c.platform_commission_percent, c.admin_status AS organizer_admin_status
        FROM events e
        JOIN clients c ON e.client_id = c.id
        WHERE e.id = ? AND e.deleted_at IS NULL
    ");
    $eStmt->execute([$event_id]);
    $event = $eStmt->fetch(PDO::FETCH_ASSOC);
    
    if ($event && !empty($event['metadata'])) {
        $meta = json_decode($event['metadata'], true);
        if (is_array($meta)) {
            $event = array_merge($event, $meta);
        }
    }

    if (!$event) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Event not found.']);
        exit;
    }

    if ($event['status'] !== 'published') {
        echo json_encode(['success' => false, 'message' => 'This event is not available for booking.']);
        exit;
    }

    // ── Feature Gate: Organizer must be Paystack-connected (v2) ────────────────
    // Only enforce gate for paid events; free events are always allowed
    $isOrganizerConnected = ($event['paystack_connection_status'] ?? 'disconnected') === 'connected'
        && !empty($event['paystack_auth_token']);

    // ── Calculate amount based on ticket type ──────────────────────────────────
    $unit_price = (float)$event['price'];
    if ($ticket_type === 'vip' && !empty($event['vip_price'])) {
        $unit_price = (float)$event['vip_price'];
    } elseif ($ticket_type === 'premium' && !empty($event['premium_price'])) {
        $unit_price = (float)$event['premium_price'];
    } elseif ($ticket_type === 'regular' && !empty($event['regular_price'])) {
        $unit_price = (float)$event['regular_price'];
    }
    
    $total = $unit_price * $quantity;
    $amount_kobo = (int)round($total * 100);

    // ── OTP VERIFICATION FOR PAID EVENTS (CRITICAL SECURITY) ────────────────
    if ($amount_kobo > 0 && !empty($otp_reference)) {
        // Verify OTP before allowing payment initialization
        $otpStmt = $pdo->prepare("
            SELECT id, verified_at, expires_at FROM payment_otps 
            WHERE user_id = ? AND payment_reference = ? 
            ORDER BY created_at DESC LIMIT 1
        ");
        $otpStmt->execute([$user_id, $otp_reference]);
        $otpRecord = $otpStmt->fetch();

        if (!$otpRecord) {
            http_response_code(403);
            echo json_encode(['success' => false, 'message' => 'OTP not found. Please request OTP first.']);
            exit;
        }

        if (empty($otpRecord['verified_at'])) {
            http_response_code(403);
            echo json_encode(['success' => false, 'message' => 'OTP has not been verified. Please verify your OTP first.']);
            exit;
        }

        if (strtotime($otpRecord['expires_at']) < time()) {
            http_response_code(403);
            echo json_encode(['success' => false, 'message' => 'OTP has expired. Please request a new one.']);
            exit;
        }
    }

    // ── Generate unique reference ────────────────────────────────────────────
    $reference = ($amount_kobo <= 0 ? 'FREE-' : 'EVT-') . $event_id . '-' . strtoupper(substr(uniqid(), -8));

    if ($amount_kobo <= 0) {
        // --- FREE EVENT PATH ---
        try {
            $pdo->beginTransaction();

            // 1. Create success order
            $oStmt = $pdo->prepare("
                INSERT INTO orders (user_id, event_id, organizer_id, subaccount_code, amount, transaction_reference, payment_status, payment_method)
                VALUES (?, ?, ?, ?, 0, ?, 'success', 'free')
            ");
            $oStmt->execute([$user_id, $event_id, $event['organizer_id'], $event['subaccount_code'], $reference]);
            $order_id = $pdo->lastInsertId();

            // 2. Create success payment
            require_once '../../api/utils/id-generator.php';
            $paymentCustomId = generatePaymentId($pdo);
            $meta_data = json_encode(['status' => 'free', 'selected_locs' => $selected_locs]);
            $stmt = $pdo->prepare("INSERT INTO payments (event_id, user_id, custom_id, reference, amount, status, paystack_response, payment_id, transaction_id, ticket_type, quantity, paid_at) VALUES (?, ?, ?, ?, ?, 'paid', ?, ?, ?, ?, ?, NOW())");
            $stmt->execute([$event_id, $user_id, $paymentCustomId, $reference, 0, $meta_data, 'free_' . uniqid(), 'free_' . uniqid(), $ticket_type, $quantity]);
            $payment_id = $pdo->lastInsertId();

            // 3. Create ticket(s)
            require_once '../../includes/helpers/ticket-helper.php';
            require_once '../../includes/helpers/email-helper.php';
            require_once '../../api/utils/notification-helper.php';

            $tickets = [];
            $allFreeTicketData = [];
            for ($i = 0; $i < $quantity; $i++) {
                $ticketCustomId = generateTicketId($pdo);
                // Generate consistent TKT- barcode even for free events
                $barcode = 'TKT-' . strtoupper(bin2hex(random_bytes(10)));

                $pdo->prepare("
                    INSERT INTO tickets (user_id, event_id, payment_id, order_id, custom_id, barcode, status)
                    VALUES (?, ?, ?, ?, ?, ?, 'valid')
                ")->execute([$user_id, $event_id, $payment_id, $order_id, $ticketCustomId, $barcode]);
                $ticket_id = $pdo->lastInsertId();

                $contactInfo = $body['contact_info'] ?? [];
                $buyerName   = !empty($contactInfo)
                    ? trim(($contactInfo['fname'] ?? '') . ' ' . ($contactInfo['lname'] ?? ''))
                    : $user_name;
                $buyerEmail  = !empty($contactInfo['email']) ? $contactInfo['email'] : $user_email;

                $ticketData = [
                    'barcode'        => $barcode,
                    'ticket_id'      => $ticketCustomId,
                    'custom_id'      => $ticketCustomId,
                    'event_id'       => $event_id,
                    'user_id'        => $user_id,
                    'order_id'       => $order_id,
                    'event_name'     => $event['event_name'],
                    'event_date'     => $event['event_date'],
                    'event_time'     => $event['event_time'],
                    'location'       => $event['location'] ?? $event['state'] ?? 'Nigeria',
                    'address'        => $event['address'] ?? '',
                    'event_image'    => $event['image_path'] ?? '',
                    'user_name'      => $buyerName,
                    'buyer_name'     => $buyerName,
                    'buyer_email'    => $buyerEmail,
                    'payment_status' => 'paid',
                    'amount'         => 0,
                    'ticket_type'    => $ticket_type,
                    'quantity'       => 1,
                    'selected_locs'  => $selected_locs
                ];
                $qrPath = generateTicketQRCode($ticketData);
                if ($qrPath && file_exists($qrPath)) {
                    $pdo->prepare("UPDATE tickets SET qr_code_path = ? WHERE id = ?")
                        ->execute([toPublicRelativePath($qrPath), $ticket_id]);
                    $ticketData['qr_path'] = $qrPath;
                    if (function_exists('base64_encode_image')) {
                        $b64 = base64_encode_image($qrPath);
                        if ($b64 !== '') {
                            $ticketData['qr_base64'] = $b64;
                        }
                    }
                }

                $allFreeTicketData[] = $ticketData;
                $tickets[] = ['barcode' => $barcode, 'id' => $ticket_id];
            }

            // 4. Update attendee count
            $pdo->prepare("UPDATE events SET attendee_count = attendee_count + ? WHERE id = ?")
                ->execute([$quantity, $event_id]);

            $pdo->commit();

            // 5. Notifications & Email
            foreach ($allFreeTicketData as $ftd) {
                $sendTo = $ftd['buyer_email'] ?? $user_email;
                EmailHelper::sendTicketEmailFull($sendTo, $ftd, []);
            }
            createPaymentSuccessNotification($auth_id, $event['event_name'], 0);
            createTicketIssuedNotification($auth_id, $event['event_name'], $tickets[0]['barcode']);

            $orgStmt = $pdo->prepare("SELECT client_auth_id FROM clients WHERE id = ? LIMIT 1");
            $orgStmt->execute([$event['organizer_id']]);
            $organizer_auth_id = $orgStmt->fetchColumn();
            if ($organizer_auth_id) {
                createNewSaleNotification($organizer_auth_id, $user_name, $event['event_name'], 0, $auth_id);
            }

            $callbackUrl = SITE_URL . '/public/pages/payment.html?reference=' . rawurlencode($reference);

            echo json_encode([
                'success'           => true,
                'message'           => 'Free ticket initiated successfully!',
                'reference'         => $reference,
                'order_id'          => (int)$order_id,
                'amount'            => 0,
                'authorization_url' => $callbackUrl,
                'is_free'           => true
            ]);
            exit;
        } catch (Exception $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            error_log('[initialize.php] Free checkout error: ' . $e->getMessage());
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => 'Failed to process free ticket.']);
            exit;
        }
    }



    $pdo->beginTransaction();

    // Define metadata for the order
    $order_metadata = [
        'event_id'   => $event_id,
        'event_name' => $event['event_name'],
        'quantity'   => $quantity,
        'ticket_type'=> $ticket_type,
        'user_id'    => $user_id,
        'user_name'  => !empty($body['contact_info']) ? trim($body['contact_info']['fname'] . ' ' . $body['contact_info']['lname']) : $user_name,
        'selected_locs' => $selected_locs,
        'contact_info' => $body['contact_info'] ?? null
    ];

    // ── Insert pending order ─────────────────────────────────────────────────
    $oStmt = $pdo->prepare("
        INSERT INTO orders
            (user_id, event_id, organizer_id, subaccount_code, amount, transaction_reference, payment_status, metadata)
        VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
    ");
    $oStmt->execute([
        $user_id,
        $event_id,
        $event['organizer_id'],
        $event['subaccount_code'],
        $total,
        $reference,
        json_encode($order_metadata)
    ]);
    $order_id = $pdo->lastInsertId();


    // ── Initialize Paystack transaction ──────────────────────────────────────
    $callbackUrl = SITE_URL . '/public/pages/payment.html?reference=' . rawurlencode($reference);

    // ── Choose Paystack secret key: organizer's connected key (v2) or platform key fallback ──
    $activePaystackKey = ($isOrganizerConnected && !empty($event['paystack_auth_token']))
        ? $event['paystack_auth_token']
        : PAYSTACK_SECRET_KEY;

    $paystackPayload = [
        'email'         => $user_email,
        'amount'        => $amount_kobo,
        'reference'     => $reference,
        'callback_url'  => $callbackUrl,
        'metadata'      => [
            'order_id'    => $order_id,
            'event_id'    => $event_id,
            'event_name'  => $event['event_name'],
            'quantity'    => $quantity,
            'ticket_type' => $ticket_type,
            'user_id'     => $user_id,
            'user_name'   => $order_metadata['user_name'],
            'buyer_name'  => $order_metadata['user_name'],
            'buyer_email' => !empty($body['contact_info']['email']) ? $body['contact_info']['email'] : $user_email,
            'contact_info'=> $body['contact_info'] ?? null,
            'selected_locs' => $selected_locs
        ],
    ];

    // ── Split Payment: Apply 1% platform commission via transaction_charge ─────
    $commissionPct = (float) ($event['platform_commission_percent'] ?? 1.00);
    $commissionKobo = (int) round($amount_kobo * ($commissionPct / 100));
    if ($isOrganizerConnected && $commissionKobo > 0) {
        // transaction_charge: flat amount charged for platform, remainder to organizer
        $paystackPayload['transaction_charge'] = $commissionKobo;
        $paystackPayload['bearer']             = 'account'; // platform bears the charge, deducts from platform share
        error_log(sprintf(
            '[initialize.php] Split: total=%d kobo, platform_commission=%d kobo (%.2f%%)',
            $amount_kobo, $commissionKobo, $commissionPct
        ));
    } elseif (!$isOrganizerConnected && !empty($event['subaccount_code'])
        && !str_starts_with($event['subaccount_code'], 'SETTLE_MOCK_')
        && !str_starts_with(PAYSTACK_SECRET_KEY, 'sk_test')) {
        // Legacy fallback: subaccount split for old connected organizers
        $paystackPayload['subaccount'] = $event['subaccount_code'];
        $paystackPayload['bearer']     = 'subaccount';
    }

    $ch = curl_init('https://api.paystack.co/transaction/initialize');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => json_encode($paystackPayload),
        CURLOPT_TIMEOUT        => 20,
        CURLOPT_HTTPHEADER     => [
            'Authorization: Bearer ' . $activePaystackKey,
            'Content-Type: application/json',
            'Cache-Control: no-cache',
        ],
    ]);

    if (($_ENV['APP_ENV'] ?? '') === 'local') {
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
    }

    $response  = curl_exec($ch);
    $curlError = curl_error($ch);

    if ($curlError || !$response) {
        $pdo->rollBack();
        http_response_code(502);
        echo json_encode(['success' => false, 'message' => 'Could not reach payment gateway. Please try again.']);
        exit;
    }

    $psResult = json_decode($response, true);

    if (!($psResult['status'] ?? false)) {
        $pdo->rollBack();
        $errMsg = $psResult['message'] ?? 'Paystack initialization failed.';
        $psCode = $psResult['code'] ?? 'N/A';
        error_log("[initialize.php] Paystack Error: {$errMsg} (Code: {$psCode})");

        // Provide more helpful messages for common errors
        if (str_contains($errMsg, 'subaccount')) {
            $errMsg = "Organizer payment setup issue: " . $errMsg;
        }

        echo json_encode(['success' => false, 'message' => $errMsg, 'error_code' => $psCode]);
        exit;
    }

    $pdo->commit();

    echo json_encode([
        'success'           => true,
        'authorization_url' => $psResult['data']['authorization_url'],
        'reference'         => $reference,
        'order_id'          => (int)$order_id,
        'amount'            => $total,
    ]);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    error_log('[initialize.php] Error: ' . $e->getMessage() . ' in ' . $e->getFile() . ':' . $e->getLine());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Initialization failed: ' . $e->getMessage()]);
}
