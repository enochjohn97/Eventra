<?php

$autoloadPath = __DIR__ . '/../../vendor/autoload.php';
if (file_exists($autoloadPath)) {
    require_once $autoloadPath;
}
require_once __DIR__ . '/../../config/app.php';
require_once __DIR__ . '/email-helper.php';

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
    
    // Handle SVG files directly (QR fallback when GD is unavailable)
    if (str_ends_with(strtolower($path), '.svg') && file_exists($path)) {
        $data = @file_get_contents($path);
        if ($data !== false && $data !== '') {
            return 'data:image/svg+xml;base64,' . base64_encode($data);
        }
    }
    
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
            $root . DIRECTORY_SEPARATOR . 'public' . DIRECTORY_SEPARATOR . 'assets' . DIRECTORY_SEPARATOR . 'event_assets' . DIRECTORY_SEPARATOR . basename($path),
            $root . DIRECTORY_SEPARATOR . 'public' . DIRECTORY_SEPARATOR . 'assets' . DIRECTORY_SEPARATOR . 'imgs' . DIRECTORY_SEPARATOR . 'qr.png',
            $root . DIRECTORY_SEPARATOR . 'public' . DIRECTORY_SEPARATOR . 'assets' . DIRECTORY_SEPARATOR . 'event_assets' . DIRECTORY_SEPARATOR . 'qrcodes' . DIRECTORY_SEPARATOR . basename($path),
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
    
    // finfo/fileinfo may not be enabled on every host (e.g. PHP CLI dev server)
    // — fall back to an extension map instead of fataling mid-checkout.
    if (function_exists('finfo_open')) {
        $finfo = finfo_open(FILEINFO_MIME_TYPE);
        $mimeType = finfo_file($finfo, $resolvedPath);
        finfo_close($finfo);
    } else {
        $extMap = ['jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'png' => 'image/png', 'gif' => 'image/gif', 'webp' => 'image/webp', 'svg' => 'image/svg+xml'];
        $mimeType = $extMap[strtolower(pathinfo($resolvedPath, PATHINFO_EXTENSION))] ?? 'image/png';
    }
    
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

        $baseAppUrl = defined('APP_URL') ? rtrim(APP_URL, '/') : rtrim(($_ENV['APP_URL'] ?? ''), '/');
        if (empty($baseAppUrl)) {
            $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on') ? 'https' : 'http';
            $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
            $baseAppUrl = $scheme . '://' . $host;
        }
        $parsedHost = parse_url($baseAppUrl, PHP_URL_HOST) ?? '';
        if (in_array($parsedHost, ['localhost', '127.0.0.1'], true)) {
            $lanIp = gethostbyname(gethostname());
            if ($lanIp !== gethostname() && $lanIp !== '127.0.0.1' && filter_var($lanIp, FILTER_VALIDATE_IP)) {
                $baseAppUrl = str_replace($parsedHost, $lanIp, $baseAppUrl);
            }
        }
        // Portability: the QR must resolve on the host the ticket viewer is
        // actually browsing. If the app is reached via localhost/LAN while
        // APP_URL points at the production domain (or vice versa), a phone
        // scanning the code would land on the wrong machine and fail. The
        // current request host always wins when present.
        $requestHost = $_SERVER['HTTP_HOST'] ?? '';
        if ($requestHost !== '') {
            $configHost = parse_url($baseAppUrl, PHP_URL_HOST) ?? '';
            $configIsLocal = in_array($configHost, ['localhost', '127.0.0.1'], true);
            $requestIsLocal = (bool) preg_match('/^(localhost|127\.0\.0\.1)(:\d+)?$/i', $requestHost);
            if ($configHost !== '' && strcasecmp($configHost, preg_replace('/:\\d+$/', '', $requestHost)) !== 0
                && ($configIsLocal !== $requestIsLocal)) {
                // Mismatched host class — rebuild the URL from the request.
                $reqScheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
                if ((($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https') || (($_SERVER['SERVER_PORT'] ?? 80) == 443)) {
                    $reqScheme = 'https';
                }
                $baseAppUrl = $reqScheme . '://' . $requestHost;
            }
        }
        $verificationUrl = $baseAppUrl . '/api/tickets/validate-ticket.php?barcode=' . urlencode($ticketData['barcode'] ?? '');

        $bin = '';
        $isSvg = false;
        if (class_exists('chillerlan\\QRCode\\QRCode') && class_exists('chillerlan\\QRCode\\QROptions')) {
            // Try GD PNG first (best for email embedding), then fall back to SVG
            // (works on hosts without the GD extension), then to an external API.
            $attempts = [
                ['output' => \chillerlan\QRCode\Output\QROutputInterface::GDIMAGE_PNG, 'svg' => false],
                ['output' => \chillerlan\QRCode\Output\QROutputInterface::MARKUP_SVG, 'svg' => true],
            ];
            foreach ($attempts as $attempt) {
                try {
                    $options = new \chillerlan\QRCode\QROptions([
                        'outputType'      => $attempt['output'],
                        'eccLevel'        => \chillerlan\QRCode\Common\EccLevel::H,
                        'scale'           => 6,
                        'imageBase64'     => true,
                        'imageTransparent'=> false,
                    ]);
                    $qrcode = new \chillerlan\QRCode\QRCode($options);
                    $rendered = $qrcode->render($verificationUrl);
                    if (is_string($rendered) && str_starts_with($rendered, 'data:image/')) {
                        $parts = explode(',', $rendered, 2);
                        $bin = isset($parts[1]) ? base64_decode($parts[1]) : '';
                        $isSvg = $attempt['svg'];
                    } else {
                        $bin = is_string($rendered) ? $rendered : '';
                        $isSvg = $attempt['svg'] && $bin !== '';
                    }
                    if ($bin !== '') {
                        break;
                    }
                } catch (\Throwable $e) {
                    error_log('[TicketHelper] QR generation attempt failed: ' . $e->getMessage());
                }
            }
        }
        if ($bin === '') {
            $fallbackUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&format=png&data=' . urlencode($verificationUrl);
            $bin = @file_get_contents($fallbackUrl) ?: '';
        }

        if (empty($bin)) {
            error_log('[TicketHelper] QR generator produced empty output for ' . ($ticketData['barcode'] ?? 'unknown'));
            return '';
        }

        $fileName = 'qr_' . ($ticketData['barcode'] ?? uniqid('qr_')) . '.png';
        if ($isSvg) {
            $fileName = 'qr_' . ($ticketData['barcode'] ?? uniqid('qr_')) . '.svg';
        }
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
        error_log('[EventOut] QR code generation failed for ticket ' . ($ticketData['barcode'] ?? 'unknown') . ': ' . $e->getMessage());
        return '';
    }
}

/**
 * Generate a PDF ticket with all required fields + embedded QR code.
 *
 * @deprecated Ticket emails are attachment-free (the rich HTML email embeds
 *   the QR code). This stub remains only for backward compatibility with any
 *   legacy caller and always returns an empty string without doing work.
 * @param array $ticketData
 * @return string Always empty string */
function generateTicketPDF(array $ticketData): string
{
    // Deprecated no-op: ticket emails are attachment-free (the rich HTML
    // email embeds the QR code). Downloadable PDFs are produced on demand
    // by api/tickets/download-ticket.php via EmailHelper::regeneratePdf.
    return '';
}
