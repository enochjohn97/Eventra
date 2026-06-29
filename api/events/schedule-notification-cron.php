<?php

/**
 * Scheduled Event Notification Cron Job
 * Purpose: Send notifications for scheduled events (1 day before + 5 minutes before)
 * Schedule: Run this script every 5 minutes via cron
 * Cron example: (every 5 minutes) php /path/to/schedule-notification-cron.php
 */

require_once '../../config/database.php';
require_once '../utils/notification-helper.php';

// Set timezone to Africa/Lagos for database consistency
date_default_timezone_set('Africa/Lagos');
$pdo->exec("SET time_zone = '+01:00'");


try {
    echo "[" . date('Y-m-d H:i:s') . "] Starting notification cron job...\n";

    // 1. "Day Before" Rule: Precisely 24 hours from now
    // Window: ±1 minute (since cron runs every minute)
    $oneDayQuery = $pdo->prepare("
        SELECT e.*, c.business_name, c.client_auth_id
        FROM events e
        JOIN clients c ON e.client_id = c.id
        WHERE e.status = 'scheduled'
            AND e.deleted_at IS NULL
            AND TIMESTAMP(e.event_date, e.event_time) BETWEEN 
                (NOW() + INTERVAL 24 HOUR - INTERVAL 1 MINUTE)
                AND (NOW() + INTERVAL 24 HOUR + INTERVAL 1 MINUTE)
            AND (e.schedule_notification_sent IS NULL OR e.schedule_notification_sent = 0)
    ");
    $oneDayQuery->execute();
    $oneDayEvents = $oneDayQuery->fetchAll();

    // 2. "Direct" Trigger: Event time has passed or is now
    $immediateQuery = $pdo->prepare("
        SELECT e.*, c.business_name, c.client_auth_id
        FROM events e
        JOIN clients c ON e.client_id = c.id
        WHERE e.status = 'scheduled'
            AND e.deleted_at IS NULL
            AND e.scheduled_publish_time <= NOW()
    ");
    $immediateQuery->execute();
    $immediateEvents = $immediateQuery->fetchAll();

    // Get admin user ID
    $adminId = getAdminUserId();

    // Helper to process and send
    $processEvents = function ($events, $isLeadTime = false) use ($pdo, $adminId) {
        foreach ($events as $event) {
            // Atomic update: Mark as sent BEFORE actually sending to prevent race conditions in long-running processes
            // If the script crashes, we might miss one, but better than spamming.
            // Actually, for 100% delivery, we should mark it AFTER success,
            // but the user asked for "set to 1 immediately to prevent duplicate alerts".
            if (!$isLeadTime) {
                $pdo->prepare("UPDATE events SET status = 'published', schedule_notification_sent = 1 WHERE id = ?")->execute([$event['id']]);
            } else {
                $pdo->prepare("UPDATE events SET schedule_notification_sent = 1 WHERE id = ?")->execute([$event['id']]);
            }

            $eventDateTime = date('F j, Y \a\t g:i A', strtotime("{$event['event_date']} {$event['event_time']}"));

            if ($isLeadTime) {
                $clientMessage = "Publication Reminder: Your event '{$event['event_name']}' is scheduled for tomorrow at {$eventDateTime}. Please finalize the status!";
                $type = 'lead_time_reminder';
            } else {
                $clientMessage = "Direct Trigger: Your event '{$event['event_name']}' is now live (Scheduled for {$eventDateTime})!";
                $type = 'immediate_trigger';
            }

            $metadata = [
                'event_id' => $event['id'],
                'event_name' => $event['event_name'],
                'scheduled_time' => "{$event['event_date']} {$event['event_time']}",
                'triggered_at' => date('Y-m-d H:i:s')
            ];

            // Send to Client with Retry
            $clientRes = sendNotificationWithRetry($event['client_auth_id'], $clientMessage, $type, 1, 'client', 'admin', $metadata);

            // Notify Admin
            if ($adminId) {
                $adminMessage = "Notification sent for '{$event['event_name']}' (Client: {$event['business_name']})";
                sendNotificationWithRetry($adminId, $adminMessage, "admin_{$type}", $event['client_auth_id'], 'admin', 'admin', $metadata);
            }

            echo "Processed event: {$event['event_name']} (" . ($isLeadTime ? "24h Reminder" : "Immediate") . ")\n";
        }
    };

    $processEvents($oneDayEvents, true);
    $processEvents($immediateEvents, false);

    $total = count($oneDayEvents) + count($immediateEvents);
    echo "[" . date('Y-m-d H:i:s') . "] Cron completed. Total processed: $total\n";
} catch (Exception $e) {
    error_log("Notification Cron Error: " . $e->getMessage());
    echo "Fatal Error: " . $e->getMessage() . "\n";
}
