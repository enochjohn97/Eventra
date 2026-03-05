<?php
/**
 * Unified Search API
 * Searches across events, tickets, users, and media with advanced filters
 */
header('Content-Type: application/json');
require_once '../../config/database.php';
require_once '../../includes/middleware/auth.php';

// Check authentication
$userId = checkAuth();
$userRole = $_SESSION['role'];

$query = $_GET['q'] ?? '';
$type = $_GET['type'] ?? 'all'; // all, events, tickets, users, media
$category = $_GET['category'] ?? null;
$priority = $_GET['priority'] ?? null;
$status = $_GET['status'] ?? null;
$dateFrom = $_GET['date_from'] ?? null;
$dateTo = $_GET['date_to'] ?? null;

if (strlen($query) < 2 && !$category && !$priority && !$status && !$dateFrom) {
    echo json_encode(['success' => true, 'results' => []]);
    exit;
}

$searchTerm = "%$query%";
$results = [
    'events' => [],
    'tickets' => [],
    'users' => [],
    'media' => []
];

try {
    // 1. Search Events
    if ($type === 'all' || $type === 'events') {
        $sql = "SELECT e.id, e.event_name as title, e.event_type as subtitle, e.category, e.price, e.state, e.status, e.event_date, e.event_time, e.image_path, e.priority 
                FROM events e
                LEFT JOIN clients c ON e.client_id = c.id
                WHERE e.deleted_at IS NULL AND (e.event_name LIKE ? OR e.description LIKE ? OR e.state LIKE ? OR e.category LIKE ? OR e.event_type LIKE ? OR c.business_name LIKE ? OR e.price LIKE ? OR e.event_date LIKE ?)";

        $params = [$searchTerm, $searchTerm, $searchTerm, $searchTerm, $searchTerm, $searchTerm, $searchTerm, $searchTerm];

        // Add filters
        if ($category) {
            $sql .= " AND (e.category = ? OR e.event_type = ?)";
            $params[] = $category;
            $params[] = $category;
        }
        if ($priority) {
            $sql .= " AND e.priority = ?";
            $params[] = $priority;
        }
        if ($status) {
            $sql .= " AND e.status = ?";
            $params[] = $status;
        }
        if ($dateFrom) {
            $sql .= " AND e.event_date >= ?";
            $params[] = $dateFrom;
        }
        if ($dateTo) {
            $sql .= " AND e.event_date <= ?";
            $params[] = $dateTo;
        }

        if ($userRole === 'client') {
            // Resolve real client_id from auth_id
            $c_stmt = $pdo->prepare("SELECT id FROM clients WHERE client_auth_id = ?");
            $c_stmt->execute([$userId]);
            $realClientId = $c_stmt->fetchColumn();

            $sql .= " AND e.client_id = ?";
            $params[] = $realClientId;
        } elseif ($userRole !== 'admin') {
            $sql .= " AND e.status = 'published'";
        }

        $sql .= " ORDER BY e.event_date DESC LIMIT 20";
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $results['events'] = $stmt->fetchAll();
    }

    // 2. Search Tickets (Admins and Clients only)
    if (($userRole === 'admin' || $userRole === 'client') && ($type === 'all' || $type === 'tickets')) {
        // FIXED: Added proper JOIN to auth_accounts for email field
        $sql = "SELECT t.id, t.barcode as title, e.event_name as subtitle, u.name as extra, 
                       a.email as user_email, p.paid_at as purchase_date, 1 as quantity
                FROM tickets t
                INNER JOIN payments p ON t.payment_id = p.id
                INNER JOIN events e ON p.event_id = e.id
                LEFT JOIN users u ON p.user_id = u.user_auth_id
                LEFT JOIN auth_accounts a ON p.user_id = a.id
                WHERE (t.barcode LIKE ? OR u.name LIKE ? OR a.email LIKE ? OR e.event_name LIKE ?)";

        $params = [$searchTerm, $searchTerm, $searchTerm, $searchTerm];

        if ($userRole === 'client') {
            // Resolve real client_id from auth_id
            $c_stmt = $pdo->prepare("SELECT id FROM clients WHERE client_auth_id = ?");
            $c_stmt->execute([$userId]);
            $realClientId = $c_stmt->fetchColumn();

            $sql .= " AND e.client_id = ?";
            $params[] = $realClientId;
        }

        // Add date filter for tickets
        if ($dateFrom) {
            $sql .= " AND p.paid_at >= ?";
            $params[] = $dateFrom;
        }
        if ($dateTo) {
            $sql .= " AND p.paid_at <= ?";
            $params[] = $dateTo;
        }

        $sql .= " ORDER BY p.paid_at DESC LIMIT 20";
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $results['tickets'] = $stmt->fetchAll();
    }

    // 3. Search Users (Admins and Clients only)
    if (($userRole === 'admin' || $userRole === 'client') && ($type === 'all' || $type === 'users')) {
        if ($userRole === 'admin') {
            // FIXED: Properly join users and auth_accounts
            $sql = "SELECT a.id, a.email as title, a.role as subtitle, u.name as display_name, u.profile_pic as profile_image, a.created_at 
                    FROM auth_accounts a
                    LEFT JOIN users u ON a.id = u.user_auth_id
                    WHERE a.email LIKE ? OR u.name LIKE ? 
                    LIMIT 20";
            $params = [$searchTerm, $searchTerm];
        } else {
            // Client: search users who bought tickets for their events
            $c_stmt = $pdo->prepare("SELECT id FROM clients WHERE client_auth_id = ?");
            $c_stmt->execute([$userId]);
            $realClientId = $c_stmt->fetchColumn();

            $sql = "SELECT DISTINCT u.user_auth_id as id, u.name as title, a.email as subtitle, u.profile_pic as profile_image
                    FROM users u
                    INNER JOIN payments p ON u.user_auth_id = p.user_id
                    INNER JOIN tickets t ON p.id = t.payment_id
                    INNER JOIN events e ON p.event_id = e.id
                    INNER JOIN auth_accounts a ON u.user_auth_id = a.id
                    WHERE e.client_id = ? AND (u.name LIKE ? OR a.email LIKE ?)
                    LIMIT 20";
            $params = [$realClientId, $searchTerm, $searchTerm];
        }

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $results['users'] = $stmt->fetchAll();
    }

    // 4. Search Media (NEW - Admins and Clients only)
    if (($userRole === 'admin' || $userRole === 'client') && ($type === 'all' || $type === 'media')) {
        // Search both files and folders
        // Search files
        $sqlFiles = "
            SELECT m.id, m.file_name as title, m.file_type as subtitle, m.file_path as extra, m.file_size, m.uploaded_at, 'file' as item_type
            FROM media m
            WHERE m.is_deleted = 0 AND (m.file_name LIKE ? OR m.file_type LIKE ?)
            " . ($userRole === 'client' ? " AND m.client_id = ?" : "") . "
            ORDER BY m.uploaded_at DESC LIMIT 30
        ";

        $paramsFiles = ["%$query%", "%$query%"];
        if ($userRole === 'client') {
            // Resolve real client_id from auth_id
            $c_stmt = $pdo->prepare("SELECT id FROM clients WHERE client_auth_id = ?");
            $c_stmt->execute([$userId]);
            $realClientId = $c_stmt->fetchColumn();
            $paramsFiles[] = $realClientId;
        }

        $stmtFiles = $pdo->prepare($sqlFiles);
        $stmtFiles->execute($paramsFiles);
        $mediaFiles = $stmtFiles->fetchAll();

        // Search folders
        $sqlFolders = "
            SELECT f.id, f.name as title, 'folder' as subtitle, '' as extra, 0 as file_size, f.created_at as uploaded_at, 'folder' as item_type
            FROM media_folders f
            WHERE f.is_deleted = 0 AND f.name LIKE ?
            " . ($userRole === 'client' ? " AND f.client_id = ?" : "") . "
            ORDER BY f.created_at DESC LIMIT 30
        ";

        $paramsFolders = ["%$query%"];
        if ($userRole === 'client') {
            $paramsFolders[] = $realClientId ?? null;
        }

        $stmtFolders = $pdo->prepare($sqlFolders);
        $stmtFolders->execute($paramsFolders);
        $mediaFolders = $stmtFolders->fetchAll();

        $results['media'] = array_merge($mediaFolders, $mediaFiles);

        // Sort combined results by uploaded_at descending manually
        usort($results['media'], function ($a, $b) {
            return strtotime($b['uploaded_at']) - strtotime($a['uploaded_at']);
        });

        // Take top 30
        $results['media'] = array_slice($results['media'], 0, 30);
    }

    echo json_encode([
        'success' => true,
        'results' => $results
    ]);

} catch (PDOException $e) {
    http_response_code(500);
    error_log("Search error: " . $e->getMessage());
    echo json_encode(['success' => false, 'message' => 'Search failed: ' . $e->getMessage()]);
}
