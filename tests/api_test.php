<?php
/**
 * Simple PHP script to test core Eventra API endpoints.
 * Run from terminal: php tests/api_test.php
 */

function runTest($name, $url)
{
    echo "\nTesting: $name\n";
    echo "URL: $url\n";
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    // Suppress warnings for self-signed certificates if testing locally with https
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    echo "Status Code: $httpCode\n";
    if ($httpCode >= 200 && $httpCode < 300) {
        $json = json_decode($response, true);
        if ($json && isset($json['success']) && $json['success'] === true) {
            echo "Result: PASS ✅\n";
            return true;
        } else {
            echo "Result: FAIL (API returned success=false or invalid JSON) ❌\n";
            echo "Response: $response\n";
            return false;
        }
    } else {
        echo "Result: FAIL (HTTP Error) ❌\n";
        echo "Response: $response\n";
        return false;
    }
}

$baseUrl = "http://localhost:8000/api";
$passed = 0;
$total = 0;

echo "========================================\n";
echo "Starting API Tests...\n";
echo "========================================\n";

// 1. Test Get Events (Public)
$total++;
if (runTest("Get Events List", "$baseUrl/events/get-events.php?limit=5")) {
    $passed++;
}

// 2. Test Search (e.g. searching for a specific term or empty to get all)
$total++;
if (runTest("Search Events (Empty Query)", "$baseUrl/events/search-events.php?q=")) {
    $passed++;
}

// 3. Test Invalid Event ID fetch
$total++;
echo "\nTesting: Get Invalid Event\n";
$url = "$baseUrl/events/get-event.php?id=999999";
echo "URL: $url\n";
$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);
echo "Status Code: $httpCode\n";
$json = json_decode($response, true);
// Expecting success = false but an explicit 'Event not found' message
if ($json && isset($json['success']) && $json['success'] === false && strpos(strtolower($json['message']), 'not found') !== false) {
    echo "Result: PASS (Correctly handled invalid ID) ✅\n";
    $passed++;
} else {
    echo "Result: FAIL ❌ (Expected: 'Event not found', Got: " . ($json['message'] ?? 'Unknown') . ")\n";
}

echo "========================================\n";
echo "Test Summary: $passed / $total passed.\n";
echo "========================================\n";
