/**
 * Real-Time Notification System
 * Polls for new notifications and displays them
 */

class NotificationManager {
    constructor() {
        this.pollingInterval = null;
        this.pollDuration = 30000; // Poll every 30 seconds (throttled to reduce DB load)
        this.lastNotificationId = 0;
        this.isPolling = false;
        this.currentAbortController = null;
    }

    // Start polling for notifications
    startPolling() {
        if (this.isPolling) return;
        
        this.isPolling = true;
        
        // Initial load
        this.fetchNotifications();
        
        // Set up polling interval
        this.pollingInterval = setInterval(() => {
            this.fetchNotifications();
        }, this.pollDuration);
    }

    // Stop polling
    stopPolling() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
        }
        this.isPolling = false;
    }

    // Fetch notifications from API
    async fetchNotifications() {
        if (this.currentAbortController) {
            this.currentAbortController.abort();
        }
        this.currentAbortController = new AbortController();
        const signal = this.currentAbortController.signal;

        try {
            const response = await apiFetch('/api/notifications/get-notifications.php', { signal });
            
            if (!response) {
                this.stopPolling();
                return;
            }

            const result = await response.json();

            if (result.success) {
                // Calculate server time offset
                if (result.server_time) {
                    const serverTime = new Date(result.server_time).getTime();
                    const localTime = new Date().getTime();
                    window.serverTimeOffset = serverTime - localTime;
                }

                this.updateNotificationBadge(result.unread_count || 0);
                this.updateNotificationDrawer(result.notifications || []);
                
                // Update state manager with notification count
                if (window.stateManager) {
                    window.stateManager.setNotificationCount(result.unread_count || 0);
                }
                
                // Check for new notifications
                if (result.notifications && Array.isArray(result.notifications) && result.notifications.length > 0) {
                    const latestNotif = result.notifications[0];
                    const latestId = latestNotif.id;
                    
                    // Logic: Show toast if it's a new ID OR if it's a very recent login notification (within 30 seconds)
                    // and we haven't shown it yet this session.
                    const validTimestamp = latestNotif.created_at.replace(' ', 'T');
                    const notifDate = new Date(validTimestamp).getTime();
                    const now = new Date().getTime();
                    let diffMs = now - notifDate;
                    
                    if (Math.floor(diffMs / 1000) < -60) {
                        const offsetDate = new Date(validTimestamp + 'Z').getTime();
                        diffMs = now - offsetDate;
                    }
                    if (diffMs < 0) diffMs = 0;
                    
                    const isVeryRecent = diffMs < 30000;
                    const toastTypes = ['login', 'ticket_purchase', 'ticket_issued', 'payment_success', 'folder_created', 'media_uploaded', 'media_deleted', 'scheduled_event_due'];
                    const shouldToast = toastTypes.includes(latestNotif.type);
                    
                    if ((latestId > this.lastNotificationId && this.lastNotificationId !== 0 && shouldToast) || 
                        (this.lastNotificationId === 0 && isVeryRecent && latestNotif.type === 'login')) {
                        // New or recent login notification received
                        this.showNewNotificationToast(latestNotif);
                    }
                    this.lastNotificationId = latestId;
                }
            }
        } catch (error) {
            if (error.name === 'AbortError') {
                // Ignore aborted fetches silently
                return;
            }
        } finally {
            this.currentAbortController = null;
        }
    }

    // Update notification badge
    updateNotificationBadge(count) {
        const bellIcon = document.querySelector('[data-drawer="notifications"]') || document.getElementById('notificationBellIcon');
        if (!bellIcon) return;

        // Remove existing badge
        const existingBadge = bellIcon.querySelector('.notification-badge');
        if (existingBadge) {
            existingBadge.remove();
        }

        if (count > 0) {
            const badge = document.createElement('span');
            badge.className = 'notification-badge';
            badge.textContent = count > 99 ? '99+' : count;
            badge.style.cssText = `
                position: absolute;
                top: -5px;
                right: -5px;
                background: #ef4444;
                color: white;
                border-radius: 50%;
                width: 18px;
                height: 18px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 10px;
                font-weight: 700;
                border: 2px solid white;
                z-index: 10;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            `;
            bellIcon.style.position = 'relative';
            bellIcon.appendChild(badge);
        }
    }

    // Update notification drawer content
    updateNotificationDrawer(notifications) {
        const drawer = document.getElementById('notificationDrawer');
        if (!drawer) return;

        const notificationList = document.getElementById('notificationList');
        if (!notificationList) return;

        // Clear existing content
        notificationList.innerHTML = '';

        if (!notifications || notifications.length === 0) {
            notificationList.innerHTML = `
                <div class="empty-notif-state" style="text-align: center; padding: 4rem 2rem; color: #94a3b8;">
                    <div style="font-size: 4rem; margin-bottom: 1.5rem; filter: grayscale(0.5);">🎉</div>
                    <h3 style="font-size: 1.25rem; font-weight: 700; color: #1e293b; margin-bottom: 0.5rem;">All caught up!</h3>
                    <p style="font-size: 0.9rem;">You have no new notifications at the moment.</p>
                </div>
            `;
            return;
        }

        // Header with Clear All
        const header = document.createElement('div');
        header.style.cssText = 'padding: 1rem 1.5rem; border-bottom: 1px solid #f1f5f9; display: flex; justify-content: space-between; align-items: center; background: #fff;';
        header.innerHTML = `
            <span style="font-weight: 700; color: #1e293b; font-size: 0.9rem;">Notifications</span>
            <button onclick="window.notificationManager.clearAll()" 
                    style="color: #ef4444; background: #fef2f2; border: none; padding: 0.5rem 1rem; border-radius: 8px; cursor: pointer; font-size: 0.75rem; font-weight: 700; transition: all 0.2s;">
                Clear All
            </button>
        `;
        notificationList.appendChild(header);

        // List Container
        const listContainer = document.createElement('div');
        listContainer.className = 'notif-list-container';
        notificationList.appendChild(listContainer);

        notifications.forEach(notif => {
            const title = notif.title || (notif.type ? String(notif.type).replace(/_/g, ' ').toUpperCase() : 'NOTIFICATION');
            let metadata = null;
            try {
                metadata = notif.metadata ? (typeof notif.metadata === 'string' ? JSON.parse(notif.metadata) : notif.metadata) : null;
            } catch (e) {
                console.warn("Failed to parse notification metadata:", e);
            }
            const isRead = String(notif.is_read) === '1' || notif.is_read === 1;
            
            const notifItem = document.createElement('div');
            notifItem.className = `notif-item ${isRead ? '' : 'unread'}`;
            notifItem.style.cssText = `
                padding: 1.25rem 1.5rem;
                border-bottom: 1px solid #f1f5f9;
                cursor: pointer;
                transition: all 0.2s;
                display: flex;
                gap: 1rem;
                background: ${isRead ? '#fff' : '#f8fafc'};
            `;

            notifItem.innerHTML = `
                <div class="notif-icon" style="width: 40px; height: 40px; border-radius: 10px; background: #f1f5f9; display: flex; align-items: center; justify-content: center; font-size: 1.25rem; flex-shrink: 0;">
                    ${getNotificationIcon(notif.type)}
                </div>
                <div style="flex: 1; min-width: 0;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.25rem;">
                        <h4 style="font-weight: 700; color: #1e293b; font-size: 0.9rem; margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${window.escapeHtml(title)}</h4>
                        ${!isRead ? '<span style="width: 8px; height: 8px; background: #3b82f6; border-radius: 50%; margin-top: 4px;"></span>' : ''}
                    </div>
                    <p style="font-size: 0.85rem; color: #64748b; margin: 0 0 0.5rem 0; line-height: 1.4;">${window.escapeHtml(notif.message)}</p>
                    <div style="font-size: 0.75rem; color: #94a3b8; font-weight: 500;">${window.timeAgo(notif.created_at)}</div>
                </div>
            `;

            notifItem.onclick = () => {
                if (['event_deleted', 'event_restored'].includes(notif.type) && metadata?.event_id) {
                    this.handleEventNotificationClick(metadata.event_id, notif.type);
                } else {
                    this.markSingleAsRead(notif.id);
                }
            };

            listContainer.appendChild(notifItem);
        });
    }

    // Show toast notification for new notifications
    showNewNotificationToast(notification) {
        const toast = document.createElement('div');
        toast.className = 'notification-toast';
        toast.style.cssText = `
            position: fixed;
            top: 80px;
            right: 20px;
            background: white;
            padding: 1rem 1.5rem;
            border-radius: 12px;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
            z-index: 9999;
            max-width: 350px;
            animation: slideInRight 0.3s ease;
            border-left: 4px solid var(--client-primary);
        `;

        toast.innerHTML = `
            <div style="display: flex; gap: 1rem; align-items: start;">
                <div style="font-size: 1.5rem;">${getNotificationIcon(notification.type)}</div>
                <div style="flex: 1;">
                    <div style="font-weight: 700; margin-bottom: 0.25rem;">${notification.title || 'Notification'}</div>
                    <div style="font-size: 0.9rem; color: #6b7280;">${notification.message}</div>
                </div>
                <button onclick="this.parentElement.parentElement.remove()" 
                        style="background: none; border: none; font-size: 1.2rem; cursor: pointer; color: #9ca3af;">×</button>
            </div>
        `;

        document.body.appendChild(toast);

        // Auto-remove after 5 seconds
        setTimeout(() => {
            toast.style.animation = 'slideOutRight 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 5000);
    }

    // Mark all notifications as read
    async markAsRead() {
        try {
            const response = await apiFetch('/api/notifications/mark-notification-read.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mark_all: true })
            });
            
            const result = await response.json();
            
            if (result.success) {
                // Update Badge and State instantly
                this.updateNotificationBadge(0);
                if (window.stateManager) {
                    window.stateManager.setNotificationCount(0);
                }
                
                // Remove unread styling locally
                const unreadItems = document.querySelectorAll('.notification-item.unread');
                unreadItems.forEach(item => {
                    item.classList.remove('unread');
                    item.style.background = 'white';
                });

                // Refresh the drawer content to keep it in sync
                this.fetchNotifications();
            }
        } catch (error) {
        }
    }

    // Mark single notification as read
    async markSingleAsRead(notificationId) {
        try {
            const response = await apiFetch('/api/notifications/mark-notification-read.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ notification_id: notificationId })
            });

            const result = await response.json();
            if (result.success) {
                // Instant badge decrement for better UX
                const badge = document.querySelector('.notification-badge');
                if (badge && badge.textContent !== '0') {
                    let count = parseInt(badge.textContent) || 0;
                    if (count > 0) this.updateNotificationBadge(count - 1);
                }
                this.fetchNotifications(); // Full refresh
            }
        } catch (error) {
        }
    }

    async clearAll() {
        if (document.activeElement) document.activeElement.blur();
        const result = await Swal.fire({
            title: 'Clear all notifications?',
            text: "This action cannot be undone.",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            confirmButtonText: 'Yes, clear all'
        });

        if (!result.isConfirmed) return;

        try {
            const response = await apiFetch('/api/notifications/clear-all.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            const result = await response.json();
            if (result.success) {
                this.updateNotificationBadge(0);
                this.fetchNotifications();
                if (typeof showNotification === 'function') {
                    showNotification('Notifications cleared', 'success');
                } else {
                    Swal.fire('Cleared!', 'Notifications cleared', 'success');
                }
            }
        } catch (error) {
        }
    }

    /**
     * Handle event-specific notification clicks
     * @param {number} eventId - ID of the event
     * @param {string} notificationType - Type of notification (event_deleted, event_restored)
     */
    handleEventNotificationClick(eventId, notificationType) {
        if (window.deletedEventModal && ['event_deleted', 'event_restored'].includes(notificationType)) {
            // Open the deleted event modal
            window.deletedEventModal.open(eventId);
        }
    }
}

