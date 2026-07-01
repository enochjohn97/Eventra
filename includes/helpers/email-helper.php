<?php
use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\SMTP;
use PHPMailer\PHPMailer\Exception as MailerException;

/**
 * Email Helper using PHPMailer
 */

// ─── 1. ROBUST PHPMailer LOADING ─────────────────────────────────────────────
$GLOBALS['EVENTRA_AUTOLOADER_ERROR'] = null;

if (!file_exists(__DIR__ . '/../../vendor/autoload.php')) {
    $GLOBALS['EVENTRA_AUTOLOADER_ERROR'] = 'Composer autoload not found.';
    error_log('[EmailHelper] ' . $GLOBALS['EVENTRA_AUTOLOADER_ERROR']);
}

if (!class_exists('PHPMailer\PHPMailer\PHPMailer')) {
    $autoloadPath = __DIR__ . '/../../vendor/autoload.php';
    if (file_exists($autoloadPath)) {
        try {
            if (!(@include_once $autoloadPath)) {
                throw new \Exception("include_once returned false for {$autoloadPath}");
            }
        } catch (\Throwable $e) {
            $GLOBALS['EVENTRA_AUTOLOADER_ERROR'] = $e->getMessage();
            error_log('[EmailHelper] Composer autoloader failed: ' . $e->getMessage());
        }
    }

    // Manual fallback — load PHPMailer src files directly
    if (!class_exists('PHPMailer\PHPMailer\PHPMailer')) {
        $phpmailerBase = __DIR__ . '/../../vendor/phpmailer/phpmailer/src/';
        foreach (['Exception.php', 'PHPMailer.php', 'SMTP.php'] as $file) {
            $p = $phpmailerBase . $file;
            if (file_exists($p)) {
                @include_once $p;
            }
        }
    }

    // Emergency alias so code below never throws a fatal class-not-found
    if (!class_exists('PHPMailer\PHPMailer\PHPMailer')) {
        error_log('[EmailHelper] CRITICAL: PHPMailer not found — emails will fail gracefully.');
        if (!class_exists('PHPMailer\PHPMailer\PHPMailer')) {
            class_alias('stdClass', 'PHPMailer\PHPMailer\PHPMailer');
        }
    }
}

// ─── 2. thecodingmachine/safe COMPATIBILITY ───────────────────────────────────
if (!function_exists('safe_file_get_contents')) {
    function safe_file_get_contents(string $filename): string|false
    {
        if (!file_exists($filename)) {
            return false;
        }
        return file_get_contents($filename);
    }
}

require_once __DIR__ . '/../../config/email.php';

// ─── 3. MAIN CLASS ───────────────────────────────────────────────────────────
class EmailHelper
{
    // ── Public API ────────────────────────────────────────────────────────────

    /**
     * Core send method — all other methods funnel through here.
     */
    public static function sendEmail(
        string $to,
        string $subject,
        string $body,
        array $attachments = [],
        string $altBody = '',
        array $embeddedImages = []
    ): array {
        if (empty(SMTP_HOST) || empty(SMTP_USER) || empty(SMTP_PASS)) {
            error_log('[EmailHelper] SMTP credentials not configured.');
            return ['success' => false, 'message' => 'SMTP credentials not configured.'];
        }

        if (
            !class_exists('PHPMailer\PHPMailer\PHPMailer') ||
            !method_exists('PHPMailer\PHPMailer\PHPMailer', 'isSMTP')
        ) {
            $msg = 'Email service unavailable (PHPMailer load failed)';
            if (!empty($GLOBALS['EVENTRA_AUTOLOADER_ERROR'])) {
                $msg .= ': ' . $GLOBALS['EVENTRA_AUTOLOADER_ERROR'];
            }
            error_log('[EmailHelper] ' . $msg);
            return ['success' => false, 'message' => $msg];
        }

        $mail = new PHPMailer(true);

        try {
            $mail->isSMTP();
            $mail->Host = SMTP_HOST;
            $mail->SMTPAuth = true;
            $mail->Username = SMTP_USER;
            $mail->Password = SMTP_PASS;
            $mail->SMTPSecure = SMTP_SECURE;
            $mail->Port = (int) SMTP_PORT;
            $mail->SMTPDebug = 0;
            $mail->Debugoutput = null;

            $mail->setFrom(EMAIL_FROM, EMAIL_FROM_NAME);
            $mail->addReplyTo($_ENV['MAIL_REPLY_TO'] ?? EMAIL_FROM, EMAIL_FROM_NAME);
            $mail->addAddress($to);

            foreach ($attachments as $filePath) {
                $filePath = trim((string) $filePath);
                if ($filePath === '') {
                    continue;
                }
                if (!file_exists($filePath)) {
                    error_log("[EmailHelper] Attachment not found: {$filePath}");
                    continue;
                }
                if (filesize($filePath) === 0) {
                    error_log("[EmailHelper] Attachment is empty (0 bytes): {$filePath}");
                    continue;
                }
                $mail->addAttachment($filePath);
            }

            if (is_array($embeddedImages)) {
                foreach ($embeddedImages as $img) {
                    $path = $img['path'] ?? '';
                    $cid = $img['cid'] ?? '';
                    $name = $img['name'] ?? '';
                    if ($path !== '' && file_exists($path)) {
                        $mail->addEmbeddedImage($path, $cid, $name);
                    }
                }
            }

            $mail->isHTML(true);
            $mail->Subject = $subject;
            $mail->Body = $body;
            $mail->AltBody = $altBody ?: strip_tags($body);

            $sent = @$mail->send();

            if ($sent) {
                error_log("[EmailHelper] Sent → {$to} | {$subject}");
                return ['success' => true, 'message' => 'Email sent successfully'];
            }

            error_log("[EmailHelper] Send failed → {$to}: " . $mail->ErrorInfo);
            return ['success' => false, 'message' => 'Email delivery failed: ' . $mail->ErrorInfo];

        } catch (MailerException $ex) {
            error_log("[EmailHelper] Mailer error → {$to}: " . $ex->getMessage());
            return ['success' => false, 'message' => 'Email delivery failed: ' . $ex->getMessage()];
        } catch (\Throwable $ex) {
            error_log("[EmailHelper] Critical error → {$to}: " . $ex->getMessage());
            return ['success' => false, 'message' => 'Email service encountered a critical configuration error.'];
        }
    }

    // ── Legacy simple ticket sender ───────────────────────────────────────────

