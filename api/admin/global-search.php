<?php

/**
 * Global Search API
 * Unified search for events, users, clients, tickets and payments.
 *
 * Every category matches against more than names:
 *  - IDs        : custom_id, numeric id, barcode/reference/transaction ids
 *  - Dates      : event date, paid/created date, date of birth (dd-mm-yyyy & yyyy-mm-dd)
 *  - Prices     : events.price, payments.amount
 *  - Ticket type: regular / vip / premium / all
 *  - Priority   : upcoming / featured / hot / nearby / trending
 *  - Clients    : also searchable by client ID (admin only)
 */

header('Content-Type: application/json');
require_once '../../config/database.php';
require_once '../../includes/middleware/auth.php';

// Check admin authentication
$admin_id = checkAuth('admin');

$query = $_GET['q'] ?? '';
$query = trim($query);

if (strlen($query) < 2) {
    echo json_encode([
        'success' => true,
        'results' => [
            'events' => [],
            'users' => [],
            'clients' => [],
            'tickets' => [],
            'payments' => []
        ]
    ]);
    exit;
}

$searchTerm = '%' . $query . '%';
// Day-first rendering of the same query so "05-10-2026" style dates hit too.
$dayFirstTerm = '%' . preg_replace('/^(\d{1,2})\D(\d{1,2})\D(\d{4})$/', '$2-$1-$3', $query) . '%';
// Free-keyword: also match zero-price events
$isFreeQuery = (strtolower(trim($query)) === 'free') ? 1 : 0;

