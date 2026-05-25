/**
 * Shared Client JavaScript
 * Common functionality across all client pages
 */

// Track all active interval IDs to clear on logout
(function() {
    const activeIntervals = new Set();
    const originalSetInterval = window.setInterval;
    const originalClearInterval = window.clearInterval;

    window.setInterval = function(func, delay, ...args) {
        // Prevent annoying and disruptive page auto-reload intervals
        const funcStr = String(func);
        if (funcStr.includes('location.reload') && delay === 60000) {
            console.log("Suppressed disruptive page auto-reload interval.");
            return null; // Skip setting this interval
        }
        const id = originalSetInterval(func, delay, ...args);
        activeIntervals.add(id);
        return id;
    };

    window.clearInterval = function(id) {
        activeIntervals.delete(id);
        originalClearInterval(id);
    };

    window.clearAllIntervals = function() {
        activeIntervals.forEach(id => originalClearInterval(id));
        activeIntervals.clear();
        console.log("All running background interval instances successfully cleared on logout.");
    };
})();

// Initialize logout functionality
document.addEventListener("DOMContentLoaded", () => {
  initLogout();
  // initNotifications(); // Handled by drawer-system.js
  initProfileClick();
  loadGlobalProfile();
  initInactivityMonitor();
});

function initInactivityMonitor() {
    const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 mins
    const WARNING_TIME = 28 * 60 * 1000; // 28 mins
    let inactivityTimer;
    let warningTimer;
    let isWarningShown = false;

    function resetTimers() {
        if (isWarningShown) return;
        
        clearTimeout(inactivityTimer);
        clearTimeout(warningTimer);

        warningTimer = setTimeout(showWarning, WARNING_TIME);
        inactivityTimer = setTimeout(() => {
            if (window.logout) window.logout();
            else window.location.href = '../../client/pages/clientLogin.html';
        }, SESSION_TIMEOUT);
    }

    function showWarning() {
        if (isWarningShown) return;
        isWarningShown = true;
        
        let timeLeft = 120; // 2 minutes
        
        Swal.fire({
            title: 'Session Expiring Soon',
            html: `You will be logged out in <strong style="color: #ef4444; font-size: 1.2rem;">${timeLeft}</strong> seconds due to inactivity.`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#10b981',
            cancelButtonColor: '#ef4444',
            confirmButtonText: 'Stay Logged In',
            cancelButtonText: 'Log Out Now',
            allowOutsideClick: false,
            allowEscapeKey: false,
            didOpen: () => {
                const timerElement = Swal.getHtmlContainer().querySelector('strong');
                const countdown = setInterval(() => {
                    timeLeft--;
                    if (timerElement) timerElement.textContent = timeLeft;
                    if (timeLeft <= 0) {
                        clearInterval(countdown);
                        Swal.close();
                        if (window.logout) window.logout();
                    }
                }, 1000);
                Swal.getPopup().dataset.intervalId = countdown;
            },
            willClose: () => {
                const countdown = Swal.getPopup().dataset.intervalId;
                if (countdown) clearInterval(countdown);
            }
        }).then((result) => {
            isWarningShown = false;
            if (result.isConfirmed) {
                // Heartbeat API will refresh PHP session timestamp
                if (typeof apiFetch !== 'undefined') {
                    apiFetch('/api/heartbeat.php').then(() => resetTimers());
                } else {
                    fetch('/api/heartbeat.php').then(() => resetTimers());
                }
            } else if (result.dismiss === Swal.DismissReason.cancel) {
                if (window.logout) window.logout();
            }
        });
    }

    ['mousedown', 'keydown', 'scroll', 'touchstart'].forEach(evt => {
        window.addEventListener(evt, resetTimers, { passive: true });
    });

    resetTimers();
}

/**
 * Loads the user profile globally to update header avatar
 */
async function loadGlobalProfile() {
    try {
        const user = storage.getUser();
        if (user) {
            updateGlobalAvatar(user);
            updateClientNameDisplay(user);
            syncVerificationBanner(user);
        }

        // If auth controller is already synced, we don't need to fetch again immediately
        if (window.authController && window.authController.settled && window.authController.state === 'authenticated') {
            return;
        }

        // Fetch fresh data if not settled or on explicit request
        const response = await apiFetch('/api/users/get-profile.php');
        const result = await response.json();

        if (result.success) {
            storage.setUser(result.user);
            updateGlobalAvatar(result.user);
            updateClientNameDisplay(result.user);
            syncVerificationBanner(result.user);
        }
    } catch (error) {
    }
}

