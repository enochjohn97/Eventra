<?php

/**
 * API: Cancel Ticket
 * Handles ticket cancellation and triggers notification
 */

header('Content-Type: application/json');
require_once '../../config/database.php';
require_once '../../includes/middleware/auth.php';
require_once '../utils/notification-helper.php';

// Check authentication
$user_id_auth = checkAuth('user');
$user_id = $_SESSION['user_id'] ?? null;

if (!$user_id) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Unauthorized']);
    exit;
}
$ticket_id = $_POST['ticket_id'] ?? null;

if (!$ticket_id) {
    echo json_encode(['success' => false, 'message' => 'Ticket ID is required']);
    exit;
}

try {
    $pdo->beginTransaction();

    // Enforce object-level ownership at the DB level — never trust client-supplied ticket_id alone
    $isAdmin = ($_SESSION['role'] ?? '') === 'admin';
    if ($isAdmin) {
        $stmt = $pdo->prepare("SELECT * FROM tickets WHERE id = ?");
        $stmt->execute([$ticket_id]);
    } else {
        // For non-admin: scope the fetch to tickets owned by this user
        $stmt = $pdo->prepare("SELECT * FROM tickets WHERE id = ? AND user_id = ?");
        $stmt->execute([$ticket_id, $user_id]);
    }
    $ticket = $stmt->fetch();

    if (!$ticket) {
        throw new Exception("Ticket not found or access denied.");
    }

    // Update status to cancelled
    $stmt = $pdo->prepare("UPDATE `tickets` SET `status` = 'cancelled', `updated_at` = NOW() WHERE `id` = ?");
    $stmt->execute([$ticket_id]);

    // Trigger Notification
    $auth_id = getAuthId();
    createNotification($auth_id, "Your ticket (ID: #$ticket_id) has been cancelled.", 'ticket_cancelled', $auth_id, 'user', 'user');

    // Notify Admin too
    $admin_id = getAdminUserId();
    if ($admin_id) {
        createNotification($admin_id, "Ticket #$ticket_id has been cancelled by user.", 'ticket_cancelled', $auth_id, 'admin', 'user');
    }

    $pdo->commit();

    echo json_encode([
        'success' => true,
        'message' => 'Ticket cancelled successfully'
    ]);
} catch (Exception $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    echo json_encode(['success' => false, 'message' => 'Error: ' . $e->getMessage()]);
}
