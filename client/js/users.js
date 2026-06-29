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
