/**
 * Payments Dashboard — Client JS
 * Handles: loading, filtering, sorting, pagination, detail modal, export
 */

let _paymentsState = {
    viewMode: 'transactions', // 'transactions' or 'refunds'
    page: 1,
    limit: 20,
    sort: 'date_desc',
    dateRange: 'all',
    status: '',
    search: '',
    totalPages: 1,
    allPayments: [], // current loaded set for stats
    pagination: null,
};

// ─── App Role Detection ────────────────────────────────────────────────────
const _isAdmin = (() => {
    try {
        const user = storage.getUser();
        return user && user.role === 'admin';
    } catch (e) { return false; }
})();

// ─── Init ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    const user = storage.getUser();
    if (!user) return;

    // Avatar
    // Load client profile for avatar consistency
    const userProfileAvatars = document.querySelectorAll('.user-avatar');
    if (userProfileAvatars.length > 0) {
        const avatarUrl = user.profile_pic || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name || user.business_name || 'User')}&background=random&color=fff`;
        userProfileAvatars.forEach(avatar => {
            avatar.style.backgroundImage = `url(${avatarUrl})`;
            avatar.style.backgroundSize = 'cover';
            avatar.style.backgroundPosition = 'center';
            avatar.textContent = '';
        });
    }

    // Search functionality handled by global search in header if needed, 
    // or removed as per user request to declutter the table area.

    // Wire sort
    const sortSelect = document.getElementById('sortSelect');
    if (sortSelect) {
        sortSelect.addEventListener('change', (e) => {
            _paymentsState.sort = e.target.value;
            _paymentsState.page = 1;
            loadPayments();
        });
    }

    // Wire date-range filter tabs
    document.querySelectorAll('[data-range]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('[data-range]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            _paymentsState.dateRange = btn.dataset.range;
            _paymentsState.page = 1;
            loadPayments();
        });
    });

    // Wire status filter tabs
    document.querySelectorAll('[data-status]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('[data-status]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            _paymentsState.status = btn.dataset.status;
            _paymentsState.page = 1;
            loadPayments();
        });
    });

    // Wire View Mode tabs
    document.querySelectorAll('[data-view]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('[data-view]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            _paymentsState.viewMode = btn.dataset.view;
            _paymentsState.page = 1;
            _paymentsState.status = ''; // reset status filter when switching views
            
            // Sync status tabs UI
            document.querySelectorAll('[data-status]').forEach(b => {
                b.classList.toggle('active', b.dataset.status === '');
            });

            updateTableHeaders();
            loadPayments();
        });
    });

    await loadPayments();
});

function updateTableHeaders() {
    const theadRow = document.querySelector('thead tr');
    if (!theadRow) return;

    if (_paymentsState.viewMode === 'transactions') {
        theadRow.innerHTML = `
            <th style="width: 40px;"><input type="checkbox" id="selectAll"></th>
            <th>ID</th>
            <th style="cursor:pointer;" onclick="changeSort('date_desc','date_asc')">Date <i data-lucide="chevron-down" style="width:14px;display:inline-block;vertical-align:middle;margin-left:4px;"></i></th>
            <th>Transaction ID</th>
            <th style="cursor:pointer;" onclick="changeSort('event','event')">Event</th>
            <th>Organizer</th>
            <th style="cursor:pointer;" onclick="changeSort('amount_desc','amount_asc')">Amount</th>
            <th style="text-align:center;">Tickets</th>
            <th>User Email</th>
            <th style="cursor:pointer;" onclick="changeSort('status','status')">Status</th>
        `;
    } else {
        theadRow.innerHTML = `
            <th style="width: 40px;"><input type="checkbox" id="selectAll"></th>
            <th>Date Requested</th>
            <th>Event / User</th>
            <th>Reason</th>
            <th>Amount</th>
            <th>Status</th>
            <th style="text-align:right;">Actions</th>
        `;
    }
    if (window.lucide) lucide.createIcons();
}

// ─── Load payments from API ────────────────────────────────────────────────
async function loadPayments() {
    const tbody = document.getElementById('paymentsTableBody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:2rem;color:#94a3b8;"><span class="btn-spinner" style="margin-right:8px"></span>Loading...</td></tr>';

    const { viewMode, page, limit, sort, dateRange, status, search } = _paymentsState;
    
    if (viewMode === 'transactions') {
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
                if (tbody) tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:2rem;color:#ef4444;">Failed to load payments: ${escapeHtml(data.message)}</td></tr>`;
                return;
            }

            _paymentsState.totalPages = data.pages || 1;
            _paymentsState.allPayments = data.payments || [];
            
            updateEventraPagination(data.total, data.page, data.limit, data.pages, data.payments);
            renderPaymentsTable(data.payments);
            computeStats(data.payments, data.total);
        } catch (err) {
            if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:2rem;color:#ef4444;">An error occurred loading payments.</td></tr>';
        }
    } else {
        // Load Refund Requests
        const params = new URLSearchParams({
            ...(status && { status }),
        });
        try {
            const res = await apiFetch(`/api/payments/get-refund-requests.php?${params}`);
            const data = await res.json();

            if (!data.success) {
                if (tbody) tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:2rem;color:#ef4444;">Failed to load refunds: ${escapeHtml(data.message)}</td></tr>`;
                return;
            }

            // Handle both new format (data.data) and legacy format (data.requests) for compatibility
            const refunds = data.data || data.requests || [];
            renderRefundsTable(refunds);
            // Pagination not implemented for refunds in this version (usually smaller set)
            const info = document.getElementById('paginationInfo');
            if (info) info.textContent = `Total ${data.total} refund requests`;
            const btns = document.getElementById('paginationBtns');
            if (btns) btns.innerHTML = '';
        } catch (err) {
            if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem;color:#ef4444;">An error occurred loading refund requests.</td></tr>';
        }
    }
}

