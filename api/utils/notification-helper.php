<?php

/**
 * Notification Helper Functions
 * Provides standardized notification creation across the application
 */

require_once __DIR__ . '/../../config/database.php';

/**
 * Ensure recipient/sender IDs are auth_accounts.id (not clients.id profile IDs).
 */
function normalizeAuthAccountId(int $id, string $role = 'client'): ?int
{
    if ($id <= 0) {
        return null;
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

    return null;
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
        // Legacy rows were written with the sender's role in recipient_role.
        // Verify against the ACTUAL account role so the feed filter
        // (recipient_role = session role) always matches what was stored.
        $roleCheck = $pdo->prepare("SELECT role FROM auth_accounts WHERE id = ? LIMIT 1");
        $roleCheck->execute([(int) $recipient_id]);
        $actualRole = $roleCheck->fetchColumn();
        if ($actualRole && $recipient_role !== $actualRole) {
            $recipient_role = $actualRole;
        }

        // Ensure IDs are numeric and stored as auth_accounts.id
        $recipient_id = normalizeAuthAccountId((int) $recipient_id, $recipient_role);
        if (!$recipient_id) {
            return false;
        }
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
function createEventCreatedNotification($client_auth_id, $event_name, $event_id = null)
{
    $message = "Event '{$event_name}' has been created successfully";
    $metadata = $event_id ? ['event_id' => $event_id] : null;
    return createNotification($client_auth_id, $message, 'event_created', $client_auth_id, 'client', 'client', $metadata);
}

/**
 * Create an event scheduled notification
 */
function createEventScheduledNotification($client_id, $event_name, $scheduled_time, $event_id = null)
{
    $formatted_time = date('M d, Y \a\t g:i A', strtotime($scheduled_time));
    $message = "Event '{$event_name}' has been scheduled for {$formatted_time}";
    $metadata = $event_id ? ['event_id' => $event_id] : null;
    return createNotification($client_id, $message, 'event_scheduled', $client_id, 'client', 'client', $metadata);
}

/**
 * Create an event published notification
 */
function createEventPublishedNotification($client_auth_id, $event_name, $event_id = null)
{
    $message = "Event '{$event_name}' has been published and is now live";
    $metadata = $event_id ? ['event_id' => $event_id] : null;
    return createNotification($client_auth_id, $message, 'event_published', $client_auth_id, 'client', 'client', $metadata);
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
    // recipient_role MUST be 'admin' so the row shows up in the admin dashboard feed
    return createNotification($admin_id, $message, 'user_login', $user_id, 'admin', 'user');
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
    return createNotification($admin_id, $message, 'admin_login', $admin_id, 'admin', 'admin');
}

/**
 * Create admin logout notification for themselves
 */
function createAdminLogoutNotification($admin_id)
{
    $message = "System Admin logged out";
    return createNotification($admin_id, $message, 'admin_logout', $admin_id, 'admin', 'admin');
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

// ═══════════════════════════════════════════════════════════════════════════
// REAL PUSH NOTIFICATIONS (Firebase Cloud Messaging HTTP v1)
// Drives the Android + iOS system notifications that appear when a client
// publishes an event and deep-link the app to that event on tap.
//
// Requires a Google Cloud service account with the Firebase Cloud Messaging
// API enabled. Supply it via one of:
//   FCM_SERVICE_ACCOUNT_JSON  — path to the service-account .json file
//   FCM_SERVICE_ACCOUNT_KEY   — the raw JSON string itself
// Both are read from the environment (.env). Nothing here is hard-coded, so
// no secret ever lands in the repo. When unset, push silently no-ops — the
// in-app notification feed keeps working regardless.
// ═══════════════════════════════════════════════════════════════════════════

/** Base64url encode (no padding) — JWT segments. */
function fcmB64Url(string $data): string
{
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

/**
 * Load the Firebase service-account credentials from the environment.
 * Returns null when not configured (push becomes a no-op).
 */
function fcmServiceAccount(): ?array
{
    static $cached = false;
    if ($cached !== false) {
        return $cached ?: null;
    }
    $cached = null;

    $json = getenv('FCM_SERVICE_ACCOUNT_KEY');
    if ($json === false || trim((string) $json) === '') {
        $path = getenv('FCM_SERVICE_ACCOUNT_JSON');
        if ($path === false || trim((string) $path) === '') {
            return null;
        }
        if (!is_readable($path)) {
            error_log('[FCM] service-account file not readable: ' . $path);
            return null;
        }
        $json = @file_get_contents($path);
    }
    if (!$json) {
        return null;
    }

    $data = json_decode($json, true);
    if (!is_array($data) || empty($data['client_email']) || empty($data['private_key']) || empty($data['project_id'])) {
        error_log('[FCM] service-account JSON is missing required fields');
        return null;
    }
    $cached = $data;
    return $data;
}

/**
 * Mint a short-lived OAuth2 access token for FCM (RS256 JWT assertion →
 * token endpoint). Hand-rolled with openssl so no composer dependency is needed.
 */
function fcmAccessToken(): ?string
{
    $sa = fcmServiceAccount();
    if (!$sa) {
        return null;
    }

    $now = time();
    $header = ['alg' => 'RS256', 'typ' => 'JWT'];
    $claims = [
        'iss'   => $sa['client_email'],
        'scope' => 'https://www.googleapis.com/auth/firebase.messaging',
        'aud'   => 'https://oauth2.googleapis.com/token',
        'iat'   => $now,
        'exp'   => $now + 3600,
    ];
    $unsigned = fcmB64Url(json_encode($header)) . '.' . fcmB64Url(json_encode($claims));

    $key = @openssl_pkey_get_private($sa['private_key']);
    if (!$key) {
        error_log('[FCM] could not parse service-account private key');
        return null;
    }
    $signature = '';
    if (!openssl_sign($unsigned, $signature, $key, OPENSSL_ALGO_SHA256)) {
        error_log('[FCM] openssl_sign failed');
        return null;
    }
    $jwt = $unsigned . '.' . fcmB64Url($signature);

    $ch = curl_init('https://oauth2.googleapis.com/token');
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 15,
        CURLOPT_POSTFIELDS     => http_build_query([
            'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            'assertion'  => $jwt,
        ]),
    ]);
    $resp = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($code !== 200 || !$resp) {
        error_log('[FCM] token exchange failed (HTTP ' . $code . '): ' . substr((string) $resp, 0, 300));
        return null;
    }
    $data = json_decode($resp, true);
    return $data['access_token'] ?? null;
}

/**
 * Store/refresh a device's FCM registration token for an auth account.
 * Idempotent: the same token is upserted rather than duplicated.
 */
function registerDeviceToken($auth_id, string $fcmToken, string $platform = 'android', ?string $deviceName = null, ?string $appVersion = null): bool
{
    if (!$auth_id || trim($fcmToken) === '') {
        return false;
    }
    global $pdo;
    try {
        if (!isset($pdo)) {
            $pdo = getPDO();
        }
        $stmt = $pdo->prepare("
            INSERT INTO device_push_tokens (auth_id, platform, fcm_token, device_name, app_version)
            VALUES (?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                auth_id = VALUES(auth_id),
                platform = VALUES(platform),
                device_name = VALUES(device_name),
                app_version = VALUES(app_version),
                last_seen_at = CURRENT_TIMESTAMP
        ");
        $stmt->execute([
            (int) $auth_id,
            in_array($platform, ['android', 'ios', 'web'], true) ? $platform : 'android',
            mb_substr(trim($fcmToken), 0, 512),
            $deviceName,
            $appVersion,
        ]);
        return true;
    } catch (PDOException $e) {
        error_log('[FCM] registerDeviceToken failed: ' . $e->getMessage());
        return false;
    }
}

/** Drop a token FCM reports as unregistered/invalid so we stop sending to it. */
function pruneDeviceToken(string $fcmToken): void
{
    global $pdo;
    try {
        if (!isset($pdo)) {
            $pdo = getPDO();
        }
        $pdo->prepare('DELETE FROM device_push_tokens WHERE fcm_token = ?')->execute([trim($fcmToken)]);
    } catch (PDOException $e) {
        error_log('[FCM] pruneDeviceToken failed: ' . $e->getMessage());
    }
}

/**
 * Send one FCM message to a single device token (HTTP v1 API).
 * Returns the message name on success, or null on failure.
 *
 * `$data` values MUST be strings (FCM requirement). We send a `notification`
 * block (so the OS renders a system banner in background/killed state) plus a
 * `data` block (so the app can deep-link to the event when tapped).
 */
function fcmSendToDevice(string $token, string $title, string $body, array $data = [], string $platform = 'android'): ?string
{
    $sa = fcmServiceAccount();
    $access = fcmAccessToken();
    if (!$sa || !$access) {
        return null;
    }

    $stringData = [];
    foreach ($data as $k => $v) {
        $stringData[(string) $k] = is_scalar($v) || $v === null ? (string) $v : json_encode($v);
    }
    $stringData['title'] = $title;
    $stringData['body'] = $body;

    $message = [
        'token'        => $token,
        'notification' => ['title' => $title, 'body' => $body],
        'data'         => $stringData,
    ];

    if ($platform === 'ios') {
        $message['apns'] = [
            'headers' => ['apns-priority' => '10'],
            'payload' => ['aps' => ['sound' => 'default', 'badge' => 1, 'content-available' => 1]],
        ];
    } else {
        $message['android'] = [
            'priority'     => 'HIGH',
            'notification' => [
                'channel_id'      => 'event_published',
                'click_action'    => 'FLUTTER_NOTIFICATION_CLICK',
                'sound'           => 'default',
                'notification_count' => 1,
            ],
        ];
    }

    $payload = json_encode(['message' => $message], JSON_UNESCAPED_SLASHES);
    $url = 'https://fcm.googleapis.com/v1/projects/' . rawurlencode($sa['project_id']) . '/messages:send';

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 20,
        CURLOPT_HTTPHEADER     => [
            'Authorization: Bearer ' . $access,
            'Content-Type: application/json',
        ],
        CURLOPT_POSTFIELDS => $payload,
    ]);
    $resp = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($code >= 200 && $code < 300) {
        $out = json_decode((string) $resp, true);
        return $out['name'] ?? 'ok';
    }

    error_log('[FCM] send failed (HTTP ' . $code . '): ' . substr((string) $resp, 0, 400));
    // 404 / InvalidRegistration → token is dead; stop targeting it.
    if ($code === 404 || $code === 400) {
        pruneDeviceToken($token);
    }
    return null;
}

/**
 * Fan a push notification out to every registered device of an auth account.
 * Best-effort: returns how many devices accepted the message. Never throws, so
 * callers can wrap it around a DB commit without risking the write.
 */
function sendPushToUser($auth_id, string $title, string $body, array $data = []): int
{
    if (!fcmServiceAccount()) {
        return 0; // Push not configured — no-op.
    }
    global $pdo;
    try {
        if (!isset($pdo)) {
            $pdo = getPDO();
        }
        $stmt = $pdo->prepare('SELECT fcm_token, platform FROM device_push_tokens WHERE auth_id = ?');
        $stmt->execute([(int) $auth_id]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    } catch (PDOException $e) {
        error_log('[FCM] token lookup failed: ' . $e->getMessage());
        return 0;
    }

    $sent = 0;
    foreach ($rows as $row) {
        if (fcmSendToDevice($row['fcm_token'], $title, $body, $data, $row['platform'])) {
            $sent++;
        }
    }
    return $sent;
}

/**
 * Push an "event published" alert to every user who has a device token — the
 * system-notification counterpart of the in-app fan-out in publish-event.php.
 * Includes the event id + tag so a tap can cold-launch the app to the event.
 */
function pushEventPublishedToAllUsers(string $eventName, $eventId, ?string $eventTag = null, ?string $externalLink = null): int
{
    if (!fcmServiceAccount()) {
        return 0;
    }
    global $pdo;
    try {
        if (!isset($pdo)) {
            $pdo = getPDO();
        }
        $stmt = $pdo->prepare("
            SELECT DISTINCT auth_id FROM device_push_tokens
            WHERE auth_id IN (SELECT user_auth_id FROM users WHERE user_auth_id IS NOT NULL)
        ");
        $stmt->execute();
        $recipients = $stmt->fetchAll(PDO::FETCH_COLUMN);
    } catch (PDOException $e) {
        error_log('[FCM] recipient lookup failed: ' . $e->getMessage());
        return 0;
    }

    $title = 'New event published 🎉';
    $body = "'{$eventName}' — check it out!";
    $data = [
        'type'       => 'event_published',
        'event_id'   => (string) (int) $eventId,
        'event_tag'  => (string) ($eventTag ?? ''),
        'event_name' => (string) $eventName,
        'link'       => (string) ($externalLink ?? ''),
    ];

    $total = 0;
    foreach ($recipients as $uid) {
        $total += sendPushToUser($uid, $title, $body, $data);
    }
    return $total;
}
