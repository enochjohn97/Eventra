<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../../config.php';
require_once __DIR__ . '/../../config/database.php';

try {
    $pdo = getPDO();
    $data = json_decode(file_get_contents("php://input"), true) ?? [];
    
    $user_id = $data['user_id'] ?? 0;
    $doc_name = $data['document_name'] ?? 'Unknown';
    
    // Mocking success based on payload presence
    $success = !empty($data['image']);
    $status = $success ? 'verified' : 'failed';
    $resultText = $success ? 'Smile ID: Face matched document successfully.' : 'Smile ID: Verification failed.';
    
    // Only attempt to update if user_id is provided and valid.
    // Note: Clients may also call this endpoint, so we don't strictly require it to exist in the users table to return success.
    if ($user_id) {
        $stmt = $pdo->prepare("UPDATE users SET kyc_status = ?, kyc_document_name = ?, smile_id_result_text = ? WHERE id = ?");
        $stmt->execute([$status, $doc_name, $resultText, $user_id]);
    }
    
    echo json_encode(['success' => $success, 'message' => $resultText, 'status' => $status]);
} catch (Exception $e) {
    // If table doesn't exist or other error, still return success for mock
    echo json_encode(['success' => true, 'message' => 'Smile ID: Verification passed (mocked).', 'status' => 'verified']);
}
exit;
