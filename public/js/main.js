// Event data - will be loaded from API
let eventsData = {
  hot: [],
  trending: [],
  featured: [],
  upcoming: [],
  nearby: [],
  favorites: [],
  all: [],
};

let allEvents = []; // Store all events for filtering
let swiperInstances = {}; // Store Swiper instances

// Pagination state
let currentPage = 1;

function getItemsPerPage() {
  const width = window.innerWidth;

  // Calculate grid columns based on minmax(300px, 1fr) with gap: 2rem
  const gapSize = 32; // 2rem in pixels
  const cardMinWidth = 300;
  const containerPadding = width >= 1024 ? 64 : width >= 768 ? 40 : 32;
  const availableWidth = width - containerPadding * 2;

  // Calculate columns that can fit based on available width
  let columns = Math.floor(
    (availableWidth + gapSize) / (cardMinWidth + gapSize),
  );
  columns = Math.max(1, Math.min(columns, 5)); // Between 1 and 5 columns

  // Show 4-5 complete rows to fill reasonable viewport space without excessive scrolling
  // This ensures better space utilization while keeping UX reasonable
  let rows = 5;
  if (width < 768) {
    rows = 4; // Fewer rows on mobile
  } else if (width < 1024) {
    rows = 4; // Fewer rows on tablet
  }

  // Calculate total items to display
  let itemsPerPage = columns * rows;

  return itemsPerPage;
}

let itemsPerPage = getItemsPerPage();
let filteredDiscoveryEvents = [];

