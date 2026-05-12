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
    $GLOBALS['EVENTRA_AUTOLOADER_ERROR'];
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
        string $altBody = ''
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
     * Cap the image at 200 KB after encoding to keep email under Gmail's 102 KB clip limit.
     */
    private static function imageToDataUri(string $path, int $maxBytes = 200000): string
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

        if (!file_exists($localPath)) {
            if (!preg_match('/^[a-zA-Z]:/', $localPath)) {
                $projectRoot = rtrim(self::normalisePath(__DIR__ . '/../../'), '/');
                // Guard: check if path already starts with projectRoot
                if (strpos($localPath, $projectRoot) !== 0) {
                    $localPath = $projectRoot . '/' . ltrim($localPath, '/');
                }
            }
        }

        if (!file_exists($localPath)) {
            error_log("[EmailHelper] imageToDataUri: file not found: {$path}");
            return '';
        }

        $data = @file_get_contents($localPath);
        if ($data === false || $data === '') {
            return '';
        }

        if (strlen($data) > $maxBytes) {
            // Try to resize/compress using GD if available
            $resized = self::resizeImageData($data, $localPath, 600, 300);
            if ($resized !== '') {
                $data = $resized;
            } else {
                error_log("[EmailHelper] imageToDataUri: local image too large (" . strlen($data) . " bytes), skipping.");
                return '';
            }
        }

        $mime = self::guessMime($localPath);
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
            imagejpeg($dst, null, 82);
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
     * Generate QR code as a base64 data-URI.
     */
    private static function generateQrDataUri(array $ticketData, string $staticPath = '', bool $forceRemote = false): string
    {
        if (!$forceRemote && !empty($ticketData['qr_base64'])) {
            $b64 = $ticketData['qr_base64'];
            if (!str_starts_with($b64, 'data:')) {
                $b64 = 'data:image/png;base64,' . $b64;
            }
            return $b64;
        }

        $payload = self::buildQrPayload($ticketData);

        // For emails, remote URL (Google Charts) is often more reliable than base64
        if ($forceRemote) {
            return 'https://chart.googleapis.com/chart?cht=qr&chs=300x300&chld=H|2&chl=' . urlencode($payload);
        }

        // Strategy A: chillerlan/php-qrcode (v5+)
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
                return $qr->render($payload);
            } catch (\Throwable $e) {
                error_log('[EmailHelper] chillerlan/php-qrcode failed: ' . $e->getMessage());
            }
        }

        // Strategy B: endroid/qr-code (v4+)
        if (class_exists('Endroid\QrCode\QrCode')) {
            try {
                if (class_exists('Endroid\QrCode\Builder\Builder')) {
                    $result = \Endroid\QrCode\Builder\Builder::create()
                        ->writer(new \Endroid\QrCode\Writer\PngWriter())
                        ->data($payload)
                        ->encoding(new \Endroid\QrCode\Encoding\Encoding('UTF-8'))
                        ->errorCorrectionLevel(new \Endroid\QrCode\ErrorCorrectionLevel\ErrorCorrectionLevelHigh())
                        ->size(300)
                        ->margin(10)
                        ->foregroundColor(new \Endroid\QrCode\Color\Color(0, 0, 0))
                        ->backgroundColor(new \Endroid\QrCode\Color\Color(255, 255, 255))
                        ->build();
                    return $result->getDataUri();
                }

                $qrCode = \Endroid\QrCode\QrCode::create($payload)
                    ->setEncoding(new \Endroid\QrCode\Encoding\Encoding('UTF-8'))
                    ->setErrorCorrectionLevel(new \Endroid\QrCode\ErrorCorrectionLevel\ErrorCorrectionLevelHigh())
                    ->setSize(300)
                    ->setMargin(10)
                    ->setForegroundColor(new \Endroid\QrCode\Color\Color(0, 0, 0))
                    ->setBackgroundColor(new \Endroid\QrCode\Color\Color(255, 255, 255));

                $writer = new \Endroid\QrCode\Writer\PngWriter();
                $result = $writer->write($qrCode);
                return $result->getDataUri();
            } catch (\Throwable $e) {
                error_log('[EmailHelper] endroid/qr-code failed: ' . $e->getMessage());
            }
        }

        // Final fallback: Google Charts
        return 'https://chart.googleapis.com/chart?cht=qr&chs=300x300&chld=H|2&chl=' . urlencode($payload);
    }

    private static function buildQrPayload(array $d): string
    {
        $parts = [
            'TICKET:' . ($d['barcode'] ?? $d['ticket_id'] ?? ''),
            'EVENT:' . ($d['event_name'] ?? ''),
            'DATE:' . ($d['event_date'] ?? ''),
            'VENUE:' . ($d['address'] ?? ''),
            'HOLDER:' . ($d['user_name'] ?? ''),
            'USER_ID:' . ($d['user_id'] ?? ''),
            'EVENT_ID:' . ($d['event_id'] ?? ''),
            'ORDER_ID:' . ($d['order_id'] ?? ''),
            'TYPE:' . ($d['ticket_type'] ?? ''),
            'AMOUNT:' . ($d['amount'] ?? '0'),
            'STATUS:' . (isset($d['amount']) && (float) $d['amount'] <= 0 ? 'FREE' : 'PAID'),
            'VERIFY:' . strtoupper(substr(sha1(($d['barcode'] ?? '') . ($d['user_id'] ?? '')), 0, 10)),
        ];

        return implode('|', array_filter($parts, static fn($p) => $p !== substr($p, 0, strpos($p, ':') + 1)));
    }

    private static function detailRow(string $label, string $value, bool $priceStyle = false): string
    {
        $valueStyle = $priceStyle
            ? 'font-family:Arial,sans-serif;font-size:17px;font-weight:800;color:#ffffff;line-height:1.2;display:block;'
            : 'font-family:Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;line-height:1.2;display:block;';

        return '<div style="margin-bottom:14px;word-break:break-word;">'
            . '<span style="display:block;font-family:Arial,sans-serif;'
            . 'font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;'
            . 'color:#ffffff;margin-bottom:3px;">'
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
        string $downloadUrl = '',
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
            $ticketData['qr_path'] ?? ''
        );

        // For emails (not forPdf), use remote URL for QR code as Gmail blocks base64
        $qrSrc = self::generateQrDataUri($ticketData, $staticQrPath, !$forPdf);

        if ($forPdf && str_starts_with($qrSrc, 'http')) {
            $ctx = stream_context_create(['http' => ['timeout' => 3]]);
            $data = @file_get_contents($qrSrc, false, $ctx);
            $qrSrc = ($data !== false && $data !== '')
                ? 'data:image/png;base64,' . base64_encode($data)
                : '';
        }

        if ($qrSrc !== '') {
            $safeQrSrc = htmlspecialchars($qrSrc, ENT_QUOTES, 'UTF-8');
            $qrHtml = "<img id=\"qrcode\" src=\"{$safeQrSrc}\" alt=\"QR Code\" width=\"80\" height=\"80\""
                . " style=\"width:80px;height:80px;display:block;\">";
        }

        if ($qrHtml === '') {
            // No physical fallback needed, buildHtml will handle it
            $qrHtml = '<div style="width:100px;height:100px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;text-align:center;line-height:100px;font-size:9px;color:#94a3b8;font-weight:700;">QR ERROR</div>';
        }

        if ($qrHtml === '') {
            $qrHtml = '<div style="width:150px;height:150px;background:#333;'
                . 'text-align:center;line-height:150px;font-size:10px;color:#888;">'
                . 'NO QR</div>';
        }

        /* ── Event banner image ──────────────────────────── */
        $imgRaw = trim((string) ($ticketData['event_image'] ?? ''));
        $imgBase64 = ''; // Initialize

        if (!$forPdf) {
            // FOR EMAIL: Use absolute URL to keep HTML size small (<80KB)
            $safeImgSrc = htmlspecialchars(self::pathToUrl($imgRaw), ENT_QUOTES, 'UTF-8');
            $eventImgHtml = "<img src=\"{$safeImgSrc}\" alt=\"Event\" "
                . "style=\"width:100%;height:180px;object-fit:cover;display:block;\">";
        } else {
            // FOR PDF: Use base64 for reliable local rendering
            $imgBase64 = self::imageToDataUri($imgRaw, 500000);
            if ($imgBase64 !== '') {
                $safeImgSrc = htmlspecialchars($imgBase64, ENT_QUOTES, 'UTF-8');
                $eventImgHtml = "<img src=\"{$safeImgSrc}\" alt=\"Event\" "
                    . "style=\"width:100%;height:180px;object-fit:cover;display:block;\">";
            } else {
                $eventImgHtml = '<div style="width:100%;height:180px;background:#0f3460;text-align:center;line-height:180px;">'
                    . '<span style="font-size:11px;letter-spacing:3px;color:rgba(212,175,55,0.6);text-transform:uppercase;">EVENT</span>'
                    . '</div>';
            }
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
        $colA = self::detailRow('Date', $eventDate);
        $colA .= self::detailRow('Time', $eventTime);

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
            $colA .= '<div style="margin-bottom:14px;word-break:break-word;">'
                . '<span style="display:block;font-family:Arial,sans-serif;font-size:9px;'
                . 'font-weight:700;letter-spacing:2px;text-transform:uppercase;'
                . 'color:#ffffff;margin-bottom:6px;">Venue &amp; Location</span>';
            foreach ($locations as $loc) {
                $s = self::esc($loc['state'] ?? '');
                $a = self::esc($loc['address'] ?? '');

                // Typography for Location blocks
                $stateStyle = 'font-family:Arial,sans-serif;font-size:16px;font-weight:700;color:#ffffff;line-height:1.3;display:block;';
                $addrStyle = 'font-family:Arial,sans-serif;font-size:13px;font-weight:400;color:#ffffff;line-height:1.4;display:block;';

                $colA .= '<div style="margin-bottom:12px;">'
                    . '<span style="' . $stateStyle . '">' . $s . '</span>'
                    . '<span style="' . $addrStyle . '">' . $a . '</span>'
                    . '</div>';
            }
            $colA .= '</div>';
        } else {
            $st = $ticketData['state'] ?? '';
            $ad = $ticketData['address'] ?? ($ticketData['location'] ?? '—');
            if (!empty($st) && strtolower($st) !== 'all states') {
                $colA .= '<div style="margin-bottom:14px;word-break:break-word;">'
                    . '<span style="display:block;font-family:Arial,sans-serif;font-size:9px;'
                    . 'font-weight:700;letter-spacing:2px;text-transform:uppercase;'
                    . 'color:#ffffff;margin-bottom:6px;">Venue &amp; Location</span>'
                    . '<div style="margin-bottom:12px;">'
                    . '<span style="font-family:Arial,sans-serif;font-size:16px;font-weight:700;color:#ffffff;display:block;">'
                    . self::esc($st) . '</span>'
                    . '<span style="font-family:Arial,sans-serif;font-size:13px;font-weight:400;color:#ffffff;display:block;">'
                    . self::esc($ad) . '</span>'
                    . '</div></div>';
            } else {
                $colA .= self::detailRow('Venue', self::esc($ad));
                if (!empty($st)) {
                    $colA .= self::detailRow('Location', self::esc($st));
                }
            }
        }

        $colB = '';
        if ($tickDisp !== '' || $ticketType !== '') {
            $colB .= self::detailRow('Ticket Type', $tickDisp ?: $ticketType);
        }
        if ($amountDisplay !== '') {
            $colB .= self::detailRow('Amount Paid', $amountDisplay, true);
        }
        // Quantity bought
        $qtyBought = isset($ticketData['quantity']) ? (int) $ticketData['quantity'] : 1;
        $colB .= self::detailRow('Qty', (string) $qtyBought);
        if ($organizer !== '') {
            $colB .= self::detailRow('Organizer', $organizer);
        }

        // Event Image for Background
        $bgImage = $forPdf ? $imgBase64 : self::pathToUrl($imgRaw);

        /* ── Download button removed from email view as requested ── */
        $dlButtonHtml = '';

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
        return <<<HTML
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Ticket &mdash; {$eventTitle}</title>
</head>
<body style="margin:0;padding:40px 10px;background-color:#ffffff;font-family:Arial,'Helvetica Neue',Helvetica,sans-serif;">

