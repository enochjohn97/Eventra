<?php
/**
 * Eventra — User Registration Handler (No OTP, Immediate Account Creation)
 * Schema: auth_accounts + role-specific tables (admins, clients, users)
 */

ob_start();
ini_set('display_errors', 0);
error_reporting(E_ALL);
ini_set('log_errors', 1);
ini_set('error_log', __DIR__ . '/../../logs/php-errors.log');

function regLog($level, $message, $context = [])
{
    $entry = date('Y-m-d H:i:s') . " [REGISTER] [$level] $message";
    if ($context) {
        $entry .= ' | ' . json_encode($context, JSON_UNESCAPED_SLASHES);
    }
    error_log($entry);
}

// CORS + PDO (must load before session; cors-config is included by database.php)
$db_path = __DIR__ . '/../../config/database.php';
if (!file_exists($db_path)) {
    regLog('CRITICAL', 'database.php missing');
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode(['success' => false, 'message' => 'Service configuration error.']);
    exit;
}
require_once $db_path;

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$config_path = __DIR__ . '/../../config.php';
if (file_exists($config_path)) {
    require_once $config_path;
}

if (session_status() === PHP_SESSION_NONE) {
    session_name('EVENTRA_PENDING_SESS');
    session_start();
}
$sessionId = session_id();
regLog('INFO', 'Request started', ['session_id' => $sessionId]);

function sendJsonResponse($success, $message, $httpCode = 200, $extra = [])
{
    global $sessionId;
    regLog($success ? 'SUCCESS' : 'ERROR', $message, ['http_code' => $httpCode, 'extra' => $extra]);
    if (ob_get_length()) {
        ob_clean();
    }
    http_response_code($httpCode);
    if (!headers_sent()) {
        header('Content-Type: application/json');
    }
    echo json_encode(array_merge(['success' => $success, 'message' => $message], $extra));
    exit;
}

try {
    $pdo = getPDO();
} catch (Exception $e) {
    regLog('CRITICAL', 'Failed to get PDO: ' . $e->getMessage());
    sendJsonResponse(false, 'Database connection failed.', 500);
}

// Optional entity resolver
$resolver_path = __DIR__ . '/../../includes/helpers/entity-resolver.php';
if (file_exists($resolver_path))
    require_once $resolver_path;

require_once __DIR__ . '/../utils/id-generator.php';

// Parse input
$rawInput = file_get_contents('php://input');
$data = json_decode($rawInput, true);
$logData = $data ?? [];
if (isset($logData['password']))
    $logData['password'] = '***';
regLog('INFO', 'Payload received', ['input' => $logData]);

if (!$data || !is_array($data)) {
    sendJsonResponse(false, 'Invalid request format.', 400);
}

$name = trim($data['name'] ?? $data['fullName'] ?? '');
$email = trim($data['email'] ?? '');
$password = $data['password'] ?? '';
$business_name = trim($data['business_name'] ?? '');
$role = $data['role'] ?? 'client';

if (empty($name) || empty($email) || empty($password)) {
    sendJsonResponse(false, 'Name, email, and password are required.', 400);
}
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    sendJsonResponse(false, 'Invalid email address.', 400);
}
if ($role === 'client' && empty($business_name)) {
    $business_name = $name; // fallback
}

// Password strength validation
if (!preg_match('/^(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*(),.?":{}|<>]).{8,}$/', $password)) {
    sendJsonResponse(false, 'Password must be at least 8 characters with uppercase, number, and special character.', 400);
}

try {
    // Check if email already exists
    $stmt = $pdo->prepare("SELECT id FROM auth_accounts WHERE email = ?");
    $stmt->execute([$email]);
    if ($stmt->fetch()) {
        sendJsonResponse(false, 'Email already registered.', 409);
    }

    // Generate a unique username from email prefix
    $baseUsername = explode('@', $email)[0];
    $username = $baseUsername;
    $counter = 1;
    while (true) {
        $stmt = $pdo->prepare("SELECT id FROM auth_accounts WHERE username = ?");
        $stmt->execute([$username]);
        if (!$stmt->fetch())
            break;
        $username = $baseUsername . $counter;
        $counter++;
    }

    if ($role === 'client' && !empty($business_name)) {
        $stmt = $pdo->prepare("SELECT id FROM clients WHERE business_name = ? AND deleted_at IS NULL");
        $stmt->execute([$business_name]);
        if ($stmt->fetch()) {
            sendJsonResponse(false, 'Business name already in use. Please choose another.', 409);
        }
    }

    $hashedPassword = password_hash($password, PASSWORD_DEFAULT);

    $pdo->beginTransaction();

    // 1. Insert into auth_accounts
    $stmt = $pdo->prepare("
        INSERT INTO auth_accounts (email, username, password, auth_provider, role, role_locked, is_active, email_verified_at)
        VALUES (?, ?, ?, 'local', ?, 1, 1, NOW())
    ");
    $stmt->execute([$email, $username, $hashedPassword, $role]);
    $authId = $pdo->lastInsertId();

    // 2. Insert into role-specific profile table
    switch ($role) {
        case 'client':
            $customId = generateClientId($pdo);
            $stmt = $pdo->prepare("
                INSERT INTO clients (client_auth_id, custom_id, name, business_name, created_at)
                VALUES (?, ?, ?, ?, NOW())
            ");
            $stmt->execute([$authId, $customId, $name, $business_name]);
            break;
        case 'user':
            $customId = generateUserId($pdo);
            $stmt = $pdo->prepare("
                INSERT INTO users (user_auth_id, custom_id, name, created_at)
                VALUES (?, ?, ?, NOW())
            ");
            $stmt->execute([$authId, $customId, $name]);
            break;
        default:
            throw new Exception("Invalid role specified.");
    }

    $pdo->commit();

    unset($_SESSION['pending_registration']);
    session_write_close();

    regLog('INFO', 'User created', ['auth_id' => $authId, 'email' => $email, 'role' => $role]);
    sendJsonResponse(true, 'Account created successfully! You may now log in.', 200, [
        'user_id' => $authId,
        'email' => $email
    ]);
}
catch (PDOException $e) {
    if ($pdo->inTransaction())
        $pdo->rollBack();
    regLog('CRITICAL', 'PDO Error: ' . $e->getMessage() . ' | Code: ' . $e->getCode());

    if ($e->getCode() == 23000) {
        if (strpos($e->getMessage(), 'auth_accounts.email') !== false || strpos($e->getMessage(), 'Duplicate entry') !== false) {
            sendJsonResponse(false, 'Email already registered.', 409);
        }
        if (strpos($e->getMessage(), 'auth_accounts.username') !== false) {
            sendJsonResponse(false, 'Username already taken. Please try a different email.', 409);
        }
    }
    sendJsonResponse(false, formatDbErrorMessage($e), 500);
} catch (Throwable $e) {
    if (isset($pdo) && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    regLog('CRITICAL', 'Exception: ' . $e->getMessage());
    sendJsonResponse(false, 'Internal server error.', 500);
}