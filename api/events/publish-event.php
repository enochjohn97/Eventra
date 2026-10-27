<?php

/**
 * Publish Event API
 * Publishes a scheduled or draft event
 */

// Buffer output so stray PHP warnings don't corrupt the JSON response
ob_start();

header('Content-Type: application/json');
require_once '../../config/database.php';
require_once '../../includes/middleware/auth.php';

// Check authentication
$user_id = clientMiddleware();
$role = $_SESSION['role'] ?? 'client';

$data = json_decode(file_get_contents("php://input"), true);
$event_id = $data['event_id'] ?? null;

if (!$event_id) {
    ob_end_clean();
    echo json_encode(['success' => false, 'message' => 'Event ID is required']);
    exit;
}

try {
    // Use user_id directly (it is client_id from clientMiddleware)
    $resolved_client_id = $user_id;

    // Get event details with client auth id - Scoped to client
    $sql = "SELECT e.*, c.client_auth_id 
            FROM events e 
            JOIN clients c ON e.client_id = c.id 
            WHERE e.id = ?";
    $params = [$event_id];

    if ($role !== 'admin') {
        $sql .= " AND e.client_id = ?";
        $params[] = $resolved_client_id;
    }

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $event = $stmt->fetch();

    if (!$event) {
        ob_end_clean();
        echo json_encode(['success' => false, 'message' => 'Event not found']);
        exit;
    }

    // Check if user is the client who created the event or admin
    if ($role !== 'admin' && $event['client_id'] != $resolved_client_id) {
        ob_end_clean();
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'You do not have permission to publish this event']);
        exit;
    }

    // Begin transaction
    $pdo->beginTransaction();

    // Update event status to published
    $sql = "UPDATE events SET status = 'published' WHERE id = ?";
    $params = [$event_id];

    if ($role !== 'admin') {
        $sql .= " AND client_id = ?";
        $params[] = $resolved_client_id;
    }

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);

    // Commit the DB change FIRST — publish is persisted regardless of notification outcome
    $pdo->commit();

    // Send notifications (non-critical — errors are logged but never roll back the publish)
    try {
        require_once '../utils/notification-helper.php';

        $message = "Your event '{$event['event_name']}' has been published and is now live!";
        $auth_id = $_SESSION['auth_id'] ?? null;
        $client_auth_id = $event['client_auth_id'];

        createNotification($client_auth_id, $message, 'event_published', $auth_id, 'client', ($role === 'admin' ? 'admin' : 'client'));

        // Notify Admin
        $admin_id = getAdminUserId();
        if ($admin_id && $auth_id != $admin_id) {
            $admin_message = "Event '{$event['event_name']}' has been published.";
            createNotification($admin_id, $admin_message, 'event_published', $auth_id, 'admin', 'client');
        }
    } catch (Throwable $notif_err) {
        error_log("[Publish Event Notification Error] " . $notif_err->getMessage());
    }

    // ── Fan out to every user: in-app notification (mobile/web bell) + email ──
    // Mirrors the published-event fan-out in create-event.php so publishing a
    // draft reaches users exactly like creating a published event does.
    try {
        require_once '../utils/notification-helper.php';
        require_once __DIR__ . '/../../includes/helpers/email-helper.php';

        $fanoutStmt = $pdo->prepare("
            SELECT u.id, u.name, u.user_auth_id, a.email, a.notification_preference
            FROM users u
            JOIN auth_accounts a ON a.id = u.user_auth_id
        ");
        $fanoutStmt->execute();
        $pubUsers = $fanoutStmt->fetchAll(PDO::FETCH_ASSOC);

        $event_link = !empty($event['external_link'])
            ? $event['external_link']
            : rtrim($_ENV['APP_URL'] ?? '', '/') . '/e/' . ($event['tag'] ?? '');

        foreach ($pubUsers as $pubUser) {
            // In-app notification for the mobile app + website
            try {
                createNotification(
                    $pubUser['user_auth_id'],
                    "New event published: '{$event['event_name']}' — check it out!",
                    'event_published',
                    $event['client_auth_id'],
                    'user',
                    'client',
                    ['event_id' => (int) $event_id]
                );
            } catch (Throwable $inapp_err) {
                error_log("[Publish Event] In-app notify failed for user {$pubUser['id']}: " . $inapp_err->getMessage());
            }

            // Email for users who opted into notifications
            if (empty($pubUser['email']) || (int) ($pubUser['notification_preference'] ?? 1) !== 1) {
                continue;
            }
            try {
                $brandHeader = EmailHelper::brandEmailHeaderHtml('20px');
                $subject = "New Event Published: {$event['event_name']}";
                $body = $brandHeader . "
                    <div style='font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee;'>
                        <h2 style='color: #2ecc71;'>New Event Available 🎉</h2>
                        <p>Hi {$pubUser['name']},</p>
                        <p>A new event has been published: <strong>{$event['event_name']}</strong></p>
                        <p><a href='{$event_link}' style='display: inline-block; background: #722f37; color: white; padding: 8px 16px; border-radius: 8px; text-decoration: none; font-weight: 600;'>View Event</a></p>
                        <p>Check it out and get your tickets!</p>
                    </div>
                ";
                $result = EmailHelper::sendEmail($pubUser['email'], $subject, $body);
                error_log("[PublishEvent] Email to user {$pubUser['id']}: " . ($result['success'] ? 'success' : $result['message']));
            } catch (Throwable $email_err) {
                error_log("[PublishEvent] Email failed for user {$pubUser['id']}: " . $email_err->getMessage());
            }
        }
    } catch (Throwable $fanout_err) {
        error_log("[Publish Event Fanout Error] " . $fanout_err->getMessage());
    }

    ob_end_clean();
    echo json_encode([
        'success' => true,
        'message' => 'Event published successfully'
    ]);
} catch (Throwable $e) {
    // Roll back the DB change so the event is NOT published on error
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    ob_end_clean();
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Server error. Please try again.']);
}
