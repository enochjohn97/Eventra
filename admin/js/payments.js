/**
 * Payments Dashboard — Admin JS
 * Supports two views: Transactions and Refund Requests.
 */

let _paymentsState = {
    page: 1,
    limit: 10,
    sort: 'date_desc',
    dateRange: 'all',
    status: '',
    search: '',
    totalPages: 1,
    view: 'transactions',
    pagination: null,
    selectedIds: new Set()
};

document.addEventListener('DOMContentLoaded', async () => {
    // Wire VIEW tabs
    document.querySelectorAll('[data-view]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('[data-view]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            _paymentsState.view = btn.dataset.view;
            _paymentsState.page = 1;
            _paymentsState.status = '';
            document.querySelectorAll('[data-status]').forEach(b => b.classList.remove('active'));
            const allStatus = document.querySelector('[data-status=""]');
            if (allStatus) allStatus.classList.add('active');
            loadPayments();
        });
    });

    // Wire search
    const search = document.getElementById('paymentSearch');
    if (search) {
        let debounce;
        search.addEventListener('input', e => {
            clearTimeout(debounce);
            debounce = setTimeout(() => {
                _paymentsState.search = e.target.value.trim();
                _paymentsState.page = 1;
                loadPayments();
            }, 400);
        });
    }

    // Wire sort
    const sortSelect = document.getElementById('sortSelect');
    if (sortSelect) sortSelect.addEventListener('change', e => {
        _paymentsState.sort = e.target.value;
        _paymentsState.page = 1;
        loadPayments();
    });

    // Date range tabs
    document.querySelectorAll('[data-range]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('[data-range]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            _paymentsState.dateRange = btn.dataset.range;
            _paymentsState.page = 1;
            loadPayments();
        });
    });

    // Status tabs
    document.querySelectorAll('[data-status]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('[data-status]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            _paymentsState.status = btn.dataset.status;
            _paymentsState.page = 1;
            loadPayments();
        });
    });

    await loadPayments();
});

