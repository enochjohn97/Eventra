/**
 * Client Events Page JavaScript
 * Handles event creation, management, display, soft-delete, restore, and trash
 */

let currentTab = 'active';
let eventsData = [];
let sortConfig = { key: 'event_date', direction: 'desc' };
let pagination = null;
const selectedEventIds = new Set();

/**
 * Updates a single event in the local list and re-renders the table.
 * Called by modals.js after a successful update.
 */
function updateEventInList(updatedEvent) {
    const index = eventsData.findIndex(e => e.id == updatedEvent.id);
    if (index !== -1) {
        // Merge updated data with existing data to preserve any fields not returned by the API
        eventsData[index] = { ...eventsData[index], ...updatedEvent };

        if (pagination) {
            pagination.updateData(eventsData);
        } else {
            updateEventsTable(eventsData);
        }

        // Also refresh stats since an update might change counts (e.g. status change)
        const user = storage.getUser();
        refreshStats(user.id);
    }
}
window.updateEventInList = updateEventInList;

document.addEventListener('DOMContentLoaded', async () => {
    const user = storage.getUser();

    // Load cached stats first for instant feedback
    loadCachedStats();

    const clientId = user ? user.id : null;

    // Load events
    await loadEvents(clientId);

    // Set polling for stats and events (every 30 seconds)
    setInterval(() => {
        if (document.visibilityState === 'visible') {
            refreshStats(clientId);
        }
    }, 30000);

    // Handle search highlighting
    const urlParams = new URLSearchParams(window.location.search);
    const highlightId = urlParams.get('highlight');
    if (highlightId) {
        const tryHighlight = (attempts = 0) => {
            const row = document.querySelector(`tr[data-id="${highlightId}"]`);
            if (row) {
                row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                row.classList.add('search-highlight-row');
                setTimeout(() => row.classList.remove('search-highlight-row'), 3500);
            } else if (attempts < 15) {
                setTimeout(() => tryHighlight(attempts + 1), 300);
            }
        };
        setTimeout(() => tryHighlight(), 800);
    }

    // Initialize create event button
    initCreateEventButton();
});

// ─── TAB SWITCHING ──────────────────────────────────────────────────────────

function switchEventTab(tab) {
    currentTab = tab;
    const user = storage.getUser();

    // Update tab button styles
    document.querySelectorAll('.event-tab').forEach(btn => {
        const isActive = btn.dataset.tab === tab;
        btn.classList.toggle('active', isActive);
        if (isActive) {
            btn.style.background = tab === 'trash' ? '#ef4444' : 'var(--client-primary)';
            btn.style.color = 'white';
        } else {
            btn.style.background = '#f3f4f6';
            btn.style.color = '#6b7280';
        }
    });

    if (tab === 'active') {
        loadEvents(user.id);
    } else {
        loadTrashEvents(user.id);
    }
}
window.switchEventTab = switchEventTab;

// ─── LOAD ACTIVE EVENTS ────────────────────────────────────────────────────

async function loadEvents(clientId) {
    try {
        const response = await apiFetch(`/api/events/get-events.php?client_id=${clientId}&limit=all`);
        const result = await response.json();

        if (result.success) {
            // Update stats cards
            if (result.stats) {
                updateStatsCards(result.stats);
                updateTrashBadge(result.stats.deleted_events || 0);
                // Cache stats
                storage.set('event_stats', result.stats);
            }

            // Update events table
            eventsData = result.events;
            updatePagination(eventsData);
        }
    } catch (error) {
    }
}

function updateTrashBadge(count) {
    const badge = document.getElementById('trashCount');
    if (badge) {
        badge.textContent = count;
        badge.style.display = count > 0 ? 'inline' : 'none';
    }
}

function updateStatsCards(stats) {
    const createdCard = document.getElementById('statCreated');
    const publishedCard = document.getElementById('statPublished');
    const scheduledCard = document.getElementById('statScheduled');
    const deletedCard = document.getElementById('statDeleted');
    const restoredCard = document.getElementById('statRestored');

    if (createdCard) createdCard.textContent = stats.total_events || 0;
    if (publishedCard) publishedCard.textContent = stats.published_events || 0;
    if (scheduledCard) scheduledCard.textContent = stats.scheduled_events || 0;
    if (deletedCard) deletedCard.textContent = stats.deleted_events || 0;
    if (restoredCard) restoredCard.textContent = stats.restored_events || 0;
}

function loadCachedStats() {
    const stats = storage.get('event_stats');
    if (stats) {
        updateStatsCards(stats);
        updateTrashBadge(stats.deleted_events || 0);
    }
}

