/**
 * Notification, Settings, and Profile Drawer System
 * Unified slide-out drawer for all pages
 */

// Initialize drawers on page load
document.addEventListener('DOMContentLoaded', () => {
    initializeDrawers();
});

function initializeDrawers() {
    // Create drawer HTML
    const drawerHTML = `
        <!-- Notification Drawer -->
        <div id="notificationDrawer" class="side-drawer">
            <div class="drawer-header">
                <h3>Notifications</h3>
                <button class="drawer-close" onclick="closeDrawer('notificationDrawer')">×</button>
            </div>
            <div class="drawer-body" id="notificationList">
                <div style="text-align: center; padding: 2rem; color: var(--client-text-muted);">
                    Loading notifications...
                </div>
            </div>
        </div>

        <!-- Settings Drawer -->
        <div id="settingsDrawer" class="side-drawer">
            <div class="drawer-header">
                <h3>Settings</h3>
                <button class="drawer-close" onclick="closeDrawer('settingsDrawer')">×</button>
            </div>
            <div class="drawer-body">
                <div class="settings-section">
                    <h4>Account Settings</h4>
                    <div class="setting-item">
                        <label>Email Notifications</label>
                        <input type="checkbox" checked>
                    </div>
                    <div class="setting-item">
                        <label>SMS Notifications</label>
                        <input type="checkbox">
                    </div>
                </div>
                <div class="settings-section">
                    <h4>Appearance</h4>
                    <div class="setting-item">
                        <label>Dark Mode</label>
                        <input type="checkbox" id="darkModeToggle">
                    </div>
                </div>
                <div class="settings-section">
                    <h4>Privacy</h4>
                    <div class="setting-item">
                        <label>Profile Visibility</label>
                        <select>
                            <option>Public</option>
                            <option>Private</option>
                        </select>
                    </div>
                </div>
            </div>
        </div>

        <!-- Profile Drawer -->
        <div id="profileDrawer" class="side-drawer">
            <div class="drawer-header">
                <h3>Profile</h3>
                <button class="drawer-close" onclick="closeDrawer('profileDrawer')">×</button>
            </div>
            <div class="drawer-body" id="profileContent">
                <div style="text-align: center; padding: 2rem;">
                    <div class="profile-avatar-large" id="profileAvatarLarge"></div>
                    <h3 id="profileName">Loading...</h3>
                    <p id="profileEmail" style="color: var(--client-text-muted);"></p>
                    <button class="btn btn-primary" onclick="editProfile()" style="margin-top: 1rem;">Edit Profile</button>
                </div>
            </div>
        </div>

        <!-- Drawer Overlay -->
        <div id="drawerOverlay" class="drawer-overlay" onclick="closeAllDrawers()"></div>
    `;

    // Add drawer HTML to body if not exists
    if (!document.getElementById('notificationDrawer')) {
        document.body.insertAdjacentHTML('beforeend', drawerHTML);
    }

    // Add drawer styles
    addDrawerStyles();

    // Attach click handlers to drawer triggers
    document.querySelectorAll('[data-drawer]').forEach(trigger => {
        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            const drawerName = trigger.getAttribute('data-drawer');
            openDrawer(drawerName);
        });
    });

    // Add ESC key listener to close drawers
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' || e.key === 'Esc') {
            closeAllDrawers();
        }
    });
}

