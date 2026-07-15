/**
 * Global State Manager
 * Centralized state management for user data, profile pictures, and UI state
 * Ensures consistent state across all pages and components
 */

class StateManager {
    constructor() {
        this.state = {
            user: null,
            profilePicture: null,
            exportVisible: true,
            notificationCount: 0,
            events: []
        };
        this.listeners = [];
        this.initialized = false;
    }

    /**
     * Initialize the state manager
     * Loads user data from storage and API
     */
    async initialize() {
        if (this.initialized) return;

        // Load from storage first (Profile pic from session, export from local)
        const storedUser = storage.get('client_user') || storage.get('user');
        const sessionProfilePic = sessionStorage.getItem('profile_picture');
        const storedExportState = localStorage.getItem('export_visible');

        if (storedUser) {
            this.state.user = storedUser;
            this.state.profilePicture = sessionProfilePic || storedUser.profile_pic || null;
        }

        if (storedExportState !== null) {
            this.state.exportVisible = JSON.parse(storedExportState);
        }

        // Fetch fresh data from API
        try {
            const response = await apiFetch('/api/users/get-profile.php');
            const result = await response.json();

            if (result.success && result.user) {
                const profilePic = result.user.profile_pic || result.user.profile_picture || null;
                
                // If we don't have a session-locked pic, lock it now
                if (!sessionProfilePic && profilePic) {
                    sessionStorage.setItem('profile_picture', profilePic);
                }

                this.setState({
                    user: result.user,
                    profilePicture: sessionStorage.getItem('profile_picture') || profilePic
                });
                
                // Update localStorage
                storage.set('client_user', result.user);
            }
        } catch (error) {
        }

        this.initialized = true;
        this.notifyListeners();
    }

    /**
     * Get current user data
     */
    getUser() {
        return this.state.user;
    }

    /**
     * Get profile picture URL (Locks to sessionStorage)
     */
    getProfilePic() {
        return sessionStorage.getItem('profile_picture') || this.state.profilePicture || '';
    }

    /**
     * Get user name
     */
    getUserName() {
        return this.state.user?.name || this.state.user?.full_name || 'User';
    }

    /**
     * Get user email
     */
    getUserEmail() {
        return this.state.user?.email || '';
    }

    /**
     * Check if export should be visible
     */
    isExportVisible() {
        return this.state.exportVisible;
    }

    /**
     * Set export visibility (Persists to localStorage)
     */
    setExportVisible(visible) {
        localStorage.setItem('export_visible', JSON.stringify(visible));
        this.setState({ exportVisible: visible });
        this.updateExportButtonUI();
    }

    /**
     * Update the global export button UI based on state
     */
    updateExportButtonUI() {
        const exportBtn = document.getElementById('globalExportBtn');
        if (exportBtn) {
            exportBtn.style.display = this.state.exportVisible ? 'block' : 'none';
        }
    }

    /**
     * Get notification count
     */
    getNotificationCount() {
        return this.state.notificationCount;
    }

    /**
     * Set notification count
     */
    setNotificationCount(count) {
        this.setState({ notificationCount: count });
    }

    /**
     * Update state and notify listeners
     */
    setState(updates) {
        this.state = { ...this.state, ...updates };
        this.notifyListeners();
    }

    /**
     * Subscribe to state changes
     */
    subscribe(listener) {
        this.listeners.push(listener);
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }

    /**
     * Notify all listeners of state changes
     */
    notifyListeners() {
        this.listeners.forEach(listener => {
            try {
                listener(this.state);
            } catch (error) {
            }
        });
    }

    /**
     * Update all profile pictures on the page
     */
    updateProfilePictures() {
        const profilePic = this.getProfilePic();
        const user = this.getUser();
        if (!profilePic || !user) return;
        
        const isVerified = parseInt(user.nin_verified) === 1 && parseInt(user.bvn_verified) === 1;

        // Update all user avatar elements
        document.querySelectorAll('.user-avatar, .user-avatar-display').forEach(avatar => {
            avatar.style.backgroundImage = `url('${profilePic}')`;
            avatar.style.backgroundSize = 'cover';
            avatar.style.backgroundPosition = 'center';
            avatar.title = 'User Profile';
            avatar.style.position = 'relative';

            // Remove any lingering badge overlays
            avatar.querySelectorAll('.verification-badge-overlay').forEach(b => b.remove());
        });

        // Update large profile avatars
        document.querySelectorAll('.profile-avatar-large, .profile-avatar-main').forEach(avatar => {
            if (avatar.tagName === 'IMG') {
                avatar.src = profilePic;
            } else {
                avatar.style.backgroundImage = `url('${profilePic}')`;
                avatar.style.backgroundSize = 'cover';
                avatar.style.backgroundPosition = 'center';
            }
        });
    }

    /**
     * Update all user name displays
     */
    updateUserNames() {
        const userName = this.getUserName();
        
        document.querySelectorAll('.user-name-display').forEach(element => {
            element.textContent = userName;
        });
    }

    /**
     * Get the current state object (Read-only recommended)
     */
    getState() {
        return this.state;
    }

    /**
     * Clear all state (for logout)
     */
    clear() {
        this.state = {
            user: null,
            profilePicture: null,
            exportVisible: true,
            notificationCount: 0,
            events: []
        };
        sessionStorage.removeItem('profile_picture');
        localStorage.removeItem('export_visible');
        this.initialized = false;
        this.notifyListeners();
    }
}

// Create global instance
window.stateManager = new StateManager();

// Auto-initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
    await window.stateManager.initialize();
    
    // Update UI elements
    window.stateManager.updateProfilePictures();
    window.stateManager.updateUserNames();
    window.stateManager.updateExportButtonUI();
    
    // Subscribe to state changes to keep UI in sync
    window.stateManager.subscribe((state) => {
        window.stateManager.updateProfilePictures();
        window.stateManager.updateUserNames();
        window.stateManager.updateExportButtonUI();
    });
});
