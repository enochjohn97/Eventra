<?php

/**
 * Background Job Processor for Ticket Queue
 *
 * Processes pending ticket generation and notification jobs from the queue.
 * This script is called asynchronously to avoid blocking the payment verification endpoint.
 * Runs for a limited time then exits to prevent resource hogging.
 */

set_time_limit(300); // 5-minute max execution time

require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/helpers/ticket-helper.php';
require_once __DIR__ . '/../../includes/helpers/email-helper.php';
require_once __DIR__ . '/../../includes/helpers/sms-helper.php';
require_once __DIR__ . '/../../api/utils/notification-helper.php';

$jobDir = __DIR__ . '/../../jobs/';
$maxJobsPerRun = 5;
$jobCount = 0;

if (!is_dir($jobDir)) {
    if (defined('RUNNING_INLINE')) { return; } else { exit(0); }
}

// Find and process pending jobs
$files = glob($jobDir . 'ticket_*.json');
if (empty($files)) {
    if (defined('RUNNING_INLINE')) { return; } else { exit(0); }
}

sort($files); // Process oldest first

foreach ($files as $jobFile) {
    if ($jobCount >= $maxJobsPerRun) {
        break;
    }

    if (!file_exists($jobFile)) {
        continue;
    }

    try {
        $jobData = json_decode(file_get_contents($jobFile), true);
        if (!$jobData || $jobData['type'] !== 'generate_tickets_and_notify') {
            @unlink($jobFile);
            continue;
        }

        $reference = $jobData['reference'];
        $payment_id = $jobData['payment_id'];
        
        // --- Security Check: Ensure payment is confirmed in DB before sending ---
        $stmtStatus = $pdo->prepare("SELECT status FROM payments WHERE id = ?");
        $stmtStatus->execute([$payment_id]);
        $dbStatus = $stmtStatus->fetchColumn();

        if ($dbStatus !== 'paid' && $dbStatus !== 'success') {
            error_log("[process-ticket-queue.php] Skipping job for reference $reference: Payment status is $dbStatus (not paid/success).");
            @unlink($jobFile);
            continue;
        }

        $order_id = $jobData['order_id'];
        $barcodes = $jobData['barcodes'] ?? [];
        $ticket_ids = $jobData['ticket_ids'] ?? [];
        $ticketData = $jobData['ticket_data'] ?? [];
        $user_email = $jobData['user_email'];
        $user_phone = $jobData['user_phone'];
        $user_auth_accounts_id = $jobData['user_auth_accounts_id'];
        $organizer_auth_id = $jobData['organizer_auth_id'];
        $quantity = $jobData['quantity'] ?? count($barcodes);

        error_log("[process-ticket-queue.php] Processing job for reference: $reference");

        // Generate QR codes and PDFs for all tickets
        $pdfPaths = [];
        foreach ($barcodes as $index => $barcode) {
            try {
                $ticketDataForLoop = array_merge($ticketData, ['barcode' => $barcode]);
                $ticket_id = $ticket_ids[$index] ?? null;

                // Generate QR code
                $qrCodePath = generateTicketQRCode($ticketDataForLoop);
                if ($qrCodePath && file_exists($qrCodePath)) {
                    // Update ticket with QR code path
                    if ($ticket_id) {
                        $stmt = $pdo->prepare("UPDATE tickets SET qr_code_path = ? WHERE id = ?");
                        $stmt->execute([toPublicRelativePath($qrCodePath), $ticket_id]);
                    }
                }

                // Generate PDF
                $pdfPath = generateTicketPDF($ticketDataForLoop);
                // Only add to pdfPaths if BOTH QR and PDF succeeded
                if ($pdfPath && file_exists($pdfPath)) {
                    $pdfPaths[] = $pdfPath;

                    // Enrich per-ticket data so emails can render the QR correctly
                    $sendData = $ticketDataForLoop;
                    if (!empty($qrCodePath) && file_exists($qrCodePath)) {
                        $sendData['qr_path'] = $qrCodePath;
                        // Use ticket helper's base64 encoder
                        if (function_exists('base64_encode_image')) {
                            $b64 = base64_encode_image($qrCodePath);
                            if ($b64 !== '') {
                                $sendData['qr_base64'] = $b64;
                            }
                        }
                    }

                    // Track last enriched ticket data for final email render
                    $lastEnrichedTicket = $sendData;
                } else {
                    error_log("[process-ticket-queue.php] PDF missing after generation for barcode $barcode (ticket $ticket_id)");
                }
            } catch (\Throwable $genError) {
                // Log structured failure
                error_log(sprintf(
                    '[process-ticket-queue.php] Ticket generation FAILED | barcode=%s ticket_id=%d order=%d error=%s',
                    $barcode,
                    $ticket_id ?? 0,
                    $order_id ?? 0,
                    $genError->getMessage()
                ));
            }
        }

        // Send notifications after all PDFs are generated
        try {
            // Send email with all ticket PDFs — prefer the last enriched ticket data if available
            if (!empty($pdfPaths)) {
                $emailTicketData = $lastEnrichedTicket ?? $ticketData;
                EmailHelper::sendTicketEmailFull($user_email, $emailTicketData, $pdfPaths);
            }

            // Send SMS
            if (!empty($user_phone) && !empty($ticketData['user_name']) && !empty($ticketData['event_name'])) {
                sendSMS($user_phone, "Hi {$ticketData['user_name']}, your ticket for {$ticketData['event_name']} is confirmed!");
            }

            // Create in-app notifications
            createPaymentSuccessNotification($user_auth_accounts_id, $ticketData['event_name'], $ticketData['amount']);
            createTicketIssuedNotification($user_auth_accounts_id, $ticketData['event_name'], $barcodes[0]);

            // Notify organizer of sale
            if ($organizer_auth_id) {
                createNewSaleNotification($organizer_auth_id, $ticketData['user_name'], $ticketData['event_name'], $ticketData['amount']);
            }

            error_log("[process-ticket-queue.php] Successfully processed job for reference: $reference");
        } catch (Exception $e) {
            error_log("[process-ticket-queue.php] Notification failed for reference $reference: " . $e->getMessage());
        }

        // Remove processed job file
        @unlink($jobFile);
        $jobCount++;

    } catch (Throwable $e) {
        error_log("[process-ticket-queue.php] Fatal error processing job $jobFile: " . $e->getMessage());
        // Try to remove job file on error
        @unlink($jobFile);
    }
}

if (defined('RUNNING_INLINE')) { return; } else { exit(0); }