// Listen for auth sync to update profile
document.addEventListener('auth:sync', (e) => {
    if (e.detail.success && e.detail.user) {
        updateGlobalAvatar(e.detail.user);
        updateClientNameDisplay(e.detail.user);
        syncVerificationBanner(e.detail.user);
    }
});

function updateGlobalAvatar(user) {
    const avatars = document.querySelectorAll('.user-avatar');
    avatars.forEach(avatar => {
        // Ensure parent has avatar-wrapper class for absolute positioning of badge
        const parent = avatar.parentElement;
        if (parent && !parent.classList.contains('avatar-wrapper')) {
            parent.classList.add('avatar-wrapper');
        }

        const name = user.name || user.business_name || 'User';
        const profileUrl = typeof getProfileImg === 'function' 
            ? getProfileImg(user.profile_pic, name)
            : (user.profile_pic || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(name));
            
        avatar.style.backgroundImage = `url(${profileUrl})`;
        avatar.style.backgroundSize = 'cover';
        avatar.style.backgroundPosition = 'center';

        // Add/Update Verification Badge
        if (parent && typeof getVerificationBadge === 'function') {
            const existingBadge = parent.querySelector('.verification-badge');
            if (existingBadge) existingBadge.remove();
            parent.insertAdjacentHTML('beforeend', getVerificationBadge(user.verification_status));
            // Re-init icons
            if (window.lucide) window.lucide.createIcons();
        }
    });
}

/**
 * Global logout function
 * Clears all storage, stops polling, and redirects to login
 */
async function logout() {
    const result = await Swal.fire({
        title: 'Are you sure?',
        text: "You will be logged out of your session!",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#9ca3af',
        confirmButtonText: 'Yes, logout!'
    });

    if (!result.isConfirmed) {
        return;
    }

    // Purge all active intervals
    if (typeof window.clearAllIntervals === 'function') {
        window.clearAllIntervals();
    }

    try {
        // Call server-side logout
        await apiFetch('/api/auth/logout.php');

        // Stop notification polling
        if (window.notificationManager) {
            window.notificationManager.stopPolling();
        }

        // Clear ONLY role-specific storage
        const keys = storage.getRoleKeys();
        storage.remove(keys.user);
        storage.remove(keys.token);
        sessionStorage.clear();

        // Hard redirect to login
        const loginPage = keys.user === 'admin_user' ? '../../admin/pages/adminLogin.html' : '../../client/pages/clientLogin.html';
        window.location.href = loginPage;
    } catch (error) {
        // Clean up and redirect anyway
        const keys = storage.getRoleKeys();
        storage.remove(keys.user);
        storage.remove(keys.token);
        const loginPage = keys.user === 'admin_user' ? '../../admin/pages/adminLogin.html' : '../../client/pages/clientLogin.html';
        window.location.href = loginPage;
    }
}

// Make logout globally accessible
window.logout = logout;

function initLogout() {
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            logout();
        });
    }

    // Also attach to any logout links
    document.querySelectorAll('.logout-link, [href*="logout"]').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            logout();
        });
    });

    // Specific listeners if needed (e.g. ID-based)
    if (logoutBtn) {
        logoutBtn.onclick = (e) => {
            e.preventDefault();
            logout();
        };
    }
}

    // Delete Account Listener
    const deleteAccountBtn = document.getElementById('deleteAccountBtn');
    if (deleteAccountBtn) {
        deleteAccountBtn.addEventListener('click', async () => {
            const result = await Swal.fire({
                title: 'Delete Your Account?',
                text: 'This action is PERMANENT. All your events, media, and data will be erased forever.',
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#ef4444',
                cancelButtonColor: '#64748b',
                confirmButtonText: 'Yes, Delete Everything',
                cancelButtonText: 'Cancel'
            });

            if (result.isConfirmed) {
                try {
                    const response = await apiFetch('/api/clients/delete-profile.php', {
                        method: 'DELETE'
                    });
                    const data = await response.json();
                    if (data.success) {
                        Swal.fire('Deleted', 'Your account has been successfully removed.', 'success').then(() => {
                            window.location.href = '../../client/pages/clientLogin.html';
                        });
                    } else {
                        Swal.fire('Error', data.message || 'Deletion failed', 'error');
                    }
                } catch (e) {
                    Swal.fire('Error', 'An unexpected error occurred.', 'error');
                }
            }
        });
    }

    // Centralized Global Listeners (Export, Notifications, Profile)
    const globalExportBtn = document.getElementById('globalExportBtn');
    if (globalExportBtn) {
        globalExportBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (typeof showExportModal === 'function') {
                showExportModal('Data');
            } else {
                Swal.fire('Error', 'Export system is not loaded properly.', 'error');
            }
        });
    }



