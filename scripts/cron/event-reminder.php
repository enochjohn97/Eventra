<?php
/**
 * Event Reminder Cron Job
 * Sends reminders to users 24 hours before an event
 */
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/helpers/email-helper.php';

// Security check: simple secret key for cron
$cron_secret = $_ENV['CRON_SECRET'] ?? '';
if (!isset($argv[1]) || $argv[1] !== $cron_secret) {
    if (($_GET['secret'] ?? '') !== $cron_secret) {
        die("Unauthorized cron access");
    }
}

try {
    // 1. Fetch tickets for events starting between 24 and 25 hours from now
    $stmt = $pdo->prepare("
        SELECT DISTINCT u.email, u.name, e.event_name, e.event_date, e.event_time, e.location 
        FROM tickets t
        JOIN payments p ON t.payment_id = p.id
        JOIN users u ON p.user_id = u.id
        JOIN events e ON p.event_id = e.id
        WHERE e.event_date = DATE_ADD(CURDATE(), INTERVAL 1 DAY)
        AND t.status = 'valid'
    ");
    $stmt->execute();
    $reminders = $stmt->fetchAll();

    $count = 0;
    foreach ($reminders as $reminder) {
        $subject = "Reminder: " . $reminder['event_name'] . " is tomorrow!";
        $body = "
            <div style='font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee;'>
                <h2 style='color: #ff5a5f;'>Event Reminder</h2>
                <p>Hi {$reminder['name']},</p>
                <p>This is a friendly reminder that <strong>{$reminder['event_name']}</strong> is happening tomorrow!</p>
                <div style='background: #f9f9f9; padding: 15px; border-radius: 10px; margin: 20px 0;'>
                    <p style='margin: 5px 0;'><strong>Date:</strong> {$reminder['event_date']}</p>
                    <p style='margin: 5px 0;'><strong>Time:</strong> {$reminder['event_time']}</p>
                    <p style='margin: 5px 0;'><strong>Location:</strong> {$reminder['location']}</p>
                </div>
                <p>Don't forget to bring your tickets! You can find them in your email or account dashboard.</p>
                <p>We look forward to seeing you there!</p>
            </div>
        ";

        $result = sendEmail($reminder['email'], $subject, $body);
        if ($result['success']) {
            $count++;
        } else {
            error_log("Failed to send reminder to {$reminder['email']}: {$result['message']}");
        }
    }

    echo "Successfully sent $count event reminders." . PHP_EOL;

} catch (PDOException $e) {
    error_log("Reminder Cron Error: " . $e->getMessage());
    echo "Error processing reminders." . PHP_EOL;
}
