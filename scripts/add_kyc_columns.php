<?php
/**
 * Migration: Add KYC file columns to clients table
 * Run once to add the 6 new KYC file path columns.
 */

require_once __DIR__ . '/../config/database.php';

$columns = [
    'kyc_nin_file'           => "ADD COLUMN kyc_nin_file VARCHAR(255) DEFAULT NULL COMMENT 'NIN document file path'",
    'kyc_bvn_file'           => "ADD COLUMN kyc_bvn_file VARCHAR(255) DEFAULT NULL COMMENT 'BVN document file path'",
    'kyc_voter_card_file'    => "ADD COLUMN kyc_voter_card_file VARCHAR(255) DEFAULT NULL COMMENT 'Voter Card file path'",
    'kyc_driver_license_file'=> "ADD COLUMN kyc_driver_license_file VARCHAR(255) DEFAULT NULL COMMENT 'Driver License file path'",
    'kyc_cac_file'           => "ADD COLUMN kyc_cac_file VARCHAR(255) DEFAULT NULL COMMENT 'CAC Certificate file path'",
    'kyc_other_file'         => "ADD COLUMN kyc_other_file VARCHAR(255) DEFAULT NULL COMMENT 'Other KYC document file path'",
];

$errors = [];
$added  = [];

foreach ($columns as $col => $definition) {
    // Check if column already exists
    $check = $pdo->prepare("SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'clients' AND COLUMN_NAME = ?");
    $check->execute([$col]);
    if ((int) $check->fetchColumn() > 0) {
        echo "[SKIP] Column `{$col}` already exists.\n";
        continue;
    }

    try {
        $pdo->exec("ALTER TABLE clients {$definition}");
        $added[] = $col;
        echo "[OK]   Column `{$col}` added.\n";
    } catch (PDOException $e) {
        $errors[] = $col;
        echo "[ERR]  Failed to add `{$col}`: " . $e->getMessage() . "\n";
    }
}

echo "\nMigration complete. Added: " . count($added) . " | Errors: " . count($errors) . "\n";
