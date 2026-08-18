// Admin Authentication and Profile Management
class AdminAuth {
    constructor() {
        this.adminData = null;
        this.profilePicCache = null;
    }

    async loadAdminProfile() {
        try {
            // Check if we already have modern admin data in storage
            const storedUser = typeof storage !== 'undefined' ? storage.getUser() : null;
            if (storedUser && storedUser.role === 'admin') {
                this.adminData = storedUser;
                this.updateProfileUI();
            }

            // If auth controller is already synced, we can skip the dedicated fetch
            if (window.authController && window.authController.settled && window.authController.state === 'authenticated') {
                return this.adminData;
            }

            const response = await apiFetch('/api/admin/get-profile.php', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            const result = await response.json();
            
            if (result.success) {
                this.adminData = result.admin || result.user; // Support both keys
                if (typeof storage !== 'undefined') storage.setUser(this.adminData);
                this.updateProfileUI();
                return this.adminData;
            } else {
                return null;
            }
        } catch (error) {
            return null;
        }
    }

    updateProfileUI() {
        if (!this.adminData) return;

        // Update header avatar with profile picture from database or default admin avatar
        const headerAvatar = document.querySelector('.user-avatar-display, .user-avatar');
        if (headerAvatar) {
            const profilePic = getProfileImg(this.adminData.profile_pic, this.adminData.name);
            headerAvatar.setAttribute('data-profile-sync', 'true');
            headerAvatar.style.backgroundImage = `url(${profilePic})`;
            headerAvatar.style.backgroundSize = 'cover';
            headerAvatar.style.backgroundPosition = 'center';
            if (headerAvatar.tagName === 'IMG') {
                headerAvatar.src = profilePic;
            }
        }

        // Update header name display
        const headerName = document.querySelector('.user-name-display');
        if (headerName) {
            headerName.textContent = this.adminData.name;
        }

        // Update profile drawer
        this.updateProfileDrawer();
    }

    updateProfileDrawer() {
        if (!this.adminData) return;

        const profileDrawer = document.getElementById('profileDrawer');
        if (!profileDrawer) return;

        // Update profile drawer header
        const drawerTitle = profileDrawer.querySelector('.drawer-header h2');
        if (drawerTitle) {
            drawerTitle.textContent = 'Admin Profile';
        }

        // Update profile avatar in drawer with database profile_pic or default admin avatar
        const profileAvatar = profileDrawer.querySelector('.profile-avatar-large');
        if (profileAvatar) {
            const profilePic = getProfileImg(this.adminData.profile_pic, this.adminData.name);
            profileAvatar.setAttribute('data-profile-sync', 'true');
            profileAvatar.style.backgroundImage = `url(${profilePic})`;
            profileAvatar.style.backgroundSize = 'cover';
            profileAvatar.style.backgroundPosition = 'center';
            // Also set as img src if it's an img element
            if (profileAvatar.tagName === 'IMG') {
                profileAvatar.src = profilePic;
            }
        }

        // Update or create profile main info
        let profileMainInfo = profileDrawer.querySelector('.profile-main-info');
        if (!profileMainInfo) {
            profileMainInfo = document.createElement('div');
            profileMainInfo.className = 'profile-main-info';
            const avatarWrapper = profileDrawer.querySelector('.profile-avatar-wrapper');
            if (avatarWrapper) {
                avatarWrapper.after(profileMainInfo);
            }
        }

        profileMainInfo.innerHTML = `
            <h3 class="profile-name">${escapeHTML(this.adminData.name)}</h3>
            <p class="profile-email">${escapeHTML(this.adminData.email)}</p>
        `;

        // Update or create profile details
        let profileDetails = profileDrawer.querySelector('.profile-details-list');
        if (!profileDetails) {
            profileDetails = document.createElement('div');
            profileDetails.className = 'profile-details-list';
            profileMainInfo.after(profileDetails);
        }

        const createdDate = new Date(this.adminData.created_at).toLocaleDateString();
        const updatedDate = new Date(this.adminData.updated_at).toLocaleDateString();

        profileDetails.innerHTML = `
            <div class="profile-detail-item">
                <span class="detail-label">Role</span>
                <span class="detail-value">Administrator</span>
            </div>
            <div class="profile-detail-item">
                <span class="detail-label">Status</span>
                <span class="detail-value" style="color: #10b981; font-weight: 700;">${escapeHTML(this.adminData.status === 'active' ? 'Active' : 'Offline')}</span>
            </div>
            <div class="profile-detail-item">
                <span class="detail-label">Account Created</span>
                <span class="detail-value">${createdDate}</span>
            </div>
            <div class="profile-detail-item">
                <span class="detail-label">Last Login</span>
                <span class="detail-value">${this.adminData.last_login_at ? new Date(this.adminData.last_login_at).toLocaleString() : 'Just now'}</span>
            </div>

            <button class="btn btn-logout-drawer" id="profileDrawerLogout" style="margin-top: 2rem; width: 100%; justify-content: center; gap: 10px; color: white; background: #ef4444; border-radius: 12px; padding: 1rem;">
                <i data-lucide="log-out"></i>
                <span>Logout</span>
            </button>
        `;


        if (window.lucide) {
            window.lucide.createIcons();
        }
    }


    async handleLogout() {
        // Full cross-role localStorage wipe
        const ALL_SESSION_KEYS = [
            'admin_user', 'admin_auth_token',
            'client_user', 'client_auth_token',
            'user', 'auth_token',
            'login_timestamp', 'redirect_after_login', 'export_visible'
        ];
        ALL_SESSION_KEYS.forEach(key => {
            try { localStorage.removeItem(key); } catch (e) {}
        });
        // Full sessionStorage wipe
        try { sessionStorage.clear(); } catch (e) {}

        // Clear authController in-memory state
        if (window.authController && typeof window.authController.clearSession === 'function') {
            window.authController.clearSession();
        }

        try {
            await apiFetch('/api/auth/logout.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
        } catch (error) {
            // Proceed regardless
        }

        // Show success message
        if (window.toast) {
            window.toast.success('Logged out successfully');
        }

        setTimeout(() => {
            window.location.href = '../../admin/pages/adminLogin.html';
        }, 500);
    }
}

// Create global instance
window.adminAuth = new AdminAuth();

// Listen for unified auth sync
document.addEventListener('auth:sync', (e) => {
    if (e.detail.success && e.detail.user && e.detail.user.role === 'admin') {
        window.adminAuth.adminData = e.detail.user;
        window.adminAuth.updateProfileUI();
    }
});
