<?php

/**
 * Ticket Helper for generating secure QR codes and PDF tickets
 *
 * QR Code payload is a signed token (HMAC-SHA256) to prevent forgery.
 * PDF tickets include: event name, date, time, location, attendee name,
 * ticket ID, and an embedded QR code image.
 */

require_once __DIR__ . '/../../vendor/autoload.php';
require_once __DIR__ . '/../../config/app.php';
require_once __DIR__ . '/email-helper.php';

use chillerlan\QRCode\QRCode;
use chillerlan\QRCode\QROptions;

/**
 * Convert an absolute filesystem path to a web-relative path (forward slashes).
 * e.g. C:\...\public\assets\event_assets\qrcodes\qr_x.png → public/assets/event_assets/qrcodes/qr_x.png
 */
function toPublicRelativePath(string $absolutePath): string
{
    if ($absolutePath === '') {
        return '';
    }

    $normalized = str_replace('\\', '/', $absolutePath);
    $root = realpath(__DIR__ . '/../../');
    $normalizedRoot = $root ? str_replace('\\', '/', $root) : '';

    if ($normalizedRoot !== '' && str_starts_with($normalized, $normalizedRoot)) {
        return ltrim(substr($normalized, strlen($normalizedRoot)), '/');
    }

    if (preg_match('#(public/assets/.+)$#i', $normalized, $matches)) {
        return $matches[1];
    }

    return ltrim($normalized, '/');
}

/**
 * Helper to encode an image file to Base64 for Dompdf compatibility.
 */
function base64_encode_image($path) {
    if (!$path) return '';
    
    // Handle remote URLs
    if (str_starts_with($path, 'http://') || str_starts_with($path, 'https://')) {
        $ctx = stream_context_create(['http' => ['timeout' => 10]]);
        $data = @file_get_contents($path, false, $ctx);
        if ($data === false || empty($data)) return '';
        
        $ext = strtolower(pathinfo(parse_url($path, PHP_URL_PATH), PATHINFO_EXTENSION));
        $mimeType = match($ext) {
            'jpg', 'jpeg' => 'image/jpeg',
            'png' => 'image/png',
            'webp' => 'image/webp',
            'svg' => 'image/svg+xml',
            default => 'image/png'
        };
        return 'data:' . $mimeType . ';base64,' . base64_encode($data);
    }

    // Normalize path: handle relative paths and resolve to absolute
    $resolvedPath = $path;
    $root = realpath(__DIR__ . '/../../');
    
    // If path starts with / or \, it might be relative to root or already absolute
    if (str_starts_with($path, '/') || str_starts_with($path, '\\')) {
        // Check if $path already contains the $root prefix
        $normalizedRoot = str_replace('\\', '/', $root);
        $normalizedPath = str_replace('\\', '/', $path);
        
        if (strpos($normalizedPath, $normalizedRoot) === 0) {
            $resolvedPath = $path;
        } else {
            $resolvedPath = $root . DIRECTORY_SEPARATOR . ltrim($path, '/\\');
        }
    }

    if (!file_exists($resolvedPath)) {
        // Try cleaning and resolving
        $cleanPath = ltrim(str_replace(['/', '\\'], DIRECTORY_SEPARATOR, $path), DIRECTORY_SEPARATOR);
        $tryPaths = [
            $root . DIRECTORY_SEPARATOR . $cleanPath,
            $root . DIRECTORY_SEPARATOR . 'public' . DIRECTORY_SEPARATOR . $cleanPath,
            $root . DIRECTORY_SEPARATOR . 'public' . DIRECTORY_SEPARATOR . 'assets' . DIRECTORY_SEPARATOR . 'event_assets' . DIRECTORY_SEPARATOR . basename($path)
        ];

        foreach ($tryPaths as $tp) {
            if (file_exists($tp)) {
                $resolvedPath = $tp;
                break;
            }
        }
    }
    
    if (!file_exists($resolvedPath) || is_dir($resolvedPath)) {
        error_log("[TicketHelper] Image not found for base64 encoding: " . $path . " (Resolved: " . $resolvedPath . ")");
        return '';
    }
    
    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mimeType = finfo_file($finfo, $resolvedPath);
    finfo_close($finfo);
    
    $data = @file_get_contents($resolvedPath);
    if ($data === false || empty($data)) return '';
    
    return 'data:' . $mimeType . ';base64,' . base64_encode($data);
}

/**
 * Generate a signed, secure QR code token for a ticket.
 * Payload: { tid, eid, uid, ps, iat, sig }
 *
 * @param array $ticketData  Ticket row data (must include barcode, event_id, user_id, payment_status or payment_id)
 * @return string Signed JSON payload that gets embedded in the QR
 */
