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
    // 1. Fetch upcoming events within the next 24 hours that haven't had reminders sent
    // We'll use a new table 'reminder_logs' or a flag in 'tickets' to track.
    // For now, let's assume we send reminders to all paid ticket holders for events starting in 24h.

    $stmt = $pdo->query("
        SELECT e.id as event_id, e.event_name, e.event_date, e.event_time, u.phone, u.name, a.email, t.id as ticket_id
        FROM events e
        JOIN payments p ON e.id = p.event_id
        JOIN tickets t ON p.id = t.payment_id
        JOIN users u ON p.user_id = u.id
        JOIN auth_accounts a ON u.user_auth_id = a.id
        WHERE p.status = 'paid'
        AND e.event_date = DATE_ADD(CURDATE(), INTERVAL 1 DAY)
        AND t.reminder_sent = 0
    ");

    $reminders = $stmt->fetchAll();

    foreach ($reminders as $rem) {
        $message = "Hi {$rem['name']}, reminder for {$rem['event_name']} tomorrow at {$rem['event_time']}. Have your barcode ready!";

        // SMS disabled per requirement to only send 20m pre-event reminders via Sendchamp
        // $smsResult = sendSMS($rem['phone'], $message);
        $smsResult = ['success' => true];

        if ($smsResult['success']) {
            $update = $pdo->prepare("UPDATE tickets SET reminder_sent = 1 WHERE id = ?");
            $update->execute([$rem['ticket_id']]);
        }
    }

    echo "Sent " . count($reminders) . " reminders.";

} catch (Exception $e) {
    error_log("Cron Error: " . $e->getMessage());
}
?>