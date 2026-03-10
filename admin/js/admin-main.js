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
});

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
            const response = await apiFetch('../../api/auth/logout.php', {
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
            console.error('Logout error:', error);
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
    const exportBtn = document.querySelector('.btn-export');
    const modalBackdrop = document.getElementById('exportModal');
    
    if (exportBtn && modalBackdrop) {
        exportBtn.addEventListener('click', () => {
            // Check if there's a table on the current page
            const hasTable = document.querySelector('table tbody tr');
            
            if (!hasTable || hasTable.innerText.includes('Loading') || hasTable.innerText.includes('No data')) {
                Swal.fire({
                    icon: 'warning',
                    title: 'No Data to Export',
                    text: 'Please wait for data to load or navigate to a page with records before exporting.',
                    confirmButtonColor: '#1976D2'
                });
                return;
            }
            
            modalBackdrop.style.display = 'flex';
        });
        
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
        
        // Get headers
        const headerCells = table.querySelectorAll('thead th');
        headerCells.forEach(cell => {
            headers.push(cell.innerText.trim());
        });
        
        // Get rows
        const bodyRows = table.querySelectorAll('tbody tr');
        bodyRows.forEach(row => {
            const rowData = [];
            const cells = row.querySelectorAll('td');
            cells.forEach(cell => {
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
        console.error('PDF export error:', error);
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
        
        // Get headers
        const headers = [];
        const headerCells = table.querySelectorAll('thead th');
        headerCells.forEach(cell => {
            headers.push(cell.innerText.trim());
        });
        worksheet_data.push(headers);
        
        // Get rows
        const bodyRows = table.querySelectorAll('tbody tr');
        bodyRows.forEach(row => {
            const rowData = [];
            const cells = row.querySelectorAll('td');
            cells.forEach(cell => {
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
        console.error('Excel export error:', error);
        Swal.fire('Error', 'Failed to export as Excel. Please try again.', 'error');
    }
}

function exportCurrentTableToCSV() {
    const table = document.querySelector('table');
    if (!table) return;

    if (window.showToast) window.showToast('Generating CSV...', 'info');

    const rows = Array.from(table.querySelectorAll('tr'));
    const csvContent = rows.map(row => {
        const cells = Array.from(row.querySelectorAll('th, td'));
        return cells.map(cell => {
            // Clean up the text: remove extra whitespace, handle quotes
            let text = cell.innerText.trim().replace(/\n/g, ' ');
            if (text.includes(',') || text.includes('"')) {
                text = `"${text.replace(/"/g, '""')}"`;
            }
            return text;
        }).join(',');
    }).join('\n');

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
    // Logic to handle mobile toggle if needed, or active state highlighting
    const currentPath = window.location.pathname;
    const menuItems = document.querySelectorAll('.menu-item a');
    
    menuItems.forEach(item => {
        if (currentPath.includes(item.getAttribute('href'))) {
            item.parentElement.classList.add('active');
        }
    });
}
window.initPreviews = function() {
    // Create Modal Backdrop (if not exists)
    let backdrop = document.querySelector('.preview-modal-backdrop');
    if (!backdrop) {
        backdrop = document.createElement('div');
        backdrop.className = 'preview-modal-backdrop';
        backdrop.innerHTML = `
            <div class="preview-modal">
                <span class="preview-close">←</span>
                <div id="previewContent"></div>
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
                
                const profilePic = row.dataset.profilePic || `https://ui-avatars.com/api/?name=${name}`;
                
                html = `
                    <div class="profile-preview">
                        <div class="profile-preview-header">User Profile</div>
                        <div class="profile-preview-cover-box">
                            <img src="${profilePic}" alt="Cover">
                            <div class="profile-preview-avatar-wrapper">
                                <img src="${profilePic}" class="profile-preview-avatar" alt="Avatar">
                                <div class="profile-verified-badge">✓</div>
                            </div>
                        </div>
                        <div class="profile-preview-info">
                            <h2>${name}</h2>
                            <p>${email}</p>
                        </div>
                        <div class="profile-preview-details">
                            <div class="profile-preview-detail-item"><span class="profile-detail-label">Phone</span><span class="profile-detail-val">${contact}</span></div>
                            <div class="profile-preview-detail-item"><span class="profile-detail-label">Job Title</span><span class="profile-detail-val">Student</span></div>
                            <div class="profile-preview-detail-item"><span class="profile-detail-label">Address</span><span class="profile-detail-val">Nigeria</span></div>
                            <div class="profile-preview-detail-item"><span class="profile-detail-label">City</span><span class="profile-detail-val">${location}</span></div>
                            <div class="profile-preview-detail-item"><span class="profile-detail-label">State</span><span class="profile-detail-val">${location}</span></div>
                            <div class="profile-preview-detail-item"><span class="profile-detail-label">Status</span><span class="profile-detail-val">${status}</span></div>
                        </div>
                    </div>
                `;
            } else if (path.includes('clients.html')) {
                const clientId = row.dataset.id;
                const name = row.cells[1].innerText;
                const profilePic = row.dataset.profilePic || `https://ui-avatars.com/api/?name=${name}`;
                
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
                apiFetch(`../../api/admin/get-client-details.php?id=${clientId}`)
                    .then(res => res.json())
                    .then(data => {
                        if (data.success) {
                            const client = data.client;
                            const events = data.events;
                            const buyers = data.buyers;

                            content.innerHTML = `
                                <div class="profile-preview">
                                    <div class="profile-preview-header">Client Profile</div>
                                    <div class="profile-preview-cover-box">
                                        <img src="${profilePic}" alt="Cover">
                                        <div class="profile-preview-avatar-wrapper">
                                            <img src="${profilePic}" class="profile-preview-avatar" alt="Avatar">
                                            ${Number(client.is_verified) === 1 ? '<div class="profile-verified-badge" style="background:#10b981; border:none; color:white; font-size: 0.7rem; padding: 2px 6px; border-radius: 10px; position:absolute; bottom:-10px; left:50%; transform:translateX(-50%); white-space:nowrap; z-index: 10;">✓ Verified</div>' : '<div class="profile-verified-badge" style="background:#ef4444; border:none; color:white; font-size: 0.7rem; padding: 2px 6px; border-radius: 10px; position:absolute; bottom:-10px; left:50%; transform:translateX(-50%); white-space:nowrap; z-index: 10;">✕ Unverified</div>'}
                                        </div>
                                    </div>
                                    <div class="profile-preview-info">
                                        <h2>${client.business_name}</h2>
                                        <p>${row.cells[2].innerText}</p>
                                    </div>
                                    <div class="profile-preview-details">
                                        <div class="profile-preview-detail-item"><span class="profile-detail-label">Phone</span><span class="profile-detail-val">${client.phone || 'N/A'}</span></div>
                                        <div class="profile-preview-detail-item"><span class="profile-detail-label">State</span><span class="profile-detail-val">${client.state || 'N/A'}</span></div>
                                        <div class="profile-preview-detail-item"><span class="profile-detail-label">Company</span><span class="profile-detail-val">${client.company || 'N/A'}</span></div>
                                        
                                        <div class="profile-preview-detail-item" style="grid-column: span 2; margin-top: 1rem; padding-top: 1rem; border-top: 1px solid #eee;">
                                            <div style="font-weight: 700; color: #333; margin-bottom: 0.5rem; font-size: 0.9rem; text-transform: uppercase;">Verification Status</div>
                                            
                                            <div style="display: flex; gap: 10px; margin-bottom: 1rem;">
                                                <button onclick="approveClient(${client.id}, 1, this)" style="flex:1; background: #10b981; color: white; border: none; padding: 0.6rem; border-radius: 8px; font-weight: bold; cursor: pointer; opacity: ${Number(client.is_verified) === 1 ? '0.5' : '1'};" ${Number(client.is_verified) === 1 ? 'disabled' : ''}>Approve Client</button>
                                                <button onclick="approveClient(${client.id}, 0, this)" style="flex:1; background: #ef4444; color: white; border: none; padding: 0.6rem; border-radius: 8px; font-weight: bold; cursor: pointer; opacity: ${Number(client.is_verified) === 0 ? '0.5' : '1'};" ${Number(client.is_verified) === 0 ? 'disabled' : ''}>Decline Client</button>
                                            </div>

                                            <div style="display: flex; flex-direction: column; gap: 0.75rem;">
                                                <div style="display: flex; justify-content: space-between; align-items: center; background: #fafafa; padding: 0.75rem; border-radius: 8px;">
                                                    <div>
                                                        <span style="font-size: 0.8rem; font-weight: 600; color: #666; display: block;">NIN: ${client.nin || 'Not Provided'}</span>
                                                        <span style="font-size: 0.85rem; font-weight: 700; color: ${Number(client.nin_verified) === 1 ? '#10b981' : '#f59e0b'};">
                                                            ${Number(client.nin_verified) === 1 ? '✓ Verified' : 'Pending'}
                                                        </span>
                                                    </div>
                                                    <button onclick="toggleVerification(${client.id}, 'nin', ${Number(client.nin_verified) === 1 ? 0 : 1})" style="background: ${Number(client.nin_verified) === 1 ? '#ef4444' : '#10b981'}; color: white; border: none; border-radius: 6px; padding: 0.4rem 0.8rem; font-size: 0.75rem; font-weight: bold; cursor: pointer;">
                                                        ${Number(client.nin_verified) === 1 ? 'Revoke' : 'Verify'}
                                                    </button>
                                                </div>
                                                <div style="display: flex; justify-content: space-between; align-items: center; background: #fafafa; padding: 0.75rem; border-radius: 8px;">
                                                    <div>
                                                        <span style="font-size: 0.8rem; font-weight: 600; color: #666; display: block;">BVN: ${client.bvn || 'Not Provided'}</span>
                                                        <span style="font-size: 0.85rem; font-weight: 700; color: ${Number(client.bvn_verified) === 1 ? '#10b981' : '#f59e0b'};">
                                                            ${Number(client.bvn_verified) === 1 ? '✓ Verified' : 'Pending'}
                                                        </span>
                                                    </div>
                                                    <button onclick="toggleVerification(${client.id}, 'bvn', ${Number(client.bvn_verified) === 1 ? 0 : 1})" style="background: ${Number(client.bvn_verified) === 1 ? '#ef4444' : '#10b981'}; color: white; border: none; border-radius: 6px; padding: 0.4rem 0.8rem; font-size: 0.75rem; font-weight: bold; cursor: pointer;">
                                                        ${Number(client.bvn_verified) === 1 ? 'Revoke' : 'Verify'}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div style="padding: 1.5rem; border-top: 1px solid #f1f5f9;">
                                        <h3 style="font-size: 1rem; margin-bottom: 1rem; display: flex; align-items: center; gap: 8px;">
                                            <i data-lucide="calendar" style="width: 18px;"></i> Published Events (${events.length})
                                        </h3>
                                        <div style="display: flex; flex-direction: column; gap: 0.75rem; max-height: 200px; overflow-y: auto;">
                                            ${events.length > 0 ? events.map(ev => `
                                                <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.5rem; background: #f8fafc; border-radius: 8px;">
                                                    <div>
                                                        <div style="font-weight: 600; font-size: 0.85rem;">${ev.event_name}</div>
                                                        <div style="font-size: 0.75rem; color: #64748b;">${ev.event_date}</div>
                                                    </div>
                                                    <div style="text-align: right;">
                                                        <div style="font-size: 0.8rem; font-weight: 700; color: var(--admin-primary);">${ev.tickets_sold} sold</div>
                                                    </div>
                                                </div>
                                            `).join('') : '<p style="font-size: 0.85rem; color: #94a3b8;">No events published yet.</p>'}
                                        </div>
                                    </div>

                                    <div style="padding: 1.5rem; border-top: 1px solid #f1f5f9;">
                                        <h3 style="font-size: 1rem; margin-bottom: 1rem; display: flex; align-items: center; gap: 8px;">
                                            <i data-lucide="users" style="width: 18px;"></i> Ticket Buyers (${buyers.length})
                                        </h3>
                                        <div style="display: flex; flex-direction: column; gap: 0.75rem; max-height: 200px; overflow-y: auto;">
                                            ${buyers.length > 0 ? buyers.map(b => `
                                                <div style="display: flex; align-items: center; gap: 10px; padding: 0.5rem; background: #f8fafc; border-radius: 8px;">
                                                    <img src="${b.profile_pic || `https://ui-avatars.com/api/?name=${b.name}`}" style="width: 32px; height: 32px; border-radius: 50%;">
                                                    <div style="flex: 1;">
                                                        <div style="font-weight: 600; font-size: 0.85rem;">${b.name}</div>
                                                        <div style="font-size: 0.75rem; color: #64748b;">${b.email}</div>
                                                    </div>
                                                    <div style="font-size: 0.8rem; font-weight: 700; color: #10b981;">${b.tickets_bought} tix</div>
                                                </div>
                                            `).join('') : '<p style="font-size: 0.85rem; color: #94a3b8;">No ticket buyers yet.</p>'}
                                        </div>
                                    </div>
                                </div>
                            `;
                            lucide.createIcons();
                        } else {
                            content.innerHTML = `<div style="padding: 2rem; text-align: center; color: #ef4444;">Failed to load details: ${data.message}</div>`;
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
                
                const eventImage = row.dataset.image || 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=1200&fit=crop';
                
                html = `
                    <div class="ticket-preview">
                        <div class="ticket-card-preview" style="background: url('${eventImage}') no-repeat center center; background-size: cover; position: relative;">
                            <div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); border-radius: 12px;"></div>
                            <div class="ticket-main" style="position: relative; z-index: 1;">
                                <div class="ticket-top">EVENTRA</div>
                                <div class="ticket-info">
                                    <div class="ticket-event-name">${event} Ticket</div>
                                    <div class="ticket-meta-info">
                                        <div class="ticket-meta-line">📍 Venue: Nigeria</div>
                                        <div class="ticket-meta-line">👥 Attendees: ${attendees}</div>
                                        <div class="ticket-meta-line">🔖 Serial: ${serial}</div>
                                    </div>
                                </div>
                                <div class="ticket-bottom-info">
                                    <div class="ticket-type">${category}</div>
                                    <div class="ticket-price-box">
                                        <div class="ticket-price-label">Ticket Price</div>
                                        <div class="ticket-price-val">${price}</div>
                                    </div>
                                </div>
                            </div>
                            <div class="ticket-barcode-section">
                                <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/c/c1/Barcode_93.svg/1200px-Barcode_93.svg.png" class="barcode-img" alt="barcode">
                            </div>
                        </div>
                    </div>
                `;
            } else if (path.includes('events.html')) {
                const cells = row.querySelectorAll('td');
                if (cells.length < 6) return;
                const event = cells[0].innerText;
                const location = cells[1].innerText;
                const price = cells[2].innerText;
                const attendees = cells[3].innerText;
                const category = cells[4].innerText;
                const status = cells[5].innerText;
                
                const eventImage = row.dataset.image || 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=1200&fit=crop';
                
                html = `
                    <div class="event-preview">
                        <div class="event-preview-image-box">
                            <img src="${eventImage}" class="event-preview-image" alt="Event">
                            <div class="priority-badge" style="position: absolute; top: 1rem; right: 1rem; padding: 0.4rem 0.8rem; border-radius: 20px; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; color: white; background: ${row.dataset.priority === 'hot' ? '#ff4757' : row.dataset.priority === 'trending' ? '#3742fa' : '#2ed573'};">
                                ${row.dataset.priority || 'Standard'}
                            </div>
                        </div>
                        <div class="event-preview-content">
                            <div class="event-preview-main-info" style="margin-bottom: 1rem;">
                                <h1 class="event-preview-title" style="font-size: 1.5rem; margin-bottom: 0.25rem;">${event}</h1>
                                <p style="color: #6b7280; font-size: 0.85rem;">Organized by: ${row.dataset.clientName || 'Eventra'}</p>
                            </div>
                            
                            <div style="margin-bottom: 1.5rem;">
                                <label style="display: block; font-size: 0.75rem; color: #6b7280; margin-bottom: 0.5rem; text-transform: uppercase; font-weight: 600;">Attendees</label>
                                <div style="display: flex; align-items: center; gap: 10px;">
                                    <div style="display: flex;">
                                        ${[...Array(Math.min(parseInt(attendees), 5))].map((_, i) => `
                                            <img src="https://ui-avatars.com/api/?name=User+${i}&background=random" 
                                                 style="width: 25px; height: 25px; border-radius: 50%; border: 2px solid white; margin-left: ${i === 0 ? '0' : '-10px'};">
                                        `).join('')}
                                    </div>
                                    <span style="font-size: 0.85rem; color: #4b5563; font-weight: 600;">${attendees} people attending</span>
                                </div>
                            </div>

                            <div class="event-preview-grid-details" style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-bottom: 1rem;">
                                <div class="event-grid-item" style="background: #f8fafc; padding: 0.6rem; border-radius: 6px; font-size: 0.85rem;">📂 ${category}</div>
                                <div class="event-grid-item" style="background: #f8fafc; padding: 0.6rem; border-radius: 6px; font-size: 0.85rem;">📍 ${location}</div>
                            </div>
                            
                            <div class="event-preview-footer" style="padding-top: 1rem; border-top: 1px solid #f1f5f9;">
                                <div class="event-price-final">
                                    <label style="font-size: 0.8rem; color: #64748b;">Ticket Price:</label>
                                    <span style="font-size: 1.25rem; font-weight: 700; color: var(--primary-color);">${price}</span>
                                </div>
                            </div>
                            <div class="event-preview-sharing" style="margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid #f1f5f9;">
                                <div style="margin-bottom: 0.75rem;">
                                    <label style="display: block; font-size: 0.7rem; color: #94a3b8; margin-bottom: 0.25rem; text-transform: uppercase; font-weight: 600;">Shareable Link</label>
                                    <div style="display: flex; gap: 0.5rem; align-items: center;">
                                        <input type="text" readonly value="${window.location.origin}/public/pages/event-details.html?event=${row.dataset.tag}&client=${row.dataset.clientName}" 
                                               style="background: #f8fafc; padding: 0.4rem 0.6rem; border-radius: 4px; border: 1px solid #e2e8f0; font-family: monospace; font-size: 0.75rem; flex: 1; color: #475569;">
                                        <button onclick="copyToClipboard('${window.location.origin}/public/pages/event-details.html?event=${row.dataset.tag}&client=${row.dataset.clientName}', 'Link copied!')" style="background: #ef4444; color: white; border: none; padding: 0.4rem 0.6rem; border-radius: 4px; cursor: pointer; font-size: 0.75rem; font-weight: 600;">Copy</button>
                                    </div>
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

window.copyToClipboard = function(text, successMsg) {
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
        console.error('Failed to copy:', err);
        Swal.fire('Error', 'Failed to copy to clipboard', 'error');
    });
};

window.approveClient = async function(clientId, status, btnElement) {
    if (!confirm(`Are you sure you want to ${status ? 'approve' : 'decline'} this client?`)) return;
    
    btnElement.disabled = true;
    const ogText = btnElement.innerText;
    btnElement.innerText = 'Processing...';

    try {
        const res = await apiFetch('../../api/admin/approve-client.php', {
            method: 'POST',
            body: JSON.stringify({ client_id: clientId, status: status })
        });
        const data = await res.json();
        if (data.success) {
            Swal.fire('Success', `Client ${status ? 'approved' : 'declined'} successfully.`, 'success');
            // Close preview to force refresh next time it's opened
            setTimeout(() => {
                const closeBtn = document.querySelector('.preview-close');
                if (closeBtn) closeBtn.click();
            }, 1000);
        } else {
            Swal.fire('Error', data.message || 'Verification failed', 'error');
            btnElement.disabled = false;
            btnElement.innerText = ogText;
        }
    } catch(e) {
        Swal.fire('Error', 'Network error. Please try again.', 'error');
        btnElement.disabled = false;
        btnElement.innerText = ogText;
    }
}

window.toggleVerification = async function(clientId, type, status) {
    if (!clientId || !type) return;
    
    try {
        const response = await apiFetch('../../api/admin/verify-client.php', {
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
        console.error('Error toggling verification', e);
        Swal.fire('Error', 'An unexpected error occurred.', 'error');
    }
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
