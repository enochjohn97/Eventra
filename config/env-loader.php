<?php
/**
 * Environment Variable Loader
 * Loads .env (and .env.local for local development overrides) and populates $_ENV.
 *
 * .env.local is ONLY read when the request comes from a local host
 * (localhost / 127.0.0.1). This lets one commit work for both the live
 * platform and local development without swapping files manually.
 */

function loadEnv($path = null)
{
    if ($path === null) {
        $primary = __DIR__ . '/../.env';

        if (file_exists($primary)) {
            $path = $primary;
        } elseif (file_exists(__DIR__ . '/../.env.example')) {
            $path = __DIR__ . '/../.env.example';
        } else {
            return;
        }
    } elseif (!file_exists($path)) {
        return;
    }

    $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);

    foreach ($lines as $line) {
        // Skip comments and empty lines
        $trimmedLine = trim($line);
        if ($trimmedLine === '' || strpos($trimmedLine, '#') === 0) {
            continue;
        }

        // Parse key=value pairs
        if (strpos($line, '=') !== false) {
            list($key, $value) = explode('=', $line, 2);
            $key = trim($key);
            $value = trim($value);

            // Remove quotes if present
            $value = trim($value, "\"'");

            // Set variables if they aren't already set in the environment (system level)
            if (getenv($key) === false) {
                $_ENV[$key] = $value;
                $_SERVER[$key] = $value;
                putenv("$key=$value");
            } else {
                // System level variables take precedence
                $_ENV[$key] = getenv($key);
                $_SERVER[$key] = getenv($key);
            }
        }
    }
}

/**
 * Detect local dev server (localhost / 127.0.0.1, any port).
 */
function isLocalHost(): bool
{
    $host = $_SERVER['HTTP_HOST'] ?? $_SERVER['SERVER_NAME'] ?? '';
    // CLI (cron, queue workers) counts as local tooling unless APP_ENV says otherwise.
    if ($host === '' && PHP_SAPI === 'cli') {
        return in_array($_ENV['APP_ENV'] ?? getenv('APP_ENV') ?: 'local', ['local', 'auto'], true);
    }
    return (bool) preg_match('/^(localhost|127\.0\.0\.1)(:\d+)?$/i', $host);
}

// Handle system environment variables (for production like Render or InfinityFree)
$envKeys = [
    'DB_HOST', 'DB_DATABASE', 'DB_USERNAME', 'DB_PASSWORD', 'DB_PORT', 'DB_CONNECTION',
    'APP_URL', 'APP_ENV', 'APP_DEBUG',
    'PAYSTACK_PUBLIC_KEY', 'PAYSTACK_SECRET_KEY', 'PAYSTACK_WEBHOOK_SECRET',
    'MAIL_HOST', 'MAIL_PORT', 'MAIL_USERNAME', 'MAIL_PASSWORD', 'MAIL_ENCRYPTION', 'MAIL_FROM_ADDRESS', 'MAIL_FROM_NAME',
    'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI', 'GOOGLE_MAPS_API_KEY', 'GOOGLE_CALENDAR_API_KEY', 'GOOGLE_WEBHOOK_SECRET',
    'BREVO_API_KEY', 'BREVO_SMS_SENDER',
    'CRON_SECRET', 'UPLOAD_MAX_SIZE', 'QR_SECRET', 'ALLOWED_ORIGINS'
];

foreach ($envKeys as $key) {
    // If not already in $_ENV (from .env file loading or other means)
    if (!isset($_ENV[$key]) || $_ENV[$key] === '') {
        $val = getenv($key);
        if ($val !== false) {
            $_ENV[$key] = $val;
            $_SERVER[$key] = $val;
        }
    }
}

// Auto-load when this file is included
loadEnv();

/**
 * Resolve APP_URL: localhost always uses the current request host;
 * production uses APP_URL from .env when set.
 */
