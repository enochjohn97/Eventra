<?php

/**
 * Short URL endpoint.
 *
 * GET  /s/{code}  → resolves the code and 302-redirects to its destination.
 *                   (The router passes the code in $_GET['code']; direct file
 *                   access without a code responds with usage info.)
 *
 * POST /api/s     → creates a short URL. JSON body:
 *                   {"url": "...", "kind": "event|ticket|payment|custom", "ref_key": "..."}
 *                   Requires an authenticated session or Bearer token.
 *                   Convenience: {"event_tag": "..."} / {"barcode": "..."} /
 *                   {"payment_reference": "..."} auto-build the canonical target.
 */

require_once __DIR__ . '/../includes/helpers/short-url-helper.php';
require_once __DIR__ . '/../includes/middleware/auth.php';

header('Content-Type: application/json; charset=utf-8');

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

// ── Resolve & redirect (the /s/{code} route) ────────────────────────────────
if ($method === 'GET') {
    $code = trim((string) ($_GET['code'] ?? ''));
    if ($code === '') {
        http_response_code(400);
        echo json_encode([
            'success' => false,
            'message' => 'Missing short code. Usage: /s/{code}',
        ]);
        exit;
    }
    if (!preg_match('/^[A-Za-z0-9]{1,20}$/', $code)) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Invalid short code format.']);
        exit;
    }

    $target = getShortUrlTarget($code);
    if ($target === null || empty($target['long_url'])) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Short link not found or expired.']);
        exit;
    }

    recordShortUrlClick($code);

    $longUrl = (string) $target['long_url'];
    // Same-origin targets are redirected directly; anything external is sent
    // through an interstitial-free safe hop (no open-redirect via stored data:
    // only authenticated users can create links).
    $scheme = parse_url($longUrl, PHP_URL_SCHEME);
    if (!in_array($scheme, ['http', 'https'], true) || str_contains($longUrl, "\r") || str_contains($longUrl, "\n")) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Stored target is not a valid URL.']);
        exit;
    }

    header('Location: ' . $longUrl, true, 302);
    header('Cache-Control: no-store');
    exit;
}

// ── Create a short URL (POST /api/s) ────────────────────────────────────────
if ($method === 'POST') {
    // checkAuthOptional() returns the profile/auth id (int) or a falsy value.
    $authId = checkAuthOptional();
    if (empty($authId)) {
        http_response_code(401);
        echo json_encode(['success' => false, 'message' => 'Authentication required to create short links.']);
        exit;
    }

    $body = json_decode(file_get_contents('php://input') ?: '[]', true);
    if (!is_array($body)) {
        $body = $_POST;
    }

    $kind = 'custom';
    $refKey = null;
    $longUrl = null;

    if (!empty($body['event_tag'])) {
        $kind = 'event';
        $refKey = 'event:' . preg_replace('/[^A-Za-z0-9\-_]/', '', (string) $body['event_tag']);
        $longUrl = getAppBaseUrl() . '/e/' . rawurlencode((string) $body['event_tag']);
    } elseif (!empty($body['barcode'])) {
        $kind = 'ticket';
        $refKey = 'ticket:' . preg_replace('/[^A-Za-z0-9\-_]/', '', (string) $body['barcode']);
        $longUrl = getAppBaseUrl() . '/t/' . rawurlencode((string) $body['barcode']);
    } elseif (!empty($body['payment_reference'])) {
        $kind = 'payment';
        $refKey = 'pay:' . preg_replace('/[^A-Za-z0-9\-_]/', '', (string) $body['payment_reference']);
        $longUrl = getAppBaseUrl() . '/r/' . rawurlencode((string) $body['payment_reference']);
    } elseif (!empty($body['url'])) {
        $candidate = trim((string) $body['url']);
        $scheme = parse_url($candidate, PHP_URL_SCHEME);
        $host = parse_url($candidate, PHP_URL_HOST);
        if (!in_array($scheme, ['http', 'https'], true) || $host === false || $host === null) {
            http_response_code(422);
            echo json_encode(['success' => false, 'message' => 'A valid http(s) URL is required.']);
            exit;
        }
        // Only shorten links that belong to this app — the point is to hide
        // internal file locations, not to run a public URL shortener.
        $selfHost = parse_url(getAppBaseUrl(), PHP_URL_HOST);
        if (strcasecmp((string) $host, (string) $selfHost) !== 0) {
            http_response_code(422);
            echo json_encode(['success' => false, 'message' => 'Only URLs on this app\'s own domain can be shortened.']);
            exit;
        }
        $kind = in_array(($body['kind'] ?? 'custom'), ['event', 'ticket', 'payment', 'custom'], true)
            ? (string) $body['kind'] : 'custom';
        $refKey = isset($body['ref_key']) ? substr(trim((string) $body['ref_key']), 0, 190) : null;
        $longUrl = $candidate;
    }

    if ($longUrl === null) {
        http_response_code(422);
        echo json_encode([
            'success' => false,
            'message' => 'Provide url, event_tag, barcode or payment_reference.',
        ]);
        exit;
    }

    $code = getOrCreateShortUrl($longUrl, $kind, $refKey, (int) $authId);
    if ($code === null) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Could not create short link. Try again shortly.']);
        exit;
    }

    echo json_encode([
        'success' => true,
        'short_url' => getAppBaseUrl() . '/s/' . $code,
        'code' => $code,
        'kind' => $kind,
        'long_url' => $longUrl,
    ]);
    exit;
}

http_response_code(405);
header('Allow: GET, POST');
echo json_encode(['success' => false, 'message' => 'Method not allowed.']);
