// Event data - will be loaded from API
let eventsData = {
  hot: [],
  trending: [],
  featured: [],
  upcoming: [],
  nearby: [],
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
      const user = storage.get(keys.user) || storage.get('user');
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
  const userIcon = document.querySelector('.user-icon');
  const userProfileBtn = document.getElementById('userProfileBtn');
  const profileDropdown = document.getElementById('profileDropdown');
  const viewProfile = document.getElementById('viewProfile');
  const logoutBtn = document.getElementById('logoutBtn');
  const profileSideModal = document.getElementById('profileSideModal');
  const closeProfileModal = document.getElementById('closeProfileModal');
  const profileEditForm = document.getElementById('profileEditForm');
  const loginModal = document.getElementById('loginModal');
  const closeLoginModal = document.getElementById('closeLoginModal');
  
  // Check if logged in and update display
  const defaultUserIcon = document.getElementById('defaultUserIcon');
  const userProfileImg = document.getElementById('userProfileImg');
  const userOnlineStatus = document.querySelector('.user-online-status');
  
  // Handlers declared once for potential cleanup or multiple init calls
  const setupUI = () => {
    const keys = typeof getRoleKeys === 'function' ? getRoleKeys() : { user: 'user' };
    const user = storage.get(keys.user) || storage.get('user');

    if (isAuthenticated() && user && typeof user === 'object') {
      // Show profile image, hide default SVG
      if (userProfileImg) {
          userProfileImg.src = user.profile_pic || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name || 'User')}&background=FF5A5F&color=fff&size=128`;
          userProfileImg.title = `Logged in as ${user.name}`;
          userProfileImg.style.display = 'block';
      }
      if (defaultUserIcon) defaultUserIcon.style.display = 'none';
      if (userOnlineStatus) userOnlineStatus.style.display = 'block';
    } else {
      // Revert to guest UI if not authenticated or user data missing
      if (userProfileImg) userProfileImg.style.display = 'none';
      if (defaultUserIcon) defaultUserIcon.style.display = 'block';
      if (userOnlineStatus) userOnlineStatus.style.display = 'none';
    }
  };

  // Initial UI setup based on localStorage
  setupUI();

  // Listen for session sync resulting in state change (e.g. stale session cleared)
  window.addEventListener('sessionSyncComplete', () => {
    setupUI();
  }, { once: true }); // We only need the initial sync for the first load logic

  if (isAuthenticated()) {
    
    // Toggle dropdown
    if (userProfileBtn) {
      userProfileBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        profileDropdown.classList.toggle('show');
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
          title: 'Are you sure?',
          text: "You will be logged out of your session!",
          icon: 'warning',
          showCancelButton: true,
          confirmButtonColor: '#ff5a5f',
          cancelButtonColor: '#9ca3af',
          confirmButtonText: 'Yes, logout!',
          background: 'rgba(30, 41, 59, 0.95)',
          color: '#fff'
        });

        if (!result.isConfirmed) return;

        try {
          const response = await apiFetch('../../api/auth/logout.php');
          const result = await response.json();
          if (result.success) {
            // Clear all possible user keys
            storage.remove('user');
            storage.remove('auth_token');
            storage.remove('client_user');
            storage.remove('client_auth_token');
            storage.remove('admin_user');
            storage.remove('admin_auth_token');
            location.reload();
          }
        } catch (error) {
          console.error('Logout error:', error);
          storage.remove('user');
          storage.remove('auth_token');
          location.reload();
        }
      });
    }

    // Modal logic
    if (viewProfile) {
      viewProfile.addEventListener('click', (e) => {
        e.preventDefault();
        profileDropdown.classList.remove('show');
        
        const keys = typeof getRoleKeys === 'function' ? getRoleKeys() : { user: 'user' };
        const user = storage.get(keys.user) || storage.get('user');
        if (!user) {
          showNotification('User profile not found. Please log in again.', 'info');
          if (loginModal) {
              loginModal.style.display = 'flex';
              setTimeout(() => loginModal.classList.add('show'), 10);
          }
          return;
        }
        document.getElementById('modalProfilePic').src = user.profile_pic || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name || 'User')}&background=FF5A5F&color=fff&size=128`;
        document.getElementById('profileName').value = user.name || '';
        document.getElementById('profileEmail').value = user.email || '';
        document.getElementById('profilePhone').value = user.phone || '';
        document.getElementById('profileState').value = user.state || '';
        document.getElementById('profileCity').value = user.city || '';
        document.getElementById('profileAddress').value = user.address || '';
        
        profileSideModal.classList.add('open');
      });
    }

    if (closeProfileModal) {
      closeProfileModal.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        profileSideModal.classList.remove('open');
      });
    }

    if (profileEditForm) {
      profileEditForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(profileEditForm);
        
        try {
          const response = await apiFetch('../../api/users/update-profile.php', {
            method: 'POST',
            body: formData
          });
          const result = await response.json();
          
          if (result.success) {
            storage.set(keys.user, result.user);
            showNotification('Profile updated successfully!', 'success');
            profileSideModal.classList.remove('open');
            
            // Instantly update UI without reload
            const userProfileImg = document.getElementById('userProfileImg');
            const modalProfilePic = document.getElementById('modalProfilePic');
            if (userProfileImg) userProfileImg.src = result.user.profile_pic || `https://ui-avatars.com/api/?name=${encodeURIComponent(result.user.name)}&background=FF5A5F&color=fff&size=128`;
            if (modalProfilePic) modalProfilePic.src = result.user.profile_pic || `https://ui-avatars.com/api/?name=${encodeURIComponent(result.user.name)}&background=FF5A5F&color=fff&size=128`;
            
            initUserIcon(); // Refresh icons and labels
          } else {
            showNotification(result.message || 'Error updating profile', 'error');
          }
        } catch (error) {
          console.error('Update profile error:', error);
          showNotification('System error occurred', 'error');
        }
      });
    }
    
    } else {
        // If not logged in, clicking should show the centered login modal
        if (userProfileBtn) {
            userProfileBtn.addEventListener('click', () => {
                if (loginModal) {
                    loginModal.style.display = 'flex';
                    setTimeout(() => loginModal.classList.add('show'), 10);
                }
            });
        }
        
        if (closeLoginModal) {
            closeLoginModal.addEventListener('click', () => {
                if (loginModal) {
                    loginModal.classList.remove('show');
                    setTimeout(() => loginModal.style.display = 'none', 300);
                }
            });
        }
        
        // Close on backdrop click
        window.addEventListener('click', (e) => {
            if (e.target === loginModal) {
                loginModal.classList.remove('show');
                setTimeout(() => loginModal.style.display = 'none', 300);
            }
        });

        // Trigger Login Modal if redirected from checkout.html
        if (sessionStorage.getItem('redirect_after_login')) {
            if (loginModal) {
                loginModal.style.display = 'flex';
                setTimeout(() => loginModal.classList.add('show'), 10);
            }
        }
    }
}

