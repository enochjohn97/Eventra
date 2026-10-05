<?php
/**
 * Eventra Front Controller — the single router for the whole app.
 *
 * Used by BOTH servers:
 *   • Apache — .htaccess rewrites all non-file requests here (short URLs,
 *     clean routing, and pretty 404s work identically locally and live).
 *   • PHP built-in server — `php -S localhost:8080 server/index.php`
 *
 * Provides clean, short URLs so share links and QR codes never expose
 * the real folder structure (e.g. /e/concert-night instead of
 * /public/pages/event-details.html?event=concert-night&client=x).
 *
 * Short routes:
 *   /e/{tag}                     → public event details page
 *   /e/{tag}/pay                 → checkout page for the event
 *   /t/{code}                    → ticket proof-of-purchase (QR target)
 *   /r/{ref}                     → payment receipt / callback resolver
 *   /s/{code}                    → DB-backed opaque short link (hides real paths)
 *   /go/{admin|client|user}      → portal shortcuts (login or dashboard)
 */

// Project root is one level up from server/
$rootDir = dirname(__DIR__);

// Apache applies these headers through .htaccess; mirror them for the PHP server.
$requestIsHttps = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
    || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https')
    || (($_SERVER['SERVER_PORT'] ?? 80) == 443);
$host = $_SERVER['HTTP_HOST'] ?? '';
// localhost, 127.0.0.1, and private LAN IPs have no TLS certificate — never
// force-redirect them to https or every local/LAN device breaks.
$isLocalHost = (bool) preg_match('/^(localhost|127\.0\.0\.1)(:\d+)?$/i', $host)
    || (bool) preg_match('/^(192\.168|10)\.\d+\.\d+\.\d+(:\d+)?$/i', $host)
    || (bool) preg_match('/^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+(:\d+)?$/i', $host);

if (!$requestIsHttps && !$isLocalHost && !empty($host)) {
    header('Location: https://' . $host . ($_SERVER['REQUEST_URI'] ?? '/'), true, 301);
    exit;
}

header("Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://accounts.google.com https://apis.google.com https://cdnjs.cloudflare.com https://unpkg.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://accounts.google.com; font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com data:; img-src 'self' data: blob: https://res.cloudinary.com https://api.qrserver.com https://www.gstatic.com https://images.unsplash.com https://ui-avatars.com https://lh3.googleusercontent.com https://*.googleusercontent.com; connect-src 'self' https://accounts.google.com https://apis.google.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; frame-src 'self' https://accounts.google.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'; upgrade-insecure-requests");
header('Referrer-Policy: strict-origin-when-cross-origin');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: SAMEORIGIN');
// NOTE: camera is intentionally NOT disabled — the client portal scans
// ticket QR codes with the device camera (scanner.html), so blocking camera
// here would kill that feature on live deployments.
header('Permissions-Policy: geolocation=(), microphone=(), payment=(), camera=(self), clipboard-read=(self), clipboard-write=(self)');
header('Cross-Origin-Opener-Policy: same-origin-allow-popups');
header('Cross-Origin-Embedder-Policy: unsafe-none');
header('Cross-Origin-Resource-Policy: same-origin');
if ($requestIsHttps) {
    header('Strict-Transport-Security: max-age=31536000; includeSubDomains; preload');
}

$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
if ($uri === '/' || $uri === '/index.php' || $uri === '/server/index.php') {
    header('Location: /public/pages/index.html', true, 302);
    exit;
}

// Handle static files for PHP built-in server
if (php_sapi_name() === 'cli-server') {
    $path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
    $fullPath = $rootDir . $path;

    // Serve actual static files (images, css, js, html, etc.) directly
    if (file_exists($fullPath) && is_file($fullPath)) {
        $ext = strtolower(pathinfo($fullPath, PATHINFO_EXTENSION));
        
        if ($ext === 'html' || $ext === 'htm') {
            header("Cross-Origin-Opener-Policy: same-origin-allow-popups");
            header('Content-Type: text/html');
            readfile($fullPath);
            exit;
        }

        $staticExts = ['css', 'js', 'png', 'jpg', 'jpeg', 'gif', 'svg', 'ico', 'woff', 'woff2', 'ttf', 'webp', 'mp4', 'pdf', 'map'];
        if (in_array($ext, $staticExts)) {
            return false;
        }
    }
    // All other requests fall through to the router
}

// Debug logging (disabled by default — enable only when debugging locally)
if (($_ENV['APP_DEBUG'] ?? 'false') === 'true' && is_dir($rootDir . '/logs')) {
    @file_put_contents($rootDir . '/logs/router.log', date('[Y-m-d H:i:s] ') . $_SERVER['REQUEST_METHOD'] . ' ' . $_SERVER['REQUEST_URI'] . PHP_EOL, FILE_APPEND);
}