    public static function sendTicketEmail(
        string $to,
        string $userName,
        string $eventName,
        string $barcode,
        string $pdfPath = ''
    ): array {
        $subject = "=?UTF-8?B?" . base64_encode("Your Ticket for {$eventName} — Eventra") . "?=";
        $safeUser = htmlspecialchars($userName, ENT_QUOTES, 'UTF-8');
        $safeEvent = htmlspecialchars($eventName, ENT_QUOTES, 'UTF-8');
        $safeBarcode = htmlspecialchars($barcode, ENT_QUOTES, 'UTF-8');
        $year = date('Y');

        $body = <<<HTML
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:20px;border:1px solid #eee;">
            <h2 style="color:#2ecc71;">Ticket Confirmation</h2>
            <p>Hi <strong>{$safeUser}</strong>,</p>
            <p>Thank you for your purchase! Your ticket for <strong>{$safeEvent}</strong> is ready.</p>
            <div style="background:#f9f9f9;padding:20px;text-align:center;border-radius:10px;margin:20px 0;">
                <p style="margin-bottom:5px;color:#666;">Ticket ID</p>
                <div style="font-size:24px;font-weight:bold;letter-spacing:5px;color:#2ecc71;">{$safeBarcode}</div>
            </div>
            <p>Your PDF ticket is attached. Please present the QR code at the venue entrance.</p>
            <hr style="border:0;border-top:1px solid #eee;margin:20px 0;">
            <p style="font-size:12px;color:#999;text-align:center;">&copy; {$year} Eventra. All rights reserved.</p>
        </div>
        HTML;

        $attachments = ($pdfPath !== '' && file_exists($pdfPath)) ? [$pdfPath] : [];
        return self::sendEmail($to, $subject, $body, $attachments);
    }

    // ── Private helpers ────────────────────────────────────────────────────────