function initProfileClick() {
    // Make user avatar clickable to open profile modal
    const userAvatar = document.querySelector('.user-avatar');
    if (userAvatar) {
        userAvatar.style.cursor = 'pointer';
        userAvatar.title = 'Click to edit profile';
        userAvatar.addEventListener('click', () => {
            if (typeof showProfileEditModal === 'function') {
                showProfileEditModal();
            }
        });
    }
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

window.copyToClipboard = function(text, successMsg) {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
        if (typeof showNotification === 'function') {
            showNotification(successMsg, 'success');
        } else {
            Swal.fire({
                toast: true,
                position: 'top-end',
                icon: 'success',
                title: successMsg,
                showConfirmButton: false,
                timer: 2000
            });
        }
    }).catch(err => {
        Swal.fire('Error', 'Failed to copy to clipboard', 'error');
    });
};

/**
 * Updates any elements showing the client name to avoid "undefined"
 */
function updateClientNameDisplay(user) {
    if (!user) return;
    const name = user.name || user.business_name || 'Client';
    
    // Update elements with class 'client-name' or 'profile-name'
    document.querySelectorAll('.client-name, #profileName').forEach(el => {
        el.textContent = name;
    });

    // Update greeting if it exists
    const greeting = document.querySelector('.greeting-text');
    if (greeting) {
        greeting.textContent = `Welcome, ${name}`;
    }
}
window.updateClientNameDisplay = updateClientNameDisplay;

function syncVerificationBanner(user) {
    const banner = document.getElementById('verificationBanner');
    const createBtn = document.getElementById('dashboardCreateEventBtn');
    if (!banner) return;

    const status = user.verification_status; // 'pending', 'verified', 'rejected'

    if (status === 'verified') {
        banner.style.display = 'none';
        if (createBtn) {
            createBtn.disabled = false;
            createBtn.style.opacity = '1';
            createBtn.style.cursor = 'pointer';
            createBtn.style.filter = 'none';
            createBtn.title = 'Create a new event';
        }
        return;
    }

    // Messaging and Styling
    const isRejected = (status === 'rejected');
    const message = isRejected
        ? '<strong>Account Rejected:</strong> Please update your profile with valid details and resubmit for review. <a href="javascript:void(0)" onclick="window.showProfileEditModal()" style="color:inherit; text-decoration:underline; font-weight:800; margin-left:10px;">Fix Profile</a>'
        : '<strong>Account Pending:</strong> Your profile is currently under review. Event creation will be enabled once approved. <a href="javascript:void(0)" onclick="window.showProfileEditModal()" style="color:inherit; text-decoration:underline; font-weight:800; margin-left:10px;">Review Profile</a>';

    banner.style.background = isRejected ? '#fee2e2' : '#fff3cd';
    banner.style.border = `1px solid ${isRejected ? '#fca5a5' : '#ffeeba'}`;
    banner.style.color = isRejected ? '#991b1b' : '#856404';

    const textEl = document.getElementById('verificationBannerText');
    if (textEl) textEl.innerHTML = message;

    banner.style.display = 'block';

    // Gate the create button
    if (createBtn) {
        createBtn.disabled = true;
        createBtn.style.opacity = '0.5';
        createBtn.style.cursor = 'not-allowed';
        createBtn.style.filter = 'grayscale(1)';
        createBtn.title = isRejected ? 'Fix your profile to re-apply' : 'Awaiting admin approval';
    }
}
window.syncVerificationBanner = syncVerificationBanner;

