// Event data - will be loaded from API
let eventsData = {
  hot: [],
  trending: [],
  featured: [],
  upcoming: [],
  nearby: [],
  favorites: [],
  all: []
};

let allEvents = [];  // Store all events for filtering

// Load events from API
async function loadEvents() {
  const globalSearch = document.getElementById('globalSearch');
  if (globalSearch && globalSearch.value.trim() !== '') return; // Don't refresh data while search is active

  try {
    const response = await apiFetch('../../api/events/get-events.php');
    const result = await response.json();
    
    if (result.success && result.events) {
      const publishedEvents = result.events.filter(event => event.status === 'published');
      
      // Store all events for search functionality
      allEvents = publishedEvents;
      if (typeof window.allEventsData !== 'undefined') {
        window.allEventsData = publishedEvents;
      }
      
      // Sort helper by creation date (newest first)
      const sortByCreation = (events) => {
        return events.sort((a, b) => {
          const dateA = new Date(a.created_at || a.event_date);
          const dateB = new Date(b.created_at || b.event_date);
          return dateB - dateA;
        });
      };
      
      // Get user location for Nearby events
      const keys = typeof getRoleKeys === 'function' ? getRoleKeys() : { user: 'user' };
      const user = window.storage ? (window.storage.get(keys.user) || window.storage.get('user')) : null;
      const userState = user?.state?.toLowerCase();
      const userCity = user?.city?.toLowerCase();

      const now = new Date();
      const upcomingEvents = publishedEvents.filter(event => new Date(event.event_date) >= now);
      
      // Priority-based filtering
      eventsData.featured = sortByCreation([...publishedEvents.filter(e => e.priority === 'featured')]).slice(0, 12);
      eventsData.hot = sortByCreation([...publishedEvents.filter(e => e.priority === 'hot')]).slice(0, 12);
      eventsData.trending = sortByCreation([...publishedEvents.filter(e => e.priority === 'trending')]).slice(0, 12);
      
      // Upcoming: strictly use priority 'upcoming' if available, otherwise fallback to future events
      const priorityUpcoming = publishedEvents.filter(e => e.priority === 'upcoming');
      if (priorityUpcoming.length > 0) {
        eventsData.upcoming = sortByCreation([...priorityUpcoming]).slice(0, 12);
      } else {
        eventsData.upcoming = upcomingEvents
          .sort((a, b) => new Date(a.event_date) - new Date(b.event_date))
          .slice(0, 12);
      }
      
      // All Events: sorted by creation date
      eventsData.all = sortByCreation([...publishedEvents]);

      // Nearby: strictly use priority 'nearby' if available, otherwise fallback to location matches
      const priorityNearby = publishedEvents.filter(e => e.priority === 'nearby');
      
      if (userState || userCity) {
        const locationNearby = publishedEvents.filter(e => {
          const eventState = e.state?.toLowerCase();
          const eventCity = e.city?.toLowerCase();
          const stateMatch = userState && eventState && (eventState.includes(userState) || userState.includes(eventState));
          const cityMatch = userCity && eventCity && (eventCity.includes(userCity) || userCity.includes(eventCity));
          return stateMatch || cityMatch;
        });

        // Combine priority-nearby and location-nearby, unique by id
        const combined = [...priorityNearby];
        locationNearby.forEach(le => {
          if (!combined.find(pe => pe.id === le.id)) combined.push(le);
        });
        eventsData.nearby = sortByCreation(combined).slice(0, 12);
      } else {
        eventsData.nearby = sortByCreation([...priorityNearby]).slice(0, 12);
      }
      
      // Favorites: events where is_favorite is 1
      eventsData.favorites = publishedEvents.filter(e => parseInt(e.is_favorite) === 1);
      
      // Render events
      renderEvents();
    } else {
      console.error('Failed to load events:', result.message);
      renderEvents();
    }
  } catch (error) {
    console.error('Error loading events:', error);
    renderEvents();
  }
}

// Mobile menu toggle
function initMobileMenu() {
  const menuToggle = document.querySelector('.mobile-menu-toggle');
  const navMenu = document.querySelector('.nav-menu');

  if (menuToggle && navMenu) {
    menuToggle.addEventListener('click', () => {
      menuToggle.classList.toggle('active');
      navMenu.classList.toggle('active');
    });

    // Close menu when clicking on a link
    const navLinks = document.querySelectorAll('.nav-menu a');
    navLinks.forEach(link => {
      link.addEventListener('click', () => {
        menuToggle.classList.remove('active');
        navMenu.classList.remove('active');
      });
    });

    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
      if (!menuToggle.contains(e.target) && !navMenu.contains(e.target)) {
        menuToggle.classList.remove('active');
        navMenu.classList.remove('active');
      }
    });
  }
}

