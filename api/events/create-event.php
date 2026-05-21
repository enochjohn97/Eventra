<?php

/**
 * Create Event API
 * Handles event creation with all fields including scheduling, priority, tags, and links
 */

header('Content-Type: application/json');
require_once '../../config/database.php';
require_once '../../config/env-loader.php';

require_once '../../includes/middleware/auth.php';
require_once '../../includes/helpers/email-helper.php'; // Included to ensure autoloader guard is active globally

// Force error reporting to be caught by Throwable if needed, but in production we rely on try-catch
set_error_handler(function($errno, $errstr, $errfile, $errline) {
    if (!(error_reporting() & $errno)) return;
    throw new ErrorException($errstr, 0, $errno, $errfile, $errline);
});

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

// Check authentication and role
$client_id = checkAuth('client');

try {
    // 1. Resolve actual Client name and info from clients table
    $stmt = $pdo->prepare("SELECT id, name, verification_status FROM clients WHERE id = ?");
    $stmt->execute([$client_id]);
    $client_data = $stmt->fetch();

    if (!$client_data) {
        throw new Exception("Client profile not found for this account.");
    }

    if ($client_data['verification_status'] !== 'verified') {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Unauthorized: Your account must be verified by an administrator before you can create events.']);
        exit;
    }

    $real_client_id = $client_data['id'];
    $raw_client_name = $client_data['name'] ?? 'client';
    $client_name = strtolower(str_replace(' ', '-', preg_replace('/[^A-Za-z0-9 ]/', '', $raw_client_name)));
    // ─────────────────────────────────────────────────────────────────────────

    // 2. Handle file upload if present using standardized path
    $image_path = null;
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

            // Register in media table (Root folder)
            try {
                $file_size = filesize($upload_path);
                $mime_type = mime_content_type($upload_path);

                $media_stmt = $pdo->prepare("
                    INSERT INTO media (client_id, folder_id, folder_name, file_name, file_extension, file_path, file_type, file_size, mime_type)
                    VALUES (?, NULL, 'Event Assets', ?, ?, ?, 'image', ?, ?)
                ");
                $media_stmt->execute([
                    $real_client_id,
                    $_FILES['event_image']['name'],
                    $file_extension,
                    $image_path,
                    $file_size,
                    $mime_type
                ]);
            } catch (Throwable $media_err) {
                error_log("[Create Event Media Register Error] " . $media_err->getMessage());
            }
        } else {
            throw new Exception("Failed to move uploaded file. Check directory permissions.");
        }
    } elseif (isset($_FILES['event_image']) && $_FILES['event_image']['error'] !== UPLOAD_ERR_NO_FILE) {
        $upload_error = $_FILES['event_image']['error'];
        $error_msgs = [
            UPLOAD_ERR_INI_SIZE => "File is too large. Server limit is " . ini_get('upload_max_filesize') . ".",
            UPLOAD_ERR_FORM_SIZE => "File is too large (exceeds form limit).",
            UPLOAD_ERR_PARTIAL => "File was only partially uploaded.",
            UPLOAD_ERR_NO_TMP_DIR => "Missing a temporary folder.",
            UPLOAD_ERR_CANT_WRITE => "Failed to write file to disk.",
            UPLOAD_ERR_EXTENSION => "A PHP extension stopped the file upload."
        ];
        $msg = $error_msgs[$upload_error] ?? "Unknown upload error code: $upload_error";
        throw new Exception("Image upload failed: " . $msg);
    }

    // 3. Get POST data
    require_once '../utils/id-generator.php';
    $custom_id = generateEventId($pdo);

    $scheduled_publish_time = $_POST['scheduled_publish_time'] ?? null;

    $event_name = $_POST['event_name'] ?? '';
    $description = $_POST['description'] ?? '';
    $event_type = $_POST['event_type'] ?? '';
    $event_date = $_POST['event_date'] ?? '';
    $event_time = $_POST['event_time'] ?? '';
    $phone_contact_1 = $_POST['phone_contact_1'] ?? '';
    $phone_contact_2 = !empty($_POST['phone_contact_2']) ? $_POST['phone_contact_2'] : null;
    $state = $_POST['state'] ?? '';
    $address = $_POST['address'] ?? '';
    $visibility = $_POST['visibility'] ?? 'all states';
    $event_visibility = $_POST['event_visibility'] ?? 'public'; // public or private
    $price = !empty($_POST['price']) ? floatval($_POST['price']) : 0.00;

    // ── Parse per-state locations JSON ───────────────────────────────────────
    $locations_json = null;
    $raw_locations = $_POST['locations_json'] ?? null;
    if ($raw_locations) {
        $decoded = json_decode($raw_locations, true);
        if (is_array($decoded) && count($decoded) > 0) {
            // Sanitise each entry
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
                $locations_json = json_encode($clean_locations);
                // Keep $state as comma-joined list for backward-compat
                if (empty($state)) {
                    $state = implode(',', array_column($clean_locations, 'state'));
                }
                // Use first entry as canonical address fallback
                if (empty($address) && !empty($clean_locations[0]['address'])) {
                    $address = $clean_locations[0]['address'];
                }
                // If customized dates/times are present, find the earliest one and set event_date / event_time
                $custom_schedules = array_filter($clean_locations, function($l) {
                    return !empty($l['date']);
                });
                if (!empty($custom_schedules)) {
                    usort($custom_schedules, function($a, $b) {
                        $ta = strtotime($a['date'] . ' ' . ($a['time'] ?? '00:00'));
                        $tb = strtotime($b['date'] . ' ' . ($b['time'] ?? '00:00'));
                        return $ta - $tb;
                    });
                    $event_date = $custom_schedules[0]['date'];
                    if (!empty($custom_schedules[0]['time'])) {
                        $event_time = $custom_schedules[0]['time'];
                    }
                }
            }
        }
    }
    // ─────────────────────────────────────────────────────────────────────────

    // New pricing fields
    $ticket_type = $_POST['ticket_type'] ?? 'regular';
    // Handle both legacy single-value radio ('ticket_type_mode') and new
    // multi-checkbox array ('ticket_type_mode[]') submissions.
    $raw_mode = $_POST['ticket_type_mode'] ?? null;
    if ($raw_mode === null) {
        $raw_mode = 'all'; // default
    }
    if (is_array($raw_mode)) {
        // Multi-checkbox: join selected values into a comma-separated string
        $ticket_type_mode = implode(',', array_filter(array_map('trim', $raw_mode)));
        if (empty($ticket_type_mode)) $ticket_type_mode = 'all';
    } else {
        $ticket_type_mode = trim((string)$raw_mode);
        if (empty($ticket_type_mode)) $ticket_type_mode = 'all';
    }
    $regular_price = !empty($_POST['regular_price']) ? floatval($_POST['regular_price']) : 0.00;
    $vip_price = !empty($_POST['vip_price']) ? floatval($_POST['vip_price']) : 0.00;
    $premium_price = !empty($_POST['premium_price']) ? floatval($_POST['premium_price']) : 0.00;
    $regular_quantity = !empty($_POST['regular_quantity']) ? intval($_POST['regular_quantity']) : null;
    $vip_quantity = !empty($_POST['vip_quantity']) ? intval($_POST['vip_quantity']) : null;
    $premium_quantity = !empty($_POST['premium_quantity']) ? intval($_POST['premium_quantity']) : null;

    // Handle 'all' mode logic — if 'all' is one of the selected types, apply $price to all tiers
    if ($ticket_type_mode === 'all' || str_contains($ticket_type_mode, 'all')) {
        $regular_price = floatval($price);
        $vip_price = floatval($price);
        $premium_price = floatval($price);
    }

    // Compute ticket_count and total_tickets from submitted quantities
    $total_tickets = null;
    if (!empty($_POST['max_capacity'])) {
        $total_tickets = intval($_POST['max_capacity']);
    } else {
        $total_tickets = ($regular_quantity ?? 0) + ($vip_quantity ?? 0) + ($premium_quantity ?? 0);
        if ($total_tickets === 0) $total_tickets = null;
    }
    $ticket_count = $total_tickets; // Start at full capacity on creation

    // Determine status - Default to 'draft', but allow 'scheduled' if requested
    $status = $_POST['status'] ?? 'draft';
    
    // Validate status
    if (!in_array($status, ['draft', 'scheduled'])) {
        $status = 'draft'; // Safety fallback
    }

    // Validation for scheduled events
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
    } else {
        // For draft, ensure it's null if not explicitly provided or just allow what's sent
        if (empty($scheduled_publish_time)) {
            $scheduled_publish_time = null;
        }
    }

    // Nigerian State Centroid Mapping (Approximate coordinates)
    $state_centroids = [
        'Abia' => ['lat' => 5.4527, 'lng' => 7.5248], 'Adamawa' => ['lat' => 9.3265, 'lng' => 12.3984], 
        'Akwa Ibom' => ['lat' => 5.0148, 'lng' => 7.9128], 'Anambra' => ['lat' => 6.2209, 'lng' => 7.0670], 
        'Bauchi' => ['lat' => 10.3010, 'lng' => 9.8236], 'Bayelsa' => ['lat' => 4.7725, 'lng' => 6.0699], 
        'Benue' => ['lat' => 7.3369, 'lng' => 8.7404], 'Borno' => ['lat' => 11.8311, 'lng' => 13.1507], 
        'Cross River' => ['lat' => 5.8702, 'lng' => 8.5988], 'Delta' => ['lat' => 5.7040, 'lng' => 5.9339], 
        'Ebonyi' => ['lat' => 6.2649, 'lng' => 8.0137], 'Edo' => ['lat' => 6.6342, 'lng' => 5.9304], 
        'Ekiti' => ['lat' => 7.6303, 'lng' => 5.2327], 'Enugu' => ['lat' => 6.4584, 'lng' => 7.5464], 
        'FCT' => ['lat' => 9.0765, 'lng' => 7.3986], 'Gombe' => ['lat' => 10.2791, 'lng' => 11.1731], 
        'Imo' => ['lat' => 5.5720, 'lng' => 7.0588], 'Jigawa' => ['lat' => 12.1471, 'lng' => 9.3265], 
        'Kaduna' => ['lat' => 10.5105, 'lng' => 7.4165], 'Kano' => ['lat' => 12.0022, 'lng' => 8.5920], 
        'Katsina' => ['lat' => 12.9808, 'lng' => 7.6191], 'Kebbi' => ['lat' => 11.4584, 'lng' => 4.1976], 
        'Kogi' => ['lat' => 7.7337, 'lng' => 6.6906], 'Kwara' => ['lat' => 8.4799, 'lng' => 4.5418], 
        'Lagos' => ['lat' => 6.5244, 'lng' => 3.3792], 'Nasarawa' => ['lat' => 8.4904, 'lng' => 8.1904], 
        'Niger' => ['lat' => 9.9309, 'lng' => 5.5983], 'Ogun' => ['lat' => 7.1604, 'lng' => 3.3483], 
        'Ondo' => ['lat' => 7.1000, 'lng' => 4.8417], 'Osun' => ['lat' => 7.5629, 'lng' => 4.5600], 
        'Oyo' => ['lat' => 8.1196, 'lng' => 3.4196], 'Plateau' => ['lat' => 9.2182, 'lng' => 9.5179], 
        'Rivers' => ['lat' => 4.8156, 'lng' => 7.0498], 'Sokoto' => ['lat' => 13.0033, 'lng' => 5.2476], 
        'Taraba' => ['lat' => 7.8927, 'lng' => 10.7423], 'Yobe' => ['lat' => 12.2939, 'lng' => 11.4390], 
        'Zamfara' => ['lat' => 12.1222, 'lng' => 6.2236]
    ];
    $latitude = isset($state_centroids[$state]) ? floatval($state_centroids[$state]['lat']) : 0.0;
    $longitude = isset($state_centroids[$state]) ? floatval($state_centroids[$state]['lng']) : 0.0;

    // Date cap: event_date must be within 365 days from today
    if (!empty($event_date) && strtotime($event_date) > strtotime('+365 days')) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Event date cannot be more than 365 days from today.']);
        exit;
    }

    // Validate required fields (image optional if already provided as URL)
    if (
        empty($event_name) || empty($description) || empty($event_type) ||
        empty($event_date) || empty($event_time) || empty($phone_contact_1) ||
        empty($state) || empty($address) || ($status !== 'draft' && empty($image_path))
    ) {
        http_response_code(400);
        $missing = [];
        if (empty($event_name)) {
            $missing[] = 'Event Name';
        }
        if (empty($description)) {
            $missing[] = 'Description';
        }
        if (empty($event_type)) {
            $missing[] = 'Category';
        }
        if (empty($event_date)) {
            $missing[] = 'Date';
        }
        if (empty($event_time)) {
            $missing[] = 'Time';
        }
        if (empty($phone_contact_1)) {
            $missing[] = 'Primary Contact';
        }
        if (empty($state)) {
            $missing[] = 'State';
        }
        if (empty($address)) {
            $missing[] = 'Address';
        }
        if (empty($image_path)) {
            $missing[] = 'Event Image (Banner)';
        }

        echo json_encode([
            'success' => false,
            'message' => 'All required fields must be filled: ' . implode(', ', $missing)
        ]);
        exit;
    }

    // Auto-generate tag from event name (lowercase, hyphenated)
    $tag = strtolower(str_replace(' ', '-', preg_replace('/[^A-Za-z0-9 ]/', '', $event_name)));

    $base_url = $_ENV['APP_URL'] ?? 'http://localhost:8000';
    $external_link = $base_url . '/public/pages/event-details.html?event=' . $tag . '&client=' . $client_name;

    // Prepare metadata - store pricing fields that don't have dedicated columns
    $metadata = [
        'regular_price' => $regular_price,
        'vip_price' => $vip_price,
        'premium_price' => $premium_price,
        'regular_quantity' => $regular_quantity,
        'vip_quantity' => $vip_quantity,
        'premium_quantity' => $premium_quantity,
        'ticket_type_mode' => $ticket_type_mode
    ];
    $metadata_json = json_encode($metadata);

    // Insert event with enriched columns (priority deprecated — admin_status drives moderation)
    $stmt = $pdo->prepare("
        INSERT INTO events (
            client_id, custom_id, event_name, description, event_type, event_date, event_time,
            phone_contact_1, phone_contact_2, state, address, visibility, tag,
            external_link, price, image_path, status, scheduled_publish_time, 
            category, event_visibility, ticket_count, total_tickets, 
            sales_count, view_count, is_boosted,
            latitude, longitude, metadata, locations, ticket_type
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ");

    $stmt->execute([
        $real_client_id,
        $custom_id,
        $event_name,
        $description,
        $event_type,
        $event_date,
        $event_time,
        $phone_contact_1,
        $phone_contact_2,
        $state,
        $address,
        $visibility,
        $tag,
        $external_link,
        $price,
        $image_path,
        $status,
        $scheduled_publish_time,
        $event_type,       // category mirrors event_type
        $event_visibility,
        $ticket_count,     // atomic stock
        $total_tickets,    // original capacity
        0,                 // sales_count starts at 0
        0,                 // view_count starts at 0
        0,                 // is_boosted — always false on client create
        $latitude,
        $longitude,
        $metadata_json,
        $locations_json,    // per-state address map (JSON)
        $ticket_type_mode   // ticket_type column
    ]);

    $event_id = $pdo->lastInsertId();

    // Create notifications using helper functions
    require_once '../utils/notification-helper.php';

    $auth_id = getAuthId();

    // Notify admin about event creation
    $admin_id = getAdminUserId();
    if ($admin_id) {
        $display_name = $client_data['name'] ?? 'Client';
        $admin_message = "New event created: '{$event_name}' by {$display_name} - Status: {$status}";
        createNotification($admin_id, $admin_message, 'event_created', $auth_id, 'admin', 'client');
    }

    // Notify client
    if ($status === 'scheduled' && $scheduled_publish_time) {
        createEventScheduledNotification($auth_id, $event_name, $scheduled_publish_time);
    } elseif ($status === 'published') {
        createEventPublishedNotification($auth_id, $event_name);
    } else {
        createEventCreatedNotification($auth_id, $event_name);
    }

    echo json_encode([
        'success' => true,
        'message' => 'Event created successfully',
        'event' => [
            'id' => $event_id,
            'event_name' => $event_name,
            'tag' => $tag,
            'external_link' => $external_link,
            'status' => $status
        ]
    ]);
} catch (Throwable $e) {
    if (strpos($e->getMessage(), 'Image upload failed') !== false || strpos($e->getMessage(), 'required fields') !== false) {
        http_response_code(400);
    } else {
        http_response_code(500);
    }
    echo json_encode(['success' => false, 'message' => 'Error: ' . $e->getMessage()]);
}