// ─── Render Table ──────────────────────────────────────────────────────────
function renderPaymentsTable(payments) {
    const tbody = document.getElementById('paymentsTableBody');
    if (!tbody) return;

    if (!payments.length) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:2rem;color:#94a3b8;">No payments found.</td></tr>';
        return;
    }

    tbody.innerHTML = payments.map(p => {
        const badgeClass = `status-${p.status}`;
        const amountDisplay = parseFloat(p.amount) === 0 ? '<span style="color:#722f37;font-weight:700">Free</span>' : `₦${parseFloat(p.amount).toLocaleString()}`;
        const rowData = encodeURIComponent(JSON.stringify(p));
        
        const userCustomId = p.user_custom_id ? `<div style="font-size:.7rem;color:#94a3b8;font-family:monospace;">${p.user_custom_id}</div>` : '';
        const clientCustomId = p.client_custom_id ? `<div style="font-size:.7rem;color:#94a3b8;font-family:monospace;">${p.client_custom_id}</div>` : '';

        return `
        <tr class="table-row-clickable" onclick="openDetailModal(${JSON.stringify(p).replace(/"/g,'&quot;')})">
            <td><input type="checkbox" class="payment-checkbox" data-id="${p.id}"></td>
            <td style="font-family:monospace;font-size:0.85rem;color:#635bff;font-weight:700;">${p.custom_id || p.id}</td>
            <td>
                <div style="font-weight:600;font-size:.88rem;">${escapeHtml(p.formatted_date || new Date(p.created_at).toLocaleDateString())}</div>
                <div style="font-size:.74rem;color:#94a3b8;">${escapeHtml(p.formatted_time || new Date(p.created_at).toLocaleTimeString())}</div>
            </td>
            <td style="font-family:monospace;font-size:0.8rem;color:#64748b;">${p.reference || '—'}</td>
            <td style="font-weight:600;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHtml((p.event_name || '-').replace(/\s*#\d+$/, ''))}">
                ${escapeHtml((p.event_name || '—').replace(/\s*#\d+$/, ''))}
            </td>
            <td>
                <span style="font-size:0.85rem;color:#475569;font-weight:500;">${escapeHtml(p.client_name || '—')}</span>
                ${clientCustomId}
            </td>
            <td style="font-weight:700;">${amountDisplay}</td>
            <td style="text-align:center;">
                <span style="background:#eef2ff;color:#4f46e5;padding:2px 10px;border-radius:20px;font-size:0.8rem;font-weight:700;">${p.ticket_count || 0}</span>
            </td>
            <td>
                <span style="font-size:0.85rem;color:#64748b;">${escapeHtml(p.buyer_email || '—')}</span>
                ${userCustomId}
            </td>
            <td><span class="status-badge ${badgeClass}">${ucfirst(p.status)}</span></td>
        </tr>`;
    }).join('');

    // Handle Select All
    const selectAll = document.getElementById('selectAll');
    if (selectAll) {
        selectAll.onchange = (e) => {
            const checkboxes = document.querySelectorAll('.payment-checkbox');
            checkboxes.forEach(cb => cb.checked = e.target.checked);
        };
    }

    // Prevent detail modal open on checkbox click
    document.querySelectorAll('.payment-checkbox, #selectAll').forEach(cb => {
        cb.onclick = (e) => e.stopPropagation();
    });
}

