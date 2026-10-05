/// Typed exception for EvenOut API failures.
///
/// Carries just enough structure for callers to distinguish:
///  * [unauthorized] — the session token was rejected (401/403 with an auth
///    message). The app should clear credentials and send the user to login.
///  * everything else — business/network errors that are safe to show as a
///    snack bar without logging the user out.
class ApiException implements Exception {
  final String message;
  final int? statusCode;

  const ApiException(this.message, {this.statusCode});

  /// True when the server rejected the request because the token is missing,
  /// expired, or revoked (as opposed to "insufficient permissions").
  bool get unauthorized {
    if (statusCode != null && statusCode != 401 && statusCode != 403) {
      return false;
    }
    final lower = message.toLowerCase();
    // Messages produced by includes/middleware/auth.php on token failure.
    return lower.contains('session expired') ||
        lower.contains('invalid token') ||
        lower.contains('log in again') ||
        lower.contains('unauthorized');
  }

  @override
  String toString() => message;
}
