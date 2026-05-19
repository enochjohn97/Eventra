/**
 * Admin Tickets Dashboard — Fully rewritten with Unified Pagination
 */

let _allTickets = [];
let _filteredTickets = [];
let _tktSort = { key: 'created_at', dir: 'desc' };
let _tktPage = parseInt(new URLSearchParams(window.location.search).get('page')) || 1;
let TKT_PER_PAGE = 10;
let _tktPagination = null;
const selectedTicketIds = new Set();

document.addEventListener('DOMContentLoaded', async () => {
    await loadTickets();

    // Status filter tabs
    document.querySelectorAll('[data-status]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('[data-status]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            _tktPage = 1;
            applyFilters();
        });
    });

    // Search
    const search = document.getElementById('ticketSearchInput');
    if (search) {
        let debounce;
        search.addEventListener('input', () => {
            clearTimeout(debounce);
            debounce = setTimeout(() => { _tktPage = 1; applyFilters(); }, 350);
        });
    }
    
    // Auto-refresh every 60s (reduced from 30s) to decrease database load
    // Visibility check prevents unnecessary queries when tab is in background
    setInterval(() => {
        if (document.visibilityState === 'visible') {
            loadTickets();
        }
    }, 60000);
});

async function loadTickets() {
    const tbody = document.getElementById('ticketsTableBody');
    if (tbody && _allTickets.length === 0) {
        setTableStatusRow(tbody, 'Loading...');
    }

    const statusFilter = (document.querySelector('[data-status].active') || {}).dataset?.status ?? '';
    const search = (document.getElementById('ticketSearchInput') || {}).value ?? '';
    const offset = (_tktPage - 1) * TKT_PER_PAGE;

    try {
        const url = `/api/admin/get-tickets.php?limit=${TKT_PER_PAGE}&offset=${offset}&search=${encodeURIComponent(search)}&status=${statusFilter}`;
        const res = await apiFetch(url);
        const data = await res.json();
        
        if (!data.success) throw new Error(data.message || 'Failed');
        
        _allTickets = data.tickets || [];
        _filteredTickets = _allTickets; 
        
        renderTicketsTable();
        updateTktPagination(data.total || 0, _tktPage, TKT_PER_PAGE);
        updateStats(data);
    } catch (err) {
        if (tbody) {
            setTableStatusRow(tbody, 'Error loading tickets.', '#ef4444');
        }
    }
}

function applyFilters() {
    loadTickets();
}

function sortTicketsTable(key) {
    if (_tktSort.key === key) {
        _tktSort.dir = _tktSort.dir === 'asc' ? 'desc' : 'asc';
    } else {
        _tktSort.key = key;
        _tktSort.dir = 'asc';
    }
    _tktPage = 1;
    applyFilters();
}

