document.addEventListener('DOMContentLoaded', async () => {
    const eventsTableBody = document.querySelector('table tbody');
    const statsValues = document.querySelectorAll('.stat-value');
    let allEvents = [];
    let filteredEvents = [];
    let sortConfig = { key: null, direction: 'asc' };
    let pagination = null;
    
    // Track selected checkboxes across pages
    const selectedEventIds = new Set();
    
    // Filter elements
    const statusFilter = document.getElementById('statusFilter');
    const categoryFilter = document.getElementById('categoryFilter');
    const priceFilter = document.getElementById('priceFilter');
    const attendeeFilter = document.getElementById('attendeeFilter');

    async function loadEvents() {
        try {
            const response = await apiFetch('/api/admin/get-all-events.php');
            const result = await response.json();

            if (result.success) {
                allEvents = result.events;
                
                // Populate dynamic categories
                const categoryFilter = document.getElementById('categoryFilter');
                if (categoryFilter) {
                    const uniqueCategories = [...new Set(allEvents.map(e => e.event_type).filter(Boolean))].sort();
                    const currentVal = categoryFilter.value;
                    const optionsHTML = ['<option value="all">All Categories</option>'];
                    uniqueCategories.forEach(cat => {
                        optionsHTML.push(`<option value="${escapeHTML(cat)}">${escapeHTML(cat)}</option>`);
                    });
                    const newHTML = optionsHTML.join('');
                    if (categoryFilter.innerHTML !== newHTML) {
                        categoryFilter.innerHTML = newHTML;
                        if (uniqueCategories.includes(currentVal) || currentVal === 'all') {
                            categoryFilter.value = currentVal;
                        }
                    }
                }

                applyFilters(); // Apply current filters
                updateStats(result.stats);
            } else {
            }
        } catch (error) {
        }
    }

    function renderEvents(events) {
        if (!eventsTableBody) return;
        
        if (events.length === 0) {
            eventsTableBody.innerHTML = '<tr><td colspan="13" style="text-align: center; padding: 3rem; color: #999;">No events found</td></tr>';
            return;
        }

        eventsTableBody.innerHTML = events.map(event => {
            // Determine display status (handle soft-deleted)
            let displayStatus = event.status;
            let statusClass = event.status;
            
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const eventDay = new Date((event.event_date || '') + "T00:00:00");
            const isPassed = event.event_date ? eventDay < today : false;
            
            if (event.deleted_at) {
                displayStatus = 'deleted';
                statusClass = 'cancelled'; // Mapping to existing CSS class
            } else if (isPassed) {
                displayStatus = 'passed';
                statusClass = 'concluded';
            }

            const dateStr = window.formatDateLong ? formatDateLong(event.event_date) : new Date(event.event_date).toLocaleDateString();
            const clientCustomId = event.client_custom_id ? `<div style="font-size:.7rem;color:#94a3b8;font-family:monospace;">${event.client_custom_id}</div>` : '';

            return `
                <tr data-id="${event.id}" 
                    data-image="${escapeHTML(event.image_path || '')}" 
                    data-description="${escapeHTML(event.description || '')}" 
                    data-address="${escapeHTML(event.address || '')}" 
                    data-state="${escapeHTML(event.state || '')}" 
                    data-date="${escapeHTML(event.event_date)}" 
                    data-time="${escapeHTML(event.event_time)}" 
                    data-priority="${escapeHTML(event.priority || 'low')}"
                    data-client-name="${escapeHTML(event.client_name || 'Eventra')}"
                    data-tag="${escapeHTML(event.tag || '')}">
                    <td style="padding-left: 1.5rem;">
                        <input type="checkbox" class="event-checkbox" data-id="${event.id}" ${selectedEventIds.has(event.id.toString()) ? 'checked' : ''}>
                    </td>
                    <td>
                        <div style="font-size:.75rem;color:var(--admin-primary);font-family:monospace;font-weight:700;">${escapeHTML(event.custom_id || event.id)}</div>
                    </td>
                    <td>
                        <div style="font-weight:600;">${escapeHTML(event.event_name.replace(/\s*#\d+$/, ''))}</div>
                        <div style="font-size:.75rem;color:#64748b;">by ${escapeHTML(event.client_name || 'N/A')}</div>
                        ${event.client_custom_id ? `<div style="font-size:.7rem;color:#94a3b8;font-family:monospace;">${escapeHTML(event.client_custom_id)}</div>` : ''}
                    </td>
                    <td><span class="priority-badge ${escapeHTML(event.priority || 'low')}">${escapeHTML((event.priority || 'Low').toUpperCase())}</span></td>
                    <td>${escapeHTML(dateStr)}</td>
                    <td>${escapeHTML(event.event_time.substring(0, 5))}</td>
                    <td>${escapeHTML(event.event_type)}</td>
                    <td>${escapeHTML(event.phone_contact_1 || event.phone || 'N/A')}</td>
                    <td>
                        ${(() => {
                            const basePrice = parseFloat(event.price) || 0;
                            const regPrice = parseFloat(event.regular_price) || 0;
                            const vPrice = parseFloat(event.vip_price) || 0;
                            const premPrice = parseFloat(event.premium_price) || 0;
                            const isFree = basePrice === 0 && regPrice === 0 && vPrice === 0 && premPrice === 0;
                            
                            if (isFree) return 'Free';
                            
                            const mode = event.ticket_type_mode || 'all';
                            if (mode === 'all' || mode.includes('all')) {
                                return '₦' + basePrice.toLocaleString();
                            } else {
                                const prices = [];
                                if (regPrice > 0) prices.push('R: ₦' + regPrice.toLocaleString());
                                if (vPrice > 0) prices.push('V: ₦' + vPrice.toLocaleString());
                                if (premPrice > 0) prices.push('P: ₦' + premPrice.toLocaleString());
                                return prices.length > 0 ? prices.join('<br>') : 'Paid';
                            }
                        })()}
                    </td>
                    <td class="text-center">${parseInt(event.attendee_count) || 0}</td>
                    <td><span class="tag-badge">${escapeHTML(event.tag || 'None')}</span></td>
                    <td><a href="${escapeHTML(event.external_link || event.link || '#')}" target="_blank" class="link-btn" style="color: var(--admin-primary);"><i data-lucide="external-link"></i></a></td>
                    <td><span class="status-badge status-${escapeHTML(statusClass)}">${escapeHTML(displayStatus.charAt(0).toUpperCase() + displayStatus.slice(1))}</span></td>
                </tr>
            `;
        }).join('');

        // Handle individual checkboxes
        document.querySelectorAll('.event-checkbox').forEach(cb => {
            cb.onclick = (e) => e.stopPropagation();
            cb.onchange = (e) => {
                const id = e.target.dataset.id;
                if (e.target.checked) {
                    selectedEventIds.add(id);
                } else {
                    selectedEventIds.delete(id);
                }
                updateSelectAllState();
            };
        });

        // Re-initialize previews for new rows
        if (window.initPreviews) {
            window.initPreviews();
        }
        
        if (window.lucide) {
            window.lucide.createIcons();
        }
        
        updateSelectAllState();
    }

    function updateSelectAllState() {
        const selectAll = document.getElementById('selectAll');
        if (!selectAll) return;
        
        const pageCheckboxes = document.querySelectorAll('.event-checkbox');
        if (pageCheckboxes.length === 0) {
            selectAll.checked = false;
            return;
        }
        
        const allCheckedOnPage = Array.from(pageCheckboxes).every(cb => cb.checked);
        selectAll.checked = allCheckedOnPage;
    }

    function applyFilters() {
        filteredEvents = allEvents.filter(event => {
            // Status Filter
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const eventDay = new Date((event.event_date || '') + "T00:00:00");
            const isPassed = event.event_date ? eventDay < today : false;

            let statusMatch = statusFilter.value === 'all';
            if (!statusMatch) {
                if (statusFilter.value === 'cancelled') {
                    statusMatch = !!event.deleted_at;
                } else if (statusFilter.value === 'passed') {
                    statusMatch = isPassed && !event.deleted_at;
                } else {
                    statusMatch = event.status === statusFilter.value && !event.deleted_at;
                }
            }
            
            // Category Filter
            const categoryMatch = categoryFilter.value === 'all' || event.event_type === categoryFilter.value;
            
            // Price Filter
            let priceMatch = true;
            const basePrice = parseFloat(event.price) || 0;
            const regPrice = parseFloat(event.regular_price) || 0;
            const vPrice = parseFloat(event.vip_price) || 0;
            const premPrice = parseFloat(event.premium_price) || 0;
            const isFree = basePrice === 0 && regPrice === 0 && vPrice === 0 && premPrice === 0;

            if (priceFilter.value === 'free') priceMatch = isFree;
            if (priceFilter.value === 'paid') priceMatch = !isFree;
            if (priceFilter.value === 'premium') {
                priceMatch = basePrice > 50000 || regPrice > 50000 || vPrice > 50000 || premPrice > 50000;
            }
            
            // Attendee Filter
            let attendeeMatch = true;
            const count = parseInt(event.attendee_count) || 0;
            if (attendeeFilter.value === '0-50') attendeeMatch = count <= 50;
            if (attendeeFilter.value === '51-200') attendeeMatch = count > 50 && count <= 200;
            if (attendeeFilter.value === '201+') attendeeMatch = count > 200;
            
            return statusMatch && categoryMatch && priceMatch && attendeeMatch;
        });

        // Maintain sorting if active
        if (sortConfig.key) {
            const currentConfig = { ...sortConfig };
            sortConfig.key = null; // Reset to force sort
            sortEvents(currentConfig.key, currentConfig.direction);
        } else {
            updatePagination(filteredEvents);
        }
    }

    function updatePagination(events) {
        if (!pagination) {
            pagination = new EventraPagination({
                data: events,
                containerId: 'paginationContainer',
                persistState: true,
                onPageChange: (pageData, shouldScroll = true) => {
                    renderEvents(pageData);
                    if (shouldScroll) window.scrollTo({ top: 0, behavior: 'smooth' });
                }
            });
            renderEvents(pagination.getPageData(), false);
        } else {
            pagination.updateData(events);
        }
    }

    function sortEvents(key, forcedDirection = null) {
        if (forcedDirection) {
            sortConfig.key = key;
            sortConfig.direction = forcedDirection;
        } else if (sortConfig.key === key) {
            sortConfig.direction = sortConfig.direction === 'asc' ? 'desc' : 'asc';
        } else {
            sortConfig.key = key;
            sortConfig.direction = 'asc';
        }

        // Update UI headers
        document.querySelectorAll('th.sortable').forEach(th => {
            th.classList.remove('asc', 'desc');
            if (th.dataset.sort === key) {
                th.classList.add(sortConfig.direction);
            }
        });

        const targetList = filteredEvents;
        const sortedEvents = [...targetList].sort((a, b) => {
            let valA = a[key];
            let valB = b[key];

            // Handle price and attendee_count as numbers
            if (key === 'price' || key === 'attendee_count') {
                valA = parseFloat(valA) || 0;
                valB = parseFloat(valB) || 0;
            } else {
                valA = (valA || '').toString().toLowerCase();
                valB = (valB || '').toString().toLowerCase();
            }

            if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
            if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });

        updatePagination(sortedEvents);
    }

    function anyFilterActive() {
        return statusFilter.value !== 'all' || 
               categoryFilter.value !== 'all' || 
               priceFilter.value !== 'all' || 
               attendeeFilter.value !== 'all';
    }

    // Initialize sort listeners
    document.querySelectorAll('th.sortable').forEach(th => {
        th.addEventListener('click', () => {
            sortEvents(th.dataset.sort);
        });
    });

    // Handle Select All click (across global selection)
    const selectAll = document.getElementById('selectAll');
    if (selectAll) {
        selectAll.addEventListener('change', (e) => {
            const pageCheckboxes = document.querySelectorAll('.event-checkbox');
            pageCheckboxes.forEach(cb => {
                cb.checked = e.target.checked;
                const id = cb.dataset.id;
                if (e.target.checked) {
                    selectedEventIds.add(id);
                } else {
                    selectedEventIds.delete(id);
                }
            });
        });
    }

    // Initialize filter listeners
    [statusFilter, categoryFilter, priceFilter, attendeeFilter].forEach(el => {
        el.addEventListener('change', applyFilters);
    });

    function updateStats(stats) {
        if (!stats || statsValues.length < 5) return;

        // stats from API: total, published, deleted, scheduled, restored
        statsValues[0].textContent = stats.total || 0;
        statsValues[1].textContent = stats.published || 0;
        statsValues[2].textContent = stats.deleted || 0;
        statsValues[3].textContent = stats.scheduled || 0;
        statsValues[4].textContent = stats.restored || 0;
    }

    // Initial load
    await loadEvents();

    // Task 3: Real-time synchronization (10s polling)
    setInterval(loadEvents, 10000);
});
