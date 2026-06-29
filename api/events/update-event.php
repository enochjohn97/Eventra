<?php

/**
 * Update Event API
 * Updates event details (only for draft and scheduled events)
 */

header('Content-Type: application/json');
require_once '../../config/database.php';
require_once '../../includes/middleware/auth.php';
require_once '../utils/notification-helper.php';

/**
 * Compress event image for storage
 */
function compressEventImage($filePath, $extension) {
    if (!extension_loaded('gd')) {
        return $filePath;
    }

    try {
        $maxWidth = 1200;
        $quality = 80;
        
        $image = null;
        switch ($extension) {
            case 'jpg':
            case 'jpeg':
                $image = imagecreatefromjpeg($filePath);
                break;
            case 'png':
                $image = imagecreatefrompng($filePath);
                break;
            case 'webp':
                $image = imagecreatefromwebp($filePath);
                break;
        }

        if (!$image) return $filePath;

        $width = imagesx($image);
        $height = imagesy($image);

        if ($width > $maxWidth) {
            $ratio = $maxWidth / $width;
            $newWidth = $maxWidth;
            $newHeight = (int)($height * $ratio);

            $resized = imagecreatetruecolor($newWidth, $newHeight);
            imagecopyresampled($resized, $image, 0, 0, 0, 0, $newWidth, $newHeight, $width, $height);
            $image = $resized;
        }

        $tempPath = $filePath . '.tmp';
        switch ($extension) {
            case 'jpg':
            case 'jpeg':
                imagejpeg($image, $tempPath, $quality);
                break;
            case 'png':
                imagepng($image, $tempPath, 6);
                break;
            case 'webp':
                imagewebp($image, $tempPath, $quality);
                break;
        }

        if (filesize($tempPath) < filesize($filePath)) {
            unlink($filePath);
            rename($tempPath, $filePath);
        } else {
            unlink($tempPath);
        }

        chmod($filePath, 0644);
        return $filePath;
    } catch (Exception $e) {
        return $filePath;
    }
}

$headers = getallheaders();
$headersLower = array_change_key_case($headers, CASE_LOWER);
$portal = $headersLower['x-eventra-portal'] ?? null;

if ($portal === 'client') {
    $user_id = checkAuth('client');
    $role = 'client';
} elseif ($portal === 'admin') {
    $user_id = checkAuth('admin');
    $role = 'admin';
} else {
    $role = $_SESSION['role'] ?? null;
    if ($role === 'client') {
        $user_id = checkAuth('client');
    } elseif ($role === 'admin') {
        $user_id = checkAuth('admin');
    } else {
        http_response_code(401);
        echo json_encode(['success' => false, 'message' => 'Unauthorized']);
        exit;
    }
}

$event_id = $_POST['event_id'] ?? null;

// Fallback to JSON body if $_POST is empty (happens with some fetch configurations)
if (!$event_id) {
    $json_input = json_decode(file_get_contents('php://input'), true);
    $event_id = $json_input['event_id'] ?? null;
}

if (!$event_id) {
    error_log("[Update Event Error] No Event ID provided in POST or JSON body. Headers: " . json_encode($headersLower));
    echo json_encode(['success' => false, 'message' => 'Event ID is required']);
    exit;
}

