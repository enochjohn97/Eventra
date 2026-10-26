<?php

header('Content-Type: application/json');
require_once __DIR__ . '/../../server/config.php';
require_once __DIR__ . '/../../config/database.php';
require_once '../../config/payment.php';
require_once '../../includes/middleware/auth.php';
require_once __DIR__ . '/../../includes/helpers/short-url-helper.php';

$pdo = $pdo ?? getPDO();

// Must be a logged-in user
$user_id_or_auth_id = checkAuth('user');

// ── Input ────────────────────────────────────────────────────────────────────
$body          = json_decode(file_get_contents('php://input'), true) ?? [];
$event_id      = (int)($body['event_id']    ?? $_POST['event_id']    ?? 0);
$quantity      = max(1, (int)($body['quantity']    ?? $_POST['quantity']    ?? 1));
$ticket_type   = $body['ticket_type'] ?? $_POST['ticket_type'] ?? 'regular';
$otp_reference = $body['otp_reference'] ?? $_POST['otp_reference'] ?? null;
$selected_locs = $body['selected_locs'] ?? $_POST['selected_locs'] ?? null;
// "Get for someone else": the buyer pays, the recipient owns the ticket.
$gift_recipient_email = strtolower(trim((string)($body['gift_recipient_email'] ?? '')));

/**
 * Store links returned when a gift recipient has no EventOut account yet, so
 * the app can send them to the right store and verification can be retried.
 */
