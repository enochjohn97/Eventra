<?php
header('Content-Type: application/json');
require_once '../../config/database.php';
require_once '../../config/payment.php';
require_once '../../includes/classes/Payment.php';
require_once '../../includes/helpers/sms-helper.php';
require_once '../../includes/helpers/email-helper.php';

// Retrieve the request's body
$input = file_get_contents('php://input');

// Verify signature
$signature = $_SERVER['HTTP_X_PAYSTACK_SIGNATURE'] ?? '';
if (!verifyPaystackSignature($input, $signature)) {
    http_response_code(401);
    exit();
}

http_response_code(200); // Acknowledge early to prevent timeout

$event = json_decode($input, true);

if ($event['event'] === 'charge.success') {
    $data = $event['data'];
    $reference = $data['reference'];
    $amount_paid = $data['amount'] / 100; // Paystack is in kobo/cents
    $currency = $data['currency'];

    try {
        // Atomic verification and completion
        $payment = Payment::verifyAndComplete($pdo, $reference, $data);

        if ($payment) {
            // Success! Trigger notifications

            // 1. Fetch user phone/email from DB (Payment::verifyAndComplete might need to return more info or we fetch here)
            $stmt = $pdo->prepare("SELECT a.email, u.phone, u.name, e.event_name FROM payments p JOIN users u ON p.user_id = u.id JOIN auth_accounts a ON u.user_auth_id = a.id JOIN events e ON p.event_id = e.id WHERE p.id = ?");
            $stmt->execute([$payment['id']]);
            $userInfo = $stmt->fetch();

            if ($userInfo) {
                // Send SMS Receipt
                $smsMessage = "Hi {$userInfo['name']}, your payment for {$userInfo['event_name']} was successful. Ticket barcode has been sent to your email.";
                sendSMS($userInfo['phone'], $smsMessage);

                // Send Email Ticket (Real implementation)
                $stmtTicket = $pdo->prepare("SELECT barcode FROM tickets WHERE payment_id = ?");
                $stmtTicket->execute([$payment['id']]);
                $ticket = $stmtTicket->fetch();

                if ($ticket) {
                    sendTicketEmail($userInfo['email'], $userInfo['name'], $userInfo['event_name'], $ticket['barcode']);
                }
            }
        }
    } catch (Exception $e) {
        error_log("[Paystack Webhook] Error: " . $e->getMessage());
    }
}
