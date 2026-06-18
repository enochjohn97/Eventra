<?php

/**
 * Download Ticket API
 * Streams the PDF ticket to the authenticated user.
 *
 * GET ?code=BARCODE
 */

require_once '../../config/database.php';
require_once '../../includes/helpers/ticket-helper.php';
require_once '../../includes/helpers/email-helper.php';

$barcode = trim($_GET['code'] ?? '');
if (empty($barcode)) {
    http_response_code(400);
    header('Content-Type: application/json');
    echo json_encode(['success' => false, 'message' => 'Ticket code is required.']);
    exit;
}

try {
    // Verify ticket using the barcode as a secure token
    $tStmt = $pdo->prepare("
        SELECT 
            t.barcode, t.status, t.event_id, t.user_id, t.payment_id,
            t.ticket_type,
            e.event_name, e.event_date, e.event_time,
            e.location, e.address, e.state, e.locations, e.image_path,
            u.name as user_name,
            p.status as payment_status, p.id as order_id, p.amount, p.quantity, p.paystack_response
        FROM tickets t
        JOIN events e ON t.event_id = e.id
        JOIN users u ON t.user_id = u.id
        LEFT JOIN payments p ON t.payment_id = p.id
        WHERE t.barcode = ? OR t.ticket_code = ? OR t.custom_id = ? OR CAST(t.id AS CHAR) = ?
    ");
    $tStmt->execute([$barcode, $barcode, $barcode, $barcode]);
    $ticket = $tStmt->fetch(PDO::FETCH_ASSOC);

    if (!$ticket) {
        http_response_code(404);
        header('Content-Type: application/json');
        echo json_encode(['success' => false, 'message' => 'Ticket not found.']);
        exit;
    }

    $selectedLocs = null;
    if (!empty($ticket['paystack_response'])) {
        $pr = json_decode($ticket['paystack_response'], true);
        if (isset($pr['selected_locs'])) {
            $selectedLocs = $pr['selected_locs'];
        } elseif (isset($pr['data']['metadata']['selected_locs'])) {
            $selectedLocs = $pr['data']['metadata']['selected_locs'];
        }
    }

    // Security Enforcement: Block downloads if ticket is cancelled or payment isn't confirmed
    if ($ticket['status'] === 'cancelled') {
        http_response_code(403);
        header('Content-Type: application/json');
        echo json_encode(['success' => false, 'message' => 'This ticket has been cancelled and cannot be downloaded.']);
        exit;
    }

    $paymentStatus = strtolower((string)($ticket['payment_status'] ?? ''));
    $amount = (float)($ticket['amount'] ?? 0);
    $paymentConfirmed = in_array($paymentStatus, ['paid', 'success'], true)
        || ($paymentStatus === '' && $ticket['status'] === 'valid' && $amount === 0.0);

    if (!$paymentConfirmed) {
        http_response_code(403);
        header('Content-Type: application/json');
        echo json_encode(['success' => false, 'message' => 'Payment for this ticket has not been confirmed.']);
        exit;
    }

    // Build file path
    $pdfPath = __DIR__ . '/../../public/assets/event_assets/tickets/ticket_' . $barcode . '.pdf';
    $minPdfBytes = 1000;
    $needsRegeneration = !file_exists($pdfPath) || filesize($pdfPath) < $minPdfBytes;

    if ($needsRegeneration) {
        if (file_exists($pdfPath)) {
            @unlink($pdfPath);
        }

        try {
            if (empty($ticket['event_image']) && !empty($ticket['image_path'])) {
                $ticket['event_image'] = $ticket['image_path'];
            }
            $ticket = array_merge($ticket, [
                'event_image'    => $ticket['image_path'] ?? null,
                'ticket_type'    => $ticket['ticket_type'] ?? 'regular',
                'amount'         => $ticket['amount'] ?? 0,
                'quantity'       => $ticket['quantity'] ?? 1,
                'selected_locs'  => $selectedLocs,
                'payment_status' => $paymentStatus !== '' ? $paymentStatus : 'paid',
            ]);

            $generated = generateTicketPDF($ticket);
            if ($generated === '' || !file_exists($pdfPath) || filesize($pdfPath) < $minPdfBytes) {
                $qrPath = generateTicketQRCode($ticket);
                if ($qrPath === '' || !file_exists($qrPath)) {
                    $fallbackQr = __DIR__ . '/../../public/assets/imgs/qr.png';
                    if (file_exists($fallbackQr)) {
                        $qrPath = $fallbackQr;
                    }
                }
                if ($qrPath !== '' && file_exists($qrPath)) {
                    $ticket['qr_path'] = $qrPath;
                    $ticket['qr_base64'] = base64_encode_image($qrPath);
                }
                if (empty($ticket['qr_base64'])) {
                    error_log('[download-ticket.php] QR image could not be encoded for barcode ' . $barcode);
                }
                EmailHelper::regeneratePdf($ticket, $pdfPath);
            }

            if (!file_exists($pdfPath) || filesize($pdfPath) < $minPdfBytes) {
                throw new Exception('PDF generation failed to create a valid file.');
            }
        } catch (Exception $e) {
            error_log('[download-ticket.php] Generation error: ' . $e->getMessage());
            http_response_code(500);
            header('Content-Type: application/json');
            echo json_encode(['success' => false, 'message' => 'Failed to generate ticket. Please contact support.']);
            exit;
        }
    }

    while (ob_get_level()) {
        ob_end_clean();
    }

    header('Content-Type: application/pdf');
    header('Content-Disposition: attachment; filename="eventra_ticket_' . $barcode . '.pdf"');
    header('Content-Length: ' . filesize($pdfPath));
    header('Cache-Control: no-cache, no-store, must-revalidate');
    header('Pragma: no-cache');
    
    ob_clean();
    flush();
    readfile($pdfPath);
    exit;
} catch (PDOException $e) {
    error_log('[download-ticket.php] DB error: ' . $e->getMessage());
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode(['success' => false, 'message' => 'Failed to retrieve ticket.']);
}