function renderRefundsTable(requests) {
    const tbody = document.getElementById('paymentsTableBody');
    if (!tbody) return;

    if (!requests.length) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem;color:#94a3b8;">No refund requests found.</td></tr>';
        return;
    }

    tbody.innerHTML = requests.map(r => {
        const statusClass = `status-${r.status}`;
        return `
        <tr>
            <td><input type="checkbox" class="payment-checkbox" data-id="${r.id}"></td>
            <td>
                <div style="font-weight:600;">${new Date(r.created_at).toLocaleDateString()}</div>
                <div style="font-size:0.75rem;color:#64748b;">${new Date(r.created_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</div>
            </td>
            <td>
                <div style="font-weight:700;color:#1e293b;">${escapeHtml((r.event_name || '').replace(/\s*#\d+$/, ''))}</div>
                <div style="font-size:0.85rem;color:#64748b;">Requested by: ${escapeHtml(r.user_name)}</div>
            </td>
            <td style="max-width:240px;font-size:0.9rem;line-height:1.4;">${escapeHtml(r.reason)}</td>
            <td style="font-weight:700;color:#ef4444;">₦${parseFloat(r.amount).toLocaleString()}</td>
            <td><span class="status-badge ${statusClass}">${ucfirst(r.status)}</span></td>
            <td style="text-align:right;">
                ${r.status === 'pending' ? `
                    <div style="display:flex;gap:8px;justify-content:flex-end;">
                        <button onclick="reviewRefund(${r.id}, 'approve')" class="page-btn active" style="padding:4px 12px;background:#722f37;border-color:#722f37;font-size:0.8rem;">Approve</button>
                        <button onclick="reviewRefund(${r.id}, 'decline')" class="page-btn" style="padding:4px 12px;color:#ef4444;font-size:0.8rem;">Decline</button>
                    </div>
                ` : `
                    <span style="font-size:0.75rem;color:#94a3b8;">Processed ${r.processed_at ? new Date(r.processed_at).toLocaleDateString() : 'n/a'}</span>
                `}
            </td>
        </tr>`;
    }).join('');

    // Handle Select All (same as above for refunds)
    const selectAll = document.getElementById('selectAll');
    if (selectAll) {
        selectAll.onchange = (e) => {
            const checkboxes = document.querySelectorAll('.payment-checkbox');
            checkboxes.forEach(cb => cb.checked = e.target.checked);
        };
    }

    // Prevent detail modal open on checkbox click
    document.querySelectorAll('.payment-checkbox, #selectAll').forEach(cb => {
        cb.onclick = (e) => e.stopPropagation();
    });
}

async function reviewRefund(requestId, action) {
    let note = '';
    if (action === 'decline') {
        const { value: text } = await Swal.fire({
            title: 'Decline Reason',
            input: 'textarea',
            inputLabel: 'Provide a reason for the user',
            inputPlaceholder: 'Type your reason here...',
            inputAttributes: { 'aria-label': 'Type your reason here' },
            showCancelButton: true
        });
        if (text === undefined) return; // cancelled
        note = text;
    } else {
        const confirm = await Swal.fire({
            title: 'Approve Refund?',
            text: "This will call Paystack to refund the money and cancel the ticket. This action cannot be undone.",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#722f37',
            cancelButtonColor: '#9ca3af',
            confirmButtonText: 'Yes, Approve'
        });
        if (!confirm.isConfirmed) return;
    }

    try {
        const res = await apiFetch('/api/payments/review-refund.php', {
            method: 'POST',
            body: JSON.stringify({ refund_request_id: requestId, action, note })
        });
        const data = await res.json();
        if (data.success) {
            Swal.fire('Success', data.message, 'success');
            loadPayments();
        } else {
            Swal.fire('Error', data.message, 'error');
        }
    } catch (err) {
        Swal.fire('Error', 'An error occurred while processing the refund.', 'error');
    }
}

