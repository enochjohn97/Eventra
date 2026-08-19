<?php

/**
 * List User Favorites API
 * Returns all favorited events for the authenticated user.
 */

header('Content-Type: application/json');
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/middleware/auth.php';

$auth_id = validateBearerToken('user');
$user_id = null;

if ($auth_id) {
    $stmt = $pdo->prepare('SELECT id FROM users WHERE user_auth_id = ? LIMIT 1');
    $stmt->execute([$auth_id]);
    $user_id = $stmt->fetchColumn();
} else {
    if (session_status() === PHP_SESSION_NONE) {
        require_once __DIR__ . '/../../config/session-config.php';
    }
    $user_id = $_SESSION['user_id'] ?? null;
    if (($_SESSION['role'] ?? '') !== 'user') {
        $user_id = null;
    }
}

if (!$user_id) {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => 'Unauthorized. Please log in.']);
    exit;
}

$page = max(1, (int)($_GET['page'] ?? 1));
$limit = min(100, max(1, (int)($_GET['limit'] ?? 20)));
$offset = ($page - 1) * $limit;

try {
    $countStmt = $pdo->prepare('
        SELECT COUNT(*) FROM favorites f
        JOIN events e ON f.event_id = e.id
        WHERE f.user_id = ? AND e.deleted_at IS NULL AND e.status = \'published\'
    ');
    $countStmt->execute([$user_id]);
    $total = (int)$countStmt->fetchColumn();

    $stmt = $pdo->prepare("
        SELECT e.*,
            c.business_name AS organizer_name,
            c.profile_pic AS client_profile_pic,
            c.verification_status,
            (c.verification_status = 'verified') AS is_verified,
            1 AS is_favorite
        FROM favorites f
        JOIN events e ON f.event_id = e.id
        LEFT JOIN clients c ON e.client_id = c.id
        WHERE f.user_id = ?
          AND e.deleted_at IS NULL
          AND e.status = 'published'
        ORDER BY f.created_at DESC
        LIMIT ? OFFSET ?
    ");
    $stmt->bindValue(1, $user_id, PDO::PARAM_INT);
    $stmt->bindValue(2, $limit, PDO::PARAM_INT);
    $stmt->bindValue(3, $offset, PDO::PARAM_INT);
    $stmt->execute();
    $events = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $events = array_map(static function ($ev) {
        if (!empty($ev['metadata'])) {
            $meta = json_decode($ev['metadata'], true);
            if (is_array($meta)) {
                $ev = array_merge($ev, $meta);
            }
        }
        unset($ev['is_boosted'], $ev['priority']);
        if (!empty($ev['image_path'])) {
            $img = str_replace('\\', '/', $ev['image_path']);
            if (preg_match('#(/public/.+)$#i', $img, $m)) {
                $ev['image_path'] = $m[1];
            } elseif (preg_match('#(public/assets/.+)$#i', $img, $m)) {
                $ev['image_path'] = '/' . $m[1];
            }
        }
        return $ev;
    }, $events);

    echo json_encode([
        'success' => true,
        'events' => $events,
        'total' => $total,
        'page' => $page,
        'limit' => $limit,
    ]);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => formatDbErrorMessage($e)]);
}