function updateEventsTable(events) {
    const tbody = document.getElementById('eventsTableBody');
    if (!tbody) return;

    // Update table headers based on current tab
    const thead = document.querySelector('.table-card table thead tr');
    if (thead) {
        if (currentTab === 'trash') {
            thead.innerHTML = `
                <th style="width: 40px;"><input type="checkbox" id="selectAll"></th>
                <th>Event ID</th>
                <th>Event Name</th>
                <th>Category</th>
                <th>Date</th>
                <th>Price</th>
                <th>Deleted On</th>
                <th class="text-center">Actions</th>
            `;
        } else {
            thead.innerHTML = `
                <th style="width: 40px;"><input type="checkbox" id="selectAll"></th>
                <th style="font-family: 'Courier New', monospace; font-size: 0.85rem; color: #635bff; font-weight: 700;">ID</th>
                <th style="cursor: pointer;" onclick="sortEvents('event_name')">Event Name ${getSortIcon('event_name')}</th>
                <th style="cursor: pointer;" onclick="sortEvents('event_date')">Date ${getSortIcon('event_date')}</th>
                <th>Category</th>
                <th>Ticket Type</th>
                <th>Regular</th>
                <th>VIP</th>
                <th>Premium</th>
                <th style="cursor: pointer;" onclick="sortEvents('total_tickets')">Capacity ${getSortIcon('total_tickets')}</th>
                <th class="text-center">Sales</th>
                <th>Status</th>
                <th class="text-center">Actions</th>
            `;
        }
        if (window.lucide) lucide.createIcons();
    }

    if (events.length === 0) {
        const colCount = currentTab === 'trash' ? 8 : 10;
        tbody.innerHTML = `<tr><td colspan="${colCount}" style="text-align: center; padding: 2rem; color: var(--client-text-muted);">${currentTab === 'trash' ? '🎉 Trash is empty!' : 'No events yet. Create your first event!'}</td></tr>`;
        return;
    }

    tbody.innerHTML = events.map(event => {
        const user = storage.getUser();
        const clientNameSlug = (user?.name || '').toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-');

        if (currentTab === 'trash') {
            const deletedAt = event.deleted_at ? new Date(event.deleted_at).toLocaleDateString() : '—';
            return `
            <tr data-id="${event.id}">
                <td><input type="checkbox" class="event-checkbox" data-id="${event.id}"></td>
                <td style="font-family:monospace;font-size:0.85rem;color:#ef4444;font-weight:700;">${event.custom_id || event.id}</td>
                <td><div style="font-weight: 600;">${(event.event_name || '').replace(/\s*#\d+$/, '')}</div></td>
                <td>${event.event_type}</td>
                <td>${(event.event_date || '').split('-').reverse().join('/')}</td>
                <td>
                    ${(() => {
                    const basePrice = parseFloat(event.price) || 0;
                    const regPrice = parseFloat(event.regular_price) || 0;
                    const vPrice = parseFloat(event.vip_price) || 0;
                    const premPrice = parseFloat(event.premium_price) || 0;
                    const isFree = basePrice === 0 && regPrice === 0 && vPrice === 0 && premPrice === 0;
                    return isFree ? 'Free' : (basePrice > 0 ? `₦${basePrice.toLocaleString()}` : 'Paid');
                })()}
                </td>
                <td><span style="color:#ef4444;">${deletedAt}</span></td>
                <td class="text-center">
                    <div style="display: flex; gap: 0.5rem; justify-content: center;">
                        <button onclick="restoreEvent(${event.id})" 
                                class="action-icon-btn" 
                                title="Restore Event" 
                                style="background: none; border: none; cursor: pointer; font-size: 1.2rem; padding: 0.25rem 0.5rem; transition: transform 0.2s;">
                            🔄
                        </button>
                        <button onclick="permanentDeleteEvent(${event.id})" 
                                class="action-icon-btn" 
                                title="Delete Permanently" 
                                style="background: none; border: none; cursor: pointer; font-size: 1.2rem; padding: 0.25rem 0.5rem; transition: transform 0.2s;">
                            🗑️
                        </button>
                    </div>
                </td>
            </tr>`;
        }

        // Parse metadata for ticket details
        let metadata = {};
        try {
            metadata = typeof event.metadata === 'string' ? JSON.parse(event.metadata) : (event.metadata || {});
        } catch (e) {
            console.error("Error parsing event metadata:", e);
        }

        const ticketTypeMode = metadata.ticket_type_mode || 'all';

        // Fix: Determine if free by checking all potential price sources
        const basePrice = parseFloat(event.price) || 0;
        const regPrice = parseFloat(metadata.regular_price) || 0;
        const vPrice = parseFloat(metadata.vip_price) || 0;
        const premPrice = parseFloat(metadata.premium_price) || 0;

        const isFree = basePrice === 0 && regPrice === 0 && vPrice === 0 && premPrice === 0;

        // If not free, but base price is 0, we might have tiered prices
        let displayPrice = 'Free';
        if (!isFree) {
            const mode = metadata.ticket_type_mode || 'all';
            if (mode === 'all' || mode.includes('all')) {
                displayPrice = basePrice > 0 ? `₦${basePrice.toLocaleString()}` : 'Paid';
            } else {
                const modes = mode.split(',').map(m => m.trim().toLowerCase());
                const prices = [];
                if (modes.includes('regular') && regPrice > 0) prices.push(`Reg: ₦${regPrice.toLocaleString()}`);
                if (modes.includes('vip') && vPrice > 0) prices.push(`VIP: ₦${vPrice.toLocaleString()}`);
                if (modes.includes('premium') && premPrice > 0) prices.push(`Prem: ₦${premPrice.toLocaleString()}`);

                if (prices.length > 0) {
                    displayPrice = prices.join(', ');
                } else if (basePrice > 0) {
                    displayPrice = `₦${basePrice.toLocaleString()}`;
                } else {
                    displayPrice = 'Paid';
                }
            }
        }

        let regularPrice = isFree ? 'Free' : '—';
        let vipPrice = isFree ? 'Free' : '—';
        let premiumPrice = isFree ? 'Free' : '—';

        if (!isFree) {
            if (ticketTypeMode === 'all' || ticketTypeMode.includes('all')) {
                const p = `₦${basePrice.toLocaleString()}`;
                regularPrice = p;
                vipPrice = p;
                premiumPrice = p;
            } else {
                const modes = ticketTypeMode.split(',').map(m => m.trim().toLowerCase());
                if (modes.includes('regular')) regularPrice = `₦${regPrice.toLocaleString()}`;
                if (modes.includes('vip')) vipPrice = `₦${vPrice.toLocaleString()}`;
                if (modes.includes('premium')) premiumPrice = `₦${premPrice.toLocaleString()}`;
            }
        }

        const ticketTypeDisplay = isFree ? 'Free' : (ticketTypeMode.split(',').map(m => m.trim().charAt(0).toUpperCase() + m.trim().slice(1)).join(', '));

        return `
        <tr onclick="window.previewEvent(${event.id})" 
            style="cursor: pointer;"
            data-id="${event.id}" 
            data-tag="${event.tag || ''}" 
            data-status="${event.status}"
            data-client-name="${clientNameSlug}"
            data-description="${event.description || ''}"
            data-address="${event.address || ''}"
            data-phone="${event.phone_contact_1 || ''}"
            data-date="${event.event_date}"
            data-time="${event.event_time}"
            data-total-tickets="${event.total_tickets || 0}"
            data-ticket-count="${event.ticket_count || 0}"
            data-image="${event.image_path || ''}"
            data-event-name="${event.event_name.replace(/\s*#\d+$/, '')}"
            data-category="${event.event_type}"
            data-price="${isFree ? 'Free' : (ticketTypeMode === 'all' || ticketTypeMode.includes('all') ? `₦${basePrice.toLocaleString()}` : 'Paid')}"
            data-attendees="${event.attendee_count || 0}">
            <td><input type="checkbox" class="event-checkbox" data-id="${event.id}"></td>
            <td style="font-family:monospace;font-size:0.85rem;color:#635bff;font-weight:700;">${event.custom_id || event.id}</td>
            <td>
                <div style="font-weight: 600;">${(event.event_name || '').replace(/\s*#\d+$/, '')}</div>
            </td>
            <td>${(event.event_date || '').split('-').reverse().join('/')}</td>
            <td>${event.event_type}</td>
            <td>
                <span style="background: ${isFree ? '#ecfdf5' : '#eff6ff'}; color: ${isFree ? '#722f37' : '#2563eb'}; padding: 2px 8px; border-radius: 4px; font-weight: 600; font-size: 0.8rem;">
                    ${ticketTypeDisplay}
                </span>
            </td>
            <td><span style="font-weight: 600;">${regularPrice}</span></td>
            <td><span style="font-weight: 600;">${vipPrice}</span></td>
            <td><span style="font-weight: 600;">${premiumPrice}</span></td>
            <td>
                <span style="padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 700; color: #374151; background: #f3f4f6;">
                    ${event.total_tickets || 'No Limit'}
                </span>
            </td>
            <td class="text-center">
                <div style="font-weight: 800; color: #10b981;">
                    ${event.sales_count || event.attendee_count || 0}
                </div>
            </td>
            <td>
                <span style="color: ${event.status === 'published' ? '#16a34a' : getStatusColor(event.status)}; font-weight: 700;${event.status === 'published' ? ' background: #dcfce7; padding: 2px 8px; border-radius: 4px; font-size: 0.8rem;' : ''}">
                    ${event.status.charAt(0).toUpperCase() + event.status.slice(1)}
                </span>
            </td>
            <td class="text-center" onclick="event.stopPropagation()">
                <div style="display: flex; gap: 0.5rem; justify-content: center;">
                    <button onclick="${event.attendee_count > 0 ? "showLockedNotification('edit')" : `editEvent(${event.id})`}" 
                            class="action-icon-btn ${event.attendee_count > 0 ? 'locked' : ''}" 
                            title="${event.attendee_count > 0 ? 'Locked: Already has attendees' : 'Edit Event'}" 
                            style="background: none; border: none; cursor: ${event.attendee_count > 0 ? 'not-allowed' : 'pointer'}; font-size: 1.2rem; padding: 0.25rem 0.5rem; transition: transform 0.2s; opacity: ${event.attendee_count > 0 ? '0.5' : '1'}">
                        ✏️
                    </button>
                    <button id="deleteBtn-${event.id}" 
                            onclick="${event.attendee_count > 0 ? "showLockedNotification('delete')" : `deleteEvent(${event.id})`}" 
                            class="action-icon-btn ${event.attendee_count > 0 ? 'locked' : ''}" 
                            title="${event.attendee_count > 0 ? 'Locked: Already has attendees' : 'Delete Event'}" 
                            style="background: none; border: none; cursor: ${event.attendee_count > 0 ? 'not-allowed' : 'pointer'}; font-size: 1.2rem; padding: 0.25rem 0.5rem; transition: transform 0.2s; opacity: ${event.attendee_count > 0 ? '0.5' : '1'}">
                        🗑️
                    </button>
                </div>
            </td>
        </tr>
    `;
    }).join('');

    // Handle Select All
    const selectAll = document.getElementById('selectAll');
    if (selectAll) {
        selectAll.onchange = (e) => {
            const checkboxes = document.querySelectorAll('.event-checkbox');
            checkboxes.forEach(cb => cb.checked = e.target.checked);
        };
    }

    // Prevent preview modal open on checkbox click
    document.querySelectorAll('.event-checkbox, #selectAll').forEach(cb => {
        cb.onclick = (e) => e.stopPropagation();
    });

    updateSelectAllState();
}

