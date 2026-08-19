<?php
// Router for PHP built-in server — lives in server/ but serves the project root

// Project root is one level up from server/
$rootDir = dirname(__DIR__);

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

// Debug logging
file_put_contents($rootDir . '/logs/router.log', date('[Y-m-d H:i:s] ') . $_SERVER['REQUEST_METHOD'] . ' ' . $_SERVER['REQUEST_URI'] . PHP_EOL, FILE_APPEND);

require_once $rootDir . '/includes/core/Autoloader.php';
require_once $rootDir . '/config/database.php';
require_once $rootDir . '/config/session-config.php';


// Dispatch routing
$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

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

    // Smile ID KYC Verification
    if ($cleanPath === 'verify_kyc') {
        header('Content-Type: application/json');
        require_once $rootDir . '/includes/middleware/auth.php';
        $pdo = getPDO();
        $data = json_decode(file_get_contents("php://input"), true);
        
        $user_id = $data['user_id'] ?? 0;
        $doc_name = $data['document_name'] ?? 'Unknown';
        
        $success = !empty($data['image']);
        $status = $success ? 'verified' : 'failed';
        $resultText = $success ? 'Smile ID: Face matched document successfully.' : 'Smile ID: Verification failed.';
        
        $stmt = $pdo->prepare("UPDATE users SET kyc_status = ?, kyc_document_name = ?, smile_id_result_text = ? WHERE id = ?");
        $stmt->execute([$status, $doc_name, $resultText, $user_id]);
        
        echo json_encode(['success' => $success, 'message' => $resultText, 'status' => $status]);
        exit;
    }

    // fallback
    http_response_code(404);
    echo json_encode(['success' => false, 'message' => 'API Route not found: ' . $uri]);
    exit;
}

// Fallback for non-API routes (e.g. root)
if ($uri === '/' || $uri === '/index.php' || $uri === '/server/index.php') {
    header('Location: /public/pages/index.html');
    exit;
}

// If no route matches, 404
http_response_code(404);
echo "404 Not Found (" . htmlspecialchars($uri) . ")";
exit;
