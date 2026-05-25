<?php
// Sendchamp Integration Config + Validation
require_once __DIR__ . '/env-loader.php';

// Validate required env vars
if (empty($_ENV['SENDCHAMP_SECRET_KEY']) || empty($_ENV['SENDCHAMP_SENDER_ID'])) {
    error_log('[SMS Config] Sendchamp credentials missing. Set SENDCHAMP_SECRET_KEY, SENDCHAMP_SENDER_ID in .env');
    define('SENDCHAMP_SMS_DISABLED', true);
} else {
    define('SENDCHAMP_SMS_DISABLED', false);
}

define('SENDCHAMP_SECRET_KEY', $_ENV['SENDCHAMP_SECRET_KEY'] ?? '');
define('SENDCHAMP_SENDER_ID', $_ENV['SENDCHAMP_SENDER_ID'] ?? 'Eventra');

// Sendchamp API URL
define('SENDCHAMP_SMS_URL', 'https://api.sendchamp.com/api/v1/sms/send');

// Usage check helper
function isSmsEnabled()
{
    return !defined('SENDCHAMP_SMS_DISABLED') || !SENDCHAMP_SMS_DISABLED;
}
?>