function handleCreateEventClick() {
    // Single gate for account verification
    const user = storage.getUser();
    if (!user) return;

    if (user.verification_status !== 'verified') {
        Swal.fire({
            title: 'Account Not Approved',
            html: user.verification_status === 'rejected'
                ? '<strong>Your account was rejected.</strong><br>Please update your profile and resubmit for administrator review before creating events.'
                : '<strong>Your account is pending approval.</strong><br>You cannot create events until an administrator approves your profile.',
            icon: 'warning',
            confirmButtonColor: '#722f37',
            confirmButtonText: 'Update My Profile',
            showCancelButton: true,
            cancelButtonText: 'Close',
            cancelButtonColor: '#9ca3af'
        }).then((result) => {
            if (result.isConfirmed && typeof window.showProfileEditModal === 'function') {
                window.showProfileEditModal();
            }
        });
        return;
    }

    if (typeof window.showCreateEventModal === 'function') {
        window.showCreateEventModal();
    }
}
window.handleCreateEventClick = handleCreateEventClick;

/**
 * Mobile Sidebar Toggle Functionality
 * Handles showing/hiding sidebar on mobile devices
 */
document.addEventListener('DOMContentLoaded', () => {
    initMobileSidebar();
    initDesktopSidebar();
});

/**
 * Desktop Sidebar Toggle
 */
function initDesktopSidebar() {
    const header = document.querySelector('.header');
    const sidebar = document.querySelector('.sidebar');
    const mainLayout = document.querySelector('.main-layout');

    if (!header || !sidebar || !mainLayout) return;

    let toggleBtn = document.getElementById('sidebarToggle');
    if (!toggleBtn) {
        toggleBtn = document.createElement('button');
        toggleBtn.id = 'sidebarToggle';
        toggleBtn.className = 'sidebar-toggle-btn';
        toggleBtn.innerHTML = '<i data-lucide="chevron-left" id="sidebarToggleIcon"></i>';
        toggleBtn.style.cssText = `
            position: absolute;
            bottom: 6rem;
            right: 1.5rem;
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.1);
            color: #fff;
            cursor: pointer;
            width: 38px;
            height: 38px;
            border-radius: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.3s ease;
            z-index: 1001;
        `;
        sidebar.appendChild(toggleBtn);
    }

    const isCollapsed = localStorage.getItem('sidebar_collapsed') === 'true';
    if (isCollapsed && window.innerWidth > 768) {
        sidebar.classList.add('collapsed');
        mainLayout.classList.add('collapsed');
        
        const icon = document.getElementById('sidebarToggleIcon');
        if (icon) icon.setAttribute('data-lucide', 'chevron-right');

        const logoEl = sidebar.querySelector('.sidebar-logo');
        if (logoEl) {
            logoEl.style.fontSize = '0';
            logoEl.style.minHeight = '80px';
            logoEl.style.height = '80px';
            logoEl.style.padding = '0';
            logoEl.style.overflow = 'hidden';
            logoEl.style.opacity = '0';
            logoEl.style.pointerEvents = 'none';
            logoEl.style.display = 'flex';
            logoEl.style.alignItems = 'center';
            logoEl.style.justifyContent = 'center';
            logoEl.style.flexShrink = '0';
        }
    }

    toggleBtn.addEventListener('click', () => {
        const nowCollapsed = sidebar.classList.toggle('collapsed');
        mainLayout.classList.toggle('collapsed');
        localStorage.setItem('sidebar_collapsed', nowCollapsed);
        
        const icon = document.getElementById('sidebarToggleIcon');
        if (icon) {
            icon.setAttribute('data-lucide', nowCollapsed ? 'chevron-right' : 'chevron-left');
            if (window.lucide) window.lucide.createIcons();
        }

        const logoEl = sidebar.querySelector('.sidebar-logo');
        if (logoEl) {
            if (nowCollapsed) {
                logoEl.style.fontSize = '0';
                logoEl.style.minHeight = '80px';
                logoEl.style.height = '80px';
                logoEl.style.padding = '0';
                logoEl.style.overflow = 'hidden';
                logoEl.style.opacity = '0';
                logoEl.style.pointerEvents = 'none';
                logoEl.style.display = 'flex';
                logoEl.style.alignItems = 'center';
                logoEl.style.justifyContent = 'center';
                logoEl.style.flexShrink = '0';
            } else {
                logoEl.style.fontSize = '';
                logoEl.style.minHeight = '';
                logoEl.style.height = '';
                logoEl.style.padding = '';
                logoEl.style.overflow = '';
                logoEl.style.opacity = '';
                logoEl.style.pointerEvents = '';
                logoEl.style.display = '';
                logoEl.style.alignItems = '';
                logoEl.style.justifyContent = '';
                logoEl.style.flexShrink = '';
            }
        }
    });

    // Wire up Create Event buttons - remove inline onclick dependency
    const btns = ['dashboardCreateEventBtn', 'eventsCreateEventBtn'];
    btns.forEach(id => {
        const btn = document.getElementById(id);
        if (btn) {
            btn.onclick = null; // Clear any old inline handler
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                handleCreateEventClick();
            });
        }
    });

    if (window.lucide) window.lucide.createIcons();
}

