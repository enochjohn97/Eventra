<?php

/**
 * Reminder Trigger Endpoint — runs cron/notify-pre-event.php opportunistically.
 *
 * Why this exists: on shared/Windows hosting there is no crontab, so the
 * pre-event reminder script (email + SMS + in-app + client dashboard
 * notifications) was never executed. This endpoint lets the app's own
 * background pollers (client / admin / public dashboards) nudge it —
 * throttled to at most one run per 2 minutes and guarded by a lock file
 * so parallel requests cannot double-send reminders (the cron script
 * additionally dedupes per ticket).
 *
 * Authorization (any ONE of):
 *   - Any authenticated session (user / client / admin) — used by the app's pollers
 *   - CRON_SECRET via ?secret= or X-Cron-Secret header — for external schedulers
 *   - CLI invocation (crontab) — always allowed
 *
 * The cron itself runs in a detached CLI process so a slow SMTP/Brevo call
 * can never hold a web request open.
 */

header('Content-Type: application/json');

function triggerRespond(bool $success, array $extra = [], int $httpCode = 200): void
{
    http_response_code($httpCode);
    echo json_encode(array_merge(['success' => $success], $extra));
    exit;
}

// ── 1. Authorization ────────────────────────────────────────────────────────
if (PHP_SAPI !== 'cli') {
    $expectedSecret = ($_ENV['CRON_SECRET'] ?? getenv('CRON_SECRET') ?: '');
    $providedSecret = $_GET['secret'] ?? $_SERVER['HTTP_X_CRON_SECRET'] ?? '';
    $authorized = false;

    if ($expectedSecret !== '' && is_string($providedSecret) && hash_equals($expectedSecret, $providedSecret)) {
        $authorized = true;
    } else {
        require_once __DIR__ . '/../../includes/middleware/auth.php';
        $authId = checkAuthOptional(); // any portal role counts
        if (!empty($authId)) {
            $authorized = true;
        }
    }

    if (!$authorized) {
        triggerRespond(false, ['message' => 'Unauthorized.'], 401);
    }
}

// ── 2. Throttle: at most one run per 2 minutes ─────────────────────────────
$logDir = __DIR__ . '/../../logs';
if (!is_dir($logDir)) {
    @mkdir($logDir, 0775, true);
}
$lastRunFile = $logDir . '/cron-reminders.lastrun';
$minInterval = 120; // seconds

$lastRun = 0;
if (is_file($lastRunFile)) {
    $lastRun = (int) @file_get_contents($lastRunFile);
}
$now = time();
if ($now - $lastRun < $minInterval) {
    triggerRespond(true, ['triggered' => false, 'skipped' => 'throttled', 'next_run_in' => $minInterval - ($now - $lastRun)]);
}

$cronPath = realpath(__DIR__ . '/../../cron/notify-pre-event.php');
if (!$cronPath) {
    triggerRespond(false, ['message' => 'Reminder worker is unavailable.'], 503);
}

// Stamp BEFORE spawning so requests arriving during a long run don't queue.
@file_put_contents($lastRunFile, (string) $now);

// ── 3. Spawn the cron as an isolated CLI process ───────────────────────────
$phpBinary = defined('PHP_BINARY') && PHP_BINARY ? PHP_BINARY : 'php';
$triggered = false;

if (stripos(PHP_OS, 'WIN') === 0) {
    if (function_exists('popen') && function_exists('pclose')) {
        // Windows (XAMPP-style): start /B runs detached; the empty "" is the
        // window-title placeholder required when the command is quoted.
        $cmd = 'start /B "" "' . $phpBinary . '" "' . $cronPath . '" > NUL 2>&1';
        $handle = @popen($cmd, 'r');
        if ($handle) {
            @pclose($handle);
            $triggered = true;
        }
    }
} elseif (function_exists('exec')) {
    $cmd = '(' . escapeshellarg($phpBinary) . ' ' . escapeshellarg($cronPath) . ' > /dev/null 2>&1 &)';
    $exitCode = 1;
    @exec($cmd, $output, $exitCode);
    $triggered = $exitCode === 0;
}

// ── 4. Fallback: run inline if process spawning is unavailable ────────────
if (!$triggered) {
    // The request has already been authorized. Keep worker output out of JSON.
    echo json_encode(['success' => true, 'triggered' => false, 'skipped' => 'ran_inline']) . "\n";
    while (ob_get_level() > 0) {
        ob_end_flush();
    }
    flush();
    if (function_exists('fastcgi_finish_request')) {
        fastcgi_finish_request();
    }
    ob_start(function (): string {
        return '';
    });
    define('EVENTRA_AUTHORIZED_REMINDER_TRIGGER', true);
    require $cronPath;
}

triggerRespond(true, ['triggered' => true]);