async function loadPayments() {
    const tbody = document.getElementById('paymentsTableBody');
    const colCount = 10;
    if (tbody) tbody.innerHTML = `<tr><td colspan="${colCount}" style="text-align:center;padding:2.5rem;color:#94a3b8;">Loading...</td></tr>`;

    if (_paymentsState.view === 'refunds') {
        await loadRefundRequests();
        return;
    }

    const { page, limit, sort, dateRange, status, search } = _paymentsState;
    const params = new URLSearchParams({
        page, limit, sort,
        date_range: dateRange,
        ...(status && { status }),
        ...(search && { search }),
    });

    try {
        const res = await apiFetch(`/api/payments/get-payments.php?${params}`);
        const data = await res.json();

        if (!data.success) {
            if (tbody) tbody.innerHTML = `<tr><td colspan="${colCount}" style="text-align:center;padding:2rem;color:#ef4444;">${escapeHtml(data.message || 'Unknown error')}</td></tr>`;
            return;
        }

        _paymentsState.totalPages = data.pages || 1;
        renderTransactionsTable(data.payments);
        updateEventraPagination(data.total, data.page, data.limit, data.pages);
        computeStats(data.stats, data.total);
    } catch (err) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="${colCount}" style="text-align:center;padding:2rem;color:#ef4444;">Error loading payments.</td></tr>`;
    }
}

async function loadRefundRequests() {
    const tbody = document.getElementById('paymentsTableBody');
    const thead = document.getElementById('paymentsTableHead');

    if (thead) thead.innerHTML = `<tr>
        <th style="width: 40px;"><input type="checkbox" id="selectAll"></th>
        <th>DATE</th>
        <th>EVENT</th>
        <th>BUYER</th>
        <th>AMOUNT</th>
        <th>REASON</th>
        <th>NOTE</th>
        <th class="sortable">STATUS</th>
    </tr>`;

    try {
        const res = await apiFetch('/api/payments/get-refund-requests.php');
        const data = await res.json();

        // API returns 'data' key; support both for compatibility
        const requests = data.data || data.requests || [];

        if (!data.success || !requests.length) {
            if (tbody) tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:2.5rem;color:#94a3b8;">No refund requests found.</td></tr>`;
            return;
        }

        tbody.innerHTML = requests.map(r => {
            const statusClass = r.status === 'approved' ? 'status-paid' : r.status === 'declined' ? 'status-failed' : 'status-pending';
            const statusLabel = r.status === 'approved' ? '✓ Approved' : r.status === 'declined' ? '✗ Declined' : '⏳ Pending';
            return `<tr>
                <td><input type="checkbox" class="payment-checkbox" data-id="${r.id}"></td>
                <td>
                    <div style="font-weight:600;font-size:.88rem;">${formatDate(r.created_at)}</div>
                    <div style="font-size:.74rem;color:#94a3b8;">${new Date(r.created_at).toLocaleTimeString()}</div>
                </td>
                <td style="font-weight:600;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(r.event_name || '—')}</td>
                <td>
                    <div style="font-weight:600;font-size:.88rem;">${escapeHtml(r.user_name || '—')}</div>
                    <div style="font-size:.74rem;color:#94a3b8;">${escapeHtml(r.user_email || '')}</div>
                </td>
                <td style="font-weight:700;">₦${parseFloat(r.amount || 0).toLocaleString()}</td>
                <td style="font-size:.83rem;color:#475569;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHtml(r.reason || '')}">${escapeHtml(r.reason || '—')}</td>
                <td style="font-size:.83rem;color:#64748b;">${escapeHtml(r.organizer_note || '—')}</td>
                <td><span class="status-badge ${statusClass}">${statusLabel}</span></td>
            </tr>`;
        }).join('');

        updateEventraPagination(data.total, 1, data.limit || 100, 1);
    } catch (err) {
        console.error('[loadRefundRequests] Error:', err);
        if (tbody) tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:2rem;color:#ef4444;">Error loading refund requests.</td></tr>`;
    }
}

function restoreTransactionHeaders() {
    const thead = document.getElementById('paymentsTableHead');
    if (thead) thead.innerHTML = `<tr>
        <th style="width: 40px; padding-left: 1.5rem;"><input type="checkbox" id="selectAll"></th>
        <th class="sortable" onclick="changeSort('custom_id','custom_id')">ID ↕</th>
        <th class="sortable" onclick="changeSort('date_desc','date_asc')">DATE ↕</th>
        <th>EVENT</th>
        <th>ORGANIZER</th>
        <th class="sortable" onclick="changeSort('amount_desc','amount_asc')">AMOUNT ↕</th>
        <th>TICKETS</th>
        <th>TRANSACTION ID</th>
        <th>USER EMAIL</th>
        <th class="sortable" onclick="changeSort('status','status')">STATUS ↕</th>
    </tr>`;
}

