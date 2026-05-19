<?php

/**
 * Get Admin Dashboard Stats API
 * Provides comprehensive statistics for admin dashboard
 * OPTIMIZED: Combined 14+ separate queries into 4 optimized queries
 */

header('Content-Type: application/json');
require_once '../../config/database.php';

// Check authentication
require_once '../../includes/middleware/auth.php';
$admin_id = checkAuth('admin');

try {
    // 1. Consolidated count stats (single query)
    $stats_sql = "
        SELECT 
            (SELECT COUNT(*) FROM users u JOIN auth_accounts a ON u.user_auth_id = a.id WHERE u.deleted_at IS NULL AND a.deleted_at IS NULL) as total_users,
            (SELECT COUNT(*) FROM clients c JOIN auth_accounts a ON c.client_auth_id = a.id WHERE c.deleted_at IS NULL AND a.deleted_at IS NULL) as total_clients,
            (SELECT COUNT(*) FROM events WHERE status = 'published' AND deleted_at IS NULL) as total_events,
            (SELECT COUNT(*) FROM auth_accounts WHERE is_online = 1 AND last_seen >= DATE_SUB(NOW(), INTERVAL 10 MINUTE) AND role = 'user' AND deleted_at IS NULL) as online_users,
            (SELECT COUNT(*) FROM auth_accounts WHERE is_online = 1 AND last_seen >= DATE_SUB(NOW(), INTERVAL 10 MINUTE) AND role = 'client' AND deleted_at IS NULL) as online_clients,
            (SELECT COALESCE(SUM(p.amount), 0) FROM payments p WHERE p.status = 'paid') as total_revenue,
            (SELECT COUNT(*) FROM payments WHERE status = 'pending') as pending_payments,
            (SELECT COUNT(*) FROM tickets WHERE used = 1 AND DATE(used_at) = CURDATE()) as user_checked_in,
            (SELECT COUNT(*) FROM clients c JOIN auth_accounts a ON c.client_auth_id = a.id WHERE c.verification_status = 'verified' AND c.deleted_at IS NULL AND a.deleted_at IS NULL) as clients_verified,
            (SELECT COUNT(*) FROM clients c JOIN auth_accounts a ON c.client_auth_id = a.id WHERE c.verification_status != 'verified' AND c.deleted_at IS NULL AND a.deleted_at IS NULL) as clients_unverified
    ";
    
    $stmt = $pdo->prepare($stats_sql);
    $stmt->execute();
    $stats = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$stats) {
        throw new Exception('Failed to fetch stats');
    }
    
    // 2. Recent Activities (Fetch up to 100 for the modal, filter out admins if specified or just get all)
    $activities_stmt = $pdo->prepare("
        SELECT al.event_type as type, al.details as message, al.created_at 
        FROM auth_logs al 
        LEFT JOIN auth_accounts a ON al.auth_id = a.id
        WHERE a.role IN ('user', 'client') OR al.auth_id IS NULL
        ORDER BY al.created_at DESC 
        LIMIT 100
    ");
    $activities_stmt->execute();
    $recent_activities = $activities_stmt->fetchAll(PDO::FETCH_ASSOC);

    // 3. Top Users and Active Clients (optimized with GROUP BY instead of subqueries)
    $top_users_stmt = $pdo->prepare("
        SELECT u.id, u.name, u.profile_pic, u.state, a.is_online,
               IF(a.is_online = 1, 'active', 'offline') as status,
               COUNT(t.id) as ticket_count
        FROM users u
        JOIN auth_accounts a ON u.user_auth_id = a.id
        LEFT JOIN tickets t ON u.id = t.user_id
        WHERE u.deleted_at IS NULL
        GROUP BY u.id
        ORDER BY ticket_count DESC
        LIMIT 5
    ");
    $top_users_stmt->execute();
    $top_users = $top_users_stmt->fetchAll(PDO::FETCH_ASSOC);

    $active_clients_stmt = $pdo->prepare("
        SELECT c.id, c.business_name as name, c.profile_pic, c.company, c.state, a.email, a.is_online,
               IF(a.is_online = 1, 'active', 'offline') as status,
               COUNT(e.id) as event_count
        FROM clients c
        JOIN auth_accounts a ON c.client_auth_id = a.id
        LEFT JOIN events e ON c.id = e.client_id AND e.deleted_at IS NULL
        WHERE c.deleted_at IS NULL AND a.deleted_at IS NULL
        GROUP BY c.id, a.is_online
        ORDER BY a.is_online DESC, event_count DESC
        LIMIT 10
    ");
    $active_clients_stmt->execute();
    $active_clients = $active_clients_stmt->fetchAll(PDO::FETCH_ASSOC);

    // 4. Upcoming and Past Events
    $events_stmt = $pdo->prepare("
        SELECT e.id, e.event_name, e.event_date, e.image_path, c.business_name as client_name,
               IF(e.event_date >= CURDATE(), 'upcoming', 'past') as event_type
        FROM events e
        JOIN clients c ON e.client_id = c.id
        WHERE e.status = 'published' AND e.deleted_at IS NULL
        ORDER BY IF(e.event_date >= CURDATE(), 0, 1) ASC,
                 IF(e.event_date >= CURDATE(), e.event_date, 0) ASC,
                 IF(e.event_date >= CURDATE(), 0, e.event_date) DESC
        LIMIT 20
    ");
    $events_stmt->execute();
    $all_events = $events_stmt->fetchAll(PDO::FETCH_ASSOC);
    
    $upcoming_events = array_filter($all_events, fn($e) => $e['event_type'] === 'upcoming');
    $past_events = array_filter($all_events, fn($e) => $e['event_type'] === 'past');

    echo json_encode([
        'success' => true,
        'stats' => [
            'total_users' => (int) $stats['total_users'],
            'active_users' => (int) $stats['online_users'],
            'user_checked_in' => (int) $stats['user_checked_in'],
            'online_clients' => (int) $stats['online_clients'],
            'total_clients' => (int) $stats['total_clients'],
            'clients_verified' => (int) $stats['clients_verified'],
            'clients_unverified' => (int) $stats['clients_unverified'],
            'total_events' => (int) $stats['total_events'],
            'published_events' => (int) $stats['total_events'],
            'total_revenue' => (float) $stats['total_revenue'],
            'platform_earnings' => (float) ($stats['total_revenue'] * 0.30),
            'pending_payments' => (int) $stats['pending_payments'],
            'restored_events' => 0,
            'total_clients_events' => (int) $stats['total_events']
        ],
        'recent_activities' => $recent_activities,
        'top_users' => $top_users,
        'active_clients' => $active_clients,
        'upcoming_events' => array_values($upcoming_events),
        'past_events' => array_values($past_events),
        'recent_logs' => $recent_activities
    ]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Failed to fetch admin stats.']);
}
