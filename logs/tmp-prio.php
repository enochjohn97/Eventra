<?php
define('APP_URL', 'http://127.0.0.1:8099');
require __DIR__ . '/../config/env-loader.php';
require __DIR__ . '/../config/database.php';
$pdo = getPDO();
try {
    $rows = $pdo->query("SELECT event_name, priority_label, ticket_type_mode, regular_price, vip_price, premium_price, price FROM events WHERE status='published' ORDER BY id DESC LIMIT 26")->fetchAll(PDO::FETCH_ASSOC);
    echo 'rows: ' . count($rows) . PHP_EOL;
    $prioCount = [];
    $modeCount = [];
    $paid = 0;
    foreach ($rows as $r) {
        $p = trim((string)$r['priority_label']);
        $prioCount[$p === '' ? '(empty)' : $p] = ($prioCount[$p === '' ? '(empty)' : $p] ?? 0) + 1;
        $m = trim((string)$r['ticket_type_mode']);
        $modeCount[$m === '' ? '(empty)' : $m] = ($modeCount[$m === '' ? '(empty)' : $m] ?? 0) + 1;
        $hasPaid = ($r['regular_price'] > 0) || ($r['vip_price'] > 0) || ($r['premium_price'] > 0) || ($r['price'] > 0);
        if ($hasPaid) { $paid++; echo 'PAID: ' . $r['event_name'] . ' | mode=' . $m . ' | reg=' . $r['regular_price'] . ' vip=' . $r['vip_price'] . ' prem=' . $r['premium_price'] . ' legacy=' . $r['price'] . ' prio=[' . $p . ']' . PHP_EOL; }
    }
    echo '— priority labels —' . PHP_EOL;
    print_r($prioCount);
    echo '— ticket modes —' . PHP_EOL;
    print_r($modeCount);
    echo "paid events: $paid / " . count($rows) . PHP_EOL;
} catch (Throwable $e) {
    echo 'ERR: ' . $e->getMessage() . PHP_EOL;
}
