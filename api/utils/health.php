<?php

/**
 * Health Check Endpoint
 * Returns system health status for uptime monitoring
 */

header('Content-Type: application/json');
require_once __DIR__ . '/../../config/database.php';

try {
    $healthStatus = [
        'status' => 'healthy',
        'timestamp' => date('Y-m-d H:i:s'),
        'checks' => []
    ];

    // Check database connection
    try {
        $stmt = $pdo->query("SELECT 1");
        $stmt->fetch();
        $healthStatus['checks']['database'] = 'ok';
    } catch (Exception $e) {
        $healthStatus['status'] = 'unhealthy';
        $healthStatus['checks']['database'] = 'error: ' . $e->getMessage();
    }

    // Check if critical tables exist
    try {
        $stmt = $pdo->query("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() LIMIT 1");
        if ($stmt->fetch()) {
            $healthStatus['checks']['tables'] = 'ok';
        } else {
            $healthStatus['status'] = 'unhealthy';
            $healthStatus['checks']['tables'] = 'error: no tables found';
        }
    } catch (Exception $e) {
        $healthStatus['status'] = 'unhealthy';
        $healthStatus['checks']['tables'] = 'error: ' . $e->getMessage();
    }

    // Check uploads directory
    $uploadsDir = __DIR__ . '/../../uploads';
    if (is_writable($uploadsDir)) {
        $healthStatus['checks']['uploads_writable'] = 'ok';
    } else {
        $healthStatus['status'] = 'degraded';
        $healthStatus['checks']['uploads_writable'] = 'warning: uploads directory not writable';
    }

    // Check logs directory
    $logsDir = __DIR__ . '/../../logs';
    if (!is_dir($logsDir)) {
        @mkdir($logsDir, 0755, true);
    }
    if (is_writable($logsDir)) {
        $healthStatus['checks']['logs_writable'] = 'ok';
    } else {
        $healthStatus['checks']['logs_writable'] = 'warning: logs directory not writable';
    }

    http_response_code($healthStatus['status'] === 'healthy' ? 200 : 503);
    echo json_encode($healthStatus);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'status' => 'error',
        'timestamp' => date('Y-m-d H:i:s'),
        'error' => $e->getMessage()
    ]);
}
