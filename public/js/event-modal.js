// XSS mitigation helper
function escapeHTML(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag])
  );
}

// Event Details Modal Functions
let currentEventData = null;

async function openEventDetailsModal(eventIdOrData) {
  const modal = document.getElementById('eventDetailsModal');
  const modalContent = modal.querySelector('.modal-content');
  if (!modalContent) return;
  
  // Show modal immediately
  modal.classList.add('active');
  document.body.style.overflow = 'hidden';

  // 1. Show Loading Skeleton State
  modalContent.innerHTML = `
    <button class="modal-close" onclick="closeEventDetailsModal()" style="position: absolute; top: 1rem; right: 1rem; background: rgba(255,255,255,0.9); border: none; width: 40px; height: 40px; border-radius: 50%; font-size: 1.5rem; cursor: pointer; z-index: 10; display: flex; align-items: center; justify-content: center;">&times;</button>
    <div style="position: relative; height: 300px; border-radius: 16px 16px 0 0; margin: -2rem -2rem 2rem -2rem; background: #e5e7eb; animation: pulse 1.5s infinite ease-in-out;"></div>
    <div style="padding: 0 1rem;">
      <div style="height: 2.5rem; width: 70%; background: #e5e7eb; border-radius: 8px; margin-bottom: 0.5rem; animation: pulse 1.5s infinite ease-in-out;"></div>
      <div style="height: 1.2rem; width: 40%; background: #e5e7eb; border-radius: 8px; margin-bottom: 2rem; animation: pulse 1.5s infinite ease-in-out;"></div>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1.5rem; margin-bottom: 2rem;">
        <div style="height: 48px; background: #e5e7eb; border-radius: 12px; animation: pulse 1.5s infinite ease-in-out;"></div>
        <div style="height: 48px; background: #e5e7eb; border-radius: 12px; animation: pulse 1.5s infinite ease-in-out;"></div>
        <div style="height: 48px; background: #e5e7eb; border-radius: 12px; animation: pulse 1.5s infinite ease-in-out;"></div>
        <div style="height: 48px; background: #e5e7eb; border-radius: 12px; animation: pulse 1.5s infinite ease-in-out;"></div>
      </div>
      <div style="height: 6rem; background: #e5e7eb; border-radius: 12px; margin-bottom: 2rem; animation: pulse 1.5s infinite ease-in-out;"></div>
      <div style="height: 3rem; background: #e5e7eb; border-radius: 12px; animation: pulse 1.5s infinite ease-in-out;"></div>
    </div>
    <style>
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: .5; }
      }
    </style>
  `;

  try {
    let eventData;
    
    // Check if we were passed an ID or a direct object (for search dropdown support)
    if (typeof eventIdOrData === 'object' && eventIdOrData !== null && eventIdOrData.id) {
       // Search dropdown passes the whole object, but we still want to fetch fresh data to be safe.
       // However, we can use the passed object as a fallback if the fetch fails.
       currentEventData = eventIdOrData;
    }

    const eventIdToFetch = typeof eventIdOrData === 'object' ? eventIdOrData.id : eventIdOrData;

    // 2. Fetch Event Data dynamically
    const response = await fetch(`/api/events/get-event.php?id=${eventIdToFetch}`);
    const result = await response.json();

    if (result.success && result.event) {
      eventData = result.event;
      currentEventData = eventData;
    } else {
      // Fallback to passed data if API fails to find it (e.g. from search results)
      if (typeof eventIdOrData === 'object') {
          eventData = eventIdOrData;
      } else {
          throw new Error(result.message || 'Event not found');
      }
    }

    // 3. Render Redesigned Modal
    renderModalContent(modalContent, eventData);

  } catch (error) {
    console.error('Error fetching event details:', error);
    modalContent.innerHTML = `
      <button class="modal-close" onclick="closeEventDetailsModal()" style="position: absolute; top: 1rem; right: 1rem; background: rgba(255,255,255,0.9); border: none; width: 40px; height: 40px; border-radius: 50%; font-size: 1.5rem; cursor: pointer; z-index: 10; display: flex; align-items: center; justify-content: center;">&times;</button>
      <div style="padding: 3rem 1rem; text-align: center;">
        <div style="font-size: 3rem; margin-bottom: 1rem;">⚠️</div>
        <h3 style="color: #111827; font-size: 1.5rem; margin-bottom: 0.5rem;">Oops!</h3>
        <p style="color: #6b7280; margin-bottom: 1.5rem;">We couldn't load this event's details. It may have been removed or is temporarily unavailable.</p>
        <button onclick="closeEventDetailsModal()" style="background: #111827; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 8px; font-weight: 600; cursor: pointer;">Close</button>
      </div>
    `;
  }
}

