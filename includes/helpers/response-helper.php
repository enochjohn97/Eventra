<?php

/**
 * Send the HTTP response immediately, then run follow-up work (email, queues, etc.).
 */
function finishResponseThen(string $body, ?callable $after = null, int $statusCode = 200): void
{
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
        while (ob_get_level() > 0) {
            ob_end_flush();
        }
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
