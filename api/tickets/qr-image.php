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
    $stmt = $pdo->prepare("
        SELECT t.id, t.barcode, t.qr_code_path, t.qr_code_data, t.qr_scan_count, t.qr_scan_locked,
               p.status AS payment_status
        FROM tickets t
        JOIN payments p ON t.payment_id = p.id
        WHERE t.barcode = ? OR t.custom_id = ?
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

    // Enforce the QR lock: an exhausted QR must not be shown/scannable.
    if ((int)$t['qr_scan_locked'] === 1 || (int)$t['qr_scan_count'] >= QR_SCAN_LIMIT) {
        $pdo->prepare("UPDATE tickets SET qr_scan_locked = 1 WHERE id = ?")->execute([$t['id']]);
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
    // (same payload builder the ticket used, so it scans identically).
    if ($dataUri === '') {
        $row = $pdo->prepare("SELECT t.*, p.status AS payment_status FROM tickets t JOIN payments p ON t.payment_id = p.id WHERE t.id = ?");
        $row->execute([$t['id']]);
        $ticketData = $row->fetch(PDO::FETCH_ASSOC) ?: [];
        require_once __DIR__ . '/../../includes/helpers/ticket-helper.php';
        $path = generateTicketQRCode($ticketData);
        if ($path !== '' && is_file($path)) {
            $mime = str_ends_with(strtolower($path), '.svg') ? 'image/svg+xml' : 'image/png';
            $dataUri = 'data:' . $mime . ';base64,' . base64_encode((string)file_get_contents($path));
        }
    }

    if ($dataUri === '') {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'QR image could not be produced for this ticket.']);
        exit;
    }

    // Also return the signed payload — exactly what a camera scan reads from
    // this image — so the UI's "Verify this QR" button behaves like a scan.
    $payload = '';
    $row = $pdo->prepare("SELECT t.*, p.status AS payment_status FROM tickets t JOIN payments p ON t.payment_id = p.id WHERE t.id = ?");
    $row->execute([$t['id']]);
    $ticketData = $row->fetch(PDO::FETCH_ASSOC) ?: [];
    if ($ticketData) {
        require_once __DIR__ . '/../../includes/helpers/ticket-helper.php';
        $payload = buildSecureQRPayload($ticketData);
    }

    $used = (int)$t['qr_scan_count'];
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
    echo json_encode(['success' => false, 'message' => 'Server error. Please try again.']);
}
