/**
 * Real-Time Notification System
 * Polls for new notifications and displays them
 */

class NotificationManager {
    constructor() {
        this.pollingInterval = null;
        this.pollDuration = 15000; // Poll every 15 seconds (reduced from 30)
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
            const response = await apiFetch('../../api/notifications/get-notifications.php', { signal });
            
            if (!response) {
                this.stopPolling();
                return;
            }

            const result = await response.json();

            if (result.success) {
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
                    const isLoginType = latestNotif.type === 'login';
                    
                    if ((latestId > this.lastNotificationId && this.lastNotificationId !== 0) || 
                        (this.lastNotificationId === 0 && isVeryRecent && isLoginType)) {
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
            console.error('Error fetching notifications:', error);
        } finally {
            this.currentAbortController = null;
        }
    }

    // Update notification badge
    updateNotificationBadge(count) {
        let badge = document.querySelector('.notification-badge');
        
        if (!badge) {
            // Create badge if it doesn't exist
            const bellIcon = document.querySelector('[data-drawer="notifications"]');
            if (bellIcon) {
                badge = document.createElement('span');
                badge.className = 'notification-badge';
                badge.style.cssText = `
                    position: absolute;
                    top: -6px;
                    right: -6px;
                    background: #ef4444;
                    color: white;
                    border-radius: 50%;
                    min-width: 18px;
                    height: 18px;
                    padding: 0 4px;
                    font-size: 0.7rem;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-weight: 700;
                    border: 2px solid white;
                    z-index: 10;
                    box-shadow: 0 2px 5px rgba(0,0,0,0.1);
                `;
                bellIcon.style.position = 'relative';
                bellIcon.appendChild(badge);
            }
        }

        if (badge) {
            if (count > 0) {
                badge.textContent = count > 99 ? '99+' : count;
                badge.style.display = 'flex';
            } else {
                badge.style.display = 'none';
            }
        }
    }

    // Update notification drawer content
    updateNotificationDrawer(notifications) {
        const drawer = document.getElementById('notificationDrawer');
        if (!drawer) return;

        const notificationList = document.getElementById('notificationList');
        if (!notificationList) return;

        if (!notifications || notifications.length === 0) {
            notificationList.innerHTML = `
                <div style="text-align: center; padding: 3rem 1rem; color: #9ca3af;">
                    <div style="font-size: 3rem; margin-bottom: 1rem;">🔔</div>
                    <p>No notifications yet</p>
                </div>
            `;
            return;
        }

        let html = `
            <div style="padding: 0.75rem 1rem; border-bottom: 1px solid #e5e7eb; display: flex; justify-content: flex-end; background: #f9fafb;">
                <button onclick="window.notificationManager.clearAll()" 
                        style="color: #ef4444; background: white; border: 1px solid #fee2e2; padding: 0.4rem 0.75rem; border-radius: 6px; cursor: pointer; font-size: 0.75rem; font-weight: 600; transition: all 0.2s;">
                    Clear All
                </button>
            </div>
            <div id="actualNotificationItems">
        `;

        html += notifications.map(notif => {
            const title = notif.title || notif.type.replace('_', ' ').toUpperCase();
            const metadata = notif.metadata ? JSON.parse(notif.metadata) : null;
            const isEventNotification = ['event_deleted', 'event_restored'].includes(notif.type);
            const clickHandler = isEventNotification && metadata?.event_id 
                ? `window.notificationManager.handleEventNotificationClick(${metadata.event_id}, '${notif.type}')` 
                : `window.notificationManager.markSingleAsRead(${notif.id})`;
            
            return `
                <div class="notification-item ${String(notif.is_read) === '0' ? 'unread' : ''}" 
                     onclick="${clickHandler}"
                     style="padding: 1rem; border-bottom: 1px solid #e5e7eb; cursor: pointer;">
                    <div style="display: flex; gap: 1rem;">
                        <div style="font-size: 1.5rem;">${getNotificationIcon(notif.type)}</div>
                        <div style="flex: 1;">
                            <div style="font-weight: 600; margin-bottom: 0.25rem;">${title}</div>
                            <div style="font-size: 0.85rem; color: #6b7280; margin-bottom: 0.5rem;">${notif.message}</div>
                            <div style="font-size: 0.75rem; color: #9ca3af;">${formatNotificationTime(notif.created_at)}</div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        html += '</div>';
        notificationList.innerHTML = html;
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
            const response = await apiFetch('../../api/notifications/mark-notification-read.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mark_all: true })
            });
            
            const result = await response.json();
            
            if (result.success) {
                // Update UI
                this.updateNotificationBadge(0);
                
                // Remove unread styling
                const unreadItems = document.querySelectorAll('.notification-item.unread');
                unreadItems.forEach(item => {
                    item.classList.remove('unread');
                    item.style.background = 'white';
                });

                if (window.stateManager) {
                    window.stateManager.setNotificationCount(0);
                }
            }
        } catch (error) {
            console.error('Error marking notifications as read:', error);
        }
    }

    // Mark single notification as read
    async markSingleAsRead(notificationId) {
        try {
            const response = await apiFetch('../../api/notifications/mark-notification-read.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ notification_id: notificationId })
            });

            const result = await response.json();
            if (result.success) {
                this.fetchNotifications(); // Refresh
            }
        } catch (error) {
            console.error('Error marking single notification as read:', error);
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
            const response = await apiFetch('../../api/notifications/clear-all.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            const result = await response.json();
            if (result.success) {
                this.fetchNotifications();
                if (typeof showNotification === 'function') {
                    showNotification('Notifications cleared', 'success');
                } else {
                    Swal.fire('Cleared!', 'Notifications cleared', 'success');
                }
            }
        } catch (error) {
            console.error('Error clearing notifications:', error);
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
        'default': '🔔'
    };
    return icons[type] || icons.default;
}

function formatNotificationTime(timestamp) {
    if (!timestamp) return 'recently';
    const validTimestamp = timestamp.replace(' ', 'T');
    
    // Convert SQL date (assuming UTC or Local) to milliseconds
    const date = new Date(validTimestamp).getTime();
    const now = new Date().getTime();
    
    // Calculate seconds diff, allowing a small 60s buffer for minor server-client timezone skews natively
    let diffMs = now - date;
    let seconds = Math.floor(diffMs / 1000);
    
    // If the date is wildly in the future (due to a heavy timezone offset without 'Z'), we adjust it
    if (seconds < -60) {
        // Fallback: Date seems to be in the future, let's treat the parsed date as local inherently
        const offsetDate = new Date(validTimestamp + 'Z').getTime();
        diffMs = now - offsetDate;
    }
    
    if (diffMs < 0) diffMs = 0; // Final safety floor

    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    
    return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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
