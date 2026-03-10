document.addEventListener('DOMContentLoaded', async () => {
    // Try namespaced key first, fall back to generic if necessary
    const user = storage.getUser();
    
    if (!user || user.role !== 'client') {
        window.location.href = '../../client/pages/clientLogin.html';
        return;
    }

    // Load client profile
    await loadClientProfile();

    // Load dashboard stats
    await loadDashboardStats();

    // Enable 15s polling for real-time updates
    setInterval(loadDashboardStats, 15000);
});

async function loadClientProfile() {
    try {
        const response = await apiFetch(`../../api/users/get-profile.php`);
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
                if (!avatar.querySelector('.verification-badge-overlay')) {
                    const isVerified = parseInt(user.nin_verified) === 1 && parseInt(user.bvn_verified) === 1;
                    const badge = document.createElement('div');
                    badge.className = `verification-badge-overlay ${isVerified ? 'verified' : 'unverified'}`;
                    badge.innerHTML = isVerified ? 
                        '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>' : 
                        '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line><circle cx="12" cy="12" r="10"></circle></svg>';
                    badge.title = isVerified ? 'Verified Organizer' : 'Verification Pending';
                    avatar.style.position = 'relative'; 
                    avatar.appendChild(badge);
                }
            });
            
            if (window.stateManager) {
                window.stateManager.setState({ user: user, profilePicture: user.profile_pic });
            }

            storage.setUser(user);
        }
    } catch (error) {
        console.error('Error loading profile:', error);
    }
}

async function loadDashboardStats() {
    try {
        const response = await apiFetch('../../api/stats/get-client-dashboard-stats.php');
        const result = await response.json();

        if (!result.success) {
            console.error('Failed to load dashboard stats');
            return;
        }

        const stats = result.stats;
        if (!stats) return;

        // Update stats cards using specific IDs
        const upcomingEventsEl = document.getElementById('upcomingEventsCount');
        const ticketsEl = document.getElementById('ticketsCount');
        const usersEl = document.getElementById('usersCount');
        const mediaEl = document.getElementById('mediaCount');

        if (upcomingEventsEl) upcomingEventsEl.textContent = stats.total_events !== undefined ? stats.total_events : 0;
        if (ticketsEl) ticketsEl.textContent = stats.total_tickets !== undefined ? stats.total_tickets : 0;
        if (usersEl) usersEl.textContent = stats.total_users !== undefined ? stats.total_users : 0;
        if (mediaEl) mediaEl.textContent = stats.total_media !== undefined ? stats.total_media : 0;

        // Load upcoming events / performance breakdown
        loadUpcomingEvents(result.events);

        // Load detailed attendee list
        loadRecentTickets(result.attendees);

    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

async function loadUpcomingEvents(events) {
    const eventsList = document.getElementById('upcomingEventsList');
    if (!eventsList) return;

    if (!events || events.length === 0) {
        eventsList.innerHTML = '<p style="text-align: center; color: var(--client-text-muted); padding: 2rem;">No events found. Create your first event!</p>';
        return;
    }

    eventsList.innerHTML = events.map(event => `
        <div class="event-feed-item" style="cursor: pointer; display: flex; gap: 15px; align-items: center;" onclick="window.location.href='events.html'">
            <div style="width: 60px; height: 60px; border-radius: 8px; flex-shrink: 0; background: #f3f4f6; overflow: hidden; display: flex; align-items: center; justify-content: center; font-size: 1.5rem; color: #9ca3af;">
                ${event.image_path ? `<img src="${event.image_path.startsWith('/') ? '../..' + event.image_path : '../../' + event.image_path}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.parentElement.innerHTML='📷'">` : '📷'}
            </div>
            <div class="event-feed-info" style="flex: 1;">
                <div class="event-feed-title">${event.event_name} | 
                    <span style="font-weight: 500; font-size: 0.9rem; color: var(--client-text-muted);">
                        ${formatDate(event.event_date)}
                    </span>
                </div>
                <div style="display: flex; gap: 10px; margin-top: 10px; font-size: 0.75rem;">
                    <span class="status-badge status-${event.status.toLowerCase()}">
                        ● ${event.status}
                    </span>
                    <span style="color: var(--client-text-muted);">${event.tickets_sold || 0} Tickets Sold</span>
                    <span style="color: var(--card-green); font-weight: 600;">₦${parseFloat(event.revenue || 0).toLocaleString()} Revenue</span>
                </div>
            </div>
        </div>
    `).join('');
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
                <img src="${attendee.profile_pic || `https://ui-avatars.com/api/?name=${encodeURIComponent(attendee.name)}&background=random`}" 
                     style="width: 35px; height: 35px; border-radius: 50%;">
                <div>
                    <div style="font-size: 0.85rem; font-weight: 600;">${attendee.name}</div>
                    <div style="font-size: 0.75rem; color: var(--client-text-muted);">${attendee.event_name} <span style="opacity:0.5;">• Standard Ticket</span></div>
                </div>
            </div>
            <div style="text-align: right;">
                <div style="font-size: 0.85rem; font-weight: 700; color: #10b981;">
                    ₦${parseFloat(attendee.amount || 0).toLocaleString()}
                </div>
                <div style="font-size: 0.7rem; color: var(--client-text-muted);">
                    ${paymentMethod} • ${new Date(attendee.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                </div>
            </div>
        </div>
    `}).join('');
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function timeAgo(dateString) {
    if (!dateString) return 'recently';
    // Ensure proper parsing cross-browser
    const validDateString = dateString.replace(' ', 'T');
    
    // Convert SQL date (assuming UTC or Local) to milliseconds
    const date = new Date(validDateString).getTime();
    const now = new Date().getTime();
    
    // Calculate seconds diff, allowing a small 60s buffer for minor server-client timezone skews natively
    let diffMs = now - date;
    let seconds = Math.floor(diffMs / 1000);
    
    // If the date is wildly in the future (due to a heavy timezone offset without 'Z'), we adjust it
    // Usually, this means the DB stored it in local time, but the browser thinks it's UTC and subtracts the offset
    if (seconds < -60) {
        // Fallback: Date seems to be in the future, let's treat the parsed date as local inherently
        // by stripping any assumed timezone, or just returning 'recently' for safety if it's very close
        const offsetDate = new Date(validDateString + 'Z').getTime();
        diffMs = now - offsetDate;
        seconds = Math.floor(diffMs / 1000);
    }
    
    if (seconds < 0) {
        seconds = 0; // Final safety floor
        diffMs = 0;
    }
    
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const weeks = Math.floor(days / 7);
    
    if (minutes < 1) {
        return seconds > 10 ? `${seconds} seconds ago` : `recently`;
    }
    
    if (minutes < 60) {
        return `${minutes} min${minutes > 1 ? 's' : ''} ago`;
    }
    
    if (hours < 24) {
        return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    }
    
    if (days >= 1 && days < 7) {
        if (days === 1) return '1 day ago';
        return `${days} days ago`;
    }
    
    if (weeks >= 1) {
        const actualDate = new Date(now - diffMs);
        return actualDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
    
    return 'recently';
}
