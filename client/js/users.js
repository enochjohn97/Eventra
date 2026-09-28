let allUsers = [];
let pagination = null;
const selectedUserIds = new Set();

document.addEventListener('DOMContentLoaded', async () => {
    const user = storage.getUser();
    if (user && user.id) {
        await loadUsers(user.id);
    }
    initializeTableSorting();

    // Auto-refresh users list every 60s (reduced from 15s) to decrease database load
    // Visibility check prevents queries when tab is in background
    setInterval(() => {
        if (document.visibilityState === 'visible') {
            loadUsers(user.id);
        }
    }, 60000);

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
            } else if (attempts < 10) {
                setTimeout(() => tryHighlight(attempts + 1), 300);
            }
        };
        setTimeout(() => tryHighlight(), 600);
    }
});

function initializeTableSorting() {
    const table = document.querySelector('table');
    if (!table) return;

    const headers = table.querySelectorAll('th');
    
    // Sort table rows dynamically
    headers.forEach((header, index) => {
        header.style.cursor = 'pointer';
        header.addEventListener('click', () => {
            const tbody = table.querySelector('tbody');
            if (!tbody) return;
            
            const rows = Array.from(tbody.querySelectorAll('tr'));
            if (rows.length === 0 || rows[0].children.length === 1) return; // Empty fallback row

            // If this is the checkbox column, don't sort
            if (index === 0) return;
            
            // Toggle sorting direction
            const isAsc = header.classList.contains('sort-asc');
            headers.forEach(h => {
                h.classList.remove('sort-asc', 'sort-desc');
                // Remove visual indicators if you had any
                h.innerHTML = h.textContent.replace(' ↑', '').replace(' ↓', '');
            });
            
            if (isAsc) {
                header.classList.add('sort-desc');
                header.innerHTML = header.textContent + ' ↓';
            } else {
                header.classList.add('sort-asc');
                header.innerHTML = header.textContent + ' ↑';
            }
            
            rows.sort((rowA, rowB) => {
                const cellA = rowA.children[index].textContent.trim();
                const cellB = rowB.children[index].textContent.trim();
                
                // Attempt date parsing first for robust sorting
                const dateA = new Date(cellA);
                const dateB = new Date(cellB);
                
                if (!isNaN(dateA) && !isNaN(dateB) && cellA !== 'N/A' && cellB !== 'N/A') {
                    return isAsc ? dateB - dateA : dateA - dateB;
                }
                
                // Numeric sorting
                if (!isNaN(cellA) && !isNaN(cellB) && cellA !== '' && cellB !== '') {
                    return isAsc ? Number(cellB) - Number(cellA) : Number(cellA) - Number(cellB);
                }
                
                // Standard string locale sorting
                return isAsc 
                    ? cellB.localeCompare(cellA) 
                    : cellA.localeCompare(cellB);
            });
            
            // Re-inject rows
            rows.forEach(row => tbody.appendChild(row));
        });
    });
}

async function loadUsers(clientId) {
    try {
        const response = await apiFetch(`/api/users/get-users.php?client_id=${clientId}`);
        const result = await response.json();

        if (result.success) {
            allUsers = result.users || [];
            updatePagination(allUsers);
            if (result.stats) {
                updateStatsCards(result.stats);
            }
        }
    } catch (error) {
    }
}

function updateStatsCards(stats) {
    const activeCard = document.getElementById('statActive');
    const engagedCard = document.getElementById('statEngaged');
    const registeredCard = document.getElementById('statRegistered');
    
    if (activeCard) activeCard.textContent = stats.active_users || 0;
    if (engagedCard) engagedCard.textContent = stats.engaged_users || 0;
    if (registeredCard) registeredCard.textContent = stats.registered_users || 0;
}

function updateUsersTable(users) {
    const tbody = document.getElementById('usersTableBody');
    if (!tbody) return;

    if (users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 2rem; color: var(--client-text-muted);">No users have logged in or purchased tickets yet.</td></tr>';
        return;
    }

    tbody.innerHTML = users.map(user => {
        // Determine status display
        const isActive = user.status === 'active' || user.status === 'online' || user.status === 1 || user.status === '1';
        const statusText = isActive ? 'Active' : 'Inactive';
        const statusColor = isActive ? '#722f37' : '#ef4444';
        
        const hasValidUrl = user.profile_pic && user.profile_pic.startsWith('http');
        const profileImage = user.profile_pic 
            ? (hasValidUrl ? user.profile_pic : `../../${user.profile_pic}`)
            : `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name || 'User')}&background=random`;

        return `
        <tr style="cursor: pointer;" onclick='showUserPreviewModal(${JSON.stringify(user).replace(/'/g, "&#39;")})'>
            <td><input type="checkbox" class="user-checkbox" data-id="${user.id}"></td>
            <td style="font-family:monospace;font-size:0.8rem;color:#635bff;font-weight:600;">${user.custom_id || '—'}</td>
            <td style="display: flex; align-items: center; gap: 12px;">
                <img src="${profileImage}" alt="${user.name}" style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover; border: 1px solid #e2e8f0;">
                <div style="font-weight: 500;">${user.name || 'N/A'}</div>
            </td>
            <td>${user.email || 'N/A'}</td>
            <td>${user.phone || 'N/A'}</td>
            <td>${user.state || 'N/A'}</td>
            <td>${user.client_name || 'Direct'}</td>
            <td><span style="color: ${statusColor}; font-weight: 600;">${statusText}</span></td>
            <td>${user.country || 'N/A'}</td>
            <td>${user.city || 'N/A'}</td>
            <td>${formatDate(user.dob)}</td>
            <td style="text-transform: capitalize;">${user.gender || 'N/A'}</td>
            <td>${formatDate(user.created_at)}</td>
        </tr>
    `;
    }).join('');

    // Handle Select All
    const selectAll = document.getElementById('selectAll');
    if (selectAll) {
        selectAll.onchange = (e) => {
            const checkboxes = document.querySelectorAll('.user-checkbox');
            checkboxes.forEach(cb => {
                cb.checked = e.target.checked;
                const id = cb.dataset.id;
                if (e.target.checked) selectedUserIds.add(id);
                else selectedUserIds.delete(id);
            });
            updateSelectAllState();
        };
    }

    // Prevent modal open on checkbox click
    document.querySelectorAll('.user-checkbox, #selectAll').forEach(cb => {
        cb.onclick = (e) => e.stopPropagation();
    });

    updateSelectAllState();
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
            onPageChange: (pageData) => {
                updateUsersTable(pageData);
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        });
        updateUsersTable(pagination.getPageData());
    } else {
        pagination.updateData(users);
    }
}

