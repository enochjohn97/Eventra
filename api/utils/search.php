<?php

/**
 * Unified Search API
 * Searches across events, tickets, payments, users, and media based on role-specific visibility.
 *
 * Matched fields per category (beyond plain names):
 *  - Events : name, custom/numeric id, event date, price, ticket type
 *             (regular/vip/premium/all), priority (upcoming/featured/hot/nearby/trending)
 *  - Tickets: ticket id, custom id, barcode, ticket code, ticket type, dates, event/buyer
 *  - Payments: payment id, reference, transaction ids, amount, ticket type, dates
 *  - Users  : name, email, phone, user id
 */

header('Content-Type: application/json');
require_once '../../config/database.php';
require_once '../../includes/middleware/auth.php';

// Check authentication
checkAuth();
$auth_id = getAuthId();
$role = $_SESSION['role'] ?? 'user';

$query = $_GET['q'] ?? '';
if (empty($query) || strlen($query) < 2) {
    echo json_encode(['success' => true, 'results' => ['events' => [], 'tickets' => [], 'users' => [], 'payments' => [], 'media' => []]]);
    exit;
}

$searchTerm = "%$query%";
// Day-first rendering of the same query so "05-10-2026" style dates hit too.
$dayFirstTerm = '%' . preg_replace('/^(\d{1,2})\D(\d{1,2})\D(\d{4})$/', '$2-$1-$3', $query) . '%';

