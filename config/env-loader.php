<?php
/**
 * Environment Variable Loader
 * Loads .env file and populates $_ENV superglobal
 */

function loadEnv($path = null)
{
    // Fallback logic: try .env then .env.example if no path provided
    if ($path === null) {
        $primary = __DIR__ . '/../.env';
        $fallback = __DIR__ . '/../.env.example';
        
        if (file_exists($primary)) {
            $path = $primary;
        } elseif (file_exists($fallback)) {
            $path = $fallback;
            // Note: In a real production environment, we'd usually log a warning 
            // but here we allow it for the user's testing flexibility.
        } else {
            return; // No env files found
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
            $value = trim($value, '"\'');

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

// Handle system environment variables (for production like Render or InfinityFree)
$envKeys = [
    'DB_HOST', 'DB_DATABASE', 'DB_USERNAME', 'DB_PASSWORD', 'DB_PORT', 'DB_CONNECTION',
    'APP_URL', 'APP_ENV', 'APP_DEBUG',
    'PAYSTACK_PUBLIC_KEY', 'PAYSTACK_SECRET_KEY',
    'MAIL_HOST', 'MAIL_PORT', 'MAIL_USERNAME', 'MAIL_PASSWORD', 'MAIL_ENCRYPTION', 'MAIL_FROM_ADDRESS', 'MAIL_FROM_NAME',
    'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI', 'GOOGLE_MAPS_API_KEY',
    'TERMII_API_KEY', 'TERMII_SECRET_KEY', 'TERMII_SENDER_ID',
    'CRON_SECRET', 'UPLOAD_MAX_SIZE', 'QR_SECRET'
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
 * Detect local dev server (localhost / 127.0.0.1, any port).
 */
function isLocalHost(): bool
{
    $host = $_SERVER['HTTP_HOST'] ?? $_SERVER['SERVER_NAME'] ?? '';
    return (bool) preg_match('/^(localhost|127\.0\.0\.1)(:\d+)?$/i', $host);
}

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

    return rtrim($fromEnv !== '' ? $fromEnv : 'http://localhost:8000', '/');
}

$_ENV['APP_URL'] = resolveAppUrl();
$_SERVER['APP_URL'] = $_ENV['APP_URL'];
putenv('APP_URL=' . $_ENV['APP_URL']);

if (!isset($_ENV['APP_ENV']) || $_ENV['APP_ENV'] === '') {
    $_ENV['APP_ENV'] = isLocalHost() ? 'local' : 'production';
    putenv('APP_ENV=' . $_ENV['APP_ENV']);
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
}


