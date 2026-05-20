<?php

/**
 * Cron Job: Pre-event Notifications
 * Runs every 5-10 minutes to send reminders to attendees 1 hour before an event starts.
 */

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../includes/helpers/email-helper.php';
require_once __DIR__ . '/../includes/helpers/sms-helper.php';
require_once __DIR__ . '/../api/utils/notification-helper.php';

// Set timezone to Africa/Lagos
date_default_timezone_set('Africa/Lagos');


// Set time limit to avoid timeout for large events
set_time_limit(300);

try {
    $pdo = getPDO();

    // 1. Find events starting in approximately 1 hour (between 55 and 65 minutes from now)
    // We use a window to ensure we don't miss any events if the cron runs every 5 or 10 mins.
    // Also check that we haven't already sent notifications for this event.
    
    $stmt = $pdo->prepare("
        SELECT e.*, c.name as organizer_name 
        FROM events e
        JOIN clients c ON e.client_id = c.id
        WHERE e.status = 'published'
        AND e.event_date = CURRENT_DATE
        AND e.event_time BETWEEN DATE_FORMAT(DATE_ADD(NOW(), INTERVAL 55 MINUTE), '%H:%i:%s') 
                         AND DATE_FORMAT(DATE_ADD(NOW(), INTERVAL 65 MINUTE), '%H:%i:%s')
        AND (e.metadata IS NULL OR JSON_EXTRACT(e.metadata, '$.reminder_sent') IS NULL)
    ");
    $stmt->execute();
    $events = $stmt->fetchAll(PDO::FETCH_ASSOC);

    if (empty($events)) {
        exit("No events starting in the next hour require notifications.\n");
    }

    foreach ($events as $event) {
        $eventId = $event['id'];
        $eventName = $event['event_name'];
        
        echo "Processing notifications for event: $eventName (ID: $eventId)\n";

        // 2. Fetch all unique ticket holders for this event
        $ticketStmt = $pdo->prepare("
            SELECT DISTINCT u.name, u.phone, aa.email, aa.id as auth_id
            FROM tickets t
            JOIN users u ON t.user_id = u.id
            JOIN auth_accounts aa ON u.user_auth_id = aa.id
            WHERE t.event_id = ? AND t.status = 'valid'
        ");
        $ticketStmt->execute([$eventId]);
        $attendees = $ticketStmt->fetchAll(PDO::FETCH_ASSOC);

        $successCount = 0;
        foreach ($attendees as $attendee) {
            $subject = "Reminder: $eventName starts in 1 hour!";
            $body = "
                <div style='font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;'>
                    <h2 style='color: #ff5a5f;'>Event Reminder</h2>
                    <p>Hi <strong>{$attendee['name']}</strong>,</p>
                    <p>This is a friendly reminder that <strong>$eventName</strong> is starting in just 1 hour!</p>
                    <div style='background: #f9f9f9; padding: 15px; border-radius: 8px; margin: 20px 0;'>
                        <p style='margin: 5px 0;'><strong>Time:</strong> " . date('g:i A', strtotime($event['event_time'])) . "</p>
                        <p style='margin: 5px 0;'><strong>Location:</strong> {$event['address']}, {$event['state']}</p>
                    </div>
                    <p>Please have your ticket QR code ready for scanning at the entrance.</p>
                    <p>See you there!</p>
                    <hr style='border: 0; border-top: 1px solid #eee; margin: 20px 0;'>
                    <p style='font-size: 12px; color: #999; text-align: center;'>&copy; " . date('Y') . " Eventra</p>
                </div>
            ";

            // Send Email
            $emailResult = EmailHelper::sendEmail($attendee['email'], $subject, $body);

            // Send SMS if phone number is available
            if (!empty($attendee['phone'])) {
                $smsMessage = "Reminder: {$eventName} starts in 1 hour! Time: "
                    . date('g:i A', strtotime($event['event_time']))
                    . " at {$event['address']}, {$event['state']}. Please have your ticket ready.";
                sendSMS($attendee['phone'], $smsMessage);
            }

            // Create In-app Notification
            createNotification(
                $attendee['auth_id'],
                "Reminder: '$eventName' starts in 1 hour!",
                'event_reminder',
                null,
                'user',
                'system'
            );

            if ($emailResult['success']) $successCount++;
        }

        // 3. Mark event as "reminder sent" in metadata to prevent duplicates
        $metadata = json_decode($event['metadata'] ?? '{}', true);
        $metadata['reminder_sent'] = true;
        $metadata['reminder_sent_at'] = date('Y-m-d H:i:s');
        $metadata['reminder_recipient_count'] = $successCount;
        
        $updateStmt = $pdo->prepare("UPDATE events SET metadata = ? WHERE id = ?");
        $updateStmt->execute([json_encode($metadata), $eventId]);

        echo "Successfully sent $successCount notifications for '$eventName'.\n";
    }

} catch (Exception $e) {
    error_log("[Cron Pre-event Notification] Error: " . $e->getMessage());
    exit("Error: " . $e->getMessage() . "\n");
}