// ─── Stats Cards ───────────────────────────────────────────────────────────
function computeStats(payments, total) {
    const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    const paid    = payments.filter(p => p.status === 'paid');
    const failed  = payments.filter(p => p.status === 'failed');
    const revenue = paid.reduce((s, p) => s + parseFloat(p.amount), 0);
    setEl('statTotal',   total);
    setEl('statPaid',    paid.length);
    setEl('statFailed',  failed.length);
    setEl('statRevenue', revenue === 0 ? '₦0' : `₦${revenue.toLocaleString(undefined, {minimumFractionDigits: 0})}`);
}

// ─── Pagination ────────────────────────────────────────────────────────────
function updateEventraPagination(total, page, limit, pages, data) {
    if (!_paymentsState.pagination) {
        _paymentsState.pagination = new EventraPagination({
            mode: 'server',
            totalItems: total,
            pageSize: limit,
            currentPage: page,
            containerId: 'paginationContainer',
            onPageChange: (dummyData) => {
                // Handled via overrides below
            }
        });
        
        // Override for server-side persistence
        const p = _paymentsState.pagination;
        p.setPage = (newPage, smooth = true) => {
            if (newPage < 1 || newPage > p.totalPages) return;
            _paymentsState.page = newPage;
            loadPayments();
            if (smooth) window.scrollTo({ top: 0, behavior: 'smooth' });
        };
        p.setPageSize = (size) => {
            _paymentsState.limit = parseInt(size);
            _paymentsState.page = 1;
            loadPayments();
        };
    } else {
        _paymentsState.pagination.updateData(data, total, pages, page, false);
    }
}