/**
 * Mobile Sidebar Toggle Functionality
 */
function initMobileSidebar() {
    // Check if we're on a mobile device
    function isMobile() {
        return window.innerWidth <= 767;
    }

    // Create hamburger button if on mobile
    if (isMobile()) {
        createMobileMenuButton();
    }

    // Handle window resize to add/remove hamburger button
    window.addEventListener('resize', debounce(() => {
        const hamburger = document.getElementById('mobileMenuToggle');
        if (isMobile() && !hamburger) {
            createMobileMenuButton();
        } else if (!isMobile() && hamburger) {
            hamburger.remove();
            closeMobileSidebar();
        }
    }, 250));

    // Close sidebar when clicking outside
    document.addEventListener('click', (e) => {
        const sidebar = document.querySelector('.sidebar');
        const hamburger = document.getElementById('mobileMenuToggle');
        if (sidebar && hamburger && sidebar.classList.contains('active')) {
            if (!sidebar.contains(e.target) && !hamburger.contains(e.target)) {
                closeMobileSidebar();
            }
        }
    });

    // Close sidebar when clicking on a menu item (navigation)
    const menuItems = document.querySelectorAll('.menu-item a');
    menuItems.forEach(item => {
        // Mark navigation initiated from sidebar to avoid immediate auth-guard redirect loop
        item.addEventListener('click', () => {
            // Mark navigation initiated from sidebar to avoid immediate auth-guard redirect loop
            try { sessionStorage.setItem('skip_auth_redirect', '1'); } catch (err) {}
            try { localStorage.setItem('skip_auth_redirect', Date.now().toString()); } catch (err) {}
            if (isMobile()) {
                closeMobileSidebar();
            }
        });
    });
}

function createMobileMenuButton() {
    const header = document.querySelector('.header');
    if (!header || document.getElementById('mobileMenuToggle')) return;

    const hamburger = document.createElement('button');
    hamburger.id = 'mobileMenuToggle';
    hamburger.className = 'mobile-menu-toggle';
    hamburger.innerHTML = '<i data-lucide="menu" style="width: 24px; height: 24px;"></i>';
    hamburger.style.cssText = `
        background: none;
        border: none;
        color: var(--client-text-main);
        cursor: pointer;
        font-size: 1.5rem;
        padding: 0.5rem;
        display: flex;
        align-items: center;
        margin-left: 1rem;
    `;

    hamburger.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleMobileSidebar();
    });

    // Insert at the beginning of header (before search)
    const headerSearch = header.querySelector('.header-search');
    if (headerSearch) {
        header.insertBefore(hamburger, headerSearch);
    } else {
        header.insertBefore(hamburger, header.firstChild);
    }

    // Reinitialize lucide icons
    if (typeof lucide !== 'undefined' && lucide.createIcons) {
        lucide.createIcons();
    }
}

function toggleMobileSidebar() {
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) {
        sidebar.classList.toggle('active');
    }
}

function closeMobileSidebar() {
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) {
        sidebar.classList.remove('active');
    }
}

window.toggleMobileSidebar = toggleMobileSidebar;
window.closeMobileSidebar = closeMobileSidebar;