function renderModalContent(container, eventData) {
  const eventImage = eventData.image_path || '../assets/default-event.jpg';
  
  // Format Date and Time safely
  let eventDate = 'Date TBA';
  if (eventData.event_date) {
    eventDate = new Date(eventData.event_date).toLocaleDateString('en-US', { 
      weekday: 'short', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  }
  
  let formattedTime = 'Time TBA';
  if (eventData.event_time) {
     // Strip seconds if present (HH:MM:SS -> HH:MM AM/PM)
     const timeParts = eventData.event_time.split(':');
     if (timeParts.length >= 2) {
         let hours = parseInt(timeParts[0]);
         const minutes = timeParts[1];
         const ampm = hours >= 12 ? 'PM' : 'AM';
         hours = hours % 12;
         hours = hours ? hours : 12; 
         formattedTime = `${hours}:${minutes} ${ampm}`;
     } else {
         formattedTime = eventData.event_time;
     }
  }

  const eventPrice = !eventData.price || parseFloat(eventData.price) === 0 ? 'Free' : `₦${parseFloat(eventData.price).toLocaleString()}`;
  
  container.innerHTML = `
    <button class="modal-close" onclick="closeEventDetailsModal()" style="position: absolute; top: 1rem; right: 1rem; background: rgba(255,255,255,0.9); backdrop-filter: blur(8px); border: none; width: 40px; height: 40px; border-radius: 50%; font-size: 1.5rem; cursor: pointer; z-index: 10; box-shadow: 0 4px 12px rgba(0,0,0,0.1); display: flex; align-items: center; justify-content: center; transition: all 0.2s ease;">&times;</button>
    
    <div style="position: relative; height: 320px; overflow: hidden; border-radius: 20px 20px 0 0; margin: -2rem -2rem 2rem -2rem;">
      <img src="${eventImage}" onerror="this.src='../assets/default-event.jpg'" style="width: 100%; height: 100%; object-fit: cover;" alt="${eventData.event_name}">
      <div style="position: absolute; bottom: 0; left: 0; right: 0; height: 50%; background: linear-gradient(to top, rgba(0,0,0,0.8), transparent);"></div>
      ${eventData.priority ? `<div style="position: absolute; top: 1.5rem; left: 1.5rem; background: rgba(255,255,255,0.9); backdrop-filter: blur(8px); padding: 0.5rem 1rem; border-radius: 30px; font-size: 0.8rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #111827; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">${eventData.priority}</div>` : ''}
    </div>
    
    <div style="padding: 0 1rem;">
      <h2 style="font-size: 2.25rem; font-weight: 800; color: #111827; margin-bottom: 0.5rem; line-height: 1.1; letter-spacing: -0.02em;">${escapeHTML(eventData.event_name)}</h2>
      
      <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 2rem;">
        <div style="width: 32px; height: 32px; border-radius: 50%; background: #f3f4f6; display: flex; align-items: center; justify-content: center; color: #6b7280; font-size: 1rem;">👤</div>
        <p style="color: #6b7280; font-size: 1rem; margin: 0;">Organized by <span style="font-weight: 600; color: #374151;">${escapeHTML(eventData.client_name || eventData.organizer_name || 'Eventra')}</span></p>
      </div>
      
      <div style="height: 1px; background: #e5e7eb; margin-bottom: 2rem;"></div>
      
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1.5rem; margin-bottom: 2.5rem;">
        <div style="display: flex; align-items: flex-start; gap: 1rem;">
          <div style="width: 44px; height: 44px; background: #fef2f2; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 1.25rem; flex-shrink: 0;">📅</div>
          <div>
            <div style="font-size: 0.75rem; color: #6b7280; font-weight: 600; text-transform: uppercase; margin-bottom: 0.25rem;">Date</div>
            <div style="font-weight: 600; color: #111827; font-size: 0.95rem;">${escapeHTML(eventDate)}</div>
          </div>
        </div>
        
        <div style="display: flex; align-items: flex-start; gap: 1rem;">
          <div style="width: 44px; height: 44px; background: #fffbeb; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 1.25rem; flex-shrink: 0;">🕒</div>
          <div>
            <div style="font-size: 0.75rem; color: #6b7280; font-weight: 600; text-transform: uppercase; margin-bottom: 0.25rem;">Time</div>
            <div style="font-weight: 600; color: #111827; font-size: 0.95rem;">${escapeHTML(formattedTime)}</div>
          </div>
        </div>
        
        <div style="display: flex; align-items: flex-start; gap: 1rem;">
          <div style="width: 44px; height: 44px; background: #ecfdf5; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 1.25rem; flex-shrink: 0;">📍</div>
          <div>
            <div style="font-size: 0.75rem; color: #6b7280; font-weight: 600; text-transform: uppercase; margin-bottom: 0.25rem;">Location</div>
            <div style="font-weight: 600; color: #111827; font-size: 0.95rem;">${escapeHTML(eventData.location || '')} ${escapeHTML(eventData.state || 'TBD')}</div>
            ${eventData.address ? `<div style="font-size: 0.8rem; color: #6b7280; margin-top: 0.2rem;">${escapeHTML(eventData.address)}</div>` : ''}
          </div>
        </div>
        
        <div style="display: flex; align-items: flex-start; gap: 1rem;">
          <div style="width: 44px; height: 44px; background: #fdf2f8; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 1.25rem; flex-shrink: 0;">🎟️</div>
          <div>
            <div style="font-size: 0.75rem; color: #6b7280; font-weight: 600; text-transform: uppercase; margin-bottom: 0.25rem;">Price</div>
            <div style="font-weight: 700; color: #111827; font-size: 1rem;">${escapeHTML(eventPrice)}</div>
          </div>
        </div>
      </div>
      
      <div style="margin-bottom: 2.5rem;">
        <h3 style="font-size: 1.1rem; color: #111827; margin-bottom: 1rem; font-weight: 700; letter-spacing: -0.01em;">About this event</h3>
        <div style="color: #4b5563; line-height: 1.8; font-size: 0.95rem; white-space: pre-line;">${escapeHTML(eventData.description || 'No description provided for this event.')}</div>
      </div>
      
      <div style="margin-bottom: 2rem;">
        <div style="display: inline-block; background: #f3f4f6; color: #374151; padding: 0.5rem 1rem; border-radius: 8px; font-weight: 600; font-size: 0.85rem;">${eventData.event_type || eventData.category || 'General Category'}</div>
      </div>
      
      <!-- Sticky-like Buy Button Container -->
      <div style="position: sticky; bottom: -2rem; margin: 0 -3rem -2rem -3rem; padding: 1.5rem 3rem 2rem 3rem; background: rgba(255,255,255,0.9); backdrop-filter: blur(12px); border-top: 1px solid #f3f4f6;">
        <button onclick="handleBuyTicket()" style="width: 100%; background: #111827; color: white; border: none; padding: 1rem 2rem; border-radius: 12px; font-size: 1.05rem; font-weight: 700; cursor: pointer; transition: all 0.2s ease; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); display: flex; align-items: center; justify-content: center; gap: 0.5rem;" onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)';" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)';">
          <span>Get Tickets</span>
          <svg style="width: 20px; height: 20px;" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
        </button>
      </div>
    </div>
  `;
}

function closeEventDetailsModal() {
  const modal = document.getElementById('eventDetailsModal');
  modal.classList.remove('active');
  document.body.style.overflow = '';
  setTimeout(() => {
     currentEventData = null;
  }, 300); // wait for animation to finish
}

function handleBuyTicket() {
  if (currentEventData) {
    if (currentEventData.tag) {
      window.location.href = `details.html?event=${currentEventData.tag}`;
    } else {
      window.location.href = `checkout.html?id=${currentEventData.id}`;
    }
  }
}

// Close modal on backdrop click
document.addEventListener('click', (e) => {
  const modal = document.getElementById('eventDetailsModal');
  if (modal && e.target === modal) {
    closeEventDetailsModal();
  }
});

// Enhanced Search Functionality
let searchTimeout = null;
let allEventsData = [];

function initializeEnhancedSearch() {
  const searchInput = document.querySelector('.search-input');
  if (!searchInput) return;
  
  // Create search results dropdown
  const searchContainer = document.querySelector('.search-container');
  if (searchContainer && !searchContainer.querySelector('.search-results-dropdown')) {
    const dropdown = document.createElement('div');
    dropdown.className = 'search-results-dropdown';
    dropdown.id = 'searchResultsDropdown';
    searchContainer.appendChild(dropdown);
  }
  
  // Add input event listener
  searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    const query = e.target.value.trim();
    
    if (query.length < 2) {
      hideSearchResults();
      return;
    }
    
    searchTimeout = setTimeout(() => {
      performEnhancedSearch(query);
    }, 300);
  });
  
  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (searchContainer && !searchContainer.contains(e.target)) {
      hideSearchResults();
    }
  });
}

