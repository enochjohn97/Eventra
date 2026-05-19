<?php

/**
 * SMS Helper using Termii
 */

require_once __DIR__ . '/../../config/sms.php';

/**
 * Send an SMS using Termii API
 *
 * @param string $phoneNumber Recipient phone number (without +)
 * @param string $message SMS message content
 * @return array ['success' => bool, 'message' => string, 'message_id' => string|null]
 */
function sendSMS($phoneNumber, $message)
{
    if (defined('TERMII_SMS_DISABLED') && TERMII_SMS_DISABLED) {
        return ['success' => false, 'message' => 'SMS service disabled. Configure TERMII credentials in .env'];
    }

    if (empty(TERMII_API_KEY) || empty(TERMII_SENDER_ID)) {
        return ['success' => false, 'message' => 'Termii credentials not configured'];
    }

    // ── Phone Number Normalization ──────────────────────────────────────────
    // Strip all non-numeric characters
    $phoneNumber = preg_replace('/[^\d]/', '', $phoneNumber);

    if (strpos($phoneNumber, '0') === 0 && strlen($phoneNumber) === 11) {
        // standard Nigeria local format: 080... -> 23480...
        $phoneNumber = '234' . substr($phoneNumber, 1);
    }
    // ──────────────────────────────────────────────────────────────────────────

    $data = [
        "to" => $phoneNumber,
        "from" => TERMII_SENDER_ID,
        "sms" => $message,
        "type" => "plain",
        "channel" => "dnd", // DND routes past Do-Not-Disturb lists
        "api_key" => TERMII_API_KEY,
    ];

    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, TERMII_SMS_URL);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Content-Type: application/json',
        'Accept: application/json'
    ]);

    if (($_ENV['APP_ENV'] ?? '') === 'local') {
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
    }

    $response = curl_exec($ch);
    $error = curl_error($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);

    if ($error) {
        error_log("Termii SMS Error: " . $error);
        return ['success' => false, 'message' => "CURL Error: " . $error];
    }

    $result = json_decode($response, true);

    if ($httpCode >= 200 && $httpCode < 300 && isset($result['message_id'])) {
        return [
            'success' => true,
            'message' => 'SMS sent successfully',
            'message_id' => $result['message_id']
        ];
    } else {
        error_log("Termii API Error: " . ($result['message'] ?? $response));
        return [
            'success' => false,
            'message' => $result['message'] ?? 'Unknown Termii error'
        ];
    }
}
