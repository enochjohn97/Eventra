<?php

/**
 * EventOut — Entity ID Generator
 * Provides unique, human-readable, date-prefixed random custom IDs for all entities.
 */

/**
 * Helper to get date prefix
 */
function getDatePrefix(): string
{
    return date('Ymd');
}

/**
 * Generate a unique User ID: USR-YYYYMMDD-XXXX
 */
function generateUserId(PDO $pdo): string
{
    $prefix = 'USR-' . getDatePrefix() . '-';
    do {
        $id = $prefix . strtoupper(bin2hex(random_bytes(2))); // 4 chars suffix
        $stmt = $pdo->prepare('SELECT id FROM users WHERE custom_id = ? LIMIT 1');
        $stmt->execute([$id]);
    } while ($stmt->fetch());
    return $id;
}

/**
 * Generate a unique Client ID: CLI-YYYYMMDD-XXXX
 */
function generateClientId(PDO $pdo): string
{
    $prefix = 'CLI-' . getDatePrefix() . '-';
    do {
        $id = $prefix . strtoupper(bin2hex(random_bytes(2))); // 4 chars suffix
        $stmt = $pdo->prepare('SELECT id FROM clients WHERE custom_id = ? LIMIT 1');
        $stmt->execute([$id]);
    } while ($stmt->fetch());
    return $id;
}

/**
 * Generate a unique Payment ID: PAY-YYYYMMDD-XXXX
 */
function generatePaymentId(PDO $pdo): string
{
    $prefix = 'PAY-' . getDatePrefix() . '-';
    do {
        $id = $prefix . strtoupper(bin2hex(random_bytes(2))); // 4 chars suffix
        $stmt = $pdo->prepare('SELECT id FROM payments WHERE custom_id = ? LIMIT 1');
        $stmt->execute([$id]);
    } while ($stmt->fetch());
    return $id;
}

/**
 * Generate a unique Ticket ID: TKT-YYYYMMDD-XXXX
 */
function generateTicketId(PDO $pdo): string
{
    $prefix = 'TKT-' . getDatePrefix() . '-';
    do {
        $id = $prefix . strtoupper(bin2hex(random_bytes(2))); // 4 chars suffix
        $stmt = $pdo->prepare('SELECT id FROM tickets WHERE custom_id = ? LIMIT 1');
        $stmt->execute([$id]);
    } while ($stmt->fetch());
    return $id;
}

/**
 * Generate a unique Event ID: EVT-YYYYMMDD-XXXX
 */
function generateEventId(PDO $pdo): string
{
    $prefix = 'EVT-' . getDatePrefix() . '-';
    do {
        $id = $prefix . strtoupper(bin2hex(random_bytes(2))); // 4 chars suffix
        $stmt = $pdo->prepare('SELECT id FROM events WHERE custom_id = ? LIMIT 1');
        $stmt->execute([$id]);
    } while ($stmt->fetch());
    return $id;
}

/**
 * Generate a unique Transaction ID: TRX-YYYYMMDD-XXXX
 */
function generateTransactionId(PDO $pdo): string
{
    $prefix = 'TRX-' . getDatePrefix() . '-';
    do {
        $id = $prefix . strtoupper(bin2hex(random_bytes(2))); // 4 chars suffix
        $stmt = $pdo->prepare('SELECT id FROM payment_transactions WHERE custom_id = ? LIMIT 1');
        $stmt->execute([$id]);
    } while ($stmt->fetch());
    return $id;
}
