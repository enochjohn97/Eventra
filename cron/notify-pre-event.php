<?php

/**
 * Cron Job: Pre-event Notifications
 * Runs every 5-10 minutes to send reminders to attendees 30 minutes before their location starts.
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

        // 2. Check and send Admin + Client starting notification (30 minutes before)
        $earliestTime = strtotime($event['event_date'] . ' ' . ($event['event_time'] ?? '00:00:00'));
        $earliestDiff = ($earliestTime - $now) / 60.0;
        $adminClientNotified = isset($metadata['admin_client_starting_notified']);

        if (!$adminClientNotified && $earliestDiff <= 60 && $earliestDiff >= -40) {
            $clientAuthId = $event['client_auth_id'] ?? null;
            $adminAuthId = getAdminUserId();
            $startingMessage = "Event '{$eventName}' is starting in 30 minutes!";

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

        // 2b. Check and send Admin + Client "5 minutes before" notification.
        //     A second, independent pass with its own metadata flag so the 30-minute
        //     flow above is untouched. Uses the EARLIEST start time (all locations
        //     share the same start; earliest = safest). Window: fires while start is
        //     ≤ 6 min away (and ≤ 2 min past start as a missed-run catch-up).
        $fiveMinNotified = isset($metadata['admin_client_5min_notified']);
        if (!$fiveMinNotified && $earliestDiff <= 6 && $earliestDiff >= -2) {
            $clientAuthId5 = $event['client_auth_id'] ?? null;
            $adminAuthId5 = getAdminUserId();
            $fiveMinMessage = "Event '{$eventName}' is starting in 5 minutes!";

            try {
                if ($clientAuthId5) {
                    createNotification($clientAuthId5, $fiveMinMessage, 'event_starting_soon', null, 'client', 'system', ['event_id' => $eventId, 'window' => '5min']);
                }
                if ($adminAuthId5) {
                    createNotification($adminAuthId5, $fiveMinMessage, 'event_starting_soon', null, 'admin', 'system', ['event_id' => $eventId, 'window' => '5min']);
                }
                $metadata['admin_client_5min_notified'] = true;
                $pdo->prepare("UPDATE events SET metadata = ? WHERE id = ?")
                    ->execute([json_encode($metadata), $eventId]);
                echo "Sent 5-minute notifications to Admin and Client for '{$eventName}'\n";
            } catch (Throwable $fiveMinEx) {
                // Never abort the run (attendee reminders below still need to fire);
                // flag is only set on success so the next run retries.
                error_log("[Cron Reminder] 5-min admin/client notification failed for event {$eventId}: " . $fiveMinEx->getMessage());
            }
        }

        // 2c. Attendee "10 minutes before" in-app reminder (mobile app ticket
        //     screen). Own metadata flag so it never collides with the 30-minute
        //     email pass below (which consumes the per-ticket reminder_sent flag).
        $tenMinNotified = isset($metadata['event_reminder_10min_sent']);
        if (!$tenMinNotified && $earliestDiff <= 11 && $earliestDiff >= 4) {
            try {
                $attendeeStmt = $pdo->prepare("
                    SELECT DISTINCT aa.id AS auth_id
                    FROM tickets t
                    JOIN users u ON t.user_id = u.id
                    JOIN auth_accounts aa ON u.user_auth_id = aa.id
                    WHERE t.event_id = ? AND t.status = 'valid'
                ");
                $attendeeStmt->execute([$eventId]);
                $attendeeAuthIds = $attendeeStmt->fetchAll(PDO::FETCH_COLUMN);

                $tenMinMessage = "Your event '{$eventName}' starts in 10 minutes!";
                foreach ($attendeeAuthIds as $attendeeAuthId) {
                    createNotification(
                        (int) $attendeeAuthId,
                        $tenMinMessage,
                        'event_reminder',
                        null,
                        'user',
                        'system',
                        ['event_id' => $eventId, 'window' => '10min']
                    );
                }

                $metadata['event_reminder_10min_sent'] = true;
                $pdo->prepare("UPDATE events SET metadata = ? WHERE id = ?")
                    ->execute([json_encode($metadata), $eventId]);
                echo "Sent 10-minute reminders to " . count($attendeeAuthIds) . " attendee(s) for '{$eventName}'\n";
            } catch (Throwable $tenMinEx) {
                error_log("[Cron Reminder] 10-min attendee reminder failed for event {$eventId}: " . $tenMinEx->getMessage());
            }
        }

        // 3. Fetch attendees for 30m reminder — per-ticket dedupe prevents
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

                if ($locDiffMinutes <= 60 && $locDiffMinutes >= -40) {
                    $subject = "Reminder: {$eventName} starts in 30 minutes!";
                    // Brand header (embedded logo) so reminder emails carry the EventOut logo.
                    $brandHeader = EmailHelper::brandEmailHeaderHtml();
                    $body = "
                        <div style='font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;'>
                            {$brandHeader}
                            <h2 style='color: #ff5a5f;'>Event Reminder</h2>
                            <p>Hi <strong>{$attendee['name']}</strong>,</p>
                            <p>This is a friendly reminder that <strong>{$eventName}</strong> is starting in just 30 minutes!</p>
                            <div style='background: #f9f9f9; padding: 15px; border-radius: 8px; margin: 20px 0;'>
                                <p style='margin: 5px 0;'><strong>Time:</strong> " . date('g:i A', $locStartTimestamp) . "</p>
                                <p style='margin: 5px 0;'><strong>Location:</strong> {$matchingLoc['address']}, {$matchingLoc['state']}</p>
                            </div>
                            <p>Please have your ticket QR code ready for scanning at the entrance.</p>
                            <p>See you there!</p>
                            <hr style='border: 0; border-top: 1px solid #eee; margin: 20px 0;'>
                            <p style='font-size: 12px; color: #999; text-align: center;'>&copy; " . date('Y') . " EventOut</p>
                        </div>
                    ";

                    // Send Email — the PRIMARY channel. It must go out even if
                    // SMS fails below, so it is attempted first and its result
                    // is logged. Email failure never aborts the run.
                    $emailResult = ['success' => false, 'message' => 'not attempted'];
                    try {
                        $emailResult = EmailHelper::sendEmail($attendee['email'], $subject, $body);
                        if (empty($emailResult['success'])) {
                            error_log("[Cron Reminder] Email FAILED for ticket {$attendee['ticket_id']} ({$attendee['email']}): " . ($emailResult['message'] ?? 'unknown reason'));
                        }
                    } catch (Throwable $emailEx) {
                        error_log("[Cron Reminder] Email EXCEPTION for ticket {$attendee['ticket_id']}: " . $emailEx->getMessage());
                    }

                    // Send SMS — best effort. A transport/Brevo failure here must
                    // NOT stop the email, the in-app notification, or the dedupe
                    // marking (it would otherwise re-send on every cron run).
                    if (!empty($attendee['phone'])) {
                        try {
                            $smsMessage = "Reminder: {$eventName} starts in 30 minutes! Time: "
                                . date('g:i A', $locStartTimestamp)
                                . " at {$matchingLoc['address']}, {$matchingLoc['state']}. Please have your ticket ready.";
                            $smsResult = sendSMS(
                                $attendee['phone'],
                                $smsMessage,
                                'event_reminder',
                                ['auth_id' => (int) $attendee['auth_id']]
                            );
                            if (empty($smsResult['success'])) {
                                error_log("[Cron Reminder] SMS failed (email still sent) for ticket {$attendee['ticket_id']}: " . ($smsResult['message'] ?? 'unknown reason'));
                            }
                        } catch (Throwable $smsEx) {
                            error_log("[Cron Reminder] SMS EXCEPTION for ticket {$attendee['ticket_id']}: " . $smsEx->getMessage());
                        }
                    }

                    // Create In-app Notification — wrapped so notification-table
                    // issues can never skip the ticket marking either.
                    try {
                        createNotification(
                            $attendee['auth_id'],
                            "Reminder: '$eventName' starts in 30 minutes!",
                            'event_reminder',
                            null,
                            'user',
                            'system',
                            ['event_id' => $eventId]
                        );
                    } catch (Throwable $notifEx) {
                        error_log("[Cron Reminder] In-app notification failed for ticket {$attendee['ticket_id']}: " . $notifEx->getMessage());
                    }

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