try {
    $results = [
        'events' => [],
        'users' => [],
        'clients' => [],
        'tickets' => [],
        'payments' => []
    ];

    // 1. Search Events (name, ids, date, price, ticket type, priority, location)
    $stmt = $pdo->prepare("
        SELECT id, custom_id, event_name as name, event_type as type, state, status, address,
               event_date, price, ticket_type, priority, client_id
        FROM events
        WHERE deleted_at IS NULL AND (
            event_name LIKE ? OR description LIKE ? OR state LIKE ? OR event_type LIKE ?
            OR custom_id LIKE ? OR address LIKE ? OR location LIKE ?
            OR category LIKE ? OR tag LIKE ?
            OR priority LIKE ?
            OR ticket_type LIKE ?
            OR CAST(price AS CHAR) LIKE ?
            OR DATE_FORMAT(event_date, '%Y-%m-%d') LIKE ?
            OR DATE_FORMAT(event_date, '%d-%m-%Y') LIKE ?
            OR CAST(id AS CHAR) LIKE ?
            OR (? = 1 AND (price = 0 OR price IS NULL))
        )
        LIMIT 5
    ");
    $stmt->execute([
        $searchTerm, $searchTerm, $searchTerm, $searchTerm,
        $searchTerm, $searchTerm, $searchTerm,
        $searchTerm, $searchTerm,
        $searchTerm,
        $searchTerm,
        $searchTerm,
        $searchTerm,
        $dayFirstTerm,
        $searchTerm,
        $isFreeQuery
    ]);
    $results['events'] = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // 2. Search Users (name, email, phone, user id, dob, joined date)
    $stmt = $pdo->prepare("
        SELECT p.id, p.custom_id, p.name, a.email, p.profile_pic, p.phone, p.dob, p.created_at
        FROM users p
        JOIN auth_accounts a ON p.user_auth_id = a.id
        WHERE p.name LIKE ? OR a.email LIKE ? OR p.custom_id LIKE ? OR p.phone LIKE ?
            OR CAST(p.id AS CHAR) LIKE ?
            OR DATE_FORMAT(p.dob, '%Y-%m-%d') LIKE ?
            OR DATE_FORMAT(p.dob, '%d-%m-%Y') LIKE ?
            OR DATE_FORMAT(p.created_at, '%Y-%m-%d') LIKE ?
        LIMIT 5
    ");
    $stmt->execute([
        $searchTerm, $searchTerm, $searchTerm, $searchTerm,
        $searchTerm,
        $searchTerm,
        $dayFirstTerm,
        $searchTerm
    ]);
    $results['users'] = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // 3. Search Clients (business/owner name, email, company, client id, joined date)
    $stmt = $pdo->prepare("
        SELECT p.id, p.custom_id, p.business_name as name, p.name as owner_name, a.email,
               p.profile_pic, p.company, p.phone, p.subaccount_code, p.created_at
        FROM clients p
        JOIN auth_accounts a ON p.client_auth_id = a.id
        WHERE p.business_name LIKE ? OR p.name LIKE ? OR a.email LIKE ? OR p.company LIKE ?
            OR p.custom_id LIKE ? OR p.phone LIKE ? OR p.subaccount_code LIKE ?
            OR CAST(p.id AS CHAR) LIKE ?
            OR DATE_FORMAT(p.created_at, '%Y-%m-%d') LIKE ?
        LIMIT 5
    ");
    $stmt->execute([
        $searchTerm, $searchTerm, $searchTerm, $searchTerm,
        $searchTerm, $searchTerm, $searchTerm,
        $searchTerm,
        $searchTerm
    ]);
    $results['clients'] = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // 4. Search Tickets (ticket id, barcode, ticket code, type, event, buyer, dates)
    $stmt = $pdo->prepare("
        SELECT t.id, t.custom_id, t.barcode, t.ticket_code, t.ticket_type, t.status, t.created_at,
               u.name as user_name, e.event_name, e.event_date, e.price
        FROM tickets t
        JOIN users u ON t.user_id = u.id
        JOIN events e ON t.event_id = e.id
        WHERE t.custom_id LIKE ? OR t.barcode LIKE ? OR t.ticket_code LIKE ?
            OR CAST(t.id AS CHAR) LIKE ?
            OR t.ticket_type LIKE ?
            OR e.event_name LIKE ? OR u.name LIKE ?
            OR DATE_FORMAT(t.created_at, '%Y-%m-%d') LIKE ?
            OR DATE_FORMAT(e.event_date, '%Y-%m-%d') LIKE ?
            OR DATE_FORMAT(e.event_date, '%d-%m-%Y') LIKE ?
        LIMIT 5
    ");
    $stmt->execute([
        $searchTerm, $searchTerm, $searchTerm,
        $searchTerm,
        $searchTerm,
        $searchTerm, $searchTerm,
        $searchTerm,
        $searchTerm,
        $dayFirstTerm
    ]);
    $results['tickets'] = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // 5. Search Payments (payment id, reference, transaction ids, amount, type, dates)
    $stmt = $pdo->prepare("
        SELECT p.id, p.custom_id, p.reference, p.payment_id, p.transaction_id, p.amount,
               p.ticket_type, p.status, p.paid_at, p.created_at,
               u.name as user_name, e.event_name
        FROM payments p
        JOIN users u ON p.user_id = u.id
        JOIN events e ON p.event_id = e.id
        WHERE p.custom_id LIKE ? OR p.reference LIKE ? OR p.transaction_id LIKE ?
            OR p.payment_id LIKE ?
            OR CAST(p.id AS CHAR) LIKE ?
            OR CAST(p.amount AS CHAR) LIKE ?
            OR p.ticket_type LIKE ? OR u.name LIKE ? OR e.event_name LIKE ?
            OR DATE_FORMAT(COALESCE(p.paid_at, p.created_at), '%Y-%m-%d') LIKE ?
            OR DATE_FORMAT(p.created_at, '%Y-%m-%d') LIKE ?
        LIMIT 5
    ");
    $stmt->execute([
        $searchTerm, $searchTerm, $searchTerm,
        $searchTerm,
        $searchTerm,
        $searchTerm,
        $searchTerm, $searchTerm, $searchTerm,
        $searchTerm,
        $searchTerm
    ]);
    $results['payments'] = $stmt->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode([
        'success' => true,
        'results' => $results,
        'query' => $query
    ]);
} catch (PDOException $e) {
    http_response_code(500);
    error_log("Global Search Error: " . $e->getMessage());
    echo json_encode(['success' => false, 'message' => 'Search failed due to database error.']);
}
