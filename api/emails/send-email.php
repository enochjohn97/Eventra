<?php

/**
 * Send Email API
 * Handles various email types: receipt, ticket (with PDF), notification
 */

header('Content-Type: application/json');
require_once '../../config/database.php';
require_once '../../includes/middleware/auth.php';
require_once '../../includes/helpers/email-helper.php';

// Polyfill for getallheaders() - required for InfinityFree and some shared hosting
if (!function_exists('getallheaders')) {
    function getallheaders()
    {
        $headers = [];

        // Check for Apache's mod_php or CGI
        if (function_exists('apache_request_headers')) {
            return apache_request_headers();
        }

        // Manual header collection from $_SERVER (works for CGI, FastCGI, etc.)
        foreach ($_SERVER as $name => $value) {
            if (substr($name, 0, 5) === 'HTTP_') {
                // Convert HTTP_X_FORWARDED_FOR to X-Forwarded-For
                $header = str_replace(' ', '-', ucwords(strtolower(str_replace('_', ' ', substr($name, 5)))));
                $headers[$header] = $value;
            } elseif (in_array($name, ['CONTENT_TYPE', 'CONTENT_LENGTH', 'CONTENT_MD5'])) {
                // These don't have HTTP_ prefix but are still headers
                $header = str_replace('_', '-', ucwords(strtolower($name)));
                $headers[$header] = $value;
            }
        }

        return $headers;
    }
}

// Use standardized auth middleware (supports both user and client roles)
$role = $_SESSION['user_role'] ?? null;
if (!$role) {
    $headers = getallheaders();
    $role = $headers['X-Eventra-Portal'] ?? 'user';
}

// Accept user or client session
$user_auth_id = null;
if ($role === 'user') {
    $user_auth_id = checkAuth('user');
} elseif ($role === 'client') {
    $user_auth_id = checkAuth('client');
} else {
    $user_auth_id = checkAuth('user');
}

$data = json_decode(file_get_contents("php://input"), true);
$type = $data['type'] ?? '';
$event_id = $data['event_id'] ?? null;
$payment_ref = $data['payment_reference'] ?? null;

if (empty($type)) {
    echo json_encode(['success' => false, 'message' => 'Email type required']);
    exit;
}

try {
    // Fetch User Details (by auth_id → users table)
    $stmt = $pdo->prepare("SELECT u.id, u.name, a.email FROM users u JOIN auth_accounts a ON u.user_auth_id = a.id WHERE a.id = ?");
    $stmt->execute([$user_auth_id]);
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
                    <h2 style='color: #2ecc71;'>Payment Received ✅</h2>
                    <p>Hi {$user['name']},</p>
                    <p>Thank you for your purchase! Here are your transaction details:</p>
                    <table style='width: 100%; border-collapse: collapse;'>
                        <tr><td style='padding: 8px; border-bottom: 1px solid #eee;'><strong>Event:</strong></td><td style='padding: 8px; border-bottom: 1px solid #eee;'>{$payment['event_name']}</td></tr>
                        <tr><td style='padding: 8px; border-bottom: 1px solid #eee;'><strong>Reference:</strong></td><td style='padding: 8px; border-bottom: 1px solid #eee;'>{$payment_ref}</td></tr>
                        <tr><td style='padding: 8px; border-bottom: 1px solid #eee;'><strong>Amount:</strong></td><td style='padding: 8px; border-bottom: 1px solid #eee;'>&#8358;" . number_format($payment['amount'], 2) . "</td></tr>
                        <tr><td style='padding: 8px; border-bottom: 1px solid #eee;'><strong>Date:</strong></td><td style='padding: 8px; border-bottom: 1px solid #eee;'>{$payment['paid_at']}</td></tr>
                        <tr><td style='padding: 8px; border-bottom: 1px solid #eee;'><strong>Ticket Type:</strong></td><td style='padding: 8px; border-bottom: 1px solid #eee;'>" . strtoupper($payment['ticket_type'] ?? 'Regular') . "</td></tr>
                        <tr><td style='padding: 8px; border-bottom: 1px solid #eee;'><strong>Quantity:</strong></td><td style='padding: 8px; border-bottom: 1px solid #eee;'>{$payment['quantity']}</td></tr>
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

            // Fetch tickets + event details
            $stmt = $pdo->prepare("
                SELECT t.*, e.event_name, e.event_date, e.event_time, e.location, e.address, e.image_path AS event_image,
                       u.name as user_name, a.email as user_email
                FROM tickets t
                JOIN payments p ON t.payment_id = p.id
                JOIN events e ON p.event_id = e.id
                JOIN users u ON p.user_id = u.id
                JOIN auth_accounts a ON u.user_auth_id = a.id
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

            foreach ($tickets as $ticket) {
                // Generate PDF ticket (includes QR code)
                $pdfPath = generateTicketPDF($ticket);
                if ($pdfPath) {
                    $attachments[] = $pdfPath;
                }

                $ticketContent .= "
                    <div style='border: 2px dashed #2ecc71; padding: 15px; margin-bottom: 20px; border-radius: 10px;'>
                        <h3 style='margin: 0; color: #2ecc71;'>{$ticket['event_name']}</h3>
                        <p style='margin: 5px 0;'><strong>Date:</strong> {$ticket['event_date']}</p>
                        <p style='margin: 5px 0;'><strong>Time:</strong> {$ticket['event_time']}</p>
                        <p style='margin: 5px 0;'><strong>Venue:</strong> {$ticket['location']}</p>
                        <p style='margin: 5px 0;'><strong>Ticket ID:</strong> <code>{$ticket['barcode']}</code></p>
                        <p style='font-size: 13px; color: #666;'>[See attached PDF for your official ticket and QR code]</p>
                    </div>
                ";
            }

            $body = "
                <div style='font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px;'>
                    <h2 style='color: #2ecc71;'>Your Eventra Tickets 🎟️</h2>
                    <p>Hi {$user['name']}, your tickets are ready!</p>
                    <p>We have attached your PDF ticket(s) to this email. Please present the QR code at the venue for entry validation.</p>
                    {$ticketContent}
                    <p style='color: #6b7280; font-size: 13px;'>Tickets are valid for single-entry only and are non-transferable.</p>
                    <p>Enjoy the event! 🎉</p>
                </div>
            ";
            break;

        case 'notification':
            $subject = $data['subject'] ?? "Event Update - Eventra";
            $message = $data['message'] ?? "";
            $body = "
                <div style='font-family: sans-serif; padding: 20px;'>
                    <h2 style='color: #2ecc71;'>Notification</h2>
                    <p>{$message}</p>
                </div>
            ";
            break;

        default:
            echo json_encode(['success' => false, 'message' => 'Invalid email type']);
            exit;
    }

    $result = EmailHelper::sendEmail($user['email'], $subject, $body, $attachments);
    echo json_encode($result);
} catch (PDOException $e) {
    echo json_encode(['success' => false, 'message' => 'Database error: ' . $e->getMessage()]);
}