// Load events from API
async function loadEvents() {
  const globalSearch = document.getElementById("globalSearch");
  if (globalSearch && globalSearch.value.trim() !== "") return; // Don't refresh data while search is active

  try {
    const response = await apiFetch(
      "/api/events/get-events.php?limit=150&offset=0",
    );
    const result = await response.json();
    if (result.success && result.events) {
      // Deduplicate events by ID and filter for published status
      const allFetchedEvents = result.events || [];
      const uniqueEvents = Array.from(
        new Map(allFetchedEvents.map((item) => [item.id, item])).values(),
      );
      const publishedEvents = uniqueEvents.filter(
        (event) => event.status === "published",
      );

      // Store all events for search functionality
      allEvents = publishedEvents;
      if (typeof window.allEventsData !== "undefined") {
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
      const keys =
        typeof getRoleKeys === "function" ? getRoleKeys() : { user: "user" };
      const user = window.storage
        ? window.storage.get(keys.user) || window.storage.get("user")
        : null;
      const userState = user?.state?.toLowerCase();
      const userCity = user?.city?.toLowerCase();

      const now = new Date();
      const upcomingEvents = publishedEvents.filter(
        (event) => new Date(event.event_date) >= now,
      );

      // Priority-based filtering
      eventsData.featured = sortByCreation([
        ...publishedEvents.filter((e) => e.priority === "featured"),
      ]);
      eventsData.hot = sortByCreation([
        ...publishedEvents.filter((e) => e.priority === "hot"),
      ]);
      eventsData.trending = sortByCreation([
        ...publishedEvents.filter((e) => e.priority === "trending"),
      ]);

      // Upcoming: strictly use priority 'upcoming' if available, otherwise fallback to future events
      const priorityUpcoming = publishedEvents.filter(
        (e) => e.priority === "upcoming",
      );
      if (priorityUpcoming.length > 0) {
        eventsData.upcoming = sortByCreation([...priorityUpcoming]);
      } else {
        eventsData.upcoming = upcomingEvents.sort(
          (a, b) => new Date(a.event_date) - new Date(b.event_date),
        );
      }

      // All Events: sorted by creation date
      eventsData.all = sortByCreation([...publishedEvents]);

      // Nearby: strictly use priority 'nearby' if available, otherwise fallback to location matches
      const priorityNearby = publishedEvents.filter(
        (e) => e.priority === "nearby",
      );

      if (userState || userCity) {
        const locationNearby = publishedEvents.filter((e) => {
          const eventState = e.state?.toLowerCase();
          const eventCity = e.city?.toLowerCase();
          const stateMatch =
            userState &&
            eventState &&
            (eventState.includes(userState) || userState.includes(eventState));
          const cityMatch =
            userCity &&
            eventCity &&
            (eventCity.includes(userCity) || userCity.includes(eventCity));
          return stateMatch || cityMatch;
        });

        // Combine priority-nearby and location-nearby, unique by id
        const combined = [...priorityNearby];
        locationNearby.forEach((le) => {
          if (!combined.find((pe) => pe.id === le.id)) combined.push(le);
        });
        eventsData.nearby = sortByCreation(combined);
      } else {
        eventsData.nearby = sortByCreation([...priorityNearby]);
      }

      // Favorites: events where is_favorite is 1
      eventsData.favorites = publishedEvents.filter(
        (e) => parseInt(e.is_favorite) === 1,
      );

      // Discovery logic
      initDiscoveryFilters();

      // Categorized Rendering with Cross-Category Deduplication
      renderAllCategories();

      // Update cart with favorites
      if (typeof updateCartUI === "function") {
        updateCartUI();
      }

      // Initialize Hero Background with a random event
      initHeroBackground();

      // Finally apply filters for the "All Discovery Results" grid
      applyFilters();
    } else {
      renderDiscovery([]);
    }
  } catch (error) {
    renderDiscovery([]);
  }
}

function initHeroBackground() {
  const heroSection = document.getElementById("home");
  const wrapper = document.getElementById("heroCarouselWrapper");
  if (!heroSection || !wrapper) return;

  // Pick a random event from all unique published events
  const eligibleEvents = allEvents.filter((e) => e.image_path);
  const randomEvent =
    eligibleEvents.length > 0
      ? eligibleEvents[Math.floor(Math.random() * eligibleEvents.length)]
      : null;

  const fallback =
    "https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=1920&h=1080&fit=crop";
  let eventImage = fallback;

  if (randomEvent) {
    eventImage =
      typeof getImageUrl === "function"
        ? getImageUrl(randomEvent.image_path)
        : randomEvent.image_path || fallback;
  }

  wrapper.innerHTML = `
        <div class="hero-slide-static">
            <img src="${eventImage}" alt="Event Background" class="hero-background" onerror="this.src='${fallback}'">
            <div class="hero-overlay"></div>
            <div class="hero-gradient"></div>
            <div class="hero-content">
                <h1 class="hero-title">Discover & Live Your Next Experience</h1>
                <p class="hero-subtitle">Find amazing events happening around you</p>
            </div>
        </div>
    `;

  // Remove any existing swiper navigation/pagination if they exist in the DOM
  const swiperControls = heroSection.querySelectorAll(
    ".swiper-pagination, .swiper-button-next, .swiper-button-prev",
  );
  swiperControls.forEach((el) => el.remove());

  // Remove swiper class to prevent JS initialization interference
  heroSection.classList.remove("swiper");
}

// Swiper Initialization Helper
function initSwiper(selector, uniqueId) {
  if (swiperInstances[uniqueId]) {
    swiperInstances[uniqueId].destroy(true, true);
  }

  swiperInstances[uniqueId] = new Swiper(selector, {
    slidesPerView: 1,
    spaceBetween: 20,
    navigation: {
      nextEl: `${selector} .swiper-button-next`,
      prevEl: `${selector} .swiper-button-prev`,
    },
    pagination: {
      el: `${selector} .swiper-pagination`,
      clickable: true,
      dynamicBullets: true,
    },
    breakpoints: {
      640: { slidesPerView: 2, spaceBetween: 20 },
      1024: { slidesPerView: 3, spaceBetween: 25 },
      1280: { slidesPerView: 4, spaceBetween: 30 },
    },
    observer: true,
    observeParents: true,
    grabCursor: true,
  });
}

function renderAllCategories(data = eventsData) {
  window.homepageSeenIds = new Set();

  const renderCategory = (events, gridId, sectionId, swiperSelector) => {
    const container = document.getElementById(gridId);
    const section = document.getElementById(sectionId);
    if (!container || !section) return;

    const uniqueToCategory = events.filter(
      (e) => !window.homepageSeenIds.has(e.id),
    );

    if (uniqueToCategory.length > 0) {
      section.style.display = "block";
      container.innerHTML = uniqueToCategory
        .map(
          (event) => `
                <div class="swiper-slide">
                    ${createEventCard(event)}
                </div>
            `,
        )
        .join("");

      uniqueToCategory.forEach((e) => window.homepageSeenIds.add(e.id));
      initSwiper(swiperSelector, gridId);
      if (window.lucide) window.lucide.createIcons();
    } else {
      section.style.display = "none";
    }
  };

  renderCategory(
    data.featured,
    "featured-events-grid",
    "featuredSection",
    ".featured-swiper",
  );
  renderCategory(
    data.trending,
    "trending-events-grid",
    "trendingSection",
    ".trending-swiper",
  );
  renderCategory(data.hot, "hot-events-grid", "hotSection", ".hot-swiper");
  renderCategory(
    data.upcoming,
    "upcoming-events-grid",
    "upcomingSection",
    ".upcoming-swiper",
  );
  renderCategory(
    data.nearby,
    "nearby-events-grid",
    "nearbySection",
    ".nearby-swiper",
  );
}

// Manual Grid Scroll removed in favor of Swiper

// Mobile menu toggle
function initMobileMenu() {
  const menuToggle = document.querySelector(".mobile-menu-toggle");
  const navMenu = document.querySelector(".nav-menu");

  if (menuToggle && navMenu) {
    menuToggle.addEventListener("click", () => {
      menuToggle.classList.toggle("active");
      navMenu.classList.toggle("active");
    });

    // Close menu when clicking on a link
    const navLinks = document.querySelectorAll(".nav-menu a");
    navLinks.forEach((link) => {
      link.addEventListener("click", () => {
        menuToggle.classList.remove("active");
        navMenu.classList.remove("active");
      });
    });

    // Close menu when clicking outside
    document.addEventListener("click", (e) => {
      if (!menuToggle.contains(e.target) && !navMenu.contains(e.target)) {
        menuToggle.classList.remove("active");
        navMenu.classList.remove("active");
      }
    });
  }
}

function initUserIcon() {
  const userProfileBtn = document.getElementById("userProfileBtn");
  const profileDropdown = document.getElementById("profileDropdown");
  const viewProfile = document.getElementById("viewProfile");
  const logoutBtn = document.getElementById("logoutBtn");
  const profileSideModal = document.getElementById("profileSideModal");
  const closeProfileModal = document.getElementById("closeProfileModal");
  const profileEditForm = document.getElementById("profileEditForm");
  const loginModal = document.getElementById("loginModal");
  const closeLoginModal = document.getElementById("closeLoginModal");

  // UI Elements for user state
  const defaultUserIcon = document.getElementById("defaultUserIcon");
  const userProfileImg = document.getElementById("userProfileImg");
  const userOnlineStatus = document.querySelector(".user-online-status");
  const dropdownUserName = document.getElementById("dropdownUserName");
  const dropdownUserEmail = document.getElementById("dropdownUserEmail");
  const profileUpdateBanner = document.getElementById("profileUpdateBanner");

  const checkProfileCompletion = (user) => {
    if (!user) return false;
    const requiredFields = [
      "email",
      "phone",
      "dob",
      "gender",
      "country",
      "state",
      "city",
      "address",
    ];
    return requiredFields.every(
      (field) => user[field] && user[field].toString().trim() !== "",
    );
  };




  const setupUI = () => {
    const user = authController.user;

    // Loading/Syncing state
    if (authController.isSyncing && !user) {
      if (dropdownUserName) dropdownUserName.textContent = "Loading...";
      return;
    }

    if (authController.state === authController.states.AUTHENTICATED && user) {
      // Update icon
      if (userProfileImg) {
        const profilePic = getProfileImg(
          user.profile_image || user.profile_pic,
          user.name,
        );
        userProfileImg.src = profilePic;
        userProfileImg.title = `Logged in as ${user.name}`;
        userProfileImg.style.display = "block";
      }
      if (defaultUserIcon) defaultUserIcon.style.display = "none";
      if (userOnlineStatus) userOnlineStatus.style.display = "block";

      if (dropdownUserName) dropdownUserName.textContent = user.name || "User";
      if (dropdownUserEmail) dropdownUserEmail.textContent = user.email || "";

      // Check profile completion for banner
      if (profileUpdateBanner) {
        if (checkProfileCompletion(user)) {
          profileUpdateBanner.style.display = "none";
        } else {
          profileUpdateBanner.style.display = "block";
        }
      }
    } else {
      // Guest/Unauthenticated UI
      if (userProfileImg) userProfileImg.style.display = "none";
      if (defaultUserIcon) defaultUserIcon.style.display = "block";
      if (userOnlineStatus) userOnlineStatus.style.display = "none";

      if (profileUpdateBanner) profileUpdateBanner.style.display = "block";

      const favoritesSection = document.getElementById("your-favorites");
      if (favoritesSection) favoritesSection.style.display = "none";

      if (dropdownUserName) dropdownUserName.textContent = "Guest";
      if (dropdownUserEmail) dropdownUserEmail.textContent = "Sign in to sync";
    }
  };

  // Initial UI setup
  setupUI();

  // Listen for state changes from AuthController
  window.addEventListener("auth:stateChange", (e) => {
    setupUI();
    if (e.detail.state === authController.states.AUTHENTICATED) {
      loadEvents(); // Refresh data to show is_favorite states
    }
  });

  window.addEventListener("auth:sync", (e) => {
    setupUI();
    if (e.detail.success) {
      loadEvents();
    }
  });

  // Unified click handler for the profile button
  if (userProfileBtn) {
    userProfileBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (authController.state === authController.states.AUTHENTICATED) {
        // Toggle dropdown if logged in
        if (profileDropdown) profileDropdown.classList.toggle("show");
      } else {
        // Show login modal if guest - Ensure clean state
        authController.clearSession();
        if (loginModal) {
          loginModal.style.display = "flex";
          setTimeout(() => loginModal.classList.add("show"), 10);
          if (window.authController && window.authController.googleInitialized) {
            window.authController.renderGoogleButton('googleSignInContainer');
          }
          // Manual button is already in HTML, logical handler added in initUserIcon
        }
      }
    });

    // Handle Manual Google Click (Added for restored button)
    const googleBtn = document.getElementById("googleSignIn");
    if (googleBtn) {
      googleBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (window.authController) {
          // Ensure SDK is initialized even on manual click if it wasn't before
          window.authController.handleGoogleLoginManual();
        }
      });
    }
  }

  // Close dropdown on click outside
  document.addEventListener("click", () => {
    if (profileDropdown) profileDropdown.classList.remove("show");
  });

  // Logout logic
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async (e) => {
      e.preventDefault();

      const result = await Swal.fire({
        title: "Logout?",
        text: "You will be signed out of your account.",
        icon: "warning",
        showCancelButton: true,
        confirmButtonColor: "#ff5a5f",
        cancelButtonColor: "#9ca3af",
        confirmButtonText: "Yes, logout!",
        background: "#fff",
        color: "#000",
      });

      if (result.isConfirmed) {
        authController.logout(true);
      }
    });
  }

  // Modal logic (Profile Info)
  if (viewProfile) {
    viewProfile.addEventListener("click", (e) => {
      e.preventDefault();
      if (profileDropdown) profileDropdown.classList.remove("show");

      const user = authController.user;
      if (!user) {
        if (authController.isSyncing) {
          showNotification(
            "Syncing your profile... Please try again in a moment.",
            "info",
          );
        } else {
          showNotification(
            "Session expired or profile not found. Please log in again.",
            "info",
          );
          if (loginModal) {
            loginModal.style.display = "flex";
            setTimeout(() => loginModal.classList.add("show"), 10);
            if (window.authController && window.authController.googleInitialized) {
              window.authController.renderGoogleButton('googleSignInContainer');
            }
          }
        }
        return;
      }
      const modalPic = document.getElementById("modalProfilePic");
      if (modalPic) {
        modalPic.src = getProfileImg(
          user.profile_image || user.profile_pic,
          user.name,
        );
      }

      const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.value = val || "";
      };
      setVal("profileCustomId", user.custom_id);
      setVal("profileName", user.name);
      setVal("profileEmail", user.email);
      setVal("profilePhone", user.phone);
      setVal("profileDob", user.dob);
      setVal("profileGender", user.gender);
      setVal("profileCountry", user.country);
      setVal("profileState", user.state);
      setVal("profileCity", user.city);
      setVal("profileAddress", user.address);

      if (profileSideModal) profileSideModal.classList.add("open");
    });
  }

  // Profile Picture Preview Logic
  const profilePicUpload = document.getElementById("profilePicUpload");
  const modalProfilePic = document.getElementById("modalProfilePic");
  if (profilePicUpload && modalProfilePic) {
    profilePicUpload.addEventListener("change", (e) => {
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
    closeProfileModal.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (profileSideModal) profileSideModal.classList.remove("open");
    });
  }

  if (profileEditForm) {
    profileEditForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(profileEditForm);

      // Ensure all fields are included (even if some are disabled, though disabled fields aren't sent by default)
      // We manually add name if it's there, etc.
      // Actually FormData(profileEditForm) gets all named inputs.

      const keys =
        typeof getRoleKeys === "function" ? getRoleKeys() : { user: "user" };

      try {
        const response = await apiFetch("/api/users/update-profile.php", {
          method: "POST",
          body: formData,
        });
        const result = await response.json();

        if (result.success) {
          if (window.storage) window.storage.set(keys.user, result.user);
          showNotification("Profile updated successfully!", "success");
          if (profileSideModal) profileSideModal.classList.remove("open");
          setupUI(); // Refresh icon and label immediately
          setTimeout(() => window.location.reload(), 1500);
        } else {
          showNotification(result.message || "Error updating profile", "error");
        }
      } catch (error) {
        showNotification("System error occurred", "error");
      }
    });
  }

  // Login Modal close logic
  if (closeLoginModal) {
    closeLoginModal.addEventListener("click", () => {
      if (loginModal) {
        loginModal.classList.remove("show");
        setTimeout(() => (loginModal.style.display = "none"), 300);
      }
    });
  }

  // Close login modal on backdrop click
  window.addEventListener("click", (e) => {
    if (e.target === loginModal) {
      loginModal.classList.remove("show");
      setTimeout(() => (loginModal.style.display = "none"), 300);
    }
  });

  // Trigger Login Modal if redirected from checkout.html or via URL trigger
  const urlParams = new URLSearchParams(window.location.search);
  if (
    sessionStorage.getItem("redirect_after_login") ||
    urlParams.get("trigger") === "login"
  ) {
    if (loginModal && !isAuthenticated()) {
      loginModal.style.display = "flex";
      setTimeout(() => loginModal.classList.add("show"), 10);
      if (window.authController && window.authController.googleInitialized) {
        window.authController.renderGoogleButton('googleSignInContainer');
      }
    }
  }
}

