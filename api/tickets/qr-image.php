<?php

/**
 * Ticket QR image endpoint — returns the EXACT QR code image from the
 * purchased ticket (signed payload, same one on the ticket email/PDF).
 *
 * GET /api/tickets/qr-image.php?ticket_id=TKT-...
 * → { success, data_uri, qr_locked, scans_used, scan_limit, scans_remaining }
 *
 * When the 5-scan QR limit is reached the image is no longer served —
 * the caller is told to use the ticket-ID text field instead.
 */

header('Content-Type: application/json');
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/middleware/auth.php';
require_once __DIR__ . '/../../includes/classes/Ticket.php';
require_once __DIR__ . '/../utils/rate-limiter.php';

checkAuthOptional();

// Public QR-image endpoint — throttle ID-guessing (ticket enumeration).
// 60 generations per 10 min per client comfortably covers normal use.
ticket_rate_limit('qr_image', 60, 600);

const QR_SCAN_LIMIT = 5;

try {
    $ticketId = trim((string)($_GET['ticket_id'] ?? ''));
    if ($ticketId === '') {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'ticket_id is required.']);
        exit;
    }

    $pdo = getPDO();

    // Ensure qr_scan_count and qr_scan_locked columns exist in tickets table
    try {
        $cols = $pdo->query("SHOW COLUMNS FROM tickets LIKE 'qr_scan_count'")->fetchAll();
        if (empty($cols)) {
            $pdo->exec("ALTER TABLE tickets ADD COLUMN qr_scan_count INT DEFAULT 0");
        }
        $colsLock = $pdo->query("SHOW COLUMNS FROM tickets LIKE 'qr_scan_locked'")->fetchAll();
        if (empty($colsLock)) {
            $pdo->exec("ALTER TABLE tickets ADD COLUMN qr_scan_locked TINYINT(1) DEFAULT 0");
        }
    } catch (\Throwable $colEx) {
        // Fall back gracefully if ALTER is prohibited
    }

    $stmt = $pdo->prepare("
        SELECT t.*, p.status AS payment_status
        FROM tickets t
        JOIN payments p ON t.payment_id = p.id
        WHERE t.barcode = ? OR (t.custom_id IS NOT NULL AND t.custom_id = ?)
        LIMIT 1
    ");
    $stmt->execute([$ticketId, $ticketId]);
    $t = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$t) {
        http_response_code(422);
        echo json_encode(['success' => false, 'message' => 'Ticket not found.']);
        exit;
    }
    if ($t['payment_status'] !== 'paid') {
        http_response_code(422);
        echo json_encode(['success' => false, 'message' => 'Payment for this ticket is not confirmed.']);
        exit;
    }

    $scanCount = isset($t['qr_scan_count']) ? (int)$t['qr_scan_count'] : 0;
    $isLocked = isset($t['qr_scan_locked']) && (int)$t['qr_scan_locked'] === 1;

    // Enforce the QR lock: an exhausted QR must not be shown/scannable.
    if ($isLocked || $scanCount >= QR_SCAN_LIMIT) {
        try {
            $pdo->prepare("UPDATE tickets SET qr_scan_locked = 1 WHERE id = ?")->execute([$t['id']]);
        } catch (\Throwable $ignored) {}
        http_response_code(429);
        echo json_encode([
            'success' => false,
            'qr_locked' => true,
            'message' => 'QR verification limit reached (5 scans). This QR code is inaccessible — verify using the Ticket ID field instead.',
            'scan_limit' => QR_SCAN_LIMIT,
            'scans_used' => QR_SCAN_LIMIT,
        ]);
        exit;
    }

    // Locate the stored QR image (same file embedded on the ticket)
    $dataUri = '';
    $root = realpath(__DIR__ . '/../../');
    if (!empty($t['qr_code_path'])) {
        $p = str_replace('\\', '/', $t['qr_code_path']);
        $candidates = [
            $root . '/' . ltrim($p, '/'),
            $root . '/public/' . ltrim($p, '/'),
        ];
        foreach ($candidates as $c) {
            if (is_file($c) && filesize($c) > 0) {
                $mime = str_ends_with(strtolower($c), '.svg') ? 'image/svg+xml' : 'image/png';
                $dataUri = 'data:' . $mime . ';base64,' . base64_encode((string)file_get_contents($c));
                break;
            }
        }
    }

    // No stored file? Regenerate the exact signed-payload QR on the fly
    require_once __DIR__ . '/../../includes/helpers/ticket-helper.php';
    if ($dataUri === '') {
        $path = generateTicketQRCode($t);
        if ($path !== '' && is_file($path)) {
            $mime = str_ends_with(strtolower($path), '.svg') ? 'image/svg+xml' : 'image/png';
            $dataUri = 'data:' . $mime . ';base64,' . base64_encode((string)file_get_contents($path));
        } else {
            // Direct fallback generation via QR API if disk write failed
            $baseAppUrl = defined('APP_URL') ? rtrim(APP_URL, '/') : rtrim(($_ENV['APP_URL'] ?? ''), '/');
            if (empty($baseAppUrl)) {
                $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on') ? 'https' : 'http';
                $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
                $baseAppUrl = $scheme . '://' . $host;
            }
            $verificationUrl = $baseAppUrl . '/api/tickets/validate-ticket.php?barcode=' . urlencode($t['barcode'] ?? '');
            $fallbackUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&format=png&data=' . urlencode($verificationUrl);
            $bin = @file_get_contents($fallbackUrl);
            if ($bin !== false && !empty($bin)) {
                $dataUri = 'data:image/png;base64,' . base64_encode($bin);
            }
        }
    }

    if ($dataUri === '') {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'QR image could not be produced for this ticket.']);
        exit;
    }

    $payload = buildSecureQRPayload($t);
    $used = $scanCount;
    echo json_encode([
        'success' => true,
        'data_uri' => $dataUri,
        'payload' => $payload,
        'ticket_id' => $t['barcode'],
        'scans_used' => $used,
        'scan_limit' => QR_SCAN_LIMIT,
        'scans_remaining' => max(0, QR_SCAN_LIMIT - $used),
    ]);
} catch (Throwable $e) {
    error_log('[qr-image] ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Server error: ' . $e->getMessage()]);
}
