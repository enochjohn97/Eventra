<?php
// Application configuration
require_once __DIR__ . '/env-loader.php';

// Secret key used to sign QR code tokens (prevents forgery)
// Must be set in .env via QR_SECRET variable.
$qr_secret = $_ENV['QR_SECRET'] ?? getenv('QR_SECRET');
if (empty($qr_secret)) {
    // Stable per-environment fallback: derive + persist ONCE so signatures
    // survive across requests. The previous random-per-request fallback broke
    // QR validation because every request generated a different key.
    $secretFile = __DIR__ . '/../logs/.qr_secret';
    if (file_exists($secretFile) && filesize($secretFile) > 0) {
        $qr_secret = trim((string) file_get_contents($secretFile));
    }
    if (empty($qr_secret)) {
        $qr_secret = bin2hex(random_bytes(32));
        @file_put_contents($secretFile, $qr_secret, LOCK_EX);
        error_log('[CONFIG] QR_SECRET not set in environment. Generated and persisted a stable fallback at logs/.qr_secret — set QR_SECRET in .env for production.');
    }
}
define('QR_SECRET', $qr_secret);

// Application base URL (resolved in env-loader for local vs production)
if (!defined('APP_URL')) {
    if (function_exists('resolveAppUrl')) {
        define('APP_URL', resolveAppUrl());
    } elseif (defined('SITE_URL')) {
        define('APP_URL', SITE_URL);
    } else {
        define('APP_URL', rtrim($_ENV['APP_URL'] ?? 'http://localhost:8080', '/'));
    }
}
