<?php

/**
 * Cron Job: Pre-event Notifications
 * Runs every 5-10 minutes to send reminders to attendees 20 minutes before their location starts.
 */

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../includes/helpers/email-helper.php';
require_once __DIR__ . '/../includes/helpers/sms-helper.php';
require_once __DIR__ . '/../api/utils/notification-helper.php';

// ── CRON GUARD ──────────────────────────────────────────────────────────────
// When invoked over HTTP, require the CRON_SECRET so the endpoint cannot be
// triggered (and reminders re-sent / SMS billed) by arbitrary visitors.
// CLI invocations (crontab) are always allowed.
if (PHP_SAPI !== 'cli') {
    $expectedSecret = ($_ENV['CRON_SECRET'] ?? getenv('CRON_SECRET') ?: '');
    $providedSecret = $_GET['secret'] ?? $_SERVER['HTTP_X_CRON_SECRET'] ?? '';
    if ($expectedSecret === '' || !is_string($providedSecret) || !hash_equals($expectedSecret, $providedSecret)) {
        http_response_code(401);
        header('Content-Type: application/json');
        echo json_encode(['success' => false, 'message' => 'Unauthorized cron invocation.']);
        exit;
    }
}

// Set timezone to Africa/Lagos
date_default_timezone_set('Africa/Lagos');

// Set time limit to avoid timeout for large events
set_time_limit(300);

