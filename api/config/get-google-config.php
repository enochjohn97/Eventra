<?php



header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header("Cross-Origin-Opener-Policy: same-origin-allow-popups");
require_once __DIR__ . '/../../config/google.php';

/**
 * The dev machine's own Wi-Fi/LAN address, e.g. http://192.168.1.43:8000.
 *
 * The mobile app calls this endpoint through whatever origin already answers
 * (USB `adb reverse` loopback or the LAN), learns this address and prefers it
 * from then on — which is what keeps the app talking to the local server after
 * the USB cable is unplugged. Empty on hosts without a private interface.
 */
function detectLanUrl(): string
{
    $host = $_SERVER['HTTP_HOST'] ?? '';
    // Only advertise a LAN address when the server IS the dev machine.
    if ($host !== '' && !preg_match('/^(localhost|127\.0\.0\.1|\[::1\]|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i', $host)) {
        return '';
    }

    $candidates = @gethostbynamel((string) @gethostname());
    if (!is_array($candidates)) {
        return '';
    }

    $lanIp = '';
    foreach ($candidates as $ip) {
        // 192.168.x.x / 10.x.x.x win; Docker's 172.17.x.x bridge is ignored.
        if (preg_match('/^(192\.168|10)\./', $ip)) {
            $lanIp = $ip;
            break;
        }
        if ($lanIp === ''
            && preg_match('/^172\.(1[89]|2\d|3[01])\./', $ip)
            && !preg_match('/^172\.17\./', $ip)) {
            $lanIp = $ip;
        }
    }
    if ($lanIp === '') {
        return '';
    }

    $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    $port = (int) ($_SERVER['SERVER_PORT'] ?? 0);
    $suffix = ($port > 0 && $port !== 80 && $port !== 443) ? ':' . $port : '';

    return $scheme . '://' . $lanIp . $suffix;
}

try {
    $googleConfig = [
        'success' => true,
        'client_id' => getGoogleClientId(),
        'maps_api_key' => $_ENV['GOOGLE_MAPS_API_KEY'] ?? '',
        'paystack_public_key' => $_ENV['PAYSTACK_PUBLIC_KEY'] ?? '',
        'app_url' => rtrim($_ENV['APP_URL'] ?? '', '/'),
        'lan_url' => detectLanUrl(),
    ];

    echo json_encode($googleConfig);
} catch (Exception $e) {
    echo json_encode([
        'success' => false,
        'message' => 'Failed to load Google configuration'
    ]);
}
