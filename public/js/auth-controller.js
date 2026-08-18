/**
 * Eventra Auth Controller
 * Centralized state machine for authentication and Google Sign-In lifecycle.
 */
class AuthController {
    constructor() {
        this.states = {
            INITIALIZING: 'initializing',
            UNAUTHENTICATED: 'unauthenticated',
            AUTHENTICATING: 'authenticating',
            AUTHENTICATED: 'authenticated',
            ERROR: 'error'
        };
        this.state = this.states.INITIALIZING;
        this.user = null;
        this.googleInitialized = false;
        this.isRedirecting = false;
        this.isSyncing = false;
        this.settled = false;
        
        // Promise that resolves when the first sync is complete
        this._readyResolve = null;
        this.ready = new Promise((resolve) => {
            this._readyResolve = resolve;
        });
    }

    /**
     * Initialize Auth Controller
     */
    async init() {
        if (this.settled || this.isSyncing) return this.ready;
        
        // 1. Initial State from Storage (Optimistic)
        let storedUser = window.storage ? window.storage.getUser() : null;
        let storedToken = window.storage ? window.storage.getToken() : null;
        
        if (storedUser && storedToken) {
            this.user = storedUser;
            this.setState(this.states.AUTHENTICATED);
        }

        // 2. Perform server-side validation
        try {
            this.isSyncing = true;
            await this.syncSession();
        } finally {
            this.isSyncing = false;
            this.settled = true;
            // Ensure ready promise resolves even on error
            if (this._readyResolve) {
                this._readyResolve(this.state);
                this._readyResolve = null;
            }
        }
        
        return this.state;
    }

    /**
     * Synchronize session with backend
     */
    async syncSession() {
        if (this.isRedirecting) return;
        
        try {
            const basePath = getBasePath();
            const path = window.location.pathname;
            
            // Skip sync for portal/login pages to avoid loops, but still resolve ready
            // Updated to be more robust for different environments
            if (path.includes('Login.html') || path.includes('index.html')) {
                // If we are on index.html, we only skip if trigger=login is present or if we are clearly in guest mode
                const urlParams = new URLSearchParams(window.location.search);
                if (path.includes('Login.html') || urlParams.get('trigger') === 'login') {
                    this.setState(this.states.UNAUTHENTICATED);
                    return;
                }
            }

            const role = this.getPortalIntent();
            const endpoint = `${basePath}api/auth/check-session.php?portal=${role}`; // Use centralized endpoint directly

            const response = await apiFetch(endpoint, {
                cache: 'no-store'
            });
            
            if (!response) {
                // No response – trust local auth if still within 1-hour session window
                const loginTs = parseInt(localStorage.getItem('login_timestamp') || '0', 10);
                const withinWindow = (Date.now() - loginTs) < 60 * 60 * 1000;
                if (window.storage?.getToken() && withinWindow) {
                    this.setState(this.states.AUTHENTICATED);
                } else {
                    this.clearLocalState();
                    this.setState(this.states.UNAUTHENTICATED);
                }
                return;
            }

            const result = await response.json();
            if (result.success) {
                // Merge data to preserve any local-only fields if necessary, 
                // but usually server is source of truth.
                const updatedUser = { ...this.user, ...result.user };
                this.user = updatedUser;
                
                if (window.storage) window.storage.setUser(updatedUser);
                this.setState(this.states.AUTHENTICATED);
                window.dispatchEvent(new CustomEvent('auth:sync', { detail: { success: true, user: updatedUser } }));
            } else {
                // Server says not authenticated.
                const justLoggedIn = sessionStorage.getItem('just_logged_in');
                const loginTs = parseInt(localStorage.getItem('login_timestamp') || '0', 10);
                const withinWindow = (Date.now() - loginTs) < 60 * 60 * 1000;
                
                if (this.state !== this.states.UNAUTHENTICATED && this.state !== this.states.INITIALIZING) {
                    // Keep session alive if we have a local token within the 1-hour window
                    if (justLoggedIn || (window.storage?.getToken() && withinWindow)) {
                        this.setState(this.states.AUTHENTICATED);
                    } else {
                        this.clearLocalState();
                    }
                } else if (this.state === this.states.INITIALIZING) {
                    if (window.storage?.getToken() && withinWindow) {
                        this.setState(this.states.AUTHENTICATED);
                    } else {
                        this.setState(this.states.UNAUTHENTICATED);
                    }
                }
            }
        } catch (error) {
            // On hard failure, trust local auth if still within 1-hour session window
            const justLoggedIn = sessionStorage.getItem('just_logged_in');
            const loginTs = parseInt(localStorage.getItem('login_timestamp') || '0', 10);
            const withinWindow = (Date.now() - loginTs) < 60 * 60 * 1000;
            if (justLoggedIn || (window.storage?.getToken() && withinWindow)) {
                this.setState(this.states.AUTHENTICATED);
            } else {
                this.clearLocalState();
            }
        }
    }

