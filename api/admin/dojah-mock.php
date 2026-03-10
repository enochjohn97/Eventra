<?php
/**
 * Dojah Mock API Decoder
 * Accepts NIN and BVN from requests and simulates a verification response.
 * Uses consistent randomness: NIN ends with '1' = verified, BVN ends with '1' = verified.
 * Otherwise, success rate is 80%.
 */
header('Content-Type: application/json');

$method = $_SERVER['REQUEST_METHOD'];

if ($method !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

$input = json_decode(file_get_contents('php://input'), true);
$type = $input['type'] ?? null;
$number = $input['number'] ?? null;

if (!in_array($type, ['nin', 'bvn']) || !$number) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid parameters. Need type (nin/bvn) and number.']);
    exit;
}

// Mock validation logic
$is_verified = false;

// If it ends in 1, always pass (for easy testing). If it ends in 0, always fail.
$last_digit = substr(trim($number), -1);

if ($last_digit === '1') {
    $is_verified = true;
} else if ($last_digit === '0') {
    $is_verified = false;
} else {
    // 80% pass rate for other numbers
    $is_verified = (rand(1, 100) <= 80);
}

// Small sleep to simulate network latency
usleep(500000); // 0.5 sec

echo json_encode([
    'success' => true,
    'data' => [
        'type' => $type,
        'number' => $number,
        'verified' => $is_verified,
        'timestamp' => date('c'),
        'reference' => 'mock_dojah_' . uniqid()
    ]
]);
