<?php
require_once __DIR__ . '/../config/database.php';

$action = $argv[1] ?? 'grants';

try {
    if ($action === 'grants') {
        foreach (['CURRENT_USER()', "'" . DB_USER . "'@'localhost'", "'" . DB_USER . "'@'127.0.0.1'"] as $who) {
            echo "\nGrants for $who:\n";
            try {
                $stmt = $pdo->query("SHOW GRANTS FOR $who");
                while ($row = $stmt->fetch(PDO::FETCH_NUM)) {
                    echo '  ' . $row[0] . "\n";
                }
            } catch (PDOException $e) {
                echo '  (not available: ' . $e->getMessage() . ")\n";
            }
        }
        exit(0);
    }

    if ($action === 'reset-clients-ai') {
        $pdo->exec('ALTER TABLE clients AUTO_INCREMENT = 1');
        echo "Successfully reset clients table auto-increment.\n";
        exit(0);
    }

    echo "Usage: php scripts/db_fix.php [grants|reset-clients-ai]\n";
    echo "If grants show eventra_db.eventra_db instead of eventra_db.*, run in MySQL as root:\n";
    echo "  GRANT ALL PRIVILEGES ON `" . DB_NAME . "`.* TO '" . DB_USER . "'@'localhost';\n";
    echo "  GRANT ALL PRIVILEGES ON `" . DB_NAME . "`.* TO '" . DB_USER . "'@'127.0.0.1';\n";
    echo "  FLUSH PRIVILEGES;\n";
} catch (PDOException $e) {
    echo 'Error: ' . $e->getMessage() . "\n";
    exit(1);
}