// Delete account handler (client self-service)
document.addEventListener('DOMContentLoaded', () => {
    const deleteBtn = document.getElementById('deleteAccountBtn');
    if (!deleteBtn) return;
    deleteBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        const confirmed = await Swal.fire({
            title: 'Delete Account?',
            text: 'This will permanently delete your account and all associated data. This action cannot be undone.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#e74c3c',
            cancelButtonColor: '#95a5a6',
            confirmButtonText: 'Yes, delete my account'
        });
        if (!confirmed.isConfirmed) return;
        try {
            const res = await apiFetch('/api/clients/delete-profile.php', { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                Swal.fire('Deleted', data.message, 'success').then(() => {
                    // Redirect to login
                    window.location.href = '../../client/pages/clientLogin.html';
                });
            } else {
                Swal.fire('Error', data.message || 'Failed to delete account.', 'error');
            }
        } catch (err) {
            Swal.fire('Error', 'Server error occurred while deleting account.', 'error');
        }
    });
});

function formatDate(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

window.showUserPreviewModal = function(user) {
    const existing = document.getElementById('clientUserModal');
    if (existing) existing.remove();
    
    const profilePic = user.profile_pic && user.profile_pic.startsWith('http') ? user.profile_pic : (user.profile_pic ? `../../${user.profile_pic}` : `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name || 'User')}&background=random`);
    
    const html = `
    <div id="clientUserModal" style="position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:9100;backdrop-filter:blur(6px);padding:1rem;" onclick="if(event.target===this)this.remove()">
        <div style="background:white;border-radius:20px;overflow:hidden;max-width:480px;width:100%;box-shadow:0 25px 60px rgba(0,0,0,.25);animation:slideUp .3s ease-out;position:relative;">
            <button onclick="document.getElementById('clientUserModal').remove()" style="position:absolute;top:1rem;right:1rem;background:rgba(0,0,0,.1);border:none;color:#1e293b;width:32px;height:32px;border-radius:50%;font-size:1.2rem;cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:10;">&times;</button>
            <div style="padding:2rem;text-align:center;border-bottom:1px solid #f1f5f9;">
                <img src="${profilePic}" alt="" style="width:90px;height:90px;border-radius:50%;object-fit:cover;border:3px solid #f8fafc;box-shadow:0 4px 6px -1px rgba(0,0,0,.1);margin-bottom:1rem;">
                <h3 style="margin:0 0 .25rem;font-size:1.25rem;font-weight:800;color:#1e293b;">${escapeHtml(user.name || 'N/A')}</h3>
                <p style="margin:0;font-family:monospace;color:#722f37;font-weight:700;font-size:.85rem;">${escapeHtml(user.custom_id || user.id)}</p>
                <div style="margin-top:1rem;display:inline-block;padding:4px 12px;background:#f8fafc;border-radius:20px;font-size:.75rem;font-weight:600;color:#64748b;">
                    ${user.email || 'No email provided'}
                </div>
            </div>
            <div style="padding:1.5rem;display:grid;grid-template-columns:1fr 1fr;gap:1.25rem;">
                <div><div style="font-size:.7rem;color:#94a3b8;font-weight:700;text-transform:uppercase;margin-bottom:4px;">Phone</div><div style="font-weight:600;font-size:.9rem;">${escapeHtml(user.phone || 'N/A')}</div></div>
                <div><div style="font-size:.7rem;color:#94a3b8;font-weight:700;text-transform:uppercase;margin-bottom:4px;">Gender</div><div style="font-weight:600;font-size:.9rem;text-transform:capitalize;">${escapeHtml(user.gender || 'N/A')}</div></div>
                <div><div style="font-size:.7rem;color:#94a3b8;font-weight:700;text-transform:uppercase;margin-bottom:4px;">Joined</div><div style="font-weight:600;font-size:.9rem;">${formatDate(user.created_at)}</div></div>
                <div><div style="font-size:.7rem;color:#94a3b8;font-weight:700;text-transform:uppercase;margin-bottom:4px;">DOB</div><div style="font-weight:600;font-size:.9rem;">${formatDate(user.dob)}</div></div>
                <div style="grid-column:span 2;"><div style="font-size:.7rem;color:#94a3b8;font-weight:700;text-transform:uppercase;margin-bottom:4px;">Location</div><div style="font-weight:600;font-size:.9rem;">${escapeHtml([user.city, user.state, user.country].filter(Boolean).join(', ') || 'N/A')}</div></div>
            </div>
        </div>
    </div>`;
    
    const template = document.createElement('template');
    template.innerHTML = html.trim();
    document.body.appendChild(template.content.firstElementChild);
};
