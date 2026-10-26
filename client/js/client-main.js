/**
 * Shared Client JavaScript
 * Common functionality across all client pages
 */
window.openSupportCenter = function () {
  document.dispatchEvent(
    new CustomEvent("EventraOpenSupportCenter", { detail: { role: "client" } }),
  );
  if (typeof window.showDisputeCenter === "function")
    return window.showDisputeCenter();
  window.location.assign("/client/payments.html?tab=refunds");
};

// Track all active interval IDs to clear on logout
(function () {
  const activeIntervals = new Set();
  const originalSetInterval = window.setInterval;
  const originalClearInterval = window.clearInterval;

  window.setInterval = function (func, delay, ...args) {
    // Prevent annoying and disruptive page auto-reload intervals
    const funcStr = String(func);
    if (funcStr.includes("location.reload") && delay === 60000) {
      console.log("Suppressed disruptive page auto-reload interval.");
      return null; // Skip setting this interval
    }
    const id = originalSetInterval(func, delay, ...args);
    activeIntervals.add(id);
    return id;
  };

  window.clearInterval = function (id) {
    activeIntervals.delete(id);
    originalClearInterval(id);
  };

  window.clearAllIntervals = function () {
    activeIntervals.forEach((id) => originalClearInterval(id));
    activeIntervals.clear();
    console.log(
      "All running background interval instances successfully cleared on logout.",
    );
  };
})();

// Initialize logout functionality
document.addEventListener("DOMContentLoaded", () => {
  initLogout();
  // initNotifications(); // Handled by drawer-system.js
  initProfileClick();
  loadGlobalProfile();
  initInactivityMonitor();
});

// Global Modal Close Handler
document.addEventListener("click", function (e) {
  // Close on backdrop click (only when clicking directly on the backdrop element itself)
  if (e.target.classList.contains("modal-backdrop")) {
    // For persistent modals that use .active class, remove active rather than removing from DOM
    if (e.target.id === "folderContentsModal") {
      if (typeof closeFolderContentsModal === "function")
        closeFolderContentsModal();
    } else if (e.target.id === "profileEditModal") {
      if (typeof closeProfileEditModal === "function") closeProfileEditModal();
    } else if (e.target.id === "exportModal") {
      e.target.classList.remove("active");
    } else if (e.target.classList.contains("active")) {
      // Generic active-class modal — remove active
      e.target.classList.remove("active");
    } else {
      // Dynamically injected modals (no persistent ID) — safe to remove
      e.target.remove();
    }
  }
});

