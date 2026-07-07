<?php
/**
 * Get Chart Data API
 * Provides time-series data for dashboard charts
 */

// MUST be the first two lines — no whitespace, no BOM before <?php
require_once __DIR__ . '/../../server/config.php'; 
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/middleware/auth.php';

// Then immediately set JSON response header
header('Content-Type: application/json');

// Handle CORS preflight — must come before any logic
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Authenticate (allow both admin and client)
$user_id = checkAuth();

// Fallback: If session role is missing, fetch it
if (!isset($_SESSION['role'])) {
    $stmt = $pdo->prepare("SELECT role FROM auth_accounts WHERE id = ?");
    $stmt->execute([$user_id]);
    $role = $stmt->fetchColumn();
    $_SESSION['role'] = $role;
    $_SESSION['user_role'] = $role;
}

$user_role = $_SESSION['user_role'] ?? $_SESSION['role'] ?? 'client';

$period = $_GET['period'] ?? '7days'; // 7days, 30days, 90days

// Determine date range
$date_ranges = [
    '7days' => 7,
    '30days' => 30,
    '90days' => 90
];

$days = $date_ranges[$period] ?? 7;
$start_date = date('Y-m-d', strtotime("-{$days} days"));

try {
    if ($user_role === 'admin') {
        // Admin chart data - events, tickets, users over time

        // Events created per day
        $stmt = $pdo->prepare("
            SELECT DATE(created_at) as date, COUNT(*) as count
            FROM events
            WHERE created_at >= ?
            GROUP BY DATE(created_at)
            ORDER BY date ASC
        ");
        $stmt->execute([$start_date]);
        $events_data = $stmt->fetchAll();

        // Tickets sold per day (must join with payments to check 'paid' status)
        $stmt = $pdo->prepare("
            SELECT DATE(t.created_at) as date, COUNT(t.id) as count
            FROM tickets t
            JOIN payments p ON t.payment_id = p.id
            WHERE t.created_at >= ? AND p.status = 'paid'
            GROUP BY DATE(t.created_at)
            ORDER BY date ASC
        ");
        $stmt->execute([$start_date]);
        $tickets_data = $stmt->fetchAll();

        // Revenue per day
        $stmt = $pdo->prepare("
            SELECT DATE(paid_at) as date, SUM(amount) as revenue
            FROM payments
            WHERE status = 'paid' AND paid_at >= ?
            GROUP BY DATE(paid_at)
            ORDER BY date ASC
        ");
        $stmt->execute([$start_date]);
        $revenue_query_data = $stmt->fetchAll();

        // Users registered per day
        $stmt = $pdo->prepare("
            SELECT DATE(created_at) as date, COUNT(*) as count
            FROM users
            WHERE created_at >= ?
            GROUP BY DATE(created_at)
            ORDER BY date ASC
        ");
        $stmt->execute([$start_date]);
        $users_data = $stmt->fetchAll();

        // Format data for Chart.js
        $labels = [];
        $events_counts = [];
        $tickets_counts = [];
        $revenue_data = [];
        $users_counts = [];

        // Create a complete date range
        for ($i = $days - 1; $i >= 0; $i--) {
            $date = date('Y-m-d', strtotime("-{$i} days"));
            $labels[] = date('M d', strtotime($date));

            // Find matching data or use 0
            $events_counts[] = findCountForDate($events_data, $date);
            $tickets_counts[] = findCountForDate($tickets_data, $date);
            $revenue_data[] = findRevenueForDate($revenue_query_data, $date);
            $users_counts[] = findCountForDate($users_data, $date);
        }

        echo json_encode([
            'success' => true,
            'period' => $period,
            'labels' => $labels,
            'datasets' => [
                [
                    'label' => 'Events Created',
                    'data' => $events_counts,
                    'borderColor' => 'rgb(59, 130, 246)',
                    'backgroundColor' => 'rgba(59, 130, 246, 0.1)'
                ],
                [
                    'label' => 'Tickets Sold',
                    'data' => $tickets_counts,
                    'borderColor' => 'rgb(16, 185, 129)',
                    'backgroundColor' => 'rgba(16, 185, 129, 0.1)'
                ],
                [
                    'label' => 'Users Registered',
                    'data' => $users_counts,
                    'borderColor' => 'rgb(245, 158, 11)',
                    'backgroundColor' => 'rgba(245, 158, 11, 0.1)'
                ]
            ],
            'revenue' => [
                'label' => 'Revenue (₦)',
                'data' => $revenue_data
            ]
        ]);
    } elseif ($user_role === 'client') {
        // checkAuth('client') already returns clients.id
        $real_client_id = $user_id;

        // Verify client exists
        $stmt = $pdo->prepare("SELECT id FROM clients WHERE id = ?");
        $stmt->execute([$real_client_id]);
        if (!$stmt->fetch()) {
            echo json_encode(['success' => false, 'message' => 'Client profile not found.']);
            exit;
        }

        // Client chart data - ticket sales for their events
        $stmt = $pdo->prepare("
            SELECT DATE(t.created_at) as date, COUNT(t.id) as count
            FROM tickets t
            JOIN payments p ON t.payment_id = p.id
            JOIN events e ON p.event_id = e.id
            WHERE e.client_id = ? AND t.created_at >= ? AND p.status = 'paid'
            GROUP BY DATE(t.created_at)
            ORDER BY date ASC
        ");
        $stmt->execute([$real_client_id, $start_date]);
        $sales_data = $stmt->fetchAll();

        // Client revenue per day
        $stmt = $pdo->prepare("
            SELECT DATE(p.paid_at) as date, SUM(p.amount) as revenue
            FROM payments p
            JOIN events e ON p.event_id = e.id
            WHERE e.client_id = ? AND p.status = 'paid' AND p.paid_at >= ?
            GROUP BY DATE(p.paid_at)
            ORDER BY date ASC
        ");
        $stmt->execute([$real_client_id, $start_date]);
        $client_revenue_data = $stmt->fetchAll();

        // Format data
        $labels = [];
        $tickets_counts = [];
        $revenue_data = [];

        for ($i = $days - 1; $i >= 0; $i--) {
            $date = date('Y-m-d', strtotime("-{$i} days"));
            $labels[] = date('M d', strtotime($date));

            $tickets_counts[] = findCountForDate($sales_data, $date);
            $revenue_data[] = findRevenueForDate($client_revenue_data, $date);
        }

        echo json_encode([
            'success' => true,
            'period' => $period,
            'labels' => $labels,
            'datasets' => [
                [
                    'label' => 'Tickets Sold',
                    'data' => $tickets_counts,
                    'borderColor' => 'rgb(139, 92, 246)',
                    'backgroundColor' => 'rgba(139, 92, 246, 0.1)'
                ],
                [
                    'label' => 'Revenue (₦)',
                    'data' => $revenue_data,
                    'borderColor' => 'rgb(16, 185, 129)',
                    'backgroundColor' => 'rgba(16, 185, 129, 0.1)'
                ]
            ]
        ]);
    } else {
        echo json_encode(['success' => false, 'message' => 'Invalid role for chart data']);
    }
} catch (PDOException $e) {
    http_response_code(500);
    error_log("Chart data error: " . $e->getMessage());
    echo json_encode(['success' => false, 'message' => 'Failed to fetch chart data']);
}

/**
 * Helper function to find count for a specific date
 */
function findCountForDate($data, $date)
{
    foreach ($data as $row) {
        if ($row['date'] === $date) {
            return (int) $row['count'];
        }
    }
    return 0;
}

/**
 * Helper function to find revenue for a specific date
 */
function findRevenueForDate($data, $date)
{
    foreach ($data as $row) {
        if ($row['date'] === $date) {
            return (float) ($row['revenue'] ?? 0);
        }
    }
    return 0;
}
