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
      
      // Discovery logic
      initDiscoveryFilters();
      applyFilters();
    } else {
      console.error('Failed to load events:', result.message);
      renderDiscovery([]);
    }
  } catch (error) {
    console.error('Error loading events:', error);
    renderDiscovery([]);
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
  const isPassed = new Date(event.event_date) < new Date();
  const status = isPassed ? 'passed' : (event.sold_out ? 'sold-out' : 'upcoming');
  const statusLabel = isPassed ? 'Passed' : (event.sold_out ? 'Sold Out' : 'Upcoming');
  const statusColor = isPassed ? '#6b7280' : (event.sold_out ? '#ef4444' : '#10b981');
  
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
    <div class="event-card modern-card" data-id="${event.id}" data-status="${status}" onclick="showEventModal(${event.id})">
      <div class="card-image-wrapper">
        <img src="${eventImage}" alt="${eventName}" loading="lazy" class="card-main-img" onerror="this.src='${fallback}'">
        <div class="card-badge-top" style="background: ${statusColor};">${statusLabel}</div>
        <div class="card-category-tag">${category}</div>
      </div>
      
      <div class="card-body">
        <div class="card-meta-top">
          <span class="card-date">${new Date(event.event_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
          <span class="card-dot"></span>
          <span class="card-time">${eventTime}</span>
        </div>
        
        <h3 class="card-title">${eventName}</h3>
        
        <div class="card-location">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>
          </svg>
          <span class="location-truncate">${escapeHTML(full_address)}</span>
        </div>

        <div class="card-footer-modern">
          <div class="card-organizer-info">
            <span class="organizer-name-tiny">By ${organizer}</span>
            ${event.is_verified == 1 ? '<span class="verified-check" title="Verified">✓</span>' : ''}
          </div>
          
          <div class="card-price-display">
             ${price.toLowerCase() === 'free' ? '<span class="price-free">Free</span>' : `<span class="price-amount">${price}</span>`}
          </div>
        </div>

        <div class="card-hover-actions">
          ${!isPassed ? `
            <button class="action-btn-circle fav-btn ${isFavorite}" onclick="toggleFavorite(event, ${event.id}); event.stopPropagation();" title="Favorite">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="${isFavorite ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
              </svg>
            </button>
          ` : ''}
          <button class="action-btn-circle share-btn" onclick="shareEvent(event, ${event.id}, '${escapeHTML(shareTitle)}', '${escapeHTML(shareText)}'); event.stopPropagation();" title="Share">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path><polyline points="16 6 12 2 8 6"></polyline><line x1="12" y1="2" x2="12" y2="15"></line>
            </svg>
          </button>
        </div>
      </div>
    </div>
  `;
}

// Toggle Sidebar Sections
function toggleSidebarSection(id) {
  const content = document.getElementById(id);
  const header = content.previousElementSibling;
  const chevron = header.querySelector('.chevron-icon');
  
  const isExpanded = content.classList.toggle('expanded');
  chevron.classList.toggle('rotated', isExpanded);
}

// Hardcoded Filter Lists
const NIGERIA_STATES = [
  'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue', 'Borno', 
  'Cross River', 'Delta', 'Ebonyi', 'Edo', 'Ekiti', 'Enugu', 'Gombe', 'Imo', 'Jigawa', 
  'Kaduna', 'Kano', 'Katsina', 'Kebbi', 'Kogi', 'Kwara', 'Lagos', 'Nasarawa', 'Niger', 
  'Ogun', 'Ondo', 'Osun', 'Oyo', 'Plateau', 'Rivers', 'Sokoto', 'Taraba', 'Yobe', 'Zamfara', 'FCT'
];

const EVENT_CATEGORIES = [
  'Conference', 'Workshop', 'Seminar', 'Entertainment', 'Sports', 'Exhibition', 
  'Networking', 'Festival', 'Social', 'Educational', 'Personal', 'Religious', 
  'Cultural', 'Community', 'Concert', 'Other'
];

const PRIORITY_TAGS = ['nearby', 'hot', 'upcoming', 'trending', 'featured'];

// Redesigned discovery rendering
function renderDiscovery(events = eventsData.all) {
  const container = document.getElementById('all-events-grid');
  const countEl = document.getElementById('resultsCount');
  
  if (!container) return;
  
  if (events.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="grid-column: 1/-1; padding: 4rem; text-align: center; color: var(--text-muted); width: 100%;">
        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom: var(--space-md);">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
        </svg>
        <h3>No matching events found</h3>
        <p>Try adjusting your filters or search terms.</p>
      </div>
    `;
    if (countEl) countEl.textContent = '0 events found';
    return;
  }

  container.innerHTML = events.map(event => createEventCard(event)).join('');
  if (countEl) countEl.textContent = `${events.length} events found`;
}

// Filter Initialization
function initDiscoveryFilters() {
  // Populate UI with hardcoded lists
  const populate = (id, items) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = items.map(item => `
      <label class="checkbox-item">
        <input type="checkbox" value="${item.toLowerCase()}" data-group="${id}">
        <span>${item}</span>
      </label>
    `).join('');
  };

  populate('stateFilters', NIGERIA_STATES);
  populate('categoryFilters', EVENT_CATEGORIES);
  populate('priorityFilters', PRIORITY_TAGS.map(p => p.charAt(0).toUpperCase() + p.slice(1)));

  // Add event listeners
  const inputs = document.querySelectorAll('.filter-sidebar input, .filter-sidebar select, #sortBy');
  inputs.forEach(input => {
    input.addEventListener('change', applyFilters);
  });

  document.getElementById('resetFilters')?.addEventListener('click', () => {
    inputs.forEach(i => {
      if (i.type === 'checkbox') i.checked = false;
      else if (i.type === 'text') i.value = '';
    });
    applyFilters();
  });
}

