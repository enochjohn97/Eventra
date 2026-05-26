<?php
/**
 * Event Reminder Cron Script
 * Sends SMS and Email reminders for upcoming events.
 * Suggested run: Hourly via actual cron.
 */

// Security Check (CLI or Secret Token)
if (php_sapi_name() !== 'cli' && (!isset($_GET['secret']) || $_GET['secret'] !== getenv('CRON_SECRET'))) {
    die("Unauthorized.");
}

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../includes/helpers/sms-helper.php';

try {
    // 1. Fetch upcoming events within the next 20 minutes that haven't had reminders sent
    $stmt = $pdo->query("
        SELECT e.id as event_id, e.event_name, e.event_date, e.event_time, u.phone, u.name, a.email, t.id as ticket_id
        FROM events e
        JOIN payments p ON e.id = p.event_id
        JOIN tickets t ON p.id = t.payment_id
        JOIN users u ON p.user_id = u.id
        JOIN auth_accounts a ON u.user_auth_id = a.id
        WHERE p.status = 'paid'
        AND TIMESTAMP(e.event_date, e.event_time) BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 20 MINUTE)
        AND t.reminder_sent = 0
    ");

    $reminders = $stmt->fetchAll();

    foreach ($reminders as $rem) {
        $message = "Hi {$rem['name']}, reminder for {$rem['event_name']} starting in 20 minutes. Have your barcode ready!";

        // Send 20m pre-event reminder via Sendchamp
        $smsResult = sendSMS($rem['phone'], $message);

        if ($smsResult['success']) {
            $update = $pdo->prepare("UPDATE tickets SET reminder_sent = 1 WHERE id = ?");
            $update->execute([$rem['ticket_id']]);
        }
    }

    echo "Sent " . count($reminders) . " Sendchamp reminders.";

} catch (Exception $e) {
    error_log("Cron Error: " . $e->getMessage());
}
?>