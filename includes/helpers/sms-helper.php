<?php

/** SMS Helper using Brevo transactional SMS. */

require_once __DIR__ . '/../../config/sms.php';

/**
 * Record an SMS delivery attempt in sms_logs so every send (or failure)
 * has an auditable trail. Logging failures must never break the caller.
 *
 * @param string $phone       Normalized recipient number
 * @param string $message     Message body
 * @param string $messageType sms_logs.message_type enum value
 * @param string $status      'sent' or 'failed'
 * @param string|null $sid    Provider message id on success
 * @param string|null $error  Failure detail
 * @param array  $context     Optional ['auth_id' => int, 'user_id' => int, 'client_id' => int]
 */
if (!function_exists('logSmsAttempt')) {
    function logSmsAttempt(string $phone, string $message, string $messageType, string $status, ?string $sid, ?string $error, array $context = []): void
    {
        if (!function_exists('getPDO')) {
            return; // No DB layer available (should not happen in request flows)
        }
        try {
            $pdo = getPDO();
            $pdo->prepare(
                "INSERT INTO sms_logs (auth_id, user_id, client_id, phone_number, message_type, message_body, termii_sid, termii_status, termii_error_message)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
            )->execute([
                $context['auth_id'] ?? null,
                $context['user_id'] ?? null,
                $context['client_id'] ?? null,
                substr($phone, 0, 20),
                in_array($messageType, ['otp', 'event_reminder', 'payment_confirmation', 'ticket_confirmation', 'admin_notification'], true)
                    ? $messageType
                    : 'ticket_confirmation',
                substr($message, 0, 1000),
                $sid !== null ? substr($sid, 0, 100) : null,
                $status,
                $error !== null ? substr($error, 0, 255) : null,
            ]);
        } catch (\Throwable $logError) {
            error_log('[SMS] Failed to record sms_logs entry: ' . $logError->getMessage());
        }
    }
}

/**
 * Send an SMS using Brevo API and record the outcome in sms_logs.
 *
 * @param string $phoneNumber Recipient phone number
 * @param string $message     SMS message content
 * @param string $messageType sms_logs.message_type enum value (default: ticket_confirmation)
 * @param array  $context     Optional recipient context: auth_id, user_id, client_id
 * @return array ['success' => bool, 'message' => string, 'message_id' => string|null]
 */
function sendSMS($phoneNumber, $message, $messageType = 'ticket_confirmation', array $context = [])
{
    if (BREVO_SMS_DISABLED) {
        return ['success' => false, 'message' => 'SMS service is not configured.'];
    }

    $phoneNumber = preg_replace('/\D+/', '', (string) $phoneNumber);
    if (str_starts_with($phoneNumber, '0') && strlen($phoneNumber) === 11) {
        $phoneNumber = '234' . substr($phoneNumber, 1);
    } elseif (strlen($phoneNumber) === 10) {
        // Local mobile without a leading 0 (e.g. 8031234567) → Nigerian country code.
        $phoneNumber = '234' . $phoneNumber;
    } elseif (str_starts_with($phoneNumber, '234') && strlen($phoneNumber) === 13) {
        // Already normalized.
    } else {
        logSmsAttempt($phoneNumber, (string) $message, $messageType, 'failed', null, 'Invalid phone number format', $context);
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
        logSmsAttempt($phoneNumber, (string) $message, $messageType, 'failed', null, 'Transport error: ' . $error, $context);
        return ['success' => false, 'message' => 'SMS delivery is temporarily unavailable.'];
    }

    $result = json_decode($response, true);

    if ($httpCode === 201) {
        $messageId = $result['message_id'] ?? null;
        logSmsAttempt($phoneNumber, (string) $message, $messageType, 'sent', $messageId, null, $context);
        return [
            'success' => true,
            'message' => 'SMS sent successfully',
            'message_id' => $messageId
        ];
    }

    error_log('Brevo SMS API error: HTTP ' . $httpCode . ' ' . substr((string) $response, 0, 500));
    logSmsAttempt(
        $phoneNumber,
        (string) $message,
        $messageType,
        'failed',
        null,
        'HTTP ' . $httpCode . ': ' . substr((string) $response, 0, 250),
        $context
    );
    return [
        'success' => false,
        'message' => 'SMS delivery failed. Please try again later.'
    ];
}
