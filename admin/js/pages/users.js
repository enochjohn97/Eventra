document.addEventListener('DOMContentLoaded', async () => {
    const usersTableBody = document.querySelector('table tbody');
    let allUsers = [];
    let sortConfig = { key: null, direction: 'asc' };
    let pagination = null;
    const selectedUserIds = new Set();
    
    async function loadUsers() {
        try {
            const response = await apiFetch('/api/admin/get-users.php');
            const result = await response.json();

            if (result.success) {
                allUsers = result.users;
                updatePagination(allUsers);
                updateStats(result.summary);
            } else {
            }
        } catch (error) {
        }
    }

    function renderUsers(users) {
        if (!usersTableBody) return;
        
        if (users.length === 0) {
            usersTableBody.innerHTML = '<tr><td colspan="12" style="text-align: center; padding: 2rem; color: #999;">No users found</td></tr>';
            return;
        }

        usersTableBody.innerHTML = users.map(user => `
            <tr data-id="${user.id}">
                <td style="padding-left: 1.5rem;">
                    <input type="checkbox" class="user-checkbox" data-id="${user.id}" ${selectedUserIds.has(user.id.toString()) ? 'checked' : ''}>
                </td>
                <td>
                    <div style="font-weight: 700; font-family: monospace; font-size: 0.85rem; color: var(--admin-primary);">${escapeHTML(user.custom_id || user.id)}</div>
                </td>
                <td style="display: flex; align-items: center; gap: 12px; padding: 1.2rem 1rem;">
                    <div class="avatar-wrapper">
                        <img src="${getProfileImg(user.profile_pic, user.name)}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover; border: 2px solid #fff; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                    </div>
                    <span style="font-weight: 600; color: var(--admin-text-main);">${escapeHTML(user.name)}</span>
                </td>
                <td style="font-size: 0.85rem;">${escapeHTML(user.email)}</td>
                <td>${escapeHTML(user.phone) || 'N/A'}</td>
                <td style="text-transform: capitalize;">${escapeHTML(user.gender) || 'N/A'}</td>
                <td>${escapeHTML(user.state) || 'N/A'}</td>
                <td>${escapeHTML(user.country) || 'N/A'}</td>
                <td>${escapeHTML(user.city) || 'N/A'}</td>
                <td style="max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHTML(user.address || 'N/A')}">${escapeHTML(user.address || 'N/A')}</td>
                <td><span class="status-badge status-${user.is_online == 1 ? 'ongoing' : 'concluded'}">${user.is_online == 1 ? 'Online' : 'Offline'}</span></td>
                <td>${user.last_login_at ? escapeHTML(new Date(user.last_login_at).toLocaleDateString()) : 'Never'}</td>
            </tr>
        `).join('');

        // Handle individual checkboxes
        document.querySelectorAll('.user-checkbox').forEach(cb => {
            cb.onclick = (e) => e.stopPropagation();
            cb.onchange = (e) => {
                const id = e.target.dataset.id;
                if (e.target.checked) selectedUserIds.add(id);
                else selectedUserIds.delete(id);
                updateSelectAllState();
            };
        });

        // Prevent preview open on checkbox click
        document.querySelectorAll('.user-checkbox, #selectAll').forEach(cb => {
            cb.onclick = (e) => e.stopPropagation();
        });

        updateSelectAllState();

        // Re-initialize Lucide icons
        if (window.lucide) window.lucide.createIcons();
        // Re-initialize previews
        if (window.initPreviews) window.initPreviews();
    }

    function updateSelectAllState() {
        const selectAll = document.getElementById('selectAll');
        if (!selectAll) return;
        const pageCheckboxes = document.querySelectorAll('.user-checkbox');
        if (pageCheckboxes.length === 0) {
            selectAll.checked = false;
            return;
        }
        const allCheckedOnPage = Array.from(pageCheckboxes).every(cb => cb.checked);
        selectAll.checked = allCheckedOnPage;
    }

    function updatePagination(users) {
        if (!pagination) {
            pagination = new EventraPagination({
                data: users,
                containerId: 'paginationContainer',
                persistState: true,
                onPageChange: (pageData, shouldScroll = true) => {
                    renderUsers(pageData);
                    if (shouldScroll) window.scrollTo({ top: 0, behavior: 'smooth' });
                }
            });
            renderUsers(pagination.getPageData());
        } else {
            pagination.updateData(users);
        }
    }

    function sortUsers(key) {
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

        const sortedUsers = [...allUsers].sort((a, b) => {
            let valA = a[key] || '';
            let valB = b[key] || '';
            if (key === 'id') {
                valA = parseInt(valA) || 0;
                valB = parseInt(valB) || 0;
            } else {
                valA = valA.toString().toLowerCase();
                valB = valB.toString().toLowerCase();
            }
            if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
            if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });

        updatePagination(sortedUsers);
    }

    // Sort listeners
    document.querySelectorAll('th.sortable').forEach(th => {
        th.addEventListener('click', () => sortUsers(th.dataset.sort));
    });

    // Global Select All listener
    const selectAll = document.getElementById('selectAll');
    if (selectAll) {
        selectAll.addEventListener('change', (e) => {
            const pageCheckboxes = document.querySelectorAll('.user-checkbox');
            pageCheckboxes.forEach(cb => {
                cb.checked = e.target.checked;
                const id = cb.dataset.id;
                if (e.target.checked) selectedUserIds.add(id);
                else selectedUserIds.delete(id);
            });
        });
    }

    function updateStats(summary) {
        if (!summary) return;
        const checkedInEl = document.getElementById('usersCheckedIn');
        const activeEl = document.getElementById('usersActive');
        const registeredEl = document.getElementById('usersRegistered');
        if (checkedInEl) checkedInEl.textContent = summary.total_checked_in || 0;
        if (activeEl) activeEl.textContent = summary.total_active || 0;
        if (registeredEl) registeredEl.textContent = summary.total_registered || 0;
    }

    await loadUsers();

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

    // Auto-refresh every 60s (reduced from 10s) to decrease database load
    // Visibility check prevents unnecessary queries when tab is in background
    setInterval(() => {
        if (document.visibilityState === 'visible') loadUsers();
    }, 60000);
});
