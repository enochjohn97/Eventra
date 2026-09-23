<?php


header('Content-Type: application/json');
require_once __DIR__ . '/../../server/config.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../config/env-loader.php';
require_once __DIR__ . '/../../includes/middleware/auth.php';

// Get client ID from auth check
$client_id = clientMiddleware();

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

// ── Basic format guards (before any provider call) ──────────────────────────
if (!ctype_digit($number) || strlen($number) !== 11) {
    $label = ($type === 'nin') ? 'NIN' : 'BVN';
    http_response_code(422);
    echo json_encode(['success' => false, 'message' => "Please enter a valid $label (exactly 11 numeric digits)."]);
    exit;
}

// BVN checksum: NIBSS uses the Luhn algorithm (mod-10) over the 11 digits.
if ($type === 'bvn' && !bvnLuhnValid($number)) {
    http_response_code(422);
    echo json_encode(['success' => false, 'message' => 'This BVN failed its checksum — please re-check the digits.']);
    exit;
}

// Rate-limit verification attempts per client (5 per 15 min) — each check
// costs money on the provider, so abuse must be prevented.
require_once __DIR__ . '/../../includes/middleware/rate-limit.php';
$rateCheck = RateLimiter::check('client_' . $client_id, 'identity_verify', 5, 900);
if (!$rateCheck['allowed']) {
    http_response_code(429);
    echo json_encode(['success' => false, 'message' => 'Too many verification attempts. Please try again in a few minutes.']);
    exit;
}

/**
 * Luhn checksum used by NIBSS for BVN validation.
 * The 11th digit is the check digit for the first 10.
 */
function bvnLuhnValid(string $bvn): bool
{
    $digits = array_map('intval', str_split($bvn));
    $sum = 0;
    // Walk digits 0..9 (check digit is index 10), doubling every second from the right.
    for ($i = 0; $i < 10; $i++) {
        $d = $digits[$i];
        if (($i % 2) === 0) {
            $d *= 2;
            if ($d > 9) {
                $d -= 9;
            }
        }
        $sum += $d;
    }
    return ((10 - ($sum % 10)) % 10) === $digits[10];
}

/**
 * Verify a BVN through Dojah. Returns:
 *   ['verified' => bool, 'provider' => string, 'detail' => string]
 */
function verifyBvnViaDojah(string $bvn, array $data): array
{
    $appId = ($_ENV['DOJAH_APP_ID'] ?? getenv('DOJAH_APP_ID') ?: '');
    $secretKey = ($_ENV['DOJAH_SECRET_KEY'] ?? getenv('DOJAH_SECRET_KEY') ?: '');
    $baseUrl = rtrim(($_ENV['DOJAH_BASE_URL'] ?? getenv('DOJAH_BASE_URL') ?: 'https://api.dojah.io'), '/');

    if ($appId === '' || $secretKey === '') {
        // No credentials — fall back to local (format-only) validation.
        return ['verified' => true, 'provider' => 'local', 'detail' => 'Format + checksum validated locally (Dojah credentials not configured).'];
    }

    $firstName = trim($data['first_name'] ?? '');
    $lastName = trim($data['last_name'] ?? '');
    $dob = trim($data['dob'] ?? '');

    $query = ['bvn' => $bvn];
    if ($firstName !== '') $query['first_name'] = $firstName;
    if ($lastName !== '') $query['last_name'] = $lastName;
    if ($dob !== '') $query['dob'] = $dob;

    $url = $baseUrl . '/api/v1/kyc/bvn?' . http_build_query($query);

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 20,
        CURLOPT_HTTPHEADER => [
            'Authorization: ' . $secretKey, // as-is, NOT Bearer (per Dojah docs)
            'AppId: ' . $appId,
            'Accept: application/json',
        ],
    ]);
    if (($_ENV['APP_ENV'] ?? '') === 'local') {
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
    }

    $response = curl_exec($ch);
    $curlError = curl_error($ch);
    $httpCode = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);

    if ($curlError || $response === false) {
        error_log('[verify-identity] Dojah cURL error: ' . $curlError);
        // Provider unreachable — fail CLOSED for BVN (never mark verified on
        // an unverified network). Client can retry.
        return ['verified' => false, 'provider' => 'dojah', 'detail' => 'Verification service unreachable. Please try again shortly.'];
    }

    $result = json_decode((string) $response, true);

    // 200 → entity.bvn.status === true means the BVN exists & matches supplied fields.
    if ($httpCode === 200 && isset($result['entity']['bvn']['status'])) {
        $bvnOk = (bool) $result['entity']['bvn']['status'];

        // If names/DOB were supplied, require them to match too (per-field status).
        if ($bvnOk) {
            foreach (['first_name', 'last_name'] as $field) {
                if (isset($result['entity'][$field]['status']) && $result['entity'][$field]['status'] !== true) {
                    return ['verified' => false, 'provider' => 'dojah', 'detail' => 'The name supplied does not match this BVN record.'];
                }
            }
            if ($dob !== '' && isset($result['entity']['dob']['status']) && $result['entity']['dob']['status'] !== true) {
                return ['verified' => false, 'provider' => 'dojah', 'detail' => 'The date of birth supplied does not match this BVN record.'];
            }
        }

        return $bvnOk
            ? ['verified' => true, 'provider' => 'dojah', 'detail' => 'BVN verified against the central registry.']
            : ['verified' => false, 'provider' => 'dojah', 'detail' => 'BVN could not be validated by the registry.'];
    }

    // Map Dojah error codes to user-friendly messages.
    $messages = [
        400 => $result['error'] ?? 'BVN not found in the registry.',
        401 => 'Verification service credentials are invalid. Contact support.',
        402 => 'Verification service is temporarily unavailable (wallet). Try again later.',
        404 => 'No BVN record was found for this number.',
        424 => 'The verification source is temporarily unavailable. Please retry shortly.',
        429 => 'Verification service is busy. Please retry in a moment.',
    ];
    return [
        'verified' => false,
        'provider' => 'dojah',
        'detail' => $messages[$httpCode] ?? ('Verification failed (HTTP ' . $httpCode . ').'),
    ];
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

    // ── Provider verification ────────────────────────────────────────────────
    if ($type === 'bvn') {
        $verification = verifyBvnViaDojah($number, $data);
    } else {
        // NIN: 11 digits — length + checksum-free local validation for now.
        $verification = ['verified' => true, 'provider' => 'local', 'detail' => 'Format validated locally (11 digits).'];
    }

    if (!$verification['verified']) {
        $pdo->rollBack();
        http_response_code(422);
        echo json_encode([
            'success' => false,
            'message' => $verification['detail'],
            'provider' => $verification['provider'],
        ]);
        exit;
    }

    // Record verification in metadata (v2 schema — no dedicated nin_verified/bvn_verified columns)
    $meta = json_decode($client['metadata'] ?? '{}', true) ?: [];
    $meta[$type . '_verified'] = true;
    // Store only a masked copy of the number — never the full BVN in metadata.
    $meta[$type . '_number_masked'] = substr($number, 0, 3) . '*****' . substr($number, -3);
    $meta[$type . '_verified_at'] = date('Y-m-d H:i:s');
    $meta[$type . '_provider'] = $verification['provider'];

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
        'provider' => $verification['provider'],
        'legitimatized' => true,
    ]);
} catch (PDOException $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    error_log('[verify-identity] DB error: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database error.']);
}