// ─── Detail Modal ──────────────────────────────────────────────────────────
function openDetailModal(payment) {
    if (!payment) return;

    const modalOverlay = document.createElement('div');
    modalOverlay.className = 'modal-backdrop active';
    modalOverlay.id = 'paymentDetailModalOverlay';
    modalOverlay.style.background = 'rgba(0,0,0,0.6)';
    modalOverlay.style.backdropFilter = 'blur(6px)';
    modalOverlay.style.zIndex = '9999';
    modalOverlay.style.position = 'fixed';
    modalOverlay.style.top = '0';
    modalOverlay.style.left = '0';
    modalOverlay.style.width = '100%';
    modalOverlay.style.height = '100%';
    modalOverlay.style.display = 'flex';
    modalOverlay.style.alignItems = 'center';
    modalOverlay.style.justifyContent = 'center';

    const modalContent = document.createElement('div');
    modalContent.className = 'modal-content';
    modalContent.style.maxWidth = '800px';
    modalContent.style.borderRadius = '20px';
    modalContent.style.overflow = 'hidden';
    modalContent.style.padding = '0';
    modalContent.style.transform = 'translateY(20px)';
    modalContent.style.transition = 'all 0.3s ease';
    modalContent.style.background = 'white';
    modalContent.style.boxShadow = '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)';

    const statusMap = {
        'paid': { color: '#722f37', bg: '#d1fae5', icon: 'check-circle' },
        'confirmed': { color: '#722f37', bg: '#d1fae5', icon: 'check-circle' },
        'pending': { color: '#f59e0b', bg: '#fef3c7', icon: 'clock' },
        'failed': { color: '#ef4444', bg: '#fee2e2', icon: 'x-circle' }
    };
    const s = statusMap[payment.status.toLowerCase()] || { color: '#6b7280', bg: '#f3f4f6', icon: 'help-circle' };

    modalContent.innerHTML = `
        <div class="modal-header" style="background: white; padding: 1.5rem 2rem; border-bottom: 1px solid #f1f5f9; display: flex; justify-content: space-between; align-items: center;">
            <div style="display: flex; align-items: center; gap: 12px;">
                <div style="width: 40px; height: 40px; background: ${s.bg}; border-radius: 12px; display: flex; align-items: center; justify-content: center; color: ${s.color};">
                    <i data-lucide="${s.icon}" style="width: 24px; height: 24px;"></i>
                </div>
                <div>
                    <h2 style="margin: 0; font-size: 1.25rem; font-weight: 700; color: #1e293b;">Transaction Details</h2>
                    <div style="font-size: 0.85rem; color: #64748b; font-family: monospace;">${escapeHtml(payment.custom_id || payment.id || 'N/A')}</div>
                </div>
            </div>
            <button class="modal-close-trigger" style="background: #f1f5f9; border: none; width: 32px; height: 32px; border-radius: 50%; color: #64748b; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 1.25rem; transition: background 0.2s;">&times;</button>
        </div>
        
        <div class="modal-body" style="padding: 2.5rem 2rem; background: white;">
            <div style="display: flex; gap: 2.5rem; flex-wrap: wrap;">
                <!-- Summary Card with event image overlay -->
                <div style="flex: 0 0 240px; border-radius: 20px; overflow: hidden; position: relative; border: 1px solid #f1f5f9; min-height: 200px;">
                    ${payment.event_image ? `
                        <div style="position: absolute; inset: 0; background: url('${getImageUrl(payment.event_image)}') center/cover no-repeat;"></div>
                        <div style="position: absolute; inset: 0; background: linear-gradient(to bottom, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.75) 100%);"></div>
                    ` : `<div style="position: absolute; inset: 0; background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);"></div>`}
                    <div style="position: relative; padding: 2rem; text-align: center; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1rem;">
                        <div style="font-size: 0.85rem; color: rgba(255,255,255,0.8); font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Total Amount</div>
                        <div style="font-size: 1.75rem; font-weight: 800; color: white; text-shadow: 0 2px 8px rgba(0,0,0,0.3);">₦${parseFloat(payment.amount).toLocaleString()}</div>
                        
                        <div style="display: inline-flex; align-items: center; gap: 6px; padding: 6px 16px; border-radius: 20px; background: ${s.bg}; color: ${s.color}; font-weight: 700; font-size: 0.85rem; text-transform: capitalize;">
                            <i data-lucide="${s.icon}" style="width: 14px; height: 14px;"></i>
                            ${escapeHtml(payment.status)}
                        </div>
                        
                        <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid rgba(255,255,255,0.2); width: 100%; text-align: left;">
                            <div style="font-size: 0.75rem; color: rgba(255,255,255,0.6); font-weight: 700; text-transform: uppercase; margin-bottom: 8px;">Payment Method</div>
                            <div style="display: flex; align-items: center; gap: 10px; color: white; font-weight: 600;">
                                <div style="width: 32px; height: 32px; background: rgba(255,255,255,0.15); border-radius: 8px; display: flex; align-items: center; justify-content: center; border: 1px solid rgba(255,255,255,0.2);">
                                    <i data-lucide="credit-card" style="width: 18px; height: 18px; color: white;"></i>
                                </div>
                                Paystack
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Detailed Information Grid -->
                <div style="flex: 1; min-width: 300px; display: grid; grid-template-columns: 1fr 1fr; gap: 2rem;">
                    <div>
                        <div style="font-size: 0.75rem; text-transform: uppercase; color: #94a3b8; font-weight: 700; margin-bottom: 0.5rem; letter-spacing: 0.5px;">Customer Name</div>
                        <div style="font-weight: 700; color: #1e293b; font-size: 1.05rem;">${escapeHtml(payment.buyer_name || 'Guest')}</div>
                    </div>
                    
                    <div>
                        <div style="font-size: 0.75rem; text-transform: uppercase; color: #94a3b8; font-weight: 700; margin-bottom: 0.5rem; letter-spacing: 0.5px;">Customer Email</div>
                        <div style="font-weight: 600; color: #334155; font-size: 1rem;">${escapeHtml(payment.buyer_email || 'N/A')}</div>
                    </div>

                    <div>
                        <div style="font-size: 0.75rem; text-transform: uppercase; color: #94a3b8; font-weight: 700; margin-bottom: 0.5rem; letter-spacing: 0.5px;">Event Name</div>
                        <div style="font-weight: 700; color: #1e293b; font-size: 1.05rem;">${escapeHtml((payment.event_name || 'N/A').replace(/\s*#\d+$/, ''))}</div>
                    </div>

                    <div>
                        <div style="font-size: 0.75rem; text-transform: uppercase; color: #94a3b8; font-weight: 700; margin-bottom: 0.5rem; letter-spacing: 0.5px;">Payment Reference</div>
                        <div style="font-weight: 600; color: #6366f1; font-size: 1rem; font-family: monospace; word-break: break-all;">${escapeHtml(payment.reference || 'N/A')}</div>
                    </div>

                    <div>
                        <div style="font-size: 0.75rem; text-transform: uppercase; color: #94a3b8; font-weight: 700; margin-bottom: 0.5rem; letter-spacing: 0.5px;">Date & Time</div>
                        <div style="font-weight: 600; color: #334155; font-size: 1rem;">${new Date(payment.created_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</div>
                    </div>

                    <div>
                        <div style="font-size: 0.75rem; text-transform: uppercase; color: #94a3b8; font-weight: 700; margin-bottom: 0.5rem; letter-spacing: 0.5px;">Ticket Count</div>
                        <div style="font-weight: 700; color: #1e293b; font-size: 1.05rem;">${payment.ticket_count || 0} Tickets</div>
                    </div>

                    <div style="grid-column: 1 / -1; background: #f1f5f9; padding: 1.25rem; border-radius: 12px; border-left: 4px solid #6366f1;">
                        <div style="font-size: 0.7rem; text-transform: uppercase; color: #64748b; font-weight: 800; margin-bottom: 0.5rem; letter-spacing: 1px;">Organizer</div>
                        <div style="font-weight: 600; color: #475569; font-size: 0.9rem;">${escapeHtml(payment.client_name || '—')}</div>
                    </div>
                </div>
            </div>
        </div>

        <div class="modal-footer" style="padding: 1.5rem 2rem; background: #f8fafc; border-top: 1px solid #f1f5f9; display: flex; justify-content: flex-end; gap: 12px;">
            <button class="btn btn-secondary modal-close-btn" style="padding: 0.75rem 1.5rem; border-radius: 10px; font-weight: 600; cursor: pointer; background: #f1f5f9; border: 1px solid #e2e8f0; color: #64748b;">Close</button>
        </div>
    `;

    document.body.appendChild(modalOverlay);
    modalOverlay.appendChild(modalContent);

    if (window.lucide) {
        window.lucide.createIcons({
            portal: modalContent
        });
    }

    setTimeout(() => {
        modalContent.style.transform = 'translateY(0)';
    }, 10);

    const closeHandler = () => {
        modalContent.style.transform = 'translateY(20px)';
        modalContent.style.opacity = '0';
        setTimeout(() => {
            modalOverlay.remove();
        }, 300);
        document.removeEventListener('keydown', closeModalOnEsc);
    };

    modalContent.querySelector('.modal-close-trigger').onclick = closeHandler;
    modalContent.querySelector('.modal-close-btn').onclick = closeHandler;
    modalOverlay.onclick = (e) => {
        if (e.target === modalOverlay) closeHandler();
    };

    const closeModalOnEsc = (e) => {
        if (e.key === 'Escape') closeHandler();
    };
    document.addEventListener('keydown', closeModalOnEsc);
}