// Helper functions
function getNotificationIcon(type) {
    const icons = {
        'login': '🔐',
        'event_created': '🎉',
        'event_scheduled': '📅',
        'event_published': '🚀',
        'event_deleted': '🗑️',
        'event_restored': '♻️',
        'event_scheduled_reminder': '⏰',
        'admin_event_scheduled_reminder': '⏰',
        'ticket_purchased': '🎫',
        'user_registered': '👤',
        'media_uploaded': '📤',
        'media_deleted': '🗑️',
        'media_restored': '♻️',
        'folder_created': '📁',
        'client_verified': '✅',
        'client_rejected': '❌',
        'default': '🔔'
    };
    return icons[type] || icons.default;
}

function formatNotificationTime(timestamp) {
    return window.timeAgo(timestamp);
}

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideInRight {
        from {
            opacity: 0;
            transform: translateX(100px);
        }
        to {
            opacity: 1;
            transform: translateX(0);
        }
    }

    @keyframes slideOutRight {
        from {
            opacity: 1;
            transform: translateX(0);
        }
        to {
            opacity: 0;
            transform: translateX(100px);
        }
    }
`;
document.head.appendChild(style);

// Create global instance
window.notificationManager = new NotificationManager();

// Auto-start polling when page loads
document.addEventListener('DOMContentLoaded', () => {
    // Check using unified helper so it works for user, client, AND admin
    const user = storage.getUser();
    if (user) {
        window.notificationManager.startPolling();
    }
});
