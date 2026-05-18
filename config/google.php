<?php
// Google API configuration (Sign-in, Maps)
require_once __DIR__ . '/env-loader.php';

$redirect_uri = $_ENV['GOOGLE_REDIRECT_URI'] ?? '';

$protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off'
    || (!empty($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https')
    || (isset($_SERVER['SERVER_PORT']) && (int) $_SERVER['SERVER_PORT'] === 443)) ? 'https://' : 'http://';
$host = $_SERVER['HTTP_HOST'] ?? 'localhost';

// Use request host when unset, or when running locally (keeps production .env URI on live server)
$isLocal = function_exists('isLocalHost') ? isLocalHost() : (bool) preg_match('/^(localhost|127\.0\.0\.1)(:\d+)?$/i', $host);
if (empty($redirect_uri) || $isLocal) {
    $redirect_uri = $protocol . $host . '/api/auth/google-handler.php';
}

return [
    'client_id' => $_ENV['GOOGLE_CLIENT_ID'] ?? '',
    'client_secret' => $_ENV['GOOGLE_CLIENT_SECRET'] ?? '',
    'redirect_uri' => $redirect_uri,
    'origin' => $protocol . $host,
    'maps_api_key' => $_ENV['GOOGLE_MAPS_API_KEY'] ?? ''
];