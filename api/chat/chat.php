<?php
/**
 * Eventra Support Chat API - Real-time SSE enabled
 */

// We handle stream action separately since we don't want output buffering to break it
if (isset($_GET['action']) && $_GET['action'] === 'stream') {
    header('Content-Type: text/event-stream');
    header('Cache-Control: no-cache, no-store, must-revalidate');
    header('Connection: keep-alive');
    // Disable any buffering
    @ini_set('zlib.output_compression', 0);
    @ini_set('implicit_flush', 1);
    while (ob_get_level()) { ob_end_flush(); }
    ob_implicit_flush(1);

    require_once __DIR__ . '/../config.php';
    require_once __DIR__ . '/../config/database.php';
    require_once __DIR__ . '/../includes/middleware/auth.php';

    $pdo = getPDO();
    $role = $_SESSION['role'] ?? 'user';
    $userId = (int)($_SESSION[$role . '_id'] ?? 0);

    // Set timeout to prevent infinite processes
    $startTime = time();
    $lastId = isset($_SERVER['HTTP_LAST_EVENT_ID']) ? (int)$_SERVER['HTTP_LAST_EVENT_ID'] : 0;
    if (isset($_GET['last_id'])) $lastId = (int)$_GET['last_id'];
    
    // We send a ping immediately
    echo ":" . str_repeat(" ", 2048) . "\n";
    echo "retry: 2000\n\n";
    flush();

    while ((time() - $startTime) < 300) { 
        if ($role === 'admin') {
            $stmt = $pdo->prepare("SELECT m.*, c.ticket_id FROM chat_messages m JOIN support_chats c ON m.chat_id = c.id WHERE m.id > ? ORDER BY m.id ASC");
            $stmt->execute([$lastId]);
        } else {
            $stmt = $pdo->prepare("SELECT m.*, c.ticket_id FROM chat_messages m JOIN support_chats c ON m.chat_id = c.id WHERE m.id > ? AND (m.receiver_id = ? AND m.receiver_type = ? OR m.sender_id = ? AND m.sender_type = ?) ORDER BY m.id ASC");
            $stmt->execute([$lastId, $userId, $role, $userId, $role]);
        }
        
        $messages = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        if ($messages) {
            foreach ($messages as $msg) {
                echo "id: " . $msg['id'] . "\n";
                echo "data: " . json_encode($msg) . "\n\n";
                $lastId = $msg['id'];
            }
            flush();
        }
        
        sleep(2);
    }
    exit;
}

ob_start();
error_reporting(E_ALL);
ini_set('display_errors', 0);
ini_set('log_errors', 1);
ini_set('error_log', __DIR__ . '/../logs/php-errors.log');

header('Content-Type: application/json');
header('Cache-Control: no-cache, no-store, must-revalidate');

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../includes/middleware/auth.php';

function jsonOut(array $data, int $code = 200): void
{
    http_response_code($code);
    ob_clean();
    echo json_encode($data);
    exit;
}

try {
    $pdo = getPDO();

    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

    if ($method === 'GET') {
        $action   = trim($_GET['action']    ?? '');
        $ticketId = trim($_GET['ticket_id'] ?? 'general');
        if ($ticketId === '') $ticketId = 'general';

        if ($action === 'all') {
            $role = $_SESSION['role'] ?? null;
            if ($role !== 'admin') {
                jsonOut(['success' => false, 'message' => 'Admin access required.'], 403);
            }

            $rows = $pdo->query("
                SELECT sc.*,
                    (SELECT cm2.message
                     FROM chat_messages cm2
                     WHERE cm2.chat_id = sc.id
                     ORDER BY cm2.id DESC LIMIT 1)           AS last_message,
                    (SELECT COUNT(*)
                     FROM chat_messages cm3
                     WHERE cm3.chat_id = sc.id
                       AND cm3.is_read    = 0
                       AND cm3.sender_type != 'admin')       AS unread_count,
                    COALESCE(
                        (SELECT name FROM clients WHERE id = sc.sender_id AND sc.sender_role = 'client' LIMIT 1),
                        (SELECT name FROM users WHERE id = sc.sender_id AND sc.sender_role = 'user' LIMIT 1),
                        'Unknown'
                    ) AS sender_name
                FROM support_chats sc
                ORDER BY sc.updated_at DESC
                LIMIT 100
            ")->fetchAll(PDO::FETCH_ASSOC);

            jsonOut(['success' => true, 'chats' => $rows]);
        }

        $senderRole = $_SESSION['role'] ?? 'user';
        $senderId   = (int)($_SESSION[$senderRole . '_id'] ?? 0);

        if ($senderRole === 'admin') {
            $stmt = $pdo->prepare("SELECT * FROM support_chats WHERE ticket_id = ? ORDER BY id DESC LIMIT 1");
            $stmt->execute([$ticketId]);
        } else {
            $stmt = $pdo->prepare("SELECT * FROM support_chats WHERE ticket_id = ? AND sender_role = ? AND sender_id = ? LIMIT 1");
            $stmt->execute([$ticketId, $senderRole, $senderId]);
        }
        $chat = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$chat) {
            jsonOut(['success' => true, 'chat' => null, 'messages' => []]);
        }

        $pdo->prepare("UPDATE chat_messages SET is_read = 1 WHERE chat_id = ? AND sender_type != ?")->execute([$chat['id'], $senderRole]);

        $msgs = $pdo->prepare("SELECT * FROM chat_messages WHERE chat_id = ? ORDER BY id ASC LIMIT 200");
        $msgs->execute([$chat['id']]);

        jsonOut(['success' => true, 'chat' => $chat, 'messages' => $msgs->fetchAll(PDO::FETCH_ASSOC)]);
    }

    if ($method === 'POST') {
        $input  = json_decode(file_get_contents('php://input'), true) ?? [];
        $action = trim($input['action'] ?? 'send');

        if ($action === 'escalate') {
            $ticketId = trim($input['ticket_id'] ?? 'general');
            $pdo->prepare("UPDATE support_chats SET escalated = 1, refund_status = 'pending_admin', updated_at = NOW() WHERE ticket_id = ?")->execute([$ticketId]);
            jsonOut(['success' => true, 'message' => 'Ticket escalated to admin.']);
        }

        if ($action === 'mark_read') {
            $ticketId = trim($input['ticket_id'] ?? '');
            $senderRole = $_SESSION['role'] ?? 'user';
            
            $stmt = $pdo->prepare("SELECT id FROM support_chats WHERE ticket_id = ? ORDER BY id DESC LIMIT 1");
            $stmt->execute([$ticketId]);
            $chatId = $stmt->fetchColumn();
            
            if ($chatId) {
                $pdo->prepare("UPDATE chat_messages SET is_read = 1 WHERE chat_id = ? AND sender_type != ?")->execute([$chatId, $senderRole]);
            }
            jsonOut(['success' => true]);
        }

        $ticketId   = trim($input['ticket_id']   ?? 'general');
        $message    = trim($input['message']     ?? '');

        // Always derive sender from session — client-supplied IDs are auth IDs and break lookups
        $senderRole = $_SESSION['role'] ?? null;
        if (!in_array($senderRole, ['admin', 'client', 'user'], true)) {
            jsonOut(['success' => false, 'message' => 'Authentication required.'], 401);
        }
        $senderId = (int)($_SESSION[$senderRole . '_id'] ?? 0);
        if ($senderId <= 0) {
            jsonOut(['success' => false, 'message' => 'Session invalid. Please log in again.'], 401);
        }
        $ownerId = isset($input['event_owner_id']) ? (int)$input['event_owner_id'] : null;

        if ($message === '') {
            jsonOut(['success' => false, 'message' => 'Message cannot be empty.'], 400);
        }

        if ($senderRole === 'admin') {
            $stmt = $pdo->prepare("SELECT id, sender_id, sender_role FROM support_chats WHERE ticket_id = ? ORDER BY id DESC LIMIT 1");
            $stmt->execute([$ticketId]);
            $chat = $stmt->fetch(PDO::FETCH_ASSOC);
            $chatId = $chat ? $chat['id'] : null;

            if (!$chatId) {
                $pdo->prepare("INSERT INTO support_chats (ticket_id, sender_role, sender_id, status) VALUES (?, 'admin', ?, 'open')")->execute([$ticketId, $senderId]);
                $chatId = $pdo->lastInsertId();
                $receiverId = 0;
                $receiverType = 'user';
            } else {
                $pdo->prepare("UPDATE support_chats SET updated_at = NOW() WHERE id = ?")->execute([$chatId]);
                $receiverId = $chat['sender_id'];
                $receiverType = $chat['sender_role'];
            }
        } else {
            $stmt = $pdo->prepare("SELECT id FROM support_chats WHERE ticket_id = ? AND sender_role = ? AND sender_id = ? LIMIT 1");
            $stmt->execute([$ticketId, $senderRole, $senderId]);
            $chatId = $stmt->fetchColumn();

            if (!$chatId) {
                $pdo->prepare("INSERT INTO support_chats (ticket_id, sender_role, sender_id, event_owner_id, status) VALUES (?, ?, ?, ?, 'open')")->execute([$ticketId, $senderRole, $senderId, $ownerId]);
                $chatId = $pdo->lastInsertId();
            } else {
                $pdo->prepare("UPDATE support_chats SET updated_at = NOW() WHERE id = ?")->execute([$chatId]);
            }
            $receiverId = 0; 
            $receiverType = 'admin';
        }

        $pdo->prepare(
            "INSERT INTO chat_messages (chat_id, sender_type, sender_id, receiver_id, receiver_type, message)
             VALUES (?, ?, ?, ?, ?, ?)"
        )->execute([$chatId, $senderRole, $senderId, $receiverId, $receiverType, $message]);

        jsonOut(['success' => true, 'message' => 'Sent.', 'chat_id' => (int)$chatId]);
    }

    jsonOut(['success' => false, 'message' => 'Method not allowed.'], 405);

} catch (PDOException $e) {
    error_log('[chat.php] DB: ' . $e->getMessage());
    jsonOut(['success' => false, 'message' => 'A database error occurred.'], 500);
} catch (Exception $e) {
    error_log('[chat.php] Error: ' . $e->getMessage());
    jsonOut(['success' => false, 'message' => 'An unexpected error occurred.'], 500);
}
