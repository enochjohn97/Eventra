<?php

/**
 * Generate QR Code API
 * Returns a PNG image of a QR code for the provided text.
 * GET ?text=...
 */

require_once '../../vendor/autoload.php';

use chillerlan\QRCode\QRCode;
use chillerlan\QRCode\QROptions;
use chillerlan\QRCode\Output\QROutputInterface;
use chillerlan\QRCode\Common\EccLevel;

$text = $_GET['text'] ?? '';

if (empty($text)) {
    header('Content-Type: image/png');
    exit;
}

try {
    $options = new QROptions([
        'outputType' => QROutputInterface::GDIMAGE_PNG,
        'eccLevel'   => EccLevel::M,
        'scale'      => 10,
        'imageBase64'=> false,
    ]);

    $qrcode = new QRCode($options);

    header('Content-Type: image/png');
    echo $qrcode->render($text);
} catch (Exception $e) {
    error_log('[generate-barcode.php] QR error: ' . $e->getMessage());
    http_response_code(500);
}
