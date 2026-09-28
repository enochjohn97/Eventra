/**
 * Client Tickets Page JavaScript
 * Handles ticket display and preview
 */
let allTickets = [];
let pagination = null;
const selectedTicketIds = new Set();

document.addEventListener('DOMContentLoaded', async () => {
    const user = storage.getUser();
    if (user && user.id) {
        await loadTickets(user.id);
    }
    
    // Handle search highlighting
    const urlParams = new URLSearchParams(window.location.search);
    const highlightId = urlParams.get('highlight');
    if (highlightId) {
        const tryHighlight = (attempts = 0) => {
            const row = document.querySelector(`tr[data-id="${highlightId}"]`) ||
                        document.querySelector(`#ticketsTableBody tr[data-ticket-id="${highlightId}"]`);
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
        if (index === 4) { // Price column (was 3)
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
        const response = await apiFetch(`/api/tickets/get-tickets.php?client_id=${clientId}`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const text = await response.text();
        if (!text) {
            throw new Error('Empty response from server');
        }

        const result = JSON.parse(text);

        if (result.success) {
            allTickets = result.tickets || [];
            updatePagination(allTickets);
            if (result.stats) {
                updateStatsCards(result.stats);
            }
        } else {
            showNotification(result.message || 'Failed to load tickets', 'error');
        }
    } catch (error) {
        const tbody = document.getElementById('ticketsTableBody');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; padding: 2rem; color: #ef4444;">Error loading tickets. Please try again later.</td></tr>';
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
        tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; padding: 2rem; color: var(--client-text-muted);">No tickets sold yet.</td></tr>';
        return;
    }

    tbody.innerHTML = tickets.map(ticket => {
        // Price: prefer payment amount for paid tickets, otherwise event price, otherwise Free
        const priceDisplay = (ticket.payment_status && String(ticket.payment_status).toLowerCase() === 'paid' && ticket.amount > 0)
            ? `<strong>₦${Number(ticket.amount).toLocaleString()}</strong>`
            : ((ticket.event_price && Number(ticket.event_price) > 0)
                ? `<strong>₦${Number(ticket.event_price).toLocaleString()}</strong>`
                : '<span style="color:#722f37;font-weight:700;">Free</span>');

        const statusColor = (ticket.status === 'valid' || ticket.payment_status === 'paid')
            ? '#722f37' : (ticket.status === 'cancelled' ? '#ef4444' : '#f59e0b');

        const customId = ticket.custom_id
            ? `<div style="font-size:.7rem;color:#94a3b8;font-family:monospace;">${ticket.custom_id}</div>`
            : '';

        const ticketTypeDisplay = ticket.ticket_type_display
            || ((ticket.amount <= 0 && ticket.event_price <= 0) ? 'Free' : (ticket.ticket_type ? String(ticket.ticket_type).toLowerCase() : 'regular'));
        const eventCategoryDisplay = ticket.event_category || ticket.category || 'General';

        return `
        <tr style="cursor: pointer;" onclick='showTicketPreviewModal(${JSON.stringify(ticket).replace(/'/g, "&#39;")})'>
            <td><input type="checkbox" class="ticket-checkbox" data-id="${ticket.id}"></td>
            <td style="font-family:monospace;font-size:0.85rem;color:#635bff;font-weight:700;">
                ${ticket.custom_id || ticket.id}
            </td>
            <td>${(ticket.event_name || 'N/A').replace(/\s*#\d+$/, '')}</td>
            <td>${ticket.buyer_name || ticket.user_name || 'N/A'}</td>
            <td>${priceDisplay}</td>
            <td><span style="font-size: 0.85rem; color: #0f172a; font-weight:700; text-transform: capitalize;">${ticketTypeDisplay}</span></td>
            <td><span style="font-size: 0.85rem; color: #64748b; text-transform: capitalize;">${eventCategoryDisplay}</span></td>
            <td>${ticket.purchase_date || ticket.created_at || 'N/A'}</td>
            <td><span class="status-badge ${ticket.status === 'valid' ? 'status-paid' : ticket.status === 'used' ? 'status-refunded' : ticket.status === 'pending' ? 'status-pending' : 'status-failed'}">${(ticket.status || 'N/A').toUpperCase()}</span></td>
        </tr>`;
    }).join('');

    // Handle Select All
    const selectAll = document.getElementById('selectAll');
    if (selectAll) {
        selectAll.onchange = (e) => {
            const checkboxes = document.querySelectorAll('.ticket-checkbox');
            checkboxes.forEach(cb => {
                cb.checked = e.target.checked;
                const id = cb.dataset.id;
                if (e.target.checked) selectedTicketIds.add(id);
                else selectedTicketIds.delete(id);
            });
            updateSelectAllState();
        };
    }

    // Prevent modal open on checkbox click
    document.querySelectorAll('.ticket-checkbox, #selectAll').forEach(cb => {
        cb.onclick = (e) => e.stopPropagation();
    });

    updateSelectAllState();
}

function updateSelectAllState() {
    const selectAll = document.getElementById('selectAll');
    if (!selectAll) return;
    const pageCheckboxes = document.querySelectorAll('.ticket-checkbox');
    if (pageCheckboxes.length === 0) {
        selectAll.checked = false;
        return;
    }
    const allCheckedOnPage = Array.from(pageCheckboxes).every(cb => cb.checked);
    selectAll.checked = allCheckedOnPage;
}

function updatePagination(tickets) {
    if (!pagination) {
        pagination = new EventraPagination({
            data: tickets,
            containerId: 'paginationContainer',
            onPageChange: (pageData) => {
                updateTicketsTable(pageData);
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        });
        updateTicketsTable(pagination.getPageData());
    } else {
        pagination.updateData(tickets);
    }
}


// Download Ticket PDF using server-side PDF
async function downloadTicketPDF(ticketCode) {
    if (!ticketCode) {
        showNotification('Ticket code not found', 'error');
        return;
    }

    try {
        // Show loading state
        const btn = event.target.closest('button');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<span style="display:flex;align-items:center;gap:.5rem;"><i class="spinner" style="display:inline-block;width:14px;height:14px;border:2px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;animation:spin .6s linear infinite;"></i> Downloading...</span>';
        btn.disabled = true;

        const token = window.storage ? window.storage.getToken() : null;
        const headers = {
            'Accept': 'application/pdf',
            'X-Eventra-Portal': 'client'
        };
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
            headers['X-Access-Token'] = token;
        }

        const response = await fetch(`/api/tickets/download-ticket.php?code=${encodeURIComponent(ticketCode)}`, {
            credentials: 'include',
            headers
        });

        if (!response.ok) {
            const contentType = response.headers.get('content-type') || '';
            if (contentType.includes('application/json')) {
                const err = await response.json();
                throw new Error(err.message || `HTTP error! status: ${response.status}`);
            }
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('application/pdf')) {
            throw new Error('Server did not return a valid PDF file.');
        }

        const blob = await response.blob();

        if (blob.size < 1000) {
            throw new Error('Downloaded file is empty or invalid');
        }

        // Create download link
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `eventra_ticket_${ticketCode}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);

        showNotification('Ticket downloaded successfully', 'success');
        
        // Restore button
        btn.innerHTML = originalText;
        btn.disabled = false;
    } catch (error) {
        showNotification('Failed to download ticket. Please try again.', 'error');
        
        // Restore button
        const btn = event.target.closest('button');
        if (btn) {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    }
}

// Expose function globally
window.downloadTicketPDF = downloadTicketPDF;

window.showTicketPreviewModal = function(ticket) {
    const existing = document.getElementById('clientTicketModal');
    if (existing) existing.remove();

    const imgSrc = ticket.event_image ? getImageUrl(ticket.event_image) : null;
    const heroFallback = 'linear-gradient(135deg, #722f37 0%, #4a1c24 100%)';
    const price = ticket.price_display || (ticket.amount > 0 ? `₦${ticket.amount.toLocaleString()}` : (ticket.event_price > 0 ? `₦${ticket.event_price.toLocaleString()}` : 'Free'));
    const typeLabel = ticket.ticket_type_display || ticket.ticket_type || 'Regular';

    const heroImageHtml = imgSrc
        ? `<img src="${imgSrc.replace(/"/g, '&quot;')}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;" onerror="this.style.display='none';">`
        : '';

    const html = `
    <div id="clientTicketModal" style="position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:9100;backdrop-filter:blur(6px);padding:1rem;" onclick="if(event.target===this)this.remove()">
        <div style="background:white;border-radius:20px;overflow:hidden;max-width:520px;width:100%;box-shadow:0 25px 60px rgba(0,0,0,.25);animation:slideUp .3s ease-out;position:relative;">
            <div style="height:160px;background:${heroFallback};background-size:cover;background-position:center;position:relative;overflow:hidden;">
                ${heroImageHtml}
                <button onclick="document.getElementById('clientTicketModal').remove()" style="position:absolute;top:1rem;right:1rem;background:rgba(0,0,0,.4);border:none;color:white;width:34px;height:34px;border-radius:50%;font-size:1.2rem;cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:2;">&times;</button>
                <div style="position:absolute;bottom:1rem;left:1.5rem;z-index:2;">
                    <div style="font-size:.7rem;font-weight:700;color:rgba(255,255,255,.7);text-transform:uppercase;letter-spacing:.07em;margin-bottom:2px;">Event</div>
                    <div style="font-size:1.25rem;font-weight:800;color:white;text-shadow:0 2px 8px rgba(0,0,0,.4);">${escapeHtml(ticket.event_name || '—')}</div>
                </div>
            </div>
            <div style="padding:1.5rem;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.25rem;">
                    <span style="font-family:monospace;font-size:.85rem;color:#722f37;font-weight:700;">${escapeHtml(ticket.custom_id || ticket.id)}</span>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:.85rem;">
                    <div><div style="font-size:.7rem;color:#94a3b8;font-weight:700;text-transform:uppercase;margin-bottom:2px;">Buyer</div><div style="font-weight:600;">${escapeHtml(ticket.buyer_name || ticket.user_name || '—')}</div></div>
                    <div><div style="font-size:.7rem;color:#94a3b8;font-weight:700;text-transform:uppercase;margin-bottom:2px;">Price</div><div style="font-weight:700;">${price}</div></div>
                    <div><div style="font-size:.7rem;color:#94a3b8;font-weight:700;text-transform:uppercase;margin-bottom:2px;">Category</div><div style="font-weight:600;text-transform:capitalize;">${escapeHtml(ticket.event_category || ticket.category || 'General')}</div></div>
                    <div><div style="font-size:.7rem;color:#94a3b8;font-weight:700;text-transform:uppercase;margin-bottom:2px;">Date Purchased</div><div style="font-weight:600;">${ticket.purchase_date || (ticket.created_at ? new Date(ticket.created_at).toLocaleDateString() : '—')}</div></div>
                    <div><div style="font-size:.7rem;color:#94a3b8;font-weight:700;text-transform:uppercase;margin-bottom:2px;">Ticket Type</div><div style="font-weight:600;text-transform:capitalize;color:#722f37;">${escapeHtml(typeLabel)}</div></div>
                </div>
                <div style="background:#f8fafc;padding:1.25rem;border-radius:10px;margin:1.25rem 0;text-align:center;">
                    <div style="font-size:.7rem;color:#94a3b8;font-weight:700;text-transform:uppercase;margin-bottom:1rem;">Barcode</div>
                    <svg id="clientTicketBarcode" style="margin:0 auto;height:60px;"></svg>
                    <div style="font-family:monospace;font-size:.75rem;color:#475569;margin-top:0.75rem;word-break:break-all;">${escapeHtml(ticket.barcode || '—')}</div>
                </div>
                <button onclick="document.getElementById('clientTicketModal').remove()" style="margin-top:1.5rem;width:100%;padding:.75rem;background:#722f37;color:white;border:none;border-radius:10px;font-weight:700;cursor:pointer;font-size:.9rem;">Close</button>
            </div>
        </div>
    </div>`;

    const template = document.createElement('template');
    template.innerHTML = html.trim();
    document.body.appendChild(template.content.firstElementChild);
    
    const barcodeData = ticket.custom_id || ticket.barcode || (ticket.id ? ticket.id.toString() : '');
    if (barcodeData && typeof JsBarcode !== 'undefined') {
        try {
            JsBarcode("#clientTicketBarcode", barcodeData, {
                format: "CODE128", width: 2, height: 60, displayValue: false, margin: 0, background: "transparent", lineColor: "#1e293b"
            });
        } catch (e) {}
    }
    document.addEventListener('keydown', function esc(e) { if (e.key === 'Escape') { document.getElementById('clientTicketModal')?.remove(); document.removeEventListener('keydown', esc); } });
};