// Google Auth Logic for Homepage
async function initGoogleAuth() {
    if (isAuthenticated()) return;

    try {
        const basePath = getBasePath();
        const response = await apiFetch(basePath + 'api/config/get-google-config.php');
        const data = await response.json();


        if (data.success && data.client_id) {
            // Check if google is defined
            let attempts = 0;
            const checkGoogle = setInterval(() => {
                if (typeof google !== 'undefined') {
                    clearInterval(checkGoogle);
                    try {
                        google.accounts.id.initialize({
                            client_id: data.client_id,
                            callback: handleGoogleCredentialResponse,
                            auto_select: false,
                            cancel_on_tap_outside: true,
                        });

                        const container = document.getElementById('googleSignInContainer');
                        if (container) {
                            google.accounts.id.renderButton(container, {
                                type: 'standard',
                                theme: 'outline',
                                size: 'large',
                                text: 'signin_with',
                                shape: 'rectangular',
                                logo_alignment: 'left',
                                width: '320'
                            });
                        }
                    } catch(e) { console.error('Error rendering Google button:', e); }
                } else {
                    attempts++;
                    if (attempts > 50) {
                        clearInterval(checkGoogle);
                        console.error('Google GSI script not loaded');
                    }
                }
            }, 100);
        } else {
            console.error('Failed to load Google config:', data.message);
        }
    } catch (error) {
        console.error('Google Auth Init Error:', error);
    }
}

