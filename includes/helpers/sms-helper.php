<?php

/** SMS Helper using Brevo transactional SMS. */

require_once __DIR__ . '/../../config/sms.php';

/**
 * Send an SMS using Brevo API.
 *
 * @param string $phoneNumber Recipient phone number
 * @param string $message SMS message content
 * @return array ['success' => bool, 'message' => string, 'message_id' => string|null]
 */
function sendSMS($phoneNumber, $message)
{
    if (BREVO_SMS_DISABLED) {
        return ['success' => false, 'message' => 'SMS service is not configured.'];
    }

    $phoneNumber = preg_replace('/\D+/', '', (string) $phoneNumber);
    if (str_starts_with($phoneNumber, '0') && strlen($phoneNumber) === 11) {
        $phoneNumber = '234' . substr($phoneNumber, 1);
    } elseif (str_starts_with($phoneNumber, '234') && strlen($phoneNumber) === 13) {
        // Already normalized.
    } else {
        return ['success' => false, 'message' => 'Enter a valid Nigerian phone number.'];
    }

    $data = [
        'sender' => BREVO_SMS_SENDER,
        'recipient' => $phoneNumber,
        'content' => (string) $message,
    ];

    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, BREVO_SMS_URL);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Content-Type: application/json',
        'Accept: application/json',
        'api-key: ' . BREVO_API_KEY
    ]);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 5);
    curl_setopt($ch, CURLOPT_TIMEOUT, 15);

    $response = curl_exec($ch);
    $error = curl_error($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);

    if ($error) {
        error_log('Brevo SMS transport error: ' . $error);
        return ['success' => false, 'message' => 'SMS delivery is temporarily unavailable.'];
    }

    $result = json_decode($response, true);

    if ($httpCode === 201) {
        return [
            'success' => true,
            'message' => 'SMS sent successfully',
            'message_id' => $result['message_id'] ?? null
        ];
    } else {
        error_log('Brevo SMS API error: HTTP ' . $httpCode . ' ' . substr((string) $response, 0, 500));
        return [
            'success' => false,
            'message' => 'SMS delivery failed. Please try again later.'
        ];
    }
}
?>
