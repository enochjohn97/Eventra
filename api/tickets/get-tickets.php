<?php
/**
 * Get Tickets API
 * Retrieves tickets purchased for the client's events
 */
header('Content-Type: application/json');
require_once '../../config/database.php';
require_once '../../includes/middleware/auth.php';

try {
    $auth_id = checkAuth('client');

    // Resolve real_client_id from auth_id
    $client_stmt = $pdo->prepare("SELECT id FROM clients WHERE client_auth_id = ?");
    $client_stmt->execute([$auth_id]);
    $client_row = $client_stmt->fetch();

    if (!$client_row) {
        echo json_encode(['success' => false, 'message' => 'Client profile not found.']);
        exit;
    }
    $real_client_id = $client_row['id'];

    // Get tickets with related information
    $stmt = $pdo->prepare("
        SELECT 
            t.id, 
            t.barcode, 
            t.used, 
            t.created_at as purchase_date,
            e.event_name,
            u.name as buyer_name,
            p.amount as price,
            p.status,
            c.business_name as organiser_name
        FROM tickets t
        JOIN payments p ON t.payment_id = p.id
        JOIN users u ON p.user_id = u.id
        JOIN events e ON p.event_id = e.id
        JOIN clients c ON e.client_id = c.id
        WHERE e.client_id = ?
        ORDER BY t.created_at ASC
    ");
    $stmt->execute([$real_client_id]);
    $tickets = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Get statistics for tickets
    $stats_stmt = $pdo->prepare("
        SELECT 
            SUM(CASE WHEN p.status = 'paid' THEN 1 ELSE 0 END) as total_tickets,
            COALESCE(SUM(CASE WHEN p.status = 'paid' THEN p.amount ELSE 0 END), 0) as total_revenue,
            SUM(CASE WHEN p.status = 'pending' THEN 1 ELSE 0 END) as pending_tickets,
            SUM(CASE WHEN p.status = 'cancelled' OR p.status = 'refunded' THEN 1 ELSE 0 END) as cancelled_tickets
        FROM tickets t
        JOIN payments p ON t.payment_id = p.id
        JOIN events e ON p.event_id = e.id
        WHERE e.client_id = ?
    ");
    $stats_stmt->execute([$real_client_id]);
    $stats = $stats_stmt->fetch(PDO::FETCH_ASSOC);

    echo json_encode([
        'success' => true,
        'tickets' => $tickets,
        'stats' => $stats
    ]);

} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database error: ' . $e->getMessage()]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'General error: ' . $e->getMessage()]);
}