<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation">
<tr><td align="center">

  <table width="700" cellpadding="0" cellspacing="0" border="0" role="presentation"
         background="{$bgImage}"
         style="max-width:700px;background-color:#111111;background-image:url('{$bgImage}');background-size:cover;background-position:center;border-radius:20px;overflow:hidden;border:none;">
  <tr>
    <td valign="top" style="padding:0;margin:0;border:none;">
      
      <div style="background: rgba(0,0,0,0.7); width:100%; min-height:360px;">
        
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="padding:30px;">
          <tr>
            <td valign="top">
              <div style="display:inline-block;font-family:Impact,'Arial Narrow',Arial,sans-serif;font-size:12px;letter-spacing:4px;color:#d4af37;border:1px solid #d4af37;padding:4px 12px;margin-bottom:15px;text-transform:uppercase;">LIVE CONCERT</div>
              <div style="font-family:Impact,'Arial Narrow',Arial,sans-serif;font-size:36px;line-height:1;color:#ffffff;text-transform:uppercase;margin-bottom:10px;">{$eventTitle}</div>
              {$badgeHtml}
            </td>
            <td valign="top" align="right">
              <div style="font-family:Arial,sans-serif;font-size:22px;font-weight:900;color:#ffffff;letter-spacing:-1px;">EVENTRA</div>
            </td>
          </tr>
          <tr>
            <td valign="top" style="padding-top:20px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td width="50%" valign="top">{$colA}</td>
                  <td width="50%" valign="top">{$colB}</td>
                </tr>
              </table>
            </td>
            <td valign="bottom" align="right" style="padding-top:20px;">
              <table cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border-radius:10px;padding:8px;margin-bottom:8px;">
                <tr><td align="center" valign="middle">{$qrHtml}</td></tr>
              </table>
              <div style="font-family:'Courier New',Courier,monospace;font-size:10px;font-weight:700;color:#ffffff;">{$barcode}</div>
            </td>
          </tr>
          <tr>
            <td colspan="2" style="padding-top:25px;border-top:1px solid rgba(255,255,255,0.15);">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td>
                    <div style="font-family:Arial,sans-serif;font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#ffffff;margin-bottom:4px;">Ticket Holder</div>
                    <div style="font-family:Arial,sans-serif;font-size:18px;font-weight:800;color:#ffffff;">{$userName}</div>
                  </td>
                  <td align="right">
                    <div style="font-family:Arial,sans-serif;font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#ffffff;margin-bottom:4px;">Ticket ID</div>
                    <div style="font-family:'Courier New',Courier,monospace;font-size:12px;font-weight:700;color:#ffffff;">{$ticketId}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>

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
        $bgStyle = $bgImage ? "background-image: url('{$bgImage}');" : "background-color: #111;";

        return <<<PDF
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Ticket — {$eventTitle}</title>
<style>
  @page { size: 800px 380px; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: 800px; height: 380px;
    font-family: 'Helvetica', 'Arial', sans-serif;
    background: #000;
    color: #fff;
    overflow: hidden;
  }
  .ticket {
    width: 800px; height: 380px;
    position: relative;
    overflow: hidden;
    {$bgStyle}
    background-size: cover;
    background-position: center;
    background-repeat: no-repeat;
  }
  .overlay {
    position: absolute;
    top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0,0,0,0.7);
  }
  .content {
    position: relative;
    z-index: 10;
    padding: 35px 45px;
    height: 100%;
  }
  .header-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 20px;
  }
  .event-title {
    font-size: 38px;
    font-weight: 900;
    text-transform: uppercase;
    line-height: 1.1;
    margin-bottom: 10px;
    color: #fff;
    max-width: 550px;
  }
  .brand {
    font-size: 24px;
    font-weight: 900;
    color: #fff;
    letter-spacing: -1px;
  }
  .details-container {
    display: flex;
    justify-content: space-between;
    margin-top: 20px;
  }
  .details-columns {
    width: 550px;
  }
  .label {
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 2px;
    color: rgba(255,255,255,0.7);
    margin-bottom: 4px;
    font-weight: 700;
  }
  .value {
    font-size: 15px;
    font-weight: 700;
    color: #fff;
    margin-bottom: 12px;
  }
  .qr-section {
    text-align: right;
  }
  .qr-code {
    background: #fff;
    padding: 8px;
    border-radius: 8px;
    display: inline-block;
    margin-bottom: 8px;
  }
  .qr-code img {
    width: 80px;
    height: 80px;
  }
  .footer-row {
    position: absolute;
    bottom: 35px;
    left: 45px;
    right: 45px;
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    padding-top: 20px;
    border-top: 1px solid rgba(255,255,255,0.2);
  }
  .holder-name {
    font-size: 22px;
    font-weight: 800;
    color: #fff;
  }
