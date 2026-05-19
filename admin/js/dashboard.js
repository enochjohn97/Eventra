/**
 * Admin Dashboard JavaScript
 * Handles admin dashboard data loading and display
 */

document.addEventListener('DOMContentLoaded', async () => {
    // Load cached stats immediately for better UX
    loadCachedAdminStats();

    // Load admin profile
    await loadAdminProfile();

    // Load dashboard stats (will fetch fresh data and cache it)
    await loadDashboardStats();

    // Set up polling for dashboard data (auto-population of cards) - increased to 30s to reduce database load
    // Only refresh if the tab is visible to save resources
    setInterval(async () => {
        if (document.visibilityState === 'visible') {
            await loadDashboardStats();
        }
    }, 30000);

    // Set up faster polling for recent activities (15 seconds) to show real-time updates
    setInterval(async () => {
        if (document.visibilityState === 'visible') {
            try {
                const response = await apiFetch('/api/stats/get-admin-dashboard-stats.php');
                const result = await response.json();
                if (result.success && result.recent_activities) {
                    loadRecentActivities(result.recent_activities);
                }
            } catch (error) {
            }
        }
    }, 15000);
});

async function loadAdminProfile() {
    try {
        const user = storage.getUser();
        // Resolve the correct ID — auth_id takes priority, fall back to id
        const authId = user && (user.auth_id || user.id);
        if (!authId) return; // Guard: skip if no valid id (prevents ?user_id=undefined)

        const response = await apiFetch(`/api/users/get-profile.php?user_id=${authId}`);
        const result = await response.json();

        if (result.success) {
            const adminUser = result.user;
            
            // Store updated user data
            storage.setUser(adminUser);
            
            // Update profile picture in header and drawer
            const avatars = document.querySelectorAll('.user-avatar, .profile-avatar-large');
            avatars.forEach(el => {
                const profileImg = '../../public/assets/imgs/admin.png';
                el.style.backgroundImage = `url('${profileImg}')`;
                el.style.backgroundSize = 'cover';
                el.style.backgroundPosition = 'center';
            });
        }
    } catch (error) {
    }
}

async function loadDashboardStats() {
    try {
        const response = await apiFetch('/api/stats/get-admin-dashboard-stats.php');
        
        if (!response.ok) {
            loadCachedAdminStats();
            return;
        }

        const result = await response.json();

        if (!result.success) {
            loadCachedAdminStats();
            return;
        }

        const stats = result.stats;

        // Cache stats to localStorage for persistence
        cacheAdminDashboardStats({
            stats: stats,
            recent_activities: result.recent_activities,
            top_users: result.top_users,
            active_clients: result.active_clients,
            upcoming_events: result.upcoming_events,
            past_events: result.past_events,
            timestamp: Date.now()
        });

        // Display stats
        displayAdminStatsCards(stats);
        displayAdminEventBadges(result.upcoming_events, result.past_events);

        // Load recent activities
        loadRecentActivities(result.recent_activities);

        // Load top users
        loadTopUsers(result.top_users);

        // Load active clients
        loadActiveClients(result.active_clients);

        // Load upcoming events
        loadEventsToSlider('upcomingEventsSlider', result.upcoming_events);

        // Load past/trending events
        loadEventsToSlider('pastEventsSlider', result.past_events || []);

        // Initialize slider controls
        initSliders();

    } catch (error) {
        loadCachedAdminStats();
    }
}

function cacheAdminDashboardStats(data) {
    try {
        if (window.storage) {
            window.storage.set('admin_dashboard_stats', data);
        } else {
            localStorage.setItem('admin_dashboard_stats', JSON.stringify(data));
        }
    } catch (error) {
    }
}

function loadCachedAdminStats() {
    try {
        let cachedData = null;
        
        if (window.storage) {
            cachedData = window.storage.get('admin_dashboard_stats');
        } else {
            const cached = localStorage.getItem('admin_dashboard_stats');
            cachedData = cached ? JSON.parse(cached) : null;
        }

        if (!cachedData || !cachedData.stats) {
            return;
        }

        // Display cached stats
        displayAdminStatsCards(cachedData.stats);
        displayAdminEventBadges(cachedData.upcoming_events || [], cachedData.past_events || []);
        loadRecentActivities(cachedData.recent_activities || []);
        loadTopUsers(cachedData.top_users || []);
        loadActiveClients(cachedData.active_clients || []);
        loadEventsToSlider('upcomingEventsSlider', cachedData.upcoming_events || []);
        loadEventsToSlider('pastEventsSlider', cachedData.past_events || []);
    } catch (error) {
    }
}

