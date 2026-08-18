<?php

/**
 * Proof of Purchase API
 * Shows proof that a user bought a ticket when the QR code is scanned.
 */

require_once '../../server/config.php';
require_once '../../config/database.php';

$barcode = $_GET['barcode'] ?? null;

if (!$barcode) {
    header('Content-Type: application/json');
    echo json_encode(['success' => false, 'message' => 'Barcode required']);
    exit;
}

try {
    $stmt = $pdo->prepare("
        SELECT t.*, e.event_name, e.event_date, e.event_time, e.location, e.address, 
               u.name as user_name, p.status as payment_status, p.amount, p.quantity, p.ticket_type
        FROM tickets t
        JOIN events e ON t.event_id = e.id
        JOIN users u ON t.user_id = u.id
        JOIN payments p ON t.payment_id = p.id
        WHERE t.barcode = ?
    ");
    $stmt->execute([$barcode]);
    $ticket = $stmt->fetch();

    if (!$ticket || ($ticket['payment_status'] !== 'paid' && $ticket['payment_status'] !== 'success')) {
        header('Content-Type: application/json');
        echo json_encode(['success' => false, 'message' => 'Ticket invalid or payment not confirmed']);
        exit;
    }

    // If request wants JSON (e.g. from an app), return JSON
    if (strpos($_SERVER['HTTP_ACCEPT'] ?? '', 'application/json') !== false) {
        header('Content-Type: application/json');
        echo json_encode([
            'success' => true,
            'status' => $ticket['status'],
            'event_name' => $ticket['event_name'],
            'user_name' => $ticket['user_name'],
            'barcode' => $barcode,
            'amount' => $ticket['amount'],
            'quantity' => $ticket['quantity'],
            'ticket_type' => $ticket['ticket_type']
        ]);
        exit;
    }

    // Otherwise, return a beautiful HTML Proof of Purchase page
    ?>
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Ticket Verification — Eventra</title>
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap" rel="stylesheet">
        <style>
            :root {
                --primary: #10b981;
                --bg: #0f172a;
                --text: #f8fafc;
                --text-light: #94a3b8;
                --card-bg: rgba(30, 41, 59, 0.7);
            }
            body {
                font-family: 'Plus Jakarta Sans', sans-serif;
                background-color: var(--bg);
                background-image: radial-gradient(circle at 50% -20%, #334155, #0f172a 70%);
                color: var(--text);
                margin: 0;
                display: flex;
                align-items: center;
                justify-content: center;
                min-height: 100vh;
                padding: 20px;
                box-sizing: border-box;
            }
            .proof-card {
                background: var(--card-bg);
                backdrop-filter: blur(20px);
                -webkit-backdrop-filter: blur(20px);
                border-radius: 28px;
                box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.1);
                width: 100%;
                max-width: 420px;
                padding: 40px 32px;
                text-align: center;
                animation: slideUp 0.5s cubic-bezier(0.16, 1, 0.3, 1);
            }
            @keyframes slideUp {
                from { opacity: 0; transform: translateY(30px); }
                to { opacity: 1; transform: translateY(0); }
            }
            .status-icon-wrapper {
                position: relative;
                width: 90px;
                height: 90px;
                margin: 0 auto 24px;
            }
            .status-icon {
                width: 100%;
                height: 100%;
                background: linear-gradient(135deg, #10b981, #059669);
                color: white;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 44px;
                box-shadow: 0 10px 25px rgba(16, 185, 129, 0.4);
                animation: popIn 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275) backwards;
                position: relative;
                z-index: 2;
            }
            .pulse-ring {
                position: absolute;
                inset: -15px;
                border-radius: 50%;
                background: rgba(16, 185, 129, 0.2);
                animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
                z-index: 1;
            }
            @keyframes popIn {
                0% { transform: scale(0.5); opacity: 0; }
                100% { transform: scale(1); opacity: 1; }
            }
            @keyframes pulse {
                0%, 100% { transform: scale(1); opacity: 0.8; }
                50% { transform: scale(1.15); opacity: 0.2; }
            }
            h1 { font-size: 26px; font-weight: 800; margin: 0 0 8px; letter-spacing: -0.5px; }
            p { color: var(--text-light); margin: 0 0 36px; font-size: 15px; font-weight: 500; }
            
            .detail-box {
                background: rgba(15, 23, 42, 0.6);
                border-radius: 20px;
                padding: 24px;
                text-align: left;
                margin-bottom: 28px;
                border: 1px solid rgba(255,255,255,0.05);
            }
            .detail-item { 
                margin-bottom: 16px; 
                border-bottom: 1px dashed rgba(255,255,255,0.1); 
                padding-bottom: 12px;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            .detail-item:last-child { margin-bottom: 0; border-bottom: none; padding-bottom: 0; }
            .label { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: var(--text-light); font-weight: 700; }
            .value { font-size: 14px; font-weight: 700; color: #fff; text-align: right; max-width: 60%; word-break: break-word; }
            .value.mono { font-family: 'Courier New', Courier, monospace; letter-spacing: 1px; color: #38bdf8; }
            
            .footer { font-size: 12px; color: var(--text-light); font-weight: 600; display: flex; align-items: center; justify-content: center; gap: 6px; }
            .footer svg { width: 14px; height: 14px; color: var(--primary); }
            
            .badge {
                display: inline-flex;
                align-items: center;
                gap: 4px;
                padding: 4px 12px;
                border-radius: 20px;
                font-size: 11px;
                font-weight: 800;
                text-transform: uppercase;
                background: rgba(16, 185, 129, 0.15);
                color: #34d399;
                border: 1px solid rgba(52, 211, 153, 0.3);
            }
        </style>
    </head>
    <body>
        <div class="proof-card">
            <div class="status-icon-wrapper">
                <div class="pulse-ring"></div>
                <div class="status-icon">✓</div>
            </div>
            <h1>Proof of Purchase</h1>
            <p>This ticket is verified and valid.</p>
            
            <div class="detail-box">
                <div class="detail-item">
                    <span class="label">Event</span>
                    <span class="value"><?php echo htmlspecialchars($ticket['event_name']); ?></span>
                </div>
                <div class="detail-item">
                    <span class="label">Ticket Holder</span>
                    <span class="value"><?php echo htmlspecialchars($ticket['user_name']); ?></span>
                </div>
                <div class="detail-item">
                    <span class="label">Ticket Type</span>
                    <span class="value"><?php echo ($ticket['amount'] == 0) ? 'Free' : htmlspecialchars(strtoupper($ticket['ticket_type'] ?? 'Regular')); ?></span>
                </div>
                <div class="detail-item">
                    <span class="label">Quantity</span>
                    <span class="value"><?php echo htmlspecialchars($ticket['quantity'] ?? '1'); ?></span>
                </div>
                <div class="detail-item">
                    <span class="label">Amount Paid</span>
                    <span class="value"><?php echo ($ticket['amount'] == 0) ? 'Free' : '₦' . number_format($ticket['amount'], 2); ?></span>
                </div>
                <div class="detail-item">
                    <span class="label">Ticket ID</span>
                    <span class="value mono"><?php echo htmlspecialchars($barcode); ?></span>
                </div>
                <div class="detail-item" style="padding-top: 4px;">
                    <span class="label">Status</span>
                    <span class="badge">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                        Confirmed
                    </span>
                </div>
            </div>

            <div class="footer">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                Verified & Secured by Eventra
            </div>
        </div>
    </body>
    </html>
    <?php

} catch (PDOException $e) {
    header('Content-Type: application/json');
    echo json_encode(['success' => false, 'message' => 'Database error: ' . $e->getMessage()]);
}

