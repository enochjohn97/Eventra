window.handleCreateEventClick = function() {
    let user = null;
    if (window.storage) user = window.storage.getUser();
    if (!user && window.stateManager) user = window.stateManager.getState().user;
    
    if (user && user.verification_status !== 'verified') {
        Swal.fire({
            icon: 'warning',
            title: 'Action Restricted',
            text: "To create events your profile must be verified, so properly fill your profile so it'll be approved before you proceed",
            toast: true,
            position: 'top-end',
            showConfirmButton: false,
            timer: 4000
        });
        return;
    }
    
    if (typeof showCreateEventModal === 'function') {
        showCreateEventModal();
    }
};

/**
 * Refresh dashboard data after an event update
 */
window.updateEventOnDashboard = function(updatedEvent) {
    // For simplicity on the dashboard, we trigger a full stats refresh
    // but we could also update the local events state if needed.
    loadDashboardStats();
};

document.addEventListener('DOMContentLoaded', async () => {

    // Load cached stats immediately for better UX
    loadCachedStats();

    // Load client profile
    await loadClientProfile();

    // Load dashboard stats (will fetch fresh data and cache it)
    await loadDashboardStats();

    // Enable 30s polling for real-time updates (reduced from 15s) to decrease database load
    // Visibility check prevents queries when tab is in background
    setInterval(() => {
        if (document.visibilityState === 'visible') {
            loadDashboardStats();
        }
    }, 30000);

    // Initialize heartbeat
    if (typeof initHeartbeat === 'function') initHeartbeat();

    // Listen for unified profile update event
    document.addEventListener('EventraProfileUpdated', (e) => {
        loadClientProfile();
    });
});

async function loadClientProfile() {
    try {
        const response = await apiFetch('/api/users/get-profile.php');
        const result = await response.json();

        if (result.success) {
            const user = result.user;
            
            // Update profile display using unified elements
            const profileAvatars = document.querySelectorAll('.user-avatar');
            
            profileAvatars.forEach(avatar => {
                const avatarUrl = user.profile_pic || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name || user.business_name || 'User')}&background=random&color=fff`;
                avatar.style.backgroundImage = `url(${avatarUrl})`;
                avatar.style.backgroundSize = 'cover';
                avatar.style.backgroundPosition = 'center';
                avatar.textContent = ''; // clear initial if any

                // Add Verification Badge if not already present
                const status = user.verification_status || 'pending';
                let badgeClass = 'unverified';
                let badgeIcon = '';
                let badgeTitle = 'Verification Pending';

                if (status === 'verified') {
                    badgeClass = 'verified';
                    badgeIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
                    badgeTitle = 'Verified Organizer';
                } else if (status === 'rejected') {
                    badgeClass = 'rejected';
                    badgeIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
                    badgeTitle = 'Verification Declined';
                } else {
                    // Pending
                    badgeIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line><circle cx="12" cy="12" r="10"></circle></svg>';
                }

                let badge = avatar.querySelector('.verification-badge-overlay');
                if (!badge) {
                    badge = document.createElement('div');
                    avatar.style.position = 'relative'; 
                    avatar.appendChild(badge);
                }
                
                badge.className = `verification-badge-overlay ${badgeClass}`;
                badge.innerHTML = badgeIcon;
                badge.title = badgeTitle;
            });
            
            if (window.stateManager) {
                window.stateManager.setState({ user: user, profilePicture: user.profile_pic });
            }

            const banner = document.getElementById('verificationBanner');
            const bannerText = document.getElementById('verificationBannerText');
            const createBtn = document.getElementById('dashboardCreateEventBtn');

            if (banner) {
                if (user.verification_status === 'verified') {
                    banner.style.display = 'none';
                    if (createBtn) {
                        createBtn.disabled = false;
                        createBtn.title = '';
                    }
                    
                    // Show approved notification once per verify
                    if (!localStorage.getItem('approved_notification_shown_' + user.id)) {
                        Swal.fire({
                            icon: 'success',
                            title: 'Profile Approved!',
                            text: 'Your profile has been approved! You can now create events.',
                            toast: true,
                            position: 'top-end',
                            showConfirmButton: false,
                            timer: 5000,
                            timerProgressBar: true
                        });
                        localStorage.setItem('approved_notification_shown_' + user.id, 'true');
                    }
                } else {
                    // Restricted State (Pending or Rejected)
                    banner.style.display = 'block';
                    if (createBtn) {
                        createBtn.disabled = true;
                        createBtn.title = 'Your profile must be approved to create events';
                    }

                    if (user.verification_status === 'rejected') {
                        banner.style.background = '#fee2e2';
                        banner.style.color = '#991b1b';
                        banner.style.borderColor = '#fecaca';
                        if (bannerText) {
                            bannerText.innerHTML = `<strong>Verification Declined:</strong> Your account details were rejected. <a href="javascript:void(0)" onclick="window.showProfileEditModal()" style="font-weight:700; margin-left:8px; color: inherit; text-decoration: underline;">Update Profile</a>`;
                        }
                    } else {
                        // Pending
                        banner.style.background = '#fff3cd';
                        banner.style.color = '#856404';
                        banner.style.borderColor = '#ffeeba';
                        if (bannerText) {
                            bannerText.innerHTML = `To create events your profile must be verified, so properly fill your profile so it'll be approved before you proceed. <a href="javascript:void(0)" onclick="window.showProfileEditModal()" style="font-weight:700; margin-left:8px; color: inherit; text-decoration: underline;">Update Profile</a>`;
                        }
                    }
                    
                    // Reset notification flag if status is no longer verified (shouldn't really happen normally but good for testing)
                    localStorage.removeItem('approved_notification_shown_' + user.id);
                }
            }

            storage.setUser(user);
        }
    } catch (error) {
    }
}


