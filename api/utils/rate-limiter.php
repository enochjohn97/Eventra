<?php

/**
 * Lightweight rate limiter for public/unauthenticated ticket endpoints.
 *
 * Sliding-window counters keyed by (bucket name, client identity). Identity
 * is the PHP session id when available, falling back to client IP. State is
 * kept in files under logs/ratelimit/ so it works on every hosting type
 * (no APCu / Redis / DB table required) and across PHP-FPM workers.
 *
 * Usage:  require_once __DIR__ . '/rate-limiter.php';
 *         ticket_rate_limit('qr_image', 30, 300); // 30 req / 5 min
 *
 * Throws RateLimitExceeded (catch it to emit 429) — or pass $die=true to
 * emit the 429 JSON response and exit directly.
 */

if (!defined('TICKET_RATE_LIMITERLoaded')) {
    define('TICKET_RATE_LIMITERLoaded', 1);

    class RateLimitExceeded extends Exception
    {
        public $retryAfter;
        public function __construct($retryAfter)
        {
            $this->retryAfter = $retryAfter;
            parent::__construct('Rate limit exceeded');
        }
    }

    function ticket_rate_limit_client_key(): string
    {
        // Trust the session id ONLY when the client actually sent a session
        // cookie — a cookieless request (curl, bots, fresh attackers) would
        // otherwise mint a brand-new PHP session per request and get a fresh
        // rate-limit bucket every time. Cookieless clients are keyed by IP.
        $sid = '';
        foreach (['EVENTRA_USER_SESS', 'EVENTRA_CLIENT_SESS', 'EVENTRA_ADMIN_SESS', 'PHPSESSID'] as $c) {
            if (!empty($_COOKIE[$c])) {
                $sid = (string) $_COOKIE[$c];
                break;
            }
        }
        $ip = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? ($_SERVER['REMOTE_ADDR'] ?? 'unknown');
        // Take the first IP in the chain (closest client) and normalise.
        $ip = trim(explode(',', (string) $ip)[0]);
        if ($ip === '' || strlen($ip) > 45) {
            $ip = 'unknown';
        }
        return substr(sha1($sid . '|' . $ip), 0, 24);
    }

    /**
     * @param string $bucket   Logical bucket name (e.g. 'qr_image')
     * @param int    $maxHits  Max requests allowed inside the window
     * @param int    $window   Window length in seconds
     * @param bool   $die      Emit 429 + exit when exceeded (default true)
     * @return int  Current hit count for this window
     */
    function ticket_rate_limit(string $bucket, int $maxHits, int $window, bool $die = true): int
    {
        try {
            $root = dirname(__DIR__, 2); // api/utils -> project root
            $dir = $root . '/logs/ratelimit';
            if (!is_dir($dir)) {
                @mkdir($dir, 0755, true);
            }
            $key = ticket_rate_limit_client_key();
            $file = $dir . '/' . preg_replace('/[^a-z0-9_]/i', '', $bucket) . '_' . $key . '.cnt';
            $now = time();
            $hits = [];
            if (is_file($file)) {
                $raw = @file_get_contents($file);
                $decoded = $raw === false ? null : json_decode($raw, true);
                if (is_array($decoded)) {
                    $hits = $decoded;
                }
            }
            // Drop expired entries
            $hits = array_values(array_filter($hits, static fn($t) => is_numeric($t) && ($now - (int) $t) < $window));
            $hits[] = $now;
            @file_put_contents($file, json_encode($hits), LOCK_EX);

            if (count($hits) > $maxHits) {
                $oldest = min($hits);
                $retry = max(1, $window - ($now - $oldest));
                error_log("[rate-limiter] {$bucket} exceeded by client " . substr($key, 0, 8) . " (" . count($hits) . "/{$maxHits})");
                if (headers_sent() === false) {
                    http_response_code(429);
                    header('Content-Type: application/json');
                    header('Retry-After: ' . $retry);
                }
                if ($die) {
                    echo json_encode([
                        'success' => false,
                        'message' => 'Too many requests. Please slow down and try again shortly.',
                        'retry_after' => $retry,
                    ]);
                    exit;
                }
                throw new RateLimitExceeded($retry);
            }
            return count($hits);
        } catch (RateLimitExceeded $e) {
            throw $e;
        } catch (Throwable $e) {
            // Rate limiting must never take the endpoint down.
            error_log('[rate-limiter] non-fatal: ' . $e->getMessage());
            return 0;
        }
    }
}