    private static function esc(string $v): string
    {
        return htmlspecialchars($v, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    }

    private static function normalisePath(string $path): string
    {
        return str_replace('\\', '/', $path);
    }

    /**
     * Resolve an image path/URL to an inline base64 data-URI.
     * Returns empty string if the image cannot be read.
     * Cap the image at 500 KB after encoding to keep email under size limits.
     */
    private static function imageToDataUri(string $path, int $maxBytes = 500000): string
    {
        $path = trim($path);
        if ($path === '') {
            return '';
        }

        // Already a data-URI
        if (str_starts_with($path, 'data:image/')) {
            return $path;
        }

        // Remote URL
        if (str_starts_with($path, 'http://') || str_starts_with($path, 'https://')) {
            $ctx = stream_context_create(['http' => ['timeout' => 3]]);
            $data = @file_get_contents($path, false, $ctx);
            if ($data !== false && $data !== '') {
                if (strlen($data) > $maxBytes) {
                    error_log("[EmailHelper] imageToDataUri: remote image too large (" . strlen($data) . " bytes), skipping.");
                    return '';
                }
                $mime = self::guessMime($path);
                return 'data:' . $mime . ';base64,' . base64_encode($data);
            }
            return '';
        }

        // Local path
        $localPath = self::normalisePath($path);

        // 🔥 FIX: Resolve relative and web-relative paths properly
        $projectRoot = rtrim(self::normalisePath(__DIR__ . '/../../'), '/');
        $pathsToCheck = [];

        // If path isn't a true absolute path with drive letter, resolve relative to project root / public
        if (!preg_match('/^[a-zA-Z]:/', $localPath)) {
            $cleanedPath = ltrim($localPath, '/\\');
            $pathsToCheck[] = $projectRoot . '/' . $cleanedPath;
            $pathsToCheck[] = $projectRoot . '/public/' . $cleanedPath;
        } else {
            $pathsToCheck[] = $localPath;
        }

        $foundPath = null;
        foreach ($pathsToCheck as $candidate) {
            if (file_exists($candidate) && filesize($candidate) > 0) {
                $foundPath = $candidate;
                break;
            }
        }

        if ($foundPath === null) {
            error_log("[EmailHelper] imageToDataUri: file not found in checked paths for: {$path}");
            return '';
        }

        $data = @file_get_contents($foundPath);
        if ($data === false || $data === '') {
            return '';
        }

        if (strlen($data) > $maxBytes) {
            // Try to resize/compress using GD if available
            $resized = self::resizeImageData($data, $foundPath, 800, 400);
            if ($resized !== '') {
                $data = $resized;
            } else {
                error_log("[EmailHelper] imageToDataUri: local image too large (" . strlen($data) . " bytes), skipping.");
                return '';
            }
        }

        $mime = self::guessMime($foundPath);
        return 'data:' . $mime . ';base64,' . base64_encode($data);
    }

    /**
     * Resize image using GD to fit within maxW x maxH, returns raw PNG bytes or ''.
     */
    private static function resizeImageData(string $rawData, string $path, int $maxW, int $maxH): string
    {
        if (!function_exists('imagecreatefromstring')) {
            return '';
        }
        try {
            $src = @imagecreatefromstring($rawData);
            if (!$src) {
                return '';
            }
            $origW = imagesx($src);
            $origH = imagesy($src);

            $ratio = min($maxW / $origW, $maxH / $origH, 1.0);
            $newW = (int) round($origW * $ratio);
            $newH = (int) round($origH * $ratio);

            $dst = imagecreatetruecolor($newW, $newH);
            imagecopyresampled($dst, $src, 0, 0, 0, 0, $newW, $newH, $origW, $origH);
            imagedestroy($src);

            ob_start();
            imagejpeg($dst, null, 85);
            $out = ob_get_clean();
            imagedestroy($dst);

            return $out !== false ? $out : '';
        } catch (\Throwable $e) {
            error_log('[EmailHelper] resizeImageData failed: ' . $e->getMessage());
            return '';
        }
    }

    private static function guessMime(string $path): string
    {
        $ext = strtolower(pathinfo($path, PATHINFO_EXTENSION));
        return match ($ext) {
            'jpg', 'jpeg' => 'image/jpeg',
            'gif' => 'image/gif',
            'webp' => 'image/webp',
            'svg' => 'image/svg+xml',
            default => 'image/png',
        };
    }

    /**
     * Convert a local path to an absolute URL for use in emails.
     */
    private static function pathToUrl(string $path): string
    {
        $path = trim($path);
        if ($path === '' || str_starts_with($path, 'http')) {
            return $path;
        }

        $path = self::normalisePath($path);
        $projectRoot = rtrim(self::normalisePath(__DIR__ . '/../../'), '/');

        // Remove project root prefix if present
        if (strpos($path, $projectRoot) === 0) {
            $path = substr($path, strlen($projectRoot));
        }

        $appUrl = rtrim(defined('APP_URL') ? APP_URL : ($_ENV['APP_URL'] ?? ''), '/');
        return $appUrl . '/' . ltrim($path, '/');
    }

    /**
     * Build the public ticket validation URL (same payload as payment.html QRCode.js).
     */
    private static function buildVerificationUrl(array $ticketData): string
    {
        $barcode = trim((string) ($ticketData['barcode'] ?? $ticketData['ticket_id'] ?? ''));
        $appUrl  = rtrim(defined('APP_URL') ? APP_URL : ($_ENV['APP_URL'] ?? ''), '/');

        // Substitute LAN IP for localhost/127.0.0.1 so mobile devices can resolve the URL
        $parsedHost = parse_url($appUrl, PHP_URL_HOST) ?? '';
        if (in_array($parsedHost, ['localhost', '127.0.0.1'], true)) {
            $lanIp = gethostbyname(gethostname());
            if ($lanIp !== gethostname() && $lanIp !== '127.0.0.1' && filter_var($lanIp, FILTER_VALIDATE_IP)) {
                $appUrl = str_replace($parsedHost, $lanIp, $appUrl);
            }
        }

        return $appUrl . '/api/tickets/validate-ticket.php?barcode=' . urlencode($barcode);
    }


    /**
     * Get the static QR asset path (public/assets/imgs/qr.png)
     */
    private static function getEmailQrAssetPath(): string
    {
        return rtrim(self::normalisePath(__DIR__ . '/../../'), '/') . '/public/assets/imgs/qr.png';
    }

    private static function buildStyledQrHtml(string $qrSrc, int $size = 160, bool $forPdf = false): string
    {
        if ($qrSrc === '') {
            return '';
        }

        $safeQrSrc = htmlspecialchars($qrSrc, ENT_QUOTES, 'UTF-8');

        if ($forPdf) {
            return "<img src=\"{$safeQrSrc}\" alt=\"QR Code\" width=\"{$size}\" height=\"{$size}\""
                . " style=\"width:{$size}px;height:{$size}px;display:block;\">";
        }

        return '<table cellpadding="0" cellspacing="0" border="0" role="presentation"><tr><td align="center"'
            . ' style="background:#fff;padding:10px;border-radius:12px;border:1px solid #e2e8f0;">'
            . "<div style=\"position:relative;width:{$size}px;height:{$size}px;\">"
            . "<img id=\"qrcode\" src=\"{$safeQrSrc}\" alt=\"QR Code\" width=\"{$size}\" height=\"{$size}\""
            . " style=\"width:{$size}px;height:{$size}px;display:block;pointer-events:none;user-select:none;\">"
            . "<div style=\"position:absolute;inset:0;z-index:5;background:transparent;\"></div>"
            . "</div>"
            . '</td></tr></table>';
    }

    /**
     * Resolve a stored QR path to an absolute filesystem path.
     */
    private static function resolveLocalQrPath(string $qrPath): string
    {
        $localPath = trim($qrPath);
        if ($localPath === '' || str_starts_with($localPath, 'http://') || str_starts_with($localPath, 'https://')) {
            return $localPath;
        }

        $projectRoot = rtrim(self::normalisePath(__DIR__ . '/../../'), '/');
        $localPath = self::normalisePath($localPath);

        if (!preg_match('/^[A-Za-z]:/', $localPath)) {
            $cleaned = ltrim($localPath, '/\\');
            // Try standard project root first
            $try1 = $projectRoot . '/' . $cleaned;
            if (file_exists($try1)) {
                $localPath = $try1;
            } else {
                // Try prepending public/
                $try2 = $projectRoot . '/public/' . $cleaned;
                if (file_exists($try2)) {
                    $localPath = $try2;
                } else {
                    // Fallback to try1
                    $localPath = $try1;
                }
            }
        }
        return str_replace('/', DIRECTORY_SEPARATOR, $localPath);
    }

    /**
     * Generate QR code as a base64 data-URI or absolute URL for email clients.
     * PRIORITY: Use public/assets/imgs/qr.png if it exists.
     */
    private static function generateQrDataUri(array $ticketData, string $staticPath = '', bool $forceRemote = false): string
    {
        // 1. Priority: Use existing base64 data if available
        if (!$forceRemote && !empty($ticketData['qr_base64'])) {
            $b64 = $ticketData['qr_base64'];
            if (!str_starts_with($b64, 'data:')) {
                $b64 = 'data:image/png;base64,' . $b64;
            }
            return $b64;
        }

        // 2. Priority: Use the actual ticket's QR code file
        $qrPath = trim((string) ($ticketData['qr_path'] ?? $ticketData['qr_code_path'] ?? $staticPath ?? ''));
        if ($qrPath !== '') {
            $localPath = self::resolveLocalQrPath($qrPath);
            if (file_exists($localPath) && filesize($localPath) > 0) {
                $mime = self::guessMime($localPath);
                $data = @file_get_contents($localPath);
                if ($data !== false && $data !== '') {
                    return 'data:' . $mime . ';base64,' . base64_encode($data);
                }
            }
        }

        // 3. Priority: Generate QR code dynamically via chillerlan/php-qrcode if available
        $verificationUrl = self::buildVerificationUrl($ticketData);
        if (class_exists('chillerlan\QRCode\QRCode')) {
            try {
                $options = new \chillerlan\QRCode\QROptions([
                    'outputType' => \chillerlan\QRCode\Output\QROutputInterface::GDIMAGE_PNG,
                    'eccLevel' => \chillerlan\QRCode\Common\EccLevel::H,
                    'imageBase64' => true,
                    'scale' => 6,
                    'imageTransparent' => false,
                ]);
                $qr = new \chillerlan\QRCode\QRCode($options);
                $rendered = $qr->render($verificationUrl);
                if (is_string($rendered) && $rendered !== '') {
                    return $rendered;
                }
            } catch (\Throwable $e) {
                error_log('[EmailHelper] chillerlan/php-qrcode failed: ' . $e->getMessage());
            }
        }

        // 4. Priority: Fallback to the static placeholder QR file
        $staticQrPath = self::getEmailQrAssetPath();
        if (file_exists($staticQrPath) && filesize($staticQrPath) > 0) {
            $data = @file_get_contents($staticQrPath);
            if ($data !== false && $data !== '') {
                $mime = self::guessMime($staticQrPath);
                return 'data:' . $mime . ';base64,' . base64_encode($data);
            }
        }

        return '';
    }

    private static function detailRow(string $label, string $value, bool $priceStyle = false, bool $forPdf = false): string
    {
        if ($forPdf) {
            $valueStyle = $priceStyle
                ? 'font-family:Arial,sans-serif;font-size:13pt;font-weight:800;color:#ffffff;line-height:1.2;display:block;'
                : 'font-family:Arial,sans-serif;font-size:11pt;font-weight:600;color:#ffffff;line-height:1.2;display:block;';
            $labelStyle = 'display:block;font-family:Arial,sans-serif;font-size:7pt;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#ffffff;margin-bottom:2pt;';
            $marginStyle = 'margin-bottom:10pt;word-break:break-word;';
        } else {
            $valueStyle = $priceStyle
                ? 'font-family:Arial,sans-serif;font-size:17px;font-weight:800;color:#ffffff;line-height:1.2;display:block;'
                : 'font-family:Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;line-height:1.2;display:block;';
            $labelStyle = 'display:block;font-family:Arial,sans-serif;font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#ffffff;margin-bottom:3px;';
            $marginStyle = 'margin-bottom:14px;word-break:break-word;';
        }

        return '<div style="' . $marginStyle . '">'
            . '<span style="' . $labelStyle . '">'
            . self::esc($label)
            . '</span>'
            . '<span style="' . $valueStyle . '">' . $value . '</span>'
            . '</div>';
    }

    // ── buildTicketHtml ────────────────────────────────────────────────────────
    /**
     * Build a fully self-contained ticket HTML.
     *
     * $forPdf = true  → simplified inline-style layout optimised for DomPDF/wkhtmltopdf
     * $forPdf = false → richer layout for email (still keeps total size < ~90 KB)
     */
    public static function buildTicketHtml(
        array $ticketData,
        bool $forPdf = false
    ): string {
        /* ── Sanitise text fields ─────────────────────────── */
        $barcode = self::esc($ticketData['barcode'] ?? '');
        $ticketId = self::esc($ticketData['ticket_id'] ?? ($ticketData['barcode'] ?? ''));
        $eventTitle = self::esc($ticketData['event_name'] ?? '');
        $userName = self::esc($ticketData['user_name'] ?? 'Attendee');
        $venue = self::esc($ticketData['address'] ?? '—');
        $organizer = self::esc($ticketData['organizer'] ?? '');
        $ticketType = self::esc($ticketData['ticket_type'] ?? '');
        $year = date('Y');

        $tickDispRaw = $ticketData['ticket_type_display'] ?? ($ticketData['ticket_type'] ?? '');
        if (isset($ticketData['amount']) && (float) $ticketData['amount'] <= 0) {
            $tickDispRaw = 'Free';
        }
        $tickDisp = self::esc($tickDispRaw);

        /* ── Date & time ─────────────────────────────────── */
        $eventDate = !empty($ticketData['event_date'])
            ? self::esc(date('D, d M Y', strtotime((string) $ticketData['event_date'])))
            : 'TBC';
        $eventTime = !empty($ticketData['event_time'])
            ? self::esc(date('g:i A', strtotime((string) $ticketData['event_time'])))
            : 'TBC';

        /* ── Price ───────────────────────────────────────── */
        $amountDisplay = '';
        if (isset($ticketData['amount'])) {
            $amountFloat = (float) $ticketData['amount'];
            $amountDisplay = $amountFloat > 0
                ? '&#8358;' . number_format($amountFloat, 2)
                : 'Free';
        }

        /* ── QR code data-URI ────────────────────── */
        $qrHtml = '';
        $staticQrPath = self::normalisePath(
            $ticketData['qr_path'] ?? $ticketData['qr_code_path'] ?? ''
        );

        if (!$forPdf && !empty($ticketData['qr_cid'])) {
            $qrSrc = 'cid:' . $ticketData['qr_cid'];
        } else {
            // 🔥 FIX: Use self::generateQrDataUri (which now always returns base64 or empty)
            $qrSrc = self::generateQrDataUri($ticketData, $staticQrPath, false);

            // 🛡️ Additional fallback for PDF edge cases
            if ($qrSrc === '' && $forPdf) {
                $emailQr = self::getEmailQrAssetPath();
                if (file_exists($emailQr) && filesize($emailQr) > 0) {
                    $data = @file_get_contents($emailQr);
                    if ($data !== false && $data !== '') {
                        $qrSrc = 'data:image/png;base64,' . base64_encode($data);
                    }
                }
            }
        }

        $qrSize = $forPdf ? 120 : 160;
        if ($qrSrc !== '') {
            $qrHtml = self::buildStyledQrHtml($qrSrc, $qrSize, $forPdf);
        }

        if ($qrHtml === '') {
            $qrHtml = '<div style="width:160px;height:160px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:1rem;text-align:center;line-height:160px;font-size:9px;color:#94a3b8;font-weight:700;">QR ERROR</div>';
        }

        /* ── Event banner image ──────────────────────────── */
        $imgRaw = trim((string) ($ticketData['event_image'] ?? ''));
        $imgBase64 = ''; // Initialize

        if (!$forPdf && !empty($ticketData['event_image_cid'])) {
            $imgBase64 = 'cid:' . $ticketData['event_image_cid'];
        } else {
            if ($forPdf) {
                // Try resolving to local absolute path first for Dompdf performance & stability
                $resolvedLocal = self::resolveLocalPath($imgRaw);
                if ($resolvedLocal !== '') {
                    $imgBase64 = $resolvedLocal;
                } else {
                    $imgBase64 = self::imageToDataUri($imgRaw, 500000);
                }
            } else {
                $imgBase64 = self::imageToDataUri($imgRaw, 500000);
            }
        }

        if ($imgBase64 !== '') {
            $safeImgSrc = htmlspecialchars($imgBase64, ENT_QUOTES, 'UTF-8');
            $eventImgHtml = "<div style=\"position:relative;width:100%;height:180px;\">"
                . "<img src=\"{$safeImgSrc}\" alt=\"Event\" "
                . "style=\"width:100%;height:100%;object-fit:cover;display:block;border-top-left-radius:16px;border-top-right-radius:16px;pointer-events:none;user-select:none;\">"
                . "<div style=\"position:absolute;inset:0;z-index:5;background:transparent;\"></div>"
                . "</div>";
        } else {
            $eventImgHtml = '<div style="width:100%;height:180px;background:#0f3460;text-align:center;line-height:180px;border-top-left-radius:16px;border-top-right-radius:16px;">'
                . '<span style="font-size:11px;letter-spacing:3px;color:rgba(212,175,55,0.6);text-transform:uppercase;">EVENT</span>'
                . '</div>';
        }

        /* ── Ticket-type badge ───────────────────────────── */
        $badgeBg = '#d4af37';
        $badgeFg = '#111111';
        if ($tickDisp !== '') {
            $lower = strtolower($tickDispRaw);
            if (str_contains($lower, 'vip')) {
                $badgeBg = '#c0392b';
                $badgeFg = '#ffffff';
            }
            if (str_contains($lower, 'premium')) {
                $badgeBg = '#9b59b6';
                $badgeFg = '#ffffff';
            }
            if (str_contains($lower, 'free')) {
                $badgeBg = '#27ae60';
                $badgeFg = '#ffffff';
            }
        }
        $badgeHtml = $tickDisp !== ''
            ? '<div style="margin-bottom:16px;">'
            . "<span style=\"display:inline-block;background:{$badgeBg};color:{$badgeFg};"
            . 'font-family:Arial,sans-serif;font-size:9px;font-weight:800;letter-spacing:2px;'
            . 'text-transform:uppercase;padding:4px 14px;border-radius:20px;">'
            . $tickDisp . '</span></div>'
            : '<div style="margin-bottom:16px;"></div>';

        /* ── Detail columns ──────────────────────────────── */
        $colA = self::detailRow('Date', $eventDate, false, $forPdf);
        $colA .= self::detailRow('Time', $eventTime, false, $forPdf);

        $locations = $ticketData['locations'] ?? null;
        if (is_string($locations)) {
            $locations = json_decode($locations, true);
        }

        $selectedLocs = $ticketData['selected_locs'] ?? null;
        if (is_string($selectedLocs)) {
            $selectedLocs = json_decode($selectedLocs, true);
        }

        if (is_array($locations) && count($locations) > 0) {
            // Filter locations if selectedLocs is present
            if (is_array($selectedLocs) && count($selectedLocs) > 0) {
                $filtered = [];
                foreach ($selectedLocs as $idx) {
                    if (isset($locations[$idx])) {
                        $filtered[] = $locations[$idx];
                    }
                }
                if (!empty($filtered)) {
                    $locations = $filtered;
                }
            }
            $labelStyle = $forPdf
                ? 'display:block;font-family:Arial,sans-serif;font-size:7pt;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#ffffff;margin-bottom:4pt;'
                : 'display:block;font-family:Arial,sans-serif;font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#ffffff;margin-bottom:6px;';
            $colA .= '<div style="margin-bottom:' . ($forPdf ? '10pt' : '14px') . ';word-break:break-word;">'
                . '<span style="' . $labelStyle . '">Venue &amp; Location</span>';
            foreach ($locations as $loc) {
                $s = self::esc($loc['state'] ?? '');
                $a = self::esc($loc['address'] ?? '');

                // Typography for Location blocks
                if ($forPdf) {
                    $stateStyle = 'font-family:Arial,sans-serif;font-size:12pt;font-weight:700;color:#ffffff;line-height:1.3;display:block;';
                    $addrStyle = 'font-family:Arial,sans-serif;font-size:10pt;font-weight:400;color:#ffffff;line-height:1.4;display:block;';
                    $itemMargin = 'margin-bottom:9pt;';
                } else {
                    $stateStyle = 'font-family:Arial,sans-serif;font-size:16px;font-weight:700;color:#ffffff;line-height:1.3;display:block;';
                    $addrStyle = 'font-family:Arial,sans-serif;font-size:13px;font-weight:400;color:#ffffff;line-height:1.4;display:block;';
                    $itemMargin = 'margin-bottom:12px;';
                }

                $colA .= '<div style="' . $itemMargin . '">'
                    . '<span style="' . $stateStyle . '">' . $s . '</span>'
                    . '<span style="' . $addrStyle . '">' . $a . '</span>'
                    . '</div>';
            }
            $colA .= '</div>';
        } else {
            $st = $ticketData['state'] ?? '';
            $ad = $ticketData['address'] ?? ($ticketData['location'] ?? '—');
            if (!empty($st) && strtolower($st) !== 'all states') {
                $labelStyle = $forPdf
                    ? 'display:block;font-family:Arial,sans-serif;font-size:7pt;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#ffffff;margin-bottom:4pt;'
                    : 'display:block;font-family:Arial,sans-serif;font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#ffffff;margin-bottom:6px;';
                $stateStyle = $forPdf
                    ? 'font-family:Arial,sans-serif;font-size:12pt;font-weight:700;color:#ffffff;display:block;'
                    : 'font-family:Arial,sans-serif;font-size:16px;font-weight:700;color:#ffffff;display:block;';
                $addrStyle = $forPdf
                    ? 'font-family:Arial,sans-serif;font-size:10pt;font-weight:400;color:#ffffff;display:block;'
                    : 'font-family:Arial,sans-serif;font-size:13px;font-weight:400;color:#ffffff;display:block;';
                $colA .= '<div style="margin-bottom:' . ($forPdf ? '10pt' : '14px') . ';word-break:break-word;">'
                    . '<span style="' . $labelStyle . '">Venue &amp; Location</span>'
                    . '<div style="margin-bottom:' . ($forPdf ? '9pt' : '12px') . ';">'
                    . '<span style="' . $stateStyle . '">' . self::esc($st) . '</span>'
                    . '<span style="' . $addrStyle . '">' . self::esc($ad) . '</span>'
                    . '</div></div>';
            } else {
                $colA .= self::detailRow('Venue', self::esc($ad), false, $forPdf);
                if (!empty($st)) {
                    $colA .= self::detailRow('Location', self::esc($st), false, $forPdf);
                }
            }
        }

        $colB = '';
        if ($tickDisp !== '' || $ticketType !== '') {
            $colB .= self::detailRow('Ticket Type', $tickDisp ?: $ticketType, false, $forPdf);
        }
        if ($amountDisplay !== '') {
            $colB .= self::detailRow('Amount Paid', $amountDisplay, true, $forPdf);
        }
        // Quantity bought
        $qtyBought = isset($ticketData['quantity']) ? (int) $ticketData['quantity'] : 1;
        $colB .= self::detailRow('Qty', (string) $qtyBought, false, $forPdf);
        if ($organizer !== '') {
            $colB .= self::detailRow('Organizer', $organizer, false, $forPdf);
        }


        /* ─────────────────────────────────────────────────────────────────
         *  TWO RENDERING PATHS
         *  (A) EMAIL  — table-based layout, all images inlined, < ~90 KB total
         *  (B) PDF    — flat single-column inline-style layout, DomPDF-safe
         * ───────────────────────────────────────────────────────────────── */

        if ($forPdf) {
            return self::buildPdfHtml(
                $eventTitle,
                $userName,
                $barcode,
                $ticketId,
                $eventDate,
                $eventTime,
                $badgeHtml,
                $colA,
                $colB,
                $imgBase64,
                $qrHtml,
                $year
            );
        }

        /* ── EMAIL HTML ─────────────────────────────────────────────────── */
        $bgImageStyle = 'background-color: #0f172a;';
        if ($imgBase64 !== '') {
            $safeImgSrc = htmlspecialchars($imgBase64, ENT_QUOTES, 'UTF-8');
            $bgImageStyle = "background-image: linear-gradient(rgba(15, 23, 42, 0.88), rgba(15, 23, 42, 0.88)), url('{$safeImgSrc}'); background-repeat: no-repeat; background-size: cover; background-position: center;";
        } else {
            $bgImageStyle = "background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);";
        }

        $html = <<<HTML
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
</head>
<body style="margin:0;padding:40px 10px;background-color:#ffffff;font-family:Arial,'Helvetica Neue',Helvetica,sans-serif;">

<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation">
<tr><td align="center">

  <table width="750" cellpadding="0" cellspacing="0" border="0" role="presentation"
         style="max-width:750px;width:750px;{$bgImageStyle}border-radius:16px;overflow:hidden;border-collapse:collapse;border:none;color:#ffffff;box-shadow:0 10px 25px rgba(0,0,0,0.15);">
  <tr>
    <!-- Main Body Section (Left ~73% -> 550px) -->
    <td width="550" valign="top" style="padding:28px 32px;width:550px;background-color:transparent;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
        <tr>
          <td valign="top">
            {$badgeHtml}
            <div style="font-family:Arial,sans-serif;font-size:26px;line-height:1.2;color:#ffffff;font-weight:800;text-transform:uppercase;margin-top:6px;margin-bottom:6px;letter-spacing:-0.5px;">{$eventTitle}</div>
          </td>
        </tr>
        <tr><td height="12" style="font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr>
          <td style="padding-top:10px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
              <tr>
                <td width="50%" valign="top" style="padding-right:16px;">{$colA}</td>
                <td width="50%" valign="top" style="padding-left:16px;">{$colB}</td>
              </tr>
            </table>
          </td>
        </tr>
        <tr><td height="20" style="font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr>
          <td style="padding-top:16px;border-top:1px solid rgba(255,255,255,0.15);">
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
              <tr>
                <td valign="bottom" width="60%">
                  <div style="font-family:Arial,sans-serif;font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:rgba(255,255,255,0.7);margin-bottom:3px;">Ticket Holder</div>
                  <div style="font-family:Arial,sans-serif;font-size:16px;font-weight:800;color:#ffffff;">{$userName}</div>
                </td>
                <td valign="bottom" width="40%" align="right">
                  <div style="font-family:Arial,sans-serif;font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:rgba(255,255,255,0.7);margin-bottom:3px;">Ticket ID</div>
                  <div style="font-family:'Courier New',Courier,monospace;font-size:12px;font-weight:700;color:#ffffff;">{$ticketId}</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
    
    <!-- Perforated Divider (Dotted line between Body and Stub) -->
    <td width="2" style="width:2px;border-left:2px dashed rgba(255,255,255,0.35);font-size:0;line-height:0;background-color:transparent;">&nbsp;</td>
    
    <!-- Stub Section (Right ~27% -> 198px) -->
    <td width="198" valign="middle" align="center" style="padding:24px 16px;width:198px;background-color:rgba(15,23,42,0.4);">
      <div style="margin-bottom:12px;text-align:center;">
        <span style="display:inline-block;font-family:Arial,sans-serif;font-size:12px;font-weight:900;letter-spacing:4px;color:#ffffff;text-transform:uppercase;">SCAN QRCODE</span>
      </div>
      <div style="display:inline-block;padding:8px;background:#ffffff;border-radius:10px;margin-bottom:10px;text-align:center;">
        {$qrHtml}
      </div>
      <div style="font-family:'Courier New',Courier,monospace;font-size:10px;font-weight:700;color:#ffffff;letter-spacing:1px;word-break:break-all;padding:0 5px;text-align:center;line-height:1.2;">
        {$barcode}
      </div>
    </td>
  </tr>
  </table>

</td></tr>
</table>

</body>
</html>
HTML;

        // Minify HTML to reduce size and prevent Gmail clipping
        $html = preg_replace('/<!--(.|\s)*?-->/', '', $html); // Remove comments
        $html = preg_replace('/\s+/', ' ', $html); // Collapse whitespace
        $html = str_replace("> <", "><", $html); // Remove whitespace between tags
        return trim($html);
    }

    private static function buildPdfHtml(
        string $eventTitle,
        string $userName,
        string $barcode,
        string $ticketId,
        string $eventDate,
        string $eventTime,
        string $badgeHtml,
        string $colA,
        string $colB,
        string $bgImage,
        string $qrHtml,
        string $year
    ): string {
        // Build DomPDF-safe event image cell: no CSS background-image, use inline <img> instead
        if ($bgImage !== '') {
            $safeImgSrc = htmlspecialchars($bgImage, ENT_QUOTES, 'UTF-8');
            $imgCellContent = "<img src=\"{$safeImgSrc}\" alt=\"Event\" width=\"165\" height=\"315\""
                . " style=\"width:165pt;height:315pt;display:block;\">";
        } else {
            $imgCellContent = '<div style="width:165pt;height:315pt;background:#1e3a5f;display:block;text-align:center;vertical-align:middle;">'
                . '<span style="color:#d4af37;font-family:Arial,sans-serif;font-size:8pt;letter-spacing:3px;text-transform:uppercase;">EVENTRA</span>'
                . '</div>';
        }

        return <<<PDF
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Ticket — {$eventTitle}</title>
<style>
  @page { margin: 0; }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    background-color: #0f172a;
    font-family: Helvetica, Arial, sans-serif;
    color: #ffffff;
  }
  table { border-collapse: collapse; }
  .event-title {
    font-size: 20pt;
    font-weight: 900;
    text-transform: uppercase;
    line-height: 1.1;
    color: #ffffff;
  }
  .label {
    font-size: 7pt;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: #94a3b8;
    font-weight: 700;
  }
  .holder-name {
    font-size: 15pt;
    font-weight: 800;
    color: #ffffff;
  }
  .ticket-id {
    font-family: 'Courier New', Courier, monospace;
    font-size: 9pt;
    font-weight: 700;
    color: #ffffff;
  }
  .barcode-text {
    font-family: 'Courier New', Courier, monospace;
    font-size: 8pt;
    color: #ffffff;
    text-align: center;
    margin-top: 5pt;
  }
</style>
</head>
<body>
<table width="675" height="315" cellpadding="0" cellspacing="0" border="0" style="width:675pt;height:315pt;background-color:#0f172a;border-collapse:collapse;margin:0;padding:0;">
  <tr>
    <!-- Event Image Panel (Left 165pt) -->
    <td width="165" valign="top" style="width:165pt;height:315pt;padding:0;background-color:#1e3a5f;overflow:hidden;">
      {$imgCellContent}
    </td>

    <!-- Main Body Section (330pt) -->
    <td width="330" valign="top" style="padding:21pt 21pt;width:330pt;background-color:#0f172a;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
        <tr>
          <td valign="top">
            {$badgeHtml}
            <div class="event-title" style="margin-top:5pt;font-size:20pt;font-weight:900;text-transform:uppercase;line-height:1.2;color:#ffffff;letter-spacing:-0.5px;">{$eventTitle}</div>
          </td>
        </tr>
        <tr><td height="9" style="font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr>
          <td valign="top">
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
              <tr>
                <td width="50%" valign="top" style="padding-right:12pt;">{$colA}</td>
                <td width="50%" valign="top" style="padding-left:12pt;">{$colB}</td>
              </tr>
            </table>
          </td>
        </tr>
        <tr><td height="10" style="font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr>
          <td style="border-top:1px solid #334155;padding-top:10pt;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
              <tr>
                <td valign="bottom" width="60%">
                  <div class="label">Ticket Holder</div>
                  <div class="holder-name" style="margin-top:2pt;">{$userName}</div>
                </td>
                <td valign="bottom" width="40%" align="right">
                  <div class="label">Ticket ID</div>
                  <div class="ticket-id" style="margin-top:2pt;">{$ticketId}</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>

    <!-- Perforated Divider -->
    <td width="2" style="width:2pt;border-left:2pt dashed #475569;font-size:0;line-height:0;background-color:#0f172a;">&nbsp;</td>

    <!-- Stub Section (178pt) -->
    <td width="178" valign="middle" align="center" style="padding:18pt 12pt;width:178pt;background-color:#1e293b;">
      <div style="margin-bottom:10pt;text-align:center;">
        <span style="display:inline-block;font-family:Arial,sans-serif;font-size:9pt;font-weight:900;letter-spacing:3px;color:#ffffff;text-transform:uppercase;">SCAN QRCODE</span>
      </div>
      <div style="display:inline-block;padding:6pt;background:#ffffff;border-radius:8pt;margin-bottom:8pt;text-align:center;">
        {$qrHtml}
      </div>
      <div class="barcode-text" style="letter-spacing:1px;word-break:break-all;line-height:1.3;padding:0 4pt;text-align:center;width:100%;">
        {$barcode}
      </div>
    </td>
  </tr>
</table>
</body>
</html>
PDF;
    }


