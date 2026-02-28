<?php
/**
 * Purchase Ticket API
 * Handles ticket purchases for events
 */
header('Content-Type: application/json');
require_once '../../config/database.php';
require_once '../../config/payment.php';

// Check authentication
if (!isset($_SESSION['user_id']) || $_SESSION['role'] !== 'user') {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Unauthorized. User access required.']);
    exit;
}

$data = json_decode(file_get_contents("php://input"), true);
$event_id = $data['event_id'] ?? null;
$quantity = (int) ($data['quantity'] ?? 1);
$payment_reference = $data['payment_reference'] ?? null;
$referred_by_client_name = $data['referred_by_client'] ?? null;
$user_id = $_SESSION['user_id'];

if (!$event_id || $quantity < 1) {
    echo json_encode(['success' => false, 'message' => 'Invalid event ID or quantity']);
    exit;
}

// 0. OTP Verification Check (Secure Requirement)
if ($payment_reference && $payment_reference !== 'free') {
    if (!isset($_SESSION['otp_verified_ref']) || $_SESSION['otp_verified_ref'] !== $payment_reference) {
        // Double check database if session expired but OTP was valid
        $stmt = $pdo->prepare("SELECT id FROM payment_otps WHERE user_id = ? AND payment_reference = ? AND attempts < 5 AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1");
        $stmt->execute([$user_id, $payment_reference]);
        if (!$stmt->fetch()) {
            http_response_code(403);
            echo json_encode(['success' => false, 'message' => 'OTP verification required before payment confirmation.']);
            exit;
        }
    }
    // Clear session flag after use to prevent reuse if necessary, 
    // but keep it for the duration of this request
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

    if ($event['max_capacity'] !== null && ($event['attendee_count'] + $quantity) > $event['max_capacity']) {
        $pdo->rollBack();
        echo json_encode(['success' => false, 'message' => 'Sorry, this event is sold out or has insufficient capacity.']);
        exit;
    }

    // 2. Calculate total price
    $total_price = (float) $event['price'] * $quantity;

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

        // --- Paystack Verification ---
        $url = "https://api.paystack.co/transaction/verify/" . rawurlencode($payment_reference);
        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            "Authorization: Bearer " . PAYSTACK_SECRET_KEY,
            "Cache-Control: no-cache",
        ]);
        $response = curl_exec($ch);
        curl_close($ch);

        $paystackResult = json_decode($response);

        if (!$paystackResult || !$paystackResult->status || $paystackResult->data->status !== 'success') {
            $pdo->rollBack();
            echo json_encode(['success' => false, 'message' => 'Payment verification failed. Transaction not successful.']);
            exit;
        }

        // Check amount match (Paystack uses kobo/smallest unit)
        $expectedAmountKobo = round($total_price * 100);
        if ($paystackResult->data->amount < $expectedAmountKobo) {
            $pdo->rollBack();
            echo json_encode(['success' => false, 'message' => 'Payment amount mismatch.']);
            exit;
        }

        $stmt = $pdo->prepare("INSERT INTO payments (event_id, user_id, reference, amount, status, paystack_response, paid_at) VALUES (?, ?, ?, ?, 'paid', ?, NOW())");
        $stmt->execute([$event_id, $user_id, $payment_reference, $total_price, $response]);
        $payment_id = $pdo->lastInsertId();
    } else {
        // Free ticket
        $stmt = $pdo->prepare("INSERT INTO payments (event_id, user_id, reference, amount, status, paystack_response, paid_at) VALUES (?, ?, ?, ?, 'paid', 'free', NOW())");
        $stmt->execute([$event_id, $user_id, 'FREE-' . strtoupper(uniqid()), 0, 'free']);
        $payment_id = $pdo->lastInsertId();
    }

    // 5. Insert tickets
    $stmt = $pdo->prepare("INSERT INTO tickets (payment_id, barcode, used, created_at) VALUES (?, ?, 0, NOW())");
    $tickets_generated = [];

    for ($i = 0; $i < $quantity; $i++) {
        $barcode = 'VIP-' . strtoupper(substr(md5(uniqid(mt_rand(), true)), 0, 8));
        $stmt->execute([$payment_id, $barcode]);
        $tickets_generated[] = $barcode;
    }

    // 6. Update event attendee count
    $stmt = $pdo->prepare("UPDATE events SET attendee_count = attendee_count + ? WHERE id = ?");
    $stmt->execute([$quantity, $event_id]);

    $pdo->commit();

    // 7. Post-Processing: Notifications
    try {
        require_once '../utils/notification-helper.php';
        $stmt = $pdo->prepare("SELECT name, email FROM users WHERE id = ?");
        $stmt->execute([$user_id]);
        $user = $stmt->fetch();

        $admin_id = function_exists('getAdminUserId') ? getAdminUserId() : null;
        if ($admin_id && function_exists('createTicketPurchaseNotification')) {
            createTicketPurchaseNotification(
                $admin_id,
                $event['client_id'],
                $user_id,
                $user['name'],
                $user['email'],
                $event['event_name'],
                $quantity,
                $total_price
            );
        }
    } catch (Exception $e) {
        error_log("Notification Error: " . $e->getMessage());
    }

    echo json_encode([
        'success' => true,
        'message' => 'Ticket purchased successfully',
        'tickets' => $tickets_generated,
        'quantity' => $quantity,
        'total_price' => $total_price,
        'event_name' => $event['event_name']
    ]);

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

