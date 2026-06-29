/**
 * Search Manager for Admin Dashboard
 * Handles global search logic, debouncing, and UI rendering
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

        switch(type) {
            case 'events':
                link = `events.html?highlight=${item.id}`;
                meta = `${item.custom_id} • ${item.type} • ${item.state}`;
                break;
            case 'users':
                link = `users.html?highlight=${item.id}`;
                meta = `${item.custom_id} • ${item.email}`;
                break;
            case 'clients':
                link = `clients.html?highlight=${item.id}`;
                meta = `${item.custom_id} • ${item.company || item.email}`;
                break;
        }

        resultItem.href = link;

        // Use profile pic if available, otherwise default icon
        const iconSrc = item.profile_pic ? `<img src="${item.profile_pic}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">` : defaultIcon;

        resultItem.innerHTML = `
            <div class="search-result-icon">${iconSrc}</div>
            <div class="search-result-info">
                <span class="search-result-name">${escapeHTML(item.name)}</span>
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