require_once $rootDir . '/includes/core/Autoloader.php';
require_once $rootDir . '/config/database.php';
require_once $rootDir . '/config/session-config.php';


// Dispatch routing
$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

// ── Short URL routes (mirror of root index.php for the built-in server) ────
if (preg_match('#^/e/([A-Za-z0-9\-_]{1,150})$#', $uri, $m)) {
    header('Location: /public/pages/event-details.html?event=' . rawurlencode($m[1]), true, 302);
    exit;
}
if (preg_match('#^/e/([A-Za-z0-9\-_]{1,150})/pay$#', $uri, $m)) {
    header('Location: /public/pages/checkout.html?event=' . rawurlencode($m[1]), true, 302);
    exit;
}
if (preg_match('#^/t/([A-Za-z0-9\-_]{1,120})$#', $uri, $m)) {
    header('Location: /api/tickets/validate-ticket.php?barcode=' . rawurlencode($m[1]), true, 302);
    exit;
}
if (preg_match('#^/r/([A-Za-z0-9\-_]{1,190})$#', $uri, $m)) {
    header('Location: /public/pages/payment.html?reference=' . rawurlencode($m[1]), true, 302);
    exit;
}
// Database-backed opaque short links (hide real file locations).
// Creation endpoint: POST /api/s (auth required). Resolution: GET /s/{code}.
if (preg_match('#^/s/([A-Za-z0-9]{1,20})$#', $uri, $m)) {
    $_GET['code'] = $m[1];
    $prevCwd = getcwd();
    require_once $rootDir . '/api/short-url.php';
    if ($prevCwd !== false) {
        chdir($prevCwd);
    }
    exit;
}
if (preg_match('#^/(api/s|s)$#', $uri) && ($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    $prevCwd = getcwd();
    require_once $rootDir . '/api/short-url.php';
    if ($prevCwd !== false) {
        chdir($prevCwd);
    }
    exit;
}
if (preg_match('#^/go/(admin|client|user)$#', $uri, $m)) {
    $portal = strtolower($m[1]);
    if ($portal === 'admin') {
        header('Location: /admin/pages/adminLogin.html', true, 302);
    } elseif ($portal === 'client') {
        header('Location: /client/pages/clientLogin.html', true, 302);
    } else {
        header('Location: /public/pages/index.html', true, 302);
    }
    exit;
}

// Portal entry point redirects (formerly index.php in /client and /admin)
if ($uri === '/client' || $uri === '/client/') {
    if (isset($_SESSION['role']) && strtolower($_SESSION['role']) === 'client') {
        header('Location: /client/pages/clientDashboard.html');
    } else {
        header('Location: /client/pages/clientLogin.html');
    }
    exit;
}

if ($uri === '/admin' || $uri === '/admin/') {
    header('Location: /admin/pages/adminLogin.html');
    exit;
}

// Legacy portal redirects
$legacyRedirects = [
    '/admin/login' => '/admin/pages/adminLogin.html',
    '/client/login' => '/client/pages/clientLogin.html',
    '/user/login' => '/public/pages/index.html'
];
if (isset($legacyRedirects[$uri])) {
    header('Location: ' . $legacyRedirects[$uri]);
    exit;
}

// Basic API Routing
if (strpos($uri, '/api/') === 0) {
    $apiPath = substr($uri, 5); // Strip /api/
    
    // Safety: Strip .php to prevent .php.php resolution
    $cleanPath = preg_replace('/\.php$/', '', $apiPath);
    $method = $_SERVER['REQUEST_METHOD'];

    // =========================================================================
    // REST API routes (mobile + web clients)
    // =========================================================================
        $dispatchApi = static function (string $relativePath) use ($rootDir): void {
        $fullPath = $rootDir . '/api/' . $relativePath;
        if (!file_exists($fullPath)) {
            http_response_code(404);
            echo json_encode(['success' => false, 'message' => 'API handler not found: ' . $relativePath]);
            exit;
        }
        // CRITICAL: API handlers use the global $pdo created by config/database.php.
        // Inside this closure require_once would otherwise hide the global, so
        // every handler that does $pdo->prepare(...) without calling getPDO()
        // fatals ("Call to a member function prepare() on null"). Bind it here —
        // this mirrors Apache, where handlers execute in true global scope.
        global $pdo, $db_connected;
        if (!isset($pdo) || !$pdo instanceof PDO) {
            $pdo = getPDO();
        }
        $prevCwd = getcwd();
        chdir(dirname($fullPath));
        require_once $fullPath;
        if ($prevCwd !== false) {
            chdir($prevCwd);
        }
        exit;
    };

    if ($method === 'POST' && $cleanPath === 'auth/google') {
        $auth_intent = 'user';
        $dispatchApi('auth/google-handler.php');
    }

    if ($method === 'GET' && preg_match('#^events/(\d+)$#', $cleanPath, $eventMatch)) {
        $_GET['event_id'] = $eventMatch[1];
        $_GET['id'] = $eventMatch[1];
        $dispatchApi('events/get-event-details.php');
    }

    if ($method === 'GET' && $cleanPath === 'events') {
        if (!empty($_GET['search'])) {
            $_GET['q'] = $_GET['search'];
            $dispatchApi('events/search-events.php');
        }
        if (!empty($_GET['favorite']) && $_GET['favorite'] !== '0') {
            $dispatchApi('favorites/get-favorites.php');
        }
        $page = max(1, (int)($_GET['page'] ?? 1));
        $limit = (int)($_GET['limit'] ?? 10);
        if ($limit <= 0) {
            $limit = 10;
        }
        $_GET['offset'] = ($page - 1) * $limit;
        $_GET['limit'] = $limit;
        if (!empty($_GET['sort'])) {
            $sortMap = [
                'date' => 'date',
                'price_low' => 'price_low',
                'price_high' => 'price_high',
                'popular' => 'popular',
                'popularity' => 'popular',
                'newest' => 'newest',
                'merit' => 'merit',
            ];
            $_GET['sort_by'] = $sortMap[strtolower((string)$_GET['sort'])] ?? $_GET['sort'];
        }
        $dispatchApi('events/get-events.php');
    }

    if ($method === 'POST' && $cleanPath === 'favorites/toggle') {
        $dispatchApi('events/favorite.php');
    }

    if ($method === 'GET' && $cleanPath === 'favorites') {
        $dispatchApi('favorites/get-favorites.php');
    }

    if ($method === 'PUT' && $cleanPath === 'profile') {
        $dispatchApi('users/update-profile.php');
    }

    if ($method === 'GET' && $cleanPath === 'profile') {
        $dispatchApi('users/get-profile.php');
    }

    if ($method === 'POST' && $cleanPath === 'payments/initialize') {
        $dispatchApi('payments/initialize.php');
    }

    if ($method === 'POST' && $cleanPath === 'payments/verify') {
        $dispatchApi('payments/verify-payment.php');
    }

    if ($method === 'POST' && $cleanPath === 'tickets/send') {
        $dispatchApi('tickets/send-ticket.php');
    }

    if ($method === 'POST' && $cleanPath === 'tickets/check') {
        $dispatchApi('tickets/check-ticket.php');
    }

    if ($method === 'GET' && $cleanPath === 'tickets') {
        $dispatchApi('tickets/get-user-tickets.php');
    }

    if ($method === 'GET' && $cleanPath === 'config/app') {
        $dispatchApi('config/get-google-config.php');
    }

    if ($method === 'GET' && $cleanPath === 'config/paystack') {
        $dispatchApi('payments/paystack.php');
    }

    // Handle pluralization inconsistencies for main portals
    $mappings = [
        'client/login' => 'clients/login.php',
        'user/login'   => 'users/login.php',
        'admin/login'  => 'admin/login.php',
        'auth/login'   => 'auth/login.php',
        'admin/auth/check-session' => 'auth/check-session.php',
        'client/auth/check-session' => 'auth/check-session.php',
        'user/auth/google-login'   => 'auth/google-handler.php',
        'client/auth/google-login' => 'auth/google-handler.php',
        'admin/auth/google-login'  => 'auth/google-handler.php'
    ];

    $targetFile = $mappings[$cleanPath] ?? ($cleanPath . '.php');
    $fullPath = $rootDir . '/api/' . $targetFile;

    if (file_exists($fullPath) && is_file($fullPath)) {
        // API scripts use paths relative to their own directory (e.g. ../../config/).
        // NOTE: brute-force protection lives INSIDE the auth handlers (rate
        // limiter + per-account lockout), so it applies no matter how the file
        // is addressed (pretty route or direct .php call) and on Apache too,
        // where files are served directly without this front controller.
        $prevCwd = getcwd();
        chdir(dirname($fullPath));
        require_once $fullPath;
        if ($prevCwd !== false) {
            chdir($prevCwd);
        }
        exit;
    }

    // =========================================================================
    // Virtual Endpoints (No new files constraint)
    // =========================================================================

    // fallback
    http_response_code(404);
    echo json_encode(['success' => false, 'message' => 'API Route not found: ' . $uri]);
    exit;
}

// If no route matches, show the branded 404 page
http_response_code(404);
header('Content-Type: text/html; charset=utf-8');
echo '<!DOCTYPE html><html><head><meta charset="utf-8"><title>404 — Eventra</title>'
   . '<style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#0f172a;color:#f8fafc;text-align:center}a{color:#ff5a5f}</style></head>'
   . '<body><div><h1 style="font-size:4rem;margin:0 0 .5rem">404</h1><p>Page not found.</p>'
   . '<p><a href="/public/pages/index.html">Back to Eventra</a></p></div></body></html>';
exit;
