<?php

/**
 * Receive Email Webhook
 *
 * Accepts inbound-email notifications from a mail provider.
 * Protected by a shared secret: the provider must send
 *   X-Webhook-Secret: <GOOGLE_WEBHOOK_SECRET or CRON_SECRET from .env>
 * or ?secret=... — requests without a valid secret are rejected with 401.
 */

header('Content-Type: application/json');

require_once __DIR__ . '/../../config/env-loader.php';

$expected = ($_ENV['GOOGLE_WEBHOOK_SECRET'] ?? getenv('GOOGLE_WEBHOOK_SECRET') ?: '')
    ?: ($_ENV['CRON_SECRET'] ?? getenv('CRON_SECRET') ?: '');

$provided = $_SERVER['HTTP_X_WEBHOOK_SECRET'] ?? ($_GET['secret'] ?? '');

if ($expected === '' || !is_string($provided) || !hash_equals($expected, $provided)) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Unauthorized webhook call.']);
    exit;
}

// Log the received email for now
$input = file_get_contents('php://input');
$logPath = __DIR__ . '/../../logs/inbound_emails.log';
$logDir = dirname($logPath);
if (!is_dir($logDir)) {
    @mkdir($logDir, 0755, true);
}
if (is_dir($logDir) && is_writable($logDir)) {
    $log_msg = "[" . date('Y-m-d H:i:s') . "] Inbound Email Webhook: " . substr((string) $input, 0, 10000) . PHP_EOL;
    @file_put_contents($logPath, $log_msg, FILE_APPEND);
}

echo json_encode(['success' => true, 'message' => 'Webhook received and logged']);
