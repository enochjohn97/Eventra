document.addEventListener('DOMContentLoaded', async () => {
    const clientsTableBody = document.querySelector('table tbody');
    let allClients = [];
    let sortConfig = { key: null, direction: 'asc' };
    let pagination = null;
    const selectedClientIds = new Set();

    // Load stats cards from the server for accurate real-time values
    async function loadStats() {
        try {
            const res = await apiFetch('/api/stats/get-admin-dashboard-stats.php');
            const data = await res.json();
            if (!data.success) return;

            const s = data.stats;
            const totalEl = document.getElementById('totalClients');
            const activeEl = document.getElementById('clientsActive');
            const eventsEl = document.getElementById('clientsEvents');

            if (totalEl) totalEl.textContent = s.total_clients ?? 0;
            // "Active" = online within last 5 min
            if (activeEl) activeEl.textContent = s.online_clients ?? 0;
            if (eventsEl) {
                eventsEl.textContent = s.total_clients_events ?? 0;
            }
        } catch (e) {
        }
    }

    async function loadClients() {
        try {
            const response = await apiFetch('/api/admin/get-clients.php');
            const result = await response.json();

            if (result.success) {
                allClients = result.clients;
                updatePagination(allClients);
            } else {
                if (clientsTableBody) {
                    clientsTableBody.innerHTML = `<tr><td colspan="18" style="text-align:center;padding:2rem;color:#ef4444;">Failed to load clients: ${escapeHTML(result.message || 'Unknown error')}</td></tr>`;
                }
            }
        } catch (error) {
            if (clientsTableBody) {
                clientsTableBody.innerHTML = `<tr><td colspan="18" style="text-align:center;padding:2rem;color:#ef4444;">Network error loading clients.</td></tr>`;
            }
        }
    }

    // Expose globally so approveClient() can trigger a refresh
    window.loadClients = loadClients;

    function renderClients(clients) {
        if (!clientsTableBody) return;

        if (clients.length === 0) {
            clientsTableBody.innerHTML = '<tr><td colspan="18" style="text-align: center; padding: 2rem; color: #999;">No clients found</td></tr>';
            return;
        }

        clientsTableBody.innerHTML = clients.map(client => `
            <tr data-id="${client.id}" data-profile-pic="${client.profile_pic || ''}">
                <td style="padding-left: 1.5rem;">
                    <input type="checkbox" class="client-checkbox" data-id="${client.id}" ${selectedClientIds.has(client.id.toString()) ? 'checked' : ''}>
                </td>
                <td>
                    <div style="font-weight: 700; font-family: monospace; font-size: 0.85rem; color: var(--admin-primary);">${escapeHTML(client.custom_id || client.id)}</div>
                </td>
                <td style="display: flex; align-items: center; gap: 12px; padding: 1.2rem 1rem;">
                    <div class="avatar-wrapper">
                        <img src="${getProfileImg(client.profile_pic, client.name)}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover; border: 2px solid #fff; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                        ${getVerificationBadge(client.verification_status)}
                    </div>
                    <span style="font-weight: 600; color: var(--admin-text-main);">${escapeHTML(client.name)}</span>
                </td>
                <td>${escapeHTML(client.email)}</td>
                <td>${escapeHTML(client.dob) || 'N/A'}</td>
                <td style="text-transform: capitalize;">${escapeHTML(client.gender) || 'N/A'}</td>
                <td style="max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHTML(client.address) || ''}">${escapeHTML(client.address) || 'N/A'}</td>
                <td>${escapeHTML(client.city) || 'N/A'}</td>
                <td>${escapeHTML(client.country) || 'N/A'}</td>
                <td>${escapeHTML(client.state) || 'N/A'}</td>
                <td>${escapeHTML(client.job_title) || 'N/A'}</td>
                <td><code>${escapeHTML(client.account_number) || 'N/A'}</code></td>
                <td>${escapeHTML(client.account_name) || 'N/A'}</td>
                <td>${escapeHTML(client.bank_name) || 'N/A'}</td>
                <td>${escapeHTML(client.phone) || 'N/A'}</td>
                <td><span class="status-badge status-${client.verification_status === 'verified' ? 'active' : client.verification_status === 'rejected' ? 'offline' : 'ongoing'}">${escapeHTML(client.verification_status) || 'Pending'}</span></td>
                <td><span class="status-badge status-${client.status === 'active' ? 'active' : 'offline'}">${escapeHTML(client.status) || 'Active'}</span></td>
                <td style="font-weight: 600; color: var(--admin-primary);">${client.event_count || 0}</td>
            </tr>
        `).join('');

        // Update pagination info
        const paginationInfo = document.getElementById('paginationInfo');
        if (paginationInfo) {
            paginationInfo.textContent = `1 - ${clients.length} of ${clients.length}`;
        }

        // Handle individual checkboxes
        document.querySelectorAll('.client-checkbox').forEach(cb => {
            cb.onclick = (e) => e.stopPropagation();
            cb.onchange = (e) => {
                const id = e.target.dataset.id;
                if (e.target.checked) {
                    selectedClientIds.add(id);
                } else {
                    selectedClientIds.delete(id);
                }
                updateSelectAllState();
            };
        });

        // Re-initialize Lucide icons for badges
        if (window.lucide) window.lucide.createIcons();

        // Re-initialize previews for new rows
        if (window.initPreviews) window.initPreviews();
        
        updateSelectAllState();
    }

    function updateSelectAllState() {
        const selectAll = document.getElementById('selectAll');
        if (!selectAll) return;
        
        const pageCheckboxes = document.querySelectorAll('.client-checkbox');
        if (pageCheckboxes.length === 0) {
            selectAll.checked = false;
            return;
        }
        
        const allCheckedOnPage = Array.from(pageCheckboxes).every(cb => cb.checked);
        selectAll.checked = allCheckedOnPage;
    }

    function updatePagination(clients) {
        if (!pagination) {
            pagination = new EventraPagination({
                data: clients,
                containerId: 'paginationContainer',
                persistState: true,
                onPageChange: (pageData, shouldScroll = true) => {
                    renderClients(pageData);
                    if (shouldScroll) window.scrollTo({ top: 0, behavior: 'smooth' });
                }
            });
            renderClients(pagination.getPageData(), false);
        } else {
            pagination.updateData(clients);
        }
    }

    function sortClients(key) {
        if (sortConfig.key === key) {
            sortConfig.direction = sortConfig.direction === 'asc' ? 'desc' : 'asc';
        } else {
            sortConfig.key = key;
            sortConfig.direction = 'asc';
        }

        document.querySelectorAll('th.sortable').forEach(th => {
            th.classList.remove('asc', 'desc');
            if (th.dataset.sort === key) th.classList.add(sortConfig.direction);
        });

        const sorted = [...allClients].sort((a, b) => {
            let valA = a[key];
            let valB = b[key];
            if (key === 'id') {
                valA = parseInt(valA) || 0;
                valB = parseInt(valB) || 0;
            } else {
                valA = (valA || '').toString().toLowerCase();
                valB = (valB || '').toString().toLowerCase();
            }
            if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
            if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });

        updatePagination(sorted);
    }

    // Handle Select All click (across global selection)
    const selectAll = document.getElementById('selectAll');
    if (selectAll) {
        selectAll.addEventListener('change', (e) => {
            const pageCheckboxes = document.querySelectorAll('.client-checkbox');
            pageCheckboxes.forEach(cb => {
                cb.checked = e.target.checked;
                const id = cb.dataset.id;
                if (e.target.checked) {
                    selectedClientIds.add(id);
                } else {
                    selectedClientIds.delete(id);
                }
            });
        });
    }

    // Sort listeners
    document.querySelectorAll('th.sortable').forEach(th => {
        th.addEventListener('click', () => sortClients(th.dataset.sort));
    });

    // Initial load
    await loadClients();
    await loadStats();

    // Handle search highlighting — ?highlight=ID scrolls to and pulses the matching row
    const urlParams = new URLSearchParams(window.location.search);
    const highlightId = urlParams.get('highlight');
    if (highlightId) {
        const tryHighlight = (attempts = 0) => {
            const row = document.querySelector(`tr[data-id="${highlightId}"]`);
            if (row) {
                row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                row.classList.add('search-highlight-row');
                setTimeout(() => row.classList.remove('search-highlight-row'), 3500);
            } else if (attempts < 10) {
                setTimeout(() => tryHighlight(attempts + 1), 300);
            }
        };
        setTimeout(() => tryHighlight(), 800);
    }

    // Auto-refresh every 60s (reduced from 30s) to decrease database load
    // Visibility check prevents unnecessary queries when tab is in background
    setInterval(() => {
        if (document.visibilityState === 'visible') {
            loadClients();
            loadStats();
        }
    }, 60000);
});