function performEnhancedSearch(query) {
  const dropdown = document.getElementById('searchResultsDropdown');
  if (!dropdown) return;
  
  const lowerQuery = query.toLowerCase();
  
  // Filter events by name, category, location, date, description, priority, or tags
  const results = allEventsData.filter(event => {
    return (
      event.event_name.toLowerCase().includes(lowerQuery) ||
      (event.category && event.category.toLowerCase().includes(lowerQuery)) ||
      (event.event_type && event.event_type.toLowerCase().includes(lowerQuery)) ||
      (event.city && event.city.toLowerCase().includes(lowerQuery)) ||
      (event.state && event.state.toLowerCase().includes(lowerQuery)) ||
      (event.event_date && event.event_date.includes(lowerQuery)) ||
      (event.description && event.description.toLowerCase().includes(lowerQuery)) ||
      (event.priority && event.priority.toLowerCase().includes(lowerQuery)) ||
      (event.tag && event.tag.toLowerCase().includes(lowerQuery))
    );
  }).slice(0, 5); // Limit to 5 results
  
  if (results.length === 0) {
    dropdown.innerHTML = '<div class="search-result-item">No events found</div>';
  } else {
    dropdown.innerHTML = results.map(event => {
      const eventStr = JSON.stringify(event).replace(/"/g, '&quot;');
      return `
        <div class="search-result-item" onclick='openEventDetailsModal(${eventStr})'>
          <strong>${event.event_name}</strong>
          <span class="search-category-badge">${event.event_type || event.category || 'Event'}</span>
          <br>
          <small style="color: #666;">${event.location || event.state || 'Location TBD'} • ${new Date(event.event_date).toLocaleDateString()}</small>
        </div>
      `;
    }).join('');
  }
  
  dropdown.classList.add('active');
}

function hideSearchResults() {
  const dropdown = document.getElementById('searchResultsDropdown');
  if (dropdown) {
    dropdown.classList.remove('active');
  }
}

// Make functions globally available
window.openEventDetailsModal = openEventDetailsModal;
window.closeEventDetailsModal = closeEventDetailsModal;
window.handleBuyTicket = handleBuyTicket;
window.allEventsData = allEventsData;

// Initialize enhanced search when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  initializeEnhancedSearch();
});
