<?php

require_once __DIR__ . '/../../config/database.php';

if (!function_exists('shortUrlBase62Encode')) {
    /** Base62 encoding (URL-safe alphabet). */
    function shortUrlBase62Encode(int $n): string
    {
        $alphabet = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
        if ($n === 0) {
            return '0';
        }
        $out = '';
        while ($n > 0) {
            $rem = $n % 62;
            $out = $alphabet[$rem] . $out;
            $n = intdiv($n, 62);
        }
        return $out;
    }
}

if (!function_exists('shortUrlCodeLengthForId')) {
    /** Code length for an id — 4 chars for the first ~850k links, then grows. */
    function shortUrlCodeLengthForId(int $id): int
    {
        if ($id <= 62 * 62 * 62) {
            return 4;
        }
        if ($id <= 62 * 62 * 62 * 62) {
            return 5;
        }
        return 6;
    }
}

if (!function_exists('shortUrlEncodeId')) {
    /** Encode a row id into a code, padded to its length class. */
    function shortUrlEncodeId(int $id): string
    {
        $code = shortUrlBase62Encode($id);
        $len = shortUrlCodeLengthForId($id);
        return str_pad($code, $len, '0', STR_PAD_LEFT);
    }
}

if (!function_exists('shortUrlDecodeId')) {
    /** Decode a base62 code back to its row id (0 when invalid). */
    function shortUrlDecodeId(string $code): int
    {
        $alphabet = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
        $n = 0;
        $len = strlen($code);
        for ($i = 0; $i < $len; $i++) {
            $pos = strpos($alphabet, $code[$i]);
            if ($pos === false) {
                return 0;
            }
            $n = $n * 62 + $pos;
        }
        return $n;
    }
}

