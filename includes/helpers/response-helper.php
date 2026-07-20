<?php

/**
 * Send the HTTP response immediately, then run follow-up work (email, queues, etc.).
 */
function finishResponseThen(string $body, ?callable $after = null, int $statusCode = 200): void
{
    // Discard any buffered PHP warnings/notices to prevent response corruption.
    // database.php calls ob_start() early; if any notice leaked into the buffer
    // it would inflate the body beyond Content-Length and break the connection.
    while (ob_get_level() > 0) {
        ob_end_clean();
    }

    http_response_code($statusCode);

    if (!headers_sent()) {
        header('Content-Type: application/json');
        header('Content-Length: ' . strlen($body));
        header('Connection: close');
    }

    echo $body;

    ignore_user_abort(true);
    set_time_limit(0);

    if (session_status() === PHP_SESSION_ACTIVE) {
        session_write_close();
    }

    if (function_exists('fastcgi_finish_request')) {
        fastcgi_finish_request();
    } else {
        flush();
    }

    if ($after !== null) {
        try {
            $after();
        } catch (\Throwable $e) {
            error_log('[finishResponseThen] Background task failed: ' . $e->getMessage());
        }
    }
}
