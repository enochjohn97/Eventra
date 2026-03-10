<?php
header('Content-Type: application/json');
require_once '../../config/database.php';
require_once '../../includes/middleware/admin-auth.php';

// Check authentication
$admin_id = adminMiddleware();

$client_id = $_GET['id'] ?? null;
if (!$client_id) {
    echo json_encode(['success' => false, 'message' => 'Client ID is required']);
    exit;
}

try {
    // 1. Get Client Info
    $stmt = $pdo->prepare("
        SELECT c.*, a.email
        FROM clients c
        JOIN auth_accounts a ON c.client_auth_id = a.id
        WHERE c.id = ? AND c.deleted_at IS NULL
    ");
    $stmt->execute([$client_id]);
    $client = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$client) {
        echo json_encode(['success' => false, 'message' => 'Client not found']);
        exit;
    }

    // Remove sensitive data
    unset($client['password']);

    // 2. Get Events by Client
    $evtStmt = $pdo->prepare("
        SELECT id, event_name, event_date, status, price, attendee_count as tickets_sold
        FROM events 
        WHERE client_id = ? AND deleted_at IS NULL
        ORDER BY created_at DESC
    ");
    $evtStmt->execute([$client_id]);
    $events = $evtStmt->fetchAll(PDO::FETCH_ASSOC);

    // 3. Get Buyers for this client's events
    $buyStmt = $pdo->prepare("
        SELECT u.id, u.name, u.profile_pic, a.email, COUNT(t.id) as tickets_bought
        FROM users u
        JOIN auth_accounts a ON u.user_auth_id = a.id
        JOIN tickets t ON t.user_id = u.id
        JOIN events e ON t.event_id = e.id
        WHERE e.client_id = ?
        GROUP BY u.id
        ORDER BY tickets_bought DESC
    ");
    $buyStmt->execute([$client_id]);
    $buyers = $buyStmt->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode([
        'success' => true,
        'client' => $client,
        'events' => $events,
        'buyers' => $buyers
    ]);

} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database error: ' . $e->getMessage()]);
}