    /**
     * State Machine Transition
     */
    setState(newState) {
        if (this.state === newState) return;
        this.state = newState;
        window.dispatchEvent(new CustomEvent('auth:stateChange', { detail: { state: newState, user: this.user } }));
        
        // Global events for specific states
        if (newState === this.states.AUTHENTICATED) {
            window.dispatchEvent(new CustomEvent('auth:authenticated', { detail: { user: this.user } }));
        } else if (newState === this.states.UNAUTHENTICATED) {
            window.dispatchEvent(new CustomEvent('auth:unauthenticated'));
        }
    }

    /**
     * Clear only local auth data
     */
    clearLocalState() {
        if (window.storage) window.storage.clearRoleSessions();
        this.user = null;
        this.setState(this.states.UNAUTHENTICATED);
    }

    /**
     * Hard Reset Storage & State — wipes ALL known cross-role session keys
     */
    clearSession() {
        // Wipe all cross-role keys (not just current role)
        const ALL_SESSION_KEYS = [
            'admin_user', 'admin_auth_token',
            'client_user', 'client_auth_token',
            'user', 'auth_token',
            'login_timestamp', 'redirect_after_login', 'export_visible'
        ];
        ALL_SESSION_KEYS.forEach(key => {
            try { localStorage.removeItem(key); } catch (e) {}
        });
        this.user = null;
        this.setState(this.states.UNAUTHENTICATED);

        // Force Google SDK reset
        if (typeof google !== 'undefined') {
            google.accounts.id.disableAutoSelect();
        }
    }

    /**
     * Initialize Google SDK
     * @param {string} clientId 
     * @param {string} containerId 
     */
    initGoogle(clientId, containerId = 'googleSignInContainer') {
        if (!clientId) {
            return;
        }

        try {
            // Check if we should even initialize Google here
            const role = this.getPortalIntent();
            // Optional: If you want to completely disable Google for certain roles at the controller level
            // if (role === 'admin' || role === 'client') return;

            google.accounts.id.initialize({
                client_id: clientId,
                callback: (res) => this.handleGoogleResponse(res),
                auto_select: false,
                use_fedcm_for_prompt: false,
                prompt_parent_id: containerId !== 'none' ? containerId : null,
                cancel_on_tap_outside: true,
                itp_support: true
            });

            this.googleInitialized = true;
            
            // Only render/prompt if container is provided and not 'none'
            if (containerId !== 'none') {
                this.renderGoogleButton(containerId);
            } else {
                // If initialized with 'none', check if loginModal is currently displayed.
                // If so, render the button now that Google SDK is ready.
                const loginModal = document.getElementById('loginModal');
                if (loginModal && (loginModal.style.display === 'flex' || loginModal.classList.contains('show'))) {
                    this.renderGoogleButton('googleSignInContainer');
                }
            }
        } catch (error) {
            this.setState(this.states.ERROR);
        }
    }

    /**
     * Render Google Sign-In Button
     */
    renderGoogleButton(containerId) {
        const container = document.getElementById(containerId);
        if (!container && containerId !== 'none') {
            this.showButtonFallback(containerId);
            return;
        }
        if (!this.googleInitialized) {
            return;
        }

        if (containerId === 'none') {
            return;
        }

        try {
            const computedStyle = window.getComputedStyle(container);
            // Debugging container visibility
            console.debug('Google Button Container Visibility:', {
                display: computedStyle.display,
                visibility: computedStyle.visibility,
                opacity: computedStyle.opacity,
                width: container.offsetWidth,
                height: container.offsetHeight
            });
            
            // Clear any existing content EXCEPT if it contains rendered content already
            const hasExistingButton = container.querySelector('[data-testid="button"]') || container.querySelector('.gis-button');
            if (!hasExistingButton) {
                container.innerHTML = '';
            }
            
            
            // Render the button with error handling
            try {
                google.accounts.id.renderButton(container, {
                    type: 'standard',
                    theme: 'outline',
                    size: 'large',
                    text: 'signin_with',
                    shape: 'rectangular',
                    logo_alignment: 'left'
                });
                
                // Verify the button was actually rendered
                let renderAttempt = 0;
                const verifyRender = setInterval(() => {
                    renderAttempt++;
                    const hasButton = container.querySelector('button') !== null;
                    const hasIframe = container.querySelector('iframe') !== null;
                    
                    if (hasButton || hasIframe) {
                        clearInterval(verifyRender);
                    } else if (renderAttempt > 10) {
                        clearInterval(verifyRender);
                        this.showButtonFallback(containerId);
                    }
                }, 50);
            } catch (renderError) {
                this.showButtonFallback(containerId);
            }
        } catch (error) {
            this.showButtonFallback(containerId);
        }
    }

