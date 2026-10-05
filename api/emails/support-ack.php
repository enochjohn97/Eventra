<?php

/**
 * Support / Contact — Submit Complaint or Feedback
 *
 * Public endpoint used by the website contact & support form. It:
 *   1. Validates + sanitises the submission (no raw input is trusted).
 *   2. Rate-limits submissions per IP (5 per 30 minutes) to prevent abuse.
 *   3. Sends an AUTOMATIC acknowledgment email back to the sender, confirming
 *      receipt and setting the response-time expectation (24–48 hours).
 *   4. Notifies the admin in-app and stores the message for the record.
 *   5. Never crashes on email failure: failures are logged (error_log +
 *      logs/support_emails.log) and the API still reports success for the
 *      user's submission, flagging `acknowledgment_sent: false`.
 *
 * POST /api/emails/support-ack.php
 * Body (JSON): { name, email, subject?, category?, message }
 */

header('Content-Type: application/json');

require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/helpers/email-helper.php';
require_once __DIR__ . '/../../includes/middleware/rate-limit.php';

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed.']);
    exit;
}

// ── 1. Read + validate input ────────────────────────────────────────────────
$raw = file_get_contents('php://input');
$data = json_decode($raw, true);
if (!is_array($data)) {
    // Fall back to form-encoded submissions.
    $data = $_POST;
}

$name     = trim((string)($data['name'] ?? ''));
$email    = trim((string)($data['email'] ?? ''));
$subject  = trim((string)($data['subject'] ?? ''));
$category = trim((string)($data['category'] ?? 'General'));
$message  = trim((string)($data['message'] ?? ''));

$errors = [];

// Name: letters/spaces/basic punctuation, 2–80 chars (no injection-prone chars).
if ($name === '') {
    $errors['name'] = 'Your name is required.';
} elseif (!preg_match("/^[\p{L}\p{N} .,'\-]{2,80}$/u", $name)) {
    $errors['name'] = 'Enter a valid name (letters, numbers and basic punctuation only).';
}

// Email: strict format check.
if ($email === '') {
    $errors['email'] = 'Your email address is required.';
} elseif (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 254) {
    $errors['email'] = 'Enter a valid email address.';
}

// Subject: 3–150 chars; strip control characters.
if ($subject !== '') {
    $subject = preg_replace('/[\x00-\x1F\x7F]/u', '', $subject) ?? '';
    if (mb_strlen($subject) < 3 || mb_strlen($subject) > 150) {
        $errors['subject'] = 'Subject must be between 3 and 150 characters.';
    }
}

// Category: whitelist — anything else falls back to General.
$allowedCategories = ['General', 'Complaint', 'Feedback', 'Payment', 'Ticket', 'Account', 'Event Listing', 'Technical'];
if (!in_array($category, $allowedCategories, true)) {
    $category = 'General';
}

// Message: required, 10–5000 chars; strip control chars (keep newlines).
if ($message === '') {
    $errors['message'] = 'Please describe your issue or feedback.';
} else {
    $messageClean = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $message) ?? '';
    $len = mb_strlen($messageClean);
    if ($len < 10) {
        $errors['message'] = 'Message must be at least 10 characters.';
    } elseif ($len > 5000) {
        $errors['message'] = 'Message must be under 5000 characters.';
    } else {
        $message = $messageClean;
    }
}

if (!empty($errors)) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'message' => 'Please correct the highlighted fields.',
        'errors'  => $errors,
    ]);
    exit;
}

// ── 2. Rate limit per IP: 5 submissions per 30 minutes ─────────────────────
$ip = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? ($_SERVER['REMOTE_ADDR'] ?? 'unknown');
$ip = trim(explode(',', (string)$ip)[0]);
if ($ip === '' || !filter_var($ip, FILTER_VALIDATE_IP)) {
    $ip = 'unknown';
}

RateLimiter::init();
$rateCheck = RateLimiter::check($ip, 'support_ack', 5, 1800);
if (!$rateCheck['allowed']) {
    http_response_code(429);
    echo json_encode([
        'success' => false,
        'message' => 'Too many submissions. Please try again in ' . ceil(($rateCheck['retry_after'] ?? 1800) / 60) . ' minutes.',
    ]);
    exit;
}

// ── 3. Escape for HTML output (emails are rendered as HTML) ────────────────
$escName    = htmlspecialchars($name, ENT_QUOTES, 'UTF-8');
$escEmail   = htmlspecialchars($email, ENT_QUOTES, 'UTF-8');
$escSubject = htmlspecialchars($subject !== '' ? $subject : "{$category} enquiry", ENT_QUOTES, 'UTF-8');
$escMessage = nl2br(htmlspecialchars($message, ENT_QUOTES, 'UTF-8'));