function buildSecureQRPayload(array $ticketData): string
{
    $payload = [
        'tid' => $ticketData['barcode'],                          // Ticket ID
        'eid' => $ticketData['event_id'] ?? null,                 // Event ID
        'uid' => $ticketData['user_id'] ?? null,                  // User ID
        'oid' => $ticketData['order_id'] ?? null,                 // Order ID
        'ps' => $ticketData['payment_status'] ?? 'paid',         // Payment status
        'iat' => time(),                                           // Issued at
    ];

    // Sign the payload with HMAC-SHA256 using the server secret
    $dataStr = implode('|', [
        $payload['tid'],
        $payload['eid'],
        $payload['uid'],
        $payload['oid'] ?? '',
        $payload['ps'],
        $payload['iat']
    ]);
    $payload['sig'] = hash_hmac('sha256', $dataStr, QR_SECRET);

    return base64_encode(json_encode($payload));
}

/**
 * Verify a QR token received at scan time.
 *
 * @param string $qrData  The raw QR code content (base64-encoded JSON)
 * @return array ['valid' => bool, 'payload' => array|null, 'error' => string|null]
 */
function verifyQRPayload(string $qrData): array
{
    $decoded = base64_decode($qrData, true);
    if (!$decoded) {
        return ['valid' => false, 'payload' => null, 'error' => 'Invalid QR format'];
    }

    $payload = json_decode($decoded, true);
    if (!$payload || !isset($payload['tid'], $payload['eid'], $payload['uid'], $payload['ps'], $payload['iat'], $payload['sig'])) {
        return ['valid' => false, 'payload' => null, 'error' => 'Malformed QR payload'];
    }

    // Verify signature — must include 'oid' to match the build function's hash string
    $dataStr = implode('|', [$payload['tid'], $payload['eid'], $payload['uid'], $payload['oid'] ?? '', $payload['ps'], $payload['iat']]);
    $expectedSig = hash_hmac('sha256', $dataStr, QR_SECRET);

    if (!hash_equals($expectedSig, $payload['sig'])) {
        return ['valid' => false, 'payload' => null, 'error' => 'Invalid QR signature — possible forgery'];
    }

    return ['valid' => true, 'payload' => $payload, 'error' => null];
}

/**
 * Generate a QR code image for a ticket, embedding a signed secure token.
 *
 * @param array  $ticketData  Ticket row data
 * @return string Path to the generated QR code SVG file
 */
function generateTicketQRCode(array $ticketData): string
{
    try {
        // Build secure signed payload instead of raw barcode
        $secureToken = buildSecureQRPayload($ticketData);

        // Prefer chillerlan/php-qrcode v5+ options consistent with EmailHelper
        $options = new \chillerlan\QRCode\QROptions([
            'outputType'      => \chillerlan\QRCode\Output\QROutputInterface::GDIMAGE_PNG,
            'eccLevel'        => \chillerlan\QRCode\Common\EccLevel::H,
            'scale'           => 6,
            'imageBase64'     => true,
            'imageTransparent'=> false,
        ]);

        $qrcode = new \chillerlan\QRCode\QRCode($options);

        // Encode a public verification URL (keeps compatibility with existing validation flow)
        $verificationUrl = (defined('APP_URL') ? rtrim(APP_URL, '/') : rtrim(($_ENV['APP_URL'] ?? ''), '/')) . '/api/tickets/validate-ticket.php?barcode=' . urlencode($ticketData['barcode'] ?? '');

        // Render returns a data URI when imageBase64=true
        $rendered = $qrcode->render($verificationUrl);

        // Normalize output to raw PNG bytes
        if (is_string($rendered) && str_starts_with($rendered, 'data:image/')) {
            $parts = explode(',', $rendered, 2);
            $bin = isset($parts[1]) ? base64_decode($parts[1]) : '';
        } else {
            // May already be raw image bytes
            $bin = is_string($rendered) ? $rendered : '';
        }

        if (empty($bin)) {
            error_log('[TicketHelper] QR generator produced empty output for ' . ($ticketData['barcode'] ?? 'unknown'));
            return '';
        }

        $fileName = 'qr_' . ($ticketData['barcode'] ?? uniqid('qr_')) . '.png';
        $root = realpath(__DIR__ . '/../../');
        $dir = $root . DIRECTORY_SEPARATOR . 'public' . DIRECTORY_SEPARATOR . 'assets' . DIRECTORY_SEPARATOR . 'event_assets' . DIRECTORY_SEPARATOR . 'qrcodes' . DIRECTORY_SEPARATOR;
        if (!is_dir($dir)) {
            mkdir($dir, 0755, true);
        }

        $filePath = $dir . $fileName;
        $written = @file_put_contents($filePath, $bin);
        if ($written === false || $written === 0) {
            error_log('[TicketHelper] Failed to write QR file to ' . $filePath);
            return '';
        }

        $emailQrPath = $root . DIRECTORY_SEPARATOR . 'public' . DIRECTORY_SEPARATOR . 'assets'
            . DIRECTORY_SEPARATOR . 'imgs' . DIRECTORY_SEPARATOR . 'qr.png';
        if (!@copy($filePath, $emailQrPath)) {
            error_log('[TicketHelper] Failed to copy QR to ' . $emailQrPath);
        }

        return $filePath;
    } catch (\Throwable $e) {
        error_log('[Eventra] QR code generation failed for ticket ' . ($ticketData['barcode'] ?? 'unknown') . ': ' . $e->getMessage());
        return '';
    }
}