function initUserIcon() {
  const userProfileBtn = document.getElementById('userProfileBtn');
  const profileDropdown = document.getElementById('profileDropdown');
  const viewProfile = document.getElementById('viewProfile');
  const logoutBtn = document.getElementById('logoutBtn');
  const profileSideModal = document.getElementById('profileSideModal');
  const closeProfileModal = document.getElementById('closeProfileModal');
  const profileEditForm = document.getElementById('profileEditForm');
  const loginModal = document.getElementById('loginModal');
  const closeLoginModal = document.getElementById('closeLoginModal');
  
  // UI Elements for user state
  const defaultUserIcon = document.getElementById('defaultUserIcon');
  const userProfileImg = document.getElementById('userProfileImg');
  const userOnlineStatus = document.querySelector('.user-online-status');
  const dropdownUserName = document.getElementById('dropdownUserName');
  const dropdownUserEmail = document.getElementById('dropdownUserEmail');
  
  const setupUI = () => {
    const user = authController.user;

    // Loading/Syncing state
    if (authController.isSyncing && !user) {
        if (dropdownUserName) dropdownUserName.textContent = 'Loading...';
        return;
    }

    if (authController.state === authController.states.AUTHENTICATED && user) {
      // Update icon
      if (userProfileImg) {
          userProfileImg.src = user.profile_image || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name || 'User')}&background=FF5A5F&color=fff&size=128`;
          userProfileImg.title = `Logged in as ${user.name}`;
          userProfileImg.style.display = 'block';
      }
      if (defaultUserIcon) defaultUserIcon.style.display = 'none';
      if (userOnlineStatus) userOnlineStatus.style.display = 'block';
      
      if (dropdownUserName) dropdownUserName.textContent = user.name || 'User';
      if (dropdownUserEmail) dropdownUserEmail.textContent = user.email || '';
    } else {
      // Guest/Unauthenticated UI
      if (userProfileImg) userProfileImg.style.display = 'none';
      if (defaultUserIcon) defaultUserIcon.style.display = 'block';
      if (userOnlineStatus) userOnlineStatus.style.display = 'none';
      
      const favoritesSection = document.getElementById('your-favorites');
      if (favoritesSection) favoritesSection.style.display = 'none';

      if (dropdownUserName) dropdownUserName.textContent = 'Guest';
      if (dropdownUserEmail) dropdownUserEmail.textContent = 'Sign in to sync';
    }
  };

  // Initial UI setup
  setupUI();

  // Listen for state changes from AuthController
  window.addEventListener('auth:stateChange', (e) => {
    console.log('[Main] Auth state change detected:', e.detail.state);
    setupUI();
    if (e.detail.state === authController.states.AUTHENTICATED) {
        loadEvents(); // Refresh data to show is_favorite states
    }
  });

  window.addEventListener('auth:sync', (e) => {
    setupUI();
    if (e.detail.success) {
        loadEvents();
    }
  });

  // Unified click handler for the profile button
  if (userProfileBtn) {
    userProfileBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (authController.state === authController.states.AUTHENTICATED) {
        // Toggle dropdown if logged in
        if (profileDropdown) profileDropdown.classList.toggle('show');
      } else {
        // Show login modal if guest - Ensure clean state
        authController.clearSession();
        if (loginModal) {
          loginModal.style.display = 'flex';
          setTimeout(() => loginModal.classList.add('show'), 10);
        }
      }
    });
  }

  // Close dropdown on click outside
  document.addEventListener('click', () => {
    if (profileDropdown) profileDropdown.classList.remove('show');
  });

  // Logout logic
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      
      const result = await Swal.fire({
        title: 'Logout?',
        text: "You will be signed out of your account.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ff5a5f',
        cancelButtonColor: '#9ca3af',
        confirmButtonText: 'Yes, logout!',
        background: '#fff',
        color: '#000'
      });

      if (result.isConfirmed) {
        authController.logout(true);
      }
    });
  }

  // Modal logic (Profile Info)
  if (viewProfile) {
    viewProfile.addEventListener('click', (e) => {
      e.preventDefault();
      if (profileDropdown) profileDropdown.classList.remove('show');
      
      const keys = typeof getRoleKeys === 'function' ? getRoleKeys() : { user: 'user' };
      const user = window.storage ? (window.storage.get(keys.user) || window.storage.get('user')) : null;
      if (!user) {
        showNotification('User profile not found. Please log in again.', 'info');
        if (loginModal) {
            loginModal.style.display = 'flex';
            setTimeout(() => loginModal.classList.add('show'), 10);
        }
        return;
      }
      const modalPic = document.getElementById('modalProfilePic');
      if (modalPic) modalPic.src = user.profile_image || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name || 'User')}&background=FF5A5F&color=fff&size=128`;
      
      const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
      setVal('profileName', user.name);
      setVal('profileEmail', user.email);
      setVal('profilePhone', user.phone);
      setVal('profileDob', user.dob);
      setVal('profileGender', user.gender);
      setVal('profileCountry', user.country);
      setVal('profileState', user.state);
      setVal('profileCity', user.city);
      setVal('profileAddress', user.address);
      
      if (profileSideModal) profileSideModal.classList.add('open');
    });
  }

  // Profile Picture Preview Logic
  const profilePicUpload = document.getElementById('profilePicUpload');
  const modalProfilePic = document.getElementById('modalProfilePic');
  if (profilePicUpload && modalProfilePic) {
    profilePicUpload.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          modalProfilePic.src = e.target.result;
        };
        reader.readAsDataURL(file);
      }
    });
  }

  if (closeProfileModal) {
    closeProfileModal.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (profileSideModal) profileSideModal.classList.remove('open');
    });
  }

  if (profileEditForm) {
    profileEditForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(profileEditForm);
      const keys = typeof getRoleKeys === 'function' ? getRoleKeys() : { user: 'user' };
      
      try {
        const response = await apiFetch('../../api/users/update-profile.php', {
          method: 'POST',
          body: formData
        });
        const result = await response.json();
        
        if (result.success) {
          if (window.storage) window.storage.set(keys.user, result.user);
          showNotification('Profile updated successfully!', 'success');
          if (profileSideModal) profileSideModal.classList.remove('open');
          setupUI(); // Refresh icon and label immediately
        } else {
          showNotification(result.message || 'Error updating profile', 'error');
        }
      } catch (error) {
        console.error('Update profile error:', error);
        showNotification('System error occurred', 'error');
      }
    });
  }

  // Login Modal close logic
  if (closeLoginModal) {
      closeLoginModal.addEventListener('click', () => {
          if (loginModal) {
              loginModal.classList.remove('show');
              setTimeout(() => loginModal.style.display = 'none', 300);
          }
      });
  }
  
  // Close login modal on backdrop click
  window.addEventListener('click', (e) => {
      if (e.target === loginModal) {
          loginModal.classList.remove('show');
          setTimeout(() => loginModal.style.display = 'none', 300);
      }
  });

  // Trigger Login Modal if redirected from checkout.html or via URL trigger
  const urlParams = new URLSearchParams(window.location.search);
  if (sessionStorage.getItem('redirect_after_login') || urlParams.get('trigger') === 'login') {
      if (loginModal && !isAuthenticated()) {
          loginModal.style.display = 'flex';
          setTimeout(() => loginModal.classList.add('show'), 10);
      }
  }
}

