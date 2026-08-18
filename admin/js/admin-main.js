window.openSupportCenter = function () {
    document.dispatchEvent(new CustomEvent('EventraOpenSupportCenter', { detail: { role: 'admin' } }));
    if (typeof window.showGlobalSupportPanel === 'function') return window.showGlobalSupportPanel();
    window.location.assign('/admin/pages/payments.html?tab=refunds');
};

document.addEventListener('DOMContentLoaded', () => {
    initExportModal();
    initSidebar();
    initDrawers();
    initLogout();
    initPreviews();
    initSettings();

    // Initialize admin authentication and profile
    if (window.adminAuth) {
        window.adminAuth.loadAdminProfile();
    }

    // Initialize notification system
    if (window.notificationManager) {
        window.notificationManager.startPolling();
    }

    // Initialize heartbeat
    if (typeof initHeartbeat === 'function') {
        initHeartbeat();
    }

    // Initialize inactivity monitor
    initInactivityMonitor();
});

function initInactivityMonitor() {
    const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 mins
    const WARNING_TIME = 28 * 60 * 1000; // 28 mins
    let inactivityTimer;
    let warningTimer;
    let isWarningShown = false;

    let lastHeartbeatTime = Date.now();
    const HEARTBEAT_INTERVAL = 5 * 60 * 1000; // 5 minutes

    function resetTimers() {
        if (isWarningShown) return;

        clearTimeout(inactivityTimer);
        clearTimeout(warningTimer);

        warningTimer = setTimeout(showWarning, WARNING_TIME);
        inactivityTimer = setTimeout(() => {
            if (window.logout) window.logout();
            else window.location.href = '../../admin/pages/adminLogin.html';
        }, SESSION_TIMEOUT);

        if (Date.now() - lastHeartbeatTime > HEARTBEAT_INTERVAL) {
            lastHeartbeatTime = Date.now();
            if (typeof apiFetch !== 'undefined') {
                apiFetch('/api/utils/heartbeat.php').catch(() => { });
            } else {
                fetch('/api/utils/heartbeat.php').catch(() => { });
            }
        }
    }

    function showWarning() {
        if (isWarningShown) return;
        isWarningShown = true;

        let timeLeft = 120; // 2 minutes

        Swal.fire({
            title: 'Session Expiring Soon',
            html: `You will be logged out in <strong style="color: #ef4444; font-size: 1.2rem;">${timeLeft}</strong> seconds due to inactivity.`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#10b981',
            cancelButtonColor: '#ef4444',
            confirmButtonText: 'Stay Logged In',
            cancelButtonText: 'Log Out Now',
            allowOutsideClick: false,
            allowEscapeKey: false,
            didOpen: () => {
                const timerElement = Swal.getHtmlContainer().querySelector('strong');
                const countdown = setInterval(() => {
                    timeLeft--;
                    if (timerElement) timerElement.textContent = timeLeft;
                    if (timeLeft <= 0) {
                        clearInterval(countdown);
                        Swal.close();
                        if (window.logout) window.logout();
                    }
                }, 1000);
                Swal.getPopup().dataset.intervalId = countdown;
            },
            willClose: () => {
                const countdown = Swal.getPopup().dataset.intervalId;
                if (countdown) clearInterval(countdown);
            }
        }).then((result) => {
            isWarningShown = false;
            if (result.isConfirmed) {
                // Heartbeat API will refresh PHP session timestamp
                if (typeof apiFetch !== 'undefined') {
                    apiFetch('/api/utils/heartbeat.php').then(() => resetTimers());
                } else {
                    fetch('/api/utils/heartbeat.php').then(() => resetTimers());
                }
            } else if (result.dismiss === Swal.DismissReason.cancel) {
                if (window.logout) window.logout();
            }
        });
    }

    ['mousedown', 'keydown', 'scroll', 'touchstart'].forEach(evt => {
        window.addEventListener(evt, resetTimers, { passive: true });
    });

    resetTimers();
}


function initDrawers() {
    // Create overlay backdrop for drawers
    let backdrop = document.querySelector('.drawer-backdrop');
    if (!backdrop) {
        backdrop = document.createElement('div');
        backdrop.className = 'drawer-backdrop';
        document.body.appendChild(backdrop);
    }

    const profileBtn = document.getElementById('openProfileDrawer');
    const notificationBellIcon = document.getElementById('notificationBellIcon') || document.querySelector('.notification-bell-icon');
    const profileDrawer = document.getElementById('profileDrawer');
    const notificationsDrawer = document.getElementById('notificationsDrawer');
    const backArrows = document.querySelectorAll('.back-arrow');

    function openDrawer(drawerElement) {
        if (!drawerElement) return;
        backdrop.style.display = 'block';
        setTimeout(() => {
            drawerElement.classList.add('open');
            backdrop.classList.add('active');
        }, 10);
    }

    function closeAll() {
        if (profileDrawer) profileDrawer.classList.remove('open');
        if (notificationsDrawer) notificationsDrawer.classList.remove('open');
        backdrop.classList.remove('active');
        setTimeout(() => backdrop.style.display = 'none', 400);
    }

    // Attach listeners to notification bell
    if (notificationBellIcon) {
        notificationBellIcon.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            openDrawer(notificationsDrawer);
            // Mark all notifications as read when drawer is opened
            if (window.notificationManager) {
                setTimeout(() => {
                    window.notificationManager.markAsRead();
                }, 500);
            }
        };
    }

    if (profileBtn) {
        profileBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            openDrawer(profileDrawer);
        };
    }

    // Attach listener for the logout button inside the profile drawer
    document.addEventListener('click', (e) => {
        if (e.target.closest('#profileDrawerLogout')) {
            e.preventDefault();
            logout(); // Call the existing global logout function
        }
    });

    // Attach listeners to back arrows (slide-out on arrow click)
    backArrows.forEach(arrow => {
        arrow.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            closeAll();
        };
    });

    // Close drawers on backdrop/overlay click (click-away listener)
    backdrop.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        closeAll();
    };
}

/**
 * Global logout function for Admin
 */
async function logout() {
    const result = await Swal.fire({
        title: 'Logout Request',
        text: 'Are you sure you want to logout from Eventra Admin?',
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#e74c3c',
        cancelButtonColor: '#95a5a6',
        confirmButtonText: 'Yes, Logout',
        cancelButtonText: 'Stay'
    });

    if (result.isConfirmed) {
        try {
            const response = await apiFetch('/api/auth/logout.php', {
                method: 'POST'
            });

            const resultData = await response.json();

            if (resultData.success) {
                // Clear local storage (namespaced)
                storage.remove('admin_user');
                storage.remove('admin_auth_token');

                // Redirect to login
                window.location.href = '../../admin/pages/adminLogin.html';
            } else {
                Swal.fire('Logout Failed', resultData.message, 'error');
            }
        } catch (error) {
            // Clear local storage anyway
            storage.remove('admin_user');
            storage.remove('admin_auth_token');
            window.location.href = '../../admin/pages/adminLogin.html';
        }
    }
}

// Make logout globally accessible
window.logout = logout;

function initLogout() {
    // Attach to any element with class 'logout-link'
    document.querySelectorAll('.logout-link, [onclick*="logout"]').forEach(link => {
        // Remove inline onclick if it exists to prevent double firing, 
        // or just ensure the inline one calls the global function we just defined.
        // If they use onclick="logout()", it calls window.logout, which matches our function.
        // So we mainly need to handle elements that rely on listeners.

        // Ensure pointer cursor
        link.style.cursor = 'pointer';
    });

    // Specific listeners if needed (e.g. ID-based)
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.onclick = (e) => {
            e.preventDefault();
            logout();
        };
    }
}

function initExportModal() {
    const modalBackdrop = document.getElementById('exportModal');

    // Use event delegation for naturally occurring and dynamic export buttons
    document.addEventListener('click', (e) => {
        const exportBtn = e.target.closest('.btn-export, #headerExportBtn');
        if (exportBtn && modalBackdrop) {
            // Check if there's a table on the current page
            const hasTable = document.querySelector('table tbody tr');
            const hasCheckedRows = document.querySelector('table tbody tr input[type="checkbox"]:checked');

            if (!hasTable || hasTable.innerText.includes('Loading') || hasTable.innerText.includes('No data')) {
                Swal.fire({
                    icon: 'warning',
                    title: 'No Data to Export',
                    text: 'Please wait for data to load or ensure there is data in the table.',
                    confirmButtonColor: '#1976D2'
                });
                return;
            }

            if (!hasCheckedRows) {
                Swal.fire({
                    icon: 'info',
                    title: 'No Selection',
                    text: 'Please select at least one row to export.',
                    confirmButtonColor: '#1976D2'
                });
                return;
            }

            modalBackdrop.style.display = 'flex';
        }
    });

    if (modalBackdrop) {
        modalBackdrop.addEventListener('click', (e) => {
            if (e.target === modalBackdrop) {
                modalBackdrop.style.display = 'none';
            }
        });

        // Handle option clicks
        const options = document.querySelectorAll('.export-option');
        options.forEach(opt => {
            opt.addEventListener('click', () => {
                const format = opt.dataset.format;
                if (format === 'CSV') {
                    exportCurrentTableToCSV();
                } else if (format === 'PDF') {
                    exportCurrentTableToPDF();
                } else if (format === 'Excel') {
                    exportCurrentTableToExcel();
                }
                modalBackdrop.style.display = 'none';
            });
        });
    }
}

