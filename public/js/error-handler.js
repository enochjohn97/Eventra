/**
 * Global Error Handler for Eventra
 * Captures JavaScript errors and unhandled promise rejections,
 * then sends them to the backend for centralized logging.
 */
(function() {
    const LOG_ENDPOINT = '/api/utils/log-error';
    let errorCount = 0;
    const MAX_ERRORS = 10; // Prevent spamming in a single session

    function logErrorToBackend(errorData) {
        if (errorCount >= MAX_ERRORS) return;
        errorCount++;

        // Basic payload
        const payload = {
            message: errorData.message || 'Unknown error',
            url: errorData.url || window.location.href,
            line: errorData.line || 0,
            column: errorData.column || 0,
            stack: errorData.stack || 'N/A',
            timestamp: new Date().toISOString()
        };

        // Use fetch with keepalive to ensure it sends even if the page is closing
        fetch(LOG_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload),
            keepalive: true
        }).catch(err => {
            // Silently fail if we can't log the error (avoid infinite loop)
            console.warn('Failed to send error to backend:', err);
        });
    }

    // Capture standard runtime errors
    window.onerror = function(message, source, lineno, colno, error) {
        logErrorToBackend({
            message: message,
            url: source,
            line: lineno,
            column: colno,
            stack: error ? error.stack : 'N/A'
        });
        // We return false to let the default browser error handling continue
        return false;
    };

    // Capture unhandled promise rejections
    window.addEventListener('unhandledrejection', function(event) {
        const error = event.reason;
        logErrorToBackend({
            message: 'Unhandled Rejection: ' + (error ? (error.message || error) : 'Unknown reason'),
            stack: error ? error.stack : 'N/A',
            url: window.location.href
        });
    });

    console.log('EventOut Global Error Handler initialized.');
})();