/**
 * Google Auth Logic for Homepage (Refactored to use AuthController)
 */
async function initGoogleAuth() {
    if (authController.state === authController.states.AUTHENTICATED) return;

    try {
        const basePath = getBasePath();
        const response = await apiFetch(basePath + 'api/config/get-google-config.php');
        const data = await response.json();

        if (data.success && data.client_id) {
            // Poll for Google SDK
            let attempts = 0;
            const checkGoogle = setInterval(() => {
                if (typeof google !== 'undefined') {
                    clearInterval(checkGoogle);
                    authController.initGoogle(data.client_id, 'googleSignInContainer');
                } else {
                    attempts++;
                    if (attempts > 50) {
                        clearInterval(checkGoogle);
                        console.error('Google GSI script not loaded');
                    }
                }
            }, 100);
        }
    } catch (error) {
        console.error('Google Auth Init Error:', error);
    }
}


// Debounce helper
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Enhanced search with real-time filtering
function initEnhancedSearch() {
  const globalSearch = document.getElementById('globalSearch');
  const searchLoader = document.getElementById('searchLoader');

  if (globalSearch) {
    let debounceTimer;
    globalSearch.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      if (searchLoader) searchLoader.style.display = 'block';

      debounceTimer = setTimeout(() => {
        const query = globalSearch.value.trim();
        performServerSearch(query);
      }, 500);
    });

    const searchButton = document.querySelector('.search-button-modern');
    if (searchButton) {
      searchButton.addEventListener('click', () => {
        performServerSearch(globalSearch.value.trim());
      });
    }
  }
}

