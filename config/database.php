<?php
// Centralized Error Reporting
if (!headers_sent()) {
    ob_start();
}
ini_set('display_errors', 0);
ini_set('log_errors', 1);
ini_set('error_log', __DIR__ . '/../logs/php-errors.log');
error_reporting(E_ALL);

// Database configuration
require_once __DIR__ . '/env-loader.php';
require_once __DIR__ . '/cors-config.php'; // CORS handling for API requests



/**
 * Helper to get environment variable from multiple sources
 */
if (!function_exists('get_env_var')) {
    function get_env_var($key, $default = null) {
        if (isset($_ENV[$key])) return $_ENV[$key];
        if (isset($_SERVER[$key])) return $_SERVER[$key];
        $val = getenv($key);
        return ($val !== false) ? $val : $default;
    }
}

/**
 * User-facing message for common MySQL permission errors (local setup).
 */
if (!function_exists('formatDbErrorMessage')) {
    function formatDbErrorMessage(PDOException $e): string
    {
        $msg = $e->getMessage();
        if (strpos($msg, '1142') !== false || strpos($msg, '1044') !== false || strpos($msg, '1045') !== false) {
            return 'We could not access the database. Please check the database username, password, and permissions.';
        }
        return 'We are having trouble connecting to the database. Please try again shortly.';
    }
}

// Database configuration constants
if (!defined('DB_HOST')) define('DB_HOST', get_env_var('DB_HOST', '127.0.0.1'));
if (!defined('DB_PORT')) define('DB_PORT', get_env_var('DB_PORT', '3306'));
if (!defined('DB_NAME')) define('DB_NAME', get_env_var('DB_DATABASE', 'eventra_db'));
if (!defined('DB_USER')) define('DB_USER', get_env_var('DB_USERNAME', 'eventra'));
if (!defined('DB_PASS')) define('DB_PASS', get_env_var('DB_PASSWORD', ''));


date_default_timezone_set(get_env_var('APP_TIMEZONE', 'UTC'));


function getPDO() {
    if (defined('BYPASS_DB_CONN') && BYPASS_DB_CONN) {
        return null;
    }
    static $instance = null;
    
    if ($instance !== null) {
        return $instance;
    }

    $attempts = 0;
    $maxAttempts = 5;
    $baseRetryDelay = 500000; // 500ms

    while ($attempts < $maxAttempts) {
        $connectionHost = DB_HOST;
        try {
            $dsn = "mysql:host=" . $connectionHost . ";port=" . DB_PORT . ";dbname=" . DB_NAME . ";charset=utf8mb4";
            $instance = new PDO($dsn, DB_USER, DB_PASS, [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_PERSISTENT => false,
                PDO::ATTR_TIMEOUT => 5,
                // Pin the DB session time zone to UTC so SQL NOW() / CURDATE()
                // always match PHP's clock (pinned above), regardless of the
                // server's SYSTEM time zone (local Windows machine or live host).
                PDO::MYSQL_ATTR_INIT_COMMAND => "SET time_zone = '+00:00'"
            ]);

            return $instance;

        } catch (PDOException $e) {
            $attempts++;
            
            $sqlstate = null;
            if (is_array($e->errorInfo) && isset($e->errorInfo[0])) {
                $sqlstate = $e->errorInfo[0];
            }

            $isRetryable = (
                $e->getCode() == 1040 ||
                $e->getCode() == 2002 ||
                $sqlstate === '08004' ||
                strpos($e->getMessage(), '1040') !== false ||
                strpos($e->getMessage(), 'refused') !== false
            );

            if ($isRetryable && $attempts < $maxAttempts) {
                $delay = $baseRetryDelay * pow(2, $attempts - 1);
                usleep($delay);
                continue;
            }

            error_log("[" . date('Y-m-d H:i:s') . "] Database connection failed (Attempt $attempts, host $connectionHost): " . $e->getMessage());

            if (isset($_SERVER['REQUEST_URI']) && strpos($_SERVER['REQUEST_URI'], '/api/') !== false) {
                if (function_exists('ob_get_length') && ob_get_length()) { ob_clean(); }
                if (!headers_sent()) header('Content-Type: application/json');
                http_response_code(503);
                echo json_encode([
                    'success' => false,
                    'message' => $isRetryable
                        ? 'The service is temporarily unavailable. Please try again shortly.'
                        : 'We could not connect to the database. Please check your configuration or contact support.',
                    'code' => $isRetryable ? 'DB_CONNECT_ERROR' : 'DB_ERROR'
                ]);
                exit;
            }

            die($isRetryable
                ? 'The service is temporarily unavailable. Please try again shortly.'
                : 'We could not connect to the database. Please check your configuration or contact support.');
        }
    }
}

// Global variable assignment
$pdo = getPDO();

// Ensure the PDO is released at the end of the request
register_shutdown_function(function() {
    global $pdo;
    $pdo = null;
});
