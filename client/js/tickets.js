/**
 * Client Tickets Page JavaScript
 * Handles ticket display and preview
 */

document.addEventListener('DOMContentLoaded', async () => {
    const user = storage.getUser();
    
    if (!user || user.role !== 'client') {
        window.location.href = 'clientLogin.html';
        return;
    }

    await loadTickets(user.id);
    
    // Handle search highlighting
    const urlParams = new URLSearchParams(window.location.search);
    const highlightId = urlParams.get('highlight');
    if (highlightId) {
        setTimeout(() => {
            const rows = document.querySelectorAll('#ticketsTableBody tr');
            rows.forEach(row => {
                if (row.innerHTML.includes(`"id":${highlightId}`) || row.children[0].textContent.trim() == highlightId) {
                    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    row.style.transition = 'background 0.5s';
                    row.style.background = 'rgba(99, 91, 255, 0.15)';
                    setTimeout(() => { row.style.background = ''; }, 3000);
                }
            });
        }, 500);
    }

    // Sort Select Wiring
    const sortSelect = document.getElementById('ticketSortSelect');
    if (sortSelect) {
        sortSelect.addEventListener('change', (e) => {
            if (e.target.value !== 'none') {
                const parts = e.target.value.split('_');
                const colIndex = parseInt(parts[0]);
                const isDesc = parts[1] === 'desc';
                
                const table = document.querySelector('table');
                const headers = table.querySelectorAll('th');
                const header = headers[colIndex];
                
                // Set the class explicitly then trigger click logic
                if (isDesc) {
                    header.classList.add('sort-asc'); // will toggle to desc in click
                } else {
                    header.classList.add('sort-desc'); // will toggle to asc in click
                }
                
                header.click();
            }
        });
    }
});

function sortTickets(index) {
    const table = document.querySelector('table');
    if (!table) return;

    const headers = table.querySelectorAll('th');
    const header = headers[index];
    
    const tbody = table.querySelector('tbody');
    if (!tbody) return;
    
    const rows = Array.from(tbody.querySelectorAll('tr'));
    if (rows.length <= 1 && rows[0]?.children.length <= 1) return;
    
    const isAsc = header.classList.contains('sort-asc');
    headers.forEach(h => {
        h.classList.remove('sort-asc', 'sort-desc');
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
        let cellA = rowA.children[index].textContent.trim();
        let cellB = rowB.children[index].textContent.trim();
        
        // Special handling for Price (₦1,234.56)
        if (index === 3) { // Price column
            cellA = cellA.replace('₦', '').replace(/,/g, '');
            cellB = cellB.replace('₦', '').replace(/,/g, '');
            return isAsc ? Number(cellB) - Number(cellA) : Number(cellA) - Number(cellB);
        }

        // Date parsing
        const dateA = new Date(cellA);
        const dateB = new Date(cellB);
        
        if (!isNaN(dateA) && !isNaN(dateB)) {
            return isAsc ? dateB - dateA : dateA - dateB;
        }
        
        // Numeric
        if (!isNaN(cellA) && !isNaN(cellB) && cellA !== '' && cellB !== '') {
            return isAsc ? Number(cellB) - Number(cellA) : Number(cellA) - Number(cellB);
        }
        
        return isAsc ? cellB.localeCompare(cellA) : cellA.localeCompare(cellB);
    });
    
    rows.forEach(row => tbody.appendChild(row));
}

// Expose globally
window.sortTickets = sortTickets;

async function loadTickets(clientId) {
    try {
        const response = await apiFetch(`../../api/tickets/get-tickets.php?client_id=${clientId}`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const text = await response.text();
        if (!text) {
            throw new Error('Empty response from server');
        }

        const result = JSON.parse(text);

        if (result.success) {
            updateTicketsTable(result.tickets || []);
            if (result.stats) {
                updateStatsCards(result.stats);
            }
        } else {
            console.error('API Error:', result.message);
            showNotification(result.message || 'Failed to load tickets', 'error');
        }
    } catch (error) {
        console.error('Error loading tickets:', error);
        const tbody = document.getElementById('ticketsTableBody');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 2rem; color: #ef4444;">Error loading tickets. Please try again later.</td></tr>';
        }
    }
}

function updateStatsCards(stats) {
    if (!stats) return;
    const ticketsSoldEl = document.getElementById('ticketsSold');
    const totalRevenueEl = document.getElementById('totalRevenue');
    const pendingTicketsEl = document.getElementById('pendingTickets');
    const cancelledTicketsEl = document.getElementById('cancelledTickets');

    if (ticketsSoldEl) ticketsSoldEl.textContent = stats.total_tickets !== undefined ? stats.total_tickets : 0;
    if (totalRevenueEl) totalRevenueEl.textContent = `₦${(stats.total_revenue || 0).toLocaleString()}`;
    if (pendingTicketsEl) pendingTicketsEl.textContent = stats.pending_tickets !== undefined ? stats.pending_tickets : 0;
    if (cancelledTicketsEl) cancelledTicketsEl.textContent = stats.cancelled_tickets !== undefined ? stats.cancelled_tickets : 0;
}

function updateTicketsTable(tickets) {
    const tbody = document.getElementById('ticketsTableBody');
    if (!tbody) return;

    if (tickets.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 2rem; color: var(--client-text-muted);">No tickets sold yet.</td></tr>';
        return;
    }

    tbody.innerHTML = tickets.map(ticket => `
        <tr style="cursor: pointer;" onclick='showTicketPreviewModal(${JSON.stringify(ticket).replace(/'/g, "&#39;")})'>
            <td>${ticket.id}</td>
            <td>${ticket.event_name || 'N/A'}</td>
            <td>${ticket.buyer_name || ticket.user_name || 'N/A'}</td>
            <td>₦${parseFloat(ticket.total_price || ticket.price || 0).toLocaleString()}</td>
            <td>${ticket.organiser_name || 'Direct'}</td>
            <td>${ticket.purchase_date || ticket.created_at || 'N/A'}</td>
            <td><span style="color: ${ticket.status === 'confirmed' || ticket.status === 'paid' ? '#10b981' : '#ef4444'}; font-weight: 600;">${ticket.status ? ticket.status.toUpperCase() : 'N/A'}</span></td>
        </tr>
    `).join('');
}