async function performServerSearch(query) {
  const loader = document.getElementById('searchLoader');
  const sections = document.querySelectorAll('.events-section');
  const allEventsSection = document.getElementById('all-events');
  const allEventsTitle = allEventsSection?.querySelector('.section-title');
  const allEventsGrid = document.getElementById('all-events-grid');

  if (!query) {
    if (loader) loader.style.display = 'none';
    sections.forEach(section => {
      section.style.display = 'block';
    });
    if (allEventsTitle) allEventsTitle.textContent = '🌍 All Events';
    loadEvents(); // Reload default events
    return;
  }

  // Toggle sections visibility
  sections.forEach(section => {
    if (section.id !== 'all-events') {
      section.style.display = 'none';
    }
  });
  if (allEventsTitle) allEventsTitle.textContent = `🔍 Results for "${query}"`;

  try {
    const url = new URL('../../api/events/search-events.php', window.location.href);
    url.searchParams.append('q', query);
    url.searchParams.append('limit', '40');

    const response = await apiFetch(url.toString());
    const result = await response.json();

    if (loader) loader.style.display = 'none';

    if (result.success) {
      eventsData.all = result.events;
      renderSearchResults(result.events);
    }
  } catch (error) {
    if (loader) loader.style.display = 'none';
    console.error('Search error:', error);
    showNotification('Error performing search. Please try again.', 'error');
  }
}

function renderSearchResults(events) {
  const grid = document.getElementById('all-events-grid');
  if (!grid) return;

  if (events.length === 0) {
    grid.innerHTML = `
      <div class="empty-state-container">
        <span class="empty-state-icon">🕵️‍♂️</span>
        <div class="empty-state-text">
          <h3>No results found</h3>
          <p>We couldn't find any events matching your search. Try different keywords.</p>
        </div>
      </div>
    `;
    return;
  }

  grid.innerHTML = events.map((e, i) => createEventCard(e, i)).join('');
}

function renderEventsGrid(gridId, events, emptyMessage) {
  const grid = document.getElementById(gridId);
  if (!grid) return;

  grid.innerHTML = events.length > 0
    ? events.map((e, i) => createEventCard(e, i)).join('')
    : `<div class="empty-state" style="grid-column: 1/-1; text-align: center; padding: 4rem;">
         <div style="font-size: 3rem; margin-bottom: 1rem;">🔎</div>
         <h3 style="color: #4b5563;">${emptyMessage}</h3>
       </div>`;
}


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

