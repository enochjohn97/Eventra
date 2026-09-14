<?php

declare(strict_types=1);

/**
 * Deterministic regression checks for the security fixes in this audit.
 * Run: php tests/security-audit.php
 * Optional safe probe: php tests/security-audit.php --live
 */

$root = dirname(__DIR__);
$failures = [];
$passed = 0;

$check = static function (string $name, bool $condition) use (&$failures, &$passed): void {
    if ($condition) {
        $passed++;
        echo "PASS  {$name}\n";
    } else {
        $failures[] = $name;
        echo "FAIL  {$name}\n";
    }
};

$read = static fn (string $relative): string => (string) file_get_contents($root . DIRECTORY_SEPARATOR . $relative);

$envLoader = $read('config/env-loader.php');
$smsConfig = $read('config/sms.php');
$smsHelper = $read('includes/helpers/sms-helper.php');
$otpService = $read('includes/helpers/otp-service.php');
$smsOtp = $read('api/otps/send-sms-otp.php');
$reset = $read('api/auth/reset-password-otp.php');
$logger = $read('api/utils/log-error.php');
$auth = $read('includes/middleware/auth.php');

$check('example environment is never loaded at runtime', !str_contains($envLoader, "fallback = __DIR__ . '/../.env.example'"));
$check('SMS integration is Brevo-only', !preg_match('/TERMII|Termii|termii/', $smsConfig . $smsHelper));
$check('Brevo SMS endpoint and 201 handling are configured', str_contains($smsConfig, 'transactionalSMS/sms') && str_contains($smsHelper, '$httpCode === 201'));
$check('SMS payload uses recipient/content', str_contains($smsHelper, "'recipient'") && str_contains($smsHelper, "'content'"));
$check('OTP delivery is not skipped', str_contains($otpService, 'sendSMS($normalizedPhone') && !str_contains($otpService, 'Delivery is intentionally skipped'));
$check('standalone SMS OTP requires POST and normalized validation', str_contains($smsOtp, "\$_SERVER['REQUEST_METHOD'] !== 'POST'") && str_contains($smsOtp, 'validatePhoneNumber'));
$check('password reset requires a reset token', str_contains($reset, "reset_token") && str_contains($reset, "type = 'reset_password'"));
$check('password reset revokes tokens', str_contains($reset, 'revoked = 1'));
$check('frontend logs are bounded and sanitized', str_contains($logger, '16384') && str_contains($logger, 'str_replace') && str_contains($logger, 'mb_substr'));
$check('auth errors do not expose debug_info', !str_contains($auth, "'debug_info'"));
$check('requested auth background is present', str_contains($read('public/css/login-style.css'), '#11111a'));

if (in_array('--live', $argv, true)) {
    $url = 'https://eventra-website.liveblog365.com/public/pages/index.html';
    $context = stream_context_create(['http' => ['method' => 'GET', 'timeout' => 10, 'ignore_errors' => true]]);
    $body = @file_get_contents($url, false, $context);
    $status = $http_response_header[0] ?? '';
    $check('live homepage responds', $body !== false && preg_match('/\s2\d\d\s/', $status) === 1);
    echo "INFO  Live authenticated/provider tests require approved staging accounts and credentials.\n";
}

echo "\n{$passed} checks passed; " . count($failures) . " failed.\n";
exit($failures ? 1 : 0);