function renderTicketsTable() {
    const tbody = document.getElementById('ticketsTableBody');
    if (!tbody) return;

    if (!_filteredTickets.length) {
        setTableStatusRow(tbody, 'No tickets found.');
        return;
    }

    tbody.textContent = '';
    _filteredTickets.forEach(t => {
        const row = createTicketRow(t);
        tbody.appendChild(row);
    });

    // Handle individual checkboxes
    document.querySelectorAll('.ticket-checkbox').forEach(cb => {
        cb.onclick = (e) => e.stopPropagation();
        cb.onchange = (e) => {
            const id = e.target.dataset.id;
            if (e.target.checked) selectedTicketIds.add(id);
            else selectedTicketIds.delete(id);
            updateSelectAllState();
        };
    });

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

    if (window.lucide) lucide.createIcons();
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

function updateTktPagination(total, page, limit) {
    if (!_tktPagination) {
        _tktPagination = new EventraPagination({
            mode: 'server',
            totalItems: total,
            pageSize: limit,
            currentPage: page,
            persistState: true,
            containerId: 'paginationContainer'
        });
        
        _tktPagination.setPage = (p, smoothScroll = true) => {
            if (p < 1 || p > _tktPagination.totalPages) return;
            _tktPage = p;
            if (_tktPagination.persistState) _tktPagination.syncUrl();
            loadTickets();
            if (smoothScroll) window.scrollTo({ top: 0, behavior: 'smooth' });
        };
        
        _tktPagination.setPageSize = (size) => {
            TKT_PER_PAGE = parseInt(size);
            _tktPage = 1;
            loadTickets();
        };
    } else {
        _tktPagination.updateData([], total, Math.ceil(total / limit), page);
    }
}

function updateStats(data) {
    const stats = data.stats || {};
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('ticketsIssued',    stats.total_tickets || 0);
    set('ticketsScanned',   stats.used_tickets || 0);
    set('ticketsRemaining', stats.remaining_tickets || 0);
    set('ticketsCancelled', stats.cancelled_tickets || 0);
    
    const revenueEl = document.getElementById('totalRevenue');
    if (revenueEl) {
        revenueEl.textContent = '₦' + (stats.total_revenue || 0).toLocaleString();
    }
}

function renderAdminStyledTicketQr(container, barcode) {
    if (!container || !barcode) return;
    const payload = `${window.location.origin}/api/tickets/validate-ticket.php?barcode=${encodeURIComponent(barcode)}`;

    if (typeof QRCode !== 'undefined') {
        container.innerHTML = `
            <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;margin-top:12px;pointer-events:none;user-select:none;">
                <div id="adminTicketPreviewQrInner" style="position:relative;background:#fff;padding:10px;border-radius:1rem;box-shadow:0 10px 25px -5px rgba(0,0,0,0.1);border:1px solid #e2e8f0;"></div>
            </div>`;
        try {
            new QRCode(document.getElementById('adminTicketPreviewQrInner'), {
                text: String(payload),
                width: 160,
                height: 160,
                colorDark: '#000000',
                colorLight: '#ffffff',
                correctLevel: QRCode.CorrectLevel.L
            });
        } catch (e) {
            console.error('Admin QR generation failed', e);
        }
    }
}

function openAdminTicketModal(ticket) {
    const existing = document.getElementById('adminTicketModal');
    if (existing) existing.remove();

    const imgSrc = ticket.event_image ? getImageUrl(ticket.event_image) : null;
    const heroFallback = 'linear-gradient(135deg, #6366f1 0%, #2ecc71 100%)';
    const price = ticket.price_display || 'Free';
    const typeLabel = ticket.ticket_type_display || ticket.ticket_type || 'Regular';
    const statusClass = ticket.status === 'valid' ? 'tkt-active' : ticket.status === 'used' ? 'tkt-used' : 'tkt-cancelled';
    const statusLabel = { valid: '✓ Valid', used: '👁 Used', cancelled: '✕ Cancelled' }[ticket.status] || ticket.status;

    const heroImageHtml = imgSrc
        ? `<img src="${imgSrc.replace(/"/g, '&quot;')}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;" onerror="this.style.display='none';">`
        : '';

    const html = `
    <div id="adminTicketModal" style="position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:9100;backdrop-filter:blur(6px);padding:1rem;">
        <div style="background:white;border-radius:20px;overflow:hidden;max-width:520px;width:100%;box-shadow:0 25px 60px rgba(0,0,0,.25);animation:slideUp .3s ease-out;">
            <!-- Event Image Hero -->
            <div style="height:160px;background:${heroFallback};background-size:cover;background-position:center;position:relative;overflow:hidden;">
                ${heroImageHtml}
                <button onclick="document.getElementById('adminTicketModal').remove()" style="position:absolute;top:1rem;right:1rem;background:rgba(0,0,0,.4);border:none;color:white;width:34px;height:34px;border-radius:50%;font-size:1.2rem;cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:2;">&times;</button>
                <div style="position:absolute;bottom:1rem;left:1.5rem;z-index:2;">
                    <div style="font-size:.7rem;font-weight:700;color:rgba(255,255,255,.7);text-transform:uppercase;letter-spacing:.07em;margin-bottom:2px;">Event</div>
                    <div style="font-size:1.25rem;font-weight:800;color:white;text-shadow:0 2px 8px rgba(0,0,0,.4);">${escapeHtml(ticket.event_name || '—')}</div>
                </div>
            </div>
            <!-- Details -->
            <div style="padding:1.5rem;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.25rem;">
                    <span style="font-family:monospace;font-size:.85rem;color:#6366f1;font-weight:700;">${escapeHtml(ticket.custom_id || ticket.id)}</span>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:.85rem;">
                    <div><div style="font-size:.7rem;color:#94a3b8;font-weight:700;text-transform:uppercase;margin-bottom:2px;">Buyer</div><div style="font-weight:600;">${escapeHtml(ticket.user_name || '—')}</div></div>
                    <div><div style="font-size:.7rem;color:#94a3b8;font-weight:700;text-transform:uppercase;margin-bottom:2px;">Price</div><div style="font-weight:700;">${price}</div></div>
                    <div><div style="font-size:.7rem;color:#94a3b8;font-weight:700;text-transform:uppercase;margin-bottom:2px;">Category</div><div style="font-weight:600;">${escapeHtml(ticket.category || 'General')}</div></div>
                    <div><div style="font-size:.7rem;color:#94a3b8;font-weight:700;text-transform:uppercase;margin-bottom:2px;">Date Purchased</div><div style="font-weight:600;">${ticket.created_at ? new Date(ticket.created_at).toLocaleDateString() : '—'}</div></div>
                    <div><div style="font-size:.7rem;color:#94a3b8;font-weight:700;text-transform:uppercase;margin-bottom:2px;">Ticket Type</div><div style="font-weight:600;text-transform:capitalize;color:#6366f1;">${escapeHtml(typeLabel)}</div></div>
                </div>
                <div style="background:#f8fafc;padding:1.25rem;border-radius:10px;margin:1.25rem 0;text-align:center;">
                    <div style="font-size:.7rem;color:#94a3b8;font-weight:700;text-transform:uppercase;margin-bottom:1rem;">Barcode</div>
                    <svg id="ticketBarcode" style="margin:0 auto;height:60px;"></svg>
                    <div style="font-family:monospace;font-size:.75rem;color:#475569;margin-top:0.75rem;word-break:break-all;">${escapeHtml(ticket.barcode || '—')}</div>
                    <div id="adminTicketQrContainer" style="margin-top:12px;"></div>
                </div>
                <button onclick="document.getElementById('adminTicketModal').remove()" style="margin-top:1.5rem;width:100%;padding:.75rem;background:#6366f1;color:white;border:none;border-radius:10px;font-weight:700;cursor:pointer;font-size:.9rem;">Close</button>
            </div>
        </div>
    </div>`;

    const template = document.createElement('template');
    template.innerHTML = html.trim();
    const modalEl = template.content.firstElementChild;
    document.body.appendChild(modalEl);
    
    // Render barcode with jsbarcode library
    const barcodeData = ticket.custom_id || ticket.barcode || (ticket.id ? ticket.id.toString() : '');
    if (barcodeData && typeof JsBarcode !== 'undefined') {
        try {
            JsBarcode("#ticketBarcode", barcodeData, {
                format: "CODE128",
                width: 2,
                height: 60,
                displayValue: false,
                margin: 0,
                background: "transparent",
                lineColor: "#1e293b"
            });
        } catch (e) {
        }
    }

    const qrContainer = document.getElementById('adminTicketQrContainer');
    if (qrContainer) {
        const barcode = ticket.barcode || ticket.custom_id || (ticket.id ? ticket.id.toString() : null);
        if (barcode) {
            renderAdminStyledTicketQr(qrContainer, barcode);
        }
    }
    
    document.addEventListener('keydown', function esc(e) { if (e.key === 'Escape') { modalEl?.remove(); document.removeEventListener('keydown', esc); } });
}


function setTableStatusRow(tbody, message, color = '#94a3b8') {
    tbody.textContent = '';
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 10;
    td.style.textAlign = 'center';
    td.style.padding = '2.5rem';
    td.style.color = color;
    td.textContent = message;
    tr.appendChild(td);
    tbody.appendChild(tr);
}

function createTicketRow(t) {
    const tr = document.createElement('tr');
    tr.onclick = () => openAdminTicketModal(t);

    const statusClass = t.status === 'valid' ? 'tkt-active' : t.status === 'used' ? 'tkt-used' : 'tkt-cancelled';
    const statusLabel = { valid: '✓ Valid', used: '👁 Used', cancelled: '✕ Cancelled' }[t.status] || t.status;

    // Checkbox Cell
    const tdCheck = document.createElement('td');
    tdCheck.style.paddingLeft = '1.5rem';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.className = 'ticket-checkbox';
    input.dataset.id = t.id;
    input.checked = selectedTicketIds.has(t.id.toString());
    input.onclick = (e) => e.stopPropagation();
    tdCheck.appendChild(input);
    tr.appendChild(tdCheck);

    // ID Cell
    const tdId = document.createElement('td');
    const divId = document.createElement('div');
    divId.style.fontSize = '.75rem';
    divId.style.color = 'var(--admin-primary)';
    divId.style.fontFamily = 'monospace';
    divId.style.fontWeight = '700';
    divId.textContent = t.custom_id || t.id;
    tdId.appendChild(divId);
    tr.appendChild(tdId);

    // Event Cell
    const tdEvent = document.createElement('td');
    if (t.event_image) {
        const img = document.createElement('img');
        img.src = getImageUrl(t.event_image);
        img.className = 'tkt-event-img';
        img.onerror = () => img.style.display = 'none';
        tdEvent.appendChild(img);
    } else {
        const spanIcon = document.createElement('span');
        spanIcon.className = 'tkt-event-img';
        spanIcon.style.display = 'inline-flex';
        spanIcon.style.alignItems = 'center';
        spanIcon.style.justifyContent = 'center';
        spanIcon.style.fontSize = '1.1rem';
        spanIcon.textContent = '🎟';
        tdEvent.appendChild(spanIcon);
    }
    const spanName = document.createElement('span');
    spanName.className = 'tkt-event-name';
    spanName.title = t.event_name || '';
    spanName.textContent = t.event_name || '—';
    tdEvent.appendChild(spanName);
    tr.appendChild(tdEvent);

    // User Cell
    const tdUser = document.createElement('td');
    tdUser.style.fontWeight = '500';
    tdUser.style.color = '#374151';
    tdUser.textContent = t.user_name || '—';
    tr.appendChild(tdUser);

    // Price Cell
    const tdPrice = document.createElement('td');
    if (t.price_display === 'Free') {
        const spanFree = document.createElement('span');
        spanFree.style.color = '#10b981';
        spanFree.style.fontWeight = '700';
        spanFree.textContent = 'Free';
        tdPrice.appendChild(spanFree);
    } else {
        const strongPrice = document.createElement('strong');
        strongPrice.textContent = t.price_display;
        tdPrice.appendChild(strongPrice);
    }
    tr.appendChild(tdPrice);

    // Category Cell
    const tdCat = document.createElement('td');
    const spanCat = document.createElement('span');
    spanCat.style.fontSize = '.82rem';
    spanCat.style.color = '#64748b';
    spanCat.textContent = t.category || 'General';
    tdCat.appendChild(spanCat);
    tr.appendChild(tdCat);

    // Date Cell
    const tdDate = document.createElement('td');
    tdDate.style.fontSize = '.83rem';
    tdDate.style.color = '#64748b';
    tdDate.textContent = t.created_at ? new Date(t.created_at).toLocaleDateString() : '—';
    tr.appendChild(tdDate);

    // Status Cell
    const tdStatus = document.createElement('td');
    const spanBadge = document.createElement('span');
    spanBadge.className = `tkt-badge ${statusClass}`;
    spanBadge.textContent = statusLabel;
    tdStatus.appendChild(spanBadge);
    tr.appendChild(tdStatus);

    return tr;
}

window.sortTicketsTable = sortTicketsTable;
window.openAdminTicketModal = openAdminTicketModal;
