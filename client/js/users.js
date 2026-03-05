/**
 * Client Users Page JavaScript
 * Handles user display and preview
 */

document.addEventListener('DOMContentLoaded', async () => {
    const user = storage.getUser();
    
    if (!user || user.role !== 'client') {
        window.location.href = 'clientLogin.html';
        return;
    }

    await loadUsers(user.id);
    initializeTableSorting();

    // Handle search highlighting
    const urlParams = new URLSearchParams(window.location.search);
    const highlightId = urlParams.get('highlight');
    if (highlightId) {
        setTimeout(() => {
            const rows = document.querySelectorAll('#usersTableBody tr');
            rows.forEach(row => {
                // If we use ID in the data-id attribute or similar
                if (row.innerHTML.includes(`id":${highlightId}`)) {
                    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    row.style.transition = 'background 0.5s';
                    row.style.background = 'rgba(99, 91, 255, 0.15)';
                    setTimeout(() => {
                        row.style.background = '';
                    }, 3000);
                }
            });
        }, 500);
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
        const response = await apiFetch(`../../api/users/get-users.php?client_id=${clientId}`);
        const result = await response.json();

        if (result.success) {
            updateUsersTable(result.users || []);
            if (result.stats) {
                updateStatsCards(result.stats);
            }
        }
    } catch (error) {
        console.error('Error loading users:', error);
    }
}

function updateStatsCards(stats) {
    const cards = document.querySelectorAll('.summary-card .summary-value');
    if (cards.length >= 3) {
        cards[0].textContent = stats.active_users || 0;
        cards[1].textContent = stats.engaged_users || 0;
        cards[2].textContent = stats.registered_users || 0;
    }
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
        const isActive = user.status === 'active' || user.status === 1 || user.status === '1';
        const statusText = isActive ? 'Active' : 'Inactive';
        const statusColor = isActive ? '#10b981' : '#ef4444';
        
        const profileImage = user.profile_pic 
            ? `../../${user.profile_pic}`
            : `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name || 'User')}&background=random`;

        return `
        <tr style="cursor: pointer;" onclick='showUserPreviewModal(${JSON.stringify(user).replace(/'/g, "&#39;")})'>
            <td style="display: flex; align-items: center; gap: 12px;">
                <img src="${profileImage}" alt="${user.name}" style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover; border: 1px solid #e2e8f0;">
                <span style="font-weight: 500;">${user.name || 'N/A'}</span>
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
}

function formatDate(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}
