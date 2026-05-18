<?php

/**
 * Notification Helper Functions
 * Provides standardized notification creation across the application
 */

require_once __DIR__ . '/../../config/database.php';

/**
 * Ensure recipient/sender IDs are auth_accounts.id (not clients.id profile IDs).
 */
function normalizeAuthAccountId(int $id, string $role = 'client'): int
{
    if ($id <= 0) {
        return $id;
    }

    global $pdo;
    if (!isset($pdo)) {
        $pdo = getPDO();
    }

    $stmt = $pdo->prepare('SELECT id FROM auth_accounts WHERE id = ? AND role = ? LIMIT 1');
    $stmt->execute([$id, $role]);
    if ($stmt->fetchColumn()) {
        return $id;
    }

    if ($role === 'client') {
        $stmt = $pdo->prepare('SELECT client_auth_id FROM clients WHERE id = ? LIMIT 1');
        $stmt->execute([$id]);
        $authId = $stmt->fetchColumn();
        if ($authId) {
            return (int) $authId;
        }
    } elseif ($role === 'admin') {
        $stmt = $pdo->prepare('SELECT admin_auth_id FROM admins WHERE id = ? LIMIT 1');
        $stmt->execute([$id]);
        $authId = $stmt->fetchColumn();
        if ($authId) {
            return (int) $authId;
        }
    } elseif ($role === 'user') {
        $stmt = $pdo->prepare('SELECT user_auth_id FROM users WHERE id = ? LIMIT 1');
        $stmt->execute([$id]);
        $authId = $stmt->fetchColumn();
        if ($authId) {
            return (int) $authId;
        }
    }

    return $id;
}

/**
 * Create a notification
 *
 * @param int $recipient_id User ID who will receive the notification
 * @param string $message Notification message
 * @param string $type Notification type (login, logout, event_created, etc.)
 * @param int|null $sender_id Optional sender user ID
 * @return bool Success status
 */
/**
 * Create a notification
 *
 * @param int $recipient_id User ID who will receive the notification
 * @param string $message Notification message
 * @param string $type Notification type
 * @param int|null $sender_id Optional sender user ID
 * @param array|null $metadata Optional metadata to store in JSON format
 * @return bool Success status
 */
