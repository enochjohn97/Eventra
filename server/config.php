<?php
ob_start();
date_default_timezone_set('UTC');

ini_set('display_errors', 0);
ini_set('display_startup_errors', 0);
error_reporting(E_ALL);

// Root is one level up from server/
$rootDir = dirname(__DIR__);

require_once $rootDir . '/config/env-loader.php';

// 1. Centralized Error Reporting (logged only)
ini_set('log_errors', 1);
ini_set('error_log', $rootDir . '/logs/php-errors.log');

$protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off' || 
             (!empty($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https') ||
             ($_SERVER['SERVER_PORT'] ?? 80) == 443) ? "https://" : "http://";

$host = $_SERVER['HTTP_HOST'] ?? $_SERVER['SERVER_NAME'] ?? 'localhost';
$base_url = $protocol . $host;


$isLocalHost = function_exists('isLocalHost')
    ? isLocalHost()
    : (bool) preg_match('/^(localhost|127\.0\.0\.1)(:\d+)?$/i', $host);

if (!$isLocalHost && session_status() !== PHP_SESSION_ACTIVE) {
    ini_set('session.cookie_path',     '/');
    ini_set('session.cookie_domain',   $host);
    ini_set('session.cookie_secure',   ($protocol === "https://") ? 1 : 0);
    ini_set('session.cookie_httponly', 1);
    ini_set('session.cookie_samesite', 'Strict');
}

// Centralized session management
require_once $rootDir . '/config/session-config.php';

if (!defined('SITE_URL')) define('SITE_URL',   $base_url);
if (!defined('BASE_URL')) define('BASE_URL',  SITE_URL . '/');
if (!defined('MEDIA_PATH')) define('MEDIA_PATH', $rootDir . '/media/');
if (!defined('UPLOAD_URL')) define('UPLOAD_URL', SITE_URL . '/media/');