function toggleSidebarSection(sectionId) {
    const content = document.getElementById(sectionId);
    const header = content?.previousElementSibling;
    const chevron = header?.querySelector('.chevron-icon');
    
    if (content) {
        content.classList.toggle('expanded');
        if (chevron) {
            chevron.classList.toggle('rotated');
        }
    }
}

function applyFilters() {
  const searchQuery = document.getElementById('globalSearch')?.value.toLowerCase() || '';
  
  const selectedStates = Array.from(document.querySelectorAll('#stateFiltersWrapper input:checked')).map(i => i.value);
  const selectedCategories = Array.from(document.querySelectorAll('#categoryFiltersWrapper input:checked')).map(i => i.value);
  const selectedPriorities = Array.from(document.querySelectorAll('#priorityFiltersWrapper input:checked')).map(i => i.value);
  
  const freeOnly = document.getElementById('freeOnlyToggle')?.checked;

  const filtered = allEvents.filter(event => {
    // 1. Global Search
    const matchesSearch = !searchQuery || 
      event.event_name.toLowerCase().includes(searchQuery) ||
      (event.description && event.description.toLowerCase().includes(searchQuery));

    // 2. State Filter (OR within group)
    const matchesState = selectedStates.length === 0 || (event.state && selectedStates.includes(event.state.toLowerCase()));
    
    // 3. Category Filter (OR within group)
    const matchesCategory = selectedCategories.length === 0 || 
      selectedCategories.includes((event.category || event.event_type || 'General').toLowerCase());
    
    // 4. Priority Filter (OR within group - requirement: show events matching any selected priority)
    const matchesPriority = selectedPriorities.length === 0 || (event.priority && selectedPriorities.includes(event.priority.toLowerCase()));
    
    // 5. Price Filter
    const isFree = !event.price || parseFloat(event.price.toString().replace(/[^0.00-9.99]/g, '')) === 0;
    const matchesPrice = !freeOnly || isFree;

    // Logic: AND across different groups
    return matchesSearch && matchesState && matchesCategory && matchesPriority && matchesPrice;
  });

  // Sorting logic
  const sortBy = document.getElementById('sortBy')?.value;
  
  const getPrice = (p) => {
    if (!p || p.toString().toLowerCase() === 'free') return 0;
    return parseFloat(p.toString().replace(/[^0-9.]/g, '')) || 0;
  };

  if (sortBy === 'price-low') {
    filtered.sort((a, b) => getPrice(a.price) - getPrice(b.price));
  } else if (sortBy === 'price-high') {
    filtered.sort((a, b) => getPrice(b.price) - getPrice(a.price));
  } else if (sortBy === 'newest') {
    filtered.sort((a, b) => new Date(b.event_date) - new Date(a.event_date));
  } else if (sortBy === 'oldest') {
    filtered.sort((a, b) => new Date(a.event_date) - new Date(b.event_date));
  }

  renderDiscovery(filtered);
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

  // Buy ticket button logic
  const buyTicketBtn = document.getElementById('bookNowBtn');
  const isPassed = new Date(event.event_date) < new Date();
  
  if (buyTicketBtn) {
    if (isPassed) {
      buyTicketBtn.textContent = 'Event Ended';
      buyTicketBtn.disabled = true;
      buyTicketBtn.style.background = '#6b7280';
      buyTicketBtn.style.cursor = 'not-allowed';
      buyTicketBtn.onclick = null;
    } else {
      buyTicketBtn.textContent = 'Get Tickets';
      buyTicketBtn.disabled = false;
      buyTicketBtn.style.background = ''; // Revert to default
      buyTicketBtn.style.cursor = 'pointer';
      buyTicketBtn.onclick = () => {
        closeEventModal();
        window.location.href = `checkout.html?id=${event.id}&quantity=1`;
      };
    }
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
function toggleCartView(e) {
    if (e) e.stopPropagation();
    const dropdown = document.getElementById('cartDropdown');
    if (dropdown) {
        dropdown.classList.toggle('show');
        if (dropdown.classList.contains('show')) {
            updateCartUI();
            
            // Close dropdown when clicking outside
            const closeHandler = (event) => {
                if (!dropdown.contains(event.target) && !document.getElementById('cartIconContainer').contains(event.target)) {
                    dropdown.classList.remove('show');
                    document.removeEventListener('click', closeHandler);
                }
            };
            document.addEventListener('click', closeHandler);
        }
    }
}

function updateCartUI() {
    const cartItemsContainer = document.getElementById('cartItemsContainer');
    const cartBadge = document.getElementById('cartBadge');
    const cartFooter = document.getElementById('cartFooter');
    const cartTotalCount = document.getElementById('cartTotalCount');
    
    if (!cartItemsContainer) return;
    
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

    if (cartTotalCount) {
        cartTotalCount.textContent = favorites.length;
    }
    
    if (favorites.length === 0) {
        cartItemsContainer.innerHTML = `
            <div class="empty-cart-message">
                <p>Your favorites list is empty</p>
            </div>
        `;
        if (cartFooter) cartFooter.style.display = 'none';
    } else {
        if (cartFooter) cartFooter.style.display = 'block';
        
        // Clear and render items
        cartItemsContainer.innerHTML = favorites.map(event => {
            const price = !event.price || parseFloat(event.price) === 0 ? 'Free' : `₦${parseFloat(event.price).toLocaleString()}`;
            const relPath = event.image_path ? event.image_path.replace(/^\/+/, '') : null;
            const fallback = 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=100&h=100&fit=crop';
            const basePath = typeof getBasePath === 'function' ? getBasePath() : '/';
            const resolvedPath = relPath ? (relPath.startsWith('http') ? relPath : basePath + relPath) : null;
            const eventImage = encodeURI(resolvedPath || event.absolute_image_url || fallback);
            
            let eventDate = 'Date TBA';
            if (event.event_date) {
                const d = new Date(event.event_date);
                if (!isNaN(d.getTime())) {
                    eventDate = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                }
            }

            return `
                <div class="cart-item" onclick="event.stopPropagation(); showEventModal(${event.id})">
                    <img src="${eventImage}" alt="${escapeHTML(event.event_name)}" class="cart-item-img" onerror="this.src='${fallback}'">
                    <div class="cart-item-info">
                        <div class="cart-item-title">${escapeHTML(event.event_name)}</div>
                        <div style="font-size: 0.75rem; color: #64748b; margin-bottom: 0.25rem;">${eventDate} • ${escapeHTML(event.city || 'Online')}</div>
                        <div class="cart-item-price">${price}</div>
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                        <button class="cart-item-remove" onclick="toggleFavorite(event, ${event.id})" title="Remove">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                            </svg>
                        </button>
                        <button class="checkout-mini-btn" onclick="proceedToPayment(event, ${event.id})" title="Checkout">
                            <span class="btn-icon">
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M5 12h14m-4-4 4 4-4 4"/>
                                </svg>
                            </span>
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        // Add Checkout All button to footer if not already present
        if (cartFooter && !cartFooter.querySelector('.checkout-btn')) {
            const checkoutAllBtn = document.createElement('button');
            checkoutAllBtn.className = 'checkout-btn';
            checkoutAllBtn.textContent = 'Checkout All';
            checkoutAllBtn.onclick = (e) => {
                e.stopPropagation();
                proceedToPayment(null);
            };
            cartFooter.appendChild(checkoutAllBtn);
        }
    }
}

function clearFavorites(e) {
    if (e) e.stopPropagation();
    Swal.fire({
        title: 'Clear all favorites?',
        text: "This will remove all events from your favorites list.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#FF5A5F',
        cancelButtonColor: '#94a3b8',
        confirmButtonText: 'Yes, clear all'
    }).then((result) => {
        if (result.isConfirmed) {
            // In a real app, we'd call an API to clear all. 
            // Here we'll toggle them one by one for simplicity if no bulk API exists.
            const favorites = [...eventsData.favorites];
            favorites.forEach(async (event) => {
                await toggleFavorite(null, event.id);
            });
            showNotification('Favorites cleared', 'success');
        }
    });
}

function proceedToPayment(e, eventId) {
    if (e) e.stopPropagation();
    const favorites = eventsData.favorites || [];
    if (favorites.length === 0) {
        showNotification('Your favorites list is empty', 'info');
        return;
    }
    
    // If eventId is provided, proceed with that specific event
    // Otherwise, proceed with the first event in the list (legacy/simple behavior)
    const targetId = eventId || favorites[0].id;
    window.location.href = `payment.html?event_id=${targetId}&quantity=1`;
}

// Make functions global
window.toggleCartView = toggleCartView;
window.proceedToPayment = proceedToPayment;
window.clearFavorites = clearFavorites;

// Initial cart UI update
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', updateCartUI);
} else {
    updateCartUI();
}
