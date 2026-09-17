<?php

/**
 * Rate Limiting Middleware
 * Provides IP-based and user-based rate limiting
 */

require_once __DIR__ . '/../../config/database.php';

class RateLimiter
{
    private static $table = 'rate_limits';

    /**
     * Initialize rate limiting table if not exists
     */
    public static function init()
    {
        global $pdo;
        
        $sql = "
            CREATE TABLE IF NOT EXISTS rate_limits (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                identifier VARCHAR(255) NOT NULL,
                endpoint VARCHAR(191) NOT NULL,
                attempts INT UNSIGNED NOT NULL DEFAULT 1,
                first_attempt_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                last_attempt_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                UNIQUE KEY uq_identifier_endpoint (identifier, endpoint),
                KEY idx_last_attempt (last_attempt_at),
                KEY idx_endpoint (endpoint)
            ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci
        ";
        
        try {
            $pdo->exec($sql);
        } catch (PDOException $e) {
            error_log('Rate limit table already exists or error: ' . $e->getMessage());
        }
    }

    /**
     * Check if request is rate-limited
     *
     * @param string $identifier Usually IP address or user_id
     * @param string $endpoint API endpoint or action name
     * @param int $maxAttempts Maximum allowed attempts
     * @param int $windowSeconds Time window in seconds (default: 900 = 15 minutes)
     * @return array ['allowed' => bool, 'remaining' => int, 'retry_after' => int|null]
     */
    public static function check($identifier, $endpoint, $maxAttempts = 3, $windowSeconds = 900)
    {
        global $pdo;

        try {
            // Clean old records (older than 1 hour) — probabilistic to avoid a
            // full-table delete on EVERY request (a heavy write on hot endpoints)
            if (random_int(1, 100) <= 5) {
                $pdo->exec("DELETE FROM rate_limits WHERE last_attempt_at < (NOW() - INTERVAL 1 HOUR)");
            }

            // Get current attempt count
            $stmt = $pdo->prepare("
                SELECT attempts, last_attempt_at 
                FROM rate_limits 
                WHERE identifier = ? AND endpoint = ?
            ");
            $stmt->execute([$identifier, $endpoint]);
            $record = $stmt->fetch(PDO::FETCH_ASSOC);

            $now = time();

            if (!$record) {
                // First attempt, create record
                $stmt = $pdo->prepare("
                    INSERT INTO rate_limits (identifier, endpoint, attempts) 
                    VALUES (?, ?, 1)
                ");
                $stmt->execute([$identifier, $endpoint]);

                return [
                    'allowed' => true,
                    'remaining' => $maxAttempts - 1,
                    'retry_after' => null
                ];
            }

            $lastAttemptTime = strtotime($record['last_attempt_at']);
            $timeSinceLastAttempt = $now - $lastAttemptTime;

            // Check if window has expired
            if ($timeSinceLastAttempt > $windowSeconds) {
                // Reset counter
                $stmt = $pdo->prepare("
                    UPDATE rate_limits 
                    SET attempts = 1, first_attempt_at = NOW(), last_attempt_at = NOW() 
                    WHERE identifier = ? AND endpoint = ?
                ");
                $stmt->execute([$identifier, $endpoint]);

                return [
                    'allowed' => true,
                    'remaining' => $maxAttempts - 1,
                    'retry_after' => null
                ];
            }

            // Still in the same window
            $attempts = (int)$record['attempts'];
            $remaining = $maxAttempts - $attempts;

            if ($attempts >= $maxAttempts) {
                // Rate limit exceeded
                $retryAfter = $windowSeconds - $timeSinceLastAttempt;
                return [
                    'allowed' => false,
                    'remaining' => 0,
                    'retry_after' => $retryAfter
                ];
            }

            // Increment attempt
            $stmt = $pdo->prepare("
                UPDATE rate_limits 
                SET attempts = attempts + 1, last_attempt_at = NOW() 
                WHERE identifier = ? AND endpoint = ?
            ");
            $stmt->execute([$identifier, $endpoint]);

            return [
                'allowed' => true,
                'remaining' => max(0, $remaining - 1),
                'retry_after' => null
            ];

        } catch (PDOException $e) {
            error_log('Rate limiter error: ' . $e->getMessage());
            // On error, allow the request (fail-open)
            return ['allowed' => true, 'remaining' => 0, 'retry_after' => null];
        }
    }

    /**
     * Get client IP address
     */
    public static function getClientIP()
    {
        if (!empty($_SERVER['HTTP_CLIENT_IP'])) {
            $ip = $_SERVER['HTTP_CLIENT_IP'];
        } elseif (!empty($_SERVER['HTTP_X_FORWARDED_FOR'])) {
            $ip = explode(',', $_SERVER['HTTP_X_FORWARDED_FOR'])[0];
        } else {
            $ip = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
        }

        // Validate IP
        if (filter_var($ip, FILTER_VALIDATE_IP)) {
            return $ip;
        }

        return '0.0.0.0';
    }
}

// Table creation is lazy: only run when the rate limiter is actually used
// (prevents a CREATE TABLE on every request that merely includes this file).
if (!defined('RATE_LIMIT_TABLE_READY')) {
    define('RATE_LIMIT_TABLE_READY', true);
    RateLimiter::init();
}