function updateSelectAllState() {
    const selectAll = document.getElementById('selectAll');
    if (!selectAll) return;
    const pageCheckboxes = document.querySelectorAll('.event-checkbox');
    if (pageCheckboxes.length === 0) {
        selectAll.checked = false;
        return;
    }
    const allCheckedOnPage = Array.from(pageCheckboxes).every(cb => cb.checked);
    selectAll.checked = allCheckedOnPage;
}

function updatePagination(events) {
    if (!pagination) {
        pagination = new EventraPagination({
            data: events,
            containerId: 'paginationContainer',
            persistState: true,
            onPageChange: (pageData, shouldScroll = true) => {
                updateEventsTable(pageData);
                if (shouldScroll) window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        });
        updateEventsTable(pagination.getPageData(), false);
    } else {
        pagination.updateData(events);
    }
}

function getSortIcon(key) {
    if (sortConfig.key !== key) return '<i data-lucide="arrow-up-down" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle;"></i>';
    return sortConfig.direction === 'asc'
        ? '<i data-lucide="arrow-up" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; color: var(--card-blue);"></i>'
        : '<i data-lucide="arrow-down" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; color: var(--card-blue);"></i>';
}

function sortEvents(key, toggle = true) {
    if (toggle) {
        if (sortConfig.key === key) {
            sortConfig.direction = sortConfig.direction === 'asc' ? 'desc' : 'asc';
        } else {
            sortConfig.key = key;
            sortConfig.direction = 'asc';
        }
    }

    eventsData.sort((a, b) => {
        let valA = a[key];
        let valB = b[key];

        // Handle numeric values
        if (key === 'price' || key === 'total_tickets' || key === 'sales_count') {
            valA = parseFloat(valA) || 0;
            valB = parseFloat(valB) || 0;
        }

        if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
    });

    updatePagination(eventsData);
}
window.sortEvents = sortEvents;

function getStatusColor(status) {
    const colors = {
        'published': 'var(--card-green)',
        'scheduled': 'var(--card-blue)',
        'draft': 'var(--card-red)',
        'restored': 'var(--card-blue)',
        'cancelled': '#999'
    };
    return colors[status] || '#000';
}

function initCreateEventButton() {
    const user = storage.getUser();
    const createBtn = document.getElementById('eventsCreateEventBtn');

    if (createBtn && user) {
        if (user.verification_status !== 'verified') {
            createBtn.disabled = true;
            createBtn.title = 'Your profile must be approved to create events';
        } else {
            createBtn.disabled = false;
            createBtn.title = '';
        }
    }
}

// showCreateEventModal is defined in create-event.js
// Event row clicks now open showEventActionModal instead of edit


async function editEvent(eventId) {
    try {
        // ── 1. Try the already-loaded local cache first (fastest, no network) ──
        const cachedEvent = eventsData.find(e => e.id == eventId);
        if (cachedEvent) {
            showCreateEventModal(cachedEvent);
            return;
        }

        // ── 2. Fallback: fetch all events without an artificial limit ──
        const user = storage.getUser();
        const response = await apiFetch(`/api/events/get-events.php?client_id=${user.id}&limit=all`);
        const result = await response.json();

        if (result.success) {
            const event = result.events.find(e => e.id == eventId);
            if (event) {
                showCreateEventModal(event);
            } else {
                showNotification('Event not found', 'error');
            }
        } else {
            showNotification('Failed to load event details', 'error');
        }
    } catch (error) {
        showNotification('Failed to load event details', 'error');
    }
}

// ─── SOFT DELETE WITH LOADING + OPTIMISTIC UI + UNDO TOAST ──────────────────

async function deleteEvent(eventId) {
    const result = await Swal.fire({
        title: 'Move to Trash?',
        text: 'This event will be moved to Trash. You can restore it anytime.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#9ca3af',
        confirmButtonText: 'Yes, Move to Trash',
        cancelButtonText: 'Cancel'
    });

    if (!result.isConfirmed) return;

    // ── Loading state on the button ──
    const btn = document.getElementById(`deleteBtn-${eventId}`);
    let originalBtnContent = '';
    if (btn) {
        originalBtnContent = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<span class="btn-spinner"></span>';
    }

    // ── Optimistic UI: hide the row immediately ──
    const row = document.querySelector(`tr[data-id="${eventId}"]`);
    if (row) {
        row.style.transition = 'opacity 0.3s, transform 0.3s';
        row.style.opacity = '0';
        row.style.transform = 'translateX(20px)';
    }

    try {
        const response = await apiFetch('/api/events/delete-event.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ event_id: eventId })
        });

        const data = await response.json();

        if (data.success) {
            // Remove the row from DOM after animation
            setTimeout(() => { if (row) row.remove(); }, 350);

            // Refresh stats in background
            const user = storage.getUser();
            refreshStats(user.id);

            // Show toast with Undo action
            showUndoToast(eventId);
            setTimeout(() => window.location.reload(), 1500);
        } else {
            // Revert optimistic UI
            if (row) {
                row.style.opacity = '1';
                row.style.transform = 'translateX(0)';
            }
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = originalBtnContent;
            }
            showNotification('Failed to delete: ' + data.message, 'error');
        }
    } catch (error) {
        // Revert optimistic UI
        if (row) {
            row.style.opacity = '1';
            row.style.transform = 'translateX(0)';
        }
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalBtnContent;
        }
        showNotification(error.message || 'An error occurred', 'error');
    }
}

