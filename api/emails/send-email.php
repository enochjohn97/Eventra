<?php
/**
 * Send Email API
 * Handles various email types: receipt, ticket, notification
 */
header('Content-Type: application/json');
require_once '../../config/database.php';
require_once '../../includes/helpers/email-helper.php';

// Check authentication
if (!isset($_SESSION['user_id'])) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Unauthorized']);
    exit;
}

$data = json_decode(file_get_contents("php://input"), true);
$type = $data['type'] ?? ''; // 'receipt', 'ticket', 'notification'
$user_id = $data['user_id'] ?? $_SESSION['user_id'];
$event_id = $data['event_id'] ?? null;
$payment_ref = $data['payment_reference'] ?? null;

if (empty($type)) {
    echo json_encode(['success' => false, 'message' => 'Email type required']);
    exit;
}

try {
    // Fetch User Details
    $stmt = $pdo->prepare("SELECT name, email FROM users WHERE id = ?");
    $stmt->execute([$user_id]);
    $user = $stmt->fetch();

    if (!$user) {
        echo json_encode(['success' => false, 'message' => 'User not found']);
        exit;
    }

    $subject = "";
    $body = "";
    $attachments = [];

    switch ($type) {
        case 'receipt':
            if (!$payment_ref) {
                echo json_encode(['success' => false, 'message' => 'Payment reference required for receipt']);
                exit;
            }
            // Fetch payment details
            $stmt = $pdo->prepare("SELECT p.*, e.event_name, e.event_date FROM payments p JOIN events e ON p.event_id = e.id WHERE p.reference = ?");
            $stmt->execute([$payment_ref]);
            $payment = $stmt->fetch();

            if (!$payment) {
                echo json_encode(['success' => false, 'message' => 'Payment not found']);
                exit;
            }

            $subject = "Payment Receipt - " . $payment['event_name'];
            $body = "
                <div style='font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee;'>
                    <h2 style='color: #ff5a5f;'>Payment Received</h2>
                    <p>Hi {$user['name']},</p>
                    <p>Thank you for your purchase. Here are your transaction details:</p>
                    <table style='width: 100%; border-collapse: collapse;'>
                        <tr><td style='padding: 8px; border-bottom: 1px solid #eee;'><strong>Event:</strong></td><td style='padding: 8px; border-bottom: 1px solid #eee;'>{$payment['event_name']}</td></tr>
                        <tr><td style='padding: 8px; border-bottom: 1px solid #eee;'><strong>Reference:</strong></td><td style='padding: 8px; border-bottom: 1px solid #eee;'>{$payment_ref}</td></tr>
                        <tr><td style='padding: 8px; border-bottom: 1px solid #eee;'><strong>Amount:</strong></td><td style='padding: 8px; border-bottom: 1px solid #eee;'>₦" . number_format($payment['amount'], 2) . "</td></tr>
                        <tr><td style='padding: 8px; border-bottom: 1px solid #eee;'><strong>Date:</strong></td><td style='padding: 8px; border-bottom: 1px solid #eee;'>{$payment['paid_at']}</td></tr>
                    </table>
                    <p>Your tickets have been sent in a separate email.</p>
                </div>
            ";
            break;

        case 'ticket':
            if (!$payment_ref) {
                echo json_encode(['success' => false, 'message' => 'Payment reference required for ticket delivery']);
                exit;
            }

            require_once '../../includes/helpers/ticket-helper.php';

            // Fetch tickets and event details
            $stmt = $pdo->prepare("
                SELECT t.*, e.event_name, e.event_date, e.event_time, e.location, u.name as user_name
                FROM tickets t 
                JOIN payments p ON t.payment_id = p.id 
                JOIN events e ON p.event_id = e.id 
                JOIN users u ON p.user_id = u.id
                WHERE p.reference = ?
            ");
            $stmt->execute([$payment_ref]);
            $tickets = $stmt->fetchAll();

            if (empty($tickets)) {
                echo json_encode(['success' => false, 'message' => 'No tickets found for this reference']);
                exit;
            }

            $subject = "Your Tickets - " . $tickets[0]['event_name'];
            $ticketContent = "";
            $attachments = [];

            foreach ($tickets as $ticket) {
                // Generate real PDF ticket
                $pdfPath = generateTicketPDF($ticket);
                $attachments[] = $pdfPath;

                $ticketContent .= "
                    <div style='border: 2px dashed #ff5a5f; padding: 15px; margin-bottom: 20px; border-radius: 10px;'>
                        <h3 style='margin: 0;'>{$ticket['event_name']}</h3>
                        <p style='margin: 5px 0;'><strong>Date:</strong> {$ticket['event_date']}</p>
                        <p style='margin: 5px 0;'><strong>Ticket ID:</strong> {$ticket['barcode']}</p>
                        <p style='font-size: 13px; color: #666;'>[See attached PDF for official ticket and QR code]</p>
                    </div>
                ";
            }

            $body = "
                <div style='font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px;'>
                    <h2 style='color: #ff5a5f;'>Your Eventra Tickets</h2>
                    <p>Hi {$user['name']}, your tickets are ready! We have attached them as PDF files to this email.</p>
                    {$ticketContent}
                    <p>Please present the QR code on the attached PDF at the venue for validation.</p>
                    <p>Enjoy the event!</p>
                </div>
            ";
            break;

        case 'notification':
            $subject = $data['subject'] ?? "Event Update - Eventra";
            $message = $data['message'] ?? "";
            $body = "
                <div style='font-family: sans-serif; padding: 20px;'>
                    <h2 style='color: #ff5a5f;'>Notification</h2>
                    <p>{$message}</p>
                </div>
            ";
            break;

        default:
            echo json_encode(['success' => false, 'message' => 'Invalid email type']);
            exit;
    }

    $result = sendEmail($user['email'], $subject, $body, $attachments);
    echo json_encode($result);

} catch (PDOException $e) {
    echo json_encode(['success' => false, 'message' => 'Database error: ' . $e->getMessage()]);
}
