<?php

/**
 * Holiday & Festive Alerts API
 *
 * Public endpoint that returns the calendar-year list of public holidays and
 * festive periods (Christmas, Sallah/Eid big & small, New Year, Easter, etc.)
 * that power the toast alerts shown on the admin dashboard, the client
 * dashboard and the public homepage.
 *
 * Data source: Google Calendar "Holidays in Nigeria" calendars, accessed with
 * GOOGLE_CALENDAR_API_KEY from .env (see the GOOGLE CALENDAR section in
 * .env.example). Calendar IDs are overridable via GOOGLE_HOLIDAY_CALENDAR_IDS.
 *
 * Google's response is cached on disk (logs/holiday-alerts.json) for 12 hours
 * so the feature costs at most a couple of Calendar API calls per day. When
 * Google is unreachable the endpoint degrades gracefully to the last good
 * cache, then to a small built-in list of fixed-date holidays — so the toasts
 * on the dashboards never break.
 */

if (!headers_sent()) {
    ob_start();
}

header('Content-Type: application/json');

require_once __DIR__ . '/../../config/env-loader.php';
require_once __DIR__ . '/../../config/cors-config.php'; // CORS + OPTIONS preflight for API requests
require_once __DIR__ . '/rate-limiter.php';             // public-endpoint rate limiting

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method !== 'GET' && $method !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed.']);
    exit;
}

// This endpoint is public (guests land on the homepage) but must not be
// hammerable — 60 requests / 5 minutes per session-or-IP.
ticket_rate_limit('holiday_alerts', 60, 300);

/** Read an env var from any of the sources env-loader populates. */
function holiday_env(string $key, string $default = ''): string
{
    if (isset($_ENV[$key]) && $_ENV[$key] !== '') {
        return (string) $_ENV[$key];
    }
    if (isset($_SERVER[$key]) && $_SERVER[$key] !== '') {
        return (string) $_SERVER[$key];
    }
    $val = getenv($key);
    return ($val !== false && $val !== '') ? (string) $val : $default;
}

/**
 * Locate a CA bundle for cURL when PHP ships without one (common on Windows
 * dev machines). Production hosts configure curl.cainfo/openssl.cafile in
 * php.ini, in which case this returns null and cURL's built-in default is used.
 */
function holiday_ca_bundle(): ?string
{
    static $resolved = false;
    static $bundle = null;
    if ($resolved) {
        return $bundle;
    }
    $resolved = true;

    // A configured php.ini always wins - don't second-guess the server.
    $configured = (string) (ini_get('curl.cainfo') ?: ini_get('openssl.cafile') ?: '');
    if ($configured !== '') {
        return $bundle;
    }

    $candidates = [];
    foreach (['CURL_CA_BUNDLE', 'SSL_CERT_FILE'] as $envKey) {
        $val = trim((string) (getenv($envKey) ?: ''));
        if ($val !== '') {
            $candidates[] = $val;
        }
    }
    $candidates = array_merge($candidates, [
        dirname(__DIR__, 2) . '/vendor/cacert.pem',
        'C:\\Program Files\\Git\\usr\\ssl\\certs\\ca-bundle.crt',
        'C:\\Program Files\\Git\\mingw64\\ssl\\certs\\ca-bundle.crt',
        '/etc/ssl/certs/ca-certificates.crt',
        '/etc/pki/tls/certs/ca-bundle.crt',
    ]);

    foreach ($candidates as $path) {
        if (is_file($path) && is_readable($path)) {
            $bundle = $path;
            break;
        }
    }
    return $bundle;
}

/** GET a URL with cURL (returns raw body or null on any failure). */
function holiday_http_get(string $url): ?string
{
    if (!function_exists('curl_init')) {
        return null;
    }
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS      => 2,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_TIMEOUT        => 12,
        CURLOPT_USERAGENT      => 'Eventra-HolidayAlerts/1.0',
    ]);
    $caBundle = holiday_ca_bundle();
    if ($caBundle !== null) {
        curl_setopt($ch, CURLOPT_CAINFO, $caBundle);
    }
    $body = curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($body === false || $code < 200 || $code >= 300) {
        return null;
    }
    return (string) $body;
}

