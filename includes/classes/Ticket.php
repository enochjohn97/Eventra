<?php

/**
 * Ticket — Core validation and scan logic
 * Validates tickets with: payment check, used status, event expiry, single-entry enforcement
 */

require_once __DIR__ . '/../../config/app.php';

class Ticket
{
    /**
     * Validate a ticket and mark it as used (atomic, locked transaction).
     *
     * @param PDO    $pdo
     * @param string $barcode          Raw barcode string OR base64-encoded signed QR payload
     * @param int|null $scannerClientId Optional: Enforce that the ticket belongs to this client's event.
     * @return array ['success' => bool, 'message' => string, 'data' => array|null]
     */
    public static function validateAndUse(PDO $pdo, string $barcode, ?int $scannerClientId = null): array
    {
        // 1. Try to decode as a signed QR payload
        $resolvedBarcode = self::resolveBarcode($barcode);

        $pdo->beginTransaction();
        try {
            $whereClauses = ["t.barcode = ?"];
            $params = [$resolvedBarcode];

            if ($scannerClientId !== null) {
                $whereClauses[] = "e.client_id = ?";
                $params[] = $scannerClientId;
            }

            $whereSql = implode(" AND ", $whereClauses);

            $stmt = $pdo->prepare("
                SELECT t.*,
                       p.status  AS payment_status,
                       p.user_id AS payment_user_id,
                       e.event_name,
                       e.event_date,
                       e.id      AS event_id,
                       e.client_id,
                       c.business_name AS client_name,
                       u.name AS buyer_name,
                       a.email AS buyer_email
                FROM tickets t
                JOIN payments p ON t.payment_id = p.id
                JOIN events   e ON p.event_id   = e.id
                JOIN clients  c ON e.client_id  = c.id
                JOIN users    u ON t.user_id     = u.id
                JOIN auth_accounts a ON u.user_auth_id = a.id
                WHERE $whereSql
                FOR UPDATE
            ");
            $stmt->execute($params);
            $ticket = $stmt->fetch(PDO::FETCH_ASSOC);


            // Check: ticket exists
            if (!$ticket) {
                $pdo->rollBack();
                return ['success' => false, 'message' => 'Invalid ticket. Barcode not found.'];
            }

            // Check: payment must be confirmed
            if ($ticket['payment_status'] !== 'paid') {
                $pdo->rollBack();
                return ['success' => false, 'message' => 'Payment for this ticket has not been confirmed.'];
            }

            // Check: event must not have expired
            if (!empty($ticket['event_date']) && strtotime($ticket['event_date']) < strtotime(date('Y-m-d'))) {
                $pdo->rollBack();
                return [
                    'success' => false,
                    'message' => "This event ({$ticket['event_name']}) has already passed. Ticket is no longer valid.",
                    'status'  => 'expired'
                ];
            }

            // Check: single-entry enforcement (ticket must not be already used)
            if ($ticket['used'] == 1) {
                $pdo->rollBack();
                return [
                    'success' => false,
                    'message' => 'Ticket already used. Entry denied.',
                    'status'  => 'already_used',
                    'details' => [
                        'used_at' => $ticket['used_at'],
                        'event'   => $ticket['event_name']
                    ]
                ];
            }

            // All checks passed — mark as used (atomic)
            $stmt = $pdo->prepare("UPDATE tickets SET used = 1, used_at = NOW() WHERE id = ?");
            $stmt->execute([$ticket['id']]);

            $pdo->commit();

            return [
                'success' => true,
                'message' => 'Ticket validated successfully. Entry granted.',
                'status'  => 'used',
                'data'    => $ticket
            ];
        } catch (Exception $e) {
            $pdo->rollBack();
            throw $e;
        }
    }

    /**
     * Resolve the barcode from either a raw string or a signed QR payload.
     * If the input is a valid base64 JSON with a tid field, returns the tid (barcode).
     * Otherwise returns the raw barcode.
     */
    private static function resolveBarcode(string $input): string
    {
        $input = trim($input);

        // 1. Check if input is a URL or contains a barcode= query parameter (mobile QR scan)
        if (str_contains($input, 'barcode=') || filter_var($input, FILTER_VALIDATE_URL)) {
            $queryStr = '';
            if (str_contains($input, '?')) {
                $queryStr = parse_url($input, PHP_URL_QUERY) ?? '';
            } else {
                $queryStr = $input;
            }
            if ($queryStr !== '') {
                parse_str($queryStr, $params);
                if (!empty($params['barcode'])) {
                    return trim((string) $params['barcode']);
                }
            }
        }

        // 2. Try to decode as a signed QR payload
        $decoded = base64_decode($input, true);
        if ($decoded) {
            $payload = json_decode($decoded, true);
            if ($payload && !empty($payload['tid']) && !empty($payload['sig'])) {
                // Verify HMAC signature to prevent forgery.
                // Must match buildSecureQRPayload's hash string exactly
                // (includes the oid segment).
                $dataStr = implode('|', [
                    $payload['tid'],
                    $payload['eid'] ?? '',
                    $payload['uid'] ?? '',
                    $payload['oid'] ?? '',
                    $payload['ps']  ?? '',
                    $payload['iat'] ?? ''
                ]);
                $expectedSig = hash_hmac('sha256', $dataStr, QR_SECRET);
                if (hash_equals($expectedSig, $payload['sig'])) {
                    return $payload['tid'];
                }
                // Signature invalid — reject entirely
                return '__INVALID_SIGNATURE__';
            }
        }

        // Raw barcode fallback
        return $input;
    }

    /**
     * Resolve a QR payload (or raw barcode) to its ticket barcode WITHOUT
     * consuming/using the ticket. Used by the Check Ticket anti-fraud flow,
     * which must never mark a ticket as used.
     */
    public static function resolveOnly(string $qrData): array
    {
        $barcode = self::resolveBarcode(trim($qrData));
        if ($barcode === '__INVALID_SIGNATURE__' || $barcode === '') {
            return ['success' => false, 'message' => 'Invalid or forged QR code.'];
        }
        return ['success' => true, 'barcode' => $barcode];
    }

    /**
     * Build the shared proof payload for the Check Ticket feature.
     * Read-only — never mutates ticket state. Price is presented with the
     * 10% EventOut platform fee so it matches what the buyer actually paid.
     */
    public static function buildProofPayload(PDO $pdo, string $ticketId): array
    {
        $ticketId = trim($ticketId);
        $stmt = $pdo->prepare("
            SELECT t.barcode,
                   t.custom_id,
                   t.ticket_type,
                   t.status        AS ticket_status,
                   t.used,
                   p.reference     AS payment_reference,
                   p.amount        AS payment_amount,
                   p.status        AS payment_status,
                   p.paid_at,
                   p.created_at    AS payment_created_at,
                   e.event_name,
                   e.custom_id     AS event_custom_id,
                   e.image_path    AS event_image,
                   e.event_date,
                   e.event_time,
                   e.price         AS event_base_price,
                   e.metadata      AS event_metadata
            FROM tickets t
            JOIN payments p ON t.payment_id = p.id
            JOIN events   e ON p.event_id  = e.id
            WHERE t.barcode = ? OR t.custom_id = ?
            LIMIT 1
        ");
        $stmt->execute([$ticketId, $ticketId]);
        $t = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$t) {
            return ['success' => false, 'message' => "No ticket found for ID \"{$ticketId}\". Check the ID and try again."];
        }
        if ($t['payment_status'] !== 'paid') {
            return ['success' => false, 'message' => 'Payment for this ticket has not been confirmed. Ticket is not valid.'];
        }

        // Resolve the effective ticket price from tier metadata (falls back
        // to legacy event price) — identical logic to the web display.
        $ticketType = strtolower((string)($t['ticket_type'] ?: 'regular'));
        $meta = json_decode((string)($t['event_metadata'] ?? ''), true) ?: [];
        $mode = strtolower((string)($meta['ticket_type_mode'] ?? 'all'));
        $tierPrice = fn(string $k) => (float)($meta[$k] ?? 0);
        $legacy = (float)$t['event_base_price'];

        if ($mode === 'all' || $mode === '' || str_contains($mode, $ticketType) === false) {
            $base = $legacy > 0 ? $legacy : max($tierPrice('regular_price'), $tierPrice('vip_price'), $tierPrice('premium_price'));
        } else {
            $base = match ($ticketType) {
                'vip' => $tierPrice('vip_price'),
                'premium' => $tierPrice('premium_price'),
                default => $tierPrice('regular_price') ?: $legacy,
            };
        }
        $priceWithFee = $base > 0 ? round($base * 1.1) : 0;

        // Event image as an absolute URL when possible
        $img = '';
        if (!empty($t['event_image'])) {
            $imgPath = str_replace('\\', '/', trim((string)$t['event_image']));
            if (preg_match('#^(https?:)//#i', $imgPath)) {
                $img = $imgPath;
            } else {
                $protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || ($_SERVER['SERVER_PORT'] ?? 80) == 443 ? 'https' : 'http';
                $host = $_SERVER['HTTP_HOST'] ?? '';
                $img = $host !== '' ? $protocol . '://' . $host . '/' . ltrim($imgPath, '/') : '/' . ltrim($imgPath, '/');
            }
        }

        return [
            'success' => true,
            'data' => [
                'ticket_id' => $t['barcode'],
                'event_name' => $t['event_name'],
                'event_image' => $img,
                'price' => $priceWithFee,
                'price_display' => $priceWithFee > 0 ? '₦' . number_format($priceWithFee) : 'Free',
                'ticket_type' => ucfirst($ticketType),
                'payment_reference' => $t['payment_reference'],
                'payment_date' => $t['paid_at'] ?: $t['payment_created_at'],
                'event_date' => $t['event_date'],
                'event_time' => $t['event_time'] ? substr((string)$t['event_time'], 0, 5) : null,
                'event_custom_id' => $t['event_custom_id'],
                'ticket_status' => $t['used'] == 1 ? 'Used' : ($t['ticket_status'] === 'cancelled' ? 'Cancelled' : 'Valid'),
            ],
        ];
    }
}