    // ── OTP email ─────────────────────────────────────────────────────────────

    public static function sendPasswordResetOTP(string $to, string $name, string $otp): array
    {
        $subject = "=?UTF-8?B?" . base64_encode("Reset your Eventra password — OTP: {$otp}") . "?=";
        $safeName = htmlspecialchars($name, ENT_QUOTES, 'UTF-8');
        $year = date('Y');

        $body = <<<HTML
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:40px;
                    background:#ffffff;border-radius:16px;border:1px solid #f1f5f9;">
            <div style="text-align:center;margin-bottom:32px;">
                <h1 style="color:#2ecc71;margin:0;font-size:28px;font-weight:800;">Eventra</h1>
                <p style="color:#64748b;margin-top:8px;font-size:14px;">Bringing your events to life</p>
            </div>
            <h2 style="color:#1e293b;font-size:20px;font-weight:700;margin-bottom:16px;">Reset your password</h2>
            <p style="color:#475569;font-size:16px;line-height:1.6;margin-bottom:24px;">Hi <strong>{$safeName}</strong>,</p>
            <p style="color:#475569;font-size:16px;line-height:1.6;margin-bottom:32px;">
                Use the code below to reset your password. It expires in 15 minutes.
            </p>
            <div style="background:#f8fafc;padding:32px;text-align:center;border-radius:12px;
                        margin:32px 0;border:1px solid #e2e8f0;">
                <p style="margin:0 0 12px 0;color:#64748b;font-size:12px;
                           text-transform:uppercase;letter-spacing:2px;font-weight:700;">Verification Code</p>
                <div style="font-size:48px;font-weight:800;letter-spacing:8px;
                            color:#1e293b;font-family:'Courier New',monospace;">{$otp}</div>
            </div>
            <p style="color:#64748b;font-size:14px;line-height:1.6;margin-bottom:32px;">
                If you didn't request this, you can safely ignore it.
            </p>
            <hr style="border:0;border-top:1px solid #f1f5f9;margin:32px 0;">
            <p style="font-size:12px;color:#94a3b8;text-align:center;margin:0;">
                &copy; {$year} Eventra Inc. All rights reserved.
            </p>
        </div>
        HTML;

        return self::sendEmail($to, $subject, $body);
    }