/**
 * List events from one Google Calendar holiday calendar within [timeMin, timeMax].
 * Follows pagination (maxResults=250 per page, up to 5 pages).
 *
 * @return array<int, array{date:string,title:string,description:string}>
 */
function holiday_fetch_calendar(string $calendarId, string $apiKey, string $timeMin, string $timeMax): array
{
    $events = [];
    $pageToken = '';

    for ($page = 0; $page < 5; $page++) {
        $params = [
            'key'          => $apiKey,
            'timeMin'      => $timeMin,
            'timeMax'      => $timeMax,
            'maxResults'   => 250,
            'singleEvents' => 'true',
            'orderBy'      => 'startTime',
        ];
        if ($pageToken !== '') {
            $params['pageToken'] = $pageToken;
        }

        $url = 'https://www.googleapis.com/calendar/v3/calendars/'
             . rawurlencode($calendarId) . '/events?' . http_build_query($params);

        $body = holiday_http_get($url);
        if ($body === null) {
            break; // network / quota / key problem — use whatever we collected
        }

        $data = json_decode($body, true);
        if (!is_array($data) || !isset($data['items']) || !is_array($data['items'])) {
            break;
        }

        foreach ($data['items'] as $item) {
            if (!is_array($item) || (($item['status'] ?? '') === 'cancelled')) {
                continue;
            }

            // All-day holiday events expose start.date; timed ones expose start.dateTime.
            $date = (string) ($item['start']['date'] ?? '');
            if ($date === '' && !empty($item['start']['dateTime'])) {
                $date = substr((string) $item['start']['dateTime'], 0, 10);
            }
            $title = trim((string) ($item['summary'] ?? ''));

            if ($date === '' || $title === '' || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
                continue;
            }

            $description = trim(strip_tags((string) ($item['description'] ?? '')));
            $description = (string) preg_replace('/\s+/', ' ', $description);
            if (function_exists('mb_strlen') && mb_strlen($description) > 300) {
                $description = mb_substr($description, 0, 297) . '...';
            } elseif (strlen($description) > 300) {
                $description = substr($description, 0, 297) . '...';
            }

            $events[] = [
                'date'        => $date,
                'title'       => $title,
                'description' => $description,
            ];
        }

        $pageToken = isset($data['nextPageToken']) ? (string) $data['nextPageToken'] : '';
        if ($pageToken === '') {
            break;
        }
    }

    return $events;
}

/**
 * Merge holiday lists, drop duplicates (same date + title, case-insensitive)
 * and sort chronologically.
 *
 * @param array<int, array{date:string,title:string,description?:string}> $lists
 * @return array<int, array{date:string,title:string,description:string}>
 */
function holiday_merge(array ...$lists): array
{
    $merged = [];
    $seen = [];

    foreach ($lists as $list) {
        foreach ($list as $item) {
            $key = $item['date'] . '|' . strtolower(trim($item['title']));
            if (isset($seen[$key])) {
                continue;
            }
            $seen[$key] = true;
            $merged[] = [
                'date'        => $item['date'],
                'title'       => $item['title'],
                'description' => (string) ($item['description'] ?? ''),
            ];
        }
    }

    usort($merged, static function ($a, $b) {
        $byDate = strcmp($a['date'], $b['date']);
        return $byDate !== 0 ? $byDate : strcmp($a['title'], $b['title']);
    });

    return $merged;
}

/**
 * Last-resort fallback: fixed-date Nigerian holidays for the given years.
 * (Moveable feasts — Eid, Good Friday, Easter — require Google's data.)
 *
 * @return array<int, array{date:string,title:string,description:string}>
 */
function holiday_builtin(int $year): array
{
    $fixed = [
        '01-01' => "New Year's Day",
        '02-14' => "Valentine's Day",
        '05-01' => "Workers' Day",
        '05-27' => "Children's Day",
        '06-12' => "Democracy Day",
        '10-01' => "National Day",
        '12-24' => 'Christmas Eve',
        '12-25' => 'Christmas Day',
        '12-26' => 'Boxing Day',
        '12-31' => "New Year's Eve",
    ];

    $out = [];
    foreach ([$year, $year + 1] as $y) {
        foreach ($fixed as $md => $title) {
            $out[] = [
                'date'        => $y . '-' . $md,
                'title'       => $title,
                'description' => '',
            ];
        }
    }
    return $out;
}

