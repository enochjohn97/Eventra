<?php
/**
 * Eventra Support Chat - Server-Sent Events (SSE) Stream
 * Provides real-time messaging equivalent to Socket.io without frameworks.
 */

header('Content-Type: text/event-stream');
header('Cache-Control: no-cache');
header('Connection: keep-alive');
header('X-Accel-Buffering: no'); // Disable NGINX buffering

require_once __DIR__ . '/../../server/config.php';
require_once __DIR__ . '/../../config/database.php';
// Session config is already included via server/config.php -> session-config.php

try {
    $pdo = getPDO();
    $role = $_SESSION['role'] ?? 'guest';
    
    // Auto-create guest if they hit stream first
    if ($role === 'guest') {
        $authId = (int)($_SESSION['guest_auth_id'] ?? 0);
        if ($authId <= 0) {
            $guestEmail = 'guest_' . uniqid() . '@eventra.local';
            $stmt = $pdo->prepare("INSERT INTO auth_accounts (email, username, auth_provider, role) VALUES (?, 'Guest', 'local', 'guest')");
            $stmt->execute([$guestEmail]);
            $authId = (int)$pdo->lastInsertId();
            $_SESSION['role'] = 'guest';
            $_SESSION['guest_auth_id'] = $authId;
            $_SESSION['auth_id'] = $authId;
        }
    } else {
        $authId = (int)($_SESSION['auth_id'] ?? 0);
        if ($authId <= 0) {
            $roleId = (int)($_SESSION[$role . '_id'] ?? 0);
            if ($role === 'admin') {
                $stmt = $pdo->prepare("SELECT admin_auth_id FROM admins WHERE id = ?");
                $stmt->execute([$roleId]);
                $authId = $stmt->fetchColumn();
            } elseif ($role === 'client') {
                $stmt = $pdo->prepare("SELECT client_auth_id FROM clients WHERE id = ?");
                $stmt->execute([$roleId]);
                $authId = $stmt->fetchColumn();
            } else {
                $stmt = $pdo->prepare("SELECT user_auth_id FROM users WHERE id = ?");
                $stmt->execute([$roleId]);
                $authId = $stmt->fetchColumn();
            }
        }
    }

    if ($authId <= 0) {
        echo "event: error\ndata: Unauthorized\n\n";
        exit;
    }

    $convId = (int)($_GET['conversation_id'] ?? 0);
    $lastEventId = isset($_SERVER["HTTP_LAST_EVENT_ID"]) ? (int)$_SERVER["HTTP_LAST_EVENT_ID"] : 0;
    
    if (isset($_GET['lastEventId']) && $_GET['lastEventId'] > $lastEventId) {
        $lastEventId = (int)$_GET['lastEventId'];
    }

    // Validate participant if not admin
    if ($role !== 'admin' && $convId > 0) {
        $stmt = $pdo->prepare("SELECT id FROM chat_participants WHERE conversation_id = ? AND auth_id = ?");
        $stmt->execute([$convId, $authId]);
        if (!$stmt->fetchColumn()) {
            echo "event: error\ndata: Forbidden\n\n";
            exit;
        }
    }

    // Ping to keep connection alive
    echo ":" . str_repeat(" ", 2048) . "\n"; // Send 2KB padding to avoid buffering
    echo "retry: 3000\n\n";
    ob_flush();
    flush();

    $maxCycles = 600; // Run for up to 10 minutes (600 seconds)
    $cycles = 0;

    // Get the initial last_id if none provided
    if ($lastEventId === 0) {
        if ($convId > 0) {
            $stmt = $pdo->prepare("SELECT MAX(id) FROM chat_messages WHERE conversation_id = ?");
            $stmt->execute([$convId]);
        } else {
            // Global inbox stream - get max msg id relevant to user
            if ($role === 'admin') {
                $stmt = $pdo->query("SELECT MAX(id) FROM chat_messages");
            } else {
                $stmt = $pdo->prepare("
                    SELECT MAX(m.id) FROM chat_messages m
                    JOIN chat_participants p ON m.conversation_id = p.conversation_id
                    WHERE p.auth_id = ?
                ");
                $stmt->execute([$authId]);
            }
        }
        $lastEventId = (int)$stmt->fetchColumn();
    }

    while ($cycles < $maxCycles) {
        // Connection aborted check
        if (connection_aborted()) break;

        // Fetch new messages
        if ($convId > 0) {
            $stmt = $pdo->prepare("
                SELECT m.*, 
                (SELECT JSON_ARRAYAGG(JSON_OBJECT('file_name', a.file_name, 'file_path', a.file_path, 'file_type', a.file_type, 'file_size', a.file_size)) FROM chat_attachments a WHERE a.message_id = m.id) as attachments
                FROM chat_messages m
                WHERE m.conversation_id = ? AND m.id > ?
                ORDER BY m.id ASC
            ");
            $stmt->execute([$convId, $lastEventId]);
        } else {
            // Global inbox changes
            if ($role === 'admin') {
                $stmt = $pdo->prepare("
                    SELECT m.*, 
                    (SELECT JSON_ARRAYAGG(JSON_OBJECT('file_name', a.file_name, 'file_path', a.file_path, 'file_type', a.file_type, 'file_size', a.file_size)) FROM chat_attachments a WHERE a.message_id = m.id) as attachments
                    FROM chat_messages m
                    WHERE m.id > ?
                    ORDER BY m.id ASC
                ");
                $stmt->execute([$lastEventId]);
            } else {
                $stmt = $pdo->prepare("
                    SELECT m.*, 
                    (SELECT JSON_ARRAYAGG(JSON_OBJECT('file_name', a.file_name, 'file_path', a.file_path, 'file_type', a.file_type, 'file_size', a.file_size)) FROM chat_attachments a WHERE a.message_id = m.id) as attachments
                    FROM chat_messages m
                    JOIN chat_participants p ON m.conversation_id = p.conversation_id
                    WHERE p.auth_id = ? AND m.id > ?
                    ORDER BY m.id ASC
                ");
                $stmt->execute([$authId, $lastEventId]);
            }
        }

        $messages = $stmt->fetchAll(PDO::FETCH_ASSOC);

        if ($messages) {
            foreach ($messages as $msg) {
                if ($msg['attachments'] && is_string($msg['attachments'])) {
                    $msg['attachments'] = json_decode($msg['attachments'], true);
                } else {
                    $msg['attachments'] = [];
                }
                
                $data = json_encode($msg);
                echo "id: " . $msg['id'] . "\n";
                echo "event: message\n";
                echo "data: {$data}\n\n";
                $lastEventId = $msg['id'];
            }
            ob_flush();
            flush();
        }

        // Send a ping every 15 seconds to keep connection alive
        if ($cycles % 15 === 0) {
            echo "event: ping\ndata: {}\n\n";
            ob_flush();
            flush();
        }

        sleep(1);
        $cycles++;
    }

} catch (Throwable $e) {
    error_log('[stream.php] Error: ' . $e->getMessage() . "\n" . $e->getTraceAsString());
    echo "event: error\ndata: " . json_encode(['message' => 'Internal server error']) . "\n\n";
}