</style>
</head>
<body>
<div class="ticket">
  <div class="overlay"></div>
  
  <div class="content">
    <div class="header-row">
      <div>
        <div style="margin-bottom: 15px;">{$badgeHtml}</div>
        <div class="event-title">{$eventTitle}</div>
      </div>
      <div class="brand">EVENTRA</div>
    </div>
    
    <div class="details-container">
      <div class="details-columns">
        <table width="100%">
          <tr>
            <td width="50%" valign="top">{$colA}</td>
            <td width="50%" valign="top">{$colB}</td>
          </tr>
        </table>
      </div>
      <div class="qr-section">
        <div class="qr-code">
          {$qrHtml}
        </div>
        <div style="font-family:monospace; font-size:10px;">{$barcode}</div>
      </div>
    </div>

    <div class="footer-row">
      <div>
        <div class="label">Ticket Holder</div>
        <div class="holder-name">{$userName}</div>
      </div>
      <div style="text-align: right;">
        <div class="label">Ticket ID</div>
        <div class="value" style="font-family:monospace;">{$ticketId}</div>
      </div>
    </div>
  </div>
</div>
</body>
</html>
PDF;
    }

    // ── OTP email ─────────────────────────────────────────────────────────────

    public static function sendRegistrationOTP(string $to, string $name, string $otp): array
    {
        $subject = "=?UTF-8?B?" . base64_encode("Verify your Eventra account — OTP: {$otp}") . "?=";
        $safeName = htmlspecialchars($name, ENT_QUOTES, 'UTF-8');
        $year = date('Y');

        $body = <<<HTML
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:40px;
                    background:#ffffff;border-radius:16px;border:1px solid #f1f5f9;">
            <div style="text-align:center;margin-bottom:32px;">
                <h1 style="color:#2ecc71;margin:0;font-size:28px;font-weight:800;">Eventra</h1>
                <p style="color:#64748b;margin-top:8px;font-size:14px;">Bringing your events to life</p>
            </div>
            <h2 style="color:#1e293b;font-size:20px;font-weight:700;margin-bottom:16px;">Confirm your email address</h2>
            <p style="color:#475569;font-size:16px;line-height:1.6;margin-bottom:24px;">Hi <strong>{$safeName}</strong>,</p>
            <p style="color:#475569;font-size:16px;line-height:1.6;margin-bottom:32px;">
                Use the code below to verify your account. It expires in 15 minutes.
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
                            $ticketData = array_merge(
                                $ticketData,
                                array_filter($fresh, static fn($v) => $v !== null)
                            );
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

        /* ── 3. Download URL ─────────────────────────────────────── */
        $appUrl = rtrim((string) ($_ENV['APP_URL'] ?? ''), '/');
        $downloadUrl = '';
        if ($appUrl !== '' && $barcode !== '') {
            $candidate = $appUrl . '/api/tickets/download-ticket.php?code=' . urlencode($barcode);
            if (filter_var($candidate, FILTER_VALIDATE_URL)) {
                $downloadUrl = $candidate;
            }
        }

        /* ── 4. Build email HTML (optimised for email clients) ───── */
        $body = self::buildTicketHtml($ticketData, $downloadUrl, false);

        /* ── 5. Validate / regenerate PDF attachment ─────────────── */
        $attachments = [];
        $rawPaths = is_array($pdfPath) ? $pdfPath : [$pdfPath];

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
                    error_log("[EmailHelper] PDF regeneration failed, skipping attachment: {$path}");
                    continue;
                }
            }

            if (!in_array($path, $attachments, true)) {
                $attachments[] = $path;
            }
        }

        /* ── 6. Send ─────────────────────────────────────────────── */
        return self::sendEmail($to, $subject, $body, $attachments);
    }

    /**
     * Attempt to (re)generate a PDF at $outputPath using available PDF libraries.
     * Uses buildTicketHtml(..., forPdf: true) so rendering is always correct.
     *
     * Returns true if the PDF was written successfully.
     */
    public static function regeneratePdf(array $ticketData, string $outputPath): bool
    {
        // Build PDF-safe HTML
        $html = self::buildTicketHtml($ticketData, '', true);

        // ── Try DomPDF ──────────────────────────────────────────────────────
        if (class_exists('Dompdf\Dompdf')) {
            try {
                $options = new \Dompdf\Options();
                $options->set('isRemoteEnabled', true);
                $options->set('isHtml5ParserEnabled', true);
                $options->set('defaultFont', 'Arial');
                $options->set('isFontSubsettingEnabled', true);

                $dompdf = new \Dompdf\Dompdf($options);
                $dompdf->loadHtml($html, 'UTF-8');
                $dompdf->setPaper('A4', 'landscape');
                $dompdf->render();

                $output = $dompdf->output();
                if ($output !== null && strlen($output) > 1000) {
                    $written = file_put_contents($outputPath, $output);
                    if ($written !== false && $written > 0) {
                        return true;
                    }
                }
                error_log('[EmailHelper] DomPDF output was empty or write failed.');
            } catch (\Throwable $e) {
                error_log('[EmailHelper] DomPDF failed: ' . $e->getMessage());
            }
        }

        // ── Try mPDF ────────────────────────────────────────────────────────
        if (class_exists('Mpdf\Mpdf')) {
            try {
                $mpdf = new \Mpdf\Mpdf([
                    'orientation' => 'L',
                    'margin_top' => 0,
                    'margin_bottom' => 0,
                    'margin_left' => 0,
                    'margin_right' => 0,
                ]);
                $mpdf->WriteHTML($html);
                $mpdf->Output($outputPath, 'F');

                if (file_exists($outputPath) && filesize($outputPath) > 0) {
                    return true;
                }
            } catch (\Throwable $e) {
                error_log('[EmailHelper] mPDF failed: ' . $e->getMessage());
            }
        }

        // ── Try wkhtmltopdf via shell ────────────────────────────────────────
        $wkPath = trim((string) shell_exec('which wkhtmltopdf 2>/dev/null'));
        if ($wkPath !== '' && is_executable($wkPath)) {
            try {
                $tmpHtml = sys_get_temp_dir() . '/eventra_ticket_' . uniqid() . '.html';
                file_put_contents($tmpHtml, $html);
                $cmd = escapeshellcmd($wkPath)
                    . ' --orientation Landscape --page-size A4'
                    . ' --no-background --quiet'
                    . ' ' . escapeshellarg($tmpHtml)
                    . ' ' . escapeshellarg($outputPath)
                    . ' 2>/dev/null';
                shell_exec($cmd);
                @unlink($tmpHtml);

                if (file_exists($outputPath) && filesize($outputPath) > 0) {
                    return true;
                }
            } catch (\Throwable $e) {
                error_log('[EmailHelper] wkhtmltopdf failed: ' . $e->getMessage());
            }
        }

        error_log('[EmailHelper] regeneratePdf: no PDF library available (DomPDF / mPDF / wkhtmltopdf).');
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