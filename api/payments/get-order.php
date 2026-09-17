<?php

/**
 * Get Order API — JSON status endpoint for payment polling.
 *
 * The public HTML receipt was removed: it allowed anyone holding only a
 * reference to read buyer name + email. This endpoint now requires the
 * buyer (or an admin/organizer) to be authenticated and returns only the
 * fields the polling UI needs.
 */

require_once __DIR__ . '/../../server/config.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/middleware/auth.php';

header('Content-Type: application/json');

try {
    // 1. Get reference
    $reference = trim($_GET['reference'] ?? '');
    if (empty($reference)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'reference is required.']);
        exit;
    }

    // 2. Authentication IS required. The reference alone must never expose
    //    order/PII data. Bearer-token (mobile) and session (web) both work.
    $authId = checkAuth(); // exits with 403 JSON when unauthenticated
    if (!$authId) {
        http_response_code(401);
        echo json_encode(['success' => false, 'message' => 'Authentication required.']);
        exit;
    }

    $role = $_SESSION['role'] ?? 'user';

    // 3. Fetch order with an ownership scope baked into the query
    $sql = "
        SELECT
            o.id, o.user_id, o.event_id, o.organizer_id, o.amount, o.payment_status, o.refund_status,
            o.transaction_reference, o.created_at,
            e.event_name, e.event_date, e.event_time, e.location, e.address, e.image_path, e.price,
            e.metadata, e.client_id,
            u.name as user_name,
            p.quantity, p.ticket_type,
            (SELECT t.barcode FROM tickets t WHERE t.order_id = o.id ORDER BY t.id DESC LIMIT 1) AS barcode
        FROM orders o
        JOIN events e ON o.event_id = e.id
        JOIN users u ON o.user_id = u.id
        LEFT JOIN payments p ON p.reference COLLATE utf8mb4_unicode_ci = o.transaction_reference COLLATE utf8mb4_unicode_ci
        WHERE o.transaction_reference = ?
        LIMIT 1
    ";
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$reference]);
    $order = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$order) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Order not found.']);
        exit;
    }

    // 4. Authorization: buyer, platform admin, or the organizer client only
    $isAuthorized = false;
    if ($role === 'admin') {
        $isAuthorized = true;
    } elseif ($role === 'user') {
        // The polling session may carry either users.id or auth_accounts.id — accept both.
        $ownerStmt = $pdo->prepare("SELECT id, user_auth_id FROM users WHERE id = ? OR user_auth_id = ? LIMIT 1");
        $ownerStmt->execute([(int) $authId, (int) $authId]);
        $owner = $ownerStmt->fetch(PDO::FETCH_ASSOC);
        $isAuthorized = $owner && ((int) $owner['id'] === (int) $order['user_id']);
    } elseif ($role === 'client') {
        $clientStmt = $pdo->prepare("SELECT id FROM clients WHERE id = ? OR client_auth_id = ? LIMIT 1");
        $clientStmt->execute([(int) $authId, (int) $authId]);
        $clientId = $clientStmt->fetchColumn();
        $isAuthorized = $clientId && ((int) $clientId === (int) $order['organizer_id']);
    }

    if (!$isAuthorized) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'You do not have permission to view this order.']);
        exit;
    }

    // 5. Strip buyer PII from the payload — the polling UI doesn't need it
    unset($order['user_id'], $order['organizer_id'], $order['user_name'], $order['client_id']);

    // Decode event metadata for tiered pricing fields
    if (!empty($order['metadata'])) {
        $meta = json_decode($order['metadata'], true);
        if (is_array($meta)) {
            foreach (['regular_price', 'vip_price', 'premium_price'] as $priceKey) {
                if (isset($meta[$priceKey])) {
                    $order[$priceKey] = $meta[$priceKey];
                }
            }
        }
    }
    unset($order['metadata']);

    echo json_encode([
        'success' => true,
        'status'  => $order['payment_status'],
        'order'   => $order,
    ]);
    exit;

} catch (Throwable $e) {
    error_log("[get-order.php] Fatal Error: " . $e->getMessage() . " in " . $e->getFile() . ":" . $e->getLine());
    if (ob_get_length()) ob_clean();
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Error retrieving order status. Please try again.',
    ]);
    exit;
}