    /**
     * Show fallback message if Google button fails
     */
    showButtonFallback(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        container.innerHTML = `
            <div style="padding: 12px; background: rgba(255,255,255,0.05); border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); text-align: center;">
                <p style="color: #666; font-size: 0.9rem; margin: 0;">Sign in service temporarily unavailable</p>
            </div>
        `;
    }

    /**
     * Trigger Google Login Prompt manually
     */
    async handleGoogleLoginManual() {
        if (!this.googleInitialized) {
            // Wait up to 5 seconds for initialization
            let attempts = 0;
            while (!this.googleInitialized && attempts < 25) {
                await new Promise(r => setTimeout(r, 200));
                attempts++;
            }
            
            if (!this.googleInitialized) {
                // If not initialized yet, try a quick config fetch and initialization
                try {
                    const response = await apiFetch("/api/config/get-google-config.php");
                    const data = await response.json();
                    if (data.success && data.client_id) {
                        this.initGoogle(data.client_id, 'googleSignInContainer');
                    }
                } catch (err) {}

                if (!this.googleInitialized) {
                    const role = this.getPortalIntent();
                    if (role === 'user') {
                        showNotification('Google Sign-In is taking longer than expected. Please refresh or try another method.', 'info');
                    }
                    return;
                }
            }
        }
        
        try {
            const container = document.getElementById('googleSignInContainer');
            // If the official Google iframe button is not rendered yet, render it now
            if (container && !container.querySelector('iframe') && !container.querySelector('[data-testid="button"]') && !container.querySelector('.gis-button')) {
                this.renderGoogleButton('googleSignInContainer');
            }

            // Trigger Google One Tap prompt programmatically as a highly reliable fallback/alternative display method
            if (typeof google !== 'undefined' && google?.accounts?.id) {
                google.accounts.id.prompt((notification) => {
                    if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
                        console.debug('One Tap not displayed:', notification.getNotDisplayedReason() || notification.getSkippedReason());
                    }
                });
            }

            // Guide the user to click the official rendered button
            setTimeout(() => {
                const refreshedContainer = document.getElementById('googleSignInContainer');
                if (refreshedContainer && (refreshedContainer.querySelector('iframe') || refreshedContainer.querySelector('[data-testid="button"]') || refreshedContainer.querySelector('.gis-button'))) {
                    showNotification('Please click the official "Sign in with Google" button.', 'info');
                } else {
                    showNotification('Google Sign-In is initializing. Please try again.', 'info');
                }
            }, 100);
        } catch (e) {
            console.error('Google manual login error:', e);
        }
    }

    /**
     * Handle Google Credential Response
     */
    async handleGoogleResponse(response) {
        if (this.isRedirecting) return;
        
        this.setState(this.states.AUTHENTICATING);
        
        showNotification('Verifying with Google...', 'info');

        // Find the container - could be googleSignInContainer or googleContainer
        let container = document.getElementById('googleSignInContainer') || document.getElementById('googleContainer');
        if (container) {
            container.innerHTML = `
                <div class="auth-loading-spinner" style="display: flex; align-items: center; justify-content: center; padding: 10px; background: rgba(255,255,255,0.05); border-radius: 8px;">
                    <span class="spinner" style="margin-right: 10px; width: 20px; height: 20px; border: 2px solid rgba(255,255,255,0.3); border-top-color: #fff; border-radius: 50%; animation: spin 0.8s linear infinite;"></span>
                    <span style="color: white; font-size: 0.9rem;">Authenticating...</span>
                </div>
            `;
        }

        try {
            const basePath = getBasePath();
            const role = this.getPortalIntent();
            const endpoint = `${basePath}api/${role}/auth/google-login.php`;
            
            const res = await apiFetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    credential: response.credential,
                    client_id: google.accounts.id.client_id // Useful for verification if needed
                }),
                cache: 'no-store'
            });

            const result = await res.json();

            if (result.success) {
                this.user = result.user;
                if (window.storage) window.storage.setUser(result.user);
                this.setState(this.states.AUTHENTICATED);
                
                showNotification('Welcome to Eventra!', 'success');
                
                this.isRedirecting = true;
                setTimeout(() => {
                    this.handleRedirect(result.redirect);
                }, 1500);
            } else {
                throw new Error(result.message || 'Authentication failed');
            }
        } catch (error) {
            showNotification(error.message, 'error');
            this.setState(this.states.ERROR);
            
            setTimeout(() => {
                this.syncSession();
                // Re-render button only if it's the standard container (not 'none')
                const containerId = document.getElementById('googleSignInContainer') ? 'googleSignInContainer' : 'googleContainer';
                if (document.getElementById(containerId)) {
                    // Check if we are in manual mode for homepage
                    const isManual = window.location.pathname.includes('index.html');
                    if (!isManual) {
                        this.renderGoogleButton(containerId);
                    }
                }
            }, 2000);
        }
    }

    /**
     * Helper to get portal intent
     */
    getPortalIntent() {
        const path = window.location.pathname;
        if (path.includes('/admin/')) return 'admin';
        if (path.includes('/client/')) return 'client';
        return 'user';
    }

    /**
     * Unified Redirect Handler
     */
    handleRedirect(target) {
        const basePath = getBasePath();
        
        // 1. Resolve Default Target if not provided
        if (!target) {
            const role = this.user ? this.user.role : 'user';
            if (role === 'admin') target = '/admin/pages/adminDashboard.html';
            else if (role === 'client') target = '/client/pages/clientDashboard.html';
            else target = '/public/pages/index.html';
        }

        // 2. Priority: redirect_after_login (if deep/specific)
        let pending = window.storage ? window.storage.get('redirect_after_login') : null;
        
        // Sanitize pending redirect - ignore if it's just the homepage/root and we have a specific dashboard target
        if (pending) {
            const isWeakRedirect = pending.endsWith('/') || pending.endsWith('index.html') || pending.includes('?trigger=login');
            const targetIsDashboard = target && target.includes('Dashboard.html');
            
            // Check if there is a role mismatch in the pending redirect
            const isPendingAdmin = pending.includes('/admin/');
            const isPendingClient = pending.includes('/client/');
            const isPendingPayment = pending.includes('checkout.html') || pending.includes('payment.html');
            const userRole = this.user ? this.user.role : 'user';
            
            const roleMismatch = (isPendingAdmin && userRole !== 'admin') || (isPendingClient && userRole !== 'client');
            const forceDashboard = (userRole === 'client' && isPendingPayment);
            
            if ((isWeakRedirect && targetIsDashboard) || roleMismatch || forceDashboard) {
                pending = null;
                if (window.storage) window.storage.remove('redirect_after_login');
            }
        }

        if (pending) {
            if (window.storage) window.storage.remove('redirect_after_login');
            window.location.href = pending;
            return;
        }

        // 3. Final URL Resolution
        // Normalize: remove leading slash to prevent double slash with basePath
        const normalizedTarget = target.replace(/^\//, '');
        const finalUrl = target.includes('://') ? target : basePath + normalizedTarget;
        
        window.location.href = finalUrl;
    }

    /**
     * Unified Logout
     */
    async logout(shouldRedirect = true) {
        try {
            const role = this.getPortalIntent();
            await apiFetch('/api/auth/logout.php', { method: 'POST' });
        } catch (e) {}

        this.clearSession();
        
        if (shouldRedirect) {
            const role = this.getPortalIntent();
            const origin = window.location.origin;
            if (role === 'admin') {
                window.location.href = origin + '/admin/pages/adminLogin.html';
            } else if (role === 'client') {
                window.location.href = origin + '/client/pages/clientLogin.html';
            } else {
                window.location.href = origin + '/public/pages/index.html?trigger=login';
            }
        }
    }

}

// Global Singleton
window.authController = new AuthController();

// Auto-initialize: begin server-side session handshake immediately.
// auth-guard.js awaits authController.ready — this ensures it always resolves.
window.authController.init();
