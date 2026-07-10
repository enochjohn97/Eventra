<?php

/**
 * Identity Verification API — Separate BVN/NIN validation
 *
 * POST: type ('bvn'|'nin'), number
 *
 * Legitimizes bank details by cross-checking names (simulated/mocked)
 */

header('Content-Type: application/json');
require_once __DIR__ . '/../../server/config.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/middleware/auth.php';

// Get client ID from auth check
$client_id = clientMiddleware();

// If we get here, client_id is already verified
// clientMiddleware() would have exited if not authenticated

if (!$client_id) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Invalid client authentication']);
    exit;
}

$data = json_decode(file_get_contents('php://input'), true) ?? [];
$type = strtolower(trim($data['type'] ?? ''));
$number = trim($data['number'] ?? '');


if (!in_array($type, ['bvn', 'nin']) || empty($number)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Valid type (bvn/nin) and number are required.']);
    exit;
}

try {
    $pdo->beginTransaction();

    // Fetch existing client metadata
    $stmt = $pdo->prepare("SELECT id, metadata FROM clients WHERE id = ?");
    $stmt->execute([$client_id]);
    $client = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$client) {
        $pdo->rollBack();
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Client profile not found.']);
        exit;
    }

    // ── Simplified identity validation (length-based, no external API) ──
    // NIN: exactly 11 digits, BVN: exactly 11 digits
    $expectedLength = 11; // Both NIN and BVN are 11 digits
    $verified = (strlen($number) === $expectedLength && ctype_digit($number));

    if (!$verified) {
        $pdo->rollBack();
        $label = ($type === 'nin') ? '11-digit NIN' : '11-digit BVN';
        echo json_encode(['success' => false, 'message' => "Please enter a valid $label (11 numeric digits)."]);
        exit;
    }

    // Record verification in metadata (v2 schema — no dedicated nin_verified/bvn_verified columns)
    $meta = json_decode($client['metadata'] ?? '{}', true) ?: [];
    $meta[$type . '_verified'] = true;
    $meta[$type . '_number']   = $number;
    $meta[$type . '_verified_at'] = date('Y-m-d H:i:s');

    $updateStmt = $pdo->prepare("
        UPDATE clients 
        SET metadata = ?,
            updated_at = NOW() 
        WHERE id = ?
    ");
    $updateStmt->execute([json_encode($meta), $client_id]);

    $pdo->commit();

    echo json_encode([
        'success' => true,
        'message' => ucfirst($type) . ' verified successfully.',
        'legitimatized' => true // Metadata indicating this legitimizes bank details
    ]);
} catch (PDOException $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database error.']);
}