function displayAdminStatsCards(stats) {
    // Update stat cards using direct IDs for reliability
    const totalEventsEl = document.getElementById('totalEventsCount');
    if (totalEventsEl) totalEventsEl.textContent = stats.total_events || 0;

    const activeUsersEl = document.getElementById('activeUsersCount');
    if (activeUsersEl) activeUsersEl.textContent = stats.active_users || 0;

    // "Active Clients" in UI (clientsVerifiedCount) now syncs with total registered clients
    const verifiedClientsEl = document.getElementById('clientsVerifiedCount');
    if (verifiedClientsEl) verifiedClientsEl.textContent = stats.total_clients || 0;

    // Unverified count
    const unverifiedClientsEl = document.getElementById('clientsUnverifiedCount');
    if (unverifiedClientsEl) unverifiedClientsEl.textContent = stats.clients_unverified || 0;

    const totalRevenueEl = document.getElementById('totalRevenue');
    if (totalRevenueEl) totalRevenueEl.textContent = '₦' + parseFloat(stats.total_revenue || 0).toLocaleString();

    // Check for platform earnings (optional/hidden in some layouts)
    const platformEarningsEl = document.getElementById('platformEarnings');
    if (platformEarningsEl) platformEarningsEl.textContent = '₦' + parseFloat(stats.platform_earnings || 0).toLocaleString();
}

function displayAdminEventBadges(upcomingEvents, pastEvents) {
    // Update Events Showcase badges
    const upcomingBadge = document.getElementById('upcomingEventsBadge');
    if (upcomingBadge) upcomingBadge.textContent = upcomingEvents.length || 0;
    
    const pastBadge = document.getElementById('pastEventsBadge');
    if (pastBadge) pastBadge.textContent = pastEvents.length || 0;
}

function loadRecentActivities(activities) {
    const container = document.getElementById('recentActivitiesList');
    const modalContainer = document.getElementById('allActivitiesListModal');
    if (!container) return;

    if (activities.length === 0) {
        const noActivitiesHtml = '<p style="text-align: center; color: #999; padding: 2rem;">No recent activities</p>';
        container.innerHTML = noActivitiesHtml;
        if (modalContainer) modalContainer.innerHTML = noActivitiesHtml;
        return;
    }

    const generateHtml = (list) => list.map(activity => {
        const icon = getActivityIcon(activity.type);
        const color = getActivityColor(activity.type);
        
        // Summarize common messages for cleaner display
        let displayMessage = activity.message || '';
        if (displayMessage.length > 60) {
            displayMessage = displayMessage.substring(0, 57) + '...';
        }
        
        return `
            <div class="activity-item" style="padding: 1rem 0; border-bottom: 1px solid #f1f5f9; display: flex; align-items: start; gap: 12px;">
                <div class="activity-icon" style="background: ${color.bg}; color: ${color.text}; width: 36px; height: 36px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 1.2rem; flex-shrink: 0;">${icon}</div>
                <div class="activity-content" style="flex: 1; min-width: 0;">
                    <div class="activity-details" style="font-size: 0.9rem; font-weight: 500; color: #334155; line-height: 1.4; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHTML(activity.message || '')}">${escapeHTML(displayMessage)}</div>
                    <div class="activity-time" style="font-size: 0.75rem; color: #94a3b8; margin-top: 4px;" data-timestamp="${activity.created_at}">${window.timeAgo ? window.timeAgo(activity.created_at) : formatDate(activity.created_at)}</div>
                </div>
            </div>
        `;
    }).join('');

    // Only show top 10 on the dashboard
    container.innerHTML = generateHtml(activities.slice(0, 10));
    
    // Show all in the modal
    if (modalContainer) {
        modalContainer.innerHTML = generateHtml(activities);
    }
}

// Set up modal listeners
document.addEventListener('DOMContentLoaded', () => {
    const viewAllBtn = document.getElementById('viewAllActivitiesBtn');
    const activitiesModal = document.getElementById('activitiesModal');
    const closeActivitiesModalBtn = document.getElementById('closeActivitiesModalBtn');

    if (viewAllBtn && activitiesModal) {
        viewAllBtn.addEventListener('click', (e) => {
            e.preventDefault();
            activitiesModal.style.display = 'flex';
        });
    }

    if (closeActivitiesModalBtn && activitiesModal) {
        closeActivitiesModalBtn.addEventListener('click', () => {
            activitiesModal.style.display = 'none';
        });
    }

    // Close on backdrop click
    if (activitiesModal) {
        activitiesModal.addEventListener('click', (e) => {
            if (e.target === activitiesModal) {
                activitiesModal.style.display = 'none';
            }
        });
    }
});

function loadTopUsers(users) {
    const container = document.getElementById('topUsersList');
    if (!container) return;

    if (users.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #999; padding: 2rem;">No users yet</p>';
        return;
    }

    container.innerHTML = users.map(user => `
        <div class="quick-item">
            <img src="${getProfileImg(user.profile_pic, user.name)}" 
                 class="small-avatar" alt="${escapeHTML(user.name)}">
            <div style="flex:1">
                <div style="font-size: 0.9rem; font-weight: 600;">${escapeHTML(user.name)}</div>
                <div style="font-size: 0.75rem; color: var(--admin-text-muted);">${escapeHTML(user.state) || 'N/A'} • ${parseInt(user.ticket_count) || 0} tickets</div>
            </div>
            <div class="status-badge status-${user.is_online == 1 ? 'ongoing' : 'concluded'}">${user.is_online == 1 ? 'Online' : 'Offline'}</div>
        </div>
    `).join('');
}