function renderTransactionsTable(payments) {
    restoreTransactionHeaders();
    const tbody = document.getElementById('paymentsTableBody');
    if (!tbody) return;

    if (!payments.length) {
        tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:2.5rem;color:#94a3b8;">No payments found.</td></tr>`;
        return;
    }

    const statusIcons = { paid: '✓', pending: '⏳', failed: '✗', refunded: '↩' };

    tbody.innerHTML = payments.map(p => {
        const badgeClass = `status-${p.status}`;
        const icon = statusIcons[p.status] || '';
        const amountDisplay = parseFloat(p.amount) === 0
            ? '<span style="color:#10b981;font-weight:700">Free</span>'
            : `<strong>₦${parseFloat(p.amount).toLocaleString()}</strong>`;
        const encoded = JSON.stringify(p).replace(/"/g, '&quot;');

        const userCustomId = p.user_custom_id ? `<div style="font-size:.7rem;color:#94a3b8;font-family:monospace;">${p.user_custom_id}</div>` : '';
        const clientCustomId = p.client_custom_id ? `<div style="font-size:.7rem;color:#94a3b8;font-family:monospace;">${p.client_custom_id}</div>` : '';

        return `
        <tr onclick="openDetailModal(${encoded})">
            <td style="padding-left: 1.5rem;">
                <input type="checkbox" class="payment-checkbox" data-id="${escapeHtml(p.id)}" ${_paymentsState.selectedIds.has(p.id.toString()) ? 'checked' : ''}>
            </td>
            <td>
                <div style="font-size:.75rem;color:var(--admin-primary);font-family:monospace;font-weight:700;">${escapeHtml(p.custom_id || p.id)}</div>
            </td>
            <td>
                <div style="font-weight:600;font-size:.88rem;">${escapeHtml(p.formatted_date || new Date(p.created_at).toLocaleDateString())}</div>
                <div style="font-size:.74rem;color:#94a3b8;">${escapeHtml(p.formatted_time || new Date(p.created_at).toLocaleTimeString())}</div>
            </td>
            <td style="font-weight:600;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHtml(p.event_name || '')}">${escapeHtml((p.event_name || '—').replace(/\s*#\d+$/, ''))}</td>
            <td>
                <span style="font-size:.85rem;color:#475569;font-weight:500;">${escapeHtml(p.client_name || '—')}</span>
                ${p.client_custom_id ? `<div style="font-size:.7rem;color:#94a3b8;font-family:monospace;">${escapeHtml(p.client_custom_id)}</div>` : ''}
            </td>
            <td>${amountDisplay}</td>
            <td style="text-align:center;"><span class="ticket-badge">${parseInt(p.ticket_count) || 0}</span></td>
            <td>
                <div style="font-size:.75rem;color:#475569;font-family:monospace;">${escapeHtml(p.reference || '—')}</div>
            </td>
            <td>
                <span style="font-size:.83rem;color:#64748b;">${escapeHtml(p.buyer_email || '—')}</span>
                ${p.user_custom_id ? `<div style="font-size:.7rem;color:#94a3b8;font-family:monospace;">${escapeHtml(p.user_custom_id)}</div>` : ''}
            </td>
            <td><span class="status-badge ${badgeClass}">${icon} ${escapeHtml(ucfirst(p.status))}</span></td>
        </tr>`;
    }).join('');

    // Handle Select All
    const selectAll = document.getElementById('selectAll');
    if (selectAll) {
        selectAll.onchange = (e) => {
            const checkboxes = document.querySelectorAll('.payment-checkbox');
            checkboxes.forEach(cb => {
                cb.checked = e.target.checked;
                const id = cb.dataset.id;
                if (e.target.checked) _paymentsState.selectedIds.add(id);
                else _paymentsState.selectedIds.delete(id);
            });
            updateSelectAllState();
        };
    }

    // Handle individual checkboxes
    document.querySelectorAll('.payment-checkbox').forEach(cb => {
        cb.onclick = (e) => e.stopPropagation();
        cb.onchange = (e) => {
            const id = e.target.dataset.id;
            if (e.target.checked) _paymentsState.selectedIds.add(id);
            else _paymentsState.selectedIds.delete(id);
            updateSelectAllState();
        };
    });
    
    updateSelectAllState();
}

function updateSelectAllState() {
    const selectAll = document.getElementById('selectAll');
    if (!selectAll) return;
    const pageCheckboxes = document.querySelectorAll('.payment-checkbox');
    if (pageCheckboxes.length === 0) {
        selectAll.checked = false;
        return;
    }
    const allCheckedOnPage = Array.from(pageCheckboxes).every(cb => cb.checked);
    selectAll.checked = allCheckedOnPage;
}

function updateEventraPagination(total, page, limit, pages) {
    if (!_paymentsState.pagination) {
        _paymentsState.pagination = new EventraPagination({
            mode: 'server',
            totalItems: total,
            pageSize: limit,
            currentPage: page,
            containerId: 'paginationContainer',
            onPageChange: (dummyData) => {
                // In server mode, the callback triggers a search, 
                // but we need to update state first.
                // Actually, the component's internal state already changed?
                // Let's hook the setPage and setPageSize.
            }
        });
        
        // Override internal behavior for server-side
        const p = _paymentsState.pagination;
        p.setPage = (page) => {
            if (page < 1 || page > p.totalPages) return;
            _paymentsState.page = page;
            loadPayments();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        };
        p.setPageSize = (size) => {
            _paymentsState.limit = parseInt(size);
            _paymentsState.page = 1;
            loadPayments();
        };
    } else {
        _paymentsState.pagination.updateData([], total, pages, page);
    }
}

function computeStats(stats, total) {
    const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    // Use server-side aggregated stats for accuracy across all pages/records
    if (stats && typeof stats === 'object' && 'total' in stats) {
        setEl('statTotal',   stats.total   ?? total ?? 0);
        setEl('statPaid',    stats.successful ?? 0);
        setEl('statFailed',  stats.failed    ?? 0);
        const rev = parseFloat(stats.revenue ?? 0);
        setEl('statRevenue', rev === 0 ? '₦0' : `₦${rev.toLocaleString(undefined, { minimumFractionDigits: 0 })}`);
    } else {
        // Fallback: calculate from current page array (legacy path)
        const arr = Array.isArray(stats) ? stats : [];
        const paid    = arr.filter(p => p.status === 'paid');
        const failed  = arr.filter(p => p.status === 'failed');
        const revenue = paid.reduce((s, p) => s + parseFloat(p.amount), 0);
        setEl('statTotal',   total);
        setEl('statPaid',    paid.length);
        setEl('statFailed',  failed.length);
        setEl('statRevenue', revenue === 0 ? '₦0' : `₦${revenue.toLocaleString(undefined, { minimumFractionDigits: 0 })}`);
    }
}



function openDetailModal(payment) {
    const modal = document.getElementById('paymentDetailModal');
    const content = document.getElementById('paymentDetailContent');
    if (!modal || !content) return;

    const badgeClass = `status-${payment.status}`;
    const statusIcons = { paid: '✓', pending: '⏳', failed: '✗', refunded: '↩' };
    const icon = statusIcons[payment.status] || '';
    const amountDisplay = parseFloat(payment.amount) === 0
        ? '<span style="color:#10b981;font-weight:700">Free</span>'
        : `<strong>₦${parseFloat(payment.amount).toLocaleString()}</strong>`;

    // Proper image path resolution for payment modal
    let imageUrl = 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=1200&fit=crop';
    if (payment.event_image) {
        if (payment.event_image.startsWith('http') || payment.event_image.startsWith('data:')) {
            imageUrl = payment.event_image;
        } else if (payment.event_image.startsWith('/')) {
            imageUrl = '../../' + payment.event_image.substring(1);
        } else {
            imageUrl = '../../' + payment.event_image;
        }
    }
    const backgroundImage = payment.event_image ? `url('${imageUrl}')` : 'linear-gradient(135deg, #f1f5f9, #e2e8f0)';

    content.innerHTML = `
        <div style="text-align:center;margin-bottom:1.5rem;">
            <div style="width:100px;height:100px;border-radius:16px;background:${backgroundImage};background-size:cover;background-position:center;margin:0 auto 1rem;box-shadow:0 4px 12px rgba(0,0,0,0.1);"></div>
            <h3 style="font-size:1.2rem;font-weight:700;color:#1e293b;margin:0 0 .4rem;">${escapeHtml(payment.event_name || '—')}</h3>
            <p style="font-size:.875rem;color:#64748b;margin:0 0 1rem;">by <strong style="color:#1e293b;">${escapeHtml(payment.client_name || '—')}</strong></p>
            <span class="status-badge ${badgeClass}" style="font-size:.9rem;padding:.35rem 1.2rem;">${icon} ${escapeHtml(ucfirst(payment.status))}</span>
        </div>
        <div class="detail-row"><span class="detail-label">Reference</span><span class="detail-value" style="font-family:monospace;font-size:.83rem">${escapeHtml(payment.reference || '—')}</span></div>
        <div class="detail-row"><span class="detail-label">Payment ID</span><span class="detail-value" style="font-family:monospace;font-size:.85rem;color:var(--admin-primary);font-weight:700;">${escapeHtml(payment.custom_id || payment.id)}</span></div>
        <div class="detail-row"><span class="detail-label">Amount</span><span class="detail-value">${amountDisplay}</span></div>
        <div class="detail-row"><span class="detail-label">Tickets</span><span class="detail-value">${parseInt(payment.ticket_count) || 0} ticket(s)</span></div>
        <div class="detail-row"><span class="detail-label">Buyer</span><span class="detail-value">${escapeHtml(payment.buyer_name || '—')}</span></div>
        <div class="detail-row"><span class="detail-label">Email</span><span class="detail-value">${escapeHtml(payment.buyer_email || '—')}</span></div>
        <div class="detail-row"><span class="detail-label">Created</span><span class="detail-value">${escapeHtml(new Date(payment.created_at).toLocaleString())}</span></div>
        ${payment.paid_at ? `<div class="detail-row"><span class="detail-label">Paid At</span><span class="detail-value">${escapeHtml(new Date(payment.paid_at).toLocaleString())}</span></div>` : ''}
        ${payment.ticket_barcodes ? `<div class="detail-row"><span class="detail-label">Barcodes</span><span class="detail-value" style="font-family:monospace;font-size:.78rem;word-break:break-all">${escapeHtml(payment.ticket_barcodes)}</span></div>` : ''}
    `;

    modal.classList.add('open');
    document.addEventListener('keydown', _closeOnEsc);
}

function closeDetailModal() {
    const m = document.getElementById('paymentDetailModal');
    if (m) m.classList.remove('open');
    document.removeEventListener('keydown', _closeOnEsc);
}
function _closeOnEsc(e) { if (e.key === 'Escape') closeDetailModal(); }

function changeSort(desc, asc) {
    const current = _paymentsState.sort;
    const newSort = current === desc ? asc : desc;
    _paymentsState.sort = newSort;
    _paymentsState.page = 1;
    const sel = document.getElementById('sortSelect');
    if (sel) sel.value = newSort;
    loadPayments();
}

function toggleExportMenu() {
    const menu = document.getElementById('exportMenu');
    if (menu) menu.classList.toggle('open');
    document.addEventListener('click', function close(e) {
        if (!e.target.closest('.export-dropdown')) { menu && menu.classList.remove('open'); document.removeEventListener('click', close); }
    });
}

function exportPayments(format) {
    const menu = document.getElementById('exportMenu');
    if (menu) menu.classList.remove('open');

    const { sort, dateRange, status, search } = _paymentsState;
    const params = new URLSearchParams({
        format, sort,
        date_range: dateRange,
        ...(status && { status }),
        ...(search && { search }),
    });

    Swal.fire({
        title: 'Generating Report',
        text: `The ${format.toUpperCase()} file is being prepared...`,
        icon: 'info',
        timer: 3000,
        timerProgressBar: true,
        showConfirmButton: false,
        didOpen: () => {
            Swal.showLoading();
            window.open(`/api/payments/export-payments.php?${params}`, '_blank');
        }
    });
}

function formatDate(dateStr) {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
}

function ucfirst(str) {
    return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
}

window.openDetailModal = openDetailModal;
window.closeDetailModal = closeDetailModal;
window.changeSort = changeSort;
window.toggleExportMenu = toggleExportMenu;
window.exportPayments = exportPayments;