function showUndoToast(eventId) {
    // Remove any existing undo toast
    const existing = document.getElementById('undoToast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'undoToast';
    toast.className = 'undo-toast';
    toast.innerHTML = `
        <span>🗑️ Event moved to Trash</span>
        <button onclick="undoDelete(${eventId})" class="toast-undo-btn">Undo</button>
    `;
    document.body.appendChild(toast);

    // Animate in
    requestAnimationFrame(() => {
        toast.classList.add('undo-toast-visible');
    });

    // Auto-dismiss after 6 seconds
    toast._timeout = setTimeout(() => {
        dismissUndoToast();
    }, 6000);
}

function dismissUndoToast() {
    const toast = document.getElementById('undoToast');
    if (!toast) return;
    clearTimeout(toast._timeout);
    toast.classList.remove('undo-toast-visible');
    setTimeout(() => toast.remove(), 400);
}

async function undoDelete(eventId) {
    dismissUndoToast();

    try {
        const response = await apiFetch('/api/events/restore-event.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ event_id: eventId })
        });

        const data = await response.json();

        if (data.success) {
            showNotification('Event restored successfully!', 'success');
            const user = storage.getUser();
            await loadEvents(user.id);
            refreshStats(user.id);
            setTimeout(() => window.location.reload(), 1500);
        } else {
            showNotification('Failed to undo: ' + data.message, 'error');
        }
    } catch (error) {
        showNotification(error.message || 'Failed to undo deletion', 'error');
    }
}
window.undoDelete = undoDelete;

async function refreshStats(clientId) {
    try {
        const user = storage.getUser();
        const response = await apiFetch(`/api/events/get-events.php?client_id=${user.id}&limit=1`);
        const result = await response.json();
        if (result.success && result.stats) {
            updateStatsCards(result.stats);
            updateTrashBadge(result.stats.deleted_events || 0);
            initCreateEventButton(); // Re-evaluate button state
        }
    } catch (e) {
        // silent
    }
}

// ─── TRASH VIEW ─────────────────────────────────────────────────────────────