async function handleGoogleCredentialResponse(response) {
    try {
        console.log('Google callback received, showing toast...');
        showNotification('Getting Google information...', 'info');
        
        // Show loading state in the container
        const container = document.getElementById('googleSignInContainer');
        if (container) {
            container.innerHTML = `
                <div style="display: flex; align-items: center; gap: 10px; color: #fff; background: rgba(255,255,255,0.1); padding: 10px 20px; border-radius: 8px;">
                    <div class="spinner" style="width: 20px; height: 20px; border: 2px solid #fff; border-top-color: transparent; border-radius: 50%; animation: spin 0.8s linear infinite;"></div>
                    <span>Signing in...</span>
                </div>
            `;
        }

        const basePath = getBasePath();
        const res = await apiFetch(basePath + 'api/auth/google-handler.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                credential: response.credential,
                intent: 'user'
            })
        });


        const result = await res.json();

        if (result.success) {
            const keys = typeof getRoleKeys === 'function' ? getRoleKeys() : { user: 'user', token: 'auth_token' };
            storage.set(keys.user, result.user);
            storage.set(keys.token, result.user.token);
            
            showNotification('Google Sign-in successful!', 'success');
            
            setTimeout(() => {
                const redirectUrl = result.redirect || sessionStorage.getItem('redirect_after_login');
                if (redirectUrl) {
                    sessionStorage.removeItem('redirect_after_login');
                    // Ensure redirectUrl is correctly handled if it's relative
                    const finalTarget = redirectUrl.includes('://') ? redirectUrl : getBasePath() + redirectUrl.replace(/^\//, '');
                    window.location.href = finalTarget;
                } else {
                    location.reload(); // Refresh to update UI
                }
            }, 1000);

        } else {
            showNotification(result.message || 'Login failed', 'error');
            // Reset button
            initGoogleAuth();
        }
    } catch (error) {
        console.error('Google Response Error:', error);
        showNotification('An error occurred during Google Sign-in', 'error');
        initGoogleAuth();
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

// Search functionality
function initEnhancedSearch() {
  const globalSearch = document.getElementById('globalSearch');
  const searchButton = document.querySelector('.search-button-modern');
  const loader = document.getElementById('searchLoader');

  if (searchButton) {
    searchButton.addEventListener('click', () => performServerSearch(globalSearch?.value || ''));
  }

  const debouncedSearch = debounce((val) => performServerSearch(val), 400);

  if (globalSearch) {
    globalSearch.addEventListener('input', (e) => {
      const val = e.target.value.trim();
      if (loader) loader.style.display = 'block';
      debouncedSearch(val);
    });
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
    url.searchParams.set('q', query);

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
  const eventImage = escapeHTML(event.image_path) || 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=400&h=250&fit=crop';
  const eventDate = new Date(event.event_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const eventTime = escapeHTML(event.event_time) || 'TBA';
  const isFavorite = event.is_favorite ? 'active' : '';
  const eventName = escapeHTML(event.event_name);
  const category = escapeHTML(event.category) || 'Event';
  const city = escapeHTML(event.city) || '';
  const state = escapeHTML(event.state) || 'Nigeria';
  const desc = escapeHTML(event.description || '');
  const organizer = escapeHTML(event.organizer_name || event.client_name || 'Eventra');
  const priority = escapeHTML(event.priority || '');
  
  return `
    <div class="event-card" data-id="${event.id}" data-tag="${escapeHTML(event.tag) || event.id}" style="animation-delay: ${index * 0.1}s">
      <div class="event-image-container enhanced-hd">
        <img src="${eventImage}" alt="${eventName}" class="event-image">
        <div class="event-badges">
          <div class="event-category-badge">${category}</div>
          ${event.priority ? `
            <div class="event-status-badge">
              <span class="status-dot"></span>
              ${priority.toUpperCase()}
            </div>
          ` : ''}
        </div>
      </div>
      <div class="event-content">
        <div class="event-date-time">${eventDate} • ${eventTime}</div>
        <h3 class="event-title">${eventName}</h3>
        <div class="event-location">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
          ${city} ${state}
        </div>
        <p class="event-description">${desc.substring(0, 100)}${desc.length > 100 ? '...' : ''}</p>
        <div class="event-organizer">Organized by ${organizer}</div>

        
        <div class="event-footer">
          <span class="event-price">${price}</span>
          <div class="event-card-actions">
            <button class="card-action-btn favorite-btn ${isFavorite}" onclick="toggleFavorite(event, ${event.id})" title="Favorite">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
            </button>
            <button class="card-action-btn share-btn" onclick="shareEvent(event, ${event.id})" title="Share">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path><polyline points="16 6 12 2 8 6"></polyline><line x1="12" y1="2" x2="12" y2="15"></line></svg>
            </button>
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
  renderEventsGrid('trending-events-grid', eventsData.trending, 'No trending events at the moment');
  renderEventsGrid('featured-events-grid', eventsData.featured, 'No featured events at the moment');
  renderEventsGrid('upcoming-events-grid', eventsData.upcoming, 'No upcoming events at the moment');
  renderEventsGrid('nearby-events-grid', eventsData.nearby, 'No events found in your area at the moment');
}

// Share event function
function shareEvent(e, eventId) {
  if(e) e.stopPropagation();
  const shareUrl = `${window.location.origin}${window.location.pathname}?event=${eventId}`;
  if (navigator.share) {
    navigator.share({
      title: 'Check out this event!',
      text: 'I found this amazing event on Eventra',
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
            const card = document.querySelector(`.event-card[data-id="${eventId}"]`);
            if (card) {
                const favIcon = card.querySelector('.favorite-btn');
                if (result.is_favorite) {
                    favIcon.classList.add('active');
                } else {
                    favIcon.classList.remove('active');
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


// Initialize all functions
function init() {
  loadEvents();
  initMobileMenu();
  initUserIcon();
  initEnhancedSearch();
  initEventModal();
  initSmoothScroll();
  initHeaderScroll();
  initGoogleAuth();
  
  // Real-time synchronization (60s polling, only if not searching)
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
  document.getElementById('modalEventImage').src = event.image_path || 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800&h=500&fit=crop';
  document.getElementById('modalEventTitle').textContent = event.event_name;
  document.getElementById('modalEventOrganizer').textContent = `Organized by ${event.organizer_name || event.client_name || 'Eventra'}`;
  document.getElementById('modalEventDate').textContent = new Date(event.event_date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  document.getElementById('modalEventTime').textContent = event.event_time || 'TBA';
  document.getElementById('modalEventLocation').textContent = `${event.city || ''} ${event.state || 'Nigeria'}`.trim();
  document.getElementById('modalEventDescription').textContent = event.description || 'No description available';
  document.getElementById('modalEventCategory').textContent = event.category || 'General';
  const modalPrice = !event.price || parseFloat(event.price) === 0 ? 'Free' : `₦${parseFloat(event.price).toLocaleString()}`;
  document.getElementById('modalEventPrice').textContent = modalPrice;

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
