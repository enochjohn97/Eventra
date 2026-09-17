<?php

/**
 * Export Data API
 * Exports data in CSV or Excel format with role-based filtering
 */

header('Content-Type: application/json');
require_once '../../config/database.php';
require_once '../../includes/middleware/auth.php';

// Check authentication and role
$user_id = checkAuth();
$user_role = $_SESSION['role'];

$type = $_GET['type'] ?? 'events'; // events, users, tickets, clients
$format = $_GET['format'] ?? 'csv'; // csv, excel
$ids = $_GET['ids'] ?? null; // comma-separated IDs for selected rows

try {
    $data = [];
    $filename = '';
    $headers = [];

    // Resolve client_id if user is client
    $client_id = null;
    if ($user_role === 'client') {
        $stmt = $pdo->prepare("SELECT id FROM clients WHERE client_auth_id = ?");
        $stmt->execute([$user_id]);
        $client = $stmt->fetch();
        if (!$client) {
            echo json_encode(['success' => false, 'message' => 'Client profile not found']);
            exit;
        }
        $client_id = $client['id'];
    }

    switch ($type) {
        case 'events':
            $filename = 'events_export_' . date('Y-m-d_His');
            $headers = ['ID', 'Event Name', 'Description', 'Type', 'Date', 'Time', 'State', 'Address', 'Price', 'Status', 'Client', 'Attendees'];

            $where_clauses = ["e.deleted_at IS NULL"];
            $params = [];

            // Role-based filtering
            if ($user_role === 'client') {
                $where_clauses[] = "e.client_id = ?";
                $params[] = $client_id;
            }

            // Selected IDs filtering
            if ($ids) {
                $id_array = explode(',', $ids);
                $placeholders = implode(',', array_fill(0, count($id_array), '?'));
                $where_clauses[] = "e.id IN ($placeholders)";
                $params = array_merge($params, $id_array);
            }

            $where_sql = 'WHERE ' . implode(' AND ', $where_clauses);

            $sql = "
                SELECT e.id, e.event_name, e.description, e.event_type, e.event_date, e.event_time,
                       e.state, e.address, e.price, e.status, c.business_name as client_name, e.attendee_count
                FROM events e
                LEFT JOIN clients c ON e.client_id = c.id
                $where_sql
                ORDER BY e.created_at DESC
            ";

            $stmt = $pdo->prepare($sql);
            foreach ($params as $key => $value) {
                $stmt->bindValue($key + 1, $value);
            }
            $stmt->execute();
            $data = $stmt->fetchAll(PDO::FETCH_NUM);
            break;

        case 'users':
            // Admin only
            if ($user_role !== 'admin') {
                echo json_encode(['success' => false, 'message' => 'Unauthorized']);
                exit;
            }

            $filename = 'users_export_' . date('Y-m-d_His');
            $headers = ['ID', 'Display Name', 'Email', 'Phone', 'DOB', 'Gender', 'Created At'];

            $where_clauses = [];
            $params = [];

            if ($ids) {
                $id_array = explode(',', $ids);
                $placeholders = implode(',', array_fill(0, count($id_array), '?'));
                $where_clauses[] = "u.id IN ($placeholders)";
                $params = $id_array;
            }

            $where_sql = !empty($where_clauses) ? 'WHERE ' . implode(' AND ', $where_clauses) : '';

            $sql = "
                SELECT u.id, u.display_name, a.email, u.phone, u.dob, u.gender, u.created_at
                FROM users u
                LEFT JOIN auth_accounts a ON u.user_auth_id = a.id
                $where_sql
                ORDER BY u.created_at DESC
            ";

            $stmt = $pdo->prepare($sql);
            foreach ($params as $key => $value) {
                $stmt->bindValue($key + 1, $value);
            }
            $stmt->execute();
            $data = $stmt->fetchAll(PDO::FETCH_NUM);
            break;

        case 'tickets':
            $filename = 'tickets_export_' . date('Y-m-d_His');
            $headers = ['ID', 'Event Name', 'User Name', 'Quantity', 'Total Price', 'Ticket Code', 'Status', 'Purchase Date'];

            $where_clauses = ["t.deleted_at IS NULL"];
            $params = [];

            // Role-based filtering
            if ($user_role === 'client') {
                $where_clauses[] = "e.client_id = ?";
                $params[] = $client_id;
            }

            if ($ids) {
                $id_array = explode(',', $ids);
                $placeholders = implode(',', array_fill(0, count($id_array), '?'));
                $where_clauses[] = "t.id IN ($placeholders)";
                $params = array_merge($params, $id_array);
            }

            $where_sql = 'WHERE ' . implode(' AND ', $where_clauses);

            $sql = "
                SELECT t.id, e.event_name, u.display_name, t.quantity, t.total_price, t.ticket_code, t.status, t.purchase_date
                FROM tickets t
                LEFT JOIN payments p ON t.payment_id = p.id
                LEFT JOIN events e ON p.event_id = e.id
                LEFT JOIN users u ON p.user_id = u.id
                $where_sql
                ORDER BY t.purchase_date DESC
            ";

            $stmt = $pdo->prepare($sql);
            foreach ($params as $key => $value) {
                $stmt->bindValue($key + 1, $value);
            }
            $stmt->execute();
            $data = $stmt->fetchAll(PDO::FETCH_NUM);
            break;

        case 'clients':
            // Admin only
            if ($user_role !== 'admin') {
                echo json_encode(['success' => false, 'message' => 'Unauthorized']);
                exit;
            }

            $filename = 'clients_export_' . date('Y-m-d_His');
            $headers = ['ID', 'Name', 'Email', 'Business Name', 'Phone', 'Company', 'City', 'State', 'Created At'];

            $where_clauses = [];
            $params = [];

            if ($ids) {
                $id_array = explode(',', $ids);
                $placeholders = implode(',', array_fill(0, count($id_array), '?'));
                $where_clauses[] = "c.id IN ($placeholders)";
                $params = $id_array;
            }

            $where_sql = !empty($where_clauses) ? 'WHERE ' . implode(' AND ', $where_clauses) : '';

            $sql = "
                SELECT c.id, c.name, c.email, c.business_name, c.phone, c.company, c.city, c.state, c.created_at
                FROM clients c
                $where_sql
                ORDER BY c.created_at DESC
            ";

            $stmt = $pdo->prepare($sql);
            foreach ($params as $key => $value) {
                $stmt->bindValue($key + 1, $value);
            }
            $stmt->execute();
            $data = $stmt->fetchAll(PDO::FETCH_NUM);
            break;

        default:
            echo json_encode(['success' => false, 'message' => 'Invalid export type']);
            exit;
    }

    // Generate CSV
    if ($format === 'csv') {
        header('Content-Type: text/csv');
        header('Content-Disposition: attachment; filename="' . $filename . '.csv"');

        $output = fopen('php://output', 'w');
        fputcsv($output, $headers);
        foreach ($data as $row) {
            fputcsv($output, $row);
        }
        fclose($output);
        exit;
    }

    // For Excel, we'll use CSV with .xls extension (simple approach)
    // For true Excel support, consider using PHPSpreadsheet library
    if ($format === 'excel') {
        header('Content-Type: application/vnd.ms-excel');
        header('Content-Disposition: attachment; filename="' . $filename . '.xls"');

        $output = fopen('php://output', 'w');
        fputcsv($output, $headers, "\t");
        foreach ($data as $row) {
            fputcsv($output, $row, "\t");
        }
        fclose($output);
        exit;
    }

    echo json_encode(['success' => false, 'message' => 'Invalid format']);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database error. Please try again or contact support if it persists.']);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Unexpected error. Please try again.']);
}