/**
 * Google Auth Logic for Homepage (Refactored to use AuthController)
 */
async function initGoogleAuth() {
  if (authController.state === authController.states.AUTHENTICATED) return;

  try {
    const response = await apiFetch("/api/config/get-google-config.php");
    const data = await response.json();

    if (data.success && data.client_id) {
      // Wait for Google SDK to load (up to 10s)
      const googleLoaded = await new Promise((resolve) => {
        if (
          typeof google !== "undefined" &&
          google.accounts &&
          google.accounts.id
        ) {
          return resolve(true);
        }
        let attempts = 0;
        const maxAttempts = 100;
        const intervalId = setInterval(() => {
          attempts++;
          if (
            typeof google !== "undefined" &&
            google.accounts &&
            google.accounts.id
          ) {
            clearInterval(intervalId);
            resolve(true);
          } else if (attempts >= maxAttempts) {
            clearInterval(intervalId);
            resolve(false);
          }
        }, 100);
      });

      if (googleLoaded) {
        // Initialize Google SDK but don't render standard button yet because modal is hidden
        authController.initGoogle(data.client_id, "none");
      } else {
        // If SDK fails to load, the manual button remains and can be tried again by clicking
        console.warn("Google SDK failed to load");
      }
    }
  } catch (error) {
    // Silently fail — user can still navigate to login page
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
  const globalSearch = document.getElementById("globalSearch");
  const searchLoader = document.getElementById("searchLoader");

  if (globalSearch) {
    let debounceTimer;
    globalSearch.addEventListener("input", () => {
      clearTimeout(debounceTimer);
      if (searchLoader) searchLoader.style.display = "block";

      debounceTimer = setTimeout(() => {
        const query = globalSearch.value.trim();
        performServerSearch(query);
      }, 500);
    });

    const searchButton = document.querySelector(".search-button-modern");
    if (searchButton) {
      searchButton.addEventListener("click", () => {
        performServerSearch(globalSearch.value.trim());
      });
    }
  }
}

async function performServerSearch(query) {
  const loader = document.getElementById("searchLoader");
  const sections = document.querySelectorAll(".events-section");
  const allEventsSection = document.getElementById("all-events");
  const allEventsTitle = allEventsSection?.querySelector(".section-title");
  const allEventsGrid = document.getElementById("all-events-grid");

  if (!query) {
    if (loader) loader.style.display = "none";
    sections.forEach((section) => {
      section.style.display = "block";
    });
    if (allEventsTitle) allEventsTitle.textContent = "🌍 All Events";
    loadEvents(); // Reload default events
    return;
  }

  // Toggle sections visibility
  sections.forEach((section) => {
    if (section.id !== "all-events") {
      section.style.display = "none";
    }
  });
  if (allEventsTitle) allEventsTitle.textContent = `🔍 Results for "${query}"`;

  try {
    const url = new URL("/api/events/search-events.php", window.location.href);
    url.searchParams.append("q", query);
    url.searchParams.append("limit", "200");

    const response = await apiFetch(url.toString());
    const result = await response.json();

    if (loader) loader.style.display = "none";

    if (result.success) {
      eventsData.all = result.events;
      renderDiscovery(result.events); // Use centralized rendering with ghost filling
    }
  } catch (error) {
    if (loader) loader.style.display = "none";
    showNotification("Error performing search. Please try again.", "error");
  }
}

function renderSearchResults(events) {
  // Now redirected to renderDiscovery for consistency and ghost filling
  renderDiscovery(events);
}

function renderEventsGrid(gridId, events, emptyMessage) {
  const grid = document.getElementById(gridId);
  if (!grid) return;

  grid.innerHTML =
    events.length > 0
      ? events.map((e, i) => createEventCard(e, i)).join("")
      : `<div class="empty-state" style="grid-column: 1/-1; text-align: center; padding: 4rem;">
         <div style="font-size: 3rem; margin-bottom: 1rem;">🔎</div>
         <h3 style="color: #4b5563;">${emptyMessage}</h3>
       </div>`;
  if (window.lucide) window.lucide.createIcons();
}

// XSS mitigation helper
function escapeHTML(str) {
  if (typeof str !== "string") return "";
  return str.replace(
    /[&<>'"]/g,
    (tag) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;",
      })[tag],
  );
}

