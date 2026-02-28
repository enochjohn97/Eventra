<?php
/**
 * Ticket Helper for generating QR codes and PDF tickets
 */

require_once __DIR__ . '/../../vendor/autoload.php';
require_once __DIR__ . '/../../config/app.php';

use Dompdf\Dompdf;
use Dompdf\Options;
use Chillerlan\QRCode\QRCode;
use Chillerlan\QRCode\QROptions;

/**
 * Generate a QR code for a ticket barcode
 *
 * @param string $barcode The unique ticket barcode
 * @return string Path to the generated QR code image
 */
function generateTicketQRCode($barcode)
{
    $options = new QROptions([
        'version' => 5,
        'outputType' => QRCode::OUTPUT_MARKUP_SVG,
        'eccLevel' => QRCode::ECC_L,
    ]);

    $qrcode = new QRCode($options);
    $svgData = $qrcode->render($barcode);

    $fileName = 'qr_' . $barcode . '.svg';
    $dir = __DIR__ . '/../../uploads/tickets/qrcodes/';
    if (!is_dir($dir))
        mkdir($dir, 0777, true);

    $filePath = $dir . $fileName;
    file_put_contents($filePath, $svgData);

    return $filePath;
}

/**
 * Generate a PDF ticket
 *
 * @param array $ticketData Data including user name, event name, date, etc.
 * @return string Path to the generated PDF ticket
 */
function generateTicketPDF($ticketData)
{
    $options = new Options();
    $options->set('isRemoteEnabled', true);
    $dompdf = new Dompdf($options);

    $qrCodePath = generateTicketQRCode($ticketData['barcode']);
    $qrCodeData = base64_encode(file_get_contents($qrCodePath));
    $qrCodeSrc = 'data:image/svg+xml;base64,' . $qrCodeData;

    $html = "
    <html>
    <head>
        <style>
            body { font-family: 'Helvetica', sans-serif; color: #333; margin: 0; padding: 0; }
            .ticket-container { width: 100%; max-width: 600px; margin: 20px auto; border: 2px solid #ff5a5f; border-radius: 15px; overflow: hidden; }
            .header { background: #ff5a5f; color: white; padding: 20px; text-align: center; }
            .header h1 { margin: 0; font-size: 24px; letter-spacing: 2px; }
            .content { padding: 30px; display: flex; justify-content: space-between; }
            .event-info { width: 60%; }
            .event-info h2 { color: #ff5a5f; margin-top: 0; }
            .qr-section { width: 35%; text-align: center; }
            .qr-section img { width: 150px; height: 150px; }
            .footer { background: #f9f9f9; padding: 15px; font-size: 12px; text-align: center; color: #666; border-top: 1px dashed #eee; }
            .stub { border-top: 2px dashed #ff5a5f; padding: 15px; display: flex; justify-content: space-between; align-items: center; }
        </style>
    </head>
    <body>
        <div class='ticket-container'>
            <div class='header'>
                <h1>EVENTRA TICKET</h1>
            </div>
            <div class='content'>
                <div class='event-info'>
                    <h2>{$ticketData['event_name']}</h2>
                    <p><strong>Date:</strong> {$ticketData['event_date']}</p>
                    <p><strong>Time:</strong> {$ticketData['event_time']}</p>
                    <p><strong>Location:</strong> {$ticketData['location']}</p>
                    <p><strong>Attendee:</strong> {$ticketData['user_name']}</p>
                    <p><strong>Ticket ID:</strong> {$ticketData['barcode']}</p>
                </div>
                <div class='qr-section'>
                    <img src='{$qrCodeSrc}' alt='QR Code'>
                    <p style='font-size: 10px; margin-top: 10px;'>Scan to Validate</p>
                </div>
            </div>
            <div class='footer'>
                <p>This ticket is valid for one-time entry only. Non-refundable and non-transferable.</p>
            </div>
        </div>
    </body>
    </html>
    ";

    $dompdf->loadHtml($html);
    $dompdf->setPaper('A5', 'landscape');
    $dompdf->render();

    $fileName = 'ticket_' . $ticketData['barcode'] . '.pdf';
    $dir = __DIR__ . '/../../uploads/tickets/pdfs/';
    if (!is_dir($dir))
        mkdir($dir, 0777, true);

    $filePath = $dir . $fileName;
    file_put_contents($filePath, $dompdf->output());

    return $filePath;
}
