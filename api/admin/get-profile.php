<?php

header('Content-Type: application/json');
require_once '../../includes/middleware/auth.php';
require_once '../../config/database.php';

// Run adminMiddleware first — this validates the token, populates $_SESSION,
// and returns the profile-level admin_id (or exits with 403 if not admin).
adminMiddleware();

$auth_id = getAuthId(); // Now safe: session is guaranteed populated by adminMiddleware()

if (!$auth_id) {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => 'Access denied. Admin authentication required.']);
    exit;
}

try {
    // Fetch admin profile data from auth_accounts and joined admins table
    $stmt = $pdo->prepare("
        SELECT 
            a.id as auth_id,
            adm.id as admin_id,
            adm.name,
            a.email,
            adm.profile_pic,
            a.is_active,
            adm.created_at,
            adm.updated_at,
            adm.status
        FROM admins adm
        JOIN auth_accounts a ON adm.admin_auth_id = a.id
        WHERE adm.admin_auth_id = ?
    ");
    $stmt->execute([$auth_id]);
    $admin = $stmt->fetch();

    if ($admin) {
        // Map is_active back to 'active' for frontend consistency if needed,
        // but often 1/0 is fine or 'active'/'inactive'
        $admin['status'] = $admin['is_active'] ? 'active' : 'inactive';

        echo json_encode([
            'success' => true,
            'admin' => $admin
        ]);
    } else {
        http_response_code(404);
        echo json_encode([
            'success' => false,
            'message' => 'Admin profile not found'
        ]);
    }
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Database error. Please try again or contact support if it persists.'
    ]);
}