try {
    $pdo = getPDO();

    $stmt = $pdo->prepare("
        SELECT e.*, c.name as organizer_name, c.client_auth_id
        FROM events e
        JOIN clients c ON e.client_id = c.id
        WHERE e.status = 'published'
           OR (e.status = 'draft' AND e.scheduled_publish_time IS NOT NULL)
    ");
    $stmt->execute();
    $events = $stmt->fetchAll(PDO::FETCH_ASSOC);

    if (empty($events)) {
        exit("No events require notifications.\n");
    }

    $now = time();

    foreach ($events as $event) {

        // ── Scheduled publishing: auto-publish drafts whose publish time has arrived ──
        // create-event.php stores a future scheduled_publish_time with status='draft';
        // this flips it to 'published' at the scheduled moment (Lagos local time).
        if ($event['status'] === 'draft' && !empty($event['scheduled_publish_time'])) {
            try {
                $schedAt = new DateTime($event['scheduled_publish_time'], new DateTimeZone('Africa/Lagos'));
                if ($schedAt <= new DateTime('now', new DateTimeZone('Africa/Lagos'))) {
                    $pdo->prepare("UPDATE events SET status = 'published' WHERE id = ?")
                        ->execute([$event['id']]);
                    $event['status'] = 'published';
                    echo "Auto-published scheduled event '{$event['event_name']}' (id={$event['id']}).\n";

                    // Notify the organizer that their event is now live
                    if (!empty($event['client_auth_id'])) {
                        createNotification(
                            (int) $event['client_auth_id'],
                            "Your event '{$event['event_name']}' is now live (scheduled publish).",
                            'event_published',
                            null,
                            'client',
                            'system',
                            ['event_id' => (int) $event['id']]
                        );
                    }
                }
            } catch (Exception $schedEx) {
                error_log('[Cron] Bad scheduled_publish_time for event ' . $event['id'] . ': ' . $schedEx->getMessage());
            }
        }

        // Skip the rest of the reminder workflow for events still in draft
        if ($event['status'] !== 'published') {
            continue;
        }
        $eventId = $event['id'];
        $eventName = $event['event_name'];
        $metadata = json_decode($event['metadata'] ?? '{}', true);

        // 1. Resolve locations
        $locs = json_decode($event['locations'] ?? '[]', true);
        if (empty($locs)) {
            $locs = [[
                'state' => $event['state'],
                'address' => $event['address'],
                'date' => $event['event_date'],
                'time' => $event['event_time']
            ]];
        }

        // 2. Check and send Admin + Client starting notification (20 minutes before)
        $earliestTime = strtotime($event['event_date'] . ' ' . ($event['event_time'] ?? '00:00:00'));
        $earliestDiff = ($earliestTime - $now) / 60.0;
        $adminClientNotified = isset($metadata['admin_client_starting_notified']);

        if (!$adminClientNotified && $earliestDiff <= 60 && $earliestDiff >= -30) {
            $clientAuthId = $event['client_auth_id'] ?? null;
            $adminAuthId = getAdminUserId();
            $startingMessage = "Event '{$eventName}' is starting in 20 minutes!";

            if ($clientAuthId) {
                createNotification($clientAuthId, $startingMessage, 'event_reminder', null, 'client', 'system', ['event_id' => $eventId]);
            }
            if ($adminAuthId) {
                createNotification($adminAuthId, $startingMessage, 'event_reminder', null, 'admin', 'system', ['event_id' => $eventId]);
            }

            $metadata['admin_client_starting_notified'] = true;
            $updateMetaStmt = $pdo->prepare("UPDATE events SET metadata = ? WHERE id = ?");
            $updateMetaStmt->execute([json_encode($metadata), $eventId]);
            echo "Sent starting notifications to Admin and Client for '{$eventName}'\n";
        }

        // 3. Fetch attendees for 20m reminder — per-ticket dedupe prevents
        //    double-sends across cron runs and multi-location events.
        if (empty($event['user_reminder_sent'])) {
            $ticketStmt = $pdo->prepare("
                SELECT t.id as ticket_id, t.barcode, t.reminder_sent, u.name, u.phone, aa.email, aa.id as auth_id, p.paystack_response
                FROM tickets t
                JOIN users u ON t.user_id = u.id
                JOIN auth_accounts aa ON u.user_auth_id = aa.id
                LEFT JOIN payments p ON t.payment_id = p.id
                WHERE t.event_id = ? AND t.status = 'valid' AND t.reminder_sent = 0
            ");
            $ticketStmt->execute([$eventId]);
            $attendees = $ticketStmt->fetchAll(PDO::FETCH_ASSOC);
            $markedTicketIds = [];

            $notifiedCount = 0;

            foreach ($attendees as $attendee) {
                // Resolve attendee's location name
                $selectedLocName = null;
                if (!empty($attendee['paystack_response'])) {
                    $pr = json_decode($attendee['paystack_response'], true);
                    if (isset($pr['selected_locs'])) {
                        $selectedLocName = $pr['selected_locs'];
                    } elseif (isset($pr['data']['metadata']['selected_locs'])) {
                        $selectedLocName = $pr['data']['metadata']['selected_locs'];
                    }
                }

                // Find matching location entry
                $matchingLoc = null;
                if ($selectedLocName) {
                    foreach ($locs as $l) {
                        if (strcasecmp(trim($l['state']), trim($selectedLocName)) === 0) {
                            $matchingLoc = $l;
                            break;
                        }
                    }
                }

                if (!$matchingLoc) {
                    $matchingLoc = $locs[0] ?? [
                        'state' => $event['state'],
                        'address' => $event['address'],
                        'date' => $event['event_date'],
                        'time' => $event['event_time']
                    ];
                }

                // Resolve date & time for this location
                $locDate = !empty($matchingLoc['date']) ? $matchingLoc['date'] : $event['event_date'];
                $locTime = !empty($matchingLoc['time']) ? $matchingLoc['time'] : $event['event_time'];
                $locStartTimestamp = strtotime($locDate . ' ' . ($locTime ?? '00:00:00'));

                // Calculate diff
                $locDiffMinutes = ($locStartTimestamp - $now) / 60.0;

                if ($locDiffMinutes <= 60 && $locDiffMinutes >= -30) {
                    $subject = "Reminder: {$eventName} starts in 20 minutes!";
                    $body = "
                        <div style='font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;'>
                            <h2 style='color: #ff5a5f;'>Event Reminder</h2>
                            <p>Hi <strong>{$attendee['name']}</strong>,</p>
                            <p>This is a friendly reminder that <strong>{$eventName}</strong> is starting in just 20 minutes!</p>
                            <div style='background: #f9f9f9; padding: 15px; border-radius: 8px; margin: 20px 0;'>
                                <p style='margin: 5px 0;'><strong>Time:</strong> " . date('g:i A', $locStartTimestamp) . "</p>
                                <p style='margin: 5px 0;'><strong>Location:</strong> {$matchingLoc['address']}, {$matchingLoc['state']}</p>
                            </div>
                            <p>Please have your ticket QR code ready for scanning at the entrance.</p>
                            <p>See you there!</p>
                            <hr style='border: 0; border-top: 1px solid #eee; margin: 20px 0;'>
                            <p style='font-size: 12px; color: #999; text-align: center;'>&copy; " . date('Y') . " Eventra</p>
                        </div>
                    ";

                    // Send Email
                    $emailResult = EmailHelper::sendEmail($attendee['email'], $subject, $body);

                    // Send SMS if phone available
                    if (!empty($attendee['phone'])) {
                        $smsMessage = "Reminder: {$eventName} starts in 20 minutes! Time: "
                            . date('g:i A', $locStartTimestamp)
                            . " at {$matchingLoc['address']}, {$matchingLoc['state']}. Please have your ticket ready.";
                        sendSMS(
                            $attendee['phone'],
                            $smsMessage,
                            'event_reminder',
                            ['auth_id' => (int) $attendee['auth_id']]
                        );
                    }

                    // Create In-app Notification
                    createNotification(
                        $attendee['auth_id'],
                        "Reminder: '$eventName' starts in 20 minutes!",
                        'event_reminder',
                        null,
                        'user',
                        'system',
                        ['event_id' => $eventId]
                    );

                    // Mark THIS ticket as reminded immediately — a per-ticket dedupe
                    // flag that survives cron restarts and multi-location events.
                    $markedTicketIds[] = (int) $attendee['ticket_id'];
                    $notifiedCount++;
                }
            }

            // Persist per-ticket dedupe flags (chunked IN clause)
            if (!empty($markedTicketIds)) {
                foreach (array_chunk($markedTicketIds, 200) as $chunk) {
                    $placeholders = implode(',', array_fill(0, count($chunk), '?'));
                    $pdo->prepare("UPDATE tickets SET reminder_sent = 1 WHERE id IN ($placeholders)")
                        ->execute($chunk);
                }
            }

            if ($notifiedCount > 0) {
                // Event-level flag: only mark when NO un-reminded valid tickets remain,
                // so multi-window / multi-location reminders still fire correctly.
                $remainingStmt = $pdo->prepare("SELECT COUNT(*) FROM tickets WHERE event_id = ? AND status = 'valid' AND reminder_sent = 0");
                $remainingStmt->execute([$eventId]);
                if ((int) $remainingStmt->fetchColumn() === 0) {
                    $updateFlagStmt = $pdo->prepare("UPDATE events SET user_reminder_sent = 1 WHERE id = ?");
                    $updateFlagStmt->execute([$eventId]);
                }
                echo "Successfully sent $notifiedCount reminders for event '$eventName'.\n";
            }
        }
    }

} catch (Exception $e) {
    error_log("[Cron Pre-event Notification] Error: " . $e->getMessage());
    exit("Error: " . $e->getMessage() . "\n");
}
