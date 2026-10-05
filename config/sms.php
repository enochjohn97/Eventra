<?php
// Brevo SMS integration configuration.
require_once __DIR__ . '/env-loader.php';

define('BREVO_SMS_DISABLED', empty($_ENV['BREVO_API_KEY']));
define('BREVO_API_KEY', $_ENV['BREVO_API_KEY'] ?? '');
define('BREVO_SMS_SENDER', $_ENV['BREVO_SMS_SENDER'] ?? 'EventOut');
define('BREVO_SMS_URL', 'https://api.brevo.com/v3/transactionalSMS/sms');

function isSmsEnabled(): bool
{
    return !BREVO_SMS_DISABLED;
}
?>