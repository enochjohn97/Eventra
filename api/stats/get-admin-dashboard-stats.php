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
    
    $failed_sections = [];
    try {
    $stmt = $pdo->prepare($stats_sql);
    $stmt->execute();
    $stats = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$stats) {
        throw new Exception('Failed to fetch stats');
    }
    } catch (Throwable $sec_err) {
        // One failing query must not take the whole dashboard down — log the
        // real cause and continue with zeroed counters.
        error_log('[get-admin-dashboard-stats] stats query failed: ' . $sec_err->getMessage());
        $failed_sections[] = 'stats';
        $stats = array_fill_keys([
            'total_users', 'online_users', 'user_checked_in', 'online_clients',
            'total_clients', 'clients_verified', 'clients_unverified',
            'total_events', 'total_revenue', 'pending_payments',
        ], 0);
    }
    
    // 2. Recent Activities — mix of logins and ticket purchases so the feed reads
    //    as real platform activity, not just "someone logged in".
    try {
    $activities_stmt = $pdo->prepare("
        (SELECT al.event_type AS type, al.details AS message, al.created_at, 1 AS rank_order
         FROM auth_logs al
         LEFT JOIN auth_accounts a ON al.auth_id = a.id
         WHERE a.role IN ('user','client') OR al.auth_id IS NULL
         ORDER BY al.created_at DESC LIMIT 60)
         UNION ALL
        (SELECT 'ticket_purchase' AS type,
                CONCAT(u.name, ' purchased ', CAST(COUNT(DISTINCT t.id) AS CHAR), ' ticket(s) for ', e.event_name) AS message,
                p.paid_at AS created_at, 2 AS rank_order
         FROM payments p
         JOIN tickets t ON t.payment_id = p.id AND t.status <> 'cancelled'
         JOIN users u ON u.id = p.user_id
         JOIN events e ON e.id = p.event_id
         WHERE p.status = 'paid' AND p.paid_at IS NOT NULL
         GROUP BY p.id, p.paid_at, u.name, e.event_name
         ORDER BY p.paid_at DESC LIMIT 60)
         ORDER BY created_at DESC LIMIT 100
    ");
    $activities_stmt->execute();
    $recent_activities = $activities_stmt->fetchAll(PDO::FETCH_ASSOC);
    } catch (Throwable $sec_err) {
        error_log('[get-admin-dashboard-stats] activities query failed: ' . $sec_err->getMessage());
        $failed_sections[] = 'recent_activities';
        $recent_activities = [];
    }

    // 3. Top Users and Active Clients (optimized with GROUP BY instead of subqueries)
    try {
    $top_users_stmt = $pdo->prepare("
        SELECT u.id, u.name, u.profile_pic, u.state, 
               IF(a.is_online = 1 AND a.last_seen >= DATE_SUB(NOW(), INTERVAL 10 MINUTE), 1, 0) as is_online,
               IF(a.is_online = 1 AND a.last_seen >= DATE_SUB(NOW(), INTERVAL 10 MINUTE), 'active', 'offline') as status,
               COUNT(t.id) as ticket_count
        FROM users u
        JOIN auth_accounts a ON u.user_auth_id = a.id
        LEFT JOIN tickets t ON u.id = t.user_id
        WHERE u.deleted_at IS NULL
        GROUP BY u.id, a.is_online, a.last_seen
        ORDER BY ticket_count DESC
        LIMIT 5
    ");
    $top_users_stmt->execute();
    $top_users = $top_users_stmt->fetchAll(PDO::FETCH_ASSOC);
    } catch (Throwable $sec_err) {
        error_log('[get-admin-dashboard-stats] top users query failed: ' . $sec_err->getMessage());
        $failed_sections[] = 'top_users';
        $top_users = [];
    }

    try {
    $active_clients_stmt = $pdo->prepare("
        SELECT c.id, c.business_name as name, c.profile_pic, c.company, c.state, a.email, 
               IF(a.is_online = 1 AND a.last_seen >= DATE_SUB(NOW(), INTERVAL 10 MINUTE), 1, 0) as is_online,
               IF(a.is_online = 1 AND a.last_seen >= DATE_SUB(NOW(), INTERVAL 10 MINUTE), 'active', 'offline') as status,
               COUNT(e.id) as event_count
        FROM clients c
        JOIN auth_accounts a ON c.client_auth_id = a.id
        LEFT JOIN events e ON c.id = e.client_id AND e.deleted_at IS NULL
        WHERE c.deleted_at IS NULL AND a.deleted_at IS NULL
        GROUP BY c.id, a.is_online, a.last_seen
        ORDER BY is_online DESC, event_count DESC
        LIMIT 10
    ");
    $active_clients_stmt->execute();
    $active_clients = $active_clients_stmt->fetchAll(PDO::FETCH_ASSOC);
    } catch (Throwable $sec_err) {
        error_log('[get-admin-dashboard-stats] active clients query failed: ' . $sec_err->getMessage());
        $failed_sections[] = 'active_clients';
        $active_clients = [];
    }

    // 4. Upcoming and Past Events
    // 2026-10-02: no artificial cap — the dashboard must show ALL events
    // (upcoming + past), not just the first few hundred.
    try {
    $events_stmt = $pdo->prepare("
        SELECT e.id, e.event_name, e.event_date, e.image_path, c.business_name as client_name,
               IF(e.event_date >= CURDATE(), 'upcoming', 'past') as event_type
        FROM events e
        JOIN clients c ON e.client_id = c.id
        WHERE e.status = 'published' AND e.deleted_at IS NULL
        ORDER BY IF(e.event_date >= CURDATE(), 0, 1) ASC,
                 IF(e.event_date >= CURDATE(), e.event_date, 0) ASC,
                 IF(e.event_date >= CURDATE(), 0, e.event_date) DESC
    ");
    $events_stmt->execute();
    $all_events = $events_stmt->fetchAll(PDO::FETCH_ASSOC);
    } catch (Throwable $sec_err) {
        error_log('[get-admin-dashboard-stats] events query failed: ' . $sec_err->getMessage());
        $failed_sections[] = 'events';
        $all_events = [];
    }

    foreach ($all_events as &$ev) {
        if (!empty($ev['image_path'])) {
            $img = str_replace('\\', '/', $ev['image_path']);
            if (preg_match('#(/public/.+)$#i', $img, $m)) {
                $ev['image_path'] = $m[1];
            } elseif (preg_match('#(public/assets/.+)$#i', $img, $m)) {
                $ev['image_path'] = '/' . $m[1];
            }
        }
    }
    
    $upcoming_events = array_values(array_filter($all_events, fn($e) => $e['event_type'] === 'upcoming'));
    $past_events = array_values(array_filter($all_events, fn($e) => $e['event_type'] === 'past'));

    echo json_encode([
        'success' => true,
        'failed_sections' => $failed_sections,
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
    error_log('[get-admin-dashboard-stats] Fatal: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Failed to fetch admin stats.']);
}
