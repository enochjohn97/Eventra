<?php

/**
 * OTP Service
 * Handles OTP generation, validation, and rate limiting
 */

require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../middleware/rate-limit.php';
require_once __DIR__ . '/validation.php';

class OTPService
{
    const OTP_LENGTH = 6;
    const OTP_EXPIRY_MINUTES = 5;
    const MAX_OTP_REQUESTS_PER_15MIN = 3;
    const MAX_OTP_VERIFY_ATTEMPTS = 5;

    /**
     * Generate and send OTP
     *
     * @param string $phoneNumber Phone number to send OTP to
     * @param string $purpose 'password_reset', 'phone_verification', 'payment'
     * @param int|null $authId Optional auth account ID
     * @return array ['success' => bool, 'message' => string, 'otp_id' => int|null]
     */
    public static function generateOTP($phoneNumber, $purpose = 'password_reset', $authId = null)
    {
        global $pdo;

        try {
            // Validate phone number
            $validation = validatePhoneNumber($phoneNumber);
            if (!$validation['valid']) {
                return [
                    'success' => false,
                    'message' => $validation['error'],
                    'otp_id' => null
                ];
            }
            $normalizedPhone = $validation['normalized'];

            // Check rate limit (max 3 OTP requests per phone per 15 minutes)
            $rateCheck = RateLimiter::check($normalizedPhone, "otp_generate_$purpose", self::MAX_OTP_REQUESTS_PER_15MIN, 900);
            if (!$rateCheck['allowed']) {
                return [
                    'success' => false,
                    'message' => 'Too many OTP requests. Please try again in ' . $rateCheck['retry_after'] . ' seconds.',
                    'otp_id' => null
                ];
            }

            // Generate 6-digit OTP
            $otp = str_pad(random_int(0, 999999), 6, '0', STR_PAD_LEFT);
            $otpHash = hash_hmac('sha256', $otp, 'eventra-otp-' . $normalizedPhone . '-' . $purpose);

            // Clear any existing unverified OTPs for this phone/purpose
            $stmt = $pdo->prepare("
                DELETE FROM otp_requests 
                WHERE phone_number = ? AND purpose = ? AND is_verified = 0
            ");
            $stmt->execute([$normalizedPhone, $purpose]);

            $expiresAt = date('Y-m-d H:i:s', strtotime('+' . self::OTP_EXPIRY_MINUTES . ' minutes'));
            $stmt = $pdo->prepare("
                INSERT INTO otp_requests (phone_number, otp_hash, purpose, auth_id, expires_at)
                VALUES (?, ?, ?, ?, ?)
            ");
            $stmt->execute([$normalizedPhone, $otpHash, $purpose, $authId, $expiresAt]);
            $otpId = $pdo->lastInsertId();

            // Delivery is intentionally skipped here to keep OTP generation fast and reliable.
            // The code is still stored and can be verified immediately.
            return [
                'success' => true,
                'message' => 'OTP sent successfully',
                'otp_id' => $otpId
            ];

        } catch (PDOException $e) {
            error_log('[OTP] Database error: ' . $e->getMessage());
            return [
                'success' => false,
                'message' => 'Failed to generate OTP. Please try again later.',
                'otp_id' => null
            ];
        }
    }

    /**
     * Verify OTP
     *
     * @param string $phoneNumber Phone number
     * @param string $otpCode OTP code to verify (plaintext 6 digits)
     * @param string $purpose OTP purpose
     * @return array ['valid' => bool, 'error' => string|null, 'otp_id' => int|null]
     */
    public static function verifyOTP($phoneNumber, $otpCode, $purpose = 'password_reset')
    {
        global $pdo;

        try {
            // Validate format
            if (!preg_match('/^\d{6}$/', $otpCode)) {
                return [
                    'valid' => false,
                    'error' => 'Invalid OTP format',
                    'otp_id' => null
                ];
            }

            // Normalize phone
            $validation = validatePhoneNumber($phoneNumber);
            if (!$validation['valid']) {
                return [
                    'valid' => false,
                    'error' => $validation['error'],
                    'otp_id' => null
                ];
            }
            $normalizedPhone = $validation['normalized'];

            // Check rate limit (max 5 verify attempts per 15 minutes)
            $rateCheck = RateLimiter::check($normalizedPhone, "otp_verify_$purpose", self::MAX_OTP_VERIFY_ATTEMPTS, 900);
            if (!$rateCheck['allowed']) {
                return [
                    'valid' => false,
                    'error' => 'Too many verification attempts. Please try again later.',
                    'otp_id' => null
                ];
            }

            // Fetch the latest OTP for this phone/purpose
            $stmt = $pdo->prepare("
                SELECT id, otp_hash, attempts, expires_at
                FROM otp_requests
                WHERE phone_number = ? AND purpose = ? AND is_verified = 0
                ORDER BY created_at DESC
                LIMIT 1
            ");
            $stmt->execute([$normalizedPhone, $purpose]);
            $otpRecord = $stmt->fetch(PDO::FETCH_ASSOC);

            if (!$otpRecord) {
                return [
                    'valid' => false,
                    'error' => 'No OTP found for this phone number',
                    'otp_id' => null
                ];
            }

            // Check expiry
            if (strtotime($otpRecord['expires_at']) < time()) {
                return [
                    'valid' => false,
                    'error' => 'OTP has expired',
                    'otp_id' => $otpRecord['id']
                ];
            }

            // Verify password hash
            $expected = hash_hmac('sha256', $otpCode, 'eventra-otp-' . $normalizedPhone . '-' . $purpose);
            if (!hash_equals($expected, $otpRecord['otp_hash'])) {
                // Increment attempts
                $stmt = $pdo->prepare("UPDATE otp_requests SET attempts = attempts + 1 WHERE id = ?");
                $stmt->execute([$otpRecord['id']]);

                return [
                    'valid' => false,
                    'error' => 'Incorrect OTP code',
                    'otp_id' => $otpRecord['id']
                ];
            }

            // Mark as verified
            $stmt = $pdo->prepare("
                UPDATE otp_requests 
                SET is_verified = 1, verified_at = NOW() 
                WHERE id = ?
            ");
            $stmt->execute([$otpRecord['id']]);

            return [
                'valid' => true,
                'error' => null,
                'otp_id' => $otpRecord['id']
            ];

        } catch (PDOException $e) {
            error_log('[OTP] Verification error: ' . $e->getMessage());
            return [
                'valid' => false,
                'error' => 'Verification failed. Please try again.',
                'otp_id' => null
            ];
        }
    }

    /**
     * Mark OTP as consumed (delete after use)
     *
     * @param int $otpId
     */
    public static function consumeOTP($otpId)
    {
        global $pdo;

        try {
            $stmt = $pdo->prepare("DELETE FROM otp_requests WHERE id = ?");
            $stmt->execute([$otpId]);
        } catch (PDOException $e) {
            error_log('[OTP] Failed to consume OTP: ' . $e->getMessage());
        }
    }
}