function exportCurrentTableToPDF() {
    const table = document.querySelector('table');
    if (!table) return;

    if (window.showToast) window.showToast('Generating PDF...', 'info');

    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        // Get page title
        const pageTitle = document.querySelector('.page-title h1')?.innerText || 'Eventra Export';

        // Add title
        doc.setFontSize(18);
        doc.setFont(undefined, 'bold');
        doc.text(pageTitle, 14, 15);

        // Add export date
        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');
        doc.text(`Exported on: ${new Date().toLocaleDateString()}`, 14, 22);

        // Extract table data
        const headers = [];
        const rows = [];
        const hasCheckboxes = table.querySelector('thead th input[type="checkbox"]');

        // Get headers (skip first column if it's a checkbox)
        const headerCells = table.querySelectorAll('thead th');
        headerCells.forEach((cell, index) => {
            if (index === 0 && hasCheckboxes) return;
            headers.push(cell.innerText.replace(/↕/g, '').trim());
        });

        // Get rows
        const bodyRows = table.querySelectorAll('tbody tr');
        const checkedRows = table.querySelectorAll('tbody tr input[type="checkbox"]:checked');
        const rowsToExport = checkedRows.length > 0
            ? Array.from(checkedRows).map(cb => cb.closest('tr'))
            : Array.from(bodyRows);

        rowsToExport.forEach(row => {
            const rowData = [];
            const cells = row.querySelectorAll('td');
            cells.forEach((cell, index) => {
                if (index === 0 && hasCheckboxes) return;
                // Clean up text content
                let text = cell.innerText.trim().replace(/\n/g, ' ');
                rowData.push(text);
            });
            if (rowData.length > 0 && !rowData[0].includes('Loading') && !rowData[0].includes('No data')) {
                rows.push(rowData);
            }
        });

        // Generate table
        doc.autoTable({
            head: [headers],
            body: rows,
            startY: 28,
            theme: 'grid',
            headStyles: {
                fillColor: [59, 130, 246],
                textColor: 255,
                fontStyle: 'bold',
                fontSize: 10
            },
            bodyStyles: {
                fontSize: 9
            },
            alternateRowStyles: {
                fillColor: [248, 250, 252]
            },
            margin: { top: 28 }
        });

        // Save the PDF
        const filename = `eventra-export-${new Date().toISOString().split('T')[0]}.pdf`;
        doc.save(filename);

        Swal.fire('Success', 'Data exported successfully as PDF', 'success');
    } catch (error) {
        Swal.fire('Error', 'Failed to export as PDF. Please try again.', 'error');
    }
}

function exportCurrentTableToExcel() {
    const table = document.querySelector('table');
    if (!table) return;

    if (window.showToast) window.showToast('Generating Excel...', 'info');

    try {
        // Extract table data
        const workbook = XLSX.utils.book_new();
        const worksheet_data = [];
        const hasCheckboxes = table.querySelector('thead th input[type="checkbox"]');

        // Get headers
        const headers = [];
        const headerCells = table.querySelectorAll('thead th');
        headerCells.forEach((cell, index) => {
            if (index === 0 && hasCheckboxes) return;
            headers.push(cell.innerText.replace(/↕/g, '').trim());
        });
        worksheet_data.push(headers);

        // Get rows
        const bodyRows = table.querySelectorAll('tbody tr');
        const checkedRows = table.querySelectorAll('tbody tr input[type="checkbox"]:checked');
        const rowsToExport = checkedRows.length > 0
            ? Array.from(checkedRows).map(cb => cb.closest('tr'))
            : Array.from(bodyRows);

        rowsToExport.forEach(row => {
            const rowData = [];
            const cells = row.querySelectorAll('td');
            cells.forEach((cell, index) => {
                if (index === 0 && hasCheckboxes) return;
                let text = cell.innerText.trim().replace(/\n/g, ' ');
                rowData.push(text);
            });
            if (rowData.length > 0 && !rowData[0].includes('Loading') && !rowData[0].includes('No data')) {
                worksheet_data.push(rowData);
            }
        });

        // Create worksheet
        const worksheet = XLSX.utils.aoa_to_sheet(worksheet_data);

        // Set column widths
        const colWidths = headers.map(() => ({ wch: 20 }));
        worksheet['!cols'] = colWidths;

        // Add worksheet to workbook
        const sheetName = document.querySelector('.page-title h1')?.innerText || 'Export';
        XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

        // Generate Excel file
        const filename = `eventra-export-${new Date().toISOString().split('T')[0]}.xlsx`;
        XLSX.writeFile(workbook, filename);

        Swal.fire('Success', 'Data exported successfully as Excel', 'success');
    } catch (error) {
        Swal.fire('Error', 'Failed to export as Excel. Please try again.', 'error');
    }
}