// Create event card
function createEventCard(event, index) {
  const price = !event.price || parseFloat(event.price) === 0 ? 'Free' : `₦${parseFloat(event.price).toLocaleString()}`;
  
  // Security: Sanitize and Path Priority
  const relPath = event.image_path ? event.image_path.replace(/^\/+/, '') : null;
  const fallback = 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=400&h=250&fit=crop';
  const basePath = typeof getBasePath === 'function' ? getBasePath() : '/';
  const resolvedPath = relPath ? (relPath.startsWith('http') ? relPath : basePath + relPath) : null;
  const eventImage = encodeURI(resolvedPath || event.absolute_image_url || fallback);
  
  let eventDate = 'Date TBA';
  if (event.event_date) {
      const d = new Date(event.event_date);
      if (!isNaN(d.getTime())) {
          eventDate = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      }
  }
  const eventTime = escapeHTML(event.event_time) || '12:00:00';
  const isFavorite = event.is_favorite ? 'active' : '';
  const eventName = escapeHTML(event.event_name);
  const category = escapeHTML(event.category || event.event_type) || 'Event';
  const desc = escapeHTML(event.description || '');
  const organizer = escapeHTML(event.organizer_name || event.client_name || 'Eventra');
  const full_address = `${event.address || ''}, ${event.city || ''}, ${event.state || ''}`.replace(/^, /, '').replace(/, , /g, ', ').replace(/, $/, '');
  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(full_address || 'Nigeria')}`;
  const shareTitle = `Eventra: ${eventName}`;
  const shareText = `Check out ${eventName} organized by ${organizer} on Eventra!`;
  return `
    <div class="event-card" data-id="${event.id}" data-tag="${escapeHTML(event.tag) || event.id}" onclick="typeof openEventModal === 'function' ? openEventModal(${event.id}) : window.location.href='event-details.html?id=${event.id}'">
      <div class="event-image-container">
        <img src="${eventImage}" alt="${eventName}" loading="lazy" class="event-image" onerror="this.src='${fallback}'">
        <div class="event-badges">
          <div class="event-category-badge">${category}</div>
          ${event.priority ? `
            <div class="event-status-badge">
              <span class="status-dot"></span>
              ${event.priority.toUpperCase()}
            </div>
          ` : ''}
        </div>
      </div>
      <div class="event-content">
        <div class="event-date-time">${eventDate} • ${eventTime}</div>
        <h3 class="event-title">${eventName}</h3>
        
        <div class="event-description">
          ${desc.substring(0, 100)}${desc.length > 100 ? '...' : ''}
        </div>
        
        <div class="event-location" onclick="window.open('${mapUrl}', '_blank'); event.stopPropagation();" title="Open in Google Maps">
          <span class="location-text" title="${escapeHTML(full_address)}">${escapeHTML(full_address)}</span>
          <svg class="location-icon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FF5A5F" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
          </svg>
        </div>
        
        <div class="event-footer" style="align-items: flex-end;">
          <div style="display: flex; flex-direction: column; gap: 0.4rem;">
            <div style="font-size: 1.2rem; font-weight: 800; color: ${price.toLowerCase() === 'free' ? '#FF5A5F' : '#111'};">${price}</div>
          </div>
          
          <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 0.8rem;">
            <div style="font-size: 0.8rem; color: #94a3b8; font-weight: 500; display: flex; align-items: center; gap: 0.3rem;">
              By ${organizer}
              ${event.is_verified == 1 ? 
                `<svg title="Verified Organizer" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="#3b82f6" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="border-radius: 50%;">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>` : 
                `<svg title="Unverified" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line>
                </svg>`
              }
            </div>
            <div class="event-card-actions">
              <!-- Heart Icon -->
              <button class="card-action-btn favorite-btn ${isFavorite}" onclick="toggleFavorite(event, ${event.id})" title="Favorite">
                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                </svg>
              </button>
              <!-- Share Icon -->
              <button class="card-action-btn share-btn" onclick="shareEvent(event, ${event.id}, '${escapeHTML(shareTitle)}', '${escapeHTML(shareText)}')" title="Share">
                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path><polyline points="16 6 12 2 8 6"></polyline><line x1="12" y1="2" x2="12" y2="15"></line>
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

// Render events
function renderEvents() {
  renderEventsGrid('all-events-grid', eventsData.all, 'No events available at the moment');
  renderEventsGrid('hot-events-grid', eventsData.hot, 'No hot events at the moment');
  renderEventsGrid('favorites-grid', eventsData.favorites, 'You haven\'t favorited any events yet');
  renderEventsGrid('trending-events-grid', eventsData.trending, 'No trending events at the moment');
  renderEventsGrid('featured-events-grid', eventsData.featured, 'No featured events at the moment');
  renderEventsGrid('upcoming-events-grid', eventsData.upcoming, 'No upcoming events at the moment');
  renderEventsGrid('nearby-events-grid', eventsData.nearby, 'No events found in your area at the moment');
}

// Share event function
function shareEvent(e, eventId, title = 'Check out this event!', text = 'I found this amazing event on Eventra') {
  if(e) e.stopPropagation();
  const shareUrl = `${window.location.origin}${window.location.pathname}?event=${eventId}`;
  if (navigator.share) {
    navigator.share({
      title: title,
      text: text,
      url: shareUrl
    }).catch(err => console.log('Error sharing:', err));
  } else {
    navigator.clipboard.writeText(shareUrl).then(() => {
        showNotification('Share link copied to clipboard!', 'success');
    });
  }
}

