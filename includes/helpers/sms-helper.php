<?php

/**
 * SMS Helper using Sendchamp
 */

require_once __DIR__ . '/../../config/sms.php';

/**
 * Send an SMS using Sendchamp API
 *
 * @param string $phoneNumber Recipient phone number
 * @param string $message SMS message content
 * @return array ['success' => bool, 'message' => string, 'message_id' => string|null]
 */
function sendSMS($phoneNumber, $message)
{
    if (defined('SENDCHAMP_SMS_DISABLED') && SENDCHAMP_SMS_DISABLED) {
        return ['success' => false, 'message' => 'SMS service disabled. Configure SENDCHAMP credentials in .env'];
    }

    if (empty(SENDCHAMP_SECRET_KEY) || empty(SENDCHAMP_SENDER_ID)) {
        return ['success' => false, 'message' => 'Sendchamp credentials not configured'];
    }

    // ── Phone Number Normalization ──────────────────────────────────────────
    // Strip all non-numeric characters except +
    $phoneNumber = preg_replace('/[^\d+]/', '', $phoneNumber);

    if (strpos($phoneNumber, '0') === 0 && strlen($phoneNumber) === 11) {
        // standard Nigeria local format: 080... -> 23480...
        $phoneNumber = '234' . substr($phoneNumber, 1);
    }
    // ──────────────────────────────────────────────────────────────────────────

    $data = [
        "to" => [$phoneNumber],
        "message" => $message,
        "sender_name" => SENDCHAMP_SENDER_ID,
        "route" => "dnd"
    ];

    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, SENDCHAMP_SMS_URL);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Content-Type: application/json',
        'Accept: application/json',
        'Authorization: Bearer ' . SENDCHAMP_SECRET_KEY
    ]);

    if (($_ENV['APP_ENV'] ?? '') === 'local') {
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
    }

    $response = curl_exec($ch);
    $error = curl_error($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);

    if ($error) {
        error_log("Sendchamp SMS Error: " . $error);
        return ['success' => false, 'message' => "CURL Error: " . $error];
    }

    $result = json_decode($response, true);

    if ($httpCode >= 200 && $httpCode < 300) {
        return [
            'success' => true,
            'message' => 'SMS sent successfully',
            'message_id' => $result['data']['message_id'] ?? ($result['message_id'] ?? null)
        ];
    } else {
        error_log("Sendchamp API Error: " . ($result['message'] ?? $response));
        return [
            'success' => false,
            'message' => $result['message'] ?? 'Unknown Sendchamp error'
        ];
    }
}
?>
