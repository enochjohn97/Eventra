<?php
/**
 * Receive Email Webhook Stub
 */
header('Content-Type: application/json');

// Log the received email for now
$input = file_get_contents("php://input");
$log_msg = "[" . date('Y-m-d H:i:s') . "] Inbound Email Webhook: " . $input . PHP_EOL;
file_put_contents('../../logs/inbound_emails.log', $log_msg, FILE_APPEND);

echo json_encode(['success' => true, 'message' => 'Webhook received and logged']);