async function loadTrashEvents() {
    const tbody = document.querySelector('.table-card table tbody');
    if (!tbody) return;

    // Update thead for trash view
    const thead = document.querySelector('.table-card table thead tr');
    if (thead) {
        thead.innerHTML = `
            <th style="width: 40px;"><input type="checkbox" id="selectAll"></th>
            <th>Event ID</th>
            <th>Event Name</th>
            <th>Category</th>
            <th>Date</th>
            <th>Price</th>
            <th>Deleted On</th>
            <th class="text-center">Actions</th>
        `;
    }

    tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 2rem; color: var(--client-text-muted);"><span class="btn-spinner" style="margin-right: 8px;"></span>Loading trash...</td></tr>';

    try {
        const response = await apiFetch('/api/events/get-trash.php?limit=100');
        const result = await response.json();

        if (result.success) {
            eventsData = result.events;
            if (eventsData.length === 0) {
                tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 2rem; color: var(--client-text-muted);">🎉 Trash is empty!</td></tr>';
                if (pagination) pagination.updateData([]);
                return;
            }

            updatePagination(eventsData);
        } else {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 2rem; color: #ef4444;">Failed to load trash</td></tr>';
        }
    } catch (error) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 2rem; color: #ef4444;">An error occurred</td></tr>';
    }
}

// ─── RESTORE EVENT (from Trash tab) ─────────────────────────────────────────

async function restoreEvent(eventId) {
    const result = await Swal.fire({
        title: 'Restore Event?',
        text: 'This event will be restored with "Restored" status. You can then edit and re-publish it.',
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#722f37',
        cancelButtonColor: '#9ca3af',
        confirmButtonText: 'Yes, Restore',
        cancelButtonText: 'Cancel'
    });

    if (!result.isConfirmed) return;

    // Optimistic: hide the row
    const row = document.querySelector(`tr[data-id="${eventId}"]`);
    if (row) {
        row.style.opacity = '0';
        row.style.transform = 'translateX(-20px)';
    }

    try {
        const response = await apiFetch('/api/events/restore-event.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ event_id: eventId })
        });

        const data = await response.json();

        if (data.success) {
            setTimeout(() => { if (row) row.remove(); }, 350);
            showNotification('Event restored! Status set to Restored.', 'success');
            const user = storage.getUser();
            refreshStats(user.id);

            // Auto-switch to Active Events tab and reload the full list
            setTimeout(() => {
                switchEventTab('active');
                window.location.reload();
            }, 500);
        } else {
            // Revert
            if (row) { row.style.opacity = '1'; row.style.transform = 'translateX(0)'; }
            showNotification('Restore failed: ' + data.message, 'error');
        }
    } catch (error) {
        if (row) { row.style.opacity = '1'; row.style.transform = 'translateX(0)'; }
        showNotification(error.message || 'An error occurred', 'error');
    }
}
window.restoreEvent = restoreEvent;

// ─── PERMANENT DELETE (from Trash tab) ──────────────────────────────────────

async function permanentDeleteEvent(eventId) {
    const result = await Swal.fire({
        title: 'Delete Forever?',
        html: '<p style="color:#ef4444;font-weight:600;">⚠️ This action is permanent and cannot be undone.</p><p>The event and all related data will be erased from the database.</p>',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#9ca3af',
        confirmButtonText: 'Yes, Delete Forever',
        cancelButtonText: 'Cancel'
    });

    if (!result.isConfirmed) return;

    const row = document.querySelector(`tr[data-id="${eventId}"]`);
    if (row) {
        row.style.opacity = '0';
        row.style.transform = 'translateX(20px)';
    }

    try {
        const response = await apiFetch('/api/events/delete-event-permanent.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ event_id: eventId })
        });

        const data = await response.json();

        if (data.success) {
            setTimeout(() => { if (row) row.remove(); }, 350);
            showNotification('Event permanently deleted', 'success');
            const user = storage.getUser();
            refreshStats(user.id);

            setTimeout(() => {
                const remaining = document.querySelectorAll('.table-card table tbody tr[data-id]');
                if (remaining.length === 0) {
                    const tbody = document.querySelector('.table-card table tbody');
                    if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 2rem; color: var(--client-text-muted);">🎉 Trash is empty!</td></tr>';
                }
                window.location.reload();
            }, 400);
        } else {
            if (row) { row.style.opacity = '1'; row.style.transform = 'translateX(0)'; }
            showNotification('Delete failed: ' + data.message, 'error');
        }
    } catch (error) {
        if (row) { row.style.opacity = '1'; row.style.transform = 'translateX(0)'; }
        showNotification(error.message || 'An error occurred', 'error');
    }
}
window.permanentDeleteEvent = permanentDeleteEvent;