function exportCurrentTableToCSV() {
    const table = document.querySelector('table');
    if (!table) return;

    if (window.showToast) window.showToast('Generating CSV...', 'info');

    const hasCheckboxes = table.querySelector('thead th input[type="checkbox"]');
    const headerRow = table.querySelector('thead tr');
    const bodyRows = table.querySelectorAll('tbody tr');
    const checkedRows = table.querySelectorAll('tbody tr input[type="checkbox"]:checked');
    const rowsToExport = checkedRows.length > 0
        ? Array.from(checkedRows).map(cb => cb.closest('tr'))
        : Array.from(bodyRows);

    const exportRows = [headerRow, ...rowsToExport];

    const csvContent = exportRows.map(row => {
        const cells = Array.from(row.querySelectorAll('th, td'));
        return cells.filter((_, index) => !(index === 0 && hasCheckboxes))
            .map(cell => {
                // Clean up the text: remove extra whitespace, handle quotes
                let text = cell.innerText.trim().replace(/\n/g, ' ').replace(/↕/g, '');
                if (text.includes(',') || text.includes('"')) {
                    text = `"${text.replace(/"/g, '""')}"`;
                }
                if (text === 'Loading...' || text === 'No data found') return null;
                return text;
            }).filter(t => t !== null).join(',');
    }).filter(row => row.length > 0).join('\n');

    const filename = `eventra-export-${new Date().toISOString().split('T')[0]}.csv`;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');

    if (navigator.msSaveBlob) { // IE 10+
        navigator.msSaveBlob(blob, filename);
    } else {
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    Swal.fire('Success', 'Data exported successfully as CSV', 'success');
}

function initSidebar() {
    const header = document.querySelector('.header');
    const sidebar = document.querySelector('.sidebar');
    const mainLayout = document.querySelector('.main-layout');

    if (!header || !sidebar || !mainLayout) return;

    // 1. Create or reuse Toggle Button (inside the sidebar)
    let toggleBtn = document.getElementById('sidebarToggle');
    if (!toggleBtn) {
        toggleBtn = document.createElement('button');
        toggleBtn.id = 'sidebarToggle';
        toggleBtn.className = 'sidebar-toggle-btn';
        toggleBtn.innerHTML = '<i data-lucide="chevron-left"></i>';
        toggleBtn.style.cssText = `
            position: absolute;
            bottom: 16px;
            right: 12px;
            width: 40px;
            height: 40px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            border-radius: 8px;
            background: rgba(255,255,255,0.04);
            border: none;
            color: var(--admin-text-white);
            cursor: pointer;
            transition: transform 0.2s ease, background 0.2s ease;
            z-index: 1100;
        `;
        sidebar.appendChild(toggleBtn);
    } else {
        // Ensure it's placed inside the sidebar for layout correctness
        if (toggleBtn.parentElement !== sidebar) sidebar.appendChild(toggleBtn);
    }

    // 2. Handle Initial State from LocalStorage (persisted key: eventra_sidebar_collapsed)
    const isCollapsed = localStorage.getItem('eventra_sidebar_collapsed') === 'true';
    if (isCollapsed && window.innerWidth > 768) {
        sidebar.classList.add('sidebar-collapsed');
        mainLayout.classList.add('collapsed');
        // adjust icon to point right when collapsed
        toggleBtn.innerHTML = '<i data-lucide="chevron-right"></i>';

        // Set correct initial logo state (Parity with client)
        const logoEl = sidebar.querySelector('.sidebar-logo');
        if (logoEl) {
            logoEl.style.fontSize = '0';
            logoEl.style.padding = '0';
            logoEl.style.height = '0';
            logoEl.style.overflow = 'hidden';
        }
    }

    // 3. Toggle Event
    toggleBtn.addEventListener('click', () => {
        const nowCollapsed = sidebar.classList.toggle('sidebar-collapsed');
        mainLayout.classList.toggle('collapsed');
        localStorage.setItem('eventra_sidebar_collapsed', nowCollapsed);

        // Swap icon direction
        toggleBtn.innerHTML = nowCollapsed ? '<i data-lucide="chevron-right"></i>' : '<i data-lucide="chevron-left"></i>';
        if (window.lucide) window.lucide.createIcons();

        // Toggle logo text visibility (Parity with client)
        const logoEl = sidebar.querySelector('.sidebar-logo');
        if (logoEl) {
            logoEl.style.fontSize = nowCollapsed ? '0' : '';
            logoEl.style.padding = nowCollapsed ? '0' : '';
            logoEl.style.height = nowCollapsed ? '0' : '';
            logoEl.style.overflow = nowCollapsed ? 'hidden' : '';
        }
    });

    // 5. Active State Highlighting
    const currentPath = window.location.pathname;
    const menuItems = document.querySelectorAll('.sidebar-menu .menu-item a');

    menuItems.forEach(item => {
        item.addEventListener('click', (e) => {
            try { sessionStorage.setItem('skip_auth_redirect', '1'); } catch (err) { }
            try { localStorage.setItem('skip_auth_redirect', Date.now().toString()); } catch (err) { }
        });

        const href = item.getAttribute('href');
        if (href && currentPath.includes(href)) {
            item.parentElement.classList.add('active');
        }
    });

    // Re-init icons
    if (window.lucide) window.lucide.createIcons();
}

// Admin client modal helpers
window.adminRenderCopyField = function (label, value, fallback) {
    const display = value || fallback || '—';
    const canCopy = !!(value && value !== '—' && value !== 'Not verified');
    return `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 0;border-bottom:1px solid #f1f5f9;">
        <div style="min-width:0;flex:1;">
            <div style="font-size:0.58rem;color:#94a3b8;text-transform:uppercase;font-weight:700;margin-bottom:2px;">${escapeHTML(label)}</div>
            <div style="font-size:0.78rem;font-weight:600;color:#334155;font-family:monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHTML(display)}">${escapeHTML(display)}</div>
        </div>
        ${canCopy ? `<button type="button" onclick="copyToClipboard('${String(value).replace(/'/g, "\\'")}', '${escapeHTML(label)} copied')" title="Copy" style="background:#f1f5f9;border:none;border-radius:6px;padding:5px 7px;cursor:pointer;color:#64748b;display:flex;align-items:center;flex-shrink:0;"><i data-lucide="copy" style="width:13px;height:13px;"></i></button>` : ''}
    </div>`;
};

window.adminRenderKycRow = function (label, filePath) {
    if (!filePath) {
        return `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;color:#94a3b8;font-size:0.76rem;"><i data-lucide="file-x" style="width:14px;height:14px;flex-shrink:0;"></i><span style="flex:1;">${escapeHTML(label)}</span><span>Not uploaded</span></div>`;
    }
    const isDataUrl = String(filePath).startsWith('data:');
    const isPdf = isDataUrl ? filePath.startsWith('data:application/pdf') : /\.pdf$/i.test(filePath);
    const isImg = isDataUrl ? filePath.startsWith('data:image/') : /\.(png|jpe?g|gif|webp)$/i.test(filePath);
    const fname = isDataUrl ? `${label.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}_file.${isPdf ? 'pdf' : 'png'}` : filePath.split('/').pop();
    const url = isDataUrl ? filePath : (String(filePath).startsWith('http') ? filePath : '/' + String(filePath).replace(/^\//, ''));
    const preview = isImg
        ? `<img src="${url}" alt="" style="width:40px;height:40px;object-fit:cover;border-radius:6px;border:1px solid #e2e8f0;flex-shrink:0;">`
        : `<div style="width:40px;height:40px;border-radius:6px;background:#fef2f2;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><i data-lucide="${isPdf ? 'file-text' : 'file'}" style="width:18px;height:18px;color:#ef4444;"></i></div>`;
    return `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #f1f5f9;">
        ${preview}
        <div style="min-width:0;flex:1;">
            <div style="font-size:0.72rem;font-weight:700;color:#334155;">${escapeHTML(label)}</div>
            <div style="font-size:0.65rem;color:#64748b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHTML(fname)}">${escapeHTML(fname)}</div>
        </div>
        <a href="${url}" download="${escapeHTML(fname)}" title="Download ${escapeHTML(label)}" aria-label="Download ${escapeHTML(label)}" style="display:inline-flex;align-items:center;gap:4px;font-size:0.7rem;font-weight:700;color:#3b82f6;text-decoration:none;white-space:nowrap;flex-shrink:0;"><i data-lucide="download" style="width:15px;height:15px;"></i></a>
    </div>`;
};

window.adminSavePaystackAccountStatus = async function (clientId, status) {
    try {
        const res = await apiFetch('/api/admin/update-client-paystack.php', {
            method: 'POST',
            body: JSON.stringify({ client_id: clientId, paystack_account_status: status })
        });
        const data = await res.json();
        if (data.success && window.showToast) window.showToast('Paystack account status updated', 'success');
        else if (!data.success && window.showToast) window.showToast(data.message || 'Update failed', 'error');
    } catch (e) {
        if (window.showToast) window.showToast('Connection error', 'error');
    }
};

// Global toggle for Paystack secret key visibility in the client profile modal
window.togglePaystackKeyVisibility = function (btn) {
    const inputId = btn.dataset.toggleInput;
    const input = document.getElementById(inputId);
    if (!input) return;
    const isHidden = input.type === 'password';
    input.type = isHidden ? 'text' : 'password';
    const icon = btn.querySelector('i[data-lucide]');
    if (icon) {
        icon.setAttribute('data-lucide', isHidden ? 'eye-off' : 'eye');
        if (window.lucide) window.lucide.createIcons();
    }
};

window.initPreviews = function () {
    // Create Modal Backdrop (if not exists)
    let backdrop = document.querySelector('.preview-modal-backdrop');
    if (!backdrop) {
        backdrop = document.createElement('div');
        backdrop.className = 'preview-modal-backdrop';
        backdrop.innerHTML = `
            <div class="preview-modal" style="max-height: 90vh; overflow-y: auto; overflow-x: hidden; background: white; border-radius: 20px; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25); position: relative; border: 1px solid var(--admin-border); display: flex; flex-direction: column;">
                <span class="preview-close" style="position: absolute; top: 1rem; right: 1rem; width: 32px; height: 32px; background: rgba(0,0,0,0.1); border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; z-index: 10; font-size: 1.2rem;">&times;</span>
                <div id="previewContent" style="flex: 1; overflow-y: auto;"></div>
            </div>
        `;
        document.body.appendChild(backdrop);

        const closeBtn = backdrop.querySelector('.preview-close');
        closeBtn.onclick = () => {
            backdrop.classList.remove('active');
            setTimeout(() => {
                backdrop.style.display = 'none';
                backdrop.classList.remove('flex-mode');
            }, 300);
        };
        backdrop.onclick = (e) => {
            if (e.target === backdrop) {
                backdrop.classList.remove('active');
                setTimeout(() => {
                    backdrop.style.display = 'none';
                    backdrop.classList.remove('flex-mode');
                }, 300);
            }
        };
    }

    const content = backdrop.querySelector('#previewContent');

    // Attach to table rows
    const rows = document.querySelectorAll('tbody tr');
    rows.forEach(row => {
        // Remove existing click listener if any (by cloning and replacing, or better just check)
        if (row.dataset.previewAttached) return;
        row.dataset.previewAttached = 'true';

        row.onclick = () => {
            const path = window.location.pathname;
            let html = '';

            if (path.includes('users.html')) {
                const cells = row.querySelectorAll('td');
                if (cells.length < 6) return;
                const name = cells[1].innerText;
                const location = cells[2].innerText;
                const email = cells[3].innerText;
                const status = cells[4].innerText;
                const contact = cells[5].innerText;

                // Fetch details for user to get full metadata
                html = `
                    <div class="profile-preview">
                        <div class="profile-preview-header">User Profile</div>
                        <div class="profile-preview-info" style="padding: 2rem; text-align: center;">
                            <p>Loading user details...</p>
                        </div>
                    </div>
                `;
                content.innerHTML = html;
                backdrop.style.display = 'flex';
                setTimeout(() => backdrop.classList.add('active'), 10);

                apiFetch(`/api/admin/get-users.php`) // We search in the cached allUsers or just refetch? Let's use the data we already have in the row if possible or fetch.
                    .then(res => res.json())
                    .then(data => {
                        const user = data.users.find(u => u.id == row.dataset.id);
                        if (user) {
                            const profilePic = getProfileImg(user.profile_pic, user.name);
                            const cleanName = (user.name || '').replace(/\s*#\d+$/, '');
                            content.innerHTML = `
                                <div class="profile-preview">
                                    <div class="profile-preview-header">User Profile</div>
                                    <div style="position: relative; margin-bottom: 60px;">
                                        <div class="profile-preview-cover-box" style="margin-bottom: 0;">
                                            <img src="${profilePic}" alt="Cover" style="filter: blur(5px); opacity: 0.5;">
                                        </div>
                                        <div class="profile-preview-avatar-wrapper">
                                            <div class="avatar-wrapper">
                                                <img src="${profilePic}" class="profile-preview-avatar" alt="Avatar" style="width: 100px; height: 100px; border-radius: 50%; border: 4px solid white;">
                                                ${getVerificationBadge(user.email_verified_at ? 'verified' : '')}
                                            </div>
                                        </div>
                                    </div>
                                    <div class="profile-preview-info">
                                        <h2 style="font-weight: 800;">${escapeHTML(cleanName)}</h2>
                                        <p style="color: #6366f1; font-weight: 600; font-family: monospace; letter-spacing: 1px;">${escapeHTML(user.custom_id || user.id)}</p>
                                        <p>${escapeHTML(user.email)}</p>
                                    </div>
                                    <div class="profile-preview-details">
                                        <div class="profile-preview-detail-item"><span class="profile-detail-label">Phone</span><span class="profile-detail-val">${escapeHTML(user.phone) || 'N/A'}</span></div>
                                        <div class="profile-preview-detail-item"><span class="profile-detail-label">Gender</span><span class="profile-detail-val" style="text-transform: capitalize;">${escapeHTML(user.gender) || 'N/A'}</span></div>
                                        <div class="profile-preview-detail-item"><span class="profile-detail-label">DOB</span><span class="profile-detail-val">${escapeHTML(user.dob) || 'N/A'}</span></div>
                                        <div class="profile-preview-detail-item"><span class="profile-detail-label">Last Login</span><span class="profile-detail-val">${user.last_login_at ? new Date(user.last_login_at).toLocaleString() : 'Never'}</span></div>
                                        <div class="profile-preview-detail-item" style="grid-column: span 2;"><span class="profile-detail-label">Address</span><span class="profile-detail-val">${escapeHTML(user.address) || 'N/A'}, ${escapeHTML(user.city) || ''}, ${escapeHTML(user.state) || ''}, ${escapeHTML(user.country) || ''}</span></div>
                                        <div class="profile-preview-detail-item"><span class="profile-detail-label">Status</span><span class="profile-detail-val" style="text-transform: capitalize;">${escapeHTML(user.status)}</span></div>
                                    </div>
                                </div>
                            `;
                        }
                    });
                return;
            } else if (path.includes('clients.html')) {
                const clientId = row.dataset.id;
                const name = row.cells[1].innerText;
                const profilePic = getProfileImg(row.dataset.profilePic, name);

                // Show loading state
                html = `
                    <div class="profile-preview">
                        <div class="profile-preview-header">Client Profile</div>
                        <div class="profile-preview-info" style="padding: 2rem; text-align: center;">
                            <p>Loading client details...</p>
                        </div>
                    </div>
                `;
                content.innerHTML = html;
                backdrop.style.display = 'flex';
                setTimeout(() => backdrop.classList.add('active'), 10);

                // Fetch details
                apiFetch(`/api/admin/get-client-details.php?id=${clientId}`)
                    .then(res => res.json())
                    .then(data => {
                        if (data.success) {
                            const client = data.client;
                            const settlement = client.settlement_account || {};
                            // The detailed endpoint owns this data contract; map it
                            // once so old records with flat fields still render.
                            client.bank_name = settlement.bank_name || client.bank_name || '';
                            client.bank_code = settlement.bank_code || client.bank_code || '';
                            client.account_number = settlement.account_number || client.account_number || '';
                            client.account_name = settlement.account_name || client.account_name || '';
                            const events = data.events || [];
                            const buyers = data.buyers || [];
                            const totalTicketsSold = events.reduce((sum, ev) => sum + (parseInt(ev.tickets_sold) || 0), 0);
                            const isVerified = client.verification_status === 'verified';
                            content.innerHTML = `
                                <div class="profile-preview modernized-preview">
                                    <div class="profile-preview-header">
                                        <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
                                            <span>Client Profile</span>
                                            <span class="status-badge status-${client.verification_status === 'verified' ? 'active' : (client.verification_status === 'rejected' ? 'offline' : 'ongoing')}" style="font-size: 0.7rem; padding: 0.3rem 0.8rem;">
                                                ${escapeHTML(client.verification_status.toUpperCase())}
                                            </span>
                                        </div>
                                    </div>
                                    <!-- Cover + Avatar -->
                                    <div style="position: relative; margin-bottom: 44px;">
                                        <div class="profile-preview-cover-box" style="height: 150px; margin-bottom: 0;">
                                            <div style="position: absolute; inset: 0; background: linear-gradient(135deg, #3b82f6 0%, #6366f1 100%); opacity: 0.85; z-index: 1;"></div>
                                            <img src="${getProfileImg(client.profile_pic, client.business_name)}" alt="Cover" style="filter: blur(12px); opacity: 0.3; width: 100%; height: 100%; object-fit: cover; position: absolute; inset: 0;">
                                        </div>
                                        <div style="position: absolute; bottom: -44px; left: 28px; z-index: 3;">
                                            <div style="position: relative; display: inline-block;">
                                                <img src="${getProfileImg(client.profile_pic, client.business_name)}" alt="Avatar" style="width: 88px; height: 88px; border-radius: 50%; border: 4px solid white; box-shadow: 0 8px 24px rgba(0,0,0,0.15); object-fit: cover; background: #e2e8f0; display: block;">
                                                <div style="position: absolute; bottom: -4px; right: -4px; transform: scale(1.1);">${getVerificationBadge(client.verification_status)}</div>
                                            </div>
                                        </div>
                                    </div>

                                    <!-- Name + Meta row -->
                                    <div style="padding: 56px 28px 20px; display: flex; align-items: flex-end; justify-content: space-between; flex-wrap: wrap; gap: 12px; border-bottom: 1px solid #f1f5f9;">
                                        <div>
                                            <h2 style="font-size: 1.35rem; font-weight: 800; color: #1e293b; margin: 0 0 4px;">${escapeHTML(client.business_name || client.name)}</h2>
                                            <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                                                <span style="font-size: 0.8rem; color: #64748b; display: flex; align-items: center; gap: 4px;"><i data-lucide="mail" style="width:13px;height:13px;"></i>${escapeHTML(client.email)}</span>
                                                ${client.phone ? `<span style="font-size: 0.8rem; color: #64748b; display: flex; align-items: center; gap: 4px;"><i data-lucide="phone" style="width:13px;height:13px;"></i>${escapeHTML(client.phone)}</span>` : ''}
                                                ${client.custom_id ? `<span style="font-size: 0.72rem; font-family: monospace; background: #eff6ff; color: #3b82f6; padding: 2px 8px; border-radius: 20px; font-weight: 700;">${escapeHTML(client.custom_id)}</span>` : ''}
                                            </div>
                                        </div>
                                        <div style="font-size: 0.72rem; color: #94a3b8; display: flex; align-items: center; gap: 4px; white-space: nowrap;">
                                            <i data-lucide="calendar-days" style="width:13px;height:13px;"></i>
                                            Member since ${client.created_at ? new Date(client.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : 'N/A'}
                                        </div>
                                    </div>

                                    <!-- Two-column body -->
                                    <div style="display: grid; grid-template-columns: 1fr 1fr; min-height: 280px;">

                                        <!-- LEFT: Personal & Professional Info -->
                                        <div style="padding: 20px 22px; border-right: 1px solid #f1f5f9; display: flex; flex-direction: column; gap: 18px;">

                                            <div>
                                                <div style="font-size: 0.63rem; font-weight: 800; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 10px; display: flex; align-items: center; gap: 5px;">
                                                    <i data-lucide="user" style="width:11px;height:11px;"></i> Personal
                                                </div>
                                                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                                                    <div style="background: #f8fafc; padding: 9px 11px; border-radius: 9px; border: 1px solid #f1f5f9;">
                                                        <div style="font-size: 0.58rem; color: #94a3b8; text-transform: uppercase; font-weight: 700; letter-spacing: 0.05em; margin-bottom: 3px;">Full Name</div>
                                                        <div style="font-size: 0.8rem; font-weight: 600; color: #334155;">${escapeHTML(client.name || client.business_name)}</div>
                                                    </div>
                                                    <div style="background: #f8fafc; padding: 9px 11px; border-radius: 9px; border: 1px solid #f1f5f9;">
                                                        <div style="font-size: 0.58rem; color: #94a3b8; text-transform: uppercase; font-weight: 700; letter-spacing: 0.05em; margin-bottom: 3px;">Date of Birth</div>
                                                        <div style="font-size: 0.8rem; font-weight: 600; color: #334155;">${client.dob ? new Date(client.dob).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A'}</div>
                                                    </div>
                                                    <div style="background: #f8fafc; padding: 9px 11px; border-radius: 9px; border: 1px solid #f1f5f9;">
                                                        <div style="font-size: 0.58rem; color: #94a3b8; text-transform: uppercase; font-weight: 700; letter-spacing: 0.05em; margin-bottom: 3px;">Gender</div>
                                                        <div style="font-size: 0.8rem; font-weight: 600; color: #334155; text-transform: capitalize;">${escapeHTML(client.gender) || 'N/A'}</div>
                                                    </div>
                                                </div>
                                            </div>

                                            <div>
                                                <div style="font-size: 0.63rem; font-weight: 800; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 10px; display: flex; align-items: center; gap: 5px;">
                                                    <i data-lucide="briefcase" style="width:11px;height:11px;"></i> Professional
                                                </div>
                                                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                                                    <div style="background: #f8fafc; padding: 9px 11px; border-radius: 9px; border: 1px solid #f1f5f9;">
                                                        <div style="font-size: 0.58rem; color: #94a3b8; text-transform: uppercase; font-weight: 700; letter-spacing: 0.05em; margin-bottom: 3px;">Company</div>
                                                        <div style="font-size: 0.8rem; font-weight: 600; color: #334155;">${escapeHTML(client.company) || 'N/A'}</div>
                                                    </div>
                                                    <div style="background: #f8fafc; padding: 9px 11px; border-radius: 9px; border: 1px solid #f1f5f9;">
                                                        <div style="font-size: 0.58rem; color: #94a3b8; text-transform: uppercase; font-weight: 700; letter-spacing: 0.05em; margin-bottom: 3px;">Job Title</div>
                                                        <div style="font-size: 0.8rem; font-weight: 600; color: #334155;">${escapeHTML(client.job_title) || 'N/A'}</div>
                                                    </div>
                                                    <div style="background: #f8fafc; padding: 9px 11px; border-radius: 9px; border: 1px solid #f1f5f9;">
                                                        <div style="font-size: 0.58rem; color: #94a3b8; text-transform: uppercase; font-weight: 700; letter-spacing: 0.05em; margin-bottom: 3px;">Business Name</div>
                                                        <div style="font-size: 0.8rem; font-weight: 600; color: #334155;">${client.business_name ? escapeHTML(client.business_name) : 'N/A'}</div>
                                                    </div>
                                                </div>
                                            </div>

                                            <div>
                                                <div style="font-size: 0.63rem; font-weight: 800; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 10px; display: flex; align-items: center; gap: 5px;">
                                                    <i data-lucide="map-pin" style="width:11px;height:11px;"></i> Location
                                                </div>
                                                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                                                    <div style="background: #f8fafc; padding: 9px 11px; border-radius: 9px; border: 1px solid #f1f5f9;">
                                                        <div style="font-size: 0.58rem; color: #94a3b8; text-transform: uppercase; font-weight: 700; letter-spacing: 0.05em; margin-bottom: 3px;">City</div>
                                                        <div style="font-size: 0.8rem; font-weight: 600; color: #334155;">${escapeHTML(client.city) || 'N/A'}</div>
                                                    </div>
                                                    <div style="background: #f8fafc; padding: 9px 11px; border-radius: 9px; border: 1px solid #f1f5f9;">
                                                        <div style="font-size: 0.58rem; color: #94a3b8; text-transform: uppercase; font-weight: 700; letter-spacing: 0.05em; margin-bottom: 3px;">State</div>
                                                        <div style="font-size: 0.8rem; font-weight: 600; color: #334155;">${escapeHTML(client.state) || 'N/A'}</div>
                                                    </div>
                                                    <div style="background: #f8fafc; padding: 9px 11px; border-radius: 9px; border: 1px solid #f1f5f9;">
                                                        <div style="font-size: 0.58rem; color: #94a3b8; text-transform: uppercase; font-weight: 700; letter-spacing: 0.05em; margin-bottom: 3px;">Country</div>
                                                        <div style="font-size: 0.8rem; font-weight: 600; color: #334155;">${escapeHTML(client.country) || 'N/A'}</div>
                                                    </div>
                                                    <div style="background: #f8fafc; padding: 9px 11px; border-radius: 9px; border: 1px solid #f1f5f9;">
                                                        <div style="font-size: 0.58rem; color: #94a3b8; text-transform: uppercase; font-weight: 700; letter-spacing: 0.05em; margin-bottom: 3px;">Address</div>
                                                        <div style="font-size: 0.8rem; font-weight: 600; color: #334155; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHTML(client.address) || ''}">${escapeHTML(client.address) || 'N/A'}</div>
                                                    </div>
                                                </div>
                                            </div>

                                        </div>

                                        <!-- RIGHT: Settlement + KYC + Approval + Events -->
                                        <div style="padding: 20px 22px; display: flex; flex-direction: column; gap: 14px;">

                                            <button type="button" onclick="window.open('https://dashboard.paystack.com/#/signup','_blank')" style="width:100%;background:linear-gradient(135deg,#0ba4db,#011b33);color:white;border:none;padding:0.65rem;border-radius:9px;font-weight:700;font-size:0.8rem;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;">
                                                <i data-lucide="external-link" style="width:14px;height:14px;"></i> Create Paystack Account
                                            </button>

                                            <!-- Paystack Key Override -->
                                            <div style="background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px;">
                                                <div style="font-size: 0.63rem; font-weight: 800; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 8px; display: flex; align-items: center; gap: 5px;">
                                                    <i data-lucide="key" style="width:11px;height:11px;"></i> Paystack Secret Key
                                                </div>
                                                <div style="display:flex; flex-direction:column; gap:8px;">
                                                    <div style="position:relative; width:100%;">
                                                        <input type="password" id="paystackKeyInput_${client.id}" placeholder="${client.paystack_auth_token ? '••••••••••••••••••••••••' : 'Enter Secret Key (sk_...)'}" style="width:100%; padding:0.65rem 2.5rem 0.65rem 0.65rem; border:1px solid #e2e8f0; border-radius:8px; font-size:0.8rem; font-family:monospace; box-sizing:border-box;">
                                                        <button type="button" data-toggle-input="paystackKeyInput_${client.id}" onclick="togglePaystackKeyVisibility(this)" style="position:absolute; right:0.65rem; top:50%; transform:translateY(-50%); background:none; border:none; cursor:pointer; color:#94a3b8; display:flex; align-items:center; padding:0;" title="Show/hide key">
                                                            <i data-lucide="eye" style="width:16px; height:16px;"></i>
                                                        </button>
                                                    </div>
                                                    <button onclick="adminSavePaystackKey(${client.id}, this)" style="background:#3b82f6;color:#fff;border:none;padding:0.6rem;border-radius:8px;font-weight:700;font-size:0.75rem;cursor:pointer;">Validate & Save</button>
                                                    <div id="paystackKeyStatus_${client.id}" style="font-size:0.7rem;margin-top:2px;"></div>
                                                </div>
                                            </div>

                                            <!-- Settlement Account (read-only) -->
                                            <div style="background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px;">
                                                <div style="font-size: 0.63rem; font-weight: 800; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 8px; display: flex; align-items: center; justify-content: space-between; gap: 5px;">
                                                    <span style="display:flex;align-items:center;gap:5px;"><i data-lucide="landmark" style="width:11px;height:11px;"></i> Settlement Account</span>
                                                    <button type="button" onclick="copyToClipboard('Bank: ${(client.bank_name || '').replace(/'/g, "\\'")} | Code: ${(client.bank_code || '').replace(/'/g, "\\'")} | Acc No: ${(client.account_number || '').replace(/'/g, "\\'")} | Name: ${(client.account_name || 'Not verified').replace(/'/g, "\\'")}', 'Bank details copied')" style="background:#eff6ff;border:none;border-radius:6px;padding:4px 8px;font-size:0.65rem;font-weight:700;color:#3b82f6;cursor:pointer;display:flex;align-items:center;gap:3px;"><i data-lucide="copy" style="width:11px;height:11px;"></i>Copy All</button>
                                                </div>
                                                ${adminRenderCopyField('Bank Name', client.bank_name)}
                                                ${adminRenderCopyField('Bank Code', client.bank_code)}
                                                ${adminRenderCopyField('Account Number', client.account_number)}
                                                ${adminRenderCopyField('Account Name', client.account_name, 'Not verified')}
                                            </div>

                                            <!-- KYC Documents -->
                                            <div style="background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px;">
                                                <div style="font-size: 0.63rem; font-weight: 800; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 8px; display: flex; align-items: center; justify-content: space-between; gap: 5px;">
                                                    <span style="display:flex;align-items:center;gap:5px;"><i data-lucide="folder-open" style="width:11px;height:11px;"></i> KYC Documents</span>
                                                    <button type="button" data-kyc-files='${JSON.stringify({
                                'BVN': client.kyc_documents?.bvn?.url || client.kyc_bvn_file || '',
                                'NIN': client.kyc_documents?.nin?.url || client.kyc_nin_file || '',
                                'CAC': client.kyc_documents?.cac?.url || client.kyc_cac_file || '',
                                'Voters_Card': client.kyc_documents?.voters_card?.url || client.kyc_voter_card_file || '',
                                'Drivers_License': client.kyc_documents?.drivers_license?.url || client.kyc_driver_license_file || ''
                            }).replace(/'/g, "&#39;")}' onclick="downloadAllKYC(this, '${escapeHTML(client.business_name || client.name || 'Client').replace(/'/g, "\\'")}')" style="background:#eff6ff;border:none;border-radius:6px;padding:4px 8px;font-size:0.65rem;font-weight:700;color:#3b82f6;cursor:pointer;display:flex;align-items:center;gap:3px;transition:opacity 0.2s;" onmouseover="this.style.opacity='0.8'" onmouseout="this.style.opacity='1'"><i data-lucide="download" style="width:11px;height:11px;"></i>Download All</button>
                                                </div>
                                                ${adminRenderKycRow('BVN', client.kyc_documents?.bvn?.url || client.kyc_bvn_file)}
                                                ${adminRenderKycRow('NIN', client.kyc_documents?.nin?.url || client.kyc_nin_file)}
                                                ${adminRenderKycRow('CAC', client.kyc_documents?.cac?.url || client.kyc_cac_file)}
                                                ${adminRenderKycRow("Voter's Card", client.kyc_documents?.voters_card?.url || client.kyc_voter_card_file)}
                                                ${adminRenderKycRow("Driver's License", client.kyc_documents?.drivers_license?.url || client.kyc_driver_license_file)}
                                            </div>



                                            <!-- Events Information -->
                                            <div style="background: #f8fafc; border: 1px solid #f1f5f9; border-radius: 12px; padding: 12px;">
                                                <div style="font-size: 0.63rem; font-weight: 800; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 8px; display: flex; align-items: center; gap: 5px;">
                                                    <i data-lucide="plug" style="width:11px;height:11px;"></i> Events Information
                                                </div>
                                                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                                                    <div>
                                                        <div style="font-size: 0.6rem; color: #94a3b8; margin-bottom: 2px; font-weight: 700; text-transform: uppercase;">Events Created</div>
                                                        <div style="font-size: 0.76rem; font-weight: 600; color: #334155;">${events.length || '0'}</div>
                                                    </div>  
                                                    <div>
                                                        <div style="font-size: 0.6rem; color: #94a3b8; margin-bottom: 2px; font-weight: 700; text-transform: uppercase;">Tickets Sold</div>
                                                        <div style="font-size: 0.76rem; font-weight: 600; color: #334155;">${totalTicketsSold}</div>
                                                    </div>
                                                    <div>
                                                        <div style="font-size: 0.6rem; color: #94a3b8; margin-bottom: 2px; font-weight: 700; text-transform: uppercase;">Total Buyers</div>
                                                        <div style="font-size: 0.76rem; font-weight: 600; color: #334155; font-family: monospace;">${buyers.length || '0'}</div>
                                                    </div>
                                                </div>
                                            </div>

                                            <!-- Approve / Reject -->
                                            <div style="display: flex; gap: 8px;">
                                                <button onclick="approveClient(${client.id}, 1, this)" style="flex:1;background:${client.verification_status === 'verified' ? '#dcfce7' : (client.verification_status === 'rejected' ? '#f1f5f9' : '#10b981')};color:${client.verification_status === 'verified' ? '#16a34a' : (client.verification_status === 'rejected' ? '#94a3b8' : '#fff')};border:${client.verification_status === 'verified' ? '1px solid #86efac' : (client.verification_status === 'rejected' ? '1px solid #e2e8f0' : 'none')};padding:0.7rem 0.5rem;border-radius:9px;font-weight:700;font-size:0.8rem;display:flex;align-items:center;justify-content:center;gap:5px;cursor:${(client.verification_status === 'verified' || client.verification_status === 'rejected') ? 'not-allowed' : 'pointer'};opacity:${client.verification_status === 'rejected' ? '0.5' : '1'};" ${(client.verification_status === 'verified' || client.verification_status === 'rejected') ? 'disabled' : ''}>
                                                    <i data-lucide="check-circle" style="width:14px;height:14px;"></i> Approve
                                                </button>
                                                <button onclick="approveClient(${client.id}, 0, this)" style="flex:1;background:${client.verification_status === 'rejected' ? '#fee2e2' : (client.verification_status === 'verified' ? '#f1f5f9' : '#ef4444')};color:${client.verification_status === 'rejected' ? '#dc2626' : (client.verification_status === 'verified' ? '#94a3b8' : '#fff')};border:${client.verification_status === 'rejected' ? '1px solid #fca5a5' : (client.verification_status === 'verified' ? '1px solid #e2e8f0' : 'none')};padding:0.7rem 0.5rem;border-radius:9px;font-weight:700;font-size:0.8rem;display:flex;align-items:center;justify-content:center;gap:5px;cursor:${(client.verification_status === 'rejected' || client.verification_status === 'verified') ? 'not-allowed' : 'pointer'};opacity:${client.verification_status === 'verified' ? '0.5' : '1'};" ${(client.verification_status === 'rejected' || client.verification_status === 'verified') ? 'disabled' : ''}>
                                                    <i data-lucide="x-circle" style="width:14px;height:14px;"></i> Reject
                                                </button>
                                            </div>

                                            <!-- Events (verified) -->
                                            ${isVerified && events.length > 0 ? `
                                            <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:12px;flex:1;overflow:hidden;">
                                                <div style="font-size:0.63rem;font-weight:800;color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;display:flex;align-items:center;gap:5px;">
                                                    <i data-lucide="calendar" style="width:11px;height:11px;"></i> Events (${events.length})
                                                </div>
                                                <div style="display:flex;flex-direction:column;gap:5px;max-height:160px;overflow-y:auto;padding-right:2px;">
                                                    ${events.map(ev => `
                                                        <div style="display:flex;justify-content:space-between;align-items:center;padding:7px 10px;background:#f8fafc;border-radius:8px;border:1px solid #f1f5f9;">
                                                            <div style="min-width:0;">
                                                                <div style="font-weight:700;font-size:0.76rem;color:#1e293b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHTML((ev.event_name || '').replace(/\s*#\d+$/, ''))}</div>
                                                                <div style="font-size:0.65rem;color:#64748b;">${escapeHTML(ev.event_date || '')}</div>
                                                            </div>
                                                            <div style="font-size:0.7rem;font-weight:800;color:var(--admin-primary);white-space:nowrap;background:#fff;padding:2px 8px;border-radius:18px;border:1px solid #e2e8f0;margin-left:6px;flex-shrink:0;">${parseInt(ev.tickets_sold) || 0} sold</div>
                                                        </div>
                                                    `).join('')}
                                                </div>
                                            </div>
                                            ` : ''}

                                        </div>
                                    </div>

                                    <!-- Footer -->
                                    <div style="padding: 12px 24px; border-top: 1px solid #f1f5f9; display: flex; justify-content: flex-end;">
                                        <button onclick="deleteClient(${client.client_auth_id}, '${client.email}')" style="background:#fef2f2;color:#ef4444;border:1px solid #fee2e2;padding:0.45rem 0.9rem;border-radius:8px;font-size:0.78rem;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:5px;transition:all 0.2s;" onmouseover="this.style.background='#fee2e2'" onmouseout="this.style.background='#fef2f2'">
                                            <i data-lucide="trash-2" style="width:13px;"></i> Delete Client Account
                                        </button>
                                    </div>
                                </div>
                            `;
                            lucide.createIcons();
                            const paystackInput = document.getElementById(`paystackKeyInput_${client.id}`);
                            if (paystackInput) {
                                paystackInput.value = '';
                                paystackInput.setAttribute('readonly', 'readonly');
                                const unlockPaystack = () => paystackInput.removeAttribute('readonly');
                                paystackInput.addEventListener('focus', unlockPaystack, { once: true });
                                paystackInput.addEventListener('click', unlockPaystack, { once: true });
                                [100, 500].forEach((delay) => setTimeout(() => {
                                    if (document.activeElement !== paystackInput) paystackInput.value = '';
                                }, delay));
                            }
                        } else {
                            content.innerHTML = `<div style="padding: 2rem; text-align: center; color: #ef4444;">Failed to load details: ${escapeHTML(data.message)}</div>`;
                        }
                    });
                return; // Prevent default row click behavior which shows old static modal
            } else if (path.includes('tickets.html')) {
                const cells = row.querySelectorAll('td');
                if (cells.length < 6) return;
                const serial = cells[0].innerText;
                const event = cells[1].innerText;
                const price = cells[2].innerText;
                const attendees = cells[3].innerText;
                const category = cells[4].innerText;

                const rawImage = row.dataset.image || 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=1200&fit=crop';

                // Proper image path resolution
                let eventImage = '';
                if (rawImage.startsWith('http') || rawImage.startsWith('data:')) {
                    eventImage = rawImage;
                } else if (rawImage) {
                    // Handle both /uploads/... and uploads/... formats
                    eventImage = '../../' + (rawImage.startsWith('/') ? rawImage.substring(1) : rawImage);
                } else {
                    eventImage = 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=1200&fit=crop';
                }

                html = `
                    <div class="ticket-preview">
                        <div class="ticket-card-preview" style="background: linear-gradient(135deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.7) 100%), url('${eventImage}') no-repeat center center; background-size: cover;">
                            <div class="ticket-main">
                                <div>
                                    <div class="ticket-top">EVENTRA</div>
                                    <div class="ticket-info">
                                        <div class="ticket-event-name">${escapeHTML(event)}</div>
                                        <div class="ticket-meta-info">
                                            <div class="ticket-meta-line">📍 Venue: Nigeria</div>
                                            <div class="ticket-meta-line">👥 Attendees: ${escapeHTML(attendees)}</div>
                                            <div class="ticket-meta-line">🔖 Serial: ${escapeHTML(serial)}</div>
                                        </div>
                                    </div>
                                </div>
                                <div class="ticket-bottom-info">
                                    <div class="ticket-type">${escapeHTML(category)}</div>
                                    <div class="ticket-price-box">
                                        <div class="ticket-price-label">Price</div>
                                        <div class="ticket-price-val">${escapeHTML(price)}</div>
                                    </div>
                                </div>
                            </div>
                            <div class="ticket-barcode-section">
                                <svg width="50" height="100" viewBox="0 0 50 100" xmlns="http://www.w3.org/2000/svg">
                                    <rect x="3" y="0" width="2" height="80" fill="white"/>
                                    <rect x="6" y="0" width="3" height="80" fill="white"/>
                                    <rect x="10" y="0" width="2" height="80" fill="white"/>
                                    <rect x="13" y="0" width="3" height="80" fill="white"/>
                                    <rect x="17" y="0" width="2" height="80" fill="white"/>
                                    <rect x="20" y="0" width="2" height="80" fill="white"/>
                                    <rect x="23" y="0" width="3" height="80" fill="white"/>
                                    <rect x="27" y="0" width="2" height="80" fill="white"/>
                                    <rect x="30" y="0" width="3" height="80" fill="white"/>
                                    <rect x="34" y="0" width="2" height="80" fill="white"/>
                                    <rect x="37" y="0" width="2" height="80" fill="white"/>
                                    <rect x="40" y="0" width="3" height="80" fill="white"/>
                                    <rect x="44" y="0" width="2" height="80" fill="white"/>
                                    <text x="25" y="95" text-anchor="middle" font-size="8" fill="white">${escapeHTML(serial).substring(0, 6)}</text>
                                </svg>
                            </div>
                        </div>
                    </div>
                `;
            } else if (path.includes('events.html')) {
                // Use the specialized previewEvent function if available
                if (typeof window.previewEvent === 'function') {
                    window.previewEvent(row.dataset.id);
                    return;
                }

                const cells = row.querySelectorAll('td');
                if (cells.length < 6) return;

                // Adjust indices for events table: [0:cb, 1:ID, 2:Name, 3:Priority, 4:Date, 5:Time, 6:Category, ...]
                const eventId = cells[1].innerText;
                const rawName = cells[2].querySelector('div:first-child')?.innerText || cells[2].innerText;
                const eventName = rawName.replace(/\s*#\d+$/, '');
                const priority = cells[3].innerText;
                const date = cells[4].innerText;
                const time = cells[5].innerText;
                const category = cells[6].innerText;
                const phone = cells[7].innerText;
                const price = cells[8].innerText;
                const attendees = cells[9].innerText;

                const rawImage = row.dataset.image || 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=1200&fit=crop';
                const eventImage = (rawImage.startsWith('http') || rawImage.startsWith('data:'))
                    ? rawImage
                    : (rawImage.startsWith('/') ? '../../' + rawImage.substring(1) : (rawImage.startsWith('public') ? '../../' + rawImage : (rawImage === '' ? 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=1200&fit=crop' : '../../' + rawImage)));

                html = `
                    <div class="event-preview">
                        <div class="event-preview-image-box" style="height: 250px; overflow: hidden; position: relative;">
                            <img src="${eventImage}" class="event-preview-image" alt="Event" style="width: 100%; height: 100%; object-fit: cover;">
                            <div class="priority-badge" style="position: absolute; top: 1rem; right: 1rem; padding: 0.4rem 0.8rem; border-radius: 20px; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; color: white; background: ${priority.toLowerCase() === 'hot' ? '#ff4757' : priority.toLowerCase() === 'trending' ? '#3742fa' : '#2ed573'};">
                                ${escapeHTML(priority) || 'Standard'}
                            </div>
                        </div>
                        <div class="event-preview-content">
                            <div class="event-preview-main-info" style="margin-bottom: 1rem;">
                                <h1 class="event-preview-title" style="font-size: 1.5rem; margin-bottom: 0.25rem;">${escapeHTML(eventName)}</h1>
                                <p style="color: #6b7280; font-size: 0.85rem;">Organized by: ${escapeHTML(row.dataset.clientName || 'Eventra')}</p>
                            </div>
                            
                            <div style="margin-bottom: 1.5rem;">
                                <label style="display: block; font-size: 0.75rem; color: #6b7280; margin-bottom: 0.5rem; text-transform: uppercase; font-weight: 600;">Attendees</label>
                                <div style="display: flex; align-items: center; gap: 10px;">
                                    <span style="font-size: 0.85rem; color: #4b5563; font-weight: 600;">${escapeHTML(attendees)} people attending</span>
                                </div>
                            </div>

                            <div class="event-preview-grid-details" style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-bottom: 1rem;">
                                <div class="event-grid-item" style="background: #f8fafc; padding: 0.6rem; border-radius: 6px; font-size: 0.85rem;">📂 ${escapeHTML(category)}</div>
                                <div class="event-grid-item" style="background: #f8fafc; padding: 0.6rem; border-radius: 6px; font-size: 0.85rem;">📅 ${escapeHTML(date)}</div>
                            </div>
                            
                            <div class="event-preview-footer" style="padding-top: 1rem; border-top: 1px solid #f1f5f9;">
                                <div class="event-price-final">
                                    <label style="font-size: 0.8rem; color: #64748b;">Ticket Price:</label>
                                    <span style="font-size: 1.25rem; font-weight: 700; color: var(--admin-primary);">${escapeHTML(price)}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }

            if (html) {
                content.innerHTML = html;
                backdrop.style.display = 'flex';
                setTimeout(() => backdrop.classList.add('active'), 10);
            }
        };
    });
}

window.adminSavePaystackKey = async function (clientId, btn) {
    const input = document.getElementById(`paystackKeyInput_${clientId}`);
    const statusEl = document.getElementById(`paystackKeyStatus_${clientId}`);
    const key = input ? input.value.trim() : '';

    if (!key) {
        if (statusEl) statusEl.innerHTML = '<span style="color:#ef4444;">Please enter a Paystack key.</span>';
        return;
    }

    btn.disabled = true;
    btn.textContent = 'Validating...';
    if (statusEl) statusEl.innerHTML = '<span style="color:#64748b;">Validating key with Paystack...</span>';

    try {
        const response = await apiFetch('/api/admin/update-client-paystack.php', {
            method: 'POST',
            body: JSON.stringify({ client_id: clientId, paystack_key: key })
        });
        const data = await response.json();

        if (data.success) {
            if (statusEl) statusEl.innerHTML = '<span style="color:#10b981;font-weight:700;">✓ Key validated and saved successfully!</span>';
            // Refresh the preview after short delay
            setTimeout(() => {
                const row = document.querySelector(`tr[data-id="${clientId}"]`);
                if (row) row.click();
            }, 1200);
        } else {
            if (statusEl) statusEl.innerHTML = `<span style="color:#ef4444;">✗ ${escapeHTML(data.message)}</span>`;
            btn.disabled = false;
            btn.textContent = 'Validate & Save';
        }
    } catch (e) {
        if (statusEl) statusEl.innerHTML = '<span style="color:#ef4444;">✗ Connection error. Try again.</span>';
        btn.disabled = false;
        btn.textContent = 'Validate & Save';
    }
};

window.adminUpdatePaystackKey = async function (clientId) {
    const { value: newKey, isConfirmed } = await Swal.fire({
        title: 'Update Paystack Key',
        input: 'password',
        inputPlaceholder: 'Enter new Paystack Secret Key (sk_...)',
        inputAttributes: { autocomplete: 'off', style: 'font-family:monospace;' },
        showCancelButton: true,
        confirmButtonColor: '#3b82f6',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'Validate & Update',
        cancelButtonText: 'Cancel',
        inputValidator: (v) => { if (!v || !v.trim()) return 'Please enter a key.'; }
    });

    if (!isConfirmed || !newKey) return;

    if (window.showToast) window.showToast('Validating key...', 'info');

    try {
        const response = await apiFetch('/api/admin/update-client-paystack.php', {
            method: 'POST',
            body: JSON.stringify({ client_id: clientId, paystack_key: newKey.trim() })
        });
        const data = await response.json();
        if (data.success) {
            Swal.fire('Updated!', 'Paystack key updated successfully.', 'success');
            const row = document.querySelector(`tr[data-id="${clientId}"]`);
            if (row) setTimeout(() => row.click(), 800);
        } else {
            Swal.fire('Error', data.message || 'Invalid key or update failed.', 'error');
        }
    } catch (e) {
        Swal.fire('Error', 'Connection error. Please try again.', 'error');
    }
};

window.copyToClipboard = function (text, successMsg) {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
        if (window.showToast) {
            window.showToast(successMsg, 'success');
        } else {
            Swal.fire({
                toast: true,
                position: 'top-end',
                icon: 'success',
                title: successMsg,
                showConfirmButton: false,
                timer: 2000
            });
        }
    }).catch(err => {
        Swal.fire('Error', 'Failed to copy to clipboard', 'error');
    });
};

window.approveClient = async function (clientId, status, btnElement) {
    const action = status ? 'approve' : 'reject';
    const actionLabel = status ? 'Approve' : 'Reject';

    // Step 1: Ask for optional admin notes
    const { value: adminNotes, isConfirmed } = await Swal.fire({
        title: `${actionLabel} Client`,
        html: `
            <p style="margin-bottom:1rem;color:#64748b;font-size:0.9rem;">
                ${status
                ? 'You are about to <strong>approve</strong> this client. They will receive full access to create events and collect payments.'
                : 'You are about to <strong>decline</strong> this client. They will be notified with your reason.'}
            </p>
            <textarea id="adminNotesInput" class="swal2-textarea" placeholder="Optional: Add a note for the client (reason, next steps, etc.)" style="min-height:100px;font-size:0.9rem;"></textarea>
        `,
        icon: status ? 'question' : 'warning',
        showCancelButton: true,
        confirmButtonColor: status ? '#10b981' : '#ef4444',
        cancelButtonColor: '#64748b',
        confirmButtonText: `Yes, ${action}!`,
        cancelButtonText: 'Cancel',
        preConfirm: () => {
            return document.getElementById('adminNotesInput')?.value?.trim() || '';
        }
    });

    if (!isConfirmed) return;

    if (window.showToast) window.showToast('Updating status...', 'info');

    try {
        const response = await apiFetch('/api/admin/approve-client.php', {
            method: 'POST',
            body: JSON.stringify({
                client_id: clientId,
                status: status ? 1 : 0,
                admin_notes: adminNotes
            })
        });

        const data = await response.json();
        if (data.success) {
            Swal.fire('Updated!', `Client has been ${status ? 'verified' : 'rejected'}.`, 'success');
            if (typeof refreshData === 'function') refreshData();
            // Close preview backdrop if open
            const previewBackdrop = document.querySelector('.preview-modal-backdrop');
            if (previewBackdrop) {
                previewBackdrop.classList.remove('active');
                setTimeout(() => previewBackdrop.style.display = 'none', 300);
            }
        } else {
            Swal.fire('Error', data.message, 'error');
        }
    } catch (error) {
        Swal.fire('Error', 'Something went wrong while updating.', 'error');
    }
};

window.deleteClient = async function (clientId, email) {
    const { value: confirmEmail } = await Swal.fire({
        title: 'Are you absolutely sure?',
        html: `
            <div style="text-align: left; background: #fff1f2; padding: 1rem; border-radius: 8px; border: 1px solid #fecaca; margin-bottom: 1rem;">
                <p style="color: #991b1b; font-size: 0.9rem; margin-bottom: 0.5rem;"><strong>Warning:</strong> This action is permanent and cannot be undone.</p>
                <ul style="color: #991b1b; font-size: 0.85rem; padding-left: 1.25rem;">
                    <li>Delete authentication account</li>
                    <li>Permanently delete business profile</li>
                    <li>Wipe all associated events and media</li>
                    <li>Invalidate all active tickets and orders</li>
                </ul>
            </div>
            <p style="font-size: 0.9rem; margin-bottom: 0.5rem;">Type <strong>${email}</strong> to confirm:</p>
        `,
        input: 'text',
        inputPlaceholder: 'Confirm email address',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'Permanently Delete Client',
        cancelButtonText: 'Cancel',
        inputValidator: (value) => {
            if (!value || value !== email) {
                return 'Email does not match!';
            }
        }
    });

    if (confirmEmail) {
        if (window.showToast) window.showToast('Deleting client...', 'info');
        try {
            // Need to get the auth_id of the client first, or pass client_id to a modified delete-profile
            // For now, let's assume we pass target_auth_id (which we'll need to fetch)
            // Strategy: Update delete-profile.php to accept client_id too

            const response = await apiFetch(`/api/clients/delete-profile.php?target_auth_id=${clientId}`, {
                method: 'DELETE'
            });

            const data = await response.json();
            if (data.success) {
                Swal.fire('Deleted!', 'Client account and all data have been erased.', 'success');
                if (typeof refreshData === 'function') refreshData();
                const previewBackdrop = document.querySelector('.preview-modal-backdrop');
                if (previewBackdrop) {
                    previewBackdrop.classList.remove('active');
                    setTimeout(() => previewBackdrop.style.display = 'none', 300);
                }
            } else {
                Swal.fire('Error', data.message, 'error');
            }
        } catch (error) {
            Swal.fire('Error', 'Deletion failed.', 'error');
        }
    }
};


window.toggleVerification = async function (clientId, type, status) {
    if (!clientId || !type) return;

    try {
        const response = await apiFetch('/api/admin/verify-client.php', {
            method: 'POST',
            body: JSON.stringify({ client_id: clientId, type: type, status: status })
        });

        const result = await response.json();
        if (result.success) {
            if (window.showToast) {
                window.showToast(result.message, 'success');
            } else {
                Swal.fire({
                    toast: true,
                    position: 'top-end',
                    icon: 'success',
                    title: result.message,
                    showConfirmButton: false,
                    timer: 2000
                });
            }

            // Re-open the modal to refresh the data
            const row = document.querySelector(`tr[data-id="${clientId}"]`);
            if (row) {
                // remove dataset attached to force unbind is hard, let's just trigger the click on the backdrop close and then row click
                const backdrop = document.querySelector('.preview-modal-backdrop');
                if (backdrop) backdrop.classList.remove('active');

                // Fetch data again manually or just let row click handle it
                setTimeout(() => row.click(), 300);
            }
        } else {
            Swal.fire('Error', result.message || 'Failed to update verification status', 'error');
        }
    } catch (e) {
        Swal.fire('Error', 'An unexpected error occurred.', 'error');
    }
};

/**
 * Open a KYC document — images open in a lightbox, PDFs open in a new tab.
 */
window.openKycDocument = function (url, isImage) {
    if (!url) return;
    if (!isImage) {
        window.open(url, '_blank');
        return;
    }
    // Remove any existing lightbox
    const existing = document.getElementById('kycLightbox');
    if (existing) existing.remove();

    const lb = document.createElement('div');
    lb.id = 'kycLightbox';
    lb.style.cssText = [
        'position:fixed',
        'inset:0',
        'background:rgba(0,0,0,0.93)',
        'z-index:999999',
        'display:flex',
        'align-items:center',
        'justify-content:center',
        'padding:1.5rem',
        'animation:kycFadeIn 0.2s ease'
    ].join(';');

    lb.innerHTML = `
        <style>
            @keyframes kycFadeIn { from { opacity:0; } to { opacity:1; } }
            @keyframes kycSlideUp { from { transform:scale(0.92) translateY(20px); opacity:0; } to { transform:scale(1) translateY(0); opacity:1; } }
            #kycLightboxImg { animation: kycSlideUp 0.25s ease; }
        </style>
        <div style="position:relative; max-width:92vw; max-height:92vh; display:flex; flex-direction:column; align-items:center; gap:1rem;">
            <img id="kycLightboxImg" src="${url}" style="max-width:90vw; max-height:80vh; object-fit:contain; border-radius:10px; box-shadow:0 30px 70px rgba(0,0,0,0.6); border:2px solid rgba(255,255,255,0.1);" alt="KYC Document">
            <div style="display:flex; gap:1rem; align-items:center;">
                <a href="${url}" target="_blank" style="color:white; font-size:0.82rem; font-weight:600; text-decoration:none; background:rgba(255,255,255,0.15); padding:6px 16px; border-radius:20px; backdrop-filter:blur(6px); border:1px solid rgba(255,255,255,0.2); display:flex; align-items:center; gap:6px; transition:background 0.2s;" onmouseenter="this.style.background='rgba(255,255,255,0.25)'" onmouseleave="this.style.background='rgba(255,255,255,0.15)'">↗ Open full size</a>
                <button onclick="document.getElementById('kycLightbox').remove()" style="color:white; font-size:0.82rem; font-weight:600; background:rgba(239,68,68,0.8); border:none; padding:6px 16px; border-radius:20px; cursor:pointer; backdrop-filter:blur(6px); transition:background 0.2s;" onmouseenter="this.style.background='rgba(239,68,68,1)'" onmouseleave="this.style.background='rgba(239,68,68,0.8)'">✕ Close</button>
            </div>
        </div>
    `;

    // Close on backdrop click
    lb.addEventListener('click', (e) => { if (e.target === lb) lb.remove(); });
    // Close on Escape
    const escHandler = (e) => { if (e.key === 'Escape') { lb.remove(); document.removeEventListener('keydown', escHandler); } };
    document.addEventListener('keydown', escHandler);

    document.body.appendChild(lb);
};

function initSettings() {
    const darkModeToggle = document.getElementById('darkModeToggle');
    const notifToggle = document.getElementById('notifToggle');

    // Load dark mode preference
    if (localStorage.getItem('dark-mode') === 'enabled') {
        document.body.classList.add('dark-mode');
        if (darkModeToggle) darkModeToggle.checked = true;
    }

    if (darkModeToggle) {
        darkModeToggle.addEventListener('change', () => {
            if (darkModeToggle.checked) {
                document.body.classList.add('dark-mode');
                localStorage.setItem('dark-mode', 'enabled');
            } else {
                document.body.classList.remove('dark-mode');
                localStorage.setItem('dark-mode', 'disabled');
            }
        });
    }

    if (notifToggle) {
        notifToggle.addEventListener('change', () => {
            const status = notifToggle.checked ? 'enabled' : 'disabled';
            if (window.showToast) window.showToast(`Notifications ${status}`, 'info');
        });
    }
}

window.downloadAllKYC = async function (btn, clientName) {
    const filesStr = btn.getAttribute('data-kyc-files');
    if (!filesStr) return;

    // Parse the injected file URLs
    const files = JSON.parse(filesStr);
    const urlsToDownload = Object.entries(files).filter(([name, url]) => url && url.trim() !== '');

    if (urlsToDownload.length === 0) {
        if (window.showNotification) {
            window.showNotification('No KYC documents available to download.', 'warning');
        } else {
            alert('No KYC documents available to download.');
        }
        return;
    }

    const originalText = btn.innerHTML;
    btn.innerHTML = '<i data-lucide="loader-2" style="width:11px;height:11px;animation:spin 1s linear infinite;"></i> Zipping...';
    btn.disabled = true;

    try {
        // Dynamically load JSZip if not present
        if (typeof JSZip === 'undefined') {
            await new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
                script.onload = resolve;
                script.onerror = reject;
                document.head.appendChild(script);
            });
        }

        const zip = new JSZip();
        // Format the folder name safely
        const safeFolderName = clientName.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') || 'Client';
        const folderName = `${safeFolderName}_KYC_Documents`;
        const folder = zip.folder(folderName);

        // Fetch each valid file
        const fetchPromises = urlsToDownload.map(async ([name, url]) => {
            try {
                let ext = 'pdf';
                if (url.startsWith('data:')) {
                    if (url.startsWith('data:image/jpeg')) ext = 'jpg';
                    else if (url.startsWith('data:image/png')) ext = 'png';
                    else if (url.startsWith('data:image/gif')) ext = 'gif';
                    else if (url.startsWith('data:image/webp')) ext = 'webp';
                } else {
                    ext = url.split('.').pop().split(/#|\?/)[0];
                    if (!['pdf', 'jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext.toLowerCase())) {
                        ext = 'pdf';
                    }
                }
                const response = await fetch(url);
                if (!response.ok) throw new Error('Network error');
                const blob = await response.blob();
                folder.file(`${name}.${ext}`, blob);
            } catch (err) {
                console.warn(`Failed to fetch ${name} at ${url}`, err);
            }
        });

        await Promise.all(fetchPromises);

        // Generate and download zip
        const content = await zip.generateAsync({ type: 'blob' });
        const downloadUrl = URL.createObjectURL(content);

        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = `${folderName}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(downloadUrl);

    } catch (error) {
        console.error('Zip generation failed', error);
        if (window.showNotification) {
            window.showNotification('Failed to generate zip file.', 'error');
        } else {
            alert('Failed to generate zip file.');
        }
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
        if (window.lucide) window.lucide.createIcons();
    }
};