// Create event card
function createEventCard(event, index) {
  // Handle pricing - prefer new fields if available
  // Handle pricing - robust multi-tier logic
  let price = "Free";
  const regPrice = parseFloat(event.regular_price || 0);
  const vipPrice = parseFloat(event.vip_price || 0);
  const premPrice = parseFloat(event.premium_price || 0);
  const legacyPrice = parseFloat(event.price || 0);

  // Get active modes from metadata (ticket_type_mode)
  let modes = (event.ticket_type_mode || "all")
    .split(",")
    .map((m) => m.trim().toLowerCase());

  if (modes.includes("all") || modes.length === 0) {
    price = legacyPrice > 0 ? `₦${legacyPrice.toLocaleString()}` : "Free";
  } else {
    let priceParts = [];
    if (modes.includes("regular")) priceParts.push(regPrice);
    if (modes.includes("vip")) priceParts.push(vipPrice);
    if (modes.includes("premium")) priceParts.push(premPrice);

    const maxP = Math.max(...priceParts);
    const minP = Math.min(...priceParts);

    if (maxP > 0) {
      price =
        minP === maxP
          ? `₦${minP.toLocaleString()}`
          : `₦${minP.toLocaleString()} - ₦${maxP.toLocaleString()}`;
    } else {
      price = "Free";
    }
  }

  // Append ticket types label
  const typeLabel =
    modes.includes("all") || modes.length === 0
      ? "Regular, VIP, Premium"
      : modes.map((m) => m.charAt(0).toUpperCase() + m.slice(1)).join(", ");

  if (typeLabel) {
    price = `${price} <span class="ticket-type-label" style="font-size: 0.75rem; color: #6b7280; font-weight: 500;">(${typeLabel})</span>`;
  }

  // Security: Sanitize and Path Priority
  const eventImage =
    typeof getImageUrl === "function"
      ? getImageUrl(event.image_path)
      : event.absolute_image_url || "";

  let eventDate = "Date TBA";
  let status, statusLabel, statusColor;

  if (event.event_date) {
    const eventDateStr = event.event_date || "";
    eventDate = eventDateStr.split("-").reverse().join("/");

    // Fix: Today's events should not be marked as "Passed" until tomorrow.
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const eventDay = new Date(eventDateStr + "T00:00:00");
    const isPassed = eventDay < today;

    status = isPassed ? "passed" : event.sold_out ? "sold-out" : "upcoming";
    statusLabel = isPassed
      ? "Passed"
      : event.sold_out
        ? "Sold Out"
        : "Upcoming";
    statusColor = isPassed ? "#6b7280" : event.sold_out ? "#ef4444" : "#722f37";
  } else {
    status = "upcoming";
    statusLabel = "Upcoming";
    statusColor = "#722f37";
  }

  const eventTime = escapeHTML(event.event_time) || "12:00:00";
  const isFavorite = event.is_favorite ? "active" : "";
  // Remove # and numbers from event name (e.g., "Tech Conference #1" -> "Tech Conference")
  const cleanEventName = event.event_name.replace(/\s*#\d+$/, "");
  const eventName = escapeHTML(cleanEventName);
  const category = escapeHTML(event.category || event.event_type) || "Event";
  const desc = escapeHTML(event.description || "");
  const organizer = escapeHTML(
    event.organizer_name || event.client_name || "Eventra",
  );
  const full_address =
    `${event.address || ""}, ${event.city || ""}, ${event.state || ""}`
      .replace(/^, /, "")
      .replace(/, , /g, ", ")
      .replace(/, $/, "");
  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(full_address || "Nigeria")}`;
  const shareTitle = `Eventra: ${eventName}`;
  const shareText = `Check out ${eventName} organized by ${organizer} on Eventra!`;

  // Ticket types are now integrated directly into the price string above

  const getPriorityIcon = (p) => {
    switch (p.toLowerCase()) {
      case "hot":
        return "🔥";
      case "trending":
        return "📈";
      case "featured":
        return "⭐";
      case "nearby":
        return "📍";
      case "upcoming":
        return "🕒";
      default:
        return "";
    }
  };
  const priorityBadge = event.priority
    ? `<div class="card-priority-badge priority-${event.priority.toLowerCase()}">${getPriorityIcon(event.priority)} ${event.priority}</div>`
    : "";

  return `
    <div class="event-card" data-id="${event.id}" data-status="${status}" onclick="showEventModal(${event.id})">
      <div class="event-image-container" style="${!eventImage ? "background: #f1f5f9; display: flex; align-items: center; justify-content: center;" : ""}">
        ${eventImage ? `<img src="${eventImage}" alt="${eventName}" loading="lazy" class="event-image" onerror="this.parentElement.style.background='#f1f5f9'; this.style.display='none'; this.nextElementSibling.style.display='flex';">` : ""}
        <div class="no-image-placeholder" style="${eventImage ? "display: none;" : "display: flex;"} flex-direction: column; align-items: center; gap: 0.5rem; color: #94a3b8;">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
            <span style="font-size: 0.8rem; font-weight: 600;">No Image</span>
        </div>
        <div class="event-badges">
          <span class="event-category-badge">${category}</span>
          <div class="event-status-badge" style="color: ${statusColor};">
            <span class="status-dot" style="background-color: ${statusColor};"></span>
            ${statusLabel}
          </div>
        </div>
        ${priorityBadge}
      </div>
      
      <div class="event-content">
        <div class="event-date-time">${eventDate} • ${eventTime.substring(0, 5)}</div>
        <h3 class="event-title">${eventName}</h3>
        
        <div class="event-location" style="display: flex; flex-direction: column; align-items: flex-start; text-align: left; gap: 0.35rem; margin-top: 0.25rem;">
          ${(() => {
            const states = (event.state || "")
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
            const isMultipleStates =
              states.length > 1 &&
              !states.includes("All States") &&
              !states.includes("Nationwide");

            if (isMultipleStates) {
              return `
                <div style="display: flex; align-items: center; gap: 0.4rem; color: #6b7280; width: 100%;">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink: 0;">
                    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>
                  </svg>
                  <span class="location-truncate" style="font-weight: 600; color: #722f37;">Various Locations</span>
                </div>`;
            }

            if (event.address || event.location) {
              return `
                <a href="${mapUrl}" target="_blank" class="address-link" onclick="event.stopPropagation();" style="display: flex; align-items: flex-start; gap: 0.4rem; width: 100%;">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink: 0; margin-top: 0.1rem;">
                    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>
                  </svg>
                  <span class="location-truncate" style="line-height: 1.3;">${escapeHTML(event.address || event.location)}</span>
                </a>
                ${
                  event.city || event.state
                    ? `
                <div style="font-size: 0.85rem; color: #6b7280; padding-left: 1.25rem; line-height: 1.5; word-break: break-word; margin-top: 0.2rem;">
                  ${[event.city, event.state].filter(Boolean).map(escapeHTML).join(", ")}
                </div>`
                    : ""
                }`;
            }

            if (event.city || event.state) {
              return `
                <div style="display: flex; align-items: flex-start; gap: 0.4rem; color: #6b7280; width: 100%;">
                   <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink: 0; margin-top: 0.1rem;">
                    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>
                  </svg>
                  <span class="location-truncate">${[event.city, event.state].filter(Boolean).map(escapeHTML).join(", ")}</span>
                </div>`;
            }

            return `
              <div style="display: flex; align-items: center; gap: 0.4rem; color: #6b7280;">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>
                </svg>
                <span class="location-truncate">TBD</span>
              </div>`;
          })()}
        </div>
        
        <div class="event-card-description">${desc}</div>
        <div class="event-organizer">
            By ${organizer} 
            ${event.is_verified == 1 ? '<i data-lucide="check-circle-2" class="organizer-verified" title="Verified"></i>' : ""}
        </div>
      </div>

      <div class="event-footer">
          <div class="event-price ${price === "Free" ? "free" : ""}">${price}</div>
          <div class="event-card-actions">
            <button class="card-action-btn fav-btn ${isFavorite}" onclick="toggleFavorite(event, ${event.id}); event.stopPropagation();" title="Favorite">
              <i data-lucide="heart" class="${isFavorite ? "active" : ""}" style="width: 18px; height: 18px; ${isFavorite ? "fill: currentColor;" : ""}"></i>
            </button>
            <button class="card-action-btn share-btn" onclick="shareEvent(event, ${event.id}, '${escapeHTML(shareTitle)}', '${escapeHTML(shareText)}'); event.stopPropagation();" title="Share">
              <i data-lucide="share-2" style="width: 18px; height: 18px;"></i>
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
  const chevron = header.querySelector(".chevron-icon");

  const isExpanded = content.classList.toggle("expanded");
  chevron.classList.toggle("rotated", isExpanded);
}

// Filter lists now loaded globally from utils.js

// Redesigned discovery rendering with Grid and Pagination
function renderDiscovery(events = eventsData.all) {
  const container = document.getElementById("all-events-grid");
  const countEl = document.getElementById("resultsCount");
  const wrapper = document.getElementById("events-grid-wrapper");
  const noResultsEl = document.getElementById("noResultsMessage");
  const paginationContainer = document.getElementById("paginationContainer");

  if (!container) return;

  // 1. Deduplicate against categorized sections (Featured/Hot/etc.)
  // REMOVED deduplication to populate grid as requested by user
  const eventsToShow = events;

  filteredDiscoveryEvents = eventsToShow;

  // 2. Handle empty state
  if (eventsToShow.length === 0) {
    container.style.display = "none";
    if (paginationContainer) paginationContainer.style.display = "none";
    if (noResultsEl) noResultsEl.style.display = "block";
    if (countEl) countEl.textContent = "0 events found";
    return;
  }

  // 3. Show content, hide "No Results"
  container.style.display = "grid";
  if (noResultsEl) noResultsEl.style.display = "none";
  if (countEl) countEl.textContent = `${eventsToShow.length} events found`;

  // 4. Pagination Logic
  itemsPerPage = getItemsPerPage();
  const totalPages = Math.ceil(eventsToShow.length / itemsPerPage);

  // Ensure currentPage is valid
  if (currentPage > totalPages) currentPage = totalPages || 1;
  if (currentPage < 1) currentPage = 1;

  const start = (currentPage - 1) * itemsPerPage;
  const end = start + itemsPerPage;
  const paginatedEvents = eventsToShow.slice(start, end);

  // 5. Render Grid
  let gridHtml = paginatedEvents
    .map(
      (event) => `
    <div class="grid-item">
        ${createEventCard(event)}
    </div>
  `,
    )
    .join("");

  container.innerHTML = gridHtml;

  if (window.lucide) window.lucide.createIcons();

  // 6. Update Pagination UI
  renderPaginationUI(totalPages);
}

function getGridColumns(container) {
  if (!container) return 3;
  const style = window.getComputedStyle(container);
  return style.getPropertyValue("grid-template-columns").split(" ").length;
}

// Update itemsPerPage on resize
window.addEventListener(
  "resize",
  debounce(() => {
    const newLimit = getItemsPerPage();
    if (newLimit !== itemsPerPage) {
      itemsPerPage = newLimit;
      renderDiscovery();
    }
  }, 250),
);

function renderPaginationUI(totalPages) {
  const paginationContainer = document.getElementById("paginationContainer");
  const pageNumbers = document.getElementById("pageNumbers");
  const prevBtn = document.getElementById("prevPage");
  const nextBtn = document.getElementById("nextPage");

  if (!paginationContainer || !pageNumbers) return;

  if (totalPages <= 1) {
    paginationContainer.style.display = "none";
    return;
  }

  paginationContainer.style.display = "flex";
  pageNumbers.innerHTML = "";

  // Prev Button
  if (prevBtn) prevBtn.disabled = currentPage === 1;

  // Page Numbers
  // For simplicity, showing all pages if few, or a window.
  // Here we'll show all or use a simple logic.
  for (let i = 1; i <= totalPages; i++) {
    if (totalPages > 7) {
      // Simple window logic (Current, 1, last, and neighbors)
      if (i !== 1 && i !== totalPages && Math.abs(i - currentPage) > 1) {
        if (i === 2 || i === totalPages - 1) {
          const dots = document.createElement("span");
          dots.textContent = "...";
          dots.className = "dots";
          pageNumbers.appendChild(dots);
        }
        continue;
      }
    }

    const btn = document.createElement("button");
    btn.textContent = i;
    btn.className = `page-num ${i === currentPage ? "active" : ""}`;
    btn.onclick = () => {
      currentPage = i;
      renderDiscovery(filteredDiscoveryEvents); // Use filtered events
      const wrapper = document.getElementById("events-grid-wrapper");
      if (wrapper) wrapper.scrollIntoView({ behavior: "smooth" });
    };
    pageNumbers.appendChild(btn);
  }

  // Next Button
  if (nextBtn) nextBtn.disabled = currentPage === totalPages;
}

