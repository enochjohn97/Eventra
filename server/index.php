<?php
/**
 * EventOut Front Controller — the single router for the whole app.
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
// force-redirect them to https or every local/LAN device breaks. (The LAN
// patterns must accept all four octets: a device testing over Wi-Fi sends
// `192.168.x.y:8000`, and a mismatched pattern made the server answer every
// LAN request with a 301 to `https://192.168.x.y:8000` — i.e. nowhere.)
$isLocalHost = (bool) preg_match('/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i', $host)
    || (bool) preg_match('/^(10|192\.168)\.\d{1,3}\.\d{1,3}(:\d+)?$/i', $host)
    || (bool) preg_match('/^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}(:\d+)?$/i', $host);

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

// ── Short public URLs ───────────────────────────────────────────────────────
// The public pages live in public/pages/ but are addressed from the site root,
// so the browser only ever sees the short form — localhost:8000/index.html,
// /checkout.html, /event-details.html, /payment.html — on BOTH the PHP dev
// server and Apache (Apache reaches this front controller through .htaccess,
// so one map covers local and live). The long /public/pages/... path keeps
// working, so old bookmarks, emails, QR codes and share links never break.
$shortPageAliases = [
    // User portal (public pages)
    '/index.html' => 'public/pages/index.html',
    '/checkout.html' => 'public/pages/checkout.html',
    '/event-details.html' => 'public/pages/event-details.html',
    '/payment.html' => 'public/pages/payment.html',
    // Legal pages — Terms, Privacy, Cookie Policy, Delete your data.
    // Kept under /pages/ but served from the site root for clean URLs.
    '/terms.html' => 'public/pages/terms.html',
    '/privacy.html' => 'public/pages/privacy.html',
    '/cookies.html' => 'public/pages/cookies.html',
    '/delete-data.html' => 'public/pages/delete-data.html',

    // Legacy short aliases (kept so old links never break)
    '/adminLogin.html' => 'admin/pages/adminLogin.html',
    '/clientLogin.html' => 'client/pages/clientLogin.html',
    // Admin portal — short URLs for every admin page
    '/admin/dashboard.html' => 'admin/pages/adminDashboard.html',
    '/admin/events.html' => 'admin/pages/adminEvents.html',
    '/admin/tickets.html' => 'admin/pages/adminTickets.html',
    '/admin/payments.html' => 'admin/pages/adminPayments.html',
    '/admin/users.html' => 'admin/pages/adminUsers.html',
    '/admin/clients.html' => 'admin/pages/adminClients.html',
    '/admin/login.html' => 'admin/pages/adminLogin.html',
    // Client portal — short URLs for every client page
    '/client/dashboard.html' => 'client/pages/clientDashboard.html',
    '/client/events.html' => 'client/pages/clientEvents.html',
    '/client/tickets.html' => 'client/pages/clientTickets.html',
    '/client/payments.html' => 'client/pages/clientPayment.html',
    '/client/users.html' => 'client/pages/clientUsers.html',
    '/client/media.html' => 'client/pages/clientMedia.html',
    '/client/login.html' => 'client/pages/clientLogin.html',
    '/client/forgot-password.html' => 'client/pages/client-forgot-password.html',
    '/client/reset-password.html' => 'client/pages/client-reset-password.html',
    '/client/scanner.html' => 'client/pages/scanner.html',
];
$shortPageBaseHrefs = [
    '/adminLogin.html' => '/admin/pages/',
    '/clientLogin.html' => '/client/pages/',
    '/admin/dashboard.html' => '/admin/pages/',
    '/admin/events.html' => '/admin/pages/',
    '/admin/tickets.html' => '/admin/pages/',
    '/admin/payments.html' => '/admin/pages/',
    '/admin/users.html' => '/admin/pages/',
    '/admin/clients.html' => '/admin/pages/',
    '/admin/login.html' => '/admin/pages/',
    '/client/dashboard.html' => '/client/pages/',
    '/client/events.html' => '/client/pages/',
    '/client/tickets.html' => '/client/pages/',
    '/client/payments.html' => '/client/pages/',
    '/client/users.html' => '/client/pages/',
    '/client/media.html' => '/client/pages/',
    '/client/login.html' => '/client/pages/',
    '/client/forgot-password.html' => '/client/pages/',
    '/client/reset-password.html' => '/client/pages/',
    '/client/scanner.html' => '/client/pages/',
];

$aliasPath = $shortPageAliases[$uri] ?? null;
if ($aliasPath !== null) {
    $aliasFile = $rootDir . '/' . $aliasPath;
    if (!is_file($aliasFile)) {
        // Never fall through to the redirect below: that would loop.
        http_response_code(500);
        header('Content-Type: text/plain; charset=utf-8');
        echo 'Missing page: ' . $aliasPath;
        exit;
    }
    header('Content-Type: text/html; charset=utf-8');
    header('Cache-Control: private, no-store, no-cache, must-revalidate, max-age=0');
    header('Pragma: no-cache');
    header('Expires: 0');
    if (isset($shortPageBaseHrefs[$uri])) {
        $page = file_get_contents($aliasFile);
        if ($page === false) {
            http_response_code(500);
            exit;
        }
        $base = '<base href="' . htmlspecialchars($shortPageBaseHrefs[$uri], ENT_QUOTES, 'UTF-8') . '">';
        $page = preg_replace('/(<head\b[^>]*>)/i', '$1' . $base, $page, 1);
        echo $page;
    } else {
        readfile($aliasFile);
    }
    exit;
}

if ($uri === '/' || $uri === '/index.php' || $uri === '/server/index.php') {
    header('Location: /index.html', true, 302);
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

// Local config endpoint for the mobile splash boot probe (php -S only).
// The mobile app calls GET /config/app before anything else, so serve it
// directly here on the built-in server instead of routing through the API
// dispatcher (which can be slow to boot on cold starts).
if (php_sapi_name() === 'cli-server' && $uri === '/config/app') {
    $configFile = $rootDir . '/config/google.php';
    if (!file_exists($configFile)) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'config not found']);
        exit;
    }
    // Load env first so GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET resolve.
    if (file_exists($rootDir . '/config/env-loader.php')) {
        // Load before reading from $_ENV so the mobile splash gets real values.
        require $rootDir . '/config/env-loader.php';
    }
    // The mobile splash calls GET /config/app before auth, so return the same
    // shape the app expects even when the backend has not finished booting.
    $config = require $configFile;
    if (!is_array($config)) {
        $config = [];
    }
    header('Content-Type: application/json');
    header('Cache-Control: no-store');
    echo json_encode(array_merge(['success' => true], $config));
    exit;
    exit;
}

require_once $rootDir . '/includes/core/Autoloader.php';
require_once $rootDir . '/config/database.php';
require_once $rootDir . '/config/session-config.php';


// Dispatch routing
$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

// ── Short URL routes (mirror of root index.php for the built-in server) ────
if (preg_match('#^/e/([A-Za-z0-9\-_]{1,150})$#', $uri, $m)) {
    header('Location: /event-details.html?event=' . rawurlencode($m[1]), true, 302);
    exit;
}
if (preg_match('#^/e/([A-Za-z0-9\-_]{1,150})/pay$#', $uri, $m)) {
    header('Location: /checkout.html?event=' . rawurlencode($m[1]), true, 302);
    exit;
}
if (preg_match('#^/t/([A-Za-z0-9\-_]{1,120})$#', $uri, $m)) {
    header('Location: /api/tickets/validate-ticket.php?barcode=' . rawurlencode($m[1]), true, 302);
    exit;
}
if (preg_match('#^/r/([A-Za-z0-9\-_]{1,190})$#', $uri, $m)) {
    header('Location: /payment.html?reference=' . rawurlencode($m[1]), true, 302);
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
        header('Location: /admin/login.html', true, 302);
    } elseif ($portal === 'client') {
        header('Location: /client/login.html', true, 302);
    } else {
        header('Location: /index.html', true, 302);
    }
    exit;
}

// Trailing-slash redirect for the mobile splash probe path so a stray
// /config/app/ never reaches the 404 page.
if ($uri === '/config/app/') {
    header('Location: /config/app', true, 301);
    exit;
}

// Portal entry point redirects (formerly index.php in /client and /admin)
if ($uri === '/client' || $uri === '/client/') {
    if (isset($_SESSION['role']) && strtolower($_SESSION['role']) === 'client') {
        header('Location: /client/dashboard.html');
    } else {
        header('Location: /client/login.html');
    }
    exit;
}

if ($uri === '/admin' || $uri === '/admin/') {
    if (isset($_SESSION['role']) && strtolower($_SESSION['role']) === 'admin') {
        header('Location: /admin/dashboard.html');
    } else {
        header('Location: /admin/login.html');
    }
    exit;
}

// Legacy portal redirects
$legacyRedirects = [
    '/admin/login' => '/admin/login.html',
    '/client/login' => '/client/login.html',
    '/user/login' => '/index.html'
];
if (isset($legacyRedirects[$uri])) {
    header('Location: ' . $legacyRedirects[$uri]);
    exit;
}

// Basic API Routing
if (strpos($uri, '/api/') === 0) {
    // Trim trailing slashes so pretty mobile routes like /api/events/ (the
    // browser/Apache slashed form) resolve to the same handler as /api/events.
    $apiPath = trim(substr($uri, 5), '/'); // Strip /api/ and any trailing /
    
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

        // Any discovery filter is served by the search handler, which
        // understands keywords AND category/state/priority/price — so the app
        // can filter without typing a keyword and still get correct paging.
        $hasDiscoveryFilters = false;
        foreach (['search', 'category', 'state', 'priority', 'free', 'price_min', 'price_max'] as $filterKey) {
            $value = $_GET[$filterKey] ?? '';
            if (is_array($value)) {
                $hasDiscoveryFilters = count($value) > 0;
            } else {
                $trimmed = trim((string) $value);
                $hasDiscoveryFilters = $trimmed !== '' && $trimmed !== '0';
            }
            if ($hasDiscoveryFilters) break;
        }

        if ($hasDiscoveryFilters) {
            if (!empty($_GET['search'])) {
                $_GET['q'] = $_GET['search'];
            }
            $dispatchApi('events/search-events.php');
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

    if ($method === 'GET' && ($cleanPath === 'tickets/qr-image' || $cleanPath === 'tickets/qr')) {
        $dispatchApi('tickets/qr-image.php');
    }

    if ($method === 'GET' && ($cleanPath === 'payments/recipient-quota' || $cleanPath === 'payments/quota')) {
        $_GET['recipient_quota'] = '1';
        $dispatchApi('payments/initialize.php');
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

    // Public utility endpoints used by the web homepage + mobile app.
    if ($method === 'GET' && ($cleanPath === 'utils/holiday-alerts' || $cleanPath === 'utils/holiday-alerts.php')) {
        $dispatchApi('utils/holiday-alerts.php');
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
echo '<!DOCTYPE html><html><head><meta charset="utf-8"><title>404 — EventOut</title>'
   . '<style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#0f172a;color:#f8fafc;text-align:center}a{color:#ff5a5f}</style></head>'
   . '<body><div><h1 style="font-size:4rem;margin:0 0 .5rem">404</h1><p>Page not found.</p>'
   . '<p><a href="/index.html">Back to EventOut</a></p></div></body></html>';
exit;
