<?php

/**
 * Scan Ticket API
 * Called when a client scans a QR code at a venue entrance.
 * Validates the ticket via backend-only verification (Ticket::validateAndUse).
 *
 * Supports:
 *  - Raw barcode strings
 *  - Signed QR payload tokens (base64-encoded HMAC-SHA256 JSON)
 *
 * Protected: client session required (clients scan tickets at their events).
 */

header('Content-Type: application/json');
require_once '../../config/database.php';
require_once '../../includes/middleware/auth.php';
require_once '../../includes/classes/Ticket.php';

// Protect: must be a client (event organizer) scanning tickets
$client_auth_id = checkAuth('client');

try {
    $data = json_decode(file_get_contents("php://input"), true);
    $qrData = $data['qr_data'] ?? $data['barcode'] ?? null;

    if (!$qrData) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'QR data or barcode is required.']);
        exit;
    }

    // Run backend validation (atomic, locked transaction)
    $result = Ticket::validateAndUse($pdo, $qrData, $client_auth_id);

    if ($result['success']) {
        $protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off' || $_SERVER['SERVER_PORT'] == 443) ? "https://" : "http://";
        $baseUrl = $protocol . $_SERVER['HTTP_HOST'];
        
        echo json_encode([
            'success'    => true,
            'message'    => 'Ticket Validated! Entry Granted ✅',
            'status'     => 'used',
            'data'       => [
                'event_name'  => $result['data']['event_name'],
                'event_date'  => $result['data']['event_date'],
                'organizer'   => $result['data']['client_name'],
                'buyer_name'  => $result['data']['buyer_name'],
                'buyer_email' => $result['data']['buyer_email'],
                'ticket_id'   => $result['data']['barcode'],
                'qr_code_path'=> $result['data']['qr_code_path'] ? $baseUrl . '/' . ltrim($result['data']['qr_code_path'], '/') : null,
                'scanned_at'  => date('Y-m-d H:i:s')
            ]
        ]);
    } else {
        // Ticket invalid — return reason and status
        http_response_code(422);
        echo json_encode([
            'success' => false,
            'message' => $result['message'],
            'status'  => $result['status'] ?? 'invalid',
            'details' => $result['details'] ?? null
        ]);
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Server error: ' . $e->getMessage()]);
}
