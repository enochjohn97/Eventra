<?php
/**
 * Frontend Error Logging Endpoint
 * Receives JS errors and logs them to the centralized PHP error log.
 */

// Enable error logging for this script itself
ini_set('display_errors', 0);
ini_set('log_errors', 1);
ini_set('error_log', __DIR__ . '/../../logs/php-errors.log');
error_reporting(E_ALL);

// Ensure we return JSON
header('Content-Type: application/json');

// Only allow POST requests
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed']);
    exit;
}

// Get the raw POST data
$json = file_get_contents('php://input', false, null, 0, 16384);
$data = json_decode($json, true);

if (!$data) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Invalid JSON']);
    exit;
}

// Bound and normalize client-controlled values before writing private logs.
$clean = static function ($value, int $limit): string {
    $value = is_scalar($value) ? (string) $value : '';
    $value = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/', '', $value);
    $value = str_replace(["\r", "\n"], [' ', ' '], $value);
    return mb_substr(trim($value), 0, $limit);
};

$message    = $clean($data['message'] ?? 'Unknown JS Error', 2000);
$url        = $clean($data['url'] ?? 'Unknown URL', 1000);
$line       = $clean($data['line'] ?? 'N/A', 20);
$column     = $clean($data['column'] ?? 'N/A', 20);
$stack      = $clean($data['stack'] ?? 'No stack trace', 6000);
$userAgent  = $_SERVER['HTTP_USER_AGENT'] ?? 'Unknown User Agent';
$remoteAddr = $_SERVER['REMOTE_ADDR'] ?? 'Unknown IP';

// We can also try to get the user ID from the session if available
require_once __DIR__ . '/../../config/session-config.php';
$userId = $_SESSION['user_id'] ?? $_SESSION['client_id'] ?? $_SESSION['admin_id'] ?? 'Guest';
$role   = $_SESSION['role'] ?? 'Unknown Role';
$requestId = bin2hex(random_bytes(8));

// Format the log message
$logEntry = sprintf(
    "[FRONTEND ERROR] [Request: %s] [%s] [User: %s (%s)] [IP: %s]\n" .
    "Message: %s\n" .
    "Source: %s (Line: %s, Col: %s)\n" .
    "User Agent: %s\n" .
    "Stack Trace:\n%s\n" .
    "--------------------------------------------------\n",
    $requestId,
    date('Y-m-d H:i:s'),
    $userId,
    $role,
    $remoteAddr,
    $message,
    $url,
    $line,
    $column,
    $userAgent,
    $stack
);

// Write to the error log
error_log($logEntry);

echo json_encode(['success' => true]);