/** Emit a JSON payload and stop. */
function holiday_respond(array $payload): void
{
    if (ob_get_length()) {
        ob_clean();
    }
    echo json_encode($payload);
    exit;
}

// ---------------------------------------------------------------------------
// Main flow
// ---------------------------------------------------------------------------

$year    = (int) gmdate('Y');
$window  = $year . '-' . ($year + 1);                 // current year + next (covers year rollover)
$timeMin = sprintf('%04d-01-01T00:00:00Z', $year);
$timeMax = sprintf('%04d-12-31T23:59:59Z', $year + 1);

$cacheDir  = dirname(__DIR__, 2) . '/logs';           // api/utils -> project root -> logs/
$cacheFile = $cacheDir . '/holiday-alerts.json';
$CACHE_TTL = 12 * 3600;                               // 12 hours

// 1) Fresh cache?
$cached = null;
if (is_file($cacheFile)) {
    $raw = @file_get_contents($cacheFile);
    $decoded = ($raw !== false) ? json_decode($raw, true) : null;
    if (is_array($decoded) && isset($decoded['holidays'], $decoded['cached_at'], $decoded['window'])) {
        $cached = $decoded;
    }
}

if ($cached !== null
    && ($cached['window'] ?? '') === $window
    && (time() - (int) $cached['cached_at']) < $CACHE_TTL
    && is_array($cached['holidays'])
) {
    holiday_respond([
        'success'      => true,
        'source'       => 'cache',
        'today'        => gmdate('Y-m-d'),
        'generated_at' => gmdate('c'),
        'count'        => count($cached['holidays']),
        'holidays'     => $cached['holidays'],
    ]);
}

// 2) Fresh fetch from Google Calendar.
$apiKey = holiday_env('GOOGLE_CALENDAR_API_KEY');
if ($apiKey !== '') {
    $calendarIds = holiday_env(
        'GOOGLE_HOLIDAY_CALENDAR_IDS',
        'en.ng#holiday@group.v.calendar.google.com,en.ng.official#holiday@group.v.calendar.google.com'
    );

    $fetched = [];
    foreach (array_filter(array_map('trim', explode(',', $calendarIds))) as $calendarId) {
        $fetched[] = holiday_fetch_calendar($calendarId, $apiKey, $timeMin, $timeMax);
    }

    $holidays = holiday_merge(...$fetched);

    if (count($holidays) > 0) {
        @mkdir($cacheDir, 0755, true);
        @file_put_contents($cacheFile, json_encode([
            'cached_at' => time(),
            'window'    => $window,
            'holidays'  => $holidays,
        ]), LOCK_EX);

        holiday_respond([
            'success'      => true,
            'source'       => 'google',
            'today'        => gmdate('Y-m-d'),
            'generated_at' => gmdate('c'),
            'count'        => count($holidays),
            'holidays'     => $holidays,
        ]);
    }
}

// 3) Google unavailable — serve last good cache for this window, however old.
if ($cached !== null
    && ($cached['window'] ?? '') === $window
    && is_array($cached['holidays'])
    && count($cached['holidays']) > 0
) {
    holiday_respond([
        'success'      => true,
        'source'       => 'stale_cache',
        'today'        => gmdate('Y-m-d'),
        'generated_at' => gmdate('c'),
        'count'        => count($cached['holidays']),
        'holidays'     => $cached['holidays'],
    ]);
}

// 4) No Google, no cache — built-in fixed-date holidays so alerts still work.
$builtin = holiday_builtin($year);
holiday_respond([
    'success'      => true,
    'source'       => 'builtin',
    'today'        => gmdate('Y-m-d'),
    'generated_at' => gmdate('c'),
    'count'        => count($builtin),
    'holidays'     => $builtin,
]);
