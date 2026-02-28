<?php
/**
 * Validate Ticket API
 * Stub for validating a ticket via QR code scan
 */
header('Content-Type: application/json');
require_once '../../config/database.php';

// Verification Logic
$barcode = $_GET['barcode'] ?? null;

if (!$barcode) {
    echo json_encode(['success' => false, 'message' => 'Barcode required']);
    exit;
}

try {
    $stmt = $pdo->prepare("
        SELECT t.*, e.event_name, u.name as user_name 
        FROM tickets t
        JOIN payments p ON t.payment_id = p.id
        JOIN events e ON p.event_id = e.id
        JOIN users u ON p.user_id = u.id
        WHERE t.barcode = ?
    ");
    $stmt->execute([$barcode]);
    $ticket = $stmt->fetch();

    if (!$ticket) {
        echo json_encode(['success' => false, 'message' => 'Invalid ticket barcode']);
        exit;
    }

    if ($ticket['status'] === 'used') {
        echo json_encode(['success' => false, 'message' => 'Ticket has already been used', 'user_name' => $ticket['user_name']]);
        exit;
    }

    if ($ticket['status'] === 'cancelled') {
        echo json_encode(['success' => false, 'message' => 'Ticket is cancelled', 'user_name' => $ticket['user_name']]);
        exit;
    }

    // Success: Mark as used
    $stmt = $pdo->prepare("UPDATE tickets SET status = 'used' WHERE id = ?");
    $stmt->execute([$ticket['id']]);

    echo json_encode([
        'success' => true,
        'message' => 'Ticket validated successfully',
        'event_name' => $ticket['event_name'],
        'user_name' => $ticket['user_name'],
        'barcode' => $barcode
    ]);

} catch (PDOException $e) {
    echo json_encode(['success' => false, 'message' => 'Database error: ' . $e->getMessage()]);
}
