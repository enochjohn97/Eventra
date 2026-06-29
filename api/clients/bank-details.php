<?php

/**
 * Bank Details API
 *
 * GET: Resolve account name via Paystack
 * POST: Save bank details and create/update Paystack subaccount
 */

header('Content-Type: application/json');
require_once '../../config/database.php';
require_once '../../includes/middleware/auth.php';

try {
    $client_id = clientMiddleware();
    
    // Get the client_auth_id
    $stmt = $pdo->prepare("SELECT client_auth_id FROM clients WHERE id = ?");
    $stmt->execute([$client_id]);
    $client_auth_id = $stmt->fetchColumn();
    
    if (!$client_auth_id) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Client profile not found.']);
        exit;
    }

    // ── GET: Resolve Account via Paystack ─────────────────────────────────────
    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        require_once '../../config/payment.php';

        $bank_code      = trim($_GET['bank_code']      ?? '');
        $account_number = trim($_GET['account_number'] ?? '');

        if (empty($bank_code) || empty($account_number)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Bank code and account number are required.']);
            exit;
        }

        if (!ctype_digit($account_number) || strlen($account_number) !== 10) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Account number must be exactly 10 digits.']);
            exit;
        }

        $res = paystackRequest(
            'GET',
            '/bank/resolve?account_number=' . urlencode($account_number) . '&bank_code=' . urlencode($bank_code)
        );

        if (!$res['ok']) {
            $isTestMode = (defined('PAYSTACK_SECRET_KEY') && str_starts_with(PAYSTACK_SECRET_KEY, 'sk_test'));
            if ($isTestMode) {
                echo json_encode(['success' => true, 'account_name' => $account_name]);
                exit;
            }

            $msg = $res['body']['message'] ?? $res['error'] ?? 'Could not resolve account.';
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => $msg]);
            exit;
        }

        $account_name = trim($res['body']['data']['account_name'] ?? '');
        if ($account_name === '') {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Account name could not be resolved.']);
            exit;
        }

        echo json_encode(['success' => true, 'account_name' => $account_name]);
        exit;
    }

    // ── POST: Save Bank Details ──────────────────────────────────────────
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        require_once '../../config/payment.php';

        $data = json_decode(file_get_contents('php://input'), true) ?? $_POST;
        
        $bank_code      = trim($data['bank_code']      ?? '');
        $account_number = trim($data['account_number'] ?? '');
        $bank_name      = trim($data['bank_name']      ?? '');
        $account_name   = trim($data['account_name']   ?? '');

        if (empty($bank_code) || empty($account_number)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Bank code and account number are required.']);
            exit;
        }

        if (strlen($account_number) !== 10) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Account number must be 10 digits.']);
            exit;
        }

        if ($account_name === '') {
            $resolve = paystackRequest(
                'GET',
                '/bank/resolve?account_number=' . urlencode($account_number) . '&bank_code=' . urlencode($bank_code)
            );
            if ($resolve['ok']) {
                $account_name = trim($resolve['body']['data']['account_name'] ?? '');
            } else {
                $isTestMode = (defined('PAYSTACK_SECRET_KEY') && str_starts_with(PAYSTACK_SECRET_KEY, 'sk_test'));
                if ($isTestMode) {
                    $account_name = $account_name;
                }
            }
        }

        if ($account_name === '') {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Account name is required and could not be resolved.']);
            exit;
        }

        try {
            $pdo->beginTransaction();

            // Fetch client details needed for subaccount creation
            $stmt = $pdo->prepare("
                SELECT c.business_name, c.subaccount_code, a.email
                FROM clients c
                JOIN auth_accounts a ON c.client_auth_id = a.id
                WHERE c.client_auth_id = ?
                FOR UPDATE
            ");
            $stmt->execute([$client_auth_id]);
            $client = $stmt->fetch(PDO::FETCH_ASSOC);

            if (!$client) {
                $pdo->rollBack();
                echo json_encode(['success' => false, 'message' => 'Client not found.']);
                exit;
            }

            // Create/Update subaccount on Paystack
            $subaccountRes = ensureSubaccount(
                $pdo, 
                $client_auth_id, 
                $bank_code, 
                $account_number, 
                $client['business_name'] ?: 'Eventra Client', 
                $client['email'], 
                $client['subaccount_code']
            );

            if (!$subaccountRes['success']) {
                $pdo->rollBack();
                http_response_code(400);
                echo json_encode(['success' => false, 'message' => $subaccountRes['message']]);
                exit;
            }

            // ensureSubaccount already updates subaccount_code and subaccount_id
            // Now update the rest of the bank details
            $stmt = $pdo->prepare("
                UPDATE clients
                SET bank_code = ?,
                    account_number = ?,
                    account_name = ?,
                    bank_name = ?,
                    verification_status = 'pending',
                    updated_at = NOW()
                WHERE client_auth_id = ?
            ");
            $stmt->execute([
                $bank_code,
                $account_number,
                $account_name,
                $bank_name ?: $bank_code,
                $client_auth_id
            ]);

            $pdo->commit();

            echo json_encode([
                'success' => true,
                'message' => 'Bank details saved and verified with Paystack.',
                'account_name' => $account_name
            ]);
        } catch (PDOException $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => 'Database error.']);
        }
        exit;
    }

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Error: ' . $e->getMessage()]);
    exit;
}

