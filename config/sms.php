<?php
// Termii Integration Config + Validation
require_once __DIR__ . '/env-loader.php';

// Validate required env vars
if (empty($_ENV['TERMII_API_KEY']) || empty($_ENV['TERMII_SENDER_ID'])) {
    error_log('[SMS Config] Termii credentials missing. Set TERMII_API_KEY, TERMII_SENDER_ID in .env');
    define('TERMII_SMS_DISABLED', true);
} else {
    define('TERMII_SMS_DISABLED', false);
}

define('TERMII_API_KEY', $_ENV['TERMII_API_KEY'] ?? '');
define('TERMII_SENDER_ID', $_ENV['TERMII_SENDER_ID'] ?? 'Eventra');

// Termii API URL
define('TERMII_SMS_URL', 'https://api.ng.termii.com/api/sms/send');

// Usage check helper
function isSmsEnabled()
{
    return !defined('TERMII_SMS_DISABLED') || !TERMII_SMS_DISABLED;
}
?>