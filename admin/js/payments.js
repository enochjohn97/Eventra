/**
 * Payments Dashboard — Admin JS
 * Admin sees ALL payments across all users/events.
 * Reuses same rendering helpers as client, but with admin scope.
 */

let _paymentsState = {
    page: 1,
    limit: 20,
    sort: 'date_desc',
    dateRange: 'all',
    status: '',
    search: '',
    totalPages: 1,
};

document.addEventListener('DOMContentLoaded', async () => {
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
    if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:2rem;color:#94a3b8;">Loading...</td></tr>';

    const { page, limit, sort, dateRange, status, search } = _paymentsState;
    const params = new URLSearchParams({
        page, limit, sort,
        date_range: dateRange,
        ...(status && { status }),
        ...(search && { search }),
    });

    try {
        const res = await apiFetch(`../../api/payments/get-payments.php?${params}`);
        const data = await res.json();

        if (!data.success) {
            if (tbody) tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:2rem;color:#ef4444;">${data.message}</td></tr>`;
            return;
        }

        _paymentsState.totalPages = data.pages || 1;
        renderPaymentsTable(data.payments, true);
        renderPagination(data.total, data.page, data.limit, data.pages);
        computeStats(data.payments, data.total);
    } catch (err) {
        console.error('Payments load error', err);
        if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:2rem;color:#ef4444;">Error loading payments.</td></tr>';
    }
}

function renderPaymentsTable(payments, isAdmin = false) {
    const tbody = document.getElementById('paymentsTableBody');
    if (!tbody) return;

    if (!payments.length) {
        tbody.innerHTML = `<tr><td colspan="${isAdmin ? 8 : 7}" style="text-align:center;padding:2rem;color:#94a3b8;">No payments found.</td></tr>`;
        return;
    }

    tbody.innerHTML = payments.map(p => {
        const badgeClass = `status-${p.status}`;
        const amountDisplay = parseFloat(p.amount) === 0
            ? '<span style="color:#10b981;font-weight:700">Free</span>'
            : `₦${parseFloat(p.amount).toLocaleString()}`;
        const encoded = JSON.stringify(p).replace(/"/g, '&quot;');

        return `
        <tr class="table-row-clickable" onclick="openDetailModal(${encoded})">
            <td>
                <div style="font-weight:600;font-size:.9rem;">${p.relative_time}</div>
                <div style="font-size:.75rem;color:#94a3b8;">${new Date(p.created_at).toLocaleString()}</div>
            </td>
            <td style="font-weight:600;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHtml(p.event_name || '')}">${escapeHtml(p.event_name || '—')}</td>
            <td><span style="font-size:0.85rem;color:#475569;font-weight:500;">${escapeHtml(p.client_name || '—')}</span></td>
            <td>${escapeHtml(p.buyer_name || '—')}</td>
            <td style="font-weight:700;">${amountDisplay}</td>
            <td style="text-align:center;"><span style="background:#e0f2fe;color:#0369a1;padding:2px 10px;border-radius:20px;font-size:.8rem;font-weight:700;">${p.ticket_count || 0}</span></td>
            <td><span style="font-size:0.85rem;color:#64748b;">${escapeHtml(p.buyer_email || '—')}</span></td>
            <td><span class="status-badge ${badgeClass}">${ucfirst(p.status)}</span></td>
        </tr>`;
    }).join('');
}

function computeStats(payments, total) {
    const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    const paid    = payments.filter(p => p.status === 'paid');
    const failed  = payments.filter(p => p.status === 'failed');
    const revenue = paid.reduce((s, p) => s + parseFloat(p.amount), 0);
    setEl('statTotal',   total);
    setEl('statPaid',    paid.length);
    setEl('statFailed',  failed.length);
    setEl('statRevenue', revenue === 0 ? '₦0' : `₦${revenue.toLocaleString(undefined, { minimumFractionDigits: 0 })}`);
}

function renderPagination(total, page, limit, pages) {
    const info = document.getElementById('paginationInfo');
    const btns = document.getElementById('paginationBtns');
    if (!info || !btns) return;

    const from = total === 0 ? 0 : (page - 1) * limit + 1;
    const to   = Math.min(page * limit, total);
    info.textContent = `Showing ${from}–${to} of ${total} payments`;
    btns.innerHTML = '';

    const prev = document.createElement('button');
    prev.className = 'page-btn'; prev.textContent = '← Prev'; prev.disabled = page <= 1;
    prev.onclick = () => { _paymentsState.page--; loadPayments(); };
    btns.appendChild(prev);

    for (let i = Math.max(1, page - 2); i <= Math.min(pages, page + 2); i++) {
        const btn = document.createElement('button');
        btn.className = `page-btn${i === page ? ' active' : ''}`;
        btn.textContent = i;
        const pg = i;
        btn.onclick = () => { _paymentsState.page = pg; loadPayments(); };
        btns.appendChild(btn);
    }

    const next = document.createElement('button');
    next.className = 'page-btn'; next.textContent = 'Next →'; next.disabled = page >= pages;
    next.onclick = () => { _paymentsState.page++; loadPayments(); };
    btns.appendChild(next);
}

function openDetailModal(payment) {
    const modal = document.getElementById('paymentDetailModal');
    const content = document.getElementById('paymentDetailContent');
    if (!modal || !content) return;

    const badgeClass = `status-${payment.status}`;
    const amountDisplay = parseFloat(payment.amount) === 0
        ? '<span style="color:#10b981;font-weight:700">Free</span>'
        : `<strong>₦${parseFloat(payment.amount).toLocaleString()}</strong>`;

    const imageUrl = payment.event_image ? payment.event_image : '/public/assets/event-placeholder.jpg';
    const backgroundImage = payment.event_image ? `url(${imageUrl})` : 'linear-gradient(135deg, #f1f5f9, #e2e8f0)';

    content.innerHTML = `
        <div style="text-align:center;margin-bottom:1.5rem;">
            <div style="width: 100px; height: 100px; border-radius: 16px; background: ${backgroundImage}; background-size: cover; background-position: center; margin: 0 auto 1rem; box-shadow: 0 4px 12px rgba(0,0,0,0.1);"></div>
            <h3 style="font-size:1.25rem;font-weight:700;color:#1e293b;margin:0 0 0.5rem;">${escapeHtml(payment.event_name || '—')}</h3>
            <p style="font-size:0.9rem;color:#64748b;margin:0 0 1rem;">Organized by: <span style="font-weight:600;color:#1e293b;">${escapeHtml(payment.client_name || '—')}</span></p>
            <span class="status-badge ${badgeClass}" style="font-size:1rem;padding:.4rem 1.2rem;">${ucfirst(payment.status)}</span>
        </div>
        <div class="detail-row"><span class="detail-label">Reference</span><span class="detail-value" style="font-family:monospace;font-size:.85rem">${payment.reference || '—'}</span></div>
        <div class="detail-row"><span class="detail-label">Amount</span><span class="detail-value">${amountDisplay}</span></div>
        <div class="detail-row"><span class="detail-label">Tickets</span><span class="detail-value">${payment.ticket_count || 0} ticket(s)</span></div>
        <div class="detail-row"><span class="detail-label">Buyer</span><span class="detail-value">${escapeHtml(payment.buyer_name || '—')}</span></div>
        <div class="detail-row"><span class="detail-label">Email</span><span class="detail-value">${escapeHtml(payment.buyer_email || '—')}</span></div>
        <div class="detail-row"><span class="detail-label">Created</span><span class="detail-value">${new Date(payment.created_at).toLocaleString()}</span></div>
        ${payment.paid_at ? `<div class="detail-row"><span class="detail-label">Paid At</span><span class="detail-value">${new Date(payment.paid_at).toLocaleString()}</span></div>` : ''}
        ${payment.ticket_barcodes ? `<div class="detail-row"><span class="detail-label">Barcodes</span><span class="detail-value" style="font-family:monospace;font-size:.8rem;word-break:break-all">${payment.ticket_barcodes}</span></div>` : ''}
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

function toggleExportMenu(btn) {
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
    const params = new URLSearchParams({ format, sort, date_range: dateRange, ...(status && { status }), ...(search && { search }) });
    window.open(`../../api/payments/export-payments.php?${params}`, '_blank');
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function ucfirst(str) {
    return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
}

window.openDetailModal = openDetailModal;
window.closeDetailModal = closeDetailModal;
window.changeSort = changeSort;
window.toggleExportMenu = toggleExportMenu;
window.exportPayments = exportPayments;
