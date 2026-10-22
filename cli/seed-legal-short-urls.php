<?php
/**
 * One-off seed: create short URLs for the legal pages.
 *
 * Run from project root:
 *   php cli/seed-legal-short-urls.php
 *
 * These are deterministic: the same long URL always maps to the same code.
 */

$rootDir = __DIR__ . '/..';
require_once $rootDir . '/config/database.php';
require_once $rootDir . '/includes/core/Autoloader.php';
require_once $rootDir . '/includes/helpers/short-url-helper.php';

$baseUrl = getAppBaseUrl();

$pages = [
    ['code' => 'terms',      'file' => '/terms.html',      'kind' => 'custom', 'ref_key' => 'legal:terms'],
    ['code' => 'privacy',    'file' => '/privacy.html',    'kind' => 'custom', 'ref_key' => 'legal:privacy'],
    ['code' => 'cookies',    'file' => '/cookies.html',    'kind' => 'custom', 'ref_key' => 'legal:cookies'],
    ['code' => 'delete-data','file' => '/delete-data.html','kind' => 'custom', 'ref_key' => 'legal:delete-data'],
];

$created = 0;
$skipped = 0;
$failed  = 0;

foreach ($pages as $page) {
    $longUrl = rtrim($baseUrl, '/') . $page['file'];
    $code = getOrCreateShortUrl($longUrl, $page['kind'], $page['ref_key']);
    if ($code === null) {
        echo "FAIL  {$page['code']}  (could not create short URL for $longUrl)\n";
        $failed++;
        continue;
    }
    // The helper returns the existing OR newly created code; if it differs from
    // our preferred deterministic name, the alias already exists and is fine.
    $shortUrl = rtrim($baseUrl, '/') . '/s/' . $code;
    if ($code === $page['code'] || strlen($code) <= 6) {
        echo "OK    {$page['code']}  →  /s/$code  ($shortUrl)\n";
    } else {
        echo "OK    {$page['code']}  →  /s/$code  (existing code, still valid)\n";
    }
    $created++;
}

echo "\nDone. $created page(s) resolvable, $skipped skipped, $failed failed.\n";
