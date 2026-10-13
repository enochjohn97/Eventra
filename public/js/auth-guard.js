/**
 * EventOut Auth Guard
 * Protects routes based on user role and authentication status.
 * Optimized for robustness: Calls AuthController.init() then waits for it to settle.
 */

(async function() {
    const currentPath = window.location.pathname;
    const origin = window.location.origin;

    // 1. Skip protection for login, signup, and public pages to prevent redirect loops
    const publicPages = ['/admin/login.html', '/client/login.html', 'signup.html', 'index.html', '/public/pages/'];
    if (publicPages.some(page => currentPath.endsWith(page) || currentPath === '/')) {
        // ALWAYS skip for explicitly public pages like Login/Signup
        return;
    }

    // Determine required role based on path
    let requiredRole = null;
    if (currentPath.includes('/admin/')) {
        requiredRole = 'admin';
    } else if (currentPath.includes('/client/')) {
        requiredRole = 'client';
    }

    // Allow one-time skip of redirect when navigation initiated via sidebar/menu click
    try {
        if ((typeof sessionStorage !== 'undefined' && sessionStorage.getItem('skip_auth_redirect')) || (typeof localStorage !== 'undefined' && localStorage.getItem('skip_auth_redirect'))) {
            try { sessionStorage.removeItem('skip_auth_redirect'); } catch (e) {}
            try { localStorage.removeItem('skip_auth_redirect'); } catch (e) {}
            return; // Permit navigation without forcing a login redirect
        }
    } catch (e) {}

    if (!requiredRole) return; // Not a protected area

    // FAST synchronous check before rendering body
    const user = window.storage ? window.storage.getUser() : null;
    const token = window.storage ? window.storage.getToken() : null;
    const hasLocalAuth = !!(user && token);
    
    // If we have no local auth AND we are not in the middle of a login flow redirect
    if (!hasLocalAuth) {
        // Check if we just logged in (session storage flag can be used if we set it in login.js)
        const justLoggedIn = sessionStorage.getItem('just_logged_in');
        if (!justLoggedIn) {
            // Debugging auth failure
            console.debug('Auth Guard Redirect:', {
                requiredRole,
                currentPath
            });
            if (requiredRole === 'admin') {
                window.location.replace(origin + '/admin/login.html');
            } else {
                window.location.replace(origin + '/client/login.html');
            }
            return;
        } else {
        }
    }

    // 2. Visual loading overlay removed so users can proceed to dashboards instantly.
    const loadingOverlay = null;

    try {
        // 3. Ensure AuthController exists and is initialized
        if (!window.authController) {
            throw new Error('AuthController not found');
        }

        // Always kick off init() — it guards against double-calls internally
        if (!window.authController.settled && !window.authController.isSyncing) {
            window.authController.init();
        }

        // 4. Wait for AuthController to complete server-side handshake with extended timeout for shared hosting
        const authState = await Promise.race([
            window.authController.ready,
            new Promise(resolve => setTimeout(() => resolve('timeout'), 8000)) // 8 second timeout
        ]);
        

        const user = window.authController.user;
        const isTimeout = authState === 'timeout';

        // 5. Final Evaluation
        if (authState === 'unauthenticated' || (user && user.role !== requiredRole)) {
            // Check if we have a valid local session to fall back on during slow syncs
            const localUser = window.storage ? window.storage.getUser() : null;
            const isRoleValid = localUser && localUser.role === requiredRole;

            // If we have local auth and it timed out, allow it (be patient with shared hosting)
            if (hasLocalAuth && isRoleValid && authState === 'timeout') {
                console.warn('Auth sync timed out, but local session is valid. Proceeding...');
                return;
            }

            // If we just logged in, handle specifically
            const justLoggedIn = sessionStorage.getItem('just_logged_in');
            if (hasLocalAuth && justLoggedIn && (authState === 'timeout' || authState === 'unauthenticated')) {
                // Keep the flag for a bit longer if we are still struggling to sync
                return;
            }

            if (window.storage) {
                window.storage.set('redirect_after_login', window.location.href);
            }

            if (requiredRole === 'admin') {
                window.location.href = origin + '/admin/login.html';
            } else {
                window.location.href = origin + '/client/login.html';
            }
            return;
        }

        // 6. Success — stable authenticated state
        // We only clear just_logged_in if the sync was actually successful (authenticated)
        if (authState === 'authenticated') {
            sessionStorage.removeItem('just_logged_in');
        }
        
        if (loadingOverlay) {
            loadingOverlay.classList.add('hidden');
            setTimeout(() => loadingOverlay.remove(), 600);
        }

    } catch (error) {
        
        // Ensure overlay is hidden even on error
        if (loadingOverlay) {
            loadingOverlay.classList.add('hidden');
            setTimeout(() => loadingOverlay.remove(), 600);
        }

        // Check if we have local auth and just logged in before redirecting
        const justLoggedIn = sessionStorage.getItem('just_logged_in');
        if (hasLocalAuth && justLoggedIn) {
            sessionStorage.removeItem('just_logged_in');
            return;
        }

        // On critical error OR sync failure, redirect to the role-specific login
        
        if (requiredRole === 'admin') {
            window.location.replace(origin + '/admin/login.html' + (window.location.search || '?error=auth_failed'));
        } else if (requiredRole === 'client') {
            window.location.replace(origin + '/client/login.html' + (window.location.search || '?error=auth_failed'));
        } else {
            window.location.replace(origin + '/index.html?trigger=login');
        }
    }
})();