/**
 * Generate a PDF ticket with all required fields + embedded QR code.
 *
 * Required fields in $ticketData:
 *   event_name, event_date, event_time, location / address,
 *   user_name, barcode, event_id, user_id, payment_status
 *
 * @param array $ticketData
 * @return string Path to generated PDF file
 */
function generateTicketPDF(array $ticketData): string
{
    ini_set('memory_limit', '256M');

    $ticket_id = trim((string) ($ticketData['barcode'] ?? ''));
    if ($ticket_id === '') {
        error_log('[TicketHelper] generateTicketPDF: missing barcode');
        return '';
    }

    $qrCodePath = generateTicketQRCode($ticketData);
    if ($qrCodePath === '' || !file_exists($qrCodePath)) {
        error_log('[TicketHelper] QR generation failed for ticket ' . $ticket_id);
        return '';
    }

    $event_image_path = $ticketData['event_image'] ?? $ticketData['image_path'] ?? null;
    $price_value = $ticketData['price'] ?? $ticketData['amount'] ?? null;
    $payment_status = $ticketData['payment_status'] ?? 'paid';
    $amountFloat = is_numeric($price_value) ? (float) $price_value : 0.0;
    $isFreeTicket = $payment_status === 'free'
        || $amountFloat <= 0
        || $price_value === '0'
        || strtolower((string) $price_value) === 'free';

    if ($isFreeTicket) {
        $ticket_type = 'FREE';
        $event_type_label = 'Free';
    } else {
        $ticket_type = strtoupper($ticketData['ticket_type'] ?? 'REGULAR');
        $event_type_label = $ticket_type;
    }

    $qr_base64 = base64_encode_image($qrCodePath);
    if ($qr_base64 === '') {
        error_log('[TicketHelper] QR code image encoding failed for barcode ' . $ticket_id);
        return '';
    }

    $event_img_base64 = '';
    if ($event_image_path) {
        $event_img_base64 = base64_encode_image($event_image_path);
        if ($event_img_base64 === '') {
            error_log('[TicketHelper] Event image encoding failed for path: ' . $event_image_path);
        }
    }

    $richTicketData = [
        'barcode'             => $ticket_id,
        'ticket_id'           => $ticket_id,
        'event_name'          => $ticketData['event_name'] ?? 'Event',
        'user_name'           => $ticketData['user_name'] ?? 'Attendee',
        'location'            => $ticketData['address'] ?? $ticketData['location'] ?? 'See event details',
        'address'             => $ticketData['address'] ?? null,
        'state'               => $ticketData['state'] ?? null,
        'locations'           => $ticketData['locations'] ?? null,
        'organizer'           => $ticketData['organizer'] ?? null,
        'ticket_type'         => $ticket_type,
        'ticket_type_display' => $event_type_label,
        'qr_base64'           => $qr_base64,
        'qr_path'             => $qrCodePath,
        'event_image'         => $event_img_base64 !== '' ? $event_img_base64 : $event_image_path,
        'amount'              => $price_value,
        'event_date'          => $ticketData['event_date'] ?? null,
        'event_time'          => $ticketData['event_time'] ?? null,
        'selected_locs'       => $ticketData['selected_locs'] ?? null,
        'quantity'            => $ticketData['quantity'] ?? 1,
    ];

    $dir = __DIR__ . '/../../public/assets/event_assets/tickets/';
    if (!is_dir($dir)) {
        mkdir($dir, 0755, true);
    }

    $filePath = $dir . 'ticket_' . $ticket_id . '.pdf';

    if (!EmailHelper::regeneratePdf($richTicketData, $filePath)) {
        error_log('[TicketHelper] regeneratePdf failed for ticket ' . $ticket_id);
        return '';
    }

    if (!file_exists($filePath) || filesize($filePath) < 1000) {
        error_log('[TicketHelper] PDF missing or too small after generation: ' . $filePath);
        return '';
    }

    return $filePath;
}