try {
    // Use user_id (which is client_id from checkAuth('client'))
    $real_client_id = $user_id;

    // Get current event details - Scoped to client
    $sql = "SELECT * FROM events WHERE id = ?";
    $params = [$event_id];

    if ($role !== 'admin') {
        $sql .= " AND client_id = ?";
        $params[] = $real_client_id;
    }

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $event = $stmt->fetch();

    if (!$event) {
        echo json_encode(['success' => false, 'message' => 'Event not found']);
        exit;
    }

    // Check if user owns the event or is admin
    if ($role !== 'admin' && $event['client_id'] != $real_client_id) {
        error_log("[Update Event Debug] Role: $role | Event Client ID: " . $event['client_id'] . " | User Real Client ID: " . $real_client_id);
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'You do not have permission to update this event']);
        exit;
    }

    // LOCKING: Prevent client edit if tickets sold; admins can always edit
    if ($role !== 'admin' && $event['attendee_count'] > 0) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'This event is locked because tickets have already been sold. Please contact support for critical changes.']);
        exit;
    }

    // Handle image upload if provided using standardized path
    $image_path = $event['image_path']; // Keep existing image by default
    if (isset($_FILES['event_image']) && $_FILES['event_image']['error'] === UPLOAD_ERR_OK) {
        $upload_dir = dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'public' . DIRECTORY_SEPARATOR . 'assets' . DIRECTORY_SEPARATOR . 'event_assets' . DIRECTORY_SEPARATOR;

        if (!is_dir($upload_dir)) {
            mkdir($upload_dir, 0755, true);
        }

        $file_extension = strtolower(pathinfo($_FILES['event_image']['name'], PATHINFO_EXTENSION));
        $new_filename = uniqid('event_') . '.' . $file_extension;
        $upload_path = $upload_dir . $new_filename;

        if (move_uploaded_file($_FILES['event_image']['tmp_name'], $upload_path)) {
            // Compress image
            $upload_path = compressEventImage($upload_path, $file_extension);
            $image_path = "/public/assets/event_assets/" . basename($upload_path);

            // Delete old image if it exists
            if ($event['image_path']) {
                $old_full_path = __DIR__ . '/../../' . ltrim($event['image_path'], '/');
                if (file_exists($old_full_path) && !is_dir($old_full_path)) {
                    unlink($old_full_path);
                }
            }

            // Register the image in the media table
            try {
                $file_size = filesize($upload_path);
                $mime_type = mime_content_type($upload_path);

                $media_stmt = $pdo->prepare("
                    INSERT INTO media (client_id, folder_id, folder_name, file_name, file_extension, file_path, file_type, file_size, mime_type)
                    VALUES (?, NULL, 'Event Assets', ?, ?, ?, 'image', ?, ?)
                ");
                $media_stmt->execute([
                    $event['client_id'],
                    $_FILES['event_image']['name'],
                    $file_extension,
                    $image_path,
                    $file_size,
                    $mime_type
                ]);
            } catch (Throwable $media_err) {
                // Log media registration error but don't fail the entire update
                error_log("[Update Event Media Register Error] " . $media_err->getMessage());
            }
        } else {
            throw new Exception("Failed to move uploaded file to $upload_path. Check directory permissions.");
        }
    } elseif (isset($_FILES['event_image']) && $_FILES['event_image']['error'] !== UPLOAD_ERR_NO_FILE) {
        $error_code = $_FILES['event_image']['error'];
        $error_message = "Image upload failed (Error: $error_code)";

        if ($error_code === UPLOAD_ERR_INI_SIZE || $error_code === UPLOAD_ERR_FORM_SIZE) {
            $max_size = ini_get('upload_max_filesize');
            $error_message = "The uploaded image is too large. Your server's current limit is $max_size. Please upload a smaller image or increase 'upload_max_filesize' in your PHP configuration.";
        }

        throw new Exception($error_message);
    }
    $scheduled_publish_time = $_POST['scheduled_publish_time'] ?? null;
    $status = $_POST['status'] ?? ($event['status'] ?? 'draft');

    if ($status === 'scheduled') {
        if (empty($scheduled_publish_time)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Scheduled publish time is required for scheduled events.']);
            exit;
        }
        if (strtotime($scheduled_publish_time) <= time()) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Scheduled publish time must be in the future.']);
            exit;
        }
    } elseif (empty($scheduled_publish_time)) {
        $scheduled_publish_time = null;
    }

    // ── Parse per-state locations JSON early ─────────────────────────────────
    $new_locations_json = $event['locations'] ?? null; // preserve existing by default
    $raw_locations = $_POST['locations_json'] ?? null;
    if ($raw_locations) {
        $decoded = json_decode($raw_locations, true);
        if (is_array($decoded) && count($decoded) > 0) {
            $clean_locations = [];
            foreach ($decoded as $loc) {
                $s = trim($loc['state'] ?? '');
                $a = trim($loc['address'] ?? '');
                $d = trim($loc['date'] ?? '');
                $t = trim($loc['time'] ?? '');
                if ($s !== '') {
                    $entry = ['state' => $s, 'address' => $a];
                    if ($d !== '') $entry['date'] = $d;
                    if ($t !== '') $entry['time'] = $t;
                    $clean_locations[] = $entry;
                }
            }
            if (!empty($clean_locations)) {
                $new_locations_json = json_encode($clean_locations);
                // Overwrite event_date and event_time with the earliest location date/time if customized
                $custom_schedules = array_filter($clean_locations, function($l) {
                    return !empty($l['date']);
                });
                if (!empty($custom_schedules)) {
                    usort($custom_schedules, function($a, $b) {
                        $ta = strtotime($a['date'] . ' ' . ($a['time'] ?? '00:00'));
                        $tb = strtotime($b['date'] . ' ' . ($b['time'] ?? '00:00'));
                        return $ta - $tb;
                    });
                    $_POST['event_date'] = $custom_schedules[0]['date'];
                    if (!empty($custom_schedules[0]['time'])) {
                        $_POST['event_time'] = $custom_schedules[0]['time'];
                    }
                }
            }
        }
    }
    // ─────────────────────────────────────────────────────────────────────────

    // Validation
    $required_fields = ['event_name', 'event_type', 'event_date', 'event_time', 'status', 'phone_contact_1'];
    
    // Address is required unless locations_json is provided
    $has_locations = !empty($_POST['locations_json']);
    if (!$has_locations && (empty($_POST['address']) || trim($_POST['address']) === '')) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => "Field 'address' is required"]);
        exit;
    }
    
    // Price is required unless it's explicitly marked as free or mode is not 'all'
    // Handle both legacy radio ('ticket_type_mode') and new checkbox array ('ticket_type_mode[]')
    $raw_mode = $_POST['ticket_type_mode'] ?? null;
    if ($raw_mode === null) {
        $raw_mode = 'all';
    }
    if (is_array($raw_mode)) {
        $ticket_type_mode = implode(',', array_filter(array_map('trim', $raw_mode)));
        if (empty($ticket_type_mode)) $ticket_type_mode = 'all';
    } else {
        $ticket_type_mode = trim((string)$raw_mode);
        if (empty($ticket_type_mode)) $ticket_type_mode = 'all';
    }
    $is_free = isset($_POST['is_free']) && $_POST['is_free'] === '1';

    if (($ticket_type_mode === 'all' || str_contains($ticket_type_mode, 'all')) && !$is_free) {
        $required_fields[] = 'price';
    }

    foreach ($required_fields as $field) {
        if (!isset($_POST[$field]) || trim($_POST[$field]) === '') {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => "Field '$field' is required"]);
            exit;
        }
    }

    // Date cap: event_date must be within 365 days from today
    if (!empty($_POST['event_date']) && strtotime($_POST['event_date']) > strtotime('+365 days')) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Event date cannot be more than 365 days from today.']);
        exit;
    }

    // Pricing fields
    $price = $_POST['price'] ?? 0.00;
    $regular_price = !empty($_POST['regular_price']) ? floatval($_POST['regular_price']) : 0.00;
    $vip_price = !empty($_POST['vip_price']) ? floatval($_POST['vip_price']) : 0.00;
    $premium_price = !empty($_POST['premium_price']) ? floatval($_POST['premium_price']) : 0.00;

    if ($ticket_type_mode === 'all' || str_contains($ticket_type_mode, 'all')) {
        $regular_price = floatval($price);
        $vip_price = floatval($price);
        $premium_price = floatval($price);
    }

    // Recalculate ticket_count / total_tickets when quantities change
    $new_regular_qty = !empty($_POST['regular_quantity']) ? intval($_POST['regular_quantity']) : null;
    $new_vip_qty     = !empty($_POST['vip_quantity'])     ? intval($_POST['vip_quantity'])     : null;
    $new_premium_qty = !empty($_POST['premium_quantity']) ? intval($_POST['premium_quantity']) : null;
    
    $new_total_tickets = null;
    $new_ticket_count  = null;
    
    if (!empty($_POST['total_tickets'])) {
        $new_total_tickets = intval($_POST['total_tickets']);
    } else {
        $new_total_tickets = ($new_regular_qty ?? 0) + ($new_vip_qty ?? 0) + ($new_premium_qty ?? 0);
        if ($new_total_tickets === 0) $new_total_tickets = null;
    }

    if ($new_total_tickets !== null) {
        // Preserve tickets already sold
        $already_sold = (int)($event['sales_count'] ?? $event['attendee_count'] ?? 0);
        $new_ticket_count = max(0, $new_total_tickets - $already_sold);
    }

    // Admin-only fields
    $new_is_boosted = ($role === 'admin' && isset($_POST['is_boosted']))
        ? (int)$_POST['is_boosted']
        : (int)($event['is_boosted'] ?? 0);

    // Prepare metadata - store pricing fields that don't have dedicated columns
    $existing_metadata = !empty($event['metadata']) ? json_decode($event['metadata'], true) : [];
    if (!is_array($existing_metadata)) $existing_metadata = [];
    
    $new_metadata = array_merge($existing_metadata, [
        'regular_price' => $regular_price,
        'vip_price' => $vip_price,
        'premium_price' => $premium_price,
        'regular_quantity' => $new_regular_qty,
        'vip_quantity' => $new_vip_qty,
        'premium_quantity' => $new_premium_qty,
        'ticket_type_mode' => $ticket_type_mode
    ]);
    $metadata_json = json_encode($new_metadata);

    // locations_json already parsed early as $new_locations_json

    // Begin transaction — all DB writes below must succeed together
    $pdo->beginTransaction();

    // Build UPDATE (priority column intentionally omitted — deprecated)
    $sql = "UPDATE events SET
            event_name = ?,
            event_type = ?,
            event_date = ?,
            event_time = ?,
            price = ?,
            status = ?,
            description = ?,
            state = ?,
            visibility = ?,
            event_visibility = ?,
            address = ?,
            phone_contact_1 = ?,
            phone_contact_2 = ?,
            image_path = ?,
            category = ?,
            is_boosted = ?,
            total_tickets = COALESCE(?, total_tickets),
            ticket_count  = COALESCE(?, ticket_count),
            scheduled_publish_time = ?,
            metadata = ?,
            locations = COALESCE(?, locations),
            ticket_type = ?,
            updated_at = NOW()
            WHERE id = ?";
    
    if ($role !== 'admin') {
        $sql .= " AND client_id = ?";
    }

    $stmt = $pdo->prepare($sql);
    
    $execute_params = [
        $_POST['event_name'],
        $_POST['event_type'],
        $_POST['event_date'],
        $_POST['event_time'],
        $_POST['price'],
        $_POST['status'],
        $_POST['description'],
        $_POST['state'],
        $_POST['visibility'] ?? 'all states',
        $_POST['event_visibility'] ?? 'public',
        $_POST['address'] ?? ($new_locations_json ? 'Multi-state' : ''),
        $_POST['phone_contact_1'],
        $_POST['phone_contact_2'] ?? null,
        $image_path,
        $_POST['category'] ?? $_POST['event_type'],
        $new_is_boosted,
        $new_total_tickets,
        $new_ticket_count,
        $scheduled_publish_time,
        $metadata_json,
        $new_locations_json,   // per-state address map
        $ticket_type_mode,     // ticket_type column
        $event_id
    ];

    if ($role !== 'admin') {
        $execute_params[] = $real_client_id;
    }

    $stmt->execute($execute_params);

    try {
        $message = "Event '{$_POST['event_name']}' has been updated";
        $auth_id = getAuthId();
        $client_auth_id = $event['client_auth_id'] ?? null;
        if (!$client_auth_id) {
            $stmt = $pdo->prepare("SELECT client_auth_id FROM clients WHERE id = ?");
            $stmt->execute([$event['client_id']]);
            $client_auth_id = $stmt->fetchColumn();
        }

        createNotification($client_auth_id, $message, 'event_updated', $auth_id, 'client', ($role === 'admin' ? 'admin' : 'client'));

        // Notify Admin as well
        $admin_id = getAdminUserId();
        if ($admin_id && $auth_id != $admin_id) {
            $name = $_POST['event_name'];
            $admin_message = "Event '{$name}' has been updated" . ($role === 'admin' ? " by an administrator." : " by organizer.");
            createNotification($admin_id, $admin_message, 'event_updated', $auth_id, 'admin', ($role === 'admin' ? 'admin' : 'client'));
        }

        if ($status === 'scheduled' && $scheduled_publish_time) {
            createEventScheduledNotification($client_auth_id, $_POST['event_name'], $scheduled_publish_time);
        }
    } catch (Throwable $notif_err) {
        error_log("[Update Event Notification Error] " . $notif_err->getMessage());
    }

    // Fetch updated event data to return to client - Scoped
    $sql = "SELECT * FROM events WHERE id = ?";
    $params = [$event_id];

    if ($role !== 'admin') {
        $sql .= " AND client_id = ?";
        $params[] = $real_client_id;
    }

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $updated_event = $stmt->fetch();

    // Commit only after all DB work succeeds — success response follows commit
    $pdo->commit();

    echo json_encode([
        'success' => true,
        'message' => 'Event updated successfully',
        'event' => $updated_event
    ]);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    error_log("[Update Event Global Error] " . $e->getMessage() . "\n" . $e->getTraceAsString());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Internal server error: ' . $e->getMessage()]);
}
