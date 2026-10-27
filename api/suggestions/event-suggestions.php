<?php
/**
 * Event Suggestions API
 * Returns published events ranked by ticket demand (sales + attendees).
 * Used by the new homepage recommendation banner on both the web homepage
 * and the client dashboard.
 *
 * Minimal, read-only query — no new tables, no writes.
 */

header('Content-Type: application/json');
require_once '../../config/database.php';

try {
    $stmt = $pdo->prepare("
        SELECT
            e.id,
            e.event_name,
            e.event_date,
            e.image_path,
            e.sales_count,
            e.attendee_count,
            COALESCE(NULLIF(e.ticket_count, ''), 0) AS tickets
        FROM events e
        WHERE e.status = 'published'
          AND e.deleted_at IS NULL
          AND IFNULL(e.event_visibility, 'public') <> 'private'
          AND (
              COALESCE(NULLIF(e.sales_count, ''), 0) > 2
              OR COALESCE(NULLIF(e.attendee_count, ''), 0) > 2
          )
        ORDER BY
            (COALESCE(NULLIF(e.sales_count, ''), 0)
              + COALESCE(NULLIF(e.attendee_count, ''), 0)) DESC,
            e.event_date ASC
        LIMIT 8
    ");
    $stmt->execute();
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $suggestions = array_map(function ($r) {
        $date = $r['event_date']
            ? date('M d, Y', strtotime($r['event_date']))
            : 'TBA';
        return [
            'id'        => (int) $r['id'],
            'event_name' => $r['event_name'],
            'event_date' => $date,
            'image_path'  => $r['image_path'],
            'tickets'    => (int) ($r['tickets'] ?: $r['sales_count'] ?: 0),
            'attendees'  => (int) ($r['attendee_count'] ?: 0),
        ];
    }, $rows);

    echo json_encode([
        'success'    => true,
        'suggestions' => $suggestions,
    ]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'success'   => false,
        'message'   => 'Failed to load suggestions.',
    ]);
}
