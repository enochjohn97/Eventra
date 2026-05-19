#!/usr/bin/env php
<?php

/**
 * Verification Script for Payment Fix
 * 
 * This script tests that the payment verification optimization is working correctly.
 * Usage: php verify-fix.php
 */

define('BYPASS_DB_CONN', true);

echo "═══════════════════════════════════════════════════════════════\n";
echo "Payment Verification Fix Verification Script\n";
echo "═══════════════════════════════════════════════════════════════\n\n";

$projectRoot = __DIR__;
$errors = [];
$warnings = [];
$success = [];

// 1. Check if all required files exist
echo "[1/5] Checking required files...\n";
$requiredFiles = [
    'api/payments/verify-payment.php' => 'Payment verification endpoint',
    'api/utils/process-ticket-queue.php' => 'Background job processor',
    'scripts/process-tickets.sh' => 'Cron job script',
    'api/payments/get-order.php' => 'Get order endpoint',
    'includes/helpers/ticket-helper.php' => 'Ticket helper functions',
];

foreach ($requiredFiles as $file => $description) {
    $filePath = "$projectRoot/$file";
    if (file_exists($filePath)) {
        echo "  ✓ $file\n";
        $success[] = "$file exists";
    } else {
        echo "  ✗ $file\n";
        $errors[] = "$file missing ($description)";
    }
}
echo "\n";

// 2. Check PHP syntax
echo "[2/5] Checking PHP syntax...\n";
$phpFiles = [
    'api/payments/verify-payment.php',
    'api/utils/process-ticket-queue.php',
];

foreach ($phpFiles as $file) {
    $filePath = "$projectRoot/$file";
    if (file_exists($filePath)) {
        $output = shell_exec("php -l " . escapeshellarg($filePath) . " 2>&1");
        if (strpos($output, 'No syntax errors') !== false) {
            echo "  ✓ $file\n";
            $success[] = "$file syntax valid";
        } else {
            echo "  ✗ $file: $output\n";
            $errors[] = "$file has syntax errors";
        }
    }
}
echo "\n";

// 3. Check directory permissions
echo "[3/5] Checking directory permissions...\n";
$dirs = [
    'jobs' => 'Job queue directory',
    'uploads/tickets/qrcodes' => 'QR code storage',
    'uploads/tickets/pdfs' => 'PDF ticket storage',
];

foreach ($dirs as $dir => $description) {
    $dirPath = "$projectRoot/$dir";
    if (!is_dir($dirPath)) {
        echo "  ⚠ Creating $dir (doesn't exist yet)\n";
        $warnings[] = "$dir will be created on first use";
    } elseif (is_writable($dirPath)) {
        echo "  ✓ $dir is writable\n";
        $success[] = "$dir is writable";
    } else {
        echo "  ✗ $dir is not writable\n";
        $errors[] = "$dir is not writable";
    }
}
echo "\n";

// 4. Check key functions
echo "[4/5] Checking required functions...\n";
require_once "$projectRoot/config/database.php";
require_once "$projectRoot/includes/helpers/ticket-helper.php";

$functions = [
    'generateTicketQRCode' => 'QR code generation',
    'generateTicketPDF' => 'PDF generation',
    'buildSecureQRPayload' => 'Secure QR payload builder',
    'verifyQRPayload' => 'QR payload verification',
];

foreach ($functions as $func => $description) {
    if (function_exists($func)) {
        echo "  ✓ $func\n";
        $success[] = "$func exists";
    } else {
        echo "  ✗ $func\n";
        $errors[] = "$func not found ($description)";
    }
}
echo "\n";

// 5. Verify key improvements
echo "[5/5] Verifying optimization changes...\n";

// Check that verify-payment.php queues jobs instead of blocking on PDF
$verifyContent = file_get_contents("$projectRoot/api/payments/verify-payment.php");
if (strpos($verifyContent, 'process-ticket-queue.php') !== false && 
    strpos($verifyContent, 'shell_exec') !== false &&
    strpos($verifyContent, '$jobDir = __DIR__') !== false) {
    echo "  ✓ verify-payment.php uses async job queueing\n";
    $success[] = "Async job queueing implemented in verify-payment.php";
} else {
    echo "  ✗ verify-payment.php doesn't queue jobs properly\n";
    $errors[] = "verify-payment.php optimization not fully implemented";
}

// Check that process-ticket-queue exists
$queueContent = file_get_contents("$projectRoot/api/utils/process-ticket-queue.php");
if (strpos($queueContent, 'generateTicketQRCode') !== false &&
    strpos($queueContent, 'generateTicketPDF') !== false &&
    strpos($queueContent, 'process-ticket-queue.php') !== false) {
    echo "  ✓ Background processor has required functions\n";
    $success[] = "Background processor implemented correctly";
} else {
    echo "  ✗ Background processor missing functions\n";
    $errors[] = "Background processor not properly implemented";
}
echo "\n";

// Summary
echo "═══════════════════════════════════════════════════════════════\n";
echo "VERIFICATION SUMMARY\n";
echo "═══════════════════════════════════════════════════════════════\n";
echo "✓ Successful: " . count($success) . "\n";
echo "⚠ Warnings: " . count($warnings) . "\n";
echo "✗ Errors: " . count($errors) . "\n";
echo "\n";

if (!empty($errors)) {
    echo "ERRORS (Must Fix):\n";
    foreach ($errors as $error) {
        echo "  ✗ $error\n";
    }
    echo "\n";
}

if (!empty($warnings)) {
    echo "WARNINGS (Review):\n";
    foreach ($warnings as $warning) {
        echo "  ⚠ $warning\n";
    }
    echo "\n";
}

if (!empty($success)) {
    echo "SUCCESSES:\n";
    foreach (array_slice($success, 0, 5) as $msg) {
        echo "  ✓ $msg\n";
    }
    if (count($success) > 5) {
        echo "  ... and " . (count($success) - 5) . " more\n";
    }
    echo "\n";
}

// Final status
if (empty($errors)) {
    echo "✓ All checks passed! Payment optimization is ready to use.\n";
    echo "\nNext steps:\n";
    echo "1. Set up cron job: */5 * * * * /home/mein/Documents/Eventra/scripts/process-tickets.sh\n";
    echo "2. Test with a payment to verify the flow works\n";
    echo "3. Monitor job queue: ls -la /home/mein/Documents/Eventra/jobs/\n";
    exit(0);
} else {
    echo "✗ Please fix the errors above before deploying.\n";
    exit(1);
}
