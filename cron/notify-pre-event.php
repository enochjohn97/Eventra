<?php

/**
 * Cron Job: Pre-event Notifications
 * Runs every 5-10 minutes to send reminders to attendees 20 minutes before their location starts.
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

    $stmt = $pdo->prepare("
        SELECT e.*, c.name as organizer_name, c.client_auth_id
        FROM events e
        JOIN clients c ON e.client_id = c.id
        WHERE e.status = 'published'
    ");
    $stmt->execute();
    $events = $stmt->fetchAll(PDO::FETCH_ASSOC);

    if (empty($events)) {
        exit("No events require notifications.\n");
    }

    $now = time();

    foreach ($events as $event) {
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

        if (!$adminClientNotified && $earliestDiff >= 15 && $earliestDiff <= 25) {
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

        // 3. Fetch all unique valid tickets for this event that haven't received a 20m reminder
        $ticketStmt = $pdo->prepare("
            SELECT t.id as ticket_id, t.barcode, u.name, u.phone, aa.email, aa.id as auth_id, p.paystack_response
            FROM tickets t
            JOIN users u ON t.user_id = u.id
            JOIN auth_accounts aa ON u.user_auth_id = aa.id
            LEFT JOIN payments p ON t.payment_id = p.id
            WHERE t.event_id = ? AND t.status = 'valid'
        ");
        $ticketStmt->execute([$eventId]);
        $attendees = $ticketStmt->fetchAll(PDO::FETCH_ASSOC);

        $sentTickets = $metadata['reminder_20m_sent_tickets'] ?? [];
        $metadataUpdated = false;

        foreach ($attendees as $attendee) {
            if (in_array($attendee['ticket_id'], $sentTickets)) {
                continue;
            }

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

            if ($locDiffMinutes >= 15 && $locDiffMinutes <= 25) {
                $subject = "Reminder: {$eventName} starts in 20 minutes!";
                $body = "
                    <div style='font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;'>
                        <h2 style='color: #ff5a5f;'>Event Reminder</h2>
                        <p>Hi <strong>{$attendee['name']}</strong>,</p>
                        <p>This is a friendly reminder that <strong>$eventName</strong> is starting in just 20 minutes!</p>
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
                    sendSMS($attendee['phone'], $smsMessage);
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

                $sentTickets[] = $attendee['ticket_id'];
                $metadataUpdated = true;
            }
        }

        if ($metadataUpdated) {
            $metadata['reminder_20m_sent_tickets'] = $sentTickets;
            $updateMetaStmt = $pdo->prepare("UPDATE events SET metadata = ? WHERE id = ?");
            $updateMetaStmt->execute([json_encode($metadata), $eventId]);
            echo "Successfully sent reminders for event '$eventName'.\n";
        }
    }

} catch (Exception $e) {
    error_log("[Cron Pre-event Notification] Error: " . $e->getMessage());
    exit("Error: " . $e->getMessage() . "\n");
}
