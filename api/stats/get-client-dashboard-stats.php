<?php
/**
 * Get Client Dashboard Stats API
 * Provides statistics for client dashboard
 */

// MUST be the first two lines — no whitespace, no BOM before <?php
require_once __DIR__ . '/../../config.php'; 
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/middleware/auth.php';

// Then immediately set JSON response header
header('Content-Type: application/json');

// Handle CORS preflight — must come before any logic
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Authenticate via robust middleware
$auth_id = checkAuth('client');

// Fallback: If session role is missing, fetch it
if (!isset($_SESSION['role'])) {
    $stmt = $pdo->prepare("SELECT role FROM auth_accounts WHERE id = ?");
    $stmt->execute([$auth_id]);
    $role = $stmt->fetchColumn();
    $_SESSION['role'] = $role;
    $_SESSION['user_role'] = $role;
}


try {
    // 1. Resolve real_client_id from session (standardized role-id) or from auth mappings
    $real_client_id = $_SESSION['client_id'] ?? null;
    if (!$real_client_id) {
        $stmt = $pdo->prepare("SELECT id FROM clients WHERE client_auth_id = ?");
        $stmt->execute([$auth_id]);
        $clientRow = $stmt->fetch();
        if (!$clientRow) {
            throw new Exception("Client profile not found for authenticated user.");
        }
        $real_client_id = $clientRow['id'];
    }

    // 2. Client Revenue — SUM actual payment amounts (not event prices)
    $stmt = $pdo->prepare("
        SELECT COALESCE(SUM(p.amount), 0) AS total
        FROM payments p
        JOIN events e ON p.event_id = e.id
        WHERE e.client_id = ? AND p.status = 'paid'
    ");
    $stmt->execute([$real_client_id]);
    $client_revenue = $stmt->fetch()['total'];

    // 3. Total Tickets Sold
    $stmt = $pdo->prepare("
        SELECT COUNT(t.id) as total 
        FROM tickets t
        JOIN payments p ON t.payment_id = p.id
        JOIN events e ON p.event_id = e.id
        WHERE e.client_id = ? AND p.status = 'paid'
    ");
    $stmt->execute([$real_client_id]);
    $total_tickets = $stmt->fetch()['total'];

    // 3.5 Total Unique Users (Attendees)
    $stmt = $pdo->prepare("
        SELECT COUNT(DISTINCT p.user_id) as total
        FROM payments p
        JOIN events e ON p.event_id = e.id
        WHERE e.client_id = ? AND p.status = 'paid'
    ");
    $stmt->execute([$real_client_id]);
    $total_users = $stmt->fetch()['total'];

    // 4. Total Events  
    $stmt = $pdo->prepare("SELECT COUNT(*) as total FROM events WHERE client_id = ? AND deleted_at IS NULL AND status = 'published'");
    $stmt->execute([$real_client_id]);
    $total_events = $stmt->fetch()['total'];

    // 5. Upcoming Events (same as total events - show all created events)
    $stmt = $pdo->prepare("SELECT COUNT(*) as total FROM events WHERE client_id = ? AND deleted_at IS NULL AND status = 'published'");
    $stmt->execute([$real_client_id]);
    $upcoming_events_count = $stmt->fetch()['total'];

    // 6. Detailed Attendee List (With profile pics)
    $stmt = $pdo->prepare("
        SELECT u.name, a.email, u.profile_pic, e.event_name, p.paid_at, t.barcode, t.used, p.amount, t.created_at, p.paystack_response,
               p.amount / p.quantity as individual_price,
               CASE WHEN p.amount = 0 THEN 'Free' ELSE CONCAT('₦', FORMAT(p.amount / p.quantity, 0)) END as price_display
        FROM tickets t
        JOIN payments p ON t.payment_id = p.id
        JOIN users u ON p.user_id = u.id
        JOIN auth_accounts a ON u.user_auth_id = a.id
        JOIN events e ON p.event_id = e.id
        WHERE e.client_id = ? AND p.status = 'paid'
        ORDER BY t.created_at DESC
        LIMIT 10
    ");
    $stmt->execute([$real_client_id]);
    $attendees = $stmt->fetchAll();

    // 7. Event Performance Breakdown
    $stmt = $pdo->prepare("
        SELECT e.id, e.event_name, e.event_date, e.status, e.image_path, e.price,
               COUNT(t.id) as tickets_sold, 
               COALESCE(SUM(p.amount), 0) as revenue,
               CASE WHEN e.price = 0 OR e.price IS NULL THEN 'Free' ELSE CONCAT('₦', FORMAT(e.price, 0)) END as price_display
        FROM events e
        LEFT JOIN payments p ON e.id = p.event_id AND p.status = 'paid'
        LEFT JOIN tickets t ON p.id = t.payment_id
        WHERE e.client_id = ? AND e.deleted_at IS NULL AND e.status = 'published'
        GROUP BY e.id
        ORDER BY e.event_date ASC
    ");
    $stmt->execute([$real_client_id]);
    $event_breakdown = $stmt->fetchAll();

    // 8. Total Media Items
    $stmt = $pdo->prepare("
        SELECT 
            (SELECT COUNT(*) FROM media WHERE client_id = ? AND is_deleted = 0) +
            (SELECT COUNT(*) FROM media_folders WHERE client_id = ? AND is_deleted = 0) as total
    ");
    $stmt->execute([$real_client_id, $real_client_id]);
    $total_media = $stmt->fetch()['total'];

    echo json_encode([
        'success' => true,
        'stats' => [
            'total_revenue' => (float) $client_revenue,
            'total_tickets' => (int) $total_tickets,
            'total_events' => (int) $total_events,
            'upcoming_events' => (int) $upcoming_events_count,
            'total_users' => (int) $total_users,
            'total_media' => (int) $total_media
        ],
        'attendees' => $attendees,
        'events' => $event_breakdown
    ]);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Failed to fetch client stats: ' . $e->getMessage()]);
}