function loadActiveClients(clients) {
    const container = document.getElementById('activeClientsList');
    if (!container) return;

    if (clients.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #999; padding: 2rem;">No clients yet</p>';
        return;
    }

    container.innerHTML = clients.map(client => `
        <div class="quick-item">
            <img src="${getProfileImg(client.profile_pic, client.name)}" 
                 class="small-avatar" alt="${escapeHTML(client.name)}">
            <div style="flex:1">
                <div style="font-size: 0.9rem; font-weight: 600;">${escapeHTML(client.name)}</div>
                <div style="font-size: 0.75rem; color: var(--admin-text-muted);">${escapeHTML(client.company || client.email)} • ${parseInt(client.event_count) || 0} events</div>
            </div>
            <div class="status-badge status-${client.is_online == 1 ? 'ongoing' : 'concluded'}">${client.is_online == 1 ? 'Online' : 'Offline'}</div>
        </div>
    `).join('');
}

function loadEventsToSlider(containerId, events) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!events || events.length === 0) {
        container.innerHTML = `<p style="text-align: center; color: #999; padding: 2rem;">No events found</p>`;
        return;
    }

    container.innerHTML = events.map(event => {
        const imagePath = getProfileImg(event.image_path, event.event_name);
        return `
            <div class="event-mini-card">
                <img src="${imagePath}" 
                     onerror="this.src='/public/assets/imgs/event-placeholder.png'"
                     class="event-mini-img" alt="${escapeHTML(event.event_name)}">
                <div class="event-mini-info">
                    <div class="event-mini-title">${escapeHTML(event.event_name)}</div>
                    <div class="event-mini-meta">
                        <span>${escapeHTML(event.client_name || 'Eventra')}</span>
                        <span>${formatDate(event.event_date)}</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    // Reset scroll position
    container.scrollLeft = 0;
}

function initSliders() {
    const sliders = ['upcomingEventsSlider', 'pastEventsSlider'];
    
    sliders.forEach(sliderId => {
        const track = document.getElementById(sliderId);
        if (!track) return;

        // Manual controls
        const section = track.closest('.events-slider-section');
        const prevBtn = section.querySelector('.slider-btn.prev');
        const nextBtn = section.querySelector('.slider-btn.next');

        if (prevBtn) prevBtn.onclick = () => moveSlider(sliderId, -1);
        if (nextBtn) nextBtn.onclick = () => moveSlider(sliderId, 1);

        // Auto-slide every 5 seconds
        if (track.dataset.timer) clearInterval(track.dataset.timer);
        const timerId = setInterval(() => {
            if (!isElementInViewport(track)) return;
            moveSlider(sliderId, 1, true);
        }, 5000);
        track.dataset.timer = timerId;
    });
}

function moveSlider(sliderId, direction, isAuto = false) {
    const track = document.getElementById(sliderId);
    if (!track) return;

    const cardWidth = 320; // Card width + gap
    const visibleCards = Math.floor(track.offsetWidth / cardWidth);
    const scrollAmount = cardWidth * Math.max(1, visibleCards);
    
    let newScroll = track.scrollLeft + (direction * scrollAmount);
    
    // Loop back for auto-slide
    if (isAuto && newScroll >= (track.scrollWidth - track.offsetWidth)) {
        newScroll = 0;
    } else if (newScroll < 0) {
        newScroll = track.scrollWidth - track.offsetWidth;
    }

    track.scrollTo({
        left: newScroll,
        behavior: 'smooth'
    });
}

function isElementInViewport(el) {
    const rect = el.getBoundingClientRect();
    return (
        rect.top >= 0 &&
        rect.left >= 0 &&
        rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
        rect.right <= (window.innerWidth || document.documentElement.clientWidth)
    );
}

function getActivityIcon(type) {
    const icons = {
        'event_created': '🎭',
        'event_deleted': '🗑️',
        'event_published': '📢',
        'ticket_purchase': '🎫',
        'user_login': '👤',
        'client_login': '💼',
        'admin_login': '⚡',
        'admin_logout': '🌙',
        'login': '🔐'
    };
    return icons[type] || '📌';
}

function getActivityColor(type) {
    const colors = {
        'event_created': { bg: '#e3f2fd', text: '#2196f3' },
        'event_deleted': { bg: '#ffebee', text: '#f44336' },
        'event_published': { bg: '#e8f5e9', text: '#4caf50' },
        'ticket_purchase': { bg: '#fff3e0', text: '#ff9800' },
        'user_login': { bg: '#f3e5f5', text: '#9c27b0' },
        'client_login': { bg: '#e1f5fe', text: '#03a9f4' },
        'admin_login': { bg: '#fff4e5', text: '#ff9800' },
        'admin_logout': { bg: '#f1f5f9', text: '#64748b' },
        'login': { bg: '#f3e5f5', text: '#9c27b0' }
    };
    return colors[type] || { bg: '#f5f5f5', text: '#666' };
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

