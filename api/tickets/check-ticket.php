<?php

/**
 * Check Ticket API — ticket validity proof (anti-fraud).
 *
 * Two verification modes:
 *
 *  1. QR scan mode (`mode=qr`): consumes one of the FIVE allowed QR scans.
 *     Each attempt (valid or not, per ticket) increments qr_scan_count;
 *     at 5 the ticket is locked out of QR mode and the caller is told to
 *     use the ticket-ID textfield instead (unlimited). Auth optional:
 *     anyone holding a real ticket QR may verify it, which is the point
 *     of an anti-fraud proof.
 *
 *  2. Ticket-ID mode (`mode=id`): unlimited lookups by ticket ID/barcode.
 *     Requires the ticket to be paid; returns the full proof payload.
 *
 * Both modes return the same proof fields:
 *   event_name, image, price (with 10% platform fee, web-identical),
 *   ticket_type, payment date, event date & time, event custom_id.
 */

header('Content-Type: application/json');
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/middleware/auth.php';
require_once __DIR__ . '/../../includes/classes/Ticket.php';
require_once __DIR__ . '/../utils/rate-limiter.php';

checkAuthOptional();

// Public anti-fraud endpoint — throttle ID-guessing / QR-forgery probing.
// 60 verifications per 10 min per client is far above any human flow but
// stops brute-force enumeration of ticket IDs.
ticket_rate_limit('ticket_check', 60, 600);

const QR_SCAN_LIMIT = 5;

try {
    $data = json_decode(file_get_contents('php://input'), true) ?? [];
    $mode = strtolower(trim((string)($data['mode'] ?? '')));

    if ($mode === 'qr') {
        // ── QR scan mode ────────────────────────────────────────────────
        $qrData = trim((string)($data['qr_data'] ?? ''));
        if ($qrData === '') {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'QR data is required.']);
            exit;
        }

        // Resolve the ticket referenced by the QR (signed payload or raw barcode)
        // WITHOUT marking it used — this is a validity check, not entry.
        $resolved = Ticket::resolveOnly($qrData);
        if (!$resolved['success']) {
            http_response_code(422);
            echo json_encode(['success' => false, 'message' => $resolved['message']]);
            exit;
        }
        $barcode = $resolved['barcode'];

        $pdo = getPDO();
        $stmt = $pdo->prepare("SELECT id, qr_scan_count, qr_scan_locked FROM tickets WHERE barcode = ? LIMIT 1");
        $stmt->execute([$barcode]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$row) {
            http_response_code(422);
            echo json_encode(['success' => false, 'message' => 'Ticket not found.']);
            exit;
        }

        // Enforce the 5-scan QR limit
        if ((int)$row['qr_scan_locked'] === 1 || (int)$row['qr_scan_count'] >= QR_SCAN_LIMIT) {
            $pdo->prepare("UPDATE tickets SET qr_scan_locked = 1 WHERE id = ?")->execute([$row['id']]);
            http_response_code(429);
            echo json_encode([
                'success' => false,
                'message' => 'QR verification limit reached (5 scans). This QR code is now inaccessible — please verify using the Ticket ID text field instead.',
                'qr_locked' => true,
                'scans_used' => QR_SCAN_LIMIT,
                'scan_limit' => QR_SCAN_LIMIT,
            ]);
            exit;
        }

        // Count this attempt BEFORE building the response
        $newCount = (int)$row['qr_scan_count'] + 1;
        $justLocked = $newCount >= QR_SCAN_LIMIT;
        $pdo->prepare("UPDATE tickets SET qr_scan_count = ?, qr_scan_locked = ? WHERE id = ?")
            ->execute([$newCount, $justLocked ? 1 : 0, $row['id']]);

        // Build the proof payload (read-only)
        $proof = Ticket::buildProofPayload($pdo, $barcode);
        if (!$proof['success']) {
            http_response_code(422);
            echo json_encode(['success' => false, 'message' => $proof['message']]);
            exit;
        }

        $remaining = max(0, QR_SCAN_LIMIT - $newCount);
        $reminder = $remaining > 0
            ? "Reminder: this QR code can only be scanned " . QR_SCAN_LIMIT . " times. {$remaining} scan" . ($remaining === 1 ? '' : 's') . " remaining."
            : "This was your last QR scan. The QR code is now inaccessible — use the Ticket ID text field for future verifications.";

        echo json_encode([
            'success' => true,
            'mode' => 'qr',
            'scans_used' => $newCount,
            'scan_limit' => QR_SCAN_LIMIT,
            'scans_remaining' => $remaining,
            'reminder' => $reminder,
            'qr_locked' => $justLocked,
            'data' => $proof['data'],
        ]);
        exit;
    }

    if ($mode === 'id') {
        // ── Ticket-ID mode (unlimited) ─────────────────────────────────
        $ticketId = trim((string)($data['ticket_id'] ?? ''));
        if ($ticketId === '') {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Ticket ID is required.']);
            exit;
        }

        $pdo = getPDO();
        $proof = Ticket::buildProofPayload($pdo, $ticketId);
        if (!$proof['success']) {
            http_response_code(422);
            echo json_encode(['success' => false, 'message' => $proof['message']]);
            exit;
        }

        echo json_encode([
            'success' => true,
            'mode' => 'id',
            'message' => 'Ticket verified successfully.',
            'data' => $proof['data'],
        ]);
        exit;
    }

    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Unknown mode. Use mode=qr or mode=id.']);
} catch (Throwable $e) {
    error_log('[check-ticket] ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Server error. Please try again.']);
}