function createNotification($recipient_id, $message, $type = 'info', $sender_id = null, $recipient_role = 'user', $sender_role = null, $metadata = null)
{
    global $pdo;

    try {
        // Ensure IDs are numeric and stored as auth_accounts.id
        $recipient_id = normalizeAuthAccountId((int) $recipient_id, $recipient_role);
        $sender_id = $sender_id ? normalizeAuthAccountId((int) $sender_id, $sender_role ?? $recipient_role) : null;

        $metadataJson = $metadata ? json_encode($metadata) : null;
        $stmt = $pdo->prepare("
            INSERT INTO notifications (recipient_auth_id, sender_auth_id, message, type, metadata, sender_role, recipient_role)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ");

        $stmt->execute([$recipient_id, $sender_id, $message, $type, $metadataJson, $sender_role, $recipient_role]);
        return true;
    } catch (PDOException $e) {
        error_log("Notification creation failed: " . $e->getMessage());
        return false;
    }
}

/**
 * Sends a notification with a retry mechanism (up to 3 attempts)
 *
 * @param int $recipient_id
 * @param string $message
 * @param string $type
 * @param int|null $sender_id
 * @param array|null $metadata
 * @return bool Success status
 */
function sendNotificationWithRetry($recipient_id, $message, $type = 'info', $sender_id = null, $recipient_role = 'user', $sender_role = null, $metadata = [])
{
    $maxAttempts = 3;
    $attempts = 0;
    $success = false;
    $lastError = null;

    while ($attempts < $maxAttempts && !$success) {
        $attempts++;
        try {
            // Here we assume createNotification represents the "send" attempt
            // In a real scenario, this might call an external API (SMTP/Firebase)
            $res = createNotification($recipient_id, $message, $type, $sender_id, $recipient_role, $sender_role, array_merge($metadata ?? [], [
                'attempt' => $attempts,
                'timestamp' => date('Y-m-d H:i:s')
            ]));

            if ($res) {
                $success = true;
            }
        } catch (Exception $e) {
            $lastError = $e->getMessage();
            error_log("Attempt $attempts failed for user $recipient_id ($recipient_role): $lastError");
            if ($attempts < $maxAttempts) {
                sleep(1); // Wait a bit before retry
            }
        }
    }

    if (!$success) {
        error_log("Final failure sending notification to user $recipient_id ($recipient_role) after $maxAttempts attempts.");
    }

    return $success;
}

/**
 * Create a login notification
 */
function createLoginNotification($user_id, $user_name, $user_email, $role = 'user')
{
    $message = "Welcome back, {$user_name}! You logged in with {$user_email}";
    return createNotification($user_id, $message, 'login', $user_id, $role, $role);
}

/**
 * Create a logout notification
 */
function createLogoutNotification($user_auth_id, $user_name)
{
    $message = (string)($user_name) . " logged out";
    return createNotification($user_auth_id, $message, 'logout', $user_auth_id);
}

/**
 * Create an event created notification
 */
function createEventCreatedNotification($client_auth_id, $event_name)
{
    $message = "Event '{$event_name}' has been created successfully";
    return createNotification($client_auth_id, $message, 'event_created', $client_auth_id, 'client', 'client');
}

/**
 * Create an event scheduled notification
 */
function createEventScheduledNotification($client_id, $event_name, $scheduled_time)
{
    $formatted_time = date('M d, Y \a\t g:i A', strtotime($scheduled_time));
    $message = "Event '{$event_name}' has been scheduled for {$formatted_time}";
    return createNotification($client_id, $message, 'event_scheduled', $client_id, 'client', 'client');
}

/**
 * Create an event published notification
 */
function createEventPublishedNotification($client_auth_id, $event_name)
{
    $message = "Event '{$event_name}' has been published and is now live";
    return createNotification($client_auth_id, $message, 'event_published', $client_auth_id, 'client', 'client');
}

/**
 * Create a media uploaded notification
 */
function createMediaUploadedNotification($client_id, $file_name, $folder_name = null)
{
    $location = $folder_name ? "to folder '{$folder_name}'" : "";
    $message = "Media file '{$file_name}' has been uploaded {$location}";
    return createNotification($client_id, $message, 'media_uploaded', $client_id, 'client', 'client');
}

/**
 * Create a media deleted notification
 */
function createMediaDeletedNotification($client_id, $item_name, $type = 'file')
{
    $type_label = ucfirst($type);
    $message = "{$type_label} '{$item_name}' has been moved to trash";
    return createNotification($client_id, $message, 'media_deleted', $client_id, 'client', 'client');
}

/**
 * Create a media restored notification
 */
function createMediaRestoredNotification($client_id, $item_name, $type = 'file')
{
    $type_label = ucfirst($type);
    $message = "{$type_label} '{$item_name}' has been restored from trash";
    return createNotification($client_id, $message, 'media_restored', $client_id, 'client', 'client');
}

/**
 * Create a folder created notification
 */
function createFolderCreatedNotification($client_id, $folder_name)
{
    $message = "A new folder '{$folder_name}' has been created";
    return createNotification($client_id, $message, 'folder_created', $client_id, 'client', 'client');
}

/**
 * Create a scheduled event due notification (with action buttons)
 */
function createScheduledEventDueNotification($client_id, $event_id, $event_name)
{
    $message = "Event '{$event_name}' is ready to be published. Click to publish or cancel.";
    return createNotification($client_id, $message, 'scheduled_event_due', $client_id, 'client', 'client');
}

/**
 * Get unread notification count for a user
 */
function getUnreadNotificationCount($user_id, $role = 'user')
{
    global $pdo;

    try {
        $stmt = $pdo->prepare("SELECT COUNT(*) as count FROM notifications WHERE recipient_auth_id = ? AND recipient_role = ? AND is_read = 0");
        $stmt->execute([$user_id, $role]);
        $result = $stmt->fetch();
        return $result['count'] ?? 0;
    } catch (PDOException $e) {
        error_log("Failed to get notification count: " . $e->getMessage());
        return 0;
    }
}

/**
 * Create an event deleted notification
 */
function createEventDeletedNotification($admin_id, $event_name, $deleted_by_name)
{
    $message = "Event '{$event_name}' has been deleted by {$deleted_by_name}";
    return createNotification($admin_id, $message, 'event_deleted', null, 'admin');
}

/**
 * Create ticket purchase notifications for admin, client, and user
 */
function createTicketPurchaseNotification($admin_id, $client_id, $user_id, $buyer_name, $buyer_email, $event_name, $quantity, $total_price)
{
    // Notify admin with buyer info
    $admin_message = "New ticket purchase: {$buyer_name} ({$buyer_email}) bought {$quantity} ticket(s) for '{$event_name}' - Total: ₦" . number_format($total_price, 2);
    createNotification($admin_id, $admin_message, 'ticket_purchase', $user_id, 'admin', 'user');

    // Notify client with buyer info
    $client_message = "New ticket sale: {$buyer_name} ({$buyer_email}) purchased {$quantity} ticket(s) for your event '{$event_name}' - Total: ₦" . number_format($total_price, 2);
    createNotification($client_id, $client_message, 'ticket_purchase', $user_id, 'client', 'user');

    // Notify user (buyer) with confirmation
    $user_message = "Purchase confirmed! You bought {$quantity} ticket(s) for '{$event_name}' - Total: ₦" . number_format($total_price, 2);
    createNotification($user_id, $user_message, 'ticket_purchase_confirmation', $user_id, 'user', 'user');

    return true;
}

/**
 * Create user login notification for admin
 */
function createUserLoginNotification($admin_id, $user_id, $user_name, $user_email, $user_role = 'user')
{
    $role_label = ucfirst($user_role);
    $message = "{$role_label} login: {$user_name} ({$user_email}) has logged in";
    return createNotification($admin_id, $message, 'user_login', $user_id);
}

/**
 * Create client login notification for admin
 */
function createClientLoginNotification($admin_id, $client_id, $client_name, $client_email)
{
    $message = "Client login: {$client_name} ({$client_email}) has logged in";
    return createNotification($admin_id, $message, 'client_login', $client_id, 'admin', 'client');
}

/**
 * Create admin login notification for themselves (indicator)
 */
function createAdminLoginNotification($admin_id)
{
    $message = "System Admin logged in";
    return createNotification($admin_id, $message, 'admin_login', $admin_id);
}

/**
 * Create admin logout notification for themselves
 */
function createAdminLogoutNotification($admin_id)
{
    $message = "System Admin logged out";
    return createNotification($admin_id, $message, 'admin_logout', $admin_id);
}

/**
 * Get admin user ID (first admin in the system)
 */
function getAdminUserId()
{
    global $pdo;

    try {
        $stmt = $pdo->prepare("SELECT admin_auth_id FROM admins LIMIT 1");
        $stmt->execute();
        $result = $stmt->fetch();
        return $result['admin_auth_id'] ?? null;
    } catch (PDOException $e) {
        error_log("Failed to get admin user ID: " . $e->getMessage());
        return null;
    }
}

/**
 * Payment success notification for the buyer
 */
function createPaymentSuccessNotification($user_id, $event_name, $amount)
{
    $msg = "Payment confirmed! ₦" . number_format($amount, 2) . " for '{$event_name}'. Your ticket is on its way.";
    return createNotification($user_id, $msg, 'payment_success', $user_id, 'user', 'user');
}

/**
 * Ticket issued notification for the buyer
 */
function createTicketIssuedNotification($user_id, $event_name, $barcode)
{
    $msg = "Your ticket for '{$event_name}' has been issued. Ticket ID: {$barcode}";
    return createNotification($user_id, $msg, 'ticket_issued', $user_id, 'user', 'user');
}

/**
 * New sale alert for the organizer
 */
function createNewSaleNotification($organizer_id, $buyer_name, $event_name, $amount, $user_id = null)
{
    $msg = "New sale: {$buyer_name} purchased a ticket for '{$event_name}' — ₦" . number_format($amount, 2);
    return createNotification($organizer_id, $msg, 'ticket_purchase', $user_id, 'client', 'user');
}

/**
 * Refund requested — notify organizer
 */
function createRefundRequestedNotification($organizer_id, $buyer_name, $event_name, $order_id, $recipient_role = 'client', $sender_role = 'user')
{
    $msg = "Refund requested: {$buyer_name} requested a refund for '{$event_name}' (Order #{$order_id}). Review in Payments → Refund Requests.";
    return createNotification($organizer_id, $msg, 'refund_requested', null, $recipient_role, $sender_role, ['order_id' => $order_id]);
}

/**
 * Refund processed — notify the buyer
 */
function createRefundProcessedNotification($user_id, $event_name, $amount)
{
    $msg = "Your refund of ₦" . number_format($amount, 2) . " for '{$event_name}' has been processed. Funds arrive in 3-5 business days.";
    return createNotification($user_id, $msg, 'refund_processed', null, 'user', 'client');
}
/**
 * Notify admin when client profile is updated
 */
function createClientProfileUpdatedNotification($admin_id, $client_id, $client_name)
{
    $message = "Client '{$client_name}' has updated their profile details and is awaiting verification review.";
    return createNotification($admin_id, $message, 'client_profile_updated', $client_id, 'admin', 'client', ['client_id' => $client_id]);
}
