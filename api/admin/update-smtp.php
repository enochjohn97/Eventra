<?php

/**
 * Update SMTP Settings API (Admin only)
 * Allows admins to update email configuration via the admin panel.
 * Updates the .env file SMTP fields.
 */

header('Content-Type: application/json');
require_once '../../config/database.php';
require_once '../../includes/middleware/auth.php';

// Admin-only endpoint
$admin_auth_id = checkAuth('admin');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(['success' => false, 'message' => 'POST method required']);
    exit;
}

$data = json_decode(file_get_contents('php://input'), true);

// Validate required SMTP fields
$required = ['MAIL_HOST', 'MAIL_PORT', 'MAIL_USERNAME', 'MAIL_PASSWORD', 'MAIL_ENCRYPTION', 'MAIL_FROM_ADDRESS'];
$missing = array_filter($required, fn($field) => !isset($data[$field]) || trim($data[$field]) === '');

if (!empty($missing)) {
    echo json_encode(['success' => false, 'message' => 'Missing required fields: ' . implode(', ', $missing)]);
    exit;
}

// Validate port
$port = (int) $data['MAIL_PORT'];
if ($port < 1 || $port > 65535) {
    echo json_encode(['success' => false, 'message' => 'Invalid SMTP port. Common ports: 587 (TLS), 465 (SSL), 25 (plain).']);
    exit;
}

// Validate encryption
$validEncryptions = ['tls', 'ssl', 'starttls', ''];
if (!in_array(strtolower($data['MAIL_ENCRYPTION']), $validEncryptions)) {
    echo json_encode(['success' => false, 'message' => 'Invalid encryption method. Use: tls, ssl, or leave empty.']);
    exit;
}

// Validate sender email
if (!filter_var($data['MAIL_FROM_ADDRESS'], FILTER_VALIDATE_EMAIL)) {
    echo json_encode(['success' => false, 'message' => 'Invalid sender email address.']);
    exit;
}

$envPath = __DIR__ . '/../../.env';

if (!file_exists($envPath)) {
    echo json_encode(['success' => false, 'message' => '.env file not found.']);
    exit;
}

if (!is_writable($envPath)) {
    echo json_encode(['success' => false, 'message' => '.env file is not writable. Check server file permissions.']);
    exit;
}

// Optionally test the SMTP connection before saving
$testConnection = $data['test_connection'] ?? false;
if ($testConnection) {
    $testResult = testSmtpConnection(
        $data['MAIL_HOST'],
        (int) $data['MAIL_PORT'],
        $data['MAIL_USERNAME'],
        $data['MAIL_PASSWORD'],
        strtolower($data['MAIL_ENCRYPTION'])
    );
    if (!$testResult['success']) {
        echo json_encode(['success' => false, 'message' => 'SMTP connection test failed: ' . $testResult['error']]);
        exit;
    }
}

// Read and update the .env file
$envContent = file_get_contents($envPath);

$fieldsToUpdate = [
    'MAIL_HOST'         => $data['MAIL_HOST'],
    'MAIL_PORT'         => (string) $port,
    'MAIL_USERNAME'     => $data['MAIL_USERNAME'],
    'MAIL_PASSWORD'     => $data['MAIL_PASSWORD'],
    'MAIL_ENCRYPTION'   => strtolower($data['MAIL_ENCRYPTION']),
    'MAIL_FROM_ADDRESS' => $data['MAIL_FROM_ADDRESS'],
    'MAIL_FROM_NAME'    => $data['MAIL_FROM_NAME'] ?? 'EventOut',
];

foreach ($fieldsToUpdate as $key => $value) {
    // Update existing key, or append if not found
    if (preg_match("/^{$key}=.*/m", $envContent)) {
        $envContent = preg_replace("/^{$key}=.*/m", "{$key}={$value}", $envContent);
    } else {
        $envContent .= "\n{$key}={$value}";
    }
}

file_put_contents($envPath, $envContent);

// Log the action
error_log("[SMTP Settings] Updated by admin auth_id={$admin_auth_id} at " . date('Y-m-d H:i:s'));

echo json_encode([
    'success' => true,
    'message' => 'SMTP settings updated successfully.' . ($testConnection ? ' Connection test passed.' : '')
]);

/**
 * Test SMTP connection using PHPMailer's SMTPConnect
 */
function testSmtpConnection($host, $port, $username, $password, $encryption): array
{
    try {
        require_once __DIR__ . '/../../vendor/autoload.php';
        $smtp = new PHPMailer\PHPMailer\SMTP();
        $smtp->Timeout = 10;

        $tls = ($encryption === 'ssl') ? 'ssl' : '';
        if (!$smtp->connect($tls ? "ssl://{$host}" : $host, $port)) {
            return ['success' => false, 'error' => 'Could not connect to SMTP server.'];
        }

        if (!$smtp->hello(gethostname())) {
            $smtp->quit();
            return ['success' => false, 'error' => 'EHLO command failed.'];
        }

        if ($encryption === 'tls' || $encryption === 'starttls') {
            $smtp->startTLS();
        }

        if (!$smtp->authenticate($username, $password)) {
            $smtp->quit();
            return ['success' => false, 'error' => 'Authentication failed. Check username/password.'];
        }

        $smtp->quit();
        return ['success' => true];
    } catch (Exception $e) {
        return ['success' => false, 'error' => $e->getMessage()];
    }
}
