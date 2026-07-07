<?php

/**
 * Get Order API / Public Receipt
 * Returns order details + ticket info.
 * Supports JSON (for app) and HTML (for public receipt scan).
 */

require_once __DIR__ . '/../../server/config.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/middleware/auth.php';

try {
    // 1. Get reference
    $reference = trim($_GET['reference'] ?? '');
    if (empty($reference)) {
        header('Content-Type: application/json');
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'reference is required.']);
        exit;
    }

    // 2. Fetch order data (Publicly accessible via secret reference)
    // We use a more robust join and handle possible collation mismatches.
    $stmt = $pdo->prepare("
        SELECT 
            o.id, o.event_id, o.amount, o.payment_status, o.refund_status,
            o.transaction_reference, o.created_at,
            e.event_name, e.event_date, e.event_time, e.location, e.address, e.image_path, e.price,
            e.metadata,
            t.barcode, u.name as user_name, a.email as user_email,
            p.quantity, p.ticket_type
        FROM orders o
        JOIN events e ON o.event_id = e.id
        JOIN users u ON o.user_id = u.id
        JOIN auth_accounts a ON u.user_auth_id = a.id
        LEFT JOIN payments p ON p.reference COLLATE utf8mb4_unicode_ci = o.transaction_reference COLLATE utf8mb4_unicode_ci
        LEFT JOIN tickets t ON t.order_id = o.id
        WHERE o.transaction_reference = ?
        ORDER BY t.id DESC
        LIMIT 1
    ");
    $stmt->execute([$reference]);
    $order = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$order) {
        header('Content-Type: application/json');
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Order not found.']);
        exit;
    }

    // Decode metadata if present to expose tiered pricing (vip_price, premium_price etc)
    if (!empty($order['metadata'])) {
        $meta = json_decode($order['metadata'], true);
        if (is_array($meta)) {
            $order = array_merge($order, $meta);
        }
    }

    // 3. Handle JSON request
    if (strpos($_SERVER['HTTP_ACCEPT'] ?? '', 'application/json') !== false || isset($_GET['json'])) {
        header('Content-Type: application/json');
        echo json_encode([
            'success' => true,
            'order' => $order
        ]);
        exit;
    }

    // 4. Return HTML Receipt
    ?>
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Payment Receipt — <?php echo htmlspecialchars($order['event_name']); ?></title>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
        <style>
            body { font-family: 'Inter', sans-serif; background: #f4f7f6; color: #1a202c; margin: 0; padding: 40px 20px; }
            .receipt-container { max-width: 500px; margin: 0 auto; background: white; border-radius: 20px; box-shadow: 0 15px 35px rgba(0,0,0,0.05); overflow: hidden; }
            .header { background: #2ecc71; color: white; padding: 30px; text-align: center; }
            .header h1 { margin: 0; font-size: 24px; font-weight: 800; }
            .content { padding: 40px; }
            .order-item { display: flex; justify-content: space-between; margin-bottom: 20px; border-bottom: 1px dashed #edf2f7; padding-bottom: 15px; }
            .order-item:last-child { border-bottom: none; }
            .label { color: #718096; font-size: 13px; font-weight: 600; text-transform: uppercase; }
            .value { font-weight: 700; text-align: right; }
            .total-row { margin-top: 30px; padding: 20px; background: #f8fafc; border-radius: 12px; display: flex; justify-content: space-between; align-items: center; }
            .total-label { font-weight: 800; font-size: 18px; }
            .total-value { font-weight: 800; font-size: 24px; color: #2ecc71; }
            .footer { text-align: center; padding: 20px; color: #a0aec0; font-size: 12px; }
        </style>
    </head>
    <body>
        <div class="receipt-container">
            <div class="header">
                <h1>Payment Receipt</h1>
                <p style="margin: 5px 0 0; opacity: 0.9;">Transaction Successful</p>
            </div>
            <div class="content">
                <div class="order-item">
                    <span class="label">Event</span>
                    <span class="value"><?php echo htmlspecialchars($order['event_name']); ?></span>
                </div>
                <div class="order-item">
                    <span class="label">Reference</span>
                    <span class="value" style="font-family: monospace;"><?php echo htmlspecialchars($order['transaction_reference']); ?></span>
                </div>
                <div class="order-item">
                    <span class="label">Customer</span>
                    <span class="value"><?php echo htmlspecialchars($order['user_name']); ?></span>
                </div>
                <div class="order-item">
                    <span class="label">Date</span>
                    <span class="value"><?php echo date('M d, Y H:i', strtotime($order['created_at'])); ?></span>
                </div>
                <div class="order-item">
                    <span class="label">Ticket Type</span>
                    <span class="value"><?php echo htmlspecialchars(strtoupper($order['ticket_type'] ?? 'Regular')); ?></span>
                </div>
                <div class="order-item">
                    <span class="label">Quantity</span>
                    <span class="value"><?php echo htmlspecialchars($order['quantity'] ?? '1'); ?></span>
                </div>
                
                <div class="total-row">
                    <span class="total-label">Amount Paid</span>
                    <span class="total-value">₦<?php echo number_format($order['amount'], 2); ?></span>
                </div>
            </div>
            <div class="footer">
                Thank you for using Eventra!<br>
                This is an official transaction record.
            </div>
        </div>
    </body>
    </html>
    <?php

} catch (Throwable $e) {
    error_log("[get-order.php] Fatal Error: " . $e->getMessage() . " in " . $e->getFile() . ":" . $e->getLine());
    if (ob_get_length()) ob_clean();
    header('Content-Type: application/json');
    http_response_code(500);
    echo json_encode([
        'success' => false, 
        'message' => 'Error retrieving receipt: ' . $e->getMessage(),
        'file' => basename($e->getFile()),
        'line' => $e->getLine()
    ]);
}