// ─── PREVIEW EVENT ──────────────────────────────────────────────────────────
async function previewEvent(eventId) {
    const row = document.querySelector(`tr[data-id="${eventId}"]`);
    if (!row) return;

    // Provide visual feedback while loading
    row.style.opacity = '0.7';

    let event;
    try {
        const response = await apiFetch(`/api/events/get-event.php?id=${eventId}`);
        const result = await response.json();

        if (result.success && result.event) {
            const data = result.event;

            // Format prices dynamically
            let formattedPrice = 'Free';
            const basePrice = parseFloat(data.price) || 0;
            const regPrice = parseFloat(data.regular_price) || 0;
            const vPrice = parseFloat(data.vip_price) || 0;
            const premPrice = parseFloat(data.premium_price) || 0;

            const isFree = basePrice === 0 && regPrice === 0 && vPrice === 0 && premPrice === 0;

            if (!isFree) {
                const mode = data.ticket_type_mode || 'all';
                if (mode === 'all' || mode.includes('all')) {
                    formattedPrice = `₦${basePrice.toLocaleString()}`;
                } else {
                    const modes = mode.split(',').map(m => m.trim().toLowerCase());
                    const prices = [];
                    if (modes.includes('regular') && regPrice > 0) prices.push(`Regular ₦${regPrice.toLocaleString()}`);
                    if (modes.includes('vip') && vPrice > 0) prices.push(`VIP ₦${vPrice.toLocaleString()}`);
                    if (modes.includes('premium') && premPrice > 0) prices.push(`Premium ₦${premPrice.toLocaleString()}`);

                    if (prices.length > 0) {
                        formattedPrice = prices.join(', ');
                    } else if (basePrice > 0) {
                        formattedPrice = `₦${basePrice.toLocaleString()}`;
                    } else {
                        formattedPrice = 'Paid';
                    }
                }
            }

            let parsedLocations = [];
            if (data.locations) {
                try {
                    parsedLocations = typeof data.locations === 'string' ? JSON.parse(data.locations) : data.locations;
                } catch (e) { }
            }
            if ((!parsedLocations || parsedLocations.length === 0) && data.state) {
                let stateList = [];
                try {
                    stateList = typeof data.state === 'string' && data.state.startsWith('[') ? JSON.parse(data.state) : [data.state];
                } catch (e) {
                    stateList = [data.state];
                }
                parsedLocations = stateList.map(s => ({
                    state: s,
                    address: data.address || ''
                }));
            }

            event = {
                id: eventId,
                name: data.event_name,
                custom_id: data.custom_id || data.id, // Using Alphanumeric ID for display
                client_name: data.client_name || 'N/A',
                price: formattedPrice,
                attendees: data.attendee_count,
                category: data.category || data.event_type || 'General',
                status: data.status ? data.status.charAt(0).toUpperCase() + data.status.slice(1) : 'Draft',
                image: data.image_path || 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=1200&fit=crop',
                tag: data.tag || 'Standard',
                description: data.description,
                address: data.address,
                state: data.state,
                locations: parsedLocations,
                date: data.event_date,
                time: data.event_time,
                total_tickets: data.total_tickets || 'No Limit',
                ticket_count: data.ticket_count === null ? '∞' : data.ticket_count,
                phone: data.phone_contact_1 || 'N/A'
            };
        } else {
            throw new Error(result.message || 'Event not found');
        }
    } catch (e) {
        showNotification('Could not load event details.', 'error');
        row.style.opacity = '1';
        return;
    } finally {
        row.style.opacity = '1';
    }

    const eventName = event.name;
    const price = event.price;
    const attendees = event.attendees;
    const category = event.category;
    const status = event.status;
    const eventImage = event.image;
    const tag = event.tag;
    const description = event.description;
    const address = event.address;
    const date = event.date;
    const time = event.time;
    const phone = event.phone;
    const clientName = event.client_name;
    const state = event.state;
    const totalTickets = event.total_tickets;
    const remainingTickets = event.ticket_count;

    // Create Modal Backdrop (if not exists)
    let backdrop = document.querySelector('.preview-modal-backdrop');
    if (!backdrop) {
        backdrop = document.createElement('div');
        backdrop.className = 'preview-modal-backdrop';
        backdrop.setAttribute('role', 'dialog');
        backdrop.setAttribute('aria-modal', 'true');
        backdrop.setAttribute('aria-hidden', 'false');
        backdrop.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: none; justify-content: center; align-items: center; z-index: 1000; backdrop-filter: blur(4px); transition: all 0.3s ease; overflow-y: auto;';
        backdrop.innerHTML = `
            <div class="preview-modal" style="background: white; width: 95%; max-width: 900px; border-radius: 16px; overflow: hidden; position: relative; transform: translateY(20px); transition: all 0.3s ease; box-shadow: 0 20px 40px rgba(0,0,0,0.2); max-height: 90vh; display: flex; flex-direction: column; margin: auto;">
                <button class="preview-close" aria-label="Close Preview" style="position: absolute; top: 1rem; right: 1rem; background: rgba(255,255,255,0.8); border: none; width: 32px; height: 32px; border-radius: 50%; font-size: 1.5rem; cursor: pointer; display: flex; align-items: center; justify-content: center; z-index: 10; box-shadow: 0 2px 8px rgba(0,0,0,0.1); backdrop-filter: blur(4px);">×</button>
                <div id="previewContent" style="overflow-y: auto; flex: 1;"></div>
            </div>
        `;
        document.body.appendChild(backdrop);

        const closeBtn = backdrop.querySelector('.preview-close');
        closeBtn.onclick = () => {
            backdrop.style.opacity = '0';
            backdrop.querySelector('.preview-modal').style.transform = 'translateY(20px)';
            setTimeout(() => { backdrop.style.display = 'none'; }, 300);
        };
        backdrop.onclick = (e) => {
            if (e.target === backdrop) closeBtn.click();
        };
    }

    const content = backdrop.querySelector('#previewContent');
    const statusColor = getStatusColor(status.toLowerCase());

    content.innerHTML = `
        <div class="event-preview-container" style="font-family: 'Plus Jakarta Sans', sans-serif;">
            <!-- Hero Header -->
            <div style="position: relative; height: 300px; border-radius: 0 0 32px 32px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.1);">
                <img src="${eventImage.startsWith('http') ? eventImage : (eventImage.startsWith('/') ? '../..' + eventImage : '../../' + eventImage)}" style="width: 100%; height: 100%; object-fit: cover; transition: transform 0.5s ease;" alt="Event">
                <div style="position: absolute; inset: 0; background: linear-gradient(to top, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.2) 50%, transparent 100%);"></div>
                
                <div style="position: absolute; top: 1.5rem; left: 1.5rem; display: flex; gap: 10px;">
                    <div style="background: ${statusColor}; color: white; padding: 0.6rem 1.2rem; border-radius: 12px; font-weight: 800; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; backdrop-filter: blur(8px); box-shadow: 0 4px 15px rgba(0,0,0,0.2);">
                        ${status}
                    </div>
                    <div style="background: rgba(255,255,255,0.2); color: white; padding: 0.6rem 1.2rem; border-radius: 12px; font-weight: 800; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; backdrop-filter: blur(12px); border: 1px solid rgba(255,255,255,0.3);">
                        ID: ${event.custom_id}
                    </div>
                </div>

                <div style="position: absolute; bottom: 2rem; left: 2rem; right: 2rem;">
                    <h1 style="font-size: 2.25rem; font-weight: 800; color: white; margin-bottom: 0.5rem; text-shadow: 0 2px 10px rgba(0,0,0,0.5);">${escapeHTML(eventName.replace(/\s*#\d+$/, ''))}</h1>
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <div style="width: 32px; height: 32px; background: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 800; color: var(--client-primary); font-size: 0.8rem;">
                            ${escapeHTML(clientName.charAt(0))}
                        </div>
                        <span style="color: rgba(255,255,255,0.9); font-weight: 600; font-size: 1rem;">Hosted by <span style="color: white; font-weight: 700;">${escapeHTML(clientName)}</span></span>
                    </div>
                </div>
            </div>

            <!-- Content Body -->
            <div style="padding: 2.5rem;">
                <!-- Quick Stats Grid -->
                <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; margin-bottom: 3rem;">
                    <div style="background: #f8fafc; padding: 1.25rem; border-radius: 20px; border: 1px solid #e2e8f0; transition: all 0.3s ease;">
                        <div style="font-size: 1.5rem; margin-bottom: 0.5rem;">📅</div>
                        <div style="font-size: 0.65rem; color: #94a3b8; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em;">Date</div>
                        <div style="font-weight: 700; color: #1e293b; font-size: 0.9rem;">${(date || '').split('-').reverse().join('/')}</div>
                    </div>
                    <div style="background: #f8fafc; padding: 1.25rem; border-radius: 20px; border: 1px solid #e2e8f0;">
                        <div style="font-size: 1.5rem; margin-bottom: 0.5rem;">🕒</div>
                        <div style="font-size: 0.65rem; color: #94a3b8; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em;">Time</div>
                        <div style="font-weight: 700; color: #1e293b; font-size: 0.9rem;">${time.substring(0, 5)}</div>
                    </div>
                    <div style="background: #f8fafc; padding: 1.25rem; border-radius: 20px; border: 1px solid #e2e8f0;">
                        <div style="font-size: 1.5rem; margin-bottom: 0.5rem;">💎</div>
                        <div style="font-size: 0.65rem; color: #94a3b8; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em;">Tickets</div>
                        <div style="font-weight: 700; color: #1e293b; font-size: 0.9rem;">${escapeHTML(price)}</div>
                    </div>
                    <div style="background: #f8fafc; padding: 1.25rem; border-radius: 20px; border: 1px solid #e2e8f0;">
                        <div style="font-size: 1.5rem; margin-bottom: 0.5rem;"></div>
                        <div style="font-size: 0.65rem; color: #94a3b8; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em;">Category</div>
                        <div style="font-weight: 700; color: #1e293b; font-size: 0.9rem;">${escapeHTML(category)}</div>
                    </div>
                </div>

                <!-- Info Sections -->
                <div style="display: grid; grid-template-columns: 1.5fr 1fr; gap: 2.5rem;">
                    <div>
                        <h3 style="font-size: 1rem; font-weight: 800; color: #1e293b; margin-bottom: 1.25rem; display: flex; align-items: center; gap: 10px;">
                            <span style="width: 4px; height: 16px; background: var(--client-primary); border-radius: 4px;"></span>
                            About this Event
                        </h3>
                        <div style="color: #475569; line-height: 1.8; font-size: 0.95rem; white-space: pre-wrap; margin-bottom: 2rem;">
                            ${escapeHTML(description) || "The organizer hasn't provided a detailed description for this event yet."}
                        </div>

                        <h3 style="font-size: 1rem; font-weight: 800; color: #1e293b; margin-bottom: 1.25rem; display: flex; align-items: center; gap: 10px;">
                            <span style="width: 4px; height: 16px; background: var(--client-primary); border-radius: 4px;"></span>
                            Venue Location
                        </h3>
                        ${(() => {
            if (event.locations && event.locations.length > 0) {
                const uniqueLocations = [];
                const seenStates = new Set();
                for (const loc of event.locations) {
                    if (!seenStates.has(loc.state)) {
                        seenStates.add(loc.state);
                        uniqueLocations.push(loc);
                    }
                }

                if (uniqueLocations.length === 1) {
                    const loc = uniqueLocations[0];
                    return `
                                        <div style="display: flex; align-items: flex-start; gap: 15px; background: #f1f5f9; padding: 1.5rem; border-radius: 20px;">
                                            <div style="font-size: 1.5rem;">📍</div>
                                            <div>
                                                <div style="font-weight: 700; color: #1e293b; margin-bottom: 0.25rem;">${escapeHTML(loc.state) || 'Location'}</div>
                                                <div style="color: #64748b; font-size: 0.875rem;">${escapeHTML(loc.address) || 'No specific address available'}</div>
                                            </div>
                                        </div>
                                    `;
                } else {
                    return `
                                        <div style="background: #f1f5f9; padding: 1.5rem; border-radius: 20px;">
                                            <div style="display: flex; align-items: center; justify-content: space-between; cursor: pointer; user-select: none;" onclick="const content = document.getElementById('venueDropdownContent_${event.id}'); const arrow = document.getElementById('venueDropdownArrow_${event.id}'); if(content.style.display === 'none'){ content.style.display = 'block'; arrow.style.transform = 'rotate(180deg)'; } else { content.style.display = 'none'; arrow.style.transform = 'rotate(0deg)'; }">
                                                <div style="display: flex; align-items: center; gap: 15px;">
                                                    <div style="font-size: 1.5rem;">📍</div>
                                                    <div style="font-weight: 700; color: #1e293b;">Multiple Locations Selected</div>
                                                </div>
                                                <div style="display: flex; align-items: center; gap: 8px; color: var(--client-primary); font-weight: 600; font-size: 0.9rem;">
                                                    See more
                                                    <span id="venueDropdownArrow_${event.id}" style="display: inline-block; transition: transform 0.3s ease;">▼</span>
                                                </div>
                                            </div>
                                            <div id="venueDropdownContent_${event.id}" style="display: none; margin-top: 1rem; padding-top: 1rem; border-top: 1px solid #e2e8f0; max-height: 200px; overflow-y: auto;">
                                                <div style="display: grid; gap: 1rem;">
                                                    ${uniqueLocations.map(loc => `
                                                        <div style="background: white; padding: 1rem; border-radius: 12px; border: 1px solid #e2e8f0;">
                                                            <div style="font-weight: 700; color: #1e293b; margin-bottom: 0.25rem;">${escapeHTML(loc.state)}</div>
                                                            <div style="color: #64748b; font-size: 0.875rem;">${escapeHTML(loc.address) || 'No specific address available'}</div>
                                                        </div>
                                                    `).join('')}
                                                </div>
                                            </div>
                                        </div>
                                    `;
                }
            } else {
                return `
                                    <div style="display: flex; align-items: flex-start; gap: 15px; background: #f1f5f9; padding: 1.5rem; border-radius: 20px;">
                                        <div style="font-size: 1.5rem;">📍</div>
                                        <div>
                                            <div style="font-weight: 700; color: #1e293b; margin-bottom: 0.25rem;">${escapeHTML(state) || 'Location'}</div>
                                            <div style="color: #64748b; font-size: 0.875rem;">${escapeHTML(address) || 'No specific address available'}</div>
                                        </div>
                                    </div>
                                `;
            }
        })()}
                    </div>

                    <div>
                        <div style="background: #fff; border: 1.5px solid #eef2ff; padding: 2rem; border-radius: 24px; box-shadow: 0 10px 40px rgba(99, 102, 241, 0.05); margin-bottom: 2rem;">
                            <div style="text-align: center; margin-bottom: 1.5rem;">
                                <div style="font-size: 2.5rem; font-weight: 800; color: var(--client-primary); margin-bottom: 0.25rem;">${attendees}</div>
                                <div style="font-size: 0.7rem; color: #94a3b8; font-weight: 800; text-transform: uppercase;">Total Attendees</div>
                            </div>
                            
                            <div style="height: 6px; background: #f1f5f9; border-radius: 10px; overflow: hidden; margin-bottom: 2rem;">
                                <div style="width: 65%; height: 100%; background: var(--client-primary); border-radius: 10px;"></div>
                            </div>

                            <div style="display: flex; flex-direction: column; gap: 12px;">
                                <div style="display: flex; justify-content: space-between; font-size: 0.875rem;">
                                    <span style="color: #64748b; font-weight: 600;">Priority</span>
                                    <span style="color: #1e293b; font-weight: 700; text-transform: uppercase;">${escapeHTML(event.priority || 'Normal')}</span>
                                </div>
                                <div style="display: flex; justify-content: space-between; font-size: 0.875rem;">
                                    <span style="color: #64748b; font-weight: 600;">Type</span>
                                    <span style="color: #1e293b; font-weight: 700;">${escapeHTML(tag) || 'Standard'}</span>
                                </div>
                                <div style="display: flex; justify-content: space-between; font-size: 0.875rem;">
                                    <span style="color: #64748b; font-weight: 600;">Contact</span>
                                    <span style="color: #1e293b; font-weight: 700;">${escapeHTML(phone) || '—'}</span>
                                </div>
                            </div>
                        </div>

                        ${status.toLowerCase() !== 'published' ? `
                            <button onclick="publishEvent(${eventId})" style="width: 100%; padding: 1.25rem; background: #722f37; color: white; border: none; border-radius: 18px; font-weight: 800; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 12px; transition: all 0.3s ease; box-shadow: 0 10px 20px rgba(16, 185, 129, 0.2);">
                                🚀 Publish Event Now
                            </button>
                        ` : ''}
                    </div>
                </div>
            </div>
        </div>
    `;

    backdrop.style.display = 'flex';
    backdrop.style.opacity = '0';
    setTimeout(() => {
        backdrop.style.opacity = '1';
        backdrop.querySelector('.preview-modal').style.transform = 'translateY(0)';
    }, 10);
}

