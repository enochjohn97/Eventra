/**
 * Smart Search Functionality
 * Implements search across events with filtering
 */

let allEvents = [];

async function initializeSearch() {
    const searchInput = document.querySelector('.header-search input');
    if (!searchInput) return;

    // Load all events for search
    await loadAllEventsForSearch();

    // Add search event listener with debounce
    let searchTimeout;
    searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            performSearch(e.target.value);
        }, 300);
    });
}

async function loadAllEventsForSearch() {
    // No longer pre-loading all events for server-side search
    return;
}

async function performSearch(query) {
    if (!query || query.trim().length < 2) {
        hideSearchResults();
        return;
    }

    try {
        const basePath = typeof getBasePath === 'function' ? getBasePath() : '../../';
        const response = await apiFetch(`${basePath}api/utils/search.php?q=${encodeURIComponent(query)}`);
        const result = await response.json();

        if (result.success) {
            displaySearchResults(result.results, query);
        }
    } catch (error) {
        console.error('Error performing search:', error);
    }
}

function displaySearchResults(results, query) {
    let resultsContainer = document.getElementById('searchResults');
    
    if (!resultsContainer) {
        resultsContainer = document.createElement('div');
        resultsContainer.id = 'searchResults';
        resultsContainer.style.cssText = `
            position: absolute;
            top: 100%;
            left: 0;
            right: 0;
            background: white;
            border-radius: 8px;
            box-shadow: 0 10px 25px rgba(0,0,0,0.1);
            max-height: 500px;
            overflow-y: auto;
            z-index: 1000;
            margin-top: 8px;
            border: 1px solid #e5e7eb;
        `;
        
        const searchContainer = document.querySelector('.header-search');
        if (searchContainer) {
            searchContainer.style.position = 'relative';
            searchContainer.appendChild(resultsContainer);
        }
    }

    const hasResults = results.events.length > 0 || results.tickets.length > 0 || results.users.length > 0 || (results.media && results.media.length > 0);

    if (!hasResults) {
        resultsContainer.innerHTML = `
            <div style="padding: 2rem; text-align: center; color: #9ca3af;">
                <div style="font-size: 2rem; margin-bottom: 0.5rem;">🔍</div>
                <p>No results found for "${query}"</p>
            </div>
        `;
        resultsContainer.style.display = 'block';
        return;
    }

    let html = '';

    // Events Section
    if (results.events.length > 0) {
        html += `<div style="padding: 0.75rem 1rem; background: #f9fafb; font-size: 0.7rem; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid #f1f4f8;">Events</div>`;
        html += results.events.map(event => `
            <div class="search-result-item" onclick="goToEvent(${event.id})" style="padding: 0.75rem 1rem; border-bottom: 1px solid #f1f4f8; cursor: pointer; display: flex; align-items: center; gap: 12px;">
                <div style="width: 32px; height: 32px; border-radius: 6px; background: #f3f4f6; display: flex; align-items: center; justify-content: center; font-size: 1rem;">📅</div>
                <div style="flex: 1;">
                    <div style="font-weight: 600; font-size: 0.9rem; color: #111827;">${highlightText(event.title, query)}</div>
                    <div style="font-size: 0.75rem; color: #6b7280;">
                        ${event.subtitle || ''} ${event.category ? '• ' + event.category : ''} 
                        ${event.price ? '• ' + (parseFloat(event.price) === 0 ? 'Free' : '₦' + parseFloat(event.price).toLocaleString()) : ''}
                    </div>
                </div>
            </div>
        `).join('');
    }

    // Tickets Section
    if (results.tickets.length > 0) {
        html += `<div style="padding: 0.75rem 1rem; background: #f9fafb; font-size: 0.7rem; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid #f1f4f8;">Tickets</div>`;
        html += results.tickets.map(ticket => `
            <div class="search-result-item" onclick="goToTickets(${ticket.id})" style="padding: 0.75rem 1rem; border-bottom: 1px solid #f1f4f8; cursor: pointer; display: flex; align-items: center; gap: 12px;">
                <div style="width: 32px; height: 32px; border-radius: 6px; background: #fef2f2; display: flex; align-items: center; justify-content: center; font-size: 1rem;">🎫</div>
                <div style="flex: 1;">
                    <div style="font-weight: 600; font-size: 0.9rem; color: #111827;">${highlightText(ticket.title, query)}</div>
                    <div style="font-size: 0.75rem; color: #6b7280;">Event: ${ticket.subtitle} • Bought by: ${ticket.extra}</div>
                </div>
            </div>
        `).join('');
    }

    // Users Section
    if (results.users.length > 0) {
        html += `<div style="padding: 0.75rem 1rem; background: #f9fafb; font-size: 0.7rem; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid #f1f4f8;">Users</div>`;
        html += results.users.map(user => `
            <div class="search-result-item" onclick="goToUsers(${user.id})" style="padding: 0.75rem 1rem; border-bottom: 1px solid #f1f4f8; cursor: pointer; display: flex; align-items: center; gap: 12px;">
                <div style="width: 32px; height: 32px; border-radius: 50%; background: #eef2ff; display: flex; align-items: center; justify-content: center; font-size: 1rem;">👤</div>
                <div style="flex: 1;">
                    <div style="font-weight: 600; font-size: 0.9rem; color: #111827;">${highlightText(user.title, query)}</div>
                    <div style="font-size: 0.75rem; color: #6b7280;">${user.subtitle}</div>
                </div>
            </div>
        `).join('');
    }

    // Media Section
    if (results.media && results.media.length > 0) {
        html += `<div style="padding: 0.75rem 1rem; background: #f9fafb; font-size: 0.7rem; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid #f1f4f8;">Media & Folders</div>`;
        html += results.media.map(item => `
            <div class="search-result-item" onclick="goToMedia(${item.id}, '${item.item_type}')" style="padding: 0.75rem 1rem; border-bottom: 1px solid #f1f4f8; cursor: pointer; display: flex; align-items: center; gap: 12px;">
                <div style="width: 32px; height: 32px; border-radius: 6px; background: ${item.item_type === 'folder' ? '#fff7ed' : '#f0fdf4'}; display: flex; align-items: center; justify-content: center; font-size: 1rem;">
                    ${item.item_type === 'folder' ? '📁' : '📄'}
                </div>
                <div style="flex: 1;">
                    <div style="font-weight: 600; font-size: 0.9rem; color: #111827;">${highlightText(item.title, query)}</div>
                    <div style="font-size: 0.75rem; color: #6b7280;">${item.subtitle} ${item.file_size ? '• ' + (item.file_size / 1024 / 1024).toFixed(2) + ' MB' : ''}</div>
                </div>
            </div>
        `).join('');
    }

    resultsContainer.innerHTML = html;
    resultsContainer.style.display = 'block';

    // Add hover effects dynamically
    const items = resultsContainer.querySelectorAll('.search-result-item');
    items.forEach(item => {
        item.onmouseover = () => item.style.background = '#f9fafb';
        item.onmouseout = () => item.style.background = 'white';
    });

    // Close results when clicking outside
    document.addEventListener('click', function closeResults(e) {
        if (!resultsContainer.contains(e.target) && !document.querySelector('.header-search input').contains(e.target)) {
            hideSearchResults();
            document.removeEventListener('click', closeResults);
        }
    });
}

