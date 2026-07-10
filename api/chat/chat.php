<?php
/**
 * Eventra Support Chat API
 * Provides REST endpoints to fetch chat history, conversation lists, and context-aware metadata.
 * Real-time messaging is handled by the Socket.IO server.
 */

header('Content-Type: application/json');
require_once __DIR__ . '/../../server/config.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/middleware/auth.php';

try {
    $pdo = getPDO();
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    $role = $_SESSION['role'] ?? null;

    // Support Guest Access
    if (!$role) {
        $role = 'guest';
        
        // Check if we already created a guest auth_id in this session
        $authId = (int)($_SESSION['guest_auth_id'] ?? 0);
        
        if ($authId <= 0) {
            // Create a new guest auth record
            $guestEmail = 'guest_' . uniqid() . '@eventra.local';
            $stmt = $pdo->prepare("INSERT INTO auth_accounts (email, username, auth_provider, role) VALUES (?, 'Guest', 'local', 'guest')");
            $stmt->execute([$guestEmail]);
            $authId = (int)$pdo->lastInsertId();
            
            // Persist the guest identity in the session
            $_SESSION['role'] = 'guest';
            $_SESSION['guest_auth_id'] = $authId;
            $_SESSION['auth_id'] = $authId;
        }
    } else {
        if (!in_array($role, ['admin', 'client', 'user', 'guest'])) {
            http_response_code(401);
            echo json_encode(['success' => false, 'message' => 'Unauthorized']);
            exit;
        }

        $authId = (int)($_SESSION['auth_id'] ?? 0);
        if ($authId <= 0) {
            // Fallback: lookup auth_id
            $roleId = (int)($_SESSION[$role . '_id'] ?? 0);
            if ($role === 'admin') {
                $stmt = $pdo->prepare("SELECT admin_auth_id FROM admins WHERE id = ?");
                $stmt->execute([$roleId]);
                $authId = $stmt->fetchColumn();
            } elseif ($role === 'client') {
                $stmt = $pdo->prepare("SELECT client_auth_id FROM clients WHERE id = ?");
                $stmt->execute([$roleId]);
                $authId = $stmt->fetchColumn();
            } elseif ($role === 'user') {
                $stmt = $pdo->prepare("SELECT user_auth_id FROM users WHERE id = ?");
                $stmt->execute([$roleId]);
                $authId = $stmt->fetchColumn();
            } elseif ($role === 'guest') {
                $authId = (int)($_SESSION['guest_auth_id'] ?? 0);
            }
        }
    }

    if ($method === 'GET') {
        $action = trim($_GET['action'] ?? '');

        // 1. Get all conversations for the user
        if ($action === 'conversations') {
            if ($role === 'admin') {
                $stmt = $pdo->query("
                    SELECT c.*, 
                    (SELECT content FROM chat_messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) as last_message,
                    (SELECT COUNT(*) FROM chat_messages m WHERE m.conversation_id = c.id AND m.status != 'read') as unread_count
                    FROM chat_conversations c 
                    ORDER BY c.updated_at DESC LIMIT 100
                ");
            } else {
                $stmt = $pdo->prepare("
                    SELECT c.*, 
                    (SELECT content FROM chat_messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) as last_message,
                    (SELECT COUNT(*) FROM chat_messages m WHERE m.conversation_id = c.id AND m.status != 'read' AND m.sender_auth_id != ?) as unread_count
                    FROM chat_conversations c
                    JOIN chat_participants p ON c.id = p.conversation_id
                    WHERE p.auth_id = ?
                    ORDER BY c.updated_at DESC LIMIT 100
                ");
                $stmt->execute([$authId, $authId]);
            }
            $conversations = $stmt->fetchAll(PDO::FETCH_ASSOC);
            echo json_encode(['success' => true, 'conversations' => $conversations]);
            exit;
        }

        // 2. Get or create a conversation context
        if ($action === 'context') {
            $entityType = trim($_GET['entity_type'] ?? 'general');
            $entityId = (int)($_GET['entity_id'] ?? 0);
            $targetAuthId = (int)($_GET['target_auth_id'] ?? 0); // e.g., Organizer's auth ID

            // Try to find existing conversation
            $query = "
                SELECT c.id FROM chat_conversations c
                JOIN chat_participants p1 ON c.id = p1.conversation_id AND p1.auth_id = ?
            ";
            $params = [$authId];

            if ($targetAuthId > 0 && $role !== 'admin') {
                $query .= " JOIN chat_participants p2 ON c.id = p2.conversation_id AND p2.auth_id = ?";
                $params[] = $targetAuthId;
            }

            if ($entityId > 0) {
                $query .= " WHERE c.entity_type = ? AND c.entity_id = ?";
                $params[] = $entityType;
                $params[] = $entityId;
            } else {
                $query .= " WHERE c.entity_type = 'general'";
            }

            $query .= " LIMIT 1";

            $stmt = $pdo->prepare($query);
            $stmt->execute($params);
            $convId = $stmt->fetchColumn();

            // Add target if exists or resolve dynamically for events
            if ($targetAuthId === 0 && $entityType === 'event' && $entityId > 0) {
                $stmt = $pdo->prepare("SELECT client_auth_id FROM clients JOIN events ON clients.id = events.client_id WHERE events.id = ?");
                $stmt->execute([$entityId]);
                $targetAuthId = (int)$stmt->fetchColumn();
            }

            if (!$convId) {
                // Create new conversation
                $pdo->prepare("INSERT INTO chat_conversations (entity_type, entity_id) VALUES (?, ?)")
                    ->execute([$entityType, $entityId > 0 ? $entityId : null]);
                $convId = $pdo->lastInsertId();

                // Add self
                $pdo->prepare("INSERT INTO chat_participants (conversation_id, auth_id, role) VALUES (?, ?, ?)")
                    ->execute([$convId, $authId, $role]);

                // Add target if exists
                if ($targetAuthId > 0 && $targetAuthId !== $authId) {
                    $targetRole = ($role === 'user') ? 'client' : 'user'; 
                    $pdo->prepare("INSERT INTO chat_participants (conversation_id, auth_id, role) VALUES (?, ?, ?)")
                        ->execute([$convId, $targetAuthId, $targetRole]);
                }
            }

            echo json_encode(['success' => true, 'conversation_id' => $convId]);
            exit;
        }

        // 3. Get messages for a conversation
        if ($action === 'messages') {
            $convId = (int)($_GET['conversation_id'] ?? 0);
            
            // Validate participant
            if ($role !== 'admin') {
                $stmt = $pdo->prepare("SELECT id FROM chat_participants WHERE conversation_id = ? AND auth_id = ?");
                $stmt->execute([$convId, $authId]);
                if (!$stmt->fetchColumn()) {
                    http_response_code(403);
                    echo json_encode(['success' => false, 'message' => 'Forbidden']);
                    exit;
                }
            }

            $stmt = $pdo->prepare("
                SELECT m.*, 
                (SELECT JSON_ARRAYAGG(JSON_OBJECT('file_name', a.file_name, 'file_path', a.file_path, 'file_type', a.file_type, 'file_size', a.file_size)) FROM chat_attachments a WHERE a.message_id = m.id) as attachments,
                a.username as sender_name,
                a.role as sender_role
                FROM chat_messages m
                JOIN auth_accounts a ON m.sender_auth_id = a.id
                WHERE m.conversation_id = ?
                ORDER BY m.id ASC
            ");
            $stmt->execute([$convId]);
            $messages = $stmt->fetchAll(PDO::FETCH_ASSOC);

            // Parse attachments JSON
            foreach ($messages as &$msg) {
                if ($msg['attachments'] && is_string($msg['attachments'])) {
                    $msg['attachments'] = json_decode($msg['attachments'], true);
                } else {
                    $msg['attachments'] = [];
                }
            }

            echo json_encode(['success' => true, 'messages' => $messages]);
            exit;
        }
    }

    if ($method === 'POST') {
        $input = json_decode(file_get_contents('php://input'), true) ?: [];
        $action = trim($_GET['action'] ?? $input['action'] ?? '');

        if ($action === 'send_message') {
            $convId = (int)($input['conversation_id'] ?? 0);
            $content = trim($input['content'] ?? '');
            $messageType = trim($input['message_type'] ?? 'text');
            $attachments = $input['attachments'] ?? [];

            if ($convId <= 0 || ($messageType === 'text' && empty($content))) {
                http_response_code(400);
                echo json_encode(['success' => false, 'message' => 'Invalid message data']);
                exit;
            }

            if ($role !== 'admin') {
                $stmt = $pdo->prepare("SELECT id FROM chat_participants WHERE conversation_id = ? AND auth_id = ?");
                $stmt->execute([$convId, $authId]);
                if (!$stmt->fetchColumn()) {
                    http_response_code(403);
                    echo json_encode(['success' => false, 'message' => 'Forbidden']);
                    exit;
                }
            }

            $stmt = $pdo->prepare("INSERT INTO chat_messages (conversation_id, sender_auth_id, message_type, content, status) VALUES (?, ?, ?, ?, 'sent')");
            $stmt->execute([$convId, $authId, $messageType, $content]);
            $msgId = $pdo->lastInsertId();

            if (!empty($attachments) && is_array($attachments)) {
                $stmtAtt = $pdo->prepare("INSERT INTO chat_attachments (message_id, file_name, file_path, file_type, file_size) VALUES (?, ?, ?, ?, ?)");
                foreach ($attachments as $att) {
                    $stmtAtt->execute([$msgId, $att['file_name'], $att['file_path'], $att['file_type'] ?? 'other', $att['file_size'] ?? 0]);
                }
            }

            $pdo->prepare("UPDATE chat_conversations SET updated_at = NOW() WHERE id = ?")->execute([$convId]);
            echo json_encode(['success' => true, 'message_id' => $msgId]);
            exit;
        }

        if ($action === 'mark_read') {
            $convId = (int)($input['conversation_id'] ?? 0);
            if ($convId > 0) {
                $stmt = $pdo->prepare("UPDATE chat_messages SET status = 'read' WHERE conversation_id = ? AND sender_auth_id != ? AND status != 'read'");
                $stmt->execute([$convId, $authId]);
                $pdo->prepare("UPDATE chat_participants SET last_read_at = NOW() WHERE conversation_id = ? AND auth_id = ?")->execute([$convId, $authId]);
            }
            echo json_encode(['success' => true]);
            exit;
        }
    }

    echo json_encode(['success' => false, 'message' => 'Invalid action']);

} catch (Throwable $e) {
    error_log('[chat.php] Error: ' . $e->getMessage() . "\n" . $e->getTraceAsString());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Internal server error: ' . $e->getMessage()]);
}
