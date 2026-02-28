<?php
/**
 * Email Helper using PHPMailer
 */

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;

require_once __DIR__ . '/../../vendor/autoload.php';
require_once __DIR__ . '/../../config/email.php';

/**
 * Send an email
 * 
 * @param string $to Recipient email
 * @param string $subject Email subject
 * @param string $body Email content (HTML)
 * @param string $altBody Email content (Plain text)
 * @return array ['success' => bool, 'message' => string]
 */
function sendEmail($to, $subject, $body, $altBody = '')
{
    if (empty(SMTP_HOST) || empty(SMTP_USER) || empty(SMTP_PASS)) {
        error_log("[Email Helper] Error: SMTP credentials not configured");
        return ['success' => false, 'message' => 'SMTP credentials not configured'];
    }

    $mail = new PHPMailer(true);

    try {
        // Server settings
        $mail->isSMTP();
        $mail->Host = SMTP_HOST;
        $mail->SMTPAuth = true;
        $mail->Username = SMTP_USER;
        $mail->Password = SMTP_PASS;
        $mail->SMTPSecure = SMTP_SECURE;
        $mail->Port = SMTP_PORT;

        // Recipients
        $mail->setFrom(EMAIL_FROM, EMAIL_FROM_NAME);
        $mail->addAddress($to);

        // Content
        $mail->isHTML(true);
        $mail->Subject = $subject;
        $mail->Body = $body;
        $mail->AltBody = $altBody ?: strip_tags($body);

        $mail->send();
        return ['success' => true, 'message' => 'Email sent successfully'];
    } catch (Exception $e) {
        error_log("[Email Helper] Error: Mailer Error: {$mail->ErrorInfo}");
        return ['success' => false, 'message' => "Mailer Error: {$mail->ErrorInfo}"];
    }
}

/**
 * Send Ticket Purchase Confirmation Email
 * 
 * @param string $to
 * @param string $userName
 * @param string $eventName
 * @param string $barcode
 * @return array
 */
function sendTicketEmail($to, $userName, $eventName, $barcode)
{
    $subject = "Your Ticket for {$eventName}";

    $body = "
        <div style='font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee;'>
            <h2 style='color: #ff5a5f;'>Ticket Confirmation</h2>
            <p>Hi <strong>{$userName}</strong>,</p>
            <p>Thank you for your purchase! Your ticket for <strong>{$eventName}</strong> is ready.</p>
            <div style='background: #f9f9f9; padding: 20px; text-align: center; border-radius: 10px; margin: 20px 0;'>
                <p style='margin-bottom: 5px; color: #666;'>Ticket Barcode</p>
                <div style='font-size: 24px; font-weight: bold; letter-spacing: 5px;'>{$barcode}</div>
            </div>
            <p>Please present this barcode at the entrance of the event.</p>
            <hr style='border: 0; border-top: 1px solid #eee; margin: 20px 0;'>
            <p style='font-size: 12px; color: #999; text-align: center;'>
                &copy; " . date('Y') . " Eventra. All rights reserved.
            </p>
        </div>
    ";

    return sendEmail($to, $subject, $body);
}