async function publishEvent(eventId) {
    if (document.activeElement) document.activeElement.blur();

    const confirmed = await Swal.fire({
        title: 'Publish Event?',
        text: 'Are you sure you want to publish this event? It will be visible to all users on the platform.',
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#722f37',
        cancelButtonColor: '#9ca3af',
        confirmButtonText: 'Yes, Publish',
        cancelButtonText: 'Wait'
    });

    if (!confirmed.isConfirmed) return;

    // ── Step 1: call the API ──
    let publishResult;
    try {
        const response = await apiFetch('/api/events/publish-event.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ event_id: eventId })
        });
        publishResult = await response.json();
    } catch (error) {
        showNotification(error.message || 'An error occurred while publishing event', 'error');
        return;
    }

    // ── Step 2: react to the result — UI changes ONLY on success ──
    if (publishResult.success) {
        showNotification('Event published successfully!', 'success');
        setTimeout(() => window.location.reload(), 1500);

        // Safely close the preview modal (backdrop style)
        const previewBackdrop = document.querySelector('.preview-modal-backdrop');
        if (previewBackdrop) {
            const closeBtn = previewBackdrop.querySelector('.preview-close');
            if (closeBtn) closeBtn.click();
            else previewBackdrop.style.display = 'none';
        }

        // Safely close the event preview modal (modal style)
        if (typeof closeEventPreviewModal === 'function') {
            closeEventPreviewModal();
        }

        // Trigger dashboard stat update if on dashboard
        if (typeof window.loadDashboardStats === 'function') {
            const user = storage.get('user');
            if (user) window.loadDashboardStats(user.id);
        }

        // Refresh events list
        const user = storage.get('user');
        if (user) loadEvents(user.id);
    } else {
        showNotification('Failed to publish event: ' + publishResult.message, 'error');
    }
}

// Make functions globally available
window.editEvent = editEvent;
window.previewEvent = previewEvent;
window.deleteEvent = deleteEvent;
window.publishEvent = publishEvent;
function showLockedNotification(action) {
    Swal.fire({
        title: 'Event Locked',
        text: `This event cannot be ${action === 'edit' ? 'edited' : 'deleted'} because tickets have already been sold. Please contact support for critical changes.`,
        icon: 'info',
        confirmButtonColor: 'var(--client-primary)'
    });
}
window.showLockedNotification = showLockedNotification;