// Favorite toggle function
async function toggleFavorite(e, eventId) {
    if(e) e.stopPropagation();
    if (!isAuthenticated()) {
        showNotification('Please login to favorite events', 'info');
        return;
    }
    try {
        const response = await apiFetch('../../api/events/favorite.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ event_id: eventId })
        });
        const result = await response.json();
        if (result.success) {
            // Update local eventsData reactively
            if (typeof eventsData !== 'undefined') {
                // Update in all categories
                Object.keys(eventsData).forEach(category => {
                    if (Array.isArray(eventsData[category])) {
                        eventsData[category].forEach(ev => {
                            if (ev.id == eventId) ev.is_favorite = result.is_favorite ? 1 : 0;
                        });
                    }
                });

                // Re-sync favorites array
                eventsData.favorites = eventsData.all.filter(e => parseInt(e.is_favorite) === 1);
                
                // Update UI components
                const cards = document.querySelectorAll(`.event-card[data-id="${eventId}"]`);
                cards.forEach(cardItem => {
                    const favIcon = cardItem.querySelector('.favorite-btn');
                    if (favIcon) {
                        if (result.is_favorite) {
                            favIcon.classList.add('active');
                        } else {
                            favIcon.classList.remove('active');
                        }
                    }
                });

                if (typeof updateCartUI === 'function') {
                    updateCartUI();
                }
            }

            showNotification(result.message, 'success');
        }
    } catch (error) {
        console.error('Favorite toggle error:', error);
        showNotification('Failed to update favorite', 'error');
    }
}

// Smooth scroll for navigation
function initSmoothScroll() {
  const links = document.querySelectorAll('a[href^="#"]');
  links.forEach(link => {
    link.addEventListener('click', (e) => {
      const href = link.getAttribute('href');
      if (href !== '#') {
        e.preventDefault();
        const target = document.querySelector(href);
        if (target) {
          target.scrollIntoView({ behavior: 'smooth' });
        }
      }
    });
  });
}

// Header scroll effect
function initHeaderScroll() {
  const header = document.querySelector('.header');
  window.addEventListener('scroll', () => {
    const currentScroll = window.pageYOffset;
    if (header) {
      if (currentScroll > 100) {
        header.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
      } else {
        header.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)';
      }
    }
  });
}

/**
 * Slider Logic for smooth animations
 */
function initializeSlider(gridId) {
    const grid = document.getElementById(gridId);
    if (!grid) return;

    const cards = Array.from(grid.children);
    if (cards.length < 4) return; // Not enough cards for a continuous loop visually

    // Clone the items to create a seamless infinite loop
    cards.forEach(card => {
        const clone = card.cloneNode(true);
        // remove IDs if any were present to avoid duplicates
        clone.removeAttribute('id');
        grid.appendChild(clone);
    });

    let isPaused = false;
    let animationFrameId;

    const slide = () => {
        if (!isPaused) {
            grid.scrollLeft += 1; // Pan speed
            
            // Loop point is exactly half of the new scrollWidth
            if (grid.scrollLeft >= grid.scrollWidth / 2) {
                grid.scrollLeft = 0;
            }
        }
        animationFrameId = requestAnimationFrame(slide);
    };

    grid.addEventListener('mouseenter', () => isPaused = true);
    grid.addEventListener('mouseleave', () => isPaused = false);
    
    // Mobile Touch Support
    grid.addEventListener('touchstart', () => isPaused = true, { passive: true });
    grid.addEventListener('touchend', () => { setTimeout(() => isPaused = false, 1000) }, { passive: true });

    // Start auto slide
    slide();
}


// Initialize all functions
async function init() {
  // 1. Initialize Auth Controller First
  await authController.init();
    // Initialize dynamic components
    loadEvents().then(() => {
        initializeSlider('hot-events-grid');
    });
    initMobileMenu();
    initUserIcon();
    initEnhancedSearch();
    initEventModal();
    initSmoothScroll();
    initHeaderScroll();
    if (typeof initGoogleAuth === 'function') initGoogleAuth();
  if (typeof initUserLogin === 'function') initUserLogin();
  
  // Real-time synchronization (60s polling for events)
  setInterval(() => {
    const globalSearch = document.getElementById('globalSearch');
    if (!globalSearch || !globalSearch.value.trim()) {
      loadEvents();
    }
  }, 60000);
}

// Event modal functionality
function initEventModal() {
  const modal = document.getElementById('eventDetailsModal');
  const closeBtn = document.getElementById('closeEventModal');

  if (closeBtn) {
    closeBtn.addEventListener('click', closeEventModal);
  }

  if (modal) {
    // Close on backdrop click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeEventModal();
      }
    });
  }

  // Add click event to all event cards (delegated)
  document.addEventListener('click', (e) => {
    const eventCard = e.target.closest('.event-card');
    if (eventCard && !e.target.closest('.favorite-icon')) {
      const eventId = eventCard.dataset.id;
      showEventModal(eventId);
    }
  });
}