try {
    $results = [
        'events' => [],
        'tickets' => [],
        'users' => [],
        'payments' => [],
        'media' => []
    ];

    // --- 1. SEARCH EVENTS --- (name, id, date, price, ticket type, priority)
    // Detect free-keyword search: also match events with zero price
    $isFreeQuery = (strtolower(trim($query)) === 'free');

    $eventSql = "SELECT id, custom_id, event_name as title, SUBSTRING(description, 1, 60) as subtitle,
                        category, price, metadata, event_date, ticket_type, priority, state
                 FROM events
                 WHERE deleted_at IS NULL AND (
                    event_name LIKE ? OR description LIKE ? OR custom_id LIKE ?
                    OR category LIKE ? OR state LIKE ? OR address LIKE ?
                    OR priority LIKE ?
                    OR ticket_type LIKE ?
                    OR CAST(price AS CHAR) LIKE ?
                    OR DATE_FORMAT(event_date, '%Y-%m-%d') LIKE ?
                    OR DATE_FORMAT(event_date, '%d-%m-%Y') LIKE ?
                    OR CAST(id AS CHAR) LIKE ?
                    OR (? = 1 AND (price = 0 OR price IS NULL))
                 )";

    $freeFlag = $isFreeQuery ? 1 : 0;
    $eventParams = [
        $searchTerm, $searchTerm, $searchTerm,
        $searchTerm, $searchTerm, $searchTerm,
        $searchTerm,
        $searchTerm,
        $searchTerm,
        $searchTerm,
        $dayFirstTerm,
        $searchTerm,
        $freeFlag
    ];

    if ($role === 'client') {
        $eventSql .= " AND client_id = (SELECT id FROM clients WHERE client_auth_id = ?)";
        $eventParams[] = $auth_id;
    } elseif ($role === 'user') {
        $eventSql .= " AND status = 'published'";
    }

    $eventSql .= " LIMIT 10";

    $stmt = $pdo->prepare($eventSql);
    $stmt->execute($eventParams);
    $events = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Merge metadata for events
    $results['events'] = array_map(function($ev) {
        if (!empty($ev['metadata'])) {
            $meta = json_decode($ev['metadata'], true);
            if (is_array($meta)) {
                $ev = array_merge($ev, $meta);
            }
        }
        return $ev;
    }, $events);

    // --- 2. SEARCH TICKETS / ORDERS --- (ticket id, code, type, dates, event, buyer)
    $ticketSql = "SELECT t.id, t.custom_id, t.ticket_type, t.status, t.created_at,
                         e.event_name as title, e.event_date,
                         CONCAT('Ticket #', t.custom_id) as subtitle, u.name as extra
                  FROM tickets t
                  JOIN events e ON t.event_id = e.id
                  JOIN users u ON t.user_id = u.id
                  WHERE (e.event_name LIKE ? OR u.name LIKE ? OR t.id LIKE ?
                         OR t.custom_id LIKE ? OR t.barcode LIKE ? OR t.ticket_code LIKE ?
                         OR t.ticket_type LIKE ?
                         OR DATE_FORMAT(t.created_at, '%Y-%m-%d') LIKE ?
                         OR DATE_FORMAT(e.event_date, '%Y-%m-%d') LIKE ?
                         OR DATE_FORMAT(e.event_date, '%d-%m-%Y') LIKE ?
                         OR CAST(e.price AS CHAR) LIKE ?
                         OR e.priority LIKE ?)";

    $ticketParams = [
        $searchTerm, $searchTerm, $searchTerm,
        $searchTerm, $searchTerm, $searchTerm,
        $searchTerm,
        $searchTerm,
        $searchTerm,
        $dayFirstTerm,
        $searchTerm,
        $searchTerm
    ];

    if ($role === 'client') {
        $ticketSql .= " AND e.client_id = (SELECT id FROM clients WHERE client_auth_id = ?)";
        $ticketParams[] = $auth_id;
    }

    $stmt = $pdo->prepare($ticketSql);
    $stmt->execute($ticketParams);
    $results['tickets'] = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // --- 3. SEARCH USERS / ATTENDEES --- (name, email, phone, user id)
    if ($role === 'admin') {
        $userSql = "SELECT u.id, u.custom_id, u.name as title, aa.email as subtitle
                    FROM users u
                    JOIN auth_accounts aa ON u.user_auth_id = aa.id
                    WHERE (u.name LIKE ? OR aa.email LIKE ? OR u.phone LIKE ?
                           OR u.custom_id LIKE ? OR CAST(u.id AS CHAR) LIKE ?)";
        $stmt = $pdo->prepare($userSql);
        $stmt->execute([$searchTerm, $searchTerm, $searchTerm, $searchTerm, $searchTerm]);
    } else {
        // Clients only see users who have bought tickets to their events
        $userSql = "SELECT DISTINCT u.id, u.custom_id, u.name as title, aa.email as subtitle
                    FROM users u
                    JOIN auth_accounts aa ON u.user_auth_id = aa.id
                    JOIN tickets t ON t.user_id = u.id
                    JOIN events e ON t.event_id = e.id
                    WHERE (u.name LIKE ? OR aa.email LIKE ? OR u.phone LIKE ?
                           OR u.custom_id LIKE ? OR CAST(u.id AS CHAR) LIKE ?)
                    AND e.client_id = (SELECT id FROM clients WHERE client_auth_id = ?)";
        $stmt = $pdo->prepare($userSql);
        $stmt->execute([$searchTerm, $searchTerm, $searchTerm, $searchTerm, $searchTerm, $auth_id]);
    }
    $results['users'] = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // --- 4. SEARCH PAYMENTS --- (payment id, reference, amount, ticket type, dates)
    $paymentSql = "SELECT p.id, p.custom_id, p.reference, p.payment_id, p.transaction_id,
                          p.amount, p.ticket_type, p.status, p.paid_at, p.created_at,
                          e.event_name as title,
                          CONCAT('Payment #', COALESCE(p.custom_id, p.id)) as subtitle,
                          u.name as extra
                   FROM payments p
                   JOIN events e ON p.event_id = e.id
                   JOIN users u ON p.user_id = u.id
                   WHERE (p.custom_id LIKE ? OR p.reference LIKE ? OR p.transaction_id LIKE ?
                          OR p.payment_id LIKE ? OR CAST(p.id AS CHAR) LIKE ?
                          OR CAST(p.amount AS CHAR) LIKE ?
                          OR p.ticket_type LIKE ? OR p.status LIKE ?
                          OR e.event_name LIKE ? OR u.name LIKE ?
                          OR DATE_FORMAT(COALESCE(p.paid_at, p.created_at), '%Y-%m-%d') LIKE ?
                          OR DATE_FORMAT(p.created_at, '%Y-%m-%d') LIKE ?)";

    $paymentParams = array_fill(0, 12, $searchTerm);

    if ($role === 'client') {
        $paymentSql .= " AND e.client_id = (SELECT id FROM clients WHERE client_auth_id = ?)";
        $paymentParams[] = $auth_id;
    } elseif ($role === 'user') {
        $paymentSql .= " AND p.user_id = (SELECT id FROM users WHERE user_auth_id = ?)";
        $paymentParams[] = $auth_id;
    }

    $stmt = $pdo->prepare($paymentSql);
    $stmt->execute($paymentParams);
    $results['payments'] = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // --- 5. SEARCH MEDIA --- (file name, folder name, file type)
    $mediaSql = "SELECT id, file_name as title,
                        CONCAT(COALESCE(folder_name, 'Root'), ' • ', file_type, ' • ', ROUND(file_size/1024, 1), ' KB') as subtitle,
                        file_size, 'file' as item_type
                 FROM media
                 WHERE (file_name LIKE ? OR folder_name LIKE ? OR file_type LIKE ?)
                   AND is_deleted = 0";

    $mediaParams = [$searchTerm, $searchTerm, $searchTerm];

    if ($role === 'client') {
        $mediaSql .= " AND client_id = (SELECT id FROM clients WHERE client_auth_id = ?)";
        $mediaParams[] = $auth_id;
    }

    $mediaSql .= " LIMIT 5";

    $stmt = $pdo->prepare($mediaSql);
    $stmt->execute($mediaParams);
    $results['media'] = $stmt->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode([
        'success' => true,
        'results' => $results
    ]);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Search error: ' . $e->getMessage()]);
}