function closeDetailModal() {
    const modal = document.getElementById('paymentDetailModal');
    if (modal) modal.classList.remove('open');
    document.removeEventListener('keydown', closeModalOnEsc);
}

function closeModalOnEsc(e) {
    if (e.key === 'Escape') closeDetailModal();
}

// ─── Sort helper ───────────────────────────────────────────────────────────
function changeSort(desc, asc) {
    const current = _paymentsState.sort;
    const sel = document.getElementById('sortSelect');
    const newSort = current === desc ? asc : desc;
    _paymentsState.sort = newSort;
    _paymentsState.page = 1;
    if (sel) sel.value = newSort;
    loadPayments();
}

// ─── Export ────────────────────────────────────────────────────────────────
function toggleExportMenu(btn) {
    const menu = document.getElementById('exportMenu');
    if (menu) menu.classList.toggle('open');
    document.addEventListener('click', function closeMenu(e) {
        if (!e.target.closest('.export-dropdown')) {
            menu && menu.classList.remove('open');
            document.removeEventListener('click', closeMenu);
        }
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
        title: 'Exporting Data',
        text: `Your ${format.toUpperCase()} report is being generated and will download shortly.`,
        icon: 'success',
        timer: 2500,
        timerProgressBar: true,
        showConfirmButton: false,
        willOpen: () => {
            window.open(`/api/payments/export-payments.php?${params}`, '_blank');
        }
    });
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function ucfirst(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
}


// Expose for onclick attributes
window.openDetailModal = openDetailModal;
window.closeDetailModal = closeDetailModal;
window.changeSort = changeSort;
window.toggleExportMenu = toggleExportMenu;
window.exportPayments = exportPayments;