function initPaginationListeners() {
  const prevBtn = document.getElementById("prevPage");
  const nextBtn = document.getElementById("nextPage");

  if (prevBtn) {
    prevBtn.onclick = () => {
      if (currentPage > 1) {
        currentPage--;
        renderDiscovery(filteredDiscoveryEvents);
        document
          .getElementById("events-grid-wrapper")
          ?.scrollIntoView({ behavior: "smooth" });
      }
    };
  }

  if (nextBtn) {
    nextBtn.onclick = () => {
      const totalPages = Math.ceil(
        filteredDiscoveryEvents.length / itemsPerPage,
      );
      if (currentPage < totalPages) {
        currentPage++;
        renderDiscovery(filteredDiscoveryEvents);
        document
          .getElementById("events-grid-wrapper")
          ?.scrollIntoView({ behavior: "smooth" });
      }
    };
  }
}

// Filter Initialization
function initDiscoveryFilters() {
  // Populate UI with hardcoded lists
  const populate = (id, items) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = items
      .map(
        (item) => `
      <label class="checkbox-item">
        <input type="checkbox" value="${item.toLowerCase()}" data-group="${id}">
        <span>${item}</span>
      </label>
    `,
      )
      .join("");
  };

  populate("stateFilters", NIGERIA_STATES);
  populate("categoryFilters", EVENT_CATEGORIES);
  populate(
    "priorityFilters",
    PRIORITY_TAGS.map((p) => p.charAt(0).toUpperCase() + p.slice(1)),
  );

  // Add event listeners
  const inputs = document.querySelectorAll(
    ".filter-sidebar input, .filter-sidebar select, #sortBy",
  );
  inputs.forEach((input) => {
    input.addEventListener("change", applyFilters);
  });

  document.getElementById("resetFilters")?.addEventListener("click", () => {
    inputs.forEach((i) => {
      if (i.type === "checkbox") i.checked = false;
      else if (i.type === "text") i.value = "";
    });
    applyFilters();
  });
}

function toggleSidebarSection(sectionId) {
  const content = document.getElementById(sectionId);
  const header = content?.previousElementSibling;
  const chevron = header?.querySelector(".chevron-icon");

  if (content) {
    content.classList.toggle("expanded");
    if (chevron) {
      chevron.classList.toggle("rotated");
    }
  }
}

function getFilteredEvents(events, filters) {
  const {
    searchQuery,
    selectedStates,
    selectedCategories,
    selectedPriorities,
    selectedStatuses,
    freeOnly,
    now,
  } = filters;

  return events.filter((event) => {
    const matchesSearch =
      !searchQuery ||
      event.event_name.toLowerCase().includes(searchQuery) ||
      (event.description &&
        event.description.toLowerCase().includes(searchQuery));

    const eventStates = (event.state || "")
      .toLowerCase()
      .split(",")
      .map((s) => s.trim());
    const matchesState =
      selectedStates.length === 0 ||
      selectedStates.some((s) => eventStates.includes(s.toLowerCase())) ||
      eventStates.includes("all states") ||
      eventStates.includes("all");

    const matchesCategory =
      selectedCategories.length === 0 ||
      selectedCategories.includes(
        (event.category || event.event_type || "General").toLowerCase(),
      );

    const eventPriorities = (event.priority || "")
      .toLowerCase()
      .split(",")
      .map((p) => p.trim());
    const matchesPriority =
      selectedPriorities.length === 0 ||
      selectedPriorities.some((p) => eventPriorities.includes(p.toLowerCase()));

    // Fix: Force local time by appending T00:00:00 to avoid UTC midnight shift
    const eventDay = new Date((event.event_date || "") + "T00:00:00");
    const todayMidnight = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const isPassed = eventDay < todayMidnight;
    const matchesStatus =
      selectedStatuses.length === 0 ||
      (selectedStatuses.includes("passed") && isPassed) ||
      (selectedStatuses.includes("recent") && !isPassed);

    const isFree =
      !event.price ||
      parseFloat(event.price.toString().replace(/[^0.00-9.99]/g, "")) === 0;
    const matchesPrice = !freeOnly || isFree;

    return (
      matchesSearch &&
      matchesState &&
      matchesCategory &&
      matchesStatus &&
      matchesPrice
    );
  });
}

function applyFilters() {
  // Reset pagination to first page on filter change
  currentPage = 1;

  const filters = {
    searchQuery:
      document.getElementById("globalSearch")?.value.toLowerCase() || "",
    selectedStates: Array.from(
      document.querySelectorAll("#stateFiltersWrapper input:checked"),
    ).map((i) => i.value),
    selectedCategories: Array.from(
      document.querySelectorAll("#categoryFiltersWrapper input:checked"),
    ).map((i) => i.value),
    selectedPriorities: Array.from(
      document.querySelectorAll("#priorityFiltersWrapper input:checked"),
    ).map((i) => i.value),
    selectedStatuses: Array.from(
      document.querySelectorAll("#statusFiltersWrapper input:checked"),
    ).map((i) => i.value),
    freeOnly: document.getElementById("freeOnlyToggle")?.checked,
    now: new Date(),
  };

  // 1. Get filtered discovery list
  const discoveryFiltered = getFilteredEvents(allEvents, filters);

  // Sorting logic
  const sortBy = document.getElementById("sortBy")?.value;
  const getPrice = (p) => {
    if (!p || p.toString().toLowerCase() === "free") return 0;
    return parseFloat(p.toString().replace(/[^0-9.]/g, "")) || 0;
  };

  if (sortBy === "price-low") {
    discoveryFiltered.sort((a, b) => getPrice(a.price) - getPrice(b.price));
  } else if (sortBy === "price-high") {
    discoveryFiltered.sort((a, b) => getPrice(b.price) - getPrice(a.price));
  } else if (sortBy === "newest") {
    discoveryFiltered.sort(
      (a, b) => new Date(b.event_date) - new Date(a.event_date),
    );
  } else if (sortBy === "oldest") {
    discoveryFiltered.sort(
      (a, b) => new Date(a.event_date) - new Date(b.event_date),
    );
  }

  // Helper to check priority tag
  const hasPriority = (e, tag) => e.priority && e.priority.toLowerCase().split(',').map(p => p.trim()).includes(tag);

  // If priority tags are selected, sort those to the top
  if (filters.selectedPriorities.length > 0) {
    discoveryFiltered.sort((a, b) => {
      const aMatches = filters.selectedPriorities.some(p => hasPriority(a, p.toLowerCase()));
      const bMatches = filters.selectedPriorities.some(p => hasPriority(b, p.toLowerCase()));
      if (aMatches && !bMatches) return -1;
      if (!aMatches && bMatches) return 1;
      return 0; // If both match or neither match, retain existing sort order
    });
  }

  // Hide the category carousels to keep the homepage organized as requested by user
  document.querySelectorAll('#featuredSection, #trendingSection, #hotSection, #upcomingSection, #nearbySection').forEach(el => {
      if(el) el.style.display = 'none';
  });

  // 4. Render main discovery grid
  renderDiscovery(discoveryFiltered);
}


// Share event function
function shareEvent(
  e,
  eventId,
  title = "Check out this event!",
  text = "I found this amazing event on Eventra",
) {
  if (e) e.stopPropagation();

  let eventName = "event";
  let organizerName = "organizer";
  if (typeof allEvents !== "undefined") {
    const ev = allEvents.find((event) => event.id == eventId);
    if (ev) {
      eventName = ev.event_name || "event";
      organizerName = ev.organizer_name || ev.client_name || "organizer";
    }
  }

  const domain =
    "https://eventra-website.liveblog365.com/public/pages/index.html";
  const nameSlug = encodeURIComponent(
    eventName.trim().toLowerCase().replace(/\s+/g, "-"),
  );
  const orgSlug = encodeURIComponent(
    organizerName.trim().toLowerCase().replace(/\s+/g, "-"),
  );

  const shareUrl = `${domain}?event=${eventId}&organizer=${orgSlug}&name=${nameSlug}`;

  if (navigator.share) {
    navigator.share({
      title: title,
      text: text,
      url: shareUrl,
    });
  } else {
    navigator.clipboard.writeText(shareUrl).then(() => {
      showNotification("Share link copied to clipboard!", "success");
    });
  }
}

