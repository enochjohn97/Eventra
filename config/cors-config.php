<?php
// --- Best headers for Google Sign-In popups (no isolation blocking) ---
header("Cross-Origin-Opener-Policy: same-origin-allow-popups");
header("Cross-Origin-Embedder-Policy: unsafe-none");

// --- CORS Configuration ---
$allowed_origins = [
    'http://localhost:8000',
    'http://127.0.0.1:8000',
    'https://eventra-website.liveblog365.com',
];

// Auto-allow any localhost / 127.0.0.1 origin (any port) for local testing
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin !== '' && preg_match('#^https?://(localhost|127\.0\.0\.1)(:\d+)?$#i', $origin)) {
    $allowed_origins[] = $origin;
}

// Allow extra origins via environment variable (e.g. staging, previews)
$env_origins = getenv('ALLOWED_ORIGINS') ?: ($_ENV['ALLOWED_ORIGINS'] ?? '');
if (!empty($env_origins)) {
    $additional = array_map('trim', explode(',', $env_origins));
    $allowed_origins = array_merge($allowed_origins, $additional);
}

// $origin set above (may have been added for localhost)

// --- Handle preflight OPTIONS request ---
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    if (in_array($origin, $allowed_origins, true)) {
        header("Access-Control-Allow-Origin: $origin");
        header('Access-Control-Allow-Credentials: true');
        header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
        header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, X-Eventra-Portal, X-Access-Token, Accept');
        header('Access-Control-Max-Age: 86400');
    }
    
    http_response_code(204); // 204 No Content is more appropriate for preflight
    exit;
}

// --- Actual request ---
if (in_array($origin, $allowed_origins, true)) {
    header("Access-Control-Allow-Origin: $origin");
    header('Access-Control-Allow-Credentials: true');
    // Expose only the headers your frontend actually needs
    header('Access-Control-Expose-Headers: Content-Type, Authorization');
    header('Vary: Origin');  // Important: tells caches to differentiate by Origin
}