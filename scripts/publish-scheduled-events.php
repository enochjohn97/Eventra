#!/usr/bin/env php
<?php
/**
 * Eventra — Scheduled Event Publisher
 *
 * Run via cron every minute:
 *   * * * * * php /home/mein/Documents/Eventra/scripts/publish-scheduled-events.php >> /home/mein/Documents/Eventra/logs/scheduler.log 2>&1
 *
 * Actions:
 *   1. Publish events whose scheduled_publish_time has arrived.
 *   2. Send pre-event notifications to organizers 5-10 minutes before start.
 */

define('EVENTRA_ROOT', dirname(__DIR__));

require_once EVENTRA_ROOT . '/config/database.php';
require_once EVENTRA_ROOT . '/includes/helpers/email-helper.php';
require_once EVENTRA_ROOT . '/includes/helpers/sms-helper.php';

$now = date('Y-m-d H:i:s');
echo "[{$now}] Scheduler running...\n";

try {
    // ─── 1. Auto-publish scheduled events ─────────────────────────────────────
    $publishStmt = $pdo->prepare("
        UPDATE events
        SET status = 'published', updated_at = NOW()
        WHERE status = 'scheduled'
          AND scheduled_publish_time <= NOW()
    ");
    $publishStmt->execute();
    $published = $publishStmt->rowCount();
    if ($published > 0) {
        echo "[{$now}] Published {$published} event(s).\n";
    }

    // ─── 2. Pre-event notifications (5–10 min before event start) ─────────────
    $notifyStmt = $pdo->query("
        SELECT
            e.id,
            e.event_name,
            e.event_date,
            e.event_time,
            e.client_id,
            c.name         AS client_name,
            au.email       AS client_email,
            c.phone        AS client_phone,
            c.client_auth_id
        FROM events e
        JOIN clients c      ON e.client_id      = c.id
        JOIN auth_accounts au ON c.client_auth_id = au.id
        WHERE e.status = 'published'
          AND e.notification_sent = 0
          AND TIMESTAMPDIFF(MINUTE, NOW(), CONCAT(e.event_date, ' ', COALESCE(e.event_time, '00:00:00'))) BETWEEN 5 AND 10
    ");
    $eventsToNotify = $notifyStmt->fetchAll(PDO::FETCH_ASSOC);

    foreach ($eventsToNotify as $event) {
        $eventId = $event['id'];
        $msg     = "Hi {$event['client_name']}, your event \"{$event['event_name']}\" starts in about 5-10 minutes!";

        // In-app notification only for clients (no email/SMS per platform policy)
        $pdo->prepare("
            INSERT INTO notifications (recipient_auth_id, message, type, metadata)
            VALUES (?, ?, 'pre_event_reminder', ?)
        ")->execute([
            $event['client_auth_id'],
            $msg,
            json_encode(['event_id' => $eventId])
        ]);

        // Mark as notified
        $pdo->prepare("UPDATE events SET notification_sent = 1 WHERE id = ?")
            ->execute([$eventId]);

        echo "[{$now}] Pre-event notification sent for event {$eventId} ({$event['event_name']}).\n";

    }

    // ─── 3. Reset stale is_online flags (safety net) ──────────────────────────
    $resetStmt = $pdo->prepare("
        UPDATE auth_accounts
        SET is_online = 0
        WHERE is_online = 1
          AND (last_seen IS NULL OR last_seen < DATE_SUB(NOW(), INTERVAL 6 MINUTE))
    ");
    $resetStmt->execute();

    echo "[{$now}] Done.\n";

} catch (PDOException $e) {
    echo "[{$now}] ERROR: " . $e->getMessage() . "\n";
    exit(1);
}