// Favorite toggle function with API
async function toggleFavorite(e, eventId) {
  if (e) e.stopPropagation();
  if (!isAuthenticated()) {
    showNotification("Please login to favorite events", "info");
    return;
  }
  try {
    const response = await apiFetch("/api/events/favorite.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event_id: eventId || window.currentModalEventId }),
    });
    const result = await response.json();
    if (result.success) {
      // Update local eventsData reactively
      if (typeof eventsData !== "undefined") {
        // Update in all categories
        Object.keys(eventsData).forEach((category) => {
          if (Array.isArray(eventsData[category])) {
            eventsData[category].forEach((ev) => {
              if (ev.id == eventId) ev.is_favorite = result.is_favorite ? 1 : 0;
            });
          }
        });

        // Re-sync favorites array
        eventsData.favorites = eventsData.all.filter(
          (e) => parseInt(e.is_favorite) === 1,
        );

        // Update UI components
        const targetId = eventId || window.currentModalEventId;
        const cards = document.querySelectorAll(
          `.event-card[data-id="${targetId}"]`,
        );
        cards.forEach((cardItem) => {
          const favBtn = cardItem.querySelector(".fav-btn");
          const favIcon = cardItem.querySelector(".fav-btn i");
          if (favBtn) {
            if (result.is_favorite) {
              favBtn.classList.add("active");
              if (favIcon) {
                favIcon.classList.add("active");
                favIcon.style.fill = "currentColor";
                favIcon.style.color = "#e11d48"; // Explicit red fill for heart
              }
            } else {
              favBtn.classList.remove("active");
              if (favIcon) {
                favIcon.classList.remove("active");
                favIcon.style.fill = "none";
                favIcon.style.color = ""; // Reset color
              }
            }
          }
        });

        // Update modal button state
        updateFavoriteButtonState(targetId);

        if (typeof updateCartUI === "function") {
          updateCartUI();
        }
      }

      showNotification(result.message, "success");
    }
  } catch (error) {
    showNotification("Failed to update favorite", "error");
  }
}

function updateFavoriteButtonState(eventId) {
  const btn = document.getElementById("addToFavoritesBtn");
  if (!btn) return;

  // Check if event is marked as favorite in eventsData
  let isFavorite = false;
  if (typeof eventsData !== "undefined") {
    const event = eventsData.all?.find((e) => e.id == eventId);
    isFavorite = event && parseInt(event.is_favorite) === 1;
  }

  if (isFavorite) {
    btn.textContent = "❤️ Remove from Favorites";
    btn.style.background = "#ff6b6b";
    btn.style.color = "white";
  } else {
    btn.textContent = "❤️ Add to Favorites";
    btn.style.background = "white";
    btn.style.color = "#ff6b6b";
  }
}

// Header scroll effect
function initHeaderScroll() {
  const header = document.querySelector(".header");
  window.addEventListener("scroll", () => {
    const currentScroll = window.pageYOffset;
    if (header) {
      if (currentScroll > 100) {
        header.style.boxShadow = "0 4px 12px rgba(0,0,0,0.1)";
      } else {
        header.style.boxShadow = "0 2px 8px rgba(0,0,0,0.08)";
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
  cards.forEach((card) => {
    const clone = card.cloneNode(true);
    // remove IDs if any were present to avoid duplicates
    clone.removeAttribute("id");
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

  grid.addEventListener("mouseenter", () => (isPaused = true));
  grid.addEventListener("mouseleave", () => (isPaused = false));

  // Mobile Touch Support
  grid.addEventListener("touchstart", () => (isPaused = true), {
    passive: true,
  });
  grid.addEventListener(
    "touchend",
    () => {
      setTimeout(() => (isPaused = false), 1000);
    },
    { passive: true },
  );

  // Start auto slide
  slide();
}

// Smooth scroll for all anchor links
function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener("click", function (e) {
      e.preventDefault();
      const targetId = this.getAttribute("href");
      if (targetId === "#") return;

      const targetElement = document.querySelector(targetId);
      if (targetElement) {
        targetElement.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }
    });
  });
}

// Initialize all functions
async function init() {
  // 1. Initialize Auth Controller First
  await authController.init();
  // Initialize dynamic components
  loadEvents().then(() => {
    initializeSlider("hot-events-grid");
  });
  initMobileMenu();
  initUserIcon();
  initEnhancedSearch();
  initEventModal();
  initPaginationListeners();
  initSmoothScroll();
  initHeaderScroll();
  if (typeof initGoogleAuth === "function") initGoogleAuth();
  if (typeof initUserLogin === "function") initUserLogin();

  // Real-time synchronization (60s polling for events)
  setInterval(() => {
    const globalSearch = document.getElementById("globalSearch");
    if (!globalSearch || !globalSearch.value.trim()) {
      loadEvents();
    }
  }, 60000);
}

// Initialize when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

// Event modal functionality
function initEventModal() {
  const modal = document.getElementById("eventDetailsModal");
  const closeBtn = document.getElementById("closeEventModal");

  if (closeBtn) {
    closeBtn.addEventListener("click", closeEventModal);
  }

  if (modal) {
    // Close on backdrop click
    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        closeEventModal();
      }
    });
  }

  // Add click event to all event cards (delegated)
  document.addEventListener("click", (e) => {
    const eventCard = e.target.closest(".event-card");
    if (eventCard && !e.target.closest(".favorite-icon")) {
      const eventId = eventCard.dataset.id;
      showEventModal(eventId);
    }
  });
}

