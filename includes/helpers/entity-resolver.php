<?php
/**
 * Entity Resolver Helper
 * Handles unified identity resolution and security policies for different entity types.
 */

/**
 * Entity Resolver Helper
 * Handles unified identity resolution and security policies for different entity types.
 */

/**
 * Entity Resolver Helper
 * Handles unified identity resolution and security policies for different entity types.
 */

function resolveEntity($email)
{
    global $pdo;

    // First check the auth_accounts table
    // We remove the is_active = 1 requirement here because login.php will handle validation.
    $stmt = $pdo->prepare("SELECT * FROM auth_accounts WHERE email = ?");
    $stmt->execute([$email]);
    $auth = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$auth) {
        // Fallback: Check if the email exists in the clients table (users might log in with their profile email)
        $stmt = $pdo->prepare("SELECT client_auth_id FROM clients WHERE email = ?");
        $stmt->execute([$email]);
        $client_auth_id = $stmt->fetchColumn();

        if ($client_auth_id) {
            // Found in clients table, now fetch the auth account using the retrieved auth_id
            $stmt = $pdo->prepare("SELECT * FROM auth_accounts WHERE id = ?");
            $stmt->execute([$client_auth_id]);
            $auth = $stmt->fetch(PDO::FETCH_ASSOC);
        }

        if (!$auth) {
            return false;
        }
    }

    // Role-based retrieval for full profile
    $role = $auth['role'];
    $table = '';
    if ($role === 'admin')
        $table = 'admins';
    elseif ($role === 'client')
        $table = 'clients';
    elseif ($role === 'user')
        $table = 'users';

    if ($table) {
        // Correct name column mapping (Users table uses 'name', not 'display_name')
        $name_col = ($role === 'client') ? 'business_name' : 'name';

        // Admins and clients have a 'password' column, users do not.
        $role_password_col = in_array($role, ['admin', 'client']) ? 'p.password as profile_password_hash' : 'NULL as profile_password_hash';

        // We also fetch password from the specific table to ensure redundancy works correctly
        $auth_col = ($role === 'client') ? 'client_auth_id' : (($role === 'user') ? 'user_auth_id' : 'admin_auth_id');
        $stmt = $pdo->prepare("SELECT a.id as auth_id, a.email, a.role, a.is_active, a.auth_provider, a.provider_id, a.password_hash as auth_password_hash, p.*, p.id as profile_id, p.$name_col as display_name, p.profile_pic, p.profile_pic as profile_image, $role_password_col FROM auth_accounts a LEFT JOIN $table p ON a.id = p.$auth_col WHERE a.id = ?");
        $stmt->execute([$auth['id']]);
        $fullUser = $stmt->fetch(PDO::FETCH_ASSOC);

        // For convenience in registration/login logic that expects certain keys
        if ($fullUser) {
            // Priority: client/admin table password -> auth_accounts password
            $fullUser['password_hash'] = $fullUser['profile_password_hash'] ?? $fullUser['auth_password_hash'];
            $fullUser['password'] = $fullUser['password_hash']; // Alias for compatibility

            // Ensure ID refers to auth_id
            $fullUser['id'] = $fullUser['auth_id'];

            // Map table-specific name fields to a generic 'name'
            $fullUser['name'] = $fullUser['display_name'] ?? ucfirst($role);
            return $fullUser;
        }
    }

    return $auth;
}

/**
 * Resolves an entity by their Google ID.
 * Since google_id is not in auth_accounts anymore (it's auth_provider = 'google'),
 * we might need to rely on email or add google_id to auth_accounts.
 * Looking at the provided schema, auth_accounts has auth_provider but no provider_id.
 * If the user intended to use email as the link:
 */
function resolveEntityByGoogleId($googleId, $email = null)
{
    if (!$email)
        return false;
    return resolveEntity($email);
}

/**
 * Generates a custom ID for Clients and Users.
 * Format: ACC-YYYYMMDD-HEX6
 */
function generateInternalId()
{
    $date = date('Ymd');
    $hex = strtoupper(bin2hex(random_bytes(3)));
    return "ACC-$date-$hex";
}

/**
 * Checks if an email can be registered for a specific role.
 */
function canRegisterAs($email, $targetRole)
{
    global $pdo;
    $stmt = $pdo->prepare("SELECT role FROM auth_accounts WHERE email = ?");
    $stmt->execute([$email]);
    $existing = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$existing) {
        return ['success' => true];
    }

    return [
        'success' => false,
        'message' => "This identity is already bound to the " . ucfirst($existing['role']) . " role and cannot be reused for other roles."
    ];
}

/**
 * Returns authentication policy for a given role and method.
 */
function getAuthPolicy($role, $method, $user = null)
{
    if ($role === 'admin') {
        if ($method === 'google') {
            return [
                'allowed' => false,
                'message' => 'Admin accounts are restricted to secure password-based authentication.'
            ];
        }
        return ['allowed' => true];
    }

    if ($role === 'user') {
        if ($method === 'password' && empty($user['password_hash'])) {
            return [
                'allowed' => false,
                'message' => 'This account is restricted to Google Sign-In only.'
            ];
        }
        return ['allowed' => true];
    }

    if ($role === 'client') {
        if ($user && $user['auth_provider'] === 'local' && $method === 'google') {
            return [
                'allowed' => false,
                'message' => 'This account is bound to local Password authentication and cannot use Google.'
            ];
        }
        return ['allowed' => true];
    }

    return ['allowed' => false, 'message' => 'Invalid role or authentication method.'];
}

/**
 * Logs security events for auditing and abuse detection.
 */
function logSecurityEvent($authId, $email, $eventType, $authMethod, $details = null)
{
    global $pdo;
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    $ua = $_SERVER['HTTP_USER_AGENT'] ?? 'unknown';

    try {
        // Fetch username if not provided (fallback to email)
        $username = $email;
        if ($authId) {
            $stmt = $pdo->prepare("SELECT username FROM auth_accounts WHERE id = ?");
            $stmt->execute([$authId]);
            $res = $stmt->fetchColumn();
            if ($res)
                $username = $res;
        }

        $stmt = $pdo->prepare("INSERT INTO auth_logs (auth_id, email, username, event_type, auth_method, ip_address, user_agent, details) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
        $stmt->execute([$authId, $email, $username, $eventType, $authMethod, $ip, $ua, $details]);
    } catch (PDOException $e) {
        error_log("Failed to log security event: " . $e->getMessage());
    }
}