function showEventModal(eventId) {
  const event = allEvents.find(e => e.id == eventId);
  if (!event) {
    console.error('Event not found:', eventId);
    return;
  }

  // Populate modal
  const modal = document.getElementById('eventDetailsModal');
  const modalImage = document.getElementById('modalEventImage');
  if (modalImage) {
      const relPath = event.image_path ? event.image_path.replace(/^\/+/, '') : null;
      const fallback = 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800&h=500&fit=crop';
      const basePath = typeof getBasePath === 'function' ? getBasePath() : '/';
      const resolvedPath = relPath ? (relPath.startsWith('http') ? relPath : basePath + relPath) : null;
      modalImage.src = encodeURI(resolvedPath || event.absolute_image_url || fallback);
      modalImage.loading = 'lazy';
      modalImage.onerror = () => { modalImage.src = fallback; };
  }
  if (document.getElementById('modalEventTitle')) document.getElementById('modalEventTitle').textContent = event.event_name;
  if (document.getElementById('modalEventOrganizer')) document.getElementById('modalEventOrganizer').textContent = `Organized by ${event.organizer_name || event.client_name || 'Eventra'}`;
  if (document.getElementById('modalEventDate')) document.getElementById('modalEventDate').textContent = new Date(event.event_date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  if (document.getElementById('modalEventTime')) document.getElementById('modalEventTime').textContent = event.event_time || 'TBA';
  const full_address = `${event.address || ''}, ${event.city || ''}, ${event.state || ''}`.replace(/^, /, '').replace(/, , /g, ', ').trim() || 'Nigeria';
  if (document.getElementById('modalEventLocation')) document.getElementById('modalEventLocation').textContent = full_address;
  if (document.getElementById('modalEventDescription')) document.getElementById('modalEventDescription').textContent = event.description || 'No description available';
  if (document.getElementById('modalEventCategory')) document.getElementById('modalEventCategory').textContent = event.category || event.event_type || 'General';
  const modalPrice = !event.price || parseFloat(event.price) === 0 ? 'Free' : `₦${parseFloat(event.price).toLocaleString()}`;
  if (document.getElementById('modalEventPrice')) document.getElementById('modalEventPrice').textContent = modalPrice;

  // Priority badge
  const priorityBadge = document.getElementById('modalPriorityBadge');
  if (event.priority) {
    priorityBadge.textContent = event.priority.toUpperCase();
    priorityBadge.style.display = 'block';
    if (event.priority === 'hot') {
      priorityBadge.style.background = 'linear-gradient(135deg, #ff4757, #ff6348)';
      priorityBadge.style.color = 'white';
    } else if (event.priority === 'trending') {
      priorityBadge.style.background = 'linear-gradient(135deg, #3742fa, #5f27cd)';
      priorityBadge.style.color = 'white';
    } else if (event.priority === 'featured') {
      priorityBadge.style.background = 'linear-gradient(135deg, #2ed573, #1abc9c)';
      priorityBadge.style.color = 'white';
    }
  } else {
    priorityBadge.style.display = 'none';
  }

  // Buy ticket button
  const buyTicketBtn = document.getElementById('bookNowBtn');
  if (buyTicketBtn) {
    buyTicketBtn.onclick = () => {
      closeEventModal();
      window.location.href = `checkout.html?id=${event.id}&quantity=1`;
    };
  }

  // Show modal
  modal.classList.add('active');
  document.body.style.overflow = 'hidden';  // Prevent background scrolling
}

function closeEventModal() {
  const modal = document.getElementById('eventDetailsModal');
  modal.classList.remove('active');
  document.body.style.overflow = '';  // Re-enable scrolling
}

// Update the viewEventDetails function to work with modal
function viewEventDetails(tag) {
  if (!tag) {
      showNotification('Event tag missing', 'error');
      return;
  }
  closeEventModal();  // Close modal first
  window.location.href = `pages/event-details.html?event=${tag}`;
}


// Run when DOM is loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Make shareEvent available globally
window.shareEvent = shareEvent;
window.viewEventDetails = viewEventDetails;
// User login from homepage modal
async function initUserLogin() {
    const loginForm = document.getElementById('userLoginForm');
    const loginBtn = document.getElementById('userLoginBtn');

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const email = document.getElementById('userEmail').value;
            const password = document.getElementById('userPassword').value;
            
            const originalBtnText = loginBtn.innerHTML;
            loginBtn.disabled = true;
            loginBtn.innerHTML = '<span class="spinner" style="width: 18px; height: 18px; border: 2px solid #fff; border-top-color: transparent; border-radius: 50%; display: inline-block; animation: spin 0.8s linear infinite;"></span> Logging in...';

            try {
                const response = await apiFetch('../../api/auth/login.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        email: email,
                        password: password,
                        intent: 'user'
                    })
                });

                if (!response) throw new Error('No response from server');

                const result = await response.json();
                if (result.success) {
                    const keys = typeof getRoleKeys === 'function' ? getRoleKeys() : { user: 'user', token: 'auth_token' };
                    if (window.storage) {
                        window.storage.set(keys.user, result.user);
                        window.storage.set(keys.token, result.user.token);
                    }
                    showNotification('Sign in successful!', 'success');
                    
                    setTimeout(() => {
                        const redirectUrl = result.redirect || 'index.html';
                        window.location.href = redirectUrl.includes('://') ? redirectUrl : '../../' + redirectUrl.replace(/^\//, '');
                    }, 1500);
                } else {
                    showNotification(result.message || 'Login failed', 'error');
                    loginBtn.disabled = false;
                    loginBtn.innerHTML = originalBtnText;
                }
            } catch (error) {
                console.error('Login error:', error);
                showNotification('An error occurred. Please try again.', 'error');
                loginBtn.disabled = false;
                loginBtn.innerHTML = originalBtnText;
            }
        });
    }
}
// Cart/Favorites View Logic
function toggleCartView() {
    const modal = document.getElementById('cartSideModal');
    if (modal) {
        modal.classList.toggle('open');
        if (modal.classList.contains('open')) {
            updateCartUI();
        }
    }
}