function addDrawerStyles() {
    if (document.getElementById('drawerStyles')) return;

    const style = document.createElement('style');
    style.id = 'drawerStyles';
    style.textContent = `
        .side-drawer {
            position: fixed;
            top: 0;
            right: -400px;
            width: 400px;
            height: 100vh;
            background: white;
            box-shadow: -4px 0 12px rgba(0,0,0,0.1);
            z-index: 10000;
            transition: right 0.3s ease;
            overflow-y: auto;
        }

        .side-drawer.open {
            right: 0;
        }

        .drawer-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.5);
            z-index: 9999;
            display: none;
        }

        .drawer-overlay.active {
            display: block;
        }

        .drawer-header {
            padding: 1.5rem;
            border-bottom: 1px solid #e5e7eb;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .drawer-header h3 {
            margin: 0;
            font-size: 1.25rem;
            font-weight: 700;
        }

        .drawer-close {
            background: none;
            border: none;
            font-size: 2rem;
            cursor: pointer;
            color: var(--client-text-muted);
            line-height: 1;
        }

        .drawer-body {
            padding: 1.5rem;
        }

        .notification-item {
            padding: 1rem;
            border-bottom: 1px solid #f1f4f8;
            cursor: pointer;
            transition: background 0.2s;
        }

        .notification-item:hover {
            background: #f9fafb;
        }

        .notification-item.unread {
            background: #eff6ff;
        }

        .notification-title {
            font-weight: 600;
            margin-bottom: 0.25rem;
        }

        .notification-message {
            font-size: 0.875rem;
            color: var(--client-text-muted);
            margin-bottom: 0.5rem;
        }

        .notification-time {
            font-size: 0.75rem;
            color: var(--client-text-muted);
        }

        .settings-section {
            margin-bottom: 2rem;
        }

        .settings-section h4 {
            font-size: 1rem;
            font-weight: 600;
            margin-bottom: 1rem;
        }

        .setting-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 0.75rem 0;
            border-bottom: 1px solid #f1f4f8;
        }

        .profile-avatar-large {
            width: 100px;
            height: 100px;
            border-radius: 50%;
            background: var(--client-primary);
            margin: 0 auto 1rem;
            background-size: cover;
            background-position: center;
        }
    `;
    document.head.appendChild(style);
}

function openDrawer(drawerType) {
    closeAllDrawers();

    let drawerId;
    switch(drawerType) {
        case 'notifications':
            drawerId = 'notificationDrawer';
            // Global NotificationManager will handle data loading via trigger
            if (window.notificationManager) {
                window.notificationManager.fetchNotifications();
            }
            break;
        case 'settings':
            drawerId = 'settingsDrawer';
            break;
        case 'profile':
            drawerId = 'profileDrawer';
            loadProfile();
            break;
        default:
            return;
    }

    const drawer = document.getElementById(drawerId);
    const overlay = document.getElementById('drawerOverlay');

    if (drawer && overlay) {
        drawer.classList.add('open');
        overlay.classList.add('active');
    }
}

function closeDrawer(drawerId) {
    const drawer = document.getElementById(drawerId);
    const overlay = document.getElementById('drawerOverlay');

    if (drawer) {
        drawer.classList.remove('open');
    }
    if (overlay) {
        overlay.classList.remove('active');
    }
}

function closeAllDrawers() {
    document.querySelectorAll('.side-drawer').forEach(drawer => {
        drawer.classList.remove('open');
    });
    const overlay = document.getElementById('drawerOverlay');
    if (overlay) {
        overlay.classList.remove('active');
    }
}

async function loadProfile() {
    try {
        const response = await apiFetch('../../api/users/get-profile.php');
        const result = await response.json();

        if (result.success && result.user) {
            const user = result.user;
            document.getElementById('profileName').textContent = user.name;
            document.getElementById('profileEmail').textContent = user.email;

            const avatar = document.getElementById('profileAvatarLarge');
            if (user.profile_pic) {
                avatar.style.backgroundImage = `url(${user.profile_pic})`;
            }
        }
    } catch (error) {
        console.error('Error loading profile:', error);
    }
}

function editProfile() {
    closeAllDrawers();
    if (typeof showProfileEditModal === 'function') {
        showProfileEditModal();
    } else {
        alert('Profile edit functionality could not be loaded.');
    }
}

// Make functions globally available
window.openDrawer = openDrawer;
window.closeDrawer = closeDrawer;
window.closeAllDrawers = closeAllDrawers;
window.editProfile = editProfile;