function hideSearchResults() {
    const resultsContainer = document.getElementById('searchResults');
    if (resultsContainer) {
        resultsContainer.style.display = 'none';
    }
}

function highlightText(text, query) {
    if (!query) return text;
    const regex = new RegExp(`(${query})`, 'gi');
    return text.replace(regex, '<mark style="background: rgba(99, 91, 255, 0.1); color: var(--client-primary); padding: 0 2px; border-radius: 2px;">$1</mark>');
}

function goToEvent(eventId) {
    const basePath = typeof getBasePath === 'function' ? getBasePath() : '';
    window.location.href = `${basePath}pages/events.html?highlight=${eventId}`;
    hideSearchResults();
}

function goToTickets(ticketId) {
    const basePath = typeof getBasePath === 'function' ? getBasePath() : '';
    window.location.href = `${basePath}pages/tickets.html?highlight=${ticketId}`;
    hideSearchResults();
}

function goToUsers(userId) {
    const basePath = typeof getBasePath === 'function' ? getBasePath() : '';
    window.location.href = `${basePath}pages/users.html?highlight=${userId}`;
    hideSearchResults();
}

function goToMedia(id, type) {
    const basePath = typeof getBasePath === 'function' ? getBasePath() : '';
    window.location.href = `${basePath}pages/media.html?highlight=${id}&type=${type}`;
    hideSearchResults();
}

// Initialize search on page load
document.addEventListener('DOMContentLoaded', () => {
    initializeSearch();
});

// Make functions globally available
window.performSearch = performSearch;
window.goToEvent = goToEvent;