function giftStoreLinks(): array
{
    return [
        'android' => $_ENV['PLAY_STORE_URL'] ?? 'https://play.google.com/store/apps/details?id=com.example.eventra_mobile',
        'ios' => $_ENV['APP_STORE_URL'] ?? 'https://apps.apple.com/search?term=EventOut',
    ];
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

    // Ensure user_temporary_recipients audit table exists
    try {
        $pdo->exec("
            CREATE TABLE IF NOT EXISTS user_temporary_recipients (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                creator_user_id BIGINT UNSIGNED NOT NULL,
                name VARCHAR(150) NOT NULL,
                email VARCHAR(191) NOT NULL,
                phone VARCHAR(20) DEFAULT NULL,
                recipient_user_id BIGINT UNSIGNED DEFAULT NULL,
                recipient_auth_id BIGINT UNSIGNED DEFAULT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                KEY idx_creator (creator_user_id),
                KEY idx_email (email)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        ");
    } catch (\Throwable $e) {}

    // Check temporary creations quota for User A
    $creationLimit = 50;
    $quotaStmt = $pdo->prepare("SELECT COUNT(*) FROM user_temporary_recipients WHERE creator_user_id = ?");
    $quotaStmt->execute([$user_id]);
    $creationCount = (int) $quotaStmt->fetchColumn();
    $creationsLeft = max(0, $creationLimit - $creationCount);
    $giftWarning = null;
    if ($creationCount >= 45 && $creationCount < 50) {
        $giftWarning = "Warning: You have only {$creationsLeft} creation" . ($creationsLeft === 1 ? '' : 's') . " left (out of {$creationLimit} limit).";
    }

    // Direct quota check probe
    if (isset($_GET['recipient_quota']) || !empty($body['check_quota'])) {
        echo json_encode([
            'success' => true,
            'creation_count' => $creationCount,
            'creation_limit' => $creationLimit,
            'creations_left' => $creationsLeft,
            'warning' => $giftWarning,
            'limit_exceeded' => $creationCount >= $creationLimit,
            'store_links' => giftStoreLinks(),
        ]);
        exit;
    }

    if (!$event_id) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'event_id is required.']);
        exit;
    }

    // ── Gift recipient resolution & creation ─────────────────────────────────
    // "Get for someone else": recipient details are validated, stored under User A,
    // and capped at 50 creations (warning at 45-49, limit modal at 50).
    $giftRecipient = null;
    if ($gift_recipient_email !== '') {
        // Enforce 50-limit: at 50, display modal that limit is exceeded
        if ($creationCount >= $creationLimit) {
            http_response_code(403);
            echo json_encode([
                'success' => false,
                'limit_exceeded' => true,
                'message' => 'You have exceeded the limit of 50 temporary accounts. The email address that has been used to create a temporary account so they can get the ticket should download the app through Google Play or App Store.',
                'creation_count' => $creationCount,
                'creation_limit' => $creationLimit,
                'creations_left' => 0,
                'store_links' => giftStoreLinks(),
            ]);
            exit;
        }

        // Recipient Name validation: required, no digits or symbols
        $gift_recipient_name = trim((string)($body['gift_recipient_name'] ?? ''));
        if ($gift_recipient_name === '') {
            http_response_code(422);
            echo json_encode(['success' => false, 'message' => 'Recipient name is required.']);
            exit;
        }
        if (!preg_match("/^[a-zA-Z\s]+$/u", $gift_recipient_name)) {
            http_response_code(422);
            echo json_encode(['success' => false, 'message' => 'Recipient name cannot contain digits or symbols.']);
            exit;
        }

        // Recipient Email validation: required, valid email
        if (!filter_var($gift_recipient_email, FILTER_VALIDATE_EMAIL)) {
            http_response_code(422);
            echo json_encode(['success' => false, 'message' => 'Enter a valid recipient email address.']);
            exit;
        }
        if ($gift_recipient_email === strtolower((string) $user_email)) {
            http_response_code(422);
            echo json_encode(['success' => false, 'message' => 'That is your own email — use “Get Ticket” to buy for yourself.']);
            exit;
        }

        // Recipient Phone validation: required, 11 digits only
        $gift_recipient_phone = trim((string)($body['gift_recipient_phone'] ?? ''));
        if (!preg_match("/^\d{11}$/", $gift_recipient_phone)) {
            http_response_code(422);
            echo json_encode(['success' => false, 'message' => 'Recipient phone number is required and must be exactly 11 digits.']);
            exit;
        }

        // Find existing account or create temporary account under User A
        $gStmt = $pdo->prepare("
            SELECT u.id AS user_id, u.name, u.phone, a.id AS auth_id, a.email
            FROM auth_accounts a
            LEFT JOIN users u ON u.user_auth_id = a.id
            WHERE LOWER(a.email) = ?
            LIMIT 1
        ");
        $gStmt->execute([$gift_recipient_email]);
        $giftRecipient = $gStmt->fetch(PDO::FETCH_ASSOC) ?: null;

        if (!$giftRecipient || empty($giftRecipient['user_id'])) {
            // Create temporary account so they can receive the ticket
            $newAuthId = (int)($giftRecipient['auth_id'] ?? 0);
            if (!$newAuthId) {
                $emailPrefix = preg_replace('/[^a-zA-Z0-9]/', '', explode('@', $gift_recipient_email)[0]);
                if (empty($emailPrefix)) $emailPrefix = 'user';
                $candidateUsername = strtolower($emailPrefix) . '_' . bin2hex(random_bytes(3));

                $checkUser = $pdo->prepare("SELECT id FROM auth_accounts WHERE username = ? LIMIT 1");
                $checkUser->execute([$candidateUsername]);
                if ($checkUser->fetch()) {
                    $candidateUsername = strtolower($emailPrefix) . '_' . bin2hex(random_bytes(5));
                }

                $authMeta = json_encode([
                    'is_temporary' => true,
                    'created_by_user_id' => $user_id,
                    'creator_email' => $user_email,
                    'original_name' => $gift_recipient_name,
                    'original_phone' => $gift_recipient_phone,
                ]);
                $authStmt = $pdo->prepare("
                    INSERT INTO auth_accounts (email, username, password, auth_provider, role, is_active, metadata, created_at, updated_at)
                    VALUES (?, ?, NULL, 'local', 'user', 1, ?, NOW(), NOW())
                ");
                $authStmt->execute([$gift_recipient_email, $candidateUsername, $authMeta]);
                $newAuthId = (int)$pdo->lastInsertId();
            }

            $userCustomId = 'USR-' . strtoupper(bin2hex(random_bytes(4)));
            $profileMeta = json_encode([
                'is_temporary' => true,
                'created_by_user_id' => $user_id,
                'notes' => 'Created temporarily by user for ticket purchase',
            ]);
            $profileStmt = $pdo->prepare("
                INSERT INTO users (custom_id, user_auth_id, name, phone, status, metadata, created_at, updated_at)
                VALUES (?, ?, ?, ?, 'pending', ?, NOW(), NOW())
            ");
            $profileStmt->execute([
                $userCustomId,
                $newAuthId,
                $gift_recipient_name,
                $gift_recipient_phone !== '' ? $gift_recipient_phone : null,
                $profileMeta
            ]);
            $newUserId = (int)$pdo->lastInsertId();

            // Record in user_temporary_recipients for User A audit record
            $auditStmt = $pdo->prepare("
                INSERT INTO user_temporary_recipients (creator_user_id, name, email, phone, recipient_user_id, recipient_auth_id, created_at)
                VALUES (?, ?, ?, ?, ?, ?, NOW())
            ");
            $auditStmt->execute([
                $user_id,
                $gift_recipient_name,
                $gift_recipient_email,
                $gift_recipient_phone !== '' ? $gift_recipient_phone : null,
                $newUserId,
                $newAuthId
            ]);

            $creationCount++;
            $creationsLeft = max(0, $creationLimit - $creationCount);
            if ($creationCount >= 45 && $creationCount < 50) {
                $giftWarning = "Warning: You have only {$creationsLeft} creation" . ($creationsLeft === 1 ? '' : 's') . " left (out of {$creationLimit} limit).";
            }

            $giftRecipient = [
                'user_id' => $newUserId,
                'auth_id' => $newAuthId,
                'name' => $gift_recipient_name,
                'email' => $gift_recipient_email,
                'phone' => $gift_recipient_phone,
                'is_temporary' => true,
            ];
        } else {
            $giftRecipient['name'] = $gift_recipient_name;
            // Record under creator if not already recorded
            $auditCheck = $pdo->prepare("SELECT id FROM user_temporary_recipients WHERE creator_user_id = ? AND email = ? LIMIT 1");
            $auditCheck->execute([$user_id, $gift_recipient_email]);
            if (!$auditCheck->fetch()) {
                $auditStmt = $pdo->prepare("
                    INSERT INTO user_temporary_recipients (creator_user_id, name, email, phone, recipient_user_id, recipient_auth_id, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, NOW())
                ");
                $auditStmt->execute([
                    $user_id,
                    $gift_recipient_name,
                    $gift_recipient_email,
                    $gift_recipient_phone !== '' ? $gift_recipient_phone : null,
                    (int)$giftRecipient['user_id'],
                    (int)$giftRecipient['auth_id']
                ]);
                $creationCount++;
                $creationsLeft = max(0, $creationLimit - $creationCount);
                if ($creationCount >= 45 && $creationCount < 50) {
                    $giftWarning = "Warning: You have only {$creationsLeft} creation" . ($creationsLeft === 1 ? '' : 's') . " left (out of {$creationLimit} limit).";
                }
            }
        }
    }

    // Checkout edits are durable profile changes, not one-request metadata.
    $contactInfo = is_array($body['contact_info'] ?? null) ? $body['contact_info'] : [];
    $checkoutName = trim(($contactInfo['fname'] ?? '') . ' ' . ($contactInfo['lname'] ?? ''));
    if ($checkoutName !== '' && mb_strlen($checkoutName) <= 150) {
        $pdo->prepare('UPDATE users SET name = ?, updated_at = NOW() WHERE id = ?')
            ->execute([$checkoutName, $user_id]);
        $user_name = $checkoutName;
    }

    // ── Fetch event + organizer Paystack Connect details ───────────────────────
    $eStmt = $pdo->prepare("
        SELECT e.id, e.event_name, e.price, e.status, e.max_capacity, e.attendee_count,
               e.event_date, e.event_time, e.state, e.address, e.location, e.image_path,
               e.metadata, c.metadata AS organizer_metadata, e.client_id AS organizer_id,
               c.subaccount_code, c.verification_status, c.business_name AS organizer_business_name, c.name AS organizer_name,
               c.paystack_connection_status, c.paystack_auth_token, c.paystack_public_key,
               c.paystack_merchant_id, c.platform_commission_percent, c.admin_status AS organizer_admin_status,
               c.settlement_bank_name, c.settlement_bank_code, c.settlement_account_name, c.settlement_account_number
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

    $organizerMetadata = json_decode($event['organizer_metadata'] ?? '{}', true);
    $event['paystack_account_status'] = is_array($organizerMetadata)
        ? ($organizerMetadata['paystack_account_status'] ?? '')
        : '';

    if ($event['status'] !== 'published') {
        echo json_encode(['success' => false, 'message' => 'This event is not available for booking.']);
        exit;
    }
    $issuedQuantity = $quantity * ($giftRecipient ? 2 : 1);

    $paystackAccountStatus = strtolower(trim((string)($event['paystack_account_status'] ?? '')));
    if (in_array($paystackAccountStatus, ['pending', 'declined'], true)) {
        http_response_code(409);
        echo json_encode([
            'success' => false,
            'message' => 'This organizer’s Paystack account is not approved for payments yet. Please contact the organizer.',
        ]);
        exit;
    }

    // ── Calculate amount based on ticket type ──────────────────────────────────
    $unit_price = (float)$event['price'];
    if ($ticket_type === 'vip' && !empty($event['vip_price'])) {
        $unit_price = (float)$event['vip_price'];
    } elseif ($ticket_type === 'premium' && !empty($event['premium_price'])) {
        $unit_price = (float)$event['premium_price'];
    } elseif ($ticket_type === 'regular' && !empty($event['regular_price'])) {
        $unit_price = (float)$event['regular_price'];
    }

    $base_total = $unit_price * $quantity;
    $surcharge = $base_total * 0.10;
    $total = $base_total + $surcharge;
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
    // Cryptographically random — the previous uniqid()-based suffix was
    // microtime-derived and predictable (enumeration risk on get-order).
    $reference = ($amount_kobo <= 0 ? 'FREE-' : 'EVT-') . $event_id . '-'
        . strtoupper(bin2hex(random_bytes(8)));

    if ($amount_kobo <= 0) {
        // --- FREE EVENT PATH ---
        try {
            $pdo->beginTransaction();
            $capacityStmt = $pdo->prepare("
                SELECT ticket_count, max_capacity, attendee_count
                FROM events WHERE id = ? FOR UPDATE
            ");
            $capacityStmt->execute([$event_id]);
            $capacity = $capacityStmt->fetch(PDO::FETCH_ASSOC);
            if (
                !$capacity
                || ($capacity['ticket_count'] !== null && (int) $capacity['ticket_count'] < $issuedQuantity)
                || ($capacity['max_capacity'] !== null
                    && (int) $capacity['attendee_count'] + $issuedQuantity > (int) $capacity['max_capacity'])
            ) {
                $pdo->rollBack();
                http_response_code(409);
                echo json_encode(['success' => false, 'message' => 'There are not enough tickets available for this quantity.']);
                exit;
            }
            $freeTierCapacity = $event[$ticket_type . '_quantity'] ?? null;
            if ($freeTierCapacity !== null && $freeTierCapacity !== '' && (int) $freeTierCapacity > 0) {
                $soldStmt = $pdo->prepare("
                    SELECT COUNT(*) FROM tickets
                    WHERE event_id = ? AND status <> 'cancelled' AND LOWER(ticket_type) = ?
                ");
                $soldStmt->execute([$event_id, $ticket_type]);
                if ((int) $soldStmt->fetchColumn() + $issuedQuantity > (int) $freeTierCapacity) {
                    $pdo->rollBack();
                    http_response_code(409);
                    echo json_encode(['success' => false, 'message' => 'There are not enough tickets available for this quantity.']);
                    exit;
                }
            }

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
            $buyerTickets = [];
            $buyerBarcodes = [];
            $allFreeTicketData = [];
            $contactInfo = $body['contact_info'] ?? [];
            $buyerName = !empty($contactInfo)
                ? trim(($contactInfo['fname'] ?? '') . ' ' . ($contactInfo['lname'] ?? ''))
                : $user_name;
            $buyerEmail = !empty($contactInfo['email']) ? $contactInfo['email'] : $user_email;
            $ticketOwners = [[
                'user_id' => $user_id,
                'name' => $buyerName,
                'email' => $buyerEmail,
            ]];
            if ($giftRecipient) {
                $ticketOwners[] = [
                    'user_id' => (int) $giftRecipient['user_id'],
                    'name' => $giftRecipient['name'] ?: $buyerName,
                    'email' => $giftRecipient['email'],
                ];
            }
            foreach ($ticketOwners as $owner) {
                for ($i = 0; $i < $quantity; $i++) {
                    $ticketCustomId = generateTicketId($pdo);
                    $barcode = 'TKT-' . strtoupper(bin2hex(random_bytes(10)));

                    $pdo->prepare("
                        INSERT INTO tickets (user_id, event_id, payment_id, order_id, custom_id, barcode, status)
                        VALUES (?, ?, ?, ?, ?, ?, 'valid')
                    ")->execute([$owner['user_id'], $event_id, $payment_id, $order_id, $ticketCustomId, $barcode]);
                    $ticket_id = $pdo->lastInsertId();

                    $ticketData = [
                        'barcode'        => $barcode,
                        'ticket_id'      => $ticketCustomId,
                        'custom_id'      => $ticketCustomId,
                        'event_id'       => $event_id,
                        'user_id'        => $owner['user_id'],
                        'order_id'       => $order_id,
                        'event_name'     => $event['event_name'],
                        'event_date'     => $event['event_date'],
                        'event_time'     => $event['event_time'],
                        'location'       => $event['location'] ?? $event['state'] ?? 'Nigeria',
                        'address'        => $event['address'] ?? '',
                        'event_image'    => $event['image_path'] ?? '',
                        'user_name'      => $owner['name'],
                        'buyer_name'     => $owner['name'],
                        'buyer_email'    => $owner['email'],
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
                    $ticketRecord = ['barcode' => $barcode, 'id' => $ticket_id];
                    $tickets[] = $ticketRecord;
                    if ((int) $owner['user_id'] === (int) $user_id) {
                        $buyerTickets[] = $ticketRecord;
                        $buyerBarcodes[] = $barcode;
                    }
                }
            }

            $pdo->prepare("
                UPDATE events
                SET ticket_count = CASE WHEN ticket_count IS NULL THEN NULL ELSE ticket_count - ? END,
                    attendee_count = attendee_count + ?,
                    sales_count = sales_count + ?
                WHERE id = ?
            ")->execute([$issuedQuantity, $issuedQuantity, $issuedQuantity, $event_id]);

            $pdo->commit();

            // 5. Collect ticket data for the attachment-free confirmation email —
            //    the SLOW email send happens AFTER the buyer's response below.
            //    Previously the SMTP call blocked the request and a >30s mail
            //    server froze checkout until PHP's max_execution_time killed it,
            //    leaving the buyer with an empty response even though the order
            //    succeeded.
            $orgStmt = $pdo->prepare("SELECT client_auth_id FROM clients WHERE id = ? LIMIT 1");
            $orgStmt->execute([$event['organizer_id']]);
            $organizer_auth_id = $orgStmt->fetchColumn();

            // Opaque short link so the Paystack callback / receipt page never
            // exposes the real file path. Falls back to the long URL if the
            // shortener is unavailable so payments can never be blocked by it.
            $callbackUrl = buildShortUrl(
                SITE_URL . '/payment.html?reference=' . rawurlencode($reference),
                'payment',
                'pay:' . $reference,
                is_numeric($auth_id) ? (int) $auth_id : null
            ) ?? (SITE_URL . '/payment.html?reference=' . rawurlencode($reference));

            $freePayload = json_encode([
                'success'           => true,
                'message'           => 'Free ticket initiated successfully!',
                'reference'         => $reference,
                'order_id'          => (int)$order_id,
                'amount'            => 0,
                'barcodes'          => $buyerBarcodes,
                'tickets'           => $buyerTickets,
                'authorization_url' => $callbackUrl,
                'is_free'           => true,
                'gift_warning'      => $giftWarning,
                'creations_left'    => $creationsLeft,
                'creation_count'    => $creationCount,
            ]);

            // Respond to the buyer NOW; deliver email + notifications afterwards.
            require_once '../../includes/helpers/response-helper.php';
            finishResponseThen($freePayload, function () use (
                $allFreeTicketData, $auth_id, $event, $tickets, $organizer_auth_id, $user_name, $giftRecipient, $user_email
            ) {
                foreach ($allFreeTicketData as $ticketData) {
                    $emailRecipients = [$ticketData['buyer_email'] ?? ''];
                    if ($giftRecipient) {
                        $emailRecipients[] = $user_email;
                    }
                    foreach (array_unique($emailRecipients) as $emailRecipient) {
                        if (!filter_var($emailRecipient, FILTER_VALIDATE_EMAIL)) {
                            continue;
                        }
                        try {
                            EmailHelper::sendTicketEmailFull($emailRecipient, $ticketData);
                        } catch (\Throwable $mailEx) {
                            error_log('[initialize.php] Free ticket email failed (post-response): ' . $mailEx->getMessage());
                        }
                    }
                }
                createPaymentSuccessNotification($auth_id, $event['event_name'], 0);
                if ($giftRecipient) {
                    createPaymentSuccessNotification((int) $giftRecipient['auth_id'], $event['event_name'], 0);
                }
                foreach ($allFreeTicketData as $ticketData) {
                    $ticketOwnerAuthId = $giftRecipient && $ticketData['user_id'] === (int) $giftRecipient['user_id']
                        ? (int) $giftRecipient['auth_id']
                        : $auth_id;
                    createTicketIssuedNotification($ticketOwnerAuthId, $event['event_name'], $ticketData['barcode']);
                }
                if ($organizer_auth_id) {
                    createNewSaleNotification($organizer_auth_id, $user_name, $event['event_name'], 0, $auth_id);
                }
            });
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



    // ── Feature Gate: Organizer must be Paystack-connected (v2) ──
    // Only enforce gate for paid events; free events are always allowed
    $isOrganizerConnected = ($event['paystack_connection_status'] ?? 'disconnected') === 'connected'
        && !empty($event['paystack_auth_token']);
    if (!$isOrganizerConnected) {
        http_response_code(409);
        echo json_encode([
            'success' => false,
            'message' => 'This organizer has not connected a Paystack account. Payment is unavailable until the organizer completes Paystack setup.',
        ]);
        exit;
    }

    // Initialize against the organizer's own Paystack account. Falling back
    // to the platform account makes the hosted checkout display the platform
    // merchant and risks charging without the organizer's expected split.
    $activePaystackKey = trim((string)$event['paystack_auth_token']);
    $isLivePaystackKey = (bool) preg_match('/^sk_live_[A-Za-z0-9]{8,}$/', $activePaystackKey);
    $isTestPaystackKey = (bool) preg_match('/^sk_test_[A-Za-z0-9]{8,}$/', $activePaystackKey);
    if (!$isLivePaystackKey && !$isTestPaystackKey) {
        http_response_code(409);
        echo json_encode([
            'success' => false,
            'message' => 'The organizer Paystack account must use a valid live or test secret key.',
        ]);
        exit;
    }

    $platformSubaccountCode = null;
    if ($isLivePaystackKey || $isTestPaystackKey) {
        try {
            $platform = ensurePlatformSubaccount(
                $pdo,
                (int)$event['organizer_id'],
                $activePaystackKey,
                PAYSTACK_PLATFORM_COMMISSION_PERCENT
            );
        } catch (Throwable $platEx) {
            error_log('[initialize.php] Platform subaccount ensure failed for client '
                . $event['organizer_id'] . ': ' . $platEx->getMessage());
            $platform = ['success' => false, 'message' => 'Could not configure platform settlement'];
        }

        if (empty($platform['success']) || empty($platform['subaccount_code'])) {
            error_log('[initialize.php] Platform subaccount unavailable for client '
                . $event['organizer_id'] . ': ' . ($platform['message'] ?? 'unknown'));
            http_response_code(503);
            echo json_encode([
                'success' => false,
                'message' => 'Payment setup is incomplete. The organizer must finish platform settlement setup before payments can be accepted.',
            ]);
            exit;
        }
        $platformSubaccountCode = (string)$platform['subaccount_code'];
    }
    $pdo->beginTransaction();

    // ── Per-tier capacity enforcement ────────────────────────────────────────
    // The organizer's regular/vip/premium limits live in events.metadata. Lock
    // the event row first so two concurrent checkouts for the last ticket
    // serialize here instead of both reading the same remaining count.
    $tierName = in_array($ticket_type, ['regular', 'vip', 'premium'], true) ? $ticket_type : 'regular';
    $tierCapacity = $event[$tierName . '_quantity'] ?? null;
    if ($tierCapacity !== null && $tierCapacity !== '' && (int) $tierCapacity > 0) {
        $tierCapacity = (int) $tierCapacity;
        $pdo->prepare('SELECT id FROM events WHERE id = ? FOR UPDATE')->execute([$event_id]);

        // Issued tickets for this tier (never cancelled) …
        $soldStmt = $pdo->prepare("
            SELECT COUNT(*) FROM tickets
            WHERE event_id = ? AND status <> 'cancelled' AND LOWER(ticket_type) = ?
        ");
        $soldStmt->execute([$event_id, $tierName]);
        $tierUsed = (int) $soldStmt->fetchColumn();

        // … plus checkouts still holding a reservation. Pending orders older
        // than 30 minutes are abandoned Paystack sessions and stop reserving.
        $reservedStmt = $pdo->prepare("
            SELECT COALESCE(SUM(CAST(COALESCE(
                JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.issued_quantity')),
                CASE
                    WHEN JSON_EXTRACT(metadata, '$.gift_recipient_user_id') IS NOT NULL
                    THEN JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.quantity')) * 2
                    ELSE JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.quantity'))
                END,
                '0'
            ) AS UNSIGNED)), 0)
            FROM orders
            WHERE event_id = ? AND payment_status = 'pending'
              AND created_at >= NOW() - INTERVAL 30 MINUTE
              AND LOWER(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.ticket_type')), 'regular')) = ?
        ");
        $reservedStmt->execute([$event_id, $tierName]);
        $tierUsed += (int) $reservedStmt->fetchColumn();

        if ($tierUsed + $issuedQuantity > $tierCapacity) {
            $pdo->rollBack();
            $remaining = max(0, $tierCapacity - $tierUsed);
            http_response_code(409);
            echo json_encode([
                'success' => false,
                'message' => $remaining === 0
                    ? ucfirst($tierName) . ' tickets for this event are sold out.'
                    : 'Only ' . $remaining . ' ' . $tierName . ' ticket(s) left for this event.',
                'tickets_remaining' => $remaining,
            ]);
            exit;
        }
    }

    // Define metadata for the order
    $order_metadata = [
        'event_id'   => $event_id,
        'event_name' => $event['event_name'],
        'quantity'   => $quantity,
        'issued_quantity' => $issuedQuantity,
        'ticket_type'=> $ticket_type,
        'user_id'    => $user_id,
        'user_name'  => !empty($body['contact_info']) ? trim($body['contact_info']['fname'] . ' ' . $body['contact_info']['lname']) : $user_name,
        'selected_locs' => $selected_locs,
        'contact_info' => $body['contact_info'] ?? null
    ];
    if ($giftRecipient) {
        // Read back at fulfilment time so the ticket is issued to the recipient
        // even though the buyer is the one who paid.
        $order_metadata['gift_recipient_user_id'] = (int) $giftRecipient['user_id'];
        $order_metadata['gift_recipient_auth_id'] = (int) $giftRecipient['auth_id'];
        $order_metadata['gift_recipient_email'] = (string) $giftRecipient['email'];
        $order_metadata['gift_recipient_name'] = (string) $giftRecipient['name'];
    }

    // ── Insert pending order ─────────────────────────────────────────────────
    $oStmt = $pdo->prepare("
        INSERT INTO orders
            (user_id, event_id, organizer_id, subaccount_code, amount, transaction_reference, payment_status, payment_method, metadata)
        VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)
    ");
    $oStmt->execute([
        $user_id,
        $event_id,
        $event['organizer_id'],
        $platformSubaccountCode,
        $total,
        $reference,
        ($body['payment_method'] ?? 'paystack') === 'bank_transfer' ? 'bank_transfer' : 'paystack',
        json_encode($order_metadata)
    ]);
    $order_id = $pdo->lastInsertId();

    if (($body['payment_method'] ?? '') === 'bank_transfer') {
        if (empty($event['settlement_bank_name']) || empty($event['settlement_account_name']) || empty($event['settlement_account_number'])) {
            $pdo->rollBack();
            echo json_encode(['success' => false, 'message' => 'The organizer has not provided bank transfer details.']);
            exit;
        }

        $pdo->commit();
        echo json_encode([
            'success' => true,
            'payment_method' => 'bank_transfer',
            'reference' => $reference,
            'order_id' => (int)$order_id,
            'amount' => $total,
            'bank_details' => [
                'bank_name' => $event['settlement_bank_name'],
                'account_name' => $event['settlement_account_name'],
                'account_number' => $event['settlement_account_number'],
            ],
        ]);
        exit;
    }


    // ── Initialize Paystack transaction ──────────────────────────────────────
    // Opaque short callback link (see free-ticket branch above for rationale).
    // Built with its own exception guard: a shortener failure must never
    // abort the payment — we silently fall back to the long callback URL.
    $callbackUrl = SITE_URL . '/payment.html?reference=' . rawurlencode($reference);
    try {
        $callbackUrl = buildShortUrl(
            $callbackUrl,
            'payment',
            'pay:' . $reference,
            is_numeric($auth_id) ? (int) $auth_id : null
        ) ?? $callbackUrl;
    } catch (Throwable $shortUrlEx) {
        error_log('[initialize.php] Short URL fallback used: ' . $shortUrlEx->getMessage());
    }

    // Client is the primary Paystack account; EventOut receives the split via
    // its subaccount created under that client account.
    // ($activePaystackKey was resolved before the subaccount step above.)

    $contactInfo  = $body['contact_info'] ?? [];
    $buyerFname   = trim($contactInfo['fname'] ?? '');
    $buyerLname   = trim($contactInfo['lname'] ?? '');
    $buyerEmail   = !empty($contactInfo['email'])  ? $contactInfo['email']  : $user_email;
    $buyerPhone   = !empty($contactInfo['phone'])  ? $contactInfo['phone']  : null;

   
    $paystackChannels = ['card', 'bank', 'ussd', 'qr', 'mobile_money', 'bank_transfer', 'eft'];
    $paystackPayload = [
        'email'         => $buyerEmail,
        'amount'        => $amount_kobo,
        'currency'      => 'NGN',
        'reference'     => $reference,
        'callback_url'  => $callbackUrl,
        'cancel_url'    => SITE_URL . '/',
        'first_name'    => $buyerFname ?: $user_name,
        'last_name'     => $buyerLname ?: '',
        'phone'         => $buyerPhone,
        'channels'      => $paystackChannels,
        'metadata'      => [
            'order_id'        => $order_id,
            'event_id'        => $event_id,
            'event_name'      => $event['event_name'],
            'quantity'        => $quantity,
            'ticket_type'     => $ticket_type,
            'user_id'         => $user_id,
            'user_name'       => $order_metadata['user_name'],
            'buyer_name'      => $order_metadata['user_name'],
            'buyer_email'     => $buyerEmail,
            'contact_info'    => $body['contact_info'] ?? null,
            'selected_locs'   => $selected_locs,
            'gift_recipient_email' => $giftRecipient['email'] ?? null,
            'is_gift'         => $giftRecipient ? true : false,
            // Organizer display name shown on Paystack checkout page
            'organizer_name'  => $event['organizer_business_name'] ?: $event['organizer_name'] ?: 'Event Organizer',
        ],
    ];

    // This subaccount belongs to Attoneex under the organizer's own Paystack
    // account. A 90% main-account charge leaves 10% with the platform subaccount.
    if ($platformSubaccountCode !== null) {
        $paystackPayload['subaccount'] = $platformSubaccountCode;
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
        'success'                 => true,
        'authorization_url'       => $psResult['data']['authorization_url'],
        'reference'               => $reference,
        'order_id'                => (int)$order_id,
        'amount'                  => $total,
        'organizer_paystack_mode' => $isLivePaystackKey ? 'live' : 'test',
        'gift_warning'            => $giftWarning,
        'creations_left'          => $creationsLeft,
        'creation_count'          => $creationCount,
    ]);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    error_log('[initialize.php] Error: ' . $e->getMessage() . ' in ' . $e->getFile() . ':' . $e->getLine());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Initialization failed. Please try again.']);
}