function initInactivityMonitor() {
  const SESSION_TIMEOUT = 2 * 60 * 60 * 1000;
  const WARNING_TIME = SESSION_TIMEOUT - 2 * 60 * 1000;
  let inactivityTimer;
  let warningTimer;
  let isWarningShown = false;

  let lastHeartbeatTime = Date.now();
  const HEARTBEAT_INTERVAL = 5 * 60 * 1000; // 5 minutes

  function resetTimers() {
    if (isWarningShown) {
      isWarningShown = false;
      window.__eventraInactivityWarningShown = false;
      if (typeof Swal !== "undefined" && Swal.isVisible()) Swal.close();
    }

    clearTimeout(inactivityTimer);
    clearTimeout(warningTimer);

    warningTimer = setTimeout(showWarning, WARNING_TIME);
    inactivityTimer = setTimeout(() => {
      if (window.logout) window.logout();
      else window.location.href = "/client/login.html";
    }, SESSION_TIMEOUT);

    if (Date.now() - lastHeartbeatTime > HEARTBEAT_INTERVAL) {
      lastHeartbeatTime = Date.now();
      if (typeof apiFetch !== "undefined") {
        apiFetch("/api/utils/heartbeat.php").catch(() => {});
      } else {
        fetch("/api/utils/heartbeat.php").catch(() => {});
      }
    }
  }

  function showWarning() {
    if (isWarningShown || window.__eventraInactivityWarningShown) return;
    isWarningShown = true;
    window.__eventraInactivityWarningShown = true;

    let timeLeft = 120; // 2 minutes

    Swal.fire({
      title: "Session Expiring Soon",
      html: `You will be logged out in <strong style="color: #ef4444; font-size: 1.2rem;">${timeLeft}</strong> seconds due to inactivity.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#10b981",
      cancelButtonColor: "#ef4444",
      confirmButtonText: "Stay Logged In",
      cancelButtonText: "Log Out Now",
      allowOutsideClick: false,
      allowEscapeKey: false,
      didOpen: () => {
        const timerElement = Swal.getHtmlContainer().querySelector("strong");
        const countdown = setInterval(() => {
          timeLeft--;
          if (timerElement) timerElement.textContent = timeLeft;
          if (timeLeft <= 0) {
            clearInterval(countdown);
            Swal.close();
            if (window.logout) window.logout();
          }
        }, 1000);
        Swal.getPopup().dataset.intervalId = countdown;
      },
      willClose: () => {
        const countdown = Swal.getPopup().dataset.intervalId;
        if (countdown) clearInterval(countdown);
      },
    }).then((result) => {
      isWarningShown = false;
      window.__eventraInactivityWarningShown = false;
      if (result.isConfirmed) {
        // Heartbeat API will refresh PHP session timestamp
        if (typeof apiFetch !== "undefined") {
          apiFetch("/api/utils/heartbeat.php").then(() => resetTimers());
        } else {
          fetch("/api/utils/heartbeat.php").then(() => resetTimers());
        }
      } else if (result.dismiss === Swal.DismissReason.cancel) {
        if (window.logout) window.logout();
      }
    });
  }

  ["mousedown", "mousemove", "keydown", "scroll", "wheel", "touchstart"].forEach((evt) => {
    window.addEventListener(evt, resetTimers, { passive: true });
  });

  resetTimers();
}

/**
 * Loads the user profile globally to update header avatar
 */
async function loadGlobalProfile() {
  try {
    // Render cached data immediately for faster UI (avatar / name only — not the
    // verification banner, since cached status may be stale after admin approval)
    const cachedUser = storage.getUser();
    if (cachedUser) {
      updateGlobalAvatar(cachedUser);
      updateClientNameDisplay(cachedUser);
    }

    // Always fetch fresh profile so verification_status is never stale.
    // This ensures the Create Event button is correctly enabled/disabled
    // immediately after an admin approves the client.
    const response = await apiFetch("/api/users/get-profile.php");
    const result = await response.json();

    if (result.success) {
      storage.setUser(result.user);
      updateGlobalAvatar(result.user);
      updateClientNameDisplay(result.user);
      syncVerificationBanner(result.user);
    }
  } catch (error) {}
}

// Listen for auth sync to update profile
document.addEventListener("auth:sync", (e) => {
  if (e.detail.success && e.detail.user) {
    updateGlobalAvatar(e.detail.user);
    updateClientNameDisplay(e.detail.user);
    syncVerificationBanner(e.detail.user);
  }
});

function updateGlobalAvatar(user) {
  const avatars = document.querySelectorAll(".user-avatar");
  avatars.forEach((avatar) => {
    const parent = avatar.parentElement;

    const name = user.name || user.business_name || "User";
    const profileUrl =
      typeof getProfileImg === "function"
        ? getProfileImg(user.profile_pic, name)
        : user.profile_pic ||
          "https://ui-avatars.com/api/?name=" + encodeURIComponent(name);

    avatar.style.backgroundImage = `url(${profileUrl})`;
    avatar.style.backgroundSize = "cover";
    avatar.style.backgroundPosition = "center";

    // Client avatars deliberately have no verification overlay.
    if (parent) parent.querySelector(".verification-badge")?.remove();
  });

  // Populate the inline dropdown (built by initProfileClick) with user data
  const inlineEmail = document.getElementById("inlineDropEmail");
  const inlineCid = document.getElementById("inlineDropCid");
  if (inlineEmail) inlineEmail.textContent = user.email || "";
  if (inlineCid)
    inlineCid.textContent = user.custom_id ? "" + user.custom_id : "";
}

/**
 * Global logout function
 * Clears ALL local state, storage, and redirects to login
 */
async function logout() {
  const result = await Swal.fire({
    title: "Are you sure?",
    text: "You will be logged out of your session!",
    icon: "warning",
    showCancelButton: true,
    confirmButtonColor: "#ef4444",
    cancelButtonColor: "#9ca3af",
    confirmButtonText: "Yes, logout!",
  });

  if (!result.isConfirmed) {
    return;
  }

  // Purge all active intervals
  if (typeof window.clearAllIntervals === "function") {
    window.clearAllIntervals();
  }

  // Reset notification manager (wipes per-client state: lastId, sessionClientId, drawer)
  if (window.notificationManager) {
    window.notificationManager.reset();
  }
  document.dispatchEvent(new Event("auth:logout"));

  // Clear stateManager in-memory state
  if (window.stateManager && typeof window.stateManager.clear === "function") {
    window.stateManager.clear();
  }

  // Full localStorage wipe of all known session keys (cross-role)
  const ALL_SESSION_KEYS = [
    "admin_user",
    "admin_auth_token",
    "client_user",
    "client_auth_token",
    "user",
    "auth_token",
    "login_timestamp",
    "redirect_after_login",
    "export_visible",
  ];
  ALL_SESSION_KEYS.forEach((key) => {
    try {
      localStorage.removeItem(key);
    } catch (e) {}
  });
  // Full sessionStorage wipe
  try {
    sessionStorage.clear();
  } catch (e) {}

  try {
    // Call server-side logout (fire-and-forget; we proceed regardless)
    await apiFetch("/api/auth/logout.php");
  } catch (error) {
    // Proceed with client-side cleanup even if server call fails
  }

  // Clear authController state
  if (
    window.authController &&
    typeof window.authController.clearSession === "function"
  ) {
    window.authController.clearSession();
  }

  // Hard redirect to login
  const keys = storage.getRoleKeys();
  const loginPage =
    keys.user === "admin_user"
      ? "/admin/login.html"
      : "/client/login.html";
  window.location.href = loginPage;
}

// Make logout globally accessible
window.logout = logout;

function initLogout() {
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", (e) => {
      e.preventDefault();
      logout();
    });
  }

  // Also attach to any logout links
  document
    .querySelectorAll('.logout-link, [href*="logout"]')
    .forEach((link) => {
      link.addEventListener("click", (e) => {
        e.preventDefault();
        logout();
      });
    });

  // Specific listeners if needed (e.g. ID-based)
  if (logoutBtn) {
    logoutBtn.onclick = (e) => {
      e.preventDefault();
      logout();
    };
  }
}

// Delete Account Listener
const deleteAccountBtn = document.getElementById("deleteAccountBtn");
if (deleteAccountBtn) {
  deleteAccountBtn.addEventListener("click", async () => {
    const result = await Swal.fire({
      title: "Delete Your Account?",
      text: "This action is PERMANENT. All your events, media, and data will be erased forever.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#ef4444",
      cancelButtonColor: "#64748b",
      confirmButtonText: "Yes, Delete Everything",
      cancelButtonText: "Cancel",
    });

    if (result.isConfirmed) {
      try {
        const response = await apiFetch("/api/clients/delete-profile.php", {
          method: "DELETE",
        });
        const data = await response.json();
        if (data.success) {
          Swal.fire(
            "Deleted",
            "Your account has been successfully removed.",
            "success",
          ).then(() => {
            window.location.href = "/client/login.html";
          });
        } else {
          Swal.fire("Error", data.message || "Deletion failed", "error");
        }
      } catch (e) {
        Swal.fire("Error", "An unexpected error occurred.", "error");
      }
    }
  });
}

// Centralized Global Listeners (Export, Notifications, Profile)
const globalExportBtn = document.getElementById("globalExportBtn");
if (globalExportBtn) {
  globalExportBtn.addEventListener("click", (e) => {
    e.preventDefault();
    if (typeof showExportModal === "function") {
      showExportModal("Data");
    } else {
      Swal.fire("Error", "Export system is not loaded properly.", "error");
    }
  });
}

function initProfileClick() {
  const userProfile = document.querySelector(".user-profile");
  if (!userProfile) return;

  // Ensure relative positioning so dropdown anchors correctly
  userProfile.style.position = "relative";
  userProfile.style.cursor = "pointer";
  userProfile.style.userSelect = "none";

  // Wrap the avatar so we can slot the chevron directly beneath it
  const avatarEl = userProfile.querySelector(".user-avatar");
  if (avatarEl && !userProfile.querySelector(".avatar-trigger-wrap")) {
    const wrap = document.createElement("div");
    wrap.className = "avatar-trigger-wrap";
    // Inline-flex + column keeps chevron below avatar; inline style beats .avatar-wrapper class
    wrap.style.cssText =
      "position:relative;display:inline-flex;flex-direction:column;align-items:center;gap:1px;";
    userProfile.insertBefore(wrap, avatarEl);
    wrap.appendChild(avatarEl);

    // Chevron arrow below the avatar
    const chevron = document.createElement("span");
    chevron.id = "inlineDropdownChevron";
    chevron.style.cssText =
      "display:block;line-height:1;color:#9ca3af;transition:transform 0.2s;margin-top:1px;";
    chevron.innerHTML = "";
    wrap.appendChild(chevron);
  }

  // Build dropdown once
  if (!document.getElementById("inlineProfileDropdown")) {
    const drop = document.createElement("div");
    drop.id = "inlineProfileDropdown";
    drop.style.cssText = [
      "display:none;position:absolute;top:calc(100% + 8px);right:0;",
      "min-width:220px;background:#fff;border-radius:14px;",
      "box-shadow:0 8px 32px rgba(0,0,0,0.14);border:1px solid #f1f5f9;",
      "z-index:9999;overflow:hidden;",
    ].join("");

    drop.innerHTML = `
            <div style="padding:14px 16px 10px;border-bottom:1px solid #f1f5f9;">
                <div id="inlineDropEmail" style="font-weight:700;font-size:0.9rem;color:#111827;word-break:break-all;"></div>
                <div id="inlineDropCid"   style="font-size:0.72rem;color:#6b7280;font-family:monospace;margin-top:2px;"></div>
            </div>
            <a href="#" onclick="if(typeof showProfileEditModal==='function')showProfileEditModal();document.getElementById('inlineProfileDropdown').style.display='none';return false;"
               style="display:flex;align-items:center;gap:10px;padding:11px 16px;color:#374151;text-decoration:none;font-size:0.88rem;font-weight:600;transition:background 0.15s;"
               onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
                Profile
            </a>


            <div style="border-top:1px solid #f1f5f9;"></div>
            <a href="#" onclick="logout();return false;"
               style="display:flex;align-items:center;gap:10px;padding:11px 16px;color:#ef4444;text-decoration:none;font-size:0.88rem;font-weight:600;transition:background 0.15s;"
               onmouseover="this.style.background='#fff1f2'" onmouseout="this.style.background='transparent'">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                Logout
            </a>`;
    userProfile.appendChild(drop);
  }

  // <a href="#" onclick="if(typeof window.showDisputeCenter==='function')window.showDisputeCenter();else window.location.assign('/client/payments.html?tab=refunds');return false;"
  //              style="display:flex;align-items:center;gap:10px;padding:11px 16px;color:#374151;text-decoration:none;font-size:.88rem;font-weight:600;"> Support Center</a>

  // Toggle open/close
  userProfile.addEventListener("click", function (e) {
    e.stopPropagation();
    const drop = document.getElementById("inlineProfileDropdown");
    const chevron = document.getElementById("inlineDropdownChevron");
    const isOpen = drop && drop.style.display === "block";
    if (drop) drop.style.display = isOpen ? "none" : "block";
    if (chevron)
      chevron.style.transform = isOpen ? "rotate(0deg)" : "rotate(180deg)";
  });

  // Close on outside click
  document.addEventListener("click", function (e) {
    if (!userProfile.contains(e.target)) {
      const drop = document.getElementById("inlineProfileDropdown");
      const chevron = document.getElementById("inlineDropdownChevron");
      if (drop) drop.style.display = "none";
      if (chevron) chevron.style.transform = "rotate(0deg)";
    }
  });
}

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

window.copyToClipboard = function (text, successMsg) {
  if (!text) return;
  navigator.clipboard
    .writeText(text)
    .then(() => {
      if (typeof showNotification === "function") {
        showNotification(successMsg, "success");
      } else {
        Swal.fire({
          toast: true,
          position: "top-end",
          icon: "success",
          title: successMsg,
          showConfirmButton: false,
          timer: 2000,
        });
      }
    })
    .catch((err) => {
      Swal.fire("Error", "Failed to copy to clipboard", "error");
    });
};

/**
 * Updates any elements showing the client name to avoid "undefined"
 */
function updateClientNameDisplay(user) {
  if (!user) return;
  const name = user.name || user.business_name || "Client";

  // Update elements with class 'client-name' or 'profile-name'
  document.querySelectorAll(".client-name, #profileName").forEach((el) => {
    el.textContent = name;
  });

  // Update greeting if it exists
  const greeting = document.querySelector(".greeting-text");
  if (greeting) {
    greeting.textContent = `Welcome, ${name}`;
  }
}
window.updateClientNameDisplay = updateClientNameDisplay;

function syncVerificationBanner(user) {
  const banner = document.getElementById("verificationBanner");
  const createBtn = document.getElementById("dashboardCreateEventBtn");
  if (!banner) return;

  const status = user.verification_status; // 'pending', 'verified', 'rejected'

  if (status === "verified") {
    banner.style.display = "none";
    if (createBtn) {
      createBtn.disabled = false;
      createBtn.style.opacity = "1";
      createBtn.style.cursor = "pointer";
      createBtn.style.filter = "none";
      createBtn.title = "Create a new event";
    }
    return;
  }

  // Messaging and Styling
  const isRejected = status === "rejected";
  const message = isRejected
    ? '<strong>Account Rejected:</strong> Please update your profile with valid details and resubmit for review. <a href="javascript:void(0)" onclick="window.showProfileEditModal()" style="color:inherit; text-decoration:underline; font-weight:800; margin-left:10px;">Fix Profile</a>'
    : '<strong>Account Pending:</strong> Your profile is currently under review. Event creation will be enabled once approved. <a href="javascript:void(0)" onclick="window.showProfileEditModal()" style="color:inherit; text-decoration:underline; font-weight:800; margin-left:10px;">Review Profile</a>';

  banner.style.background = isRejected ? "#fee2e2" : "#fff3cd";
  banner.style.border = `1px solid ${isRejected ? "#fca5a5" : "#ffeeba"}`;
  banner.style.color = isRejected ? "#991b1b" : "#856404";

  const textEl = document.getElementById("verificationBannerText");
  if (textEl) textEl.innerHTML = message;

  banner.style.display = "block";

  // Gate the create button
  if (createBtn) {
    createBtn.disabled = true;
    createBtn.style.opacity = "0.5";
    createBtn.style.cursor = "not-allowed";
    createBtn.style.filter = "grayscale(1)";
    createBtn.title = isRejected
      ? "Fix your profile to re-apply"
      : "Awaiting admin approval";
  }
}
window.syncVerificationBanner = syncVerificationBanner;

function handleCreateEventClick() {
  // Single gate for account verification
  const user = storage.getUser();
  if (!user) return;

  if (user.verification_status !== "verified") {
    Swal.fire({
      title: "Account Not Approved",
      html:
        user.verification_status === "rejected"
          ? "<strong>Your account was rejected.</strong><br>Please update your profile and resubmit for administrator review before creating events."
          : "<strong>Your account is pending approval.</strong><br>You cannot create events until an administrator approves your profile.",
      icon: "warning",
      confirmButtonColor: "#722f37",
      confirmButtonText: "Update My Profile",
      showCancelButton: true,
      cancelButtonText: "Close",
      cancelButtonColor: "#9ca3af",
    }).then((result) => {
      if (
        result.isConfirmed &&
        typeof window.showProfileEditModal === "function"
      ) {
        window.showProfileEditModal();
      }
    });
    return;
  }

  if (typeof window.showCreateEventModal === "function") {
    window.showCreateEventModal();
  }
}
window.handleCreateEventClick = handleCreateEventClick;

/**
 * Mobile Sidebar Toggle Functionality
 * Handles showing/hiding sidebar on mobile devices
 */
document.addEventListener("DOMContentLoaded", () => {
  initMobileSidebar();
  initDesktopSidebar();
});

/**
 * Desktop Sidebar Toggle
 */
function initDesktopSidebar() {
  const header = document.querySelector(".header");
  const sidebar = document.querySelector(".sidebar");
  const mainLayout = document.querySelector(".main-layout");

  if (!header || !sidebar || !mainLayout) return;

  let toggleBtn = document.getElementById("sidebarToggle");
  if (!toggleBtn) {
    toggleBtn = document.createElement("button");
    toggleBtn.id = "sidebarToggle";
    toggleBtn.className = "sidebar-toggle-btn";
    toggleBtn.innerHTML =
      '<i data-lucide="chevron-left" id="sidebarToggleIcon"></i>';
    toggleBtn.style.cssText = `
            position: absolute;
            bottom: 6rem;
            right: 1.5rem;
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.1);
            color: #fff;
            cursor: pointer;
            width: 38px;
            height: 38px;
            border-radius: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.3s ease;
            z-index: 1001;
        `;
    sidebar.appendChild(toggleBtn);
  }

  const isCollapsed = localStorage.getItem("sidebar_collapsed") === "true";
  if (isCollapsed && window.innerWidth > 768) {
    sidebar.classList.add("collapsed");
    mainLayout.classList.add("collapsed");

    const icon = document.getElementById("sidebarToggleIcon");
    if (icon) icon.setAttribute("data-lucide", "chevron-right");
    // Logo state (wordmark vs mark-only) is handled purely by CSS via the
    // collapsed class — see public/assets/brand/sidebar-logo.css
  }

  toggleBtn.addEventListener("click", () => {
    const nowCollapsed = sidebar.classList.toggle("collapsed");
    mainLayout.classList.toggle("collapsed");
    localStorage.setItem("sidebar_collapsed", nowCollapsed);

    const icon = document.getElementById("sidebarToggleIcon");
    if (icon) {
      icon.setAttribute(
        "data-lucide",
        nowCollapsed ? "chevron-right" : "chevron-left",
      );
      if (window.lucide) window.lucide.createIcons();
    }

    // Logo swaps between wordmark and mark-only via CSS (collapsed class) —
    // no inline style manipulation needed here.
  });

  // Wire up Create Event buttons - remove inline onclick dependency
  const btns = ["dashboardCreateEventBtn", "eventsCreateEventBtn"];
  btns.forEach((id) => {
    const btn = document.getElementById(id);
    if (btn) {
      btn.onclick = null; // Clear any old inline handler
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        handleCreateEventClick();
      });
    }
  });

  if (window.lucide) window.lucide.createIcons();
}

/**
 * Mobile Sidebar Toggle Functionality
 */
function initMobileSidebar() {
  // Check if we're on a mobile device
  function isMobile() {
    return window.innerWidth <= 767;
  }

  // Create hamburger button if on mobile
  if (isMobile()) {
    createMobileMenuButton();
  }

  // Handle window resize to add/remove hamburger button
  window.addEventListener(
    "resize",
    debounce(() => {
      const hamburger = document.getElementById("mobileMenuToggle");
      if (isMobile() && !hamburger) {
        createMobileMenuButton();
      } else if (!isMobile() && hamburger) {
        hamburger.remove();
        closeMobileSidebar();
      }
    }, 250),
  );

  // Close sidebar when clicking outside
  document.addEventListener("click", (e) => {
    const sidebar = document.querySelector(".sidebar");
    const hamburger = document.getElementById("mobileMenuToggle");
    if (sidebar && hamburger && sidebar.classList.contains("active")) {
      if (!sidebar.contains(e.target) && !hamburger.contains(e.target)) {
        closeMobileSidebar();
      }
    }
  });

  // Close sidebar when clicking on a menu item (navigation)
  const menuItems = document.querySelectorAll(".menu-item a");
  menuItems.forEach((item) => {
    // Mark navigation initiated from sidebar to avoid immediate auth-guard redirect loop
    item.addEventListener("click", () => {
      // Mark navigation initiated from sidebar to avoid immediate auth-guard redirect loop
      try {
        sessionStorage.setItem("skip_auth_redirect", "1");
      } catch (err) {}
      try {
        localStorage.setItem("skip_auth_redirect", Date.now().toString());
      } catch (err) {}
      if (isMobile()) {
        closeMobileSidebar();
      }
    });
  });
}

function createMobileMenuButton() {
  const header = document.querySelector(".header");
  if (!header || document.getElementById("mobileMenuToggle")) return;

  const hamburger = document.createElement("button");
  hamburger.id = "mobileMenuToggle";
  hamburger.className = "mobile-menu-toggle";
  hamburger.innerHTML =
    '<i data-lucide="menu" style="width: 24px; height: 24px;"></i>';
  hamburger.style.cssText = `
        background: none;
        border: none;
        color: var(--client-text-main);
        cursor: pointer;
        font-size: 1.5rem;
        padding: 0.5rem;
        display: flex;
        align-items: center;
        margin-left: 1rem;
    `;

  hamburger.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleMobileSidebar();
  });

  // Insert at the beginning of header (before search)
  const headerSearch = header.querySelector(".header-search");
  if (headerSearch) {
    header.insertBefore(hamburger, headerSearch);
  } else {
    header.insertBefore(hamburger, header.firstChild);
  }

  // Reinitialize lucide icons
  if (typeof lucide !== "undefined" && lucide.createIcons) {
    lucide.createIcons();
  }
}

function toggleMobileSidebar() {
  const sidebar = document.querySelector(".sidebar");
  if (sidebar) {
    sidebar.classList.toggle("active");
  }
}

function closeMobileSidebar() {
  const sidebar = document.querySelector(".sidebar");
  if (sidebar) {
    sidebar.classList.remove("active");
  }
}

window.toggleMobileSidebar = toggleMobileSidebar;
window.closeMobileSidebar = closeMobileSidebar;

// ============================================================================
// Network State Resync Hook
// ============================================================================
window.addEventListener("online", async () => {
  console.log("Network connection restored. Syncing offline states...");
  if (typeof showNotification === "function") {
    showNotification("Back online. Syncing changes...", "success");
  }

  // Example offline action track: JSON array in localStorage
  const offlineActionsStr = localStorage.getItem("eventra_offline_actions");
  if (offlineActionsStr) {
    try {
      const actions = JSON.parse(offlineActionsStr);
      if (Array.isArray(actions) && actions.length > 0) {
        // Sync with PHP backend
        const response = await fetch("/api/health.php?sync=true", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ actions }),
        });

        if (response.ok) {
          console.log("Offline actions synced successfully.");
          localStorage.removeItem("eventra_offline_actions");
          if (typeof showNotification === "function") {
            showNotification("Offline changes synced successfully.", "success");
          }
          // Trigger UI notification refresh
          if (
            window.notificationManager &&
            typeof window.notificationManager.fetchNotifications === "function"
          ) {
            window.notificationManager.fetchNotifications();
          }
        }
      }
    } catch (e) {
      console.error("Failed to sync offline actions", e);
    }
  }
});

window.addEventListener("offline", () => {
  console.warn("Network connection lost. Actions will be tracked offline.");
  if (typeof showNotification === "function") {
    showNotification(
      "You are offline. Changes will sync when connection is restored.",
      "warning",
    );
  }
});

/* ---------------------------------------------------------------------------
   Passed-events Archive — opens as a MODAL, in place.
   Previously this pointed at a separate archive page, which 404'd behind the
   site's URL rewriting and forced an unnecessary navigation. Any link whose
   href contains "archive" now opens this dialog instead.
   --------------------------------------------------------------------------- */
(function () {
  if (window.__eventoutArchiveBound) return;
  window.__eventoutArchiveBound = true;

  var modal = null, body = null, cache = null;

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function money(v) {
    var n = effectivePrice(v);
    return n <= 0 ? 'Free' : '\u20a6' + n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  function effectivePrice(event) {
    if (event && typeof event === 'object') {
      return Math.max(Number(event.price || 0), Number(event.regular_price || 0), Number(event.vip_price || 0), Number(event.premium_price || 0));
    }
    return Number(event || 0);
  }
  function imageOf(event) {
    if (!event || !event.image_path) return '';
    return typeof getImageUrl === 'function' ? getImageUrl(event.image_path) : '/' + String(event.image_path).replace(/^\/+/, '');
  }
  function dateOf(v) {
    if (!v) return '\u2014';
    var d = new Date(v);
    return isNaN(d) ? v : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }
  function closeBtn(id) {
    return '<button id="' + id + '" style="float:right;border:0;background:#f3f4f6;border-radius:10px;width:34px;height:34px;cursor:pointer;font-size:1rem;">\u2715</button>';
  }

  function ensureModal() {
    if (modal) return;
    modal = document.createElement('div');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(9,12,20,.55);display:none;align-items:center;justify-content:center;padding:1rem;z-index:100000;';
    body = document.createElement('div');
    body.style.cssText = 'background:#fff;border-radius:18px;max-width:800px;width:100%;max-height:88vh;overflow:auto;padding:1.4rem;font-family:inherit;color:#111827;';
    modal.appendChild(body);
    document.body.appendChild(modal);
    modal.addEventListener('click', function (e) { if (e.target === modal) close(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
  }

  function close() { if (modal) modal.style.display = 'none'; }

  function fields(e) {
    return [
      ['Event name', e.event_name], ['Event ID', e.custom_id || ('#' + e.id)],
      ['Organizer', e.organizer_name || e.organizer_contact || '\u2014'],
      ['Date passed / event date', dateOf(e.event_date)], ['Time', e.event_time || '\u2014'],
      ['Price', money(e)],
      ['Attendees', (e.attendee_count || 0) + (e.max_capacity ? ' of ' + e.max_capacity : '')],
      ['Tickets sold', e.tickets_sold || 0], ['Revenue', money(e.revenue)],
      ['Category', e.category || '\u2014'],
      ['Venue', [e.location || e.address, e.state].filter(Boolean).join(', ') || '\u2014'],
      ['Status', e.status || '\u2014'], ['Date created', dateOf(e.created_at)],
      ['Archived on', e.deleted_at ? dateOf(e.deleted_at) : 'Not yet purged']
    ];
  }

  function showDetail(e) {
    body.innerHTML = closeBtn('archiveBack').replace('\u2715', '\u2190')
      + '<span style="display:inline-block;padding:.2rem .65rem;border-radius:999px;background:#ff4d5a1a;color:#ff4d5a;font-weight:700;font-size:.72rem;">Passed event</span>'
      + (imageOf(e) ? '<img src="' + esc(imageOf(e)) + '" alt="" style="width:100%;height:190px;object-fit:cover;border-radius:14px;margin-top:.9rem;display:block;" onerror="this.style.display=\'none\'">' : '')
      + '<h2 style="margin:.75rem 0 0;font-size:1.3rem;font-weight:800;">' + esc(e.event_name) + '</h2>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:.85rem 1.25rem;margin-top:1.1rem;">'
      + fields(e).map(function (r) {
          return '<div><div style="font-size:.7rem;text-transform:uppercase;letter-spacing:.04em;color:#6b7280;font-weight:700;">' + esc(r[0]) + '</div>'
            + '<div style="font-size:.95rem;font-weight:600;word-break:break-word;">' + esc(r[1]) + '</div></div>';
        }).join('')
      + '</div>';
    document.getElementById('archiveBack').onclick = showList;
  }

  function drawRows(q) {
    q = (q || '').toLowerCase().trim();
    var evs = (cache || []).filter(function (e) {
      return !q
        || (e.event_name || '').toLowerCase().indexOf(q) > -1
        || (e.state || '').toLowerCase().indexOf(q) > -1;
    });
    var host = document.getElementById('archiveRows');
    if (!host) return;
    if (!evs.length) {
      host.innerHTML = '<div style="padding:2.5rem 1rem;text-align:center;color:#6b7280;">No passed events yet.</div>';
      return;
    }
    host.innerHTML = evs.map(function (e, i) {
      return '<div data-i="' + i + '" style="display:grid;grid-template-columns:2.4fr 1fr 1fr 1fr;gap:.6rem;padding:.7rem .5rem;border-bottom:1px solid #eef0f4;cursor:pointer;">'
        + '<div style="display:flex;align-items:center;gap:.6rem;"><img src="' + esc(imageOf(e)) + '" alt="" style="width:42px;height:32px;object-fit:cover;border-radius:6px;background:#f3f4f6;" onerror="this.style.display=\'none\'"><strong>' + esc(e.event_name) + '</strong></div>'
        + '<div style="color:#6b7280;font-size:.85rem;">' + esc(dateOf(e.event_date)) + '</div>'
        + '<div style="color:#6b7280;font-size:.85rem;">' + esc(money(e)) + '</div>'
        + '<div style="color:#6b7280;font-size:.85rem;">' + esc(e.tickets_sold || 0) + ' tickets</div></div>';
    }).join('');
    Array.prototype.forEach.call(host.querySelectorAll('[data-i]'), function (row) {
      row.onclick = function () { showDetail(evs[Number(row.getAttribute('data-i'))]); };
    });
  }

  function showList() {
    body.innerHTML = closeBtn('archiveClose')
      + '<h2 style="margin:.2rem 0 .1rem;font-size:1.35rem;font-weight:800;">Archive</h2>'
      + '<div style="color:#6b7280;font-size:.85rem;margin-bottom:.9rem;">Every event that has already taken place \u00b7 ' + (cache || []).length + '</div>'
      + '<input id="archiveSearch" placeholder="Search archived events" style="width:100%;box-sizing:border-box;padding:.6rem .85rem;border:1px solid #e5e7eb;border-radius:10px;font:inherit;margin-bottom:.5rem;">'
      + '<div id="archiveRows"></div>';
    document.getElementById('archiveClose').onclick = close;
    document.getElementById('archiveSearch').oninput = function () { drawRows(this.value); };
    drawRows('');
  }

  function open() {
    ensureModal();
    modal.style.display = 'flex';
    if (cache) { showList(); return; }
    body.innerHTML = '<div style="padding:2.5rem 1rem;text-align:center;color:#6b7280;">Loading archive\u2026</div>';
    apiFetch('/api/events/get-events.php?archived=1&limit=all')
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (!data.success) throw new Error(data.message || 'Could not load the archive.');
        cache = data.events || [];
        showList();
      })
      .catch(function (err) {
        body.innerHTML = closeBtn('archiveClose')
          + '<div style="padding:2.5rem 1rem;text-align:center;color:#b91c1c;">' + esc(err.message) + '</div>';
        document.getElementById('archiveClose').onclick = close;
      });
  }

  document.addEventListener('click', function (ev) {
    var link = ev.target && ev.target.closest ? ev.target.closest('a[href*="archive"]') : null;
    if (!link) return;
    ev.preventDefault();
    open();
  });
})();

// ---- Event suggestions (published events with high ticket demand) ----
/* ─ Recommendation banner: ranked published events, first thing users see ─ */
let _clientSuggestionEls = [];

function loadEventSuggestions() {
  _fetchPublishedClientEvents()
    .then(_renderClientSuggestions)
    .catch(() => {});
}

function _fetchPublishedClientEvents() {
  return (async () => {
    let res;
    try { res = await fetch('/api/events/get-events.php?status=published&limit=12'); }
    catch (_) { return []; }
    if (!res || !res.ok) return [];
    let data;
    try { data = await res.json(); } catch (_) { return []; }
    if (!data || !data.success || !Array.isArray(data.events)) return [];
    return data.events
      .filter(e => (e.sales_count || 0) > 0 || (e.attendee_count || 0) > 0)
      .sort((a, b) =>
        (b.sales_count || 0) - (a.sales_count || 0) ||
        (b.attendee_count || 0) - (a.attendee_count || 0)
      )
      .slice(0, 4);
  })();
}

function _renderClientSuggestions(events) {
  if (!events || !Array.isArray(events) || events.length === 0) return;
  const banner = document.getElementById('event-suggestions-banner');
  if (!banner) return;
  _clientSuggestionEls = [];
  let html = '';
  events.forEach(s => {
    const img = (s.image_path && s.image_path.trim())
      ? '/' + s.image_path.replace(/^(?:\.\.\/|\.\/)+/, '').replace(/^\/+/, '')
      : 'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=400&h=220&fit=crop';
    const tickets = s.sales_count ?? s.ticket_count ?? 0;
    const attendees = s.attendee_count ?? 0;
    const date = s.event_date
      ? new Date(s.event_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      : 'TBA';
    html += `
      <div class="suggestion-card" data-event-id="${s.id}"
           onclick="window.location.href='/client/events/event-details.html?event=${s.id}'">
        <div class="suggestion-img" style="background-image:url('${img}')"></div>
        <div class="suggestion-body">
          <div class="suggestion-label">${tickets} tickets · ${attendees} attending</div>
          <div class="suggestion-title">${escapeHtml(s.event_name)}</div>
          <div class="suggestion-date">${date}</div>
        </div>
      </div>`;
  });
  const existingScroll = banner.querySelector('.suggestions-scroll');
  if (existingScroll) {
    const existingIds = new Set(
      Array.from(existingScroll.querySelectorAll('.suggestion-card'))
        .map(el => el.getAttribute('data-event-id'))
        .filter(Boolean)
    );
    const fresh = events.filter(s => !existingIds.has(String(s.id)));
    if (fresh.length === 0) return;
    const fragment = document.createDocumentFragment();
    fresh.forEach(s => {
      const el = document.createElement('div');
      el.className = 'suggestion-card';
      el.setAttribute('data-event-id', String(s.id));
      el.innerHTML = _suggestionCardInner(s);
      fragment.appendChild(el);
      _clientSuggestionEls.push(el);
    });
    existingScroll.prepend(fragment);
  } else {
    banner.innerHTML = `<div class="suggestions-scroll">${html}</div>`;
    _clientSuggestionEls = Array.from(banner.querySelectorAll('.suggestion-card'));
  }
}

function _suggestionCardInner(s) {
  const img = (s.image_path && s.image_path.trim())
    ? '/' + s.image_path.replace(/^(?:\.\.\/|\.\/)+/, '').replace(/^\/+/, '')
    : 'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=400&h=220&fit=crop';
  const tickets = s.sales_count ?? s.ticket_count ?? 0;
  const attendees = s.attendee_count ?? 0;
  const date = s.event_date
    ? new Date(s.event_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : 'TBA';
  return `
    <div class="suggestion-img" style="background-image:url('${img}')"></div>
    <div class="suggestion-body">
      <div class="suggestion-label">${tickets} tickets · ${attendees} attending</div>
      <div class="suggestion-title">${escapeHtml(s.event_name)}</div>
      <div class="suggestion-date">${date}</div>
    </div>`;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