    // ── resolveLocalPath ───────────────────────────────────────────────────────

    private static function resolveLocalPath(string $path): string
    {
        $path = trim($path);
        if ($path === '' || str_starts_with($path, 'data:image/') || str_starts_with($path, 'http://') || str_starts_with($path, 'https://')) {
            return '';
        }

        $localPath = self::normalisePath($path);
        $projectRoot = rtrim(self::normalisePath(__DIR__ . '/../../'), '/');
        $pathsToCheck = [];

        // If path isn't a true absolute path with drive letter, resolve relative to project root / public
        if (!preg_match('/^[a-zA-Z]:/', $localPath)) {
            $cleanedPath = ltrim($localPath, '/\\');
            $pathsToCheck[] = $projectRoot . '/' . $cleanedPath;
            $pathsToCheck[] = $projectRoot . '/public/' . $cleanedPath;
        } else {
            $pathsToCheck[] = $localPath;
        }

        foreach ($pathsToCheck as $candidate) {
            if (file_exists($candidate) && filesize($candidate) > 0) {
                return $candidate;
            }
        }
        return '';
    }

    // ── sendTicketEmailFull ────────────────────────────────────────────────────

    /**
     * Send a full rich ticket email + attach a PDF.
     *
     * KEY FIX: PDF is now generated from buildTicketHtml(..., forPdf: true)
     * which uses a DomPDF-safe flat layout — no overflow:hidden, no CSS gradients
     * on table backgrounds, no object-fit — so it renders correctly.
     */
    public static function sendTicketEmailFull(
        string $to,
        array $ticketData,
        string|array $pdfPath = ''
    ): array {
        /* ── 1. DB sync ──────────────────────────────────────────── */
        $barcode = trim((string) ($ticketData['barcode'] ?? ''));

        if ($barcode !== '') {
            $dbConfigPath = __DIR__ . '/../../config/database.php';
            if (file_exists($dbConfigPath)) {
                require_once $dbConfigPath;
                $pdo = getPDO();

                if (isset($pdo) && $pdo instanceof \PDO) {
                    try {
                        $stmt = $pdo->prepare("
                            SELECT
                                t.barcode,
                                t.barcode        AS ticket_id,
                                t.qr_code_path   AS qr_path,
                                t.status,
                                t.ticket_type,
                                t.user_id,
                                t.event_id,
                                e.event_name,
                                e.event_date,
                                e.event_time,
                                e.location,
                                e.address,
                                e.locations,
                                e.state,
                                e.image_path     AS event_image,
                                u.name           AS user_name,
                                p.amount,
                                p.id             AS order_id
                            FROM   tickets  t
                            JOIN   events   e ON e.id = t.event_id
                            JOIN   users    u ON u.id = t.user_id
                            LEFT JOIN payments p ON p.id = t.payment_id
                            WHERE  t.barcode = ?
                            LIMIT  1
                        ");
                        $stmt->execute([$barcode]);
                        $fresh = $stmt->fetch(\PDO::FETCH_ASSOC);

                        if ($fresh) {
                            // Merge: DB values fill gaps, but caller-supplied data (e.g. qr_base64) takes priority
                            $filteredFresh = array_filter($fresh, static fn($v) => $v !== null);
                            $ticketData = array_merge($filteredFresh, $ticketData);
                        }
                    } catch (\Throwable $dbEx) {
                        error_log('[EmailHelper] DB sync error: ' . $dbEx->getMessage());
                    }
                }
            }
        }

        /* ── 2. Subject ──────────────────────────────────────────── */
        $eventName = htmlspecialchars(
            $ticketData['event_name'] ?? 'Your Event',
            ENT_QUOTES,
            'UTF-8'
        );
        $subject = "=?UTF-8?B?" . base64_encode("Your Ticket for " . ($ticketData['event_name'] ?? 'Event') . " — Eventra") . "?=";

        /* ── 3. Validate / regenerate PDF files ── */
        $rawPaths = is_array($pdfPath) ? $pdfPath : [$pdfPath];
        $validPdfPaths = [];

        foreach ($rawPaths as $path) {
            $path = trim((string) $path);
            if ($path === '') {
                continue;
            }

            $shouldRegenerate = false;
            if (!file_exists($path)) {
                error_log("[EmailHelper] PDF not found, will attempt regeneration: {$path}");
                $shouldRegenerate = true;
            } elseif (filesize($path) === 0) {
                error_log("[EmailHelper] PDF is empty (0 bytes), will attempt regeneration: {$path}");
                $shouldRegenerate = true;
            }

            if ($shouldRegenerate) {
                // Attempt to generate the PDF using the PDF-safe HTML
                $regenerated = self::regeneratePdf($ticketData, $path);
                if ($regenerated && file_exists($path) && filesize($path) > 0) {
                    error_log("[EmailHelper] PDF regenerated successfully: {$path}");
                } else {
                    error_log("[EmailHelper] PDF regeneration failed, skipping: {$path}");
                    continue;
                }
            }

            if (file_exists($path) && filesize($path) > 0) {
                $validPdfPaths[] = $path;
            }
        }

        $embeddedImages = [];

        $qrPathRaw = $ticketData['qr_path'] ?? $ticketData['qr_code_path'] ?? '';
        $resolvedQrPath = self::resolveLocalPath($qrPathRaw);
        if ($resolvedQrPath !== '') {
            $embeddedImages[] = [
                'path' => $resolvedQrPath,
                'cid'  => 'qr_code',
                'name' => 'qr_code.png'
            ];
            $ticketData['qr_cid'] = 'qr_code';
        }

        $eventImgRaw = $ticketData['event_image'] ?? '';
        $resolvedEventImgPath = self::resolveLocalPath($eventImgRaw);
        if ($resolvedEventImgPath !== '') {
            $embeddedImages[] = [
                'path' => $resolvedEventImgPath,
                'cid'  => 'event_image',
                'name' => 'event_image.png'
            ];
            $ticketData['event_image_cid'] = 'event_image';
        }

        $emailTicketData = $ticketData;
        // Keep qr_base64 if available to ensure the unique QR code displays correctly
        $body = self::buildTicketHtml($emailTicketData, false);

        /* ── 4. Send with file attachments ───────── */
        return self::sendEmail($to, $subject, $body, $validPdfPaths, '', $embeddedImages);
    }

    /**
     * Attempt to (re)generate a PDF at $outputPath using Node.js script.
     *
     * Returns true if the PDF was written successfully.
     */
    public static function regeneratePdf(array $ticketData, string $outputPath): bool
    {
        // Dompdf has been removed in favor of client-side html2pdf generation.
        // Return false to indicate no server-side generation is available.
        return false;
    }
}

// ─── 4. GLOBAL FUNCTION WRAPPERS ─────────────────────────────────────────────
if (!function_exists('sendEmail')) {
    function sendEmail(string $to, string $subject, string $body, array $attachments = [], string $altBody = ''): array
    {
        return EmailHelper::sendEmail($to, $subject, $body, $attachments, $altBody);
    }
}

if (!function_exists('sendTicketEmail')) {
    function sendTicketEmail(string $to, string $userName, string $eventName, string $barcode, string $pdfPath = ''): array
    {
        return EmailHelper::sendTicketEmail($to, $userName, $eventName, $barcode, $pdfPath);
    }
}

if (!function_exists('sendTicketEmailFull')) {
    function sendTicketEmailFull(string $to, array $ticketData, string|array $pdfPath = ''): array
    {
        return EmailHelper::sendTicketEmailFull($to, $ticketData, $pdfPath);
    }
}

if (!function_exists('_detailCell')) {
    function _detailCell(string $label, string $value, string $class = ''): string
    {
        $classAttr = $class !== '' ? ' ' . htmlspecialchars($class, ENT_QUOTES, 'UTF-8') : '';
        $safeLabel = htmlspecialchars($label, ENT_QUOTES, 'UTF-8');
        return '<div class="detail-item' . $classAttr . '">'
            . '<span class="detail-label">' . $safeLabel . '</span>'
            . '<span class="detail-value">' . $value . '</span>'
            . '</div>';
    }
}