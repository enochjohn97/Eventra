<?php
/**
 * Eventra Support Chat API
 *
 * GET  ?ticket_id=xxx     → Load messages for a support thread
 * GET  ?action=all        → Admin: list all chat threads (unread counts)
 * POST {action:'send'}    → Send a message (user / client / admin)
 * POST {action:'escalate'}→ Escalate ticket to admin
 */

ob_start();
error_reporting(0);

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

    // ── Auto-create tables if not present (idempotent) ────────────────
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS support_chats (
            id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            ticket_id      VARCHAR(100)    NOT NULL DEFAULT 'general',
            sender_role    ENUM('admin','client','user') NOT NULL DEFAULT 'user',
            sender_id      BIGINT UNSIGNED NOT NULL DEFAULT 0,
            event_owner_id BIGINT UNSIGNED          DEFAULT NULL,
            refund_status  ENUM('none','pending_admin','approved','declined')
                           NOT NULL DEFAULT 'none',
            escalated      TINYINT(1)      NOT NULL DEFAULT 0,
            status         ENUM('open','closed') NOT NULL DEFAULT 'open',
            created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                           ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY idx_sc_ticket (ticket_id),
            KEY idx_sc_sender (sender_role, sender_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");

    $pdo->exec("
        CREATE TABLE IF NOT EXISTS support_chat_messages (
            id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            chat_id      BIGINT UNSIGNED NOT NULL,
            sender_role  ENUM('admin','client','user') NOT NULL,
            sender_id    BIGINT UNSIGNED NOT NULL DEFAULT 0,
            message_text TEXT            NOT NULL,
            is_read      TINYINT(1)      NOT NULL DEFAULT 0,
            created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY idx_scm_chat (chat_id),
            CONSTRAINT fk_scm_chat
                FOREIGN KEY (chat_id) REFERENCES support_chats (id)
                ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");

    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

    // ══════════════════════════════════════════════════════════════════
    // GET
    // ══════════════════════════════════════════════════════════════════
    if ($method === 'GET') {
        $action   = trim($_GET['action']    ?? '');
        $ticketId = trim($_GET['ticket_id'] ?? 'general');
        if ($ticketId === '') $ticketId = 'general';

        // ── Admin: list all threads ───────────────────────────────────
        if ($action === 'all') {
            $role = $_SESSION['role'] ?? null;
            if ($role !== 'admin') {
                jsonOut(['success' => false, 'message' => 'Admin access required.'], 403);
            }

            $rows = $pdo->query("
                SELECT sc.*,
                    (SELECT scm2.message_text
                     FROM support_chat_messages scm2
                     WHERE scm2.chat_id = sc.id
                     ORDER BY scm2.id DESC LIMIT 1)           AS last_message,
                    (SELECT COUNT(*)
                     FROM support_chat_messages scm3
                     WHERE scm3.chat_id = sc.id
                       AND scm3.is_read    = 0
                       AND scm3.sender_role != 'admin')       AS unread_count
                FROM support_chats sc
                ORDER BY sc.updated_at DESC
                LIMIT 100
            ")->fetchAll(PDO::FETCH_ASSOC);

            jsonOut(['success' => true, 'chats' => $rows]);
        }

        // ── Load messages for a thread ────────────────────────────────
        $senderRole = $_SESSION['role'] ?? 'user';
        $senderId   = (int)($_SESSION[$senderRole . '_id'] ?? 0);

        if ($senderRole === 'admin') {
            // Admin views any thread by ticket_id
            $stmt = $pdo->prepare(
                "SELECT * FROM support_chats WHERE ticket_id = ? ORDER BY id DESC LIMIT 1"
            );
            $stmt->execute([$ticketId]);
        } else {
            // User / client sees only their own thread
            $stmt = $pdo->prepare(
                "SELECT * FROM support_chats
                 WHERE ticket_id = ? AND sender_role = ? AND sender_id = ?
                 LIMIT 1"
            );
            $stmt->execute([$ticketId, $senderRole, $senderId]);
        }
        $chat = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$chat) {
            jsonOut(['success' => true, 'chat' => null, 'messages' => []]);
        }

        // Mark messages from the other party as read
        $pdo->prepare(
            "UPDATE support_chat_messages SET is_read = 1
             WHERE chat_id = ? AND sender_role != ?"
        )->execute([$chat['id'], $senderRole]);

        $msgs = $pdo->prepare(
            "SELECT * FROM support_chat_messages WHERE chat_id = ? ORDER BY id ASC LIMIT 200"
        );
        $msgs->execute([$chat['id']]);

        jsonOut(['success' => true, 'chat' => $chat, 'messages' => $msgs->fetchAll(PDO::FETCH_ASSOC)]);
    }

    // ══════════════════════════════════════════════════════════════════
    // POST
    // ══════════════════════════════════════════════════════════════════
    if ($method === 'POST') {
        $input  = json_decode(file_get_contents('php://input'), true) ?? [];
        $action = trim($input['action'] ?? 'send');

        // ── Escalate ──────────────────────────────────────────────────
        if ($action === 'escalate') {
            $ticketId = trim($input['ticket_id'] ?? 'general');
            $pdo->prepare(
                "UPDATE support_chats
                 SET escalated = 1, refund_status = 'pending_admin', updated_at = NOW()
                 WHERE ticket_id = ?"
            )->execute([$ticketId]);
            jsonOut(['success' => true, 'message' => 'Ticket escalated to admin.']);
        }

        // ── Send / Reply ───────────────────────────────────────────────
        $ticketId   = trim($input['ticket_id']   ?? 'general');
        $message    = trim($input['message']     ?? '');
        $rawRole    = $input['sender_role']      ?? ($_SESSION['role'] ?? 'user');
        $senderRole = in_array($rawRole, ['admin', 'client', 'user'], true) ? $rawRole : 'user';
        $senderId   = (int)($input['sender_id']  ?? $_SESSION[$senderRole . '_id'] ?? 0);
        $ownerId    = isset($input['event_owner_id']) ? (int)$input['event_owner_id'] : null;

        if ($message === '') {
            jsonOut(['success' => false, 'message' => 'Message cannot be empty.'], 400);
        }

        // Sanitise
        $message = htmlspecialchars($message, ENT_QUOTES, 'UTF-8');

        // Find or create the thread ─────────────────────────────────
        if ($senderRole === 'admin') {
            // Admin always replies to the existing thread for that ticket
            $stmt = $pdo->prepare(
                "SELECT id FROM support_chats WHERE ticket_id = ? ORDER BY id DESC LIMIT 1"
            );
            $stmt->execute([$ticketId]);
            $chatId = $stmt->fetchColumn();

            if (!$chatId) {
                $pdo->prepare(
                    "INSERT INTO support_chats (ticket_id, sender_role, sender_id, status)
                     VALUES (?, 'admin', ?, 'open')"
                )->execute([$ticketId, $senderId]);
                $chatId = $pdo->lastInsertId();
            } else {
                $pdo->prepare(
                    "UPDATE support_chats SET updated_at = NOW() WHERE id = ?"
                )->execute([$chatId]);
            }
        } else {
            // User / Client: scoped to their own thread
            $stmt = $pdo->prepare(
                "SELECT id FROM support_chats
                 WHERE ticket_id = ? AND sender_role = ? AND sender_id = ?
                 LIMIT 1"
            );
            $stmt->execute([$ticketId, $senderRole, $senderId]);
            $chatId = $stmt->fetchColumn();

            if (!$chatId) {
                $pdo->prepare(
                    "INSERT INTO support_chats (ticket_id, sender_role, sender_id, event_owner_id, status)
                     VALUES (?, ?, ?, ?, 'open')"
                )->execute([$ticketId, $senderRole, $senderId, $ownerId]);
                $chatId = $pdo->lastInsertId();
            } else {
                $pdo->prepare(
                    "UPDATE support_chats SET updated_at = NOW() WHERE id = ?"
                )->execute([$chatId]);
            }
        }

        $pdo->prepare(
            "INSERT INTO support_chat_messages (chat_id, sender_role, sender_id, message_text)
             VALUES (?, ?, ?, ?)"
        )->execute([$chatId, $senderRole, $senderId, $message]);

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