function updateCartUI() {
    const cartItemsGrid = document.getElementById('cartItemsGrid');
    const cartEmptyState = document.getElementById('cartEmptyState');
    const cartBadge = document.getElementById('cartBadge');
    const cartModalFooter = document.getElementById('cartModalFooter');
    
    if (!cartItemsGrid || !cartEmptyState) return;
    
    // Favorites are our "cart items"
    const favorites = eventsData.favorites || [];
    
    // Update Badge
    if (cartBadge) {
        if (favorites.length > 0) {
            cartBadge.textContent = favorites.length;
            cartBadge.style.display = 'flex';
        } else {
            cartBadge.style.display = 'none';
        }
    }
    
    if (favorites.length === 0) {
        cartEmptyState.style.display = 'block';
        cartItemsGrid.innerHTML = '';
        if (cartModalFooter) cartModalFooter.style.display = 'none';
    } else {
        cartEmptyState.style.display = 'none';
        if (cartModalFooter) cartModalFooter.style.display = 'block';
        
        cartItemsGrid.innerHTML = favorites.map(event => {
            const price = !event.price || parseFloat(event.price) === 0 ? 'Free' : `₦${parseFloat(event.price).toLocaleString()}`;
            const relPath = event.image_path ? event.image_path.replace(/^\/+/, '') : null;
            const fallback = 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=100&h=100&fit=crop';
            const basePath = typeof getBasePath === 'function' ? getBasePath() : '/';
            const resolvedPath = relPath ? (relPath.startsWith('http') ? relPath : basePath + relPath) : null;
            const eventImage = encodeURI(resolvedPath || event.absolute_image_url || fallback);
            
            return `
                <div class="cart-item">
                    <img src="${eventImage}" alt="${escapeHTML(event.event_name)}" class="cart-item-img" onerror="this.src='${fallback}'">
                    <div class="cart-item-info">
                        <div class="cart-item-title">${escapeHTML(event.event_name)}</div>
                        <div class="cart-item-price">${price}</div>
                    </div>
                    <button class="cart-item-remove" onclick="toggleFavorite(event, ${event.id})" title="Remove from favorites">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                    </button>
                </div>
            `;
        }).join('');
    }
}

function proceedToPayment() {
    const favorites = eventsData.favorites || [];
    if (favorites.length === 0) {
        showNotification('Your cart is empty', 'info');
        return;
    }
    
    // For now, redirect to checkout of the first item, or a bulk checkout if supported
    // Since the system seems designed for single event checkout:
    const firstEvent = favorites[0];
    window.location.href = `checkout.html?id=${firstEvent.id}&quantity=1`;
}

// Make functions global
window.toggleCartView = toggleCartView;
window.proceedToPayment = proceedToPayment;

// Make functions global
window.toggleCartView = toggleCartView;
window.proceedToPayment = proceedToPayment;

// Initial cart UI update
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', updateCartUI);
} else {
    updateCartUI();
}
