/**
 * Search Manager for Admin Dashboard
 * Handles global search logic, debouncing, and UI rendering
 *
 * The API matches event names, payment ids, ticket ids, user ids, client ids,
 * dates, prices, ticket types (regular/vip/premium/all) and priorities
 * (upcoming/featured/hot/nearby/trending) — this renders every category it returns.
 */
class SearchManager {
    constructor() {
        this.input = document.getElementById('globalSearchInput');
        this.dropdown = document.getElementById('searchResultsDropdown');
        this.debounceTimer = null;
        this.minChars = 2;

        if (!this.input || !this.dropdown) {
            return;
        }

        this.init();
    }

    init() {
        this.input.addEventListener('input', (e) => {
            const query = e.target.value.trim();
            this.handleSearch(query);
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!this.input.contains(e.target) && !this.dropdown.contains(e.target)) {
                this.hideDropdown();
            }
        });

        // Show dropdown again on focus if query is valid
        this.input.addEventListener('focus', () => {
            if (this.input.value.trim().length >= this.minChars) {
                this.showDropdown();
            }
        });
    }

    handleSearch(query) {
        clearTimeout(this.debounceTimer);

        if (query.length < this.minChars) {
            this.hideDropdown();
            return;
        }

        this.debounceTimer = setTimeout(() => {
            this.performSearch(query);
        }, 300);
    }

    async performSearch(query) {
        try {
            const response = await apiFetch(`/api/admin/global-search.php?q=${encodeURIComponent(query)}`);
            const data = await response.json();

            if (data.success) {
                this.renderResults(data.results, query);
            }
        } catch (error) {
        }
    }

    renderResults(results, query) {
        this.dropdown.innerHTML = '';
        let hasResults = false;

        const categories = [
            { id: 'events', name: 'Events', icon: '📅' },
            { id: 'tickets', name: 'Tickets', icon: '🎫' },
            { id: 'payments', name: 'Payments', icon: '💳' },
            { id: 'users', name: 'Users', icon: '👤' },
            { id: 'clients', name: 'Clients', icon: '💼' }
        ];

        categories.forEach(cat => {
            const items = results[cat.id] || [];
            if (items.length > 0) {
                hasResults = true;
                this.addCategoryHeader(cat.name);
                items.forEach(item => {
                    this.addResultItem(item, cat.id, cat.icon);
                });
            }
        });

        if (!hasResults) {
            this.dropdown.innerHTML = `<div class="search-no-results">No results found for "${escapeHTML(query)}"</div>`;
        }

        this.showDropdown();
    }

    addCategoryHeader(name) {
        const header = document.createElement('div');
        header.className = 'search-category-header';
        header.textContent = name;
        this.dropdown.appendChild(header);
    }

    addResultItem(item, type, defaultIcon) {
        const resultItem = document.createElement('a');
        resultItem.className = 'search-result-item';

        let link = '#';
        let meta = '';
        let title = item.name || '';

        switch(type) {
            case 'events':
                link = `/admin/events.html?highlight=${item.id}`;
                title = item.name || '';
                meta = [
                    item.custom_id,
                    item.type,
                    item.state,
                    item.event_date,
                    (item.price !== undefined && item.price !== null && item.price !== '') ? `₦${parseFloat(item.price).toLocaleString()}` : '',
                    item.priority
                ].filter(v => v !== undefined && v !== null && v !== '').join(' • ');
                break;
            case 'tickets':
                link = `/admin/tickets.html?highlight=${item.id}`;
                title = item.event_name || item.user_name || item.custom_id || `Ticket #${item.id}`;
                meta = [
                    item.custom_id || `#${item.id}`,
                    item.ticket_type,
                    item.event_date,
                    item.user_name,
                    item.status
                ].filter(Boolean).join(' • ');
                break;
            case 'payments':
                link = `/admin/payments.html?highlight=${item.id}`;
                title = item.event_name || item.user_name || item.custom_id || `Payment #${item.id}`;
                meta = [
                    item.custom_id || item.reference || `#${item.id}`,
                    `₦${parseFloat(item.amount || 0).toLocaleString()}`,
                    item.ticket_type,
                    item.status,
                    (item.paid_at || item.created_at || '').slice(0, 10),
                    item.user_name
                ].filter(Boolean).join(' • ');
                break;
            case 'users':
                link = `/admin/users.html?highlight=${item.id}`;
                meta = [item.custom_id, item.email].filter(Boolean).join(' • ');
                break;
            case 'clients':
                link = `/admin/clients.html?highlight=${item.id}`;
                meta = [item.custom_id, `ID ${item.id}`, item.company || item.email].filter(Boolean).join(' • ');
                break;
        }

        resultItem.href = link;

        // Use profile pic if available, otherwise default icon
        const _picSrc = typeof getProfileImg === 'function' ? getProfileImg(item.profile_pic, item.name || title) : (item.profile_pic || null);
        const iconSrc = _picSrc ? `<img src="${_picSrc}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">` : defaultIcon;

        resultItem.innerHTML = `
            <div class="search-result-icon">${iconSrc}</div>
            <div class="search-result-info">
                <span class="search-result-name">${escapeHTML(title)}</span>
                <span class="search-result-meta">${escapeHTML(meta)}</span>
            </div>
        `;

        // Attach click listener for handling navigation or previews
        resultItem.addEventListener('click', (e) => {
            // If the app uses a specific preview system, we could trigger it here
            // For now, let normal link navigation happen or add custom logic
            this.hideDropdown();
        });

        this.dropdown.appendChild(resultItem);
    }

    showDropdown() {
        this.dropdown.classList.add('active');
    }

    hideDropdown() {
        this.dropdown.classList.remove('active');
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.searchManager = new SearchManager();
});