if (!function_exists('ensureShortUrlsTable')) {
    /** Create the short_urls table if the current database lacks it. */
    function ensureShortUrlsTable(PDO $pdo): void
    {
        static $checked = false;
        if ($checked) {
            return;
        }
        try {
            $pdo->query("SELECT 1 FROM short_urls LIMIT 1");
        } catch (PDOException $e) {
            $pdo->exec("
                CREATE TABLE IF NOT EXISTS short_urls (
                    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                    code VARCHAR(20) NOT NULL UNIQUE,
                    long_url VARCHAR(2048) NOT NULL,
                    kind VARCHAR(30) NOT NULL DEFAULT 'custom',
                    ref_key VARCHAR(190) DEFAULT NULL,
                    clicks INT UNSIGNED NOT NULL DEFAULT 0,
                    last_click_at DATETIME DEFAULT NULL,
                    created_by INT UNSIGNED DEFAULT NULL,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_long (long_url(255)),
                    INDEX idx_kind_key (kind, ref_key)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            ");
        }
        $checked = true;
    }
}

if (!function_exists('shortUrlPDO')) {
    /** Lazily obtain a PDO (works in scripts that have not included database.php). */
    function shortUrlPDO(): ?PDO
    {
        static $pdo = null;
        if ($pdo instanceof PDO) {
            return $pdo;
        }
        try {
            if (function_exists('getPDO')) {
                $pdo = getPDO();
            } else {
                $pdo = new PDO(
                    'mysql:host=' . (get_env_var('DB_HOST') ?: '127.0.0.1')
                    . ';port=' . (get_env_var('DB_PORT') ?: '3306')
                    . ';dbname=' . (get_env_var('DB_DATABASE') ?: 'eventra_db')
                    . ';charset=utf8mb4',
                    (string) get_env_var('DB_USERNAME', 'root'),
                    (string) get_env_var('DB_PASSWORD', ''),
                    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
                );
            }
        } catch (Throwable $e) {
            error_log('[ShortUrl] DB unavailable for short URL: ' . $e->getMessage());
            return null;
        }
        return $pdo;
    }
}

if (!function_exists('getOrCreateShortUrl')) {
    /**
     * Return the short code for a long URL, creating it on first use.
     * Deterministic: the same URL always maps to the same code.
     *
     * @param string      $longUrl   Absolute URL to shorten (e.g. /e/{tag} link)
     * @param string      $kind      Logical bucket: event|ticket|payment|custom
     * @param string|null $refKey    Stable natural key (event tag, barcode, reference)
     * @param int|null    $createdBy auth_accounts.id of the creator, when known
     * @return string|null            The short code, or null when unavailable
     */
    function getOrCreateShortUrl(string $longUrl, string $kind = 'custom', ?string $refKey = null, ?int $createdBy = null): ?string
    {
        $longUrl = trim($longUrl);
        if ($longUrl === '' || strlen($longUrl) > 2000) {
            return null;
        }

        $pdo = shortUrlPDO();
        if (!$pdo) {
            return null;
        }
        ensureShortUrlsTable($pdo);

        try {
            $find = $pdo->prepare("SELECT code FROM short_urls WHERE long_url = ? LIMIT 1");
            $find->execute([$longUrl]);
            $existing = $find->fetchColumn();
            if ($existing !== false && $existing !== null) {
                return (string) $existing;
            }

            // Optional stable alias: same kind+key keeps the original code even
            // if the target URL changes slightly.
            if ($refKey !== null && $refKey !== '') {
                $alias = $pdo->prepare("SELECT code FROM short_urls WHERE kind = ? AND ref_key = ? LIMIT 1");
                $alias->execute([$kind, $refKey]);
                $aliasCode = $alias->fetchColumn();
                if ($aliasCode !== false && $aliasCode !== null) {
                    return (string) $aliasCode;
                }
            }

            // ── Transaction safety ────────────────────────────────────────
            // This helper may be called from inside a CALLER's transaction
            // (e.g. api/payments/initialize.php wraps its whole flow in one).
            // PDO has a single transaction per connection, so only open our
            // own when none is active — and only ever roll back the one we
            // started. Touching the caller's transaction here caused a
            // production 500 (rollback of the payment transaction).
            $ownsTransaction = !$pdo->inTransaction();
            if ($ownsTransaction) {
                $pdo->beginTransaction();
            }
            // Strict MySQL modes reject NULL/missing values for NOT NULL columns,
            // so insert with a temporary unique code, then rewrite it as the
            // final base62 encoding of the row id.
            $tmpCode = 't' . bin2hex(random_bytes(8));
            $pdo->prepare("INSERT INTO short_urls (code, long_url, kind, ref_key, created_by) VALUES (?, ?, ?, ?, ?)")
                ->execute([$tmpCode, $longUrl, $kind, $refKey, $createdBy]);
            $id = (int) $pdo->lastInsertId();
            $code = shortUrlEncodeId($id);
            $pdo->prepare("UPDATE short_urls SET code = ? WHERE id = ?")->execute([$code, $id]);
            if ($ownsTransaction) {
                $pdo->commit();
            }

            return $code;
        } catch (PDOException $e) {
            // Roll back ONLY the transaction this helper opened — never the
            // caller's (rolling back an active outer transaction made the
            // payment flow fail with "There is no active transaction").
            if ($ownsTransaction && $pdo->inTransaction()) {
                $pdo->rollBack();
            }
            // Concurrent insert race — another request created the same URL.
            try {
                $find = $pdo->prepare("SELECT code FROM short_urls WHERE long_url = ? LIMIT 1");
                $find->execute([$longUrl]);
                $code = $find->fetchColumn();
                if ($code !== false && $code !== null) {
                    return (string) $code;
                }
            } catch (Throwable $ignored) {
            }
            error_log('[ShortUrl] Could not create short URL: ' . $e->getMessage());
            return null;
        }
    }
}

if (!function_exists('getShortUrlTarget')) {
    /** Look up a code's destination. Returns ['long_url'=>..,'kind'=>..] or null. */
    function getShortUrlTarget(string $code): ?array
    {
        $pdo = shortUrlPDO();
        if (!$pdo) {
            return null;
        }
        ensureShortUrlsTable($pdo);
        try {
            $stmt = $pdo->prepare("SELECT long_url, kind FROM short_urls WHERE code = ? LIMIT 1");
            $stmt->execute([$code]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            return $row ?: null;
        } catch (PDOException $e) {
            error_log('[ShortUrl] Lookup failed: ' . $e->getMessage());
            return null;
        }
    }
}

if (!function_exists('recordShortUrlClick')) {
    /** Fire-and-forget click counter. */
    function recordShortUrlClick(string $code): void
    {
        try {
            $pdo = shortUrlPDO();
            if ($pdo) {
                $pdo->prepare("UPDATE short_urls SET clicks = clicks + 1, last_click_at = NOW() WHERE code = ?")
                    ->execute([$code]);
            }
        } catch (Throwable $e) {
            error_log('[ShortUrl] Click tracking failed: ' . $e->getMessage());
        }
    }
}

if (!function_exists('buildShortUrl')) {
    /**
     * Build an absolute short URL for a long URL.
     * @param string $longUrl Absolute URL (APP_URL-based) or app-relative path
     */
    function buildShortUrl(string $longUrl, string $kind = 'custom', ?string $refKey = null, ?int $createdBy = null): ?string
    {
        $longUrl = trim($longUrl);
        if ($longUrl === '') {
            return null;
        }
        if ($longUrl[0] === '/') {
            $appUrl = rtrim(defined('APP_URL') ? APP_URL : (get_env_var('APP_URL') ?: ''), '/');
            if ($appUrl === '') {
                return null;
            }
            $longUrl = $appUrl . $longUrl;
        }
        $code = getOrCreateShortUrl($longUrl, $kind, $refKey, $createdBy);
        if ($code === null) {
            return null;
        }
        // Keep the short link on the same origin as its target while
        // preserving APP_URL's path when the app is mounted in a subdirectory.
        $scheme = parse_url($longUrl, PHP_URL_SCHEME);
        $host = parse_url($longUrl, PHP_URL_HOST);
        if (in_array($scheme, ['http', 'https'], true) && $host) {
            $port = parse_url($longUrl, PHP_URL_PORT);
            $appUrl = getAppBaseUrl();
            $appScheme = parse_url($appUrl, PHP_URL_SCHEME);
            $appHost = parse_url($appUrl, PHP_URL_HOST);
            $appPort = parse_url($appUrl, PHP_URL_PORT);
            $effectivePort = $port ?? ($scheme === 'https' ? 443 : 80);
            $effectiveAppPort = $appPort ?? ($appScheme === 'https' ? 443 : 80);
            if (
                $scheme === $appScheme
                && is_string($appHost)
                && strcasecmp($host, $appHost) === 0
                && $effectivePort === $effectiveAppPort
            ) {
                return rtrim($appUrl, '/') . '/s/' . $code;
            }
            return $scheme . '://' . $host . ($port ? ':' . $port : '') . '/s/' . $code;
        }
        $appUrl = rtrim(defined('APP_URL') ? APP_URL : (get_env_var('APP_URL') ?: ''), '/');
        if ($appUrl === '') {
            return null;
        }
        return $appUrl . '/s/' . $code;
    }
}

if (!function_exists('getAppBaseUrl')) {
    /** Single source of truth for the app's absolute base URL. */
    function getAppBaseUrl(): string
    {
        if (defined('APP_URL') && APP_URL !== '') {
            return rtrim(APP_URL, '/');
        }
        $fromEnv = trim((string) (get_env_var('APP_URL') ?: ''));
        if ($fromEnv !== '') {
            return rtrim($fromEnv, '/');
        }
        $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
        $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
        return $scheme . '://' . $host;
    }
}
