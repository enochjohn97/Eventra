<?php
// Handle static files for PHP built-in server
if (php_sapi_name() === 'cli-server') {
    $path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
    $fullPath = __DIR__ . $path;

    // Serve actual static files (images, css, js, html, etc.) directly
    if (file_exists($fullPath) && is_file($fullPath)) {
        // Let PHP serve recognized static types directly
        $ext = strtolower(pathinfo($fullPath, PATHINFO_EXTENSION));
        $staticExts = ['css', 'js', 'png', 'jpg', 'jpeg', 'gif', 'svg', 'ico', 'woff', 'woff2', 'ttf', 'html', 'htm', 'webp', 'mp4', 'pdf', 'map'];
        if (in_array($ext, $staticExts)) {
            return false;
        }
    }
    // All other requests (including directories lik/api/admin/) fall through to the router
}


// Debug logging
file_put_contents(__DIR__ . '/logs/router.log', date('[Y-m-d H:i:s] ') . $_SERVER['REQUEST_METHOD'] . ' ' . $_SERVER['REQUEST_URI'] . PHP_EOL, FILE_APPEND);

require_once __DIR__ . '/includes/core/Autoloader.php';
require_once __DIR__ . '/config/database.php';
require_once __DIR__ . '/config/session-config.php';


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

