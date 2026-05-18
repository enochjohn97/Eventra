<?php
// Application configuration
require_once __DIR__ . '/env-loader.php';

// Secret key used to sign QR code tokens (prevents forgery)
// Must be set in .env via QR_SECRET variable
$qr_secret = $_ENV['QR_SECRET'] ?? getenv('QR_SECRET');
if (empty($qr_secret)) {
    error_log('[CONFIG] WARNING: QR_SECRET not set in environment. QR codes may not verify correctly.');
    $qr_secret = 'CHANGE_ME_IN_PRODUCTION_' . random_bytes(16);
}
define('QR_SECRET', $qr_secret);

// Application base URL (resolved in env-loader for local vs production)
if (!defined('APP_URL')) {
    if (function_exists('resolveAppUrl')) {
        define('APP_URL', resolveAppUrl());
    } elseif (defined('SITE_URL')) {
        define('APP_URL', SITE_URL);
    } else {
        define('APP_URL', rtrim($_ENV['APP_URL'] ?? 'http://localhost:8000', '/'));
    }
}