async function loadDashboardStats() {
    try {
        const response = await apiFetch('/api/stats/get-client-dashboard-stats.php');
        
        if (!response.ok) {
            loadCachedStats();
            return;
        }

        const result = await response.json();

        if (!result.success) {
            loadCachedStats();
            return;
        }

        const stats = result.stats;
        if (!stats) {
            loadCachedStats();
            return;
        }

        // Cache stats to localStorage for persistence
        cacheDashboardStats({
            stats: stats,
            events: result.events,
            attendees: result.attendees,
            timestamp: Date.now()
        });

        // Update stats cards using specific IDs
        displayStatsCards(stats);

        // Load upcoming events / performance breakdown
        loadUpcomingEvents(result.events);

        // Sync with global state manager
        if (window.stateManager) {
            window.stateManager.setState({ events: result.events || [] });
        }

        // Load detailed attendee list
        loadRecentTickets(result.attendees);

    } catch (error) {
        loadCachedStats();
    }
}

function cacheDashboardStats(data) {
    try {
        if (window.storage) {
            window.storage.set('dashboard_stats', data);
        } else {
            localStorage.setItem('dashboard_stats', JSON.stringify(data));
        }
    } catch (error) {
    }
}

function loadCachedStats() {
    try {
        let cachedData = null;
        
        if (window.storage) {
            cachedData = window.storage.get('dashboard_stats');
        } else {
            const cached = localStorage.getItem('dashboard_stats');
            cachedData = cached ? JSON.parse(cached) : null;
        }

        if (!cachedData || !cachedData.stats) {
            return;
        }

        // Display cached stats
        displayStatsCards(cachedData.stats);
        loadUpcomingEvents(cachedData.events || []);
        loadRecentTickets(cachedData.attendees || []);

        // Sync with global state manager
        if (window.stateManager) {
            window.stateManager.setState({ events: cachedData.events || [] });
        }
    } catch (error) {
    }
}

function displayStatsCards(stats) {
    const upcomingEventsEl = document.getElementById('upcomingEventsCount');
    const ticketsEl = document.getElementById('ticketsCount');
    const usersEl = document.getElementById('usersCount');
    const mediaEl = document.getElementById('mediaCount');

    if (upcomingEventsEl) upcomingEventsEl.textContent = stats.total_events !== undefined ? stats.total_events : 0;
    if (ticketsEl) ticketsEl.textContent = stats.total_tickets !== undefined ? stats.total_tickets : 0;
    if (usersEl) usersEl.textContent = stats.total_users !== undefined ? stats.total_users : 0;
    if (mediaEl) mediaEl.textContent = stats.total_media !== undefined ? stats.total_media : 0;
}