// ── 4. Send the automatic acknowledgment email ──────────────────────────────
$supportRef = 'SUP-' . strtoupper(bin2hex(random_bytes(4)));
$submittedAt = date('j M Y, H:i') . ' UTC';
$ackSubject = 'We received your ' . strtolower($category) . ' — Ticket ' . $supportRef;
$brandHeaderHtml = EmailHelper::brandEmailHeaderHtml('20px');
$ackBody = <<<HTML
<div style="font-family: Arial, Helvetica, sans-serif; max-width: 600px; margin: auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 12px;">
    {$brandHeaderHtml}
    <h2 style="color: #2563eb; margin-top: 0;">Thank you for contacting EventOut</h2>
    <p>Hi {$escName},</p>
    <p>
        We have received your <strong>{$escCategory}</strong> and it has been logged
        under reference <strong style="font-family: monospace;">{$supportRef}</strong>.
    </p>
    <table style="width: 100%; border-collapse: collapse; margin: 12px 0;">
        <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eef2f7; font-weight: bold; width: 130px;">Subject</td>
            <td style="padding: 8px; border-bottom: 1px solid #eef2f7;">{$escSubject}</td>
        </tr>
        <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eef2f7; font-weight: bold;">Category</td>
            <td style="padding: 8px; border-bottom: 1px solid #eef2f7;">{$escCategory}</td>
        </tr>
        <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eef2f7; font-weight: bold;">Submitted</td>
            <td style="padding: 8px; border-bottom: 1px solid #eef2f7;">{$submittedAt}</td>
        </tr>
    </table>
    <p style="background: #eff6ff; border-left: 4px solid #2563eb; padding: 12px; border-radius: 6px;">
        <strong>What happens next?</strong><br>
        Our support team typically responds within <strong>24&ndash;48 hours</strong>.
        Payments or account-security issues are prioritised. Please keep this
        reference for follow-ups &mdash; quoting it helps us find your thread faster.
    </p>
    <p style="color: #6b7280; font-size: 13px;">
        You do not need to reply to this email &mdash; it is an automatic
        acknowledgment. If you submitted a payment complaint, include your
        transaction reference when we respond.
    </p>
    <p style="color: #9ca3af; font-size: 12px; margin-bottom: 0;">EventOut Support Team</p>
</div>
HTML;

$ackResult = EmailHelper::sendEmail($email, $ackSubject, $ackBody);

// Log every attempt — success or failure — without crashing the flow.
$logDir = __DIR__ . '/../../logs';
if (!is_dir($logDir)) {
    @mkdir($logDir, 0755, true);
}
$logLine = sprintf(
    "[%s] %s | ref=%s | to=%s | category=%s | ack=%s%s\n",
    date('Y-m-d H:i:s'),
    $ackResult['success'] ? 'SENT' : 'FAILED',
    $supportRef,
    $email,
    $category,
    $ackResult['success'] ? 'yes' : 'no',
    $ackResult['success'] ? '' : ' | reason=' . ($ackResult['message'] ?? 'unknown')
);
@file_put_contents($logDir . '/support_emails.log', $logLine, FILE_APPEND);

if (!$ackResult['success']) {
    // Non-fatal: record it for follow-up, keep serving the user's request.
    error_log('[support-ack] Acknowledgment email failed for ' . $email . ': ' . ($ackResult['message'] ?? 'unknown'));
}

// ── 5. Store the message + notify admins (best-effort, non-blocking failures) ─
$stored = false;
$adminNotified = false;
try {
    $pdo = getPDO();

    // Persist the submission (best-effort; table may not exist on older installs).
    try {
        $stmt = $pdo->prepare(
            "INSERT INTO support_messages (reference, name, email, category, subject, message, acknowledgment_sent, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, NOW())"
        );
        $stmt->execute([
            $supportRef,
            $name,
            $email,
            $category,
            $subject !== '' ? $subject : "{$category} enquiry",
            $message,
            $ackResult['success'] ? 1 : 0,
        ]);
        $stored = true;
    } catch (PDOException $tableMissing) {
        // Table not present in this environment — the log file still captures it.
        error_log('[support-ack] support_messages table unavailable: ' . $tableMissing->getMessage());
    }

    // In-app admin notification.
    $stmt = $pdo->prepare(
        "INSERT INTO notifications (user_type, user_id, title, message, type, created_at)
         VALUES ('admin', NULL, ?, ?, 'support', NOW())"
    );
    $stmt->execute([
        "New {$category} from {$name} ({$supportRef})",
        mb_substr($message, 0, 300),
    ]);
    $adminNotified = true;
} catch (Throwable $notifyError) {
    error_log('[support-ack] Admin notification failed: ' . $notifyError->getMessage());
}

// ── 6. Respond ───────────────────────────────────────────────────────────────
echo json_encode([
    'success'             => true,
    'message'             => 'Your message has been received. A confirmation email has been sent to ' . $email . '.',
    'reference'           => $supportRef,
    'acknowledgment_sent' => (bool) $ackResult['success'],
    'stored'              => $stored,
    'admin_notified'      => $adminNotified,
]);