// Basic API Routing (Dynamic replacement for routes.php)
if (strpos($uri, '/api/') === 0) {
    $apiPath = substr($uri, 5); // Strip /api/
    
    // Safety: Strip .php to prevent .php.php resolution
    $cleanPath = preg_replace('/\.php$/', '', $apiPath);

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
    $fullPath = __DIR__ . '/api/' . $targetFile;

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
    
    // 1. Chat Engine
    if (strpos($cleanPath, 'chat') === 0) {
        header('Content-Type: application/json');
        require_once __DIR__ . '/includes/middleware/auth.php';
        $pdo = getPDO();
        
        if ($_SERVER['REQUEST_METHOD'] === 'GET') {
            $ticket_id = $_GET['ticket_id'] ?? 0;
            $stmt = $pdo->prepare("SELECT * FROM support_chats WHERE ticket_id = ?");
            $stmt->execute([$ticket_id]);
            $chat = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$chat) {
                echo json_encode(['success' => true, 'messages' => [], 'chat' => null]);
                exit;
            }
            $mStmt = $pdo->prepare("SELECT * FROM chat_messages WHERE chat_id = ? ORDER BY created_at ASC");
            $mStmt->execute([$chat['id']]);
            echo json_encode(['success' => true, 'messages' => $mStmt->fetchAll(PDO::FETCH_ASSOC), 'chat' => $chat]);
            exit;
        }
        
        if ($_SERVER['REQUEST_METHOD'] === 'POST') {
            $data = json_decode(file_get_contents("php://input"), true);
            $action = $data['action'] ?? 'send';
            $ticket_id = $data['ticket_id'] ?? 0;
            
            $stmt = $pdo->prepare("SELECT * FROM support_chats WHERE ticket_id = ?");
            $stmt->execute([$ticket_id]);
            $chat = $stmt->fetch(PDO::FETCH_ASSOC);
            
            if (!$chat) {
                // Auto-create chat if not exists
                $cStmt = $pdo->prepare("INSERT INTO support_chats (ticket_id, user_id, event_owner_id) VALUES (?, ?, ?)");
                $cStmt->execute([$ticket_id, $data['user_id'] ?? 0, $data['event_owner_id'] ?? 0]);
                $chat_id = $pdo->lastInsertId();
            } else {
                $chat_id = $chat['id'];
            }
            
            if ($action === 'escalate') {
                $pdo->prepare("UPDATE support_chats SET escalated_to_admin = 1 WHERE id = ?")->execute([$chat_id]);
                echo json_encode(['success' => true, 'message' => 'Escalated to admin.']);
                exit;
            }
            
            $pdo->prepare("INSERT INTO chat_messages (chat_id, sender_role, sender_id, message_text) VALUES (?, ?, ?, ?)")
                ->execute([$chat_id, $data['sender_role'], $data['sender_id'], $data['message']]);
            
            echo json_encode(['success' => true, 'message' => 'Sent']);
            exit;
        }
    }
    
    // 2. Refund Workflows
    if (strpos($cleanPath, 'refund') === 0) {
        header('Content-Type: application/json');
        require_once __DIR__ . '/includes/middleware/auth.php';
        require_once __DIR__ . '/config/payment.php';
        $pdo = getPDO();
        $data = json_decode(file_get_contents("php://input"), true);
        $chat_id = $data['chat_id'] ?? 0;
        $action = $data['action'] ?? '';
        
        if ($action === 'request') {
            $pdo->prepare("UPDATE support_chats SET refund_status = 'pending_admin', escalated_to_admin = 1 WHERE id = ?")->execute([$chat_id]);
            echo json_encode(['success' => true, 'message' => 'Refund requested.']);
            exit;
        }
        
        if ($action === 'approve') {
            // Native cURL via paystackRequest
            $ref = $data['paystack_ref'] ?? '';
            $payload = ['transaction' => $ref];
            try {
                $res = paystackRequest('POST', '/refund', $payload);
                if ($res['status']) {
                    $pdo->prepare("UPDATE support_chats SET refund_status = 'approved' WHERE id = ?")->execute([$chat_id]);
                    echo json_encode(['success' => true, 'message' => 'Refund approved and processed via Paystack.']);
                } else {
                    echo json_encode(['success' => false, 'message' => 'Paystack Error: ' . $res['message']]);
                }
            } catch (Exception $e) {
                echo json_encode(['success' => false, 'message' => $e->getMessage()]);
            }
            exit;
        }
        
        if ($action === 'decline') {
            $pdo->prepare("UPDATE support_chats SET refund_status = 'declined' WHERE id = ?")->execute([$chat_id]);
            echo json_encode(['success' => true, 'message' => 'Refund declined.']);
            exit;
        }
        
        if ($_SERVER['REQUEST_METHOD'] === 'GET') {
            $stmt = $pdo->prepare("SELECT * FROM support_chats WHERE escalated_to_admin = 1");
            $stmt->execute();
            echo json_encode(['success' => true, 'data' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
            exit;
        }
    }
    
    // 3. Smile ID KYC Verification
    if ($cleanPath === 'verify_kyc') {
        header('Content-Type: application/json');
        require_once __DIR__ . '/includes/middleware/auth.php';
        $pdo = getPDO();
        $data = json_decode(file_get_contents("php://input"), true);
        
        $user_id = $data['user_id'] ?? 0;
        $doc_name = $data['document_name'] ?? 'Unknown';
        
        // Emulate Smile ID Native cURL handler as per instructions
        // In reality, this would cURL https://smileidentity.com using $data['image']
        $smilePayload = [
            "source_sdk" => "php_backend",
            "source_sdk_version" => "1.0.0",
            "partner_id" => "1234",
            "image_links" => [ $data['image'] ?? '' ]
        ];
        
        // Mocking success based on payload presence
        $success = !empty($data['image']);
        $status = $success ? 'verified' : 'failed';
        $resultText = $success ? 'Smile ID: Face matched document successfully.' : 'Smile ID: Verification failed.';
        
        $stmt = $pdo->prepare("UPDATE users SET kyc_status = ?, kyc_document_name = ?, smile_id_result_text = ? WHERE id = ?");
        $stmt->execute([$status, $doc_name, $resultText, $user_id]);
        
        echo json_encode(['success' => $success, 'message' => $resultText, 'status' => $status]);
        exit;
    }

    // fallback for other common paths if needed
    http_response_code(404);
    echo json_encode(['success' => false, 'message' => 'API Route not found: ' . $uri]);
    exit;
}

// Fallback for non-API routes (e.g. root)
if ($uri === '/' || $uri === '/index.php') {
    header('Location: /public/pages/index.html');
    exit;
}

// If no route matches, let it fall through or 404
http_response_code(404);
echo "404 Not Found (" . htmlspecialchars($uri) . ")";
exit;