async function loadUpcomingEvents(events) {
    const eventsList = document.getElementById('upcomingEventsList');
    if (!eventsList) return;

    if (!events || events.length === 0) {
        eventsList.innerHTML = '<p style="text-align: center; color: var(--client-text-muted); padding: 2rem;">No events found. Create your first event!</p>';
        return;
    }

    let html = events.map(event => `
        <div class="event-feed-item summarized" style="cursor: pointer; display: flex; gap: 15px; align-items: center; padding: 1rem;" onclick="window.location.href='events.html?highlight=${event.id}'">
            <div style="width: 50px; height: 50px; border-radius: 8px; flex-shrink: 0; background: #f3f4f6; overflow: hidden; display: flex; align-items: center; justify-content: center; font-size: 1.2rem; color: #9ca3af;">
                ${event.image_path ? `<img src="${event.image_path.startsWith('/') ? '../..' + event.image_path : '../../' + event.image_path}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.parentElement.innerHTML='📷'">` : '📷'}
            </div>
            <div class="event-feed-info" style="flex: 1;">
                <div class="event-feed-title" style="font-size: 0.95rem; margin-bottom: 2px;">${event.event_name}</div>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div style="font-weight: 500; font-size: 0.8rem; color: var(--client-text-muted);">
                        ${formatDate(event.event_date)}
                    </div>
                    <div style="display: flex; gap: 8px; font-size: 0.7rem; align-items: center;">
                        <span class="status-badge status-${event.status.toLowerCase()}" style="padding: 2px 6px; font-size: 0.65rem;">
                            ${event.status}
                        </span>
                        <span style="color: var(--client-text-muted); font-weight: 600;">${event.tickets_sold || 0} Sold</span>
                        ${event.tickets_sold > 0 ? '<span title="Event Locked" style="cursor:help;">🔒</span>' : ''}
                    </div>
                </div>
            </div>
        </div>
    `).join('');



    eventsList.innerHTML = html;
}



function getGridColumns(container) {
    if (!container) return 2;
    const style = window.getComputedStyle(container);
    const cols = style.getPropertyValue('grid-template-columns').split(' ').length;
    return cols || 2;
}

async function loadRecentTickets(attendees) {
    const salesList = document.getElementById('recentTicketSalesList');
    if (!salesList) return;

    if (!attendees || attendees.length === 0) {
        salesList.innerHTML = '<p style="text-align: center; color: var(--client-text-muted); padding: 2rem;">No ticket sales yet.</p>';
        return;
    }

    salesList.innerHTML = attendees.map(attendee => {
        let paymentMethod = 'Paystack';
        try {
            if (attendee.paystack_response && typeof attendee.paystack_response === 'string') {
                const parsed = JSON.parse(attendee.paystack_response);
                if (parsed.data && parsed.data.channel) paymentMethod = parsed.data.channel.toUpperCase();
            }
        } catch (e) {}

        return `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid #f1f4f8;">
            <div style="display: flex; gap: 12px; align-items: center;">
                <img src="${getProfileImg(attendee.profile_pic, attendee.name)}" 
                     style="width: 35px; height: 35px; border-radius: 50%;">
                <div>
                    <div style="font-size: 0.85rem; font-weight: 600;">${attendee.name}</div>
                    <div style="font-size: 0.75rem; color: var(--client-text-muted);">${attendee.event_name} <span style="opacity:0.5;">• Standard Ticket</span></div>
                </div>
            </div>
            <div style="text-align: right;">
                <div style="font-size: 0.85rem; font-weight: 700; color: ${attendee.event_price == 0 ? '#722f37' : '#722f37'};">
                    ${attendee.price_display}
                </div>
                <div style="font-size: 0.7rem; color: var(--client-text-muted);">
                    ${paymentMethod} • ${new Date(attendee.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </div>
            </div>
        </div>
    `}).join('');
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

