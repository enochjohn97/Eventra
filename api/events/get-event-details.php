<?php

/**
 * Get Event Details API
 * Retrieves detailed information about a specific event (including deleted ones)
 */

header('Content-Type: application/json');
require_once '../../config/database.php';
require_once '../../includes/middleware/auth.php';

// Check authentication (optional for public view)
if (session_status() === PHP_SESSION_NONE) {
    require_once '../../config/session-config.php';
}

$user_id = checkAuthOptional();
$user_role = $_SESSION['role'] ?? 'guest';

$event_id = $_GET['event_id'] ?? null;

if (!$event_id) {
    echo json_encode(['success' => false, 'message' => 'Event ID is required']);
    exit;
}

try {
    // Increment view count atomically
    $pdo->prepare("UPDATE events SET view_count = view_count + 1 WHERE id = ?")->execute([$event_id]);

    // Get event details with client information
    $stmt = $pdo->prepare("
        SELECT e.*, c.business_name as client_name, c.profile_pic as client_profile_pic, (c.verification_status = 'verified') as client_is_verified
        FROM events e
        LEFT JOIN clients c ON e.client_id = c.id
        WHERE e.id = ?
    ");
    $stmt->execute([$event_id]);
    $event = $stmt->fetch();

    if (!$event) {
        echo json_encode(['success' => false, 'message' => 'Event not found']);
        exit;
    }

    if (!$user_id) {
        // Guests keep the event IMAGE and tier prices (both are public on the
        // event page and required by the payment-callback summary and share
        // previews). Only sensitive payloads are stripped: the raw metadata
        // blob and the organizer's profile pic.
        unset($event['client_profile_pic']);
    }

    // For non-admins/clients, only show published events (unless it's their own)
    if ($user_role !== 'admin' && $event['status'] !== 'published') {
        if ($user_role === 'client') {
            if ($event['client_id'] != $user_id) {
                echo json_encode(['success' => false, 'message' => 'Event not published']);
                exit;
            }
        } else {
            echo json_encode(['success' => false, 'message' => 'Event not published']);
            exit;
        }
    }

    // Sanitize and enhance event data for checkout
    // Never fall back to the retired shared host: derive the origin from the
    // request itself so image URLs resolve on the local dev server (and on any
    // future host) with no configuration.
    $baseUrl = rtrim($_ENV['APP_URL'] ?? '', '/');
    if ($baseUrl === '') {
        $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
        $baseUrl = $scheme . '://' . ($_SERVER['HTTP_HOST'] ?? 'localhost');
    }

    if (!empty($event['image_path'])) {
        // Ensure path starts with a slash
        $path = '/' . ltrim($event['image_path'], '/');
        $event['image_path'] = $path;
        $event['absolute_image_url'] = $baseUrl . $path;
    } else {
        $event['image_path'] = null;
        // Local splash placeholder (allowed) — no external dummy image
        $event['absolute_image_url'] = $baseUrl . '/public/assets/imgs/login.png';
    }

    // Ensure price is numeric
    $event['price'] = (float) ($event['price'] ?? 0);

    // Merge metadata if present
    if (!empty($event['metadata'])) {
        $meta = json_decode($event['metadata'], true);
        if (is_array($meta)) {
            $event = array_merge($event, $meta);
        }
    }

    // Calculate a mock end_datetime if not present (default 4 hours after start)
    $event['event_start_datetime'] = $event['event_date'] . ' ' . ($event['event_time'] ?: '00:00:00');
    $event['event_end_datetime'] = date('Y-m-d H:i:s', strtotime($event['event_start_datetime'] . ' +4 hours'));

    echo json_encode([
        'success' => true,
        'event' => $event
    ]);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database error. Please try again or contact support if it persists.']);
}