function showEventModal(eventId) {
  const event = allEvents.find((e) => e.id == eventId);
  if (!event) {
    return;
  }

  // Pre-calculate prices
  const regularPrice = parseFloat(event.regular_price || 0);
  const vipPrice = parseFloat(event.vip_price || 0);
  const premiumPrice = parseFloat(event.premium_price || 0);

  // Populate modal
  const modal = document.getElementById("eventDetailsModal");
  const modalImage = document.getElementById("modalEventImage");
  if (modalImage) {
    const fallback =
      "https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800&h=500&fit=crop";
    const eventImage =
      typeof getImageUrl === "function"
        ? getImageUrl(event.image_path)
        : event.absolute_image_url || fallback;
    modalImage.src = encodeURI(eventImage);
    modalImage.loading = "lazy";
    modalImage.onerror = () => {
      modalImage.src = fallback;
    };
  }
  if (document.getElementById("modalEventTitle"))
    document.getElementById("modalEventTitle").textContent =
      event.event_name.replace(/\s*#\d+$/, "");
  if (document.getElementById("modalEventOrganizer")) {
    const orgContainer = document.getElementById("modalEventOrganizer");
    orgContainer.style.display = "flex";
    orgContainer.style.alignItems = "center";
    orgContainer.style.gap = "8px";
    orgContainer.innerHTML = `Organized by <span style="font-weight: 600;">${escapeHTML(event.organizer_name || event.client_name || "Eventra")}</span> 
      ${typeof getVerificationBadge === "function" ? getVerificationBadge(event.verification_status) : event.is_verified == 1 ? '<span class="verified-check" style="color: #722f37; margin-left: 5px;" title="Verified">✓</span>' : ""}`;
  }
  if (window.lucide) window.lucide.createIcons();
  if (document.getElementById("modalEventDate"))
    document.getElementById("modalEventDate").textContent = (
      event.event_date || ""
    )
      .split("-")
      .reverse()
      .join("/");
  if (document.getElementById("modalEventTime"))
    document.getElementById("modalEventTime").textContent =
      event.event_time || "TBA";
  const addressStr = escapeHTML(event.address || "");
  const cityStr = escapeHTML(event.city || "");
  let stateStr = event.state || "";
  const states = stateStr
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  
  // Try structured locations JSON
  let locs = null;
  try {
    locs = event.locations ? (typeof event.locations === "string" ? JSON.parse(event.locations) : event.locations) : null;
  } catch (e) {}

  const isMultipleStates = (Array.isArray(locs) && locs.length > 1) || (states.length > 1 && !states.includes("All States") && !states.includes("Nationwide"));

  const firstLine = [addressStr, cityStr].filter(Boolean).join(", ");
  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(firstLine + (stateStr ? ", " + stateStr : "") || "Nigeria")}`;

  let locationHTML = "";
  if (isMultipleStates) {
    const locList = Array.isArray(locs) && locs.length > 0 
      ? locs 
      : states.map(s => ({ state: s, address: "" }));

    window.selectedEventLocations = locList.map((_, i) => i);

    locationHTML = `<div id="modalLocsContainer" class="mloc-wrap">`;
    locList.forEach((loc, idx) => {
      const mapQuery = encodeURIComponent((loc.address || '') + ', ' + loc.state);
      locationHTML += `
        <label for="locChk_${idx}" class="mloc-card" style="cursor:pointer;">
          <input type="checkbox" id="locChk_${idx}" data-loc-index="${idx}"
                 onchange="window._updateLocSelection()"
                 style="width:16px;height:16px;accent-color:var(--primary-color);flex-shrink:0;margin-top:2px;">
          <span class="mloc-pin" aria-hidden="true">📍</span>
          <div class="mloc-body">
            <div class="mloc-state">${escapeHTML(loc.state)}</div>
            ${loc.address && loc.address !== 'Multi-state'
              ? `<a href="https://www.google.com/maps/search/?api=1&query=${mapQuery}" target="_blank" onclick="event.stopPropagation()" class="mloc-addr">${escapeHTML(loc.address)}</a>`
              : `<div class="mloc-addr">Address TBA</div>`}
            ${loc.date || loc.time ? `<div class="mloc-meta">${escapeHTML([loc.date, loc.time].filter(Boolean).join(' · '))}</div>` : ''}
          </div>
        </label>`;
    });
    locationHTML += `<div class="mloc-meta" style="margin-top:4px;">Select location(s) you plan to attend</div></div>`;
  } else {
    // Standard single or All States view
    if (firstLine && firstLine !== 'Multi-state') {
      locationHTML += `<a href="${mapUrl}" target="_blank" class="address-link" style="display: block;">${firstLine}</a>`;
      if (stateStr)
        locationHTML += `<div style="margin-top: 0.75rem; font-size: 0.9em; line-height: 1.6; color: #4b5563; display: block;">${escapeHTML(stateStr.replace(/,/g, ", "))}</div>`;
    } else if (stateStr) {
      locationHTML += `<div style="line-height: 1.6; color: inherit;">${escapeHTML(stateStr.replace(/,/g, ", "))}</div>`;
    } else {
      locationHTML += `Nigeria`;
    }
  }

  if (document.getElementById("modalEventLocation")) {
    document.getElementById("modalEventLocation").innerHTML = locationHTML;
  }
  if (document.getElementById("modalEventDescription"))
    document.getElementById("modalEventDescription").textContent =
      event.description || "No description available";
  if (document.getElementById("modalEventCategory"))
    document.getElementById("modalEventCategory").textContent =
      event.category || event.event_type || "General";
  if (document.getElementById("modalEventShareLink"))
    document.getElementById("modalEventShareLink").value =
      `${window.location.origin}/public/pages/checkout.html?id=${event.id}`;
  const modalPrice =
    !event.price || parseFloat(event.price) === 0
      ? "Free"
      : `₦${parseFloat(event.price).toLocaleString()}`;
  if (document.getElementById("modalEventPrice"))
    document.getElementById("modalEventPrice").textContent = modalPrice;

  const ticketTypeSection = document.getElementById("ticketTypeSection");
  if (ticketTypeSection) {
    const availableTypes = [];
    if (regularPrice > 0) availableTypes.push("regular");
    if (vipPrice > 0) availableTypes.push("vip");
    if (premiumPrice > 0) availableTypes.push("premium");

    if (availableTypes.length > 1) {
      // More than one type available - show selector
      ticketTypeSection.style.display = "block";

      // Show/hide radio labels based on availability
      const regularRadio = document.querySelector(
        'input[name="selectedTicketType"][value="regular"]',
      );
      const vipRadio = document.querySelector(
        'input[name="selectedTicketType"][value="vip"]',
      );
      const premiumRadio = document.querySelector(
        'input[name="selectedTicketType"][value="premium"]',
      );

      if (regularRadio && regularRadio.closest("label"))
        regularRadio.closest("label").style.display =
          regularPrice > 0 ? "flex" : "none";
      if (vipRadio && vipRadio.closest("label"))
        vipRadio.closest("label").style.display =
          vipPrice > 0 ? "flex" : "none";
      if (premiumRadio && premiumRadio.closest("label"))
        premiumRadio.closest("label").style.display =
          premiumPrice > 0 ? "flex" : "none";

      const firstRadio = document.querySelector(
        `input[name="selectedTicketType"][value="${availableTypes[0]}"]`,
      );
      if (firstRadio) firstRadio.checked = true;

      // Update price display when ticket type changes
      document
        .querySelectorAll('input[name="selectedTicketType"]')
        .forEach((radio) => {
          radio.onchange = () => updateTicketPriceDisplay(event, radio.value);
        });

      updateTicketPriceDisplay(event, availableTypes[0]);
    } else {
      // Only one type or none - hide selector
      ticketTypeSection.style.display = "none";
      let displayPrice = "Free";
      if (regularPrice > 0) displayPrice = `₦${regularPrice.toLocaleString()}`;
      else if (vipPrice > 0) displayPrice = `₦${vipPrice.toLocaleString()}`;
      else if (premiumPrice > 0)
        displayPrice = `₦${premiumPrice.toLocaleString()}`;

      if (document.getElementById("modalEventPrice")) {
        document.getElementById("modalEventPrice").textContent = displayPrice;
      }
    }
  }

  // Priority badge
  const priorityBadge = document.getElementById("modalPriorityBadge");
  if (event.priority) {
    priorityBadge.textContent = event.priority.toUpperCase();
    priorityBadge.style.display = "block";
    if (event.priority === "hot") {
      priorityBadge.style.background =
        "linear-gradient(135deg, #ff4757, #ff6348)";
      priorityBadge.style.color = "white";
    } else if (event.priority === "trending") {
      priorityBadge.style.background =
        "linear-gradient(135deg, #3742fa, #5f27cd)";
      priorityBadge.style.color = "white";
    } else if (event.priority === "featured") {
      priorityBadge.style.background =
        "linear-gradient(135deg, #2ed573, #1abc9c)";
      priorityBadge.style.color = "white";
    }
  } else {
    priorityBadge.style.display = "none";
  }

  // Buy ticket button logic
  const buyTicketBtn = document.getElementById("bookNowBtn");
  // Fix: Force local time to avoid UTC midnight timezone shift on isPassed check
  const isPassed =
    new Date(event.event_date + "T00:00:00") <
    new Date(new Date().setHours(0, 0, 0, 0));

  if (buyTicketBtn) {
    if (isPassed) {
      buyTicketBtn.textContent = "Event Ended";
      buyTicketBtn.disabled = true;
      buyTicketBtn.style.background = "#6b7280";
      buyTicketBtn.style.cursor = "not-allowed";
      buyTicketBtn.onclick = null;
    } else {
      buyTicketBtn.textContent = "Get Tickets";
      buyTicketBtn.disabled = false;
      buyTicketBtn.style.background = ""; // Revert to default
      buyTicketBtn.style.cursor = "pointer";
      buyTicketBtn.onclick = () => {
        const quantity = document.getElementById("ticketQuantity").value || "1";
        const ticketType =
          document.querySelector('input[name="selectedTicketType"]:checked')
            ?.value || "regular";
        
        let url = `/public/pages/checkout.html?id=${event.id}&quantity=${quantity}&ticket_type=${ticketType}`;
        
        // Pass selected locations if applicable
        if (window.selectedEventLocations && Array.isArray(window.selectedEventLocations)) {
          url += '&selected_locs=' + encodeURIComponent(JSON.stringify(window.selectedEventLocations));
        }

        closeEventModal();
        window.location.href = url;
      };
    }
  }

  // Store current event ID for quantity/favorite functions
  window.currentModalEventId = eventId;

  // Initialize quantity
  const qtyInput = document.getElementById("ticketQuantity");
  if (qtyInput) qtyInput.value = 1;

  // Update favorite button state
  updateFavoriteButtonState(eventId);

  // Show modal
  modal.classList.add("active");
  document.body.style.overflow = "hidden"; // Prevent background scrolling
}

function closeEventModal() {
  const modal = document.getElementById("eventDetailsModal");
  modal.classList.remove("active");
  document.body.style.overflow = ""; // Re-enable scrolling
}

// Update the viewEventDetails function to work with modal
function viewEventDetails(tag) {
  if (!tag) {
    showNotification("Event tag missing", "error");
    return;
  }
  closeEventModal(); // Close modal first
  window.location.href = `pages/event-details.html?event=${tag}`;
}

// Quantity control functions
function increaseQuantity() {
  const qtyInput = document.getElementById("ticketQuantity");
  if (qtyInput) {
    const currentValue = parseInt(qtyInput.value) || 1;
    if (currentValue < 10) {
      qtyInput.value = currentValue + 1;
    }
  }
}

function decreaseQuantity() {
  const qtyInput = document.getElementById("ticketQuantity");
  if (qtyInput) {
    const currentValue = parseInt(qtyInput.value) || 1;
    if (currentValue > 1) {
      qtyInput.value = currentValue - 1;
    }
  }
}

// Make shareEvent available globally
window.shareEvent = shareEvent;
window.viewEventDetails = viewEventDetails;
// User login from homepage modal
async function initUserLogin() {
  const loginForm = document.getElementById("userLoginForm");
  const loginBtn = document.getElementById("userLoginBtn");

  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const email = document.getElementById("userEmail").value;
      const password = document.getElementById("userPassword").value;

      const originalBtnText = loginBtn.innerHTML;
      loginBtn.disabled = true;
      loginBtn.innerHTML =
        '<span class="spinner" style="width: 18px; height: 18px; border: 2px solid #fff; border-top-color: transparent; border-radius: 50%; display: inline-block; animation: spin 0.8s linear infinite;"></span> Logging in...';

      try {
        const response = await apiFetch("/api/auth/login.php", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: email,
            password: password,
            intent: "user",
          }),
        });

        if (!response) throw new Error("No response from server");

        const result = await response.json();
        if (result.success) {
          const keys =
            typeof getRoleKeys === "function"
              ? getRoleKeys()
              : { user: "user", token: "auth_token" };
          if (window.storage) {
            window.storage.set(keys.user, result.user);
            window.storage.set(keys.token, result.user.token);
          }
          showNotification("Sign in successful!", "success");

          setTimeout(() => {
            const redirectUrl = result.redirect || "index.html";
            window.location.href = redirectUrl.includes("://")
              ? redirectUrl
              : "../../" + redirectUrl.replace(/^\//, "");
          }, 1500);
        } else {
          showNotification(result.message || "Login failed", "error");
          loginBtn.disabled = false;
          loginBtn.innerHTML = originalBtnText;
        }
      } catch (error) {
        showNotification("An error occurred. Please try again.", "error");
        loginBtn.disabled = false;
        loginBtn.innerHTML = originalBtnText;
      }
    });
  }
}
// Cart/Favorites View Logic
function toggleCartView(e) {
  if (e) e.stopPropagation();
  const dropdown = document.getElementById("cartDropdown");
  if (dropdown) {
    dropdown.classList.toggle("show");
    if (dropdown.classList.contains("show")) {
      updateCartUI();

      // Close dropdown when clicking outside
      const closeHandler = (event) => {
        if (
          !dropdown.contains(event.target) &&
          !document.getElementById("cartIconContainer").contains(event.target)
        ) {
          dropdown.classList.remove("show");
          document.removeEventListener("click", closeHandler);
        }
      };
      document.addEventListener("click", closeHandler);
    }
  }
}

function updateCartUI() {
  const cartItemsContainer = document.getElementById("cartItemsContainer");
  const cartBadge = document.getElementById("cartBadge");
  const cartFooter = document.getElementById("cartFooter");
  const cartTotalCount = document.getElementById("cartTotalCount");

  if (!cartItemsContainer) return;

  // Favorites are our "cart items"
  const favorites = eventsData.favorites || [];

  // Update Badge
  if (cartBadge) {
    if (favorites.length > 0) {
      cartBadge.textContent = favorites.length;
      cartBadge.style.display = "flex";
    } else {
      cartBadge.style.display = "none";
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
    if (cartFooter) cartFooter.style.display = "none";
  } else {
    if (cartFooter) cartFooter.style.display = "block";

    // Clear and render items
    cartItemsContainer.innerHTML = favorites
      .map((event) => {
        const price =
          !event.price || parseFloat(event.price) === 0
            ? "Free"
            : `₦${parseFloat(event.price).toLocaleString()}`;
        const fallback =
          "https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=100&h=100&fit=crop";
        const eventImage =
          typeof getImageUrl === "function"
            ? getImageUrl(event.image_path)
            : event.absolute_image_url || fallback;

        let eventDate = "Date TBA";
        if (event.event_date) {
          const d = new Date(event.event_date);
          if (!isNaN(d.getTime())) {
            eventDate = d.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            });
          }
        }

        return `
                <div class="favorite-card" onclick="event.stopPropagation(); showEventModal(${event.id})">
                    <img src="${eventImage}" alt="${escapeHTML(event.event_name)}" class="favorite-card-img" onerror="this.src='${fallback}'">
                    <div class="favorite-card-body">
                        <div class="favorite-card-title">${escapeHTML(event.event_name.replace(/\s*#\d+$/, ""))}</div>
                        <div class="favorite-card-meta">${eventDate} · ${escapeHTML(event.city || event.state || "Nigeria")}</div>
                        <div class="favorite-card-price">${price}</div>
                    </div>
                    <div class="favorite-card-actions">
                        <button class="cart-item-remove" onclick="event.stopPropagation(); toggleFavorite(event, ${event.id})" title="Remove from favorites" aria-label="Remove from favorites">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                            </svg>
                        </button>
                        <button class="checkout-mini-btn" onclick="event.stopPropagation(); proceedToPayment(event, ${event.id})" title="Checkout" aria-label="Checkout">
                            <span class="btn-icon">
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M5 12h14m-4-4 4 4-4 4"/>
                                </svg>
                            </span>
                        </button>
                    </div>
                </div>
            `;
      })
      .join("");

    // Add Checkout All button to footer if not already present
    if (cartFooter && !cartFooter.querySelector(".checkout-btn")) {
      const checkoutAllBtn = document.createElement("button");
      checkoutAllBtn.className = "checkout-btn";
      checkoutAllBtn.textContent = "Checkout All";
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
    title: "Clear all favorites?",
    text: "This will remove all events from your favorites list.",
    icon: "warning",
    showCancelButton: true,
    confirmButtonColor: "#FF5A5F",
    cancelButtonColor: "#94a3b8",
    confirmButtonText: "Yes, clear all",
  }).then((result) => {
    if (result.isConfirmed) {
      // In a real app, we'd call an API to clear all.
      // Here we'll toggle them one by one for simplicity if no bulk API exists.
      const favorites = [...eventsData.favorites];
      favorites.forEach(async (event) => {
        await toggleFavorite(null, event.id);
      });
      showNotification("Favorites cleared", "success");
    }
  });
}

function proceedToPayment(e, eventId) {
  if (e) e.stopPropagation();
  const favorites = eventsData.favorites || [];
  if (favorites.length === 0) {
    showNotification("Your favorites list is empty", "info");
    return;
  }

  // If eventId is provided, proceed with that specific event
  // Otherwise, proceed with the first event in the list (legacy/simple behavior)
  const targetId = eventId || favorites[0].id;
  window.location.href = `/public/pages/checkout.html?id=${targetId}&quantity=1`;
}

// Make functions global
window.toggleCartView = toggleCartView;
window.proceedToPayment = proceedToPayment;
window.clearFavorites = clearFavorites;

// Initial cart UI update
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", updateCartUI);
} else {
  updateCartUI();
}

// Helper function to update ticket price display based on selected type
function updateTicketPriceDisplay(event, ticketType) {
  if (!event) return;
  const regularPrice = parseFloat(event.regular_price || 0);
  const vipPrice = parseFloat(event.vip_price || 0);
  const premiumPrice = parseFloat(event.premium_price || 0);

  // Update the main price display
  const priceElement = document.getElementById("modalEventPrice");
  if (ticketType === "regular" && priceElement) {
    priceElement.textContent =
      regularPrice > 0 ? `₦${regularPrice.toLocaleString()}` : "Free";
  } else if (ticketType === "vip" && priceElement) {
    priceElement.textContent =
      vipPrice > 0 ? `₦${vipPrice.toLocaleString()}` : "Free";
  } else if (ticketType === "premium" && priceElement) {
    priceElement.textContent =
      premiumPrice > 0 ? `₦${premiumPrice.toLocaleString()}` : "Free";
  }

  // Update individual ticket type prices in the selector
  const regularPriceDisplay = document.getElementById("regularTicketPrice");
  const vipPriceDisplay = document.getElementById("vipTicketPrice");
  const premiumPriceDisplay = document.getElementById("premiumTicketPrice");

  if (regularPriceDisplay && regularPrice > 0) {
    regularPriceDisplay.textContent = `₦${regularPrice.toLocaleString()}`;
  }

  if (vipPriceDisplay && vipPrice > 0) {
    vipPriceDisplay.textContent = `₦${vipPrice.toLocaleString()}`;
  }

  if (premiumPriceDisplay && premiumPrice > 0) {
    premiumPriceDisplay.textContent = `₦${premiumPrice.toLocaleString()}`;
  }
}

// Toggle Modal Locations for multiple states
function toggleModalLocations(showFull) {
  const truncated = document.getElementById("truncatedLocations");
  const full = document.getElementById("fullLocations");
  if (truncated && full) {
    truncated.style.display = showFull ? "none" : "block";
    full.style.display = showFull ? "block" : "none";
  }
}

// Share Modal Link Function
function copyModalShareLink() {
  const linkInput = document.getElementById("modalEventShareLink");
  let url = linkInput && linkInput.value ? linkInput.value : "";

  if (!url && window.currentModalEventId) {
    url = `${window.location.origin}/public/pages/checkout.html?id=${window.currentModalEventId}`;
  }

  if (!url) return;

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard
      .writeText(url)
      .then(() => {
        if (typeof showNotification === "function") {
          showNotification("Link copied to clipboard!", "success");
        } else if (typeof Swal !== "undefined") {
          Swal.fire({
            toast: true,
            position: "top-end",
            icon: "success",
            title: "Link copied to clipboard!",
            showConfirmButton: false,
            timer: 2000,
            background: "#fff",
            color: "#000",
          });
        } else {
          alert("Link copied to clipboard!");
        }
      })
      .catch(() => {
        const ta = document.createElement("textarea");
        ta.value = url;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        try {
          document.execCommand("copy");
          showNotification("Link copied to clipboard!", "success");
        } catch (err) {}
        document.body.removeChild(ta);
      });
  }
}

window.toggleModalLocations = toggleModalLocations;
window.copyModalShareLink = copyModalShareLink;

/**
 * Update global location selection from checkboxes
 */
window._updateLocSelection = function() {
  const checked = [];
  document.querySelectorAll('#modalLocsContainer input[data-loc-index]').forEach(chk => {
    if (chk.checked) checked.push(parseInt(chk.dataset.locIndex, 10));
  });
  window.selectedEventLocations = checked;
};
