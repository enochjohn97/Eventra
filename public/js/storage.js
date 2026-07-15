/**
 * Local Storage Utility
 * Simple wrapper for localStorage with JSON support
 */

if (typeof window.storage === 'undefined' || !window.storage) {
    window.storage = {
        set: function(key, value) {
            try {
                localStorage.setItem(key, JSON.stringify(value));
                return true;
            } catch (error) {
                return false;
            }
        },

        get: function(key) {
            try {
                const item = localStorage.getItem(key);
                if (!item) return null;
                try {
                    return JSON.parse(item);
                } catch (e) {
                    // If it's not JSON, return the raw value (e.g., "mock-token")
                    return item;
                }
            } catch (error) {
                return null;
            }
        },

        remove: function(key) {
            try {
                localStorage.removeItem(key);
                return true;
            } catch (error) {
                return false;
            }
        },

        clear: function() {
            try {
                const keys = this.getRoleKeys();
                this.remove(keys.user);
                this.remove(keys.token);
                this.remove('redirect_after_login');
                return true;
            } catch (error) {
                return false;
            }
        },

        getRoleKeys: function() {
            const currentPath = window.location.pathname;
            if (currentPath.includes('/admin/')) {
                return { user: 'admin_user', token: 'admin_auth_token' };
            } else if (currentPath.includes('/client/')) {
                return { user: 'client_user', token: 'client_auth_token' };
            }
            return { user: 'user', token: 'auth_token' };
        },

        getUser: function() {
            const keys = this.getRoleKeys();
            return this.get(keys.user);
        },

        setUser: function(userData) {
            const keys = this.getRoleKeys();
            if (userData && userData.token) {
                this.set(keys.token, userData.token);
            }
            // Stamp login time so auth-controller can trust local auth within 1-hour window
            localStorage.setItem('login_timestamp', Date.now().toString());
            return this.set(keys.user, userData);
        },

        getToken: function() {
            const keys = this.getRoleKeys();
            return this.get(keys.token);
        },

        setToken: function(token) {
            const keys = this.getRoleKeys();
            return this.set(keys.token, token);
        },

        clearRoleSessions: function() {
             const keys = this.getRoleKeys();
             this.remove(keys.user);
             this.remove(keys.token);
             localStorage.removeItem('login_timestamp');
        }
    };
}

// Global helper for role-specific keys (backward-compatible shorthand)
if (typeof getRoleKeys === 'undefined') {
    window.getRoleKeys = function() {
        return window.storage.getRoleKeys();
    };
}

// Global alias: expose storage to global scope so existing code using bare `storage.` works
// This bridges old code patterns with the unified window.storage singleton.
var storage = window.storage;