function resolveAppUrl(): string
{
    $detectProtocol = static function (): string {
        $https = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off'
            || (!empty($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https')
            || (isset($_SERVER['SERVER_PORT']) && (int) $_SERVER['SERVER_PORT'] === 443);
        return $https ? 'https://' : 'http://';
    };

    $host = $_SERVER['HTTP_HOST'] ?? '';
    if ($host !== '' && isLocalHost()) {
        return rtrim($detectProtocol() . $host, '/');
    }

    $fromEnv = trim((string) ($_ENV['APP_URL'] ?? getenv('APP_URL') ?: ''));
    if ($fromEnv !== '' && !preg_match('/localhost|127\.0\.0\.1/i', $fromEnv)) {
        return rtrim($fromEnv, '/');
    }

    if ($host !== '') {
        return rtrim($detectProtocol() . $host, '/');
    }

    return rtrim($fromEnv !== '' ? $fromEnv : 'http://localhost:8080', '/');
}

$_ENV['APP_URL'] = resolveAppUrl();
$_SERVER['APP_URL'] = $_ENV['APP_URL'];
putenv('APP_URL=' . $_ENV['APP_URL']);

if (!isset($_ENV['APP_ENV']) || $_ENV['APP_ENV'] === '' || $_ENV['APP_ENV'] === 'auto') {
    $_ENV['APP_ENV'] = isLocalHost() ? 'local' : 'production';
    putenv('APP_ENV=' . $_ENV['APP_ENV']);
}

// ── Local development overrides (.env.local) ────────────────────────────────
// Loaded AFTER the main .env so it wins. Never loaded on live hosts.
if (isLocalHost()) {
    $localOverride = __DIR__ . '/../.env.local';
    if (file_exists($localOverride)) {
        $lines = file($localOverride, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        foreach ($lines as $line) {
            $t = trim($line);
            if ($t === '' || $t[0] === '#') continue;
            if (strpos($line, '=') === false) continue;
            list($k, $v) = explode('=', $line, 2);
            $k = trim($k);
            $v = trim(trim($v), "\"'");
            if ($k === '') continue;
            $_ENV[$k] = $v;
            $_SERVER[$k] = $v;
            putenv("$k=$v");
        }
        // APP_URL must follow the local host even if .env.local set something odd
        $_ENV['APP_URL'] = resolveAppUrl();
        $_SERVER['APP_URL'] = $_ENV['APP_URL'];
        putenv('APP_URL=' . $_ENV['APP_URL']);
    }
}

// Dynamic Live DB swap when running in production/live host
if (!isLocalHost()) {
    $liveHost = $_ENV['LIVE_DB_HOST'] ?? getenv('LIVE_DB_HOST') ?: '';
    if ($liveHost !== '') {
        $_ENV['DB_CONNECTION'] = $_ENV['LIVE_DB_CONNECTION'] ?? getenv('LIVE_DB_CONNECTION') ?: 'mysql';
        $_ENV['DB_HOST'] = $liveHost;
        $_ENV['DB_PORT'] = $_ENV['LIVE_DB_PORT'] ?? getenv('LIVE_DB_PORT') ?: '3306';
        $_ENV['DB_DATABASE'] = $_ENV['LIVE_DB_DATABASE'] ?? getenv('LIVE_DB_DATABASE') ?: '';
        $_ENV['DB_USERNAME'] = $_ENV['LIVE_DB_USERNAME'] ?? getenv('LIVE_DB_USERNAME') ?: '';
        $_ENV['DB_PASSWORD'] = $_ENV['LIVE_DB_PASSWORD'] ?? getenv('LIVE_DB_PASSWORD') ?: '';

        foreach (['CONNECTION', 'HOST', 'PORT', 'DATABASE', 'USERNAME', 'PASSWORD'] as $key) {
            $fullKey = 'DB_' . $key;
            $_SERVER[$fullKey] = $_ENV[$fullKey];
            putenv($fullKey . '=' . $_ENV[$fullKey]);
        }
    }
    
    // Dynamic Paystack swap when running in production/live host
    $livePk = $_ENV['LIVE_PAYSTACK_PUBLIC_KEY'] ?? getenv('LIVE_PAYSTACK_PUBLIC_KEY') ?: '';
    $liveSk = $_ENV['LIVE_PAYSTACK_SECRET_KEY'] ?? getenv('LIVE_PAYSTACK_SECRET_KEY') ?: '';
    
    if ($livePk !== '' && $liveSk !== '') {
        $_ENV['PAYSTACK_PUBLIC_KEY'] = $livePk;
        $_ENV['PAYSTACK_SECRET_KEY'] = $liveSk;
        
        $_SERVER['PAYSTACK_PUBLIC_KEY'] = $livePk;
        $_SERVER['PAYSTACK_SECRET_KEY'] = $liveSk;
        
        putenv('PAYSTACK_PUBLIC_KEY=' . $livePk);
        putenv('PAYSTACK_SECRET_KEY=' . $liveSk);
    }
}
