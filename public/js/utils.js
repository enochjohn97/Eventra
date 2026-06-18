// Utility functions

/**
 * Standardized Time Ago / Duration function
 * @param {string|number|Date} date - The date to compare with now
 * @param {boolean} shortForm - Whether to use short forms (e.g., "hr" instead of "hour")
 * @returns {string} - Formatted time ago string
 */
// Global variable to store server time offset
window.serverTimeOffset = 0;

window.NIGERIA_STATES = [
  'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue', 'Borno', 
  'Cross River', 'Delta', 'Ebonyi', 'Edo', 'Ekiti', 'Enugu', 'Gombe', 'Imo', 'Jigawa', 
  'Kaduna', 'Kano', 'Katsina', 'Kebbi', 'Kogi', 'Kwara', 'Lagos', 'Nasarawa', 'Niger', 
  'Ogun', 'Ondo', 'Osun', 'Oyo', 'Plateau', 'Sokoto', 'Taraba', 'Yobe', 'Zamfara', 'FCT'
];

window.EVENT_CATEGORIES = [
  'Business', 'Conference', 'Workshop', 'Seminar', 'Entertainment', 'Sports', 'Exhibition', 
  'Networking', 'Festival', 'Social', 'Educational', 'Personal', 'Religious', 
  'Cultural', 'Community', 'Concert', 'Other'
];

window.PRIORITY_TAGS = ['nearby', 'hot', 'upcoming', 'trending', 'featured'];

/**
 * Standardized Time Ago / Duration function
 * @param {string|number|Date} date - The date to compare with now
 * @param {boolean} shortForm - Whether to use short forms (e.g., "hr" instead of "hour")
 * @returns {string} - Formatted time ago string
 */
function timeAgo(date, shortForm = false) {
    if (!date) return 'Just now';
    
    let timestamp;
    if (typeof date === 'string') {
        // Handle ISO strings and MySQL datetime strings
        const validDateString = date.includes(' ') ? date.replace(' ', 'T') : date;
        timestamp = new Date(validDateString).getTime();
        
        // If parsing failed (e.g. invalid date or timezone issues), try adding Z if it looks like ISO but missing Z
        if (isNaN(timestamp) && !validDateString.includes('Z')) {
            timestamp = new Date(validDateString + 'Z').getTime();
        }
    } else if (date instanceof Date) {
        timestamp = date.getTime();
    } else {
        timestamp = date;
    }

    if (isNaN(timestamp)) return 'Recently';

    // Use server offset if available to ensure accurate relative time
    const now = new Date().getTime() + (window.serverTimeOffset || 0);
    const diffMs = now - timestamp;
    const seconds = Math.floor(diffMs / 1000);

    // Handle future dates (e.g. server clock slightly ahead or scheduled events)
    if (seconds < 0) {
        const absSeconds = Math.abs(seconds);
        if (absSeconds < 60) return 'In a few seconds';
        
        const absMinutes = Math.floor(absSeconds / 60);
        if (absMinutes < 60) return `In ${absMinutes} min${absMinutes > 1 ? 's' : ''}`;
        
        const absHours = Math.floor(absMinutes / 60);
        if (absHours < 24) return `In ${absHours} hr${absHours > 1 ? 's' : ''}`;
        
        const absDays = Math.floor(absHours / 24);
        if (absDays === 1) return 'Tomorrow';
        return `In ${absDays} days`;
    }

    if (seconds < 30) return 'Just now';
    if (seconds < 60) return `${seconds}s ago`;

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} min${minutes > 1 ? 's' : ''} ago`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
        const unit = shortForm ? 'hr' : 'hour';
        return `${hours} ${unit}${hours > 1 ? 's' : ''} ago`;
    }

    const days = Math.floor(hours / 24);
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;

    return new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Formats a UTC ISO 8601 date string to the user's local time string.
 * @param {string} utcString - The UTC date string from the database.
 * @param {object} options - Intl.DateTimeFormat options.
 * @returns {string} - Formatted local date/time string.
 */
function formatLocalDateTime(utcString, options = {}) {
    if (!utcString) return 'TBA';
    
    // Ensure the string is treated as UTC if it doesn't have a Z or offset
    const dateStr = (utcString.endsWith('Z') || utcString.includes('+') || (utcString.includes('-') && utcString.includes(':') && utcString.split('-').length > 3)) 
        ? utcString 
        : utcString.replace(' ', 'T') + 'Z';
        
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return utcString;

    const defaultOptions = {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    };

    return new Intl.DateTimeFormat('en-US', { ...defaultOptions, ...options }).format(date);
}

/**
 * Real-time timer to update all elements with data-timestamp attribute
 */
(function initRealtimeTimers() {
    if (typeof window === 'undefined') return;
    
    setInterval(() => {
        const timerElements = document.querySelectorAll('[data-timestamp]');
        timerElements.forEach(el => {
            const timestamp = el.getAttribute('data-timestamp');
            const shortForm = el.getAttribute('data-short-time') === 'true';
            if (timestamp) {
                el.textContent = timeAgo(timestamp, shortForm);
            }
        });
    }, 60000); // Update every minute
})();

// Export to window
window.timeAgo = timeAgo;


/**
 * Escape HTML special characters to prevent XSS
 * @param {string} str - String to escape
 * @returns {string} - Escaped string
 */
// Use var or attach to window to prevent re-declaration errors if loaded twice
if (typeof window.escapeHtml === 'undefined') {
    window.escapeHtml = function(text) {
        if (text === null || text === undefined) return '';
        const map = { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;' };
        return String(text).replace(/[&<>"']/g, m => map[m]);
    };
    // Maintain backward compatibility for any code using escapeHTML (all caps)
    window.escapeHTML = window.escapeHtml;
}

// Format currency
function formatCurrency(amount, currency = '₦') {
  return `${currency} ${amount.toLocaleString()}`;
}

// Format date
function formatDate(date) {
  if (!date) return 'TBA';
  const options = { year: 'numeric', month: 'long', day: 'numeric' };
  // Fix: Force local time for YYYY-MM-DD strings to avoid timezone shift
  const dateObj = (typeof date === 'string' && date.includes('-') && !date.includes('T')) 
    ? new Date(date + 'T00:00:00') 
    : new Date(date);
  return dateObj.toLocaleDateString('en-US', options);
}

// Debounce function for search
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

/**
 * Get normalized profile image URL with cache busting
 * @param {string} path - Database image path
 * @param {string} name - Fallback name for avatar
 * @returns {string} - Final URL
 */
function getProfileImg(path, name = '') {
  if (!path || path.trim() === '' || path === 'null' || path === 'undefined') {
    const fallbackName = name || 'User';
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(fallbackName)}&background=6366f1&color=fff&size=128&bold=true`;
  }

  // Handle external URLs (like Google profile pics)
  if (path.startsWith('http')) {
    // Avoid adding timestamp to external URLs to prevent 429 Too Many Requests
    return path;
  }

  let finalPath = path;
  
  // Normalize path
  if (!finalPath.startsWith('/')) {
    // If it starts with ../.. or public/, etc
    if (finalPath.startsWith('../../')) {
        finalPath = finalPath.replace('../../', '/');
    } else if (!finalPath.startsWith('/')) {
        finalPath = '/' + finalPath;
    }
  }

  // Ensure double slashes are removed
  finalPath = finalPath.replace(/\/\//g, '/');

  // Add cache header for local images only
  const timestamp = Date.now();
  const separator = finalPath.includes('?') ? '&' : '?';
  const urlPath = `${finalPath}${separator}t=${timestamp}`;
  
  // Ensure absolute URL if it starts with /
  if (urlPath.startsWith('/')) {
      return window.location.origin + urlPath;
  }
  return urlPath;
}

/**
 * Get normalized image URL for any image (event, ticket, media, etc)
 * @param {string} path - Database image path
 * @returns {string} - Final URL
 */
function getImageUrl(path) {
  if (!path || path.trim() === '' || path === 'null' || path === 'undefined') {
    return '';
  }

  // Handle external URLs and data URIs
  if (path.startsWith('http') || path.startsWith('data:')) {
    return path;
  }

  let finalPath = String(path).replace(/\\/g, '/');

  // Extract web path from absolute filesystem paths (Windows or Unix)
  const publicIdx = finalPath.toLowerCase().indexOf('/public/');
  if (publicIdx >= 0) {
    finalPath = finalPath.substring(publicIdx);
  }

  // Normalize relative paths
  if (finalPath.startsWith('../../')) {
    finalPath = finalPath.replace(/^\.\.\/\.\.\//, '/');
  } else if (!finalPath.startsWith('/')) {
    finalPath = '/' + finalPath;
  }

  finalPath = finalPath.replace(/\/\//g, '/');

  return window.location.origin + finalPath;
}

/**
 * Get verification badge HTML
 * @param {string} status - 'verified', 'pending', 'rejected'
 * @returns {string} - Badge HTML
 */
function getVerificationBadge(status) {
    if (!status || status === 'unverified') {
        return `
            <div class="verification-badge badge-unverified" title="Unverified Organizer" 
                 onclick="event.stopPropagation(); Swal.fire({title: 'Not Verified', text: 'This organizer has not completed their identity verification. Proceed with caution.', icon: 'warning', confirmButtonColor: '#6366f1'})">
                <i data-lucide="alert-triangle" style="color: #f59e0b;"></i>
            </div>
        `;
    }
    
    let icon = 'clock';
    let badgeClass = 'badge-pending';
    let title = 'Verification Pending';
    let onclick = '';

    if (status === 'verified') {
        icon = 'check';
        badgeClass = 'badge-verified';
        title = 'Verified Organizer';
    } else if (status === 'rejected') {
        icon = 'slash';
        badgeClass = 'badge-rejected';
        title = 'Verification Rejected';
        onclick = `onclick="event.stopPropagation(); Swal.fire({title: 'Verification Rejected', text: 'This organizer\'s verification was declined by admin. Proceed with extreme caution.', icon: 'error', confirmButtonColor: '#6366f1'})"`;
    } else if (status === 'pending') {
        icon = 'clock';
        badgeClass = 'badge-pending';
        title = 'Verification Pending';
        onclick = `onclick="event.stopPropagation(); Swal.fire({title: 'Verification Pending', text: 'This organizer\'s verification is currently being reviewed by our team.', icon: 'info', confirmButtonColor: '#6366f1'})"`;
    }

    return `
        <div class="verification-badge ${badgeClass}" title="${title}" ${onclick} style="cursor: pointer;">
            <i data-lucide="${icon}"></i>
        </div>
    `;
}


// Global listener for profile updates to refresh all avatars on the page
document.addEventListener('EventraProfileUpdated', (e) => {
    const { profile_pic, name } = e.detail;
    if (!profile_pic) return;

    // Refresh all elements with data-profile-sync="true"
    const syncedElements = document.querySelectorAll('[data-profile-sync="true"]');
    syncedElements.forEach(el => {
        const imgUrl = getProfileImg(profile_pic, name || el.alt || '');
        if (el.tagName === 'IMG') {
            el.src = imgUrl;
        } else {
            el.style.backgroundImage = `url(${imgUrl})`;
        }
    });

});

// Validate email
function isValidEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

// Show notification
function showNotification(message, type = 'info') {
  if (typeof Swal !== 'undefined') {
    Swal.fire({
      toast: true,
      position: 'top-end',
      icon: type === 'error' ? 'error' : type === 'success' ? 'success' : 'info',
      title: message,
      showConfirmButton: false,
      timer: 3000,
      timerProgressBar: true,
      background: '#ffffff',
      color: '#000000',
      customClass: {
        container: 'eventra-toast-container'
      },
      didOpen: (toast) => {
        toast.style.zIndex = '999999'; // Ensure above Google iframe
      }
    });
    return;
  }

  // Fallback to legacy notification if Swal is not loaded
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.textContent = message;
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 1rem 1.5rem;
    background-color: ${type === 'success' ? '#4caf50' : type === 'error' ? '#f44336' : '#2196f3'};
    color: white;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    z-index: 999999;
    animation: slideIn 0.3s ease;
  `;

  document.body.appendChild(notification);

  // Remove after 3 seconds
  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}



// Auth helpers - Rely on window.storage for consistency
function getRoleKeys() {
    return window.storage ? window.storage.getRoleKeys() : { user: 'user', token: 'auth_token' };
}

function getBasePath() {
    const path = window.location.pathname;
    // Current detection: if in /public/pages/ or /client/pages/ or /admin/pages/
    if (path.includes('/pages/')) return '../../';
    // If in /admin/ or /client/ root
    if (path.includes('/admin/') || path.includes('/client/')) return '../';
    // If in root or /public/ root
    return './';
}

function isAuthenticated() {
  if (!window.storage) return false;
  const user = window.storage.getUser();
  const token = window.storage.getToken();
  return !!(user && token);
}

// Trigger sync on load - Moved to AuthController.init() in main.js
// document.addEventListener('DOMContentLoaded', syncSession);

function handleAuthRedirect(targetURL) {
  if (!isAuthenticated()) {
    const effectiveTarget = targetURL || window.location.href;
    window.storage.set('redirect_after_login', effectiveTarget);
    
    // Use origin-based absolute URLs to avoid broken relative path resolution
    const origin = window.location.origin;
    if (effectiveTarget.includes('/admin/')) {
      window.location.href = origin + '/admin/pages/adminLogin.html';
    } else if (effectiveTarget.includes('/client/')) {
      window.location.href = origin + '/client/pages/clientLogin.html';
    } else {
      window.location.href = origin + '/public/pages/index.html?trigger=login';
    }
    return false;
  }
  return true;
}

// Centralized API Wrapper
async function apiFetch(url, options = {}) {
  // Ensure credentials are included by default for session support
  if (!options.credentials) options.credentials = 'include';
  
  // Add Portal Identity Header for unambiguous session resolution
  const path = window.location.pathname;
  let portal = 'user';
  if (path.includes('/admin/')) portal = 'admin';
  else if (path.includes('/client/')) portal = 'client';
  
  // Prepare headers
  const headers = {
    'X-Eventra-Portal': portal,
    'Accept': 'application/json', // Explicitly ask for JSON
    ...options.headers
  };

  // Automatically set Content-Type for JSON bodies if not provided
  if (options.body && typeof options.body === 'string' && !headers['Content-Type'] && !headers['content-type']) {
    try {
        // Double check if it's likely JSON
        if (options.body.trim().startsWith('{') || options.body.trim().startsWith('[')) {
            headers['Content-Type'] = 'application/json';
        }
    } catch (e) {}
  }
  
  // Add Authorization header if token exists
  const token = window.storage ? window.storage.getToken() : null;
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
    headers['X-Access-Token'] = token;
  }
  
  options.headers = headers;
  
  try {
    const response = await fetch(url, options);
    
    // Validate Response Type before handling 401
    const contentType = response.headers.get("content-type");
    const isJson = contentType && contentType.includes("application/json");
    
    // Handle 401 (Unauthorized) indicating session expiration
    // BUT: Only redirect if this is NOT a JSON API response (let API caller handle JSON errors)
    if (response.status === 401 && !isJson) {
      // Skip redirect for login endpoints themselves
      if (!url.includes('/login') && !url.includes('google-handler.php') && !url.includes('check-session')) {
        const path = window.location.pathname;
        const origin = window.location.origin;
        
        let loginPage;
        if (path.includes('/admin/')) {
          loginPage = origin + '/admin/pages/adminLogin.html';
        } else if (path.includes('/client/')) {
          loginPage = origin + '/client/pages/clientLogin.html';
        } else {
          loginPage = origin + '/public/pages/index.html';
        }
        
        if (path === new URL(loginPage).pathname || (path.includes('index.html') && loginPage.includes('index.html'))) {
           if (window.storage) window.storage.clearRoleSessions();
           return response;
        }

        const finalRedirect = loginPage + (loginPage.includes('?') ? '&' : '?') + 'error=session_timeout' + (loginPage.includes('index.html') ? '&trigger=login' : '');
        if (window.storage) window.storage.clearRoleSessions();
        window.location.href = finalRedirect;
        return null;
      }
    }

    if (!response.ok) {
      if (isJson) {
        const errorData = await response.json();
        throw new Error(errorData.message || `Server error: ${response.status}`);
      } else {
        const text = await response.text();
        throw new Error(`Server returned ${response.status} (HTML/Text). This usually means a routing error or a crash.`);
      }
    }

    if (!isJson && response.status !== 204) {
      // We don't throw here if it's a 200, but we should be careful
    }
    
    return response;
  } catch (error) {
    if (error.name === 'AbortError') return null;
    throw error;
  }
}


// Activity Tracker: Periodically ping the server on user interaction to extend session
(function initActivityTracker() {
  if (typeof window === 'undefined') return;
  
  let lastPing = 0;
  const pingInterval = 5 * 60 * 1000; // 5 minutes

  const refreshSession = debounce(async () => {
    const now = Date.now();
    // Only ping if at least 5 minutes have passed since last ping to avoid spamming
    if (now - lastPing < pingInterval) return;
    
    if (isAuthenticated()) {
      try {
        const basePath = getBasePath();
        // Us/api/auth/check-session as a heartbeat
        await apiFetch('/api/auth/check-session.php', { method: 'GET', cache: 'no-store' });
        lastPing = Date.now();
      } catch (e) {
      }
    }
  }, 2000);

  // Listen for common user interactions
  ['mousedown', 'keydown', 'scroll', 'touchstart'].forEach(event => {
    window.addEventListener(event, refreshSession, { passive: true });
  });
})();

// NOTE: Global modal-backdrop click-to-close removed intentionally.
// Each modal has its own explicit close button (×). The global handler
// was closing forms unexpectedly when users clicked near backdrop edges.

/**
 * Save form state to localStorage
 * @param {string} storageKey - The key to save under in localStorage
 * @param {string} formId - The ID of the form element (defaults to storageKey if not provided)
 */
function saveFormState(storageKey, formId = storageKey) {
    const form = document.getElementById(formId);
    if (!form) return;

    const formData = {};
    const elements = form.querySelectorAll('input, select, textarea');

    elements.forEach(el => {
        // Skip sensitive or unnecessary fields
        const isHiddenToPersist = el.type === 'hidden' && (el.name.includes('date') || el.name.includes('time') || el.name.includes('tag'));
        
        if (el.type === 'password' || el.type === 'file' || (el.type === 'hidden' && !isHiddenToPersist) || el.name === 'event_id') {
            return;
        }

        if (el.type === 'checkbox' || el.type === 'radio') {
            formData[el.name] = el.checked;
        } else {
            formData[el.name] = el.value;
        }
    });

    localStorage.setItem(`form_state_${storageKey}`, JSON.stringify(formData));
}

/**
 * Restore form state from localStorage
 * @param {string} storageKey - The key to restore from localStorage
 * @param {string} formId - The ID of the form element (defaults to storageKey if not provided)
 */
function restoreFormState(storageKey, formId = storageKey) {
    const savedData = localStorage.getItem(`form_state_${storageKey}`);
    if (!savedData) return;

    try {
        const formData = JSON.parse(savedData);
        const form = document.getElementById(formId);
        if (!form) return;

        Object.keys(formData).forEach(name => {
            const el = form.querySelector(`[name="${name}"]`);
            if (!el) return;

            if (el.type === 'checkbox' || el.type === 'radio') {
                el.checked = formData[name];
                // Trigger change event for interactive elements
                el.dispatchEvent(new Event('change', { bubbles: true }));
            } else {
                el.value = formData[name];
                // Trigger input/change events
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
            }
        });
    } catch (e) {
    }
}

/**
 * Clear form state from localStorage
 * @param {string} storageKey - The key to clear from localStorage
 */
function clearFormState(storageKey) {
    localStorage.removeItem(`form_state_${storageKey}`);
}

/**
 * Animate numbers (Count Up effect)
 */
function animateNumbers() {
    const elements = document.querySelectorAll('.count-up:not(.animated)');
    elements.forEach(el => {
        const text = el.innerText.replace(/[^0-9.]/g, '');
        const target = parseFloat(el.getAttribute('data-target') || text);
        if (isNaN(target)) return;
        
        el.classList.add('animated');
        let current = 0;
        const duration = 1500; // ms
        const steps = 60;
        const increment = target / steps;
        const stepTime = duration / steps;
        
        const timer = setInterval(() => {
            current += increment;
            if (current >= target) {
                el.innerText = (el.innerText.includes('₦') ? '₦' : '') + target.toLocaleString();
                clearInterval(timer);
            } else {
                el.innerText = (el.innerText.includes('₦') ? '₦' : '') + Math.floor(current).toLocaleString();
            }
        }, stepTime);
    });
}

// Export utilities
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    formatCurrency,
    formatDate,
    debounce,
    isValidEmail,
    showNotification,
    getRoleKeys,
    isAuthenticated,
    handleAuthRedirect,
    apiFetch
  };
}

/**
 * Custom Time Picker Logic
 * Used by create-event.js and modals.js
 */
function toggleTimePicker(dropdownId) {
    const dropdown = document.getElementById(dropdownId);
    if (!dropdown) return;
    
    const container = dropdown.closest('.time-picker-container');
    const display = container.querySelector('.time-picker-display');
    
    // Close other dropdowns if any
    document.querySelectorAll('.time-picker-dropdown').forEach(d => {
        if (d.id !== dropdownId) {
            d.classList.remove('active');
            const otherContainer = d.closest('.time-picker-container');
            if (otherContainer) {
                otherContainer.querySelector('.time-picker-display').classList.remove('active');
            }
        }
    });
    
    dropdown.classList.toggle('active');
    
    if (dropdown.classList.contains('active')) {
        display.classList.add('active');
        
        // Add one-time click listener to document to close when clicking outside
        const closePicker = (e) => {
            if (!container.contains(e.target)) {
                dropdown.classList.remove('active');
                display.classList.remove('active');
                document.removeEventListener('click', closePicker);
            }
        };
        setTimeout(() => document.addEventListener('click', closePicker), 10);
    } else {
        display.classList.remove('active');
    }
}

function selectHour(hour, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    container.querySelectorAll('.hours .time-btn').forEach(btn => btn.classList.remove('selected'));
    // Find the button with the hour text and select it
    // Handle both "4" and "04" if needed, but grid will use "1", "2", etc.
    const targetBtn = Array.from(container.querySelectorAll('.hours .time-btn')).find(b => b.textContent.trim() === hour.toString());
    if (targetBtn) targetBtn.classList.add('selected');
    
    updateTimeValue(containerId);
}

function selectMinute(minute, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    container.querySelectorAll('.minutes .time-btn').forEach(btn => btn.classList.remove('selected'));
    const targetBtn = Array.from(container.querySelectorAll('.minutes .time-btn')).find(b => b.textContent.trim() === minute.toString());
    if (targetBtn) targetBtn.classList.add('selected');
    
    updateTimeValue(containerId);
}

function selectAmPm(period, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    container.querySelectorAll('.time-picker-ampm .time-btn').forEach(btn => btn.classList.remove('selected'));
    const targetBtn = Array.from(container.querySelectorAll('.time-picker-ampm .time-btn')).find(b => b.textContent.toLowerCase().trim() === period.toLowerCase());
    if (targetBtn) targetBtn.classList.add('selected');
    
    updateTimeValue(containerId);
}

function updateTimeValue(containerId) {
    const container = document.getElementById(containerId);
    const hourBtn = container.querySelector('.hours .time-btn.selected');
    const minuteBtn = container.querySelector('.minutes .time-btn.selected');
    const ampmBtn = container.querySelector('.time-picker-ampm .time-btn.selected');
    const display = container.querySelector('.time-picker-display span');
    const input = container.querySelector('input[type="hidden"]');
    
    if (hourBtn && minuteBtn && ampmBtn) {
        const hText = hourBtn.textContent.trim();
        const mText = minuteBtn.textContent.trim();
        const pText = ampmBtn.textContent.trim().toLowerCase();
        
        const timeDisplay = `${hText}:${mText} ${pText}`;
        
        let h = parseInt(hText);
        const m = mText;
        
        if (pText === 'pm' && h < 12) h += 12;
        if (pText === 'am' && h === 12) h = 0;
        
        const timeValue24 = `${h.toString().padStart(2, '0')}:${m}`;
        
        input.value = timeValue24;
        display.textContent = timeDisplay;
        display.style.color = '#334155'; // Vibrant charcoal
        
        // Dispatches input event for persistence tracking
        input.dispatchEvent(new Event('input', { bubbles: true }));

        // Auto-close if all three are selected
        setTimeout(() => {
            const dropdown = container.querySelector('.time-picker-dropdown');
            const displayEl = container.querySelector('.time-picker-display');
            if (dropdown) dropdown.classList.remove('active');
            if (displayEl) displayEl.classList.remove('active');
        }, 500);
    } else {
        const h = hourBtn ? hourBtn.textContent.trim() : '--';
        const m = minuteBtn ? minuteBtn.textContent.trim() : '--';
        const p = ampmBtn ? ampmBtn.textContent.trim().toLowerCase() : '--';
        display.textContent = `${h}:${m} ${p}`;
    }
}

function setTimePickerValue(containerId, time) {
    const container = document.getElementById(containerId);
    if (!container || !time) return;

    // Expected format HH:mm or HH:mm:ss or "h:mm am/pm"
    let hour, minute, period;

    if (time.toLowerCase().includes('am') || time.toLowerCase().includes('pm')) {
        // "4:10 pm" format
        const parts = time.toLowerCase().split(/[:\s]/);
        hour = parts[0];
        minute = parts[1];
        period = parts[2];
    } else {
        // "HH:mm" format
        const parts = time.split(':');
        if (parts.length < 2) return;
        let hNum = parseInt(parts[0]);
        minute = parts[1].padStart(2, '0');
        
        if (hNum >= 12) {
            period = 'pm';
            if (hNum > 12) hNum -= 12;
        } else {
            period = 'am';
            if (hNum === 0) hNum = 12;
        }
        hour = hNum.toString();
    }

    // Round minute to nearest 5
    const minNum = parseInt(minute);
    const roundedMin = (Math.round(minNum / 5) * 5 % 60).toString().padStart(2, '0');

    // Select buttons
    container.querySelectorAll('.hours .time-btn').forEach(btn => {
        btn.classList.toggle('selected', btn.textContent === hour);
    });
    container.querySelectorAll('.minutes .time-btn').forEach(btn => {
        btn.classList.toggle('selected', btn.textContent === roundedMin);
    });
    container.querySelectorAll('.time-picker-ampm .time-btn').forEach(btn => {
        btn.classList.toggle('selected', btn.textContent.toLowerCase() === period.toLowerCase());
    });

    updateTimeValue(containerId);
}

// Export for window
window.toggleTimePicker = toggleTimePicker;
window.selectHour = selectHour;
window.selectMinute = selectMinute;
window.selectAmPm = selectAmPm;
window.updateTimeValue = updateTimeValue;
window.setTimePickerValue = setTimePickerValue;

// Add generic floating Support Chat Widget
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('floatingSupportChat')) return;

    const chatHTML = `
    <div id="floatingSupportChat" style="display: none; position: fixed; bottom: 90px; right: 20px; width: 420px; max-width: 95vw; height: 570px; max-height: 82vh; background: #fff; border-radius: 16px; box-shadow: 0 8px 32px rgba(0,0,0,0.18); z-index: 9999; flex-direction: column; overflow: hidden; border: 1px solid #e2e8f0; font-family: sans-serif;">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #0044ff 0%, #00d2ff 100%); color: white; padding: 18px 20px; padding-bottom: 30px; position: relative;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <img src="https://ui-avatars.com/api/?name=Eventra+Support&background=0044ff&color=fff" style="width: 44px; height: 44px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.35);">
                    <div>
                        <div style="font-size: 0.75rem; opacity: 0.85; letter-spacing: 0.5px;">Chat with</div>
                        <div style="font-size: 1.05rem; font-weight: 700;">Eventra Support</div>
                    </div>
                </div>
                <button onclick="window.toggleSupportChat()" title="Close" style="background: rgba(255,255,255,0.15); border: 1.5px solid rgba(255,255,255,0.35); color: white; cursor: pointer; font-size: 1rem; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.28)'" onmouseout="this.style.background='rgba(255,255,255,0.15)'">&#x2715;</button>
            </div>
            <div style="margin-top: 12px; font-size: 0.85rem; opacity: 0.9;">
                We typically reply in few minutes.
            </div>
            <!-- Curve effect -->
            <div style="position: absolute; bottom: 0; left: 0; right: 0; height: 20px; background: #fff; border-radius: 20px 20px 0 0;"></div>
        </div>
        
        <!-- Messages Area -->
        <div id="globalChatMessageList" style="flex: 1; overflow-y: auto; padding: 0 20px 20px; background: #fff; display: flex; flex-direction: column; gap: 12px;">
            <!-- Initial static messages -->
            <div style="align-self: flex-start; max-width: 85%;">
                <div style="background: #f1f5f9; color: #334155; padding: 12px 16px; border-radius: 16px 16px 16px 4px; font-size: 0.9rem;">
                    Thank you for reaching out to our customer support 👋
                </div>
            </div>
            <div style="align-self: flex-start; max-width: 85%;">
                <div style="background: #f1f5f9; color: #334155; padding: 12px 16px; border-radius: 16px 16px 16px 4px; font-size: 0.9rem;">
                    Your feedback is extremely valuable. Please, rate your conversation with our agent.
                </div>
            </div>
            <!-- Ratings Pill -->
            <div style="align-self: flex-start; margin-top: 4px; border: 1px solid #e2e8f0; border-radius: 24px; padding: 8px 16px; display: flex; gap: 12px; background: #fff; box-shadow: 0 2px 5px rgba(0,0,0,0.02);">
                <span style="font-size: 1.2rem; cursor: pointer;">😍</span>
                <span style="font-size: 1.2rem; cursor: pointer;">🙂</span>
                <span style="font-size: 1.2rem; cursor: pointer;">😐</span>
                <span style="font-size: 1.2rem; cursor: pointer;">😕</span>
                <span style="font-size: 1.2rem; cursor: pointer;">😡</span>
            </div>
            <!-- Dynamic Messages will be appended here -->
        </div>

        <!-- Input Area -->
        <div style="padding: 15px 20px; background: white; border-top: 1px solid #f1f5f9;">
            <div id="chatRefundStatusContainer" style="padding: 10px; margin-bottom: 10px; text-align: center; display: none; font-size: 0.85rem; border-radius: 8px;"></div>
            
            <div style="display: flex; align-items: center; gap: 10px;">
                <button style="background: none; border: none; color: #94a3b8; cursor: pointer; padding: 0; font-size: 1.1rem;">📎</button>
                <button style="background: none; border: none; color: #94a3b8; cursor: pointer; padding: 0; font-size: 1.1rem;">💡</button>
                <button style="background: none; border: none; color: #94a3b8; cursor: pointer; padding: 0; font-size: 1.1rem;">😊</button>
                
                <input type="text" id="globalChatInput" placeholder="Enter your message..." style="flex: 1; padding: 8px; border: none; outline: none; font-size: 0.9rem; color: #334155;">
                
                <button id="btnSendGlobalChat" style="width: 36px; height: 36px; border-radius: 50%; background: #0044ff; color: white; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 6px rgba(0,102,255,0.3); flex-shrink: 0;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                </button>
            </div>
            <div style="text-align: center; margin-top: 12px; font-size: 0.7rem; color: #94a3b8;">
                Powered by <span style="font-weight: 700; color: #0044ff;">Eventra</span>
            </div>
            
            <div id="chatTicketActions" style="display: flex; justify-content: space-between; display: none; margin-top: 10px;">
                <button id="btnEscalateAdmin" style="background:none; border:none; color:#f59e0b; font-size:0.85rem; font-weight:600; cursor:pointer; display:flex; align-items:center; gap:5px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg> Escalate</button>
                <button id="btnRequestRefund" style="background:none; border:none; color:#ef4444; font-size:0.85rem; font-weight:600; cursor:pointer; display:flex; align-items:center; gap:5px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 2v6h6"></path><path d="M21 12A9 9 0 0 0 6 5.3L3 8"></path><path d="M21 22v-6h-6"></path><path d="M3 12a9 9 0 0 0 15 6.7l3-2.7"></path></svg> Refund</button>
            </div>
        </div>
    </div>
    <!-- Floating toggle button -->
    <button id="btnToggleFloatingChat" onclick="window.toggleSupportChat()" style="position: fixed; bottom: 20px; right: 20px; width: 60px; height: 60px; border-radius: 50%; background: linear-gradient(135deg, #0044ff 0%, #00d2ff 100%); color: white; border: none; box-shadow: 0 4px 12px rgba(0, 68, 255, 0.3); cursor: pointer; display: flex; align-items: center; justify-content: center; z-index: 9998; transition: transform 0.2s;">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
    </button>
    `;

    document.body.insertAdjacentHTML('beforeend', chatHTML);

    // Chat functionality
    let chatInterval = null;
    let currentTicket = 'general';
    let currentChatContextId = null;

    window.toggleSupportChat = function(ticketId = 'general') {
        const chat = document.getElementById('floatingSupportChat');
        currentTicket = ticketId;
        
        // Show/hide ticket actions based on if it's a specific ticket
        const actions = document.getElementById('chatTicketActions');
        if (actions) {
            actions.style.display = ticketId !== 'general' ? 'flex' : 'none';
        }

        if (chat.style.display === 'none' || chat.style.display === '') {
            chat.style.display = 'flex';
            document.getElementById('btnToggleFloatingChat').style.transform = 'scale(0)';
            loadGlobalMessages();
            if(chatInterval) clearInterval(chatInterval);
            chatInterval = setInterval(loadGlobalMessages, 3000);
        } else {
            chat.style.display = 'none';
            document.getElementById('btnToggleFloatingChat').style.transform = 'scale(1)';
            if(chatInterval) clearInterval(chatInterval);
        }
    };

    // Override the old openSupportChat if it exists so it uses the new widget
    window.openSupportChat = window.toggleSupportChat;

    async function loadGlobalMessages() {
        try {
            const res = await fetch('/api/chat.php?ticket_id=' + encodeURIComponent(currentTicket), { credentials: 'include' });
            const data = await res.json();
            if (data.success) {
                if (data.chat) currentChatContextId = data.chat.id;
                if (data.messages && data.messages.length > 0) {
                    const list = document.getElementById('globalChatMessageList');
                    list.innerHTML = data.messages.map(m => {
                        const isOwn = m.sender_role !== 'admin';
                        const label = isOwn ? 'You' : 'Eventra Support';
                        const txt   = window.escapeHTML ? window.escapeHTML(m.message_text) : m.message_text;
                        return `<div style="align-self:${isOwn ? 'flex-end' : 'flex-start'}; max-width:82%;">
                            <div style="font-size:0.68rem; color:#94a3b8; margin-bottom:3px; text-align:${isOwn ? 'right' : 'left'}; padding:0 4px;">${label}</div>
                            <div style="background:${isOwn ? 'linear-gradient(135deg,#1e3a8a,#2563eb)' : '#f1f5f9'}; color:${isOwn ? '#fff' : '#1e293b'}; padding:10px 14px; border-radius:${isOwn ? '16px 4px 16px 16px' : '4px 16px 16px 16px'}; font-size:0.88rem; word-break:break-word; line-height:1.5;">${txt}</div>
                        </div>`;
                    }).join('');
                    list.scrollTop = list.scrollHeight;
                }
                
                // Refund Status Banner
                if (data.chat && data.chat.refund_status) {
                    const statusContainer = document.getElementById('chatRefundStatusContainer');
                    statusContainer.style.display = 'block';
                    
                    if (data.chat.refund_status === 'pending_admin') {
                        statusContainer.innerHTML = `<div style="background:#fef08a; color:#854d0e; padding:10px; border-radius:8px; font-weight:600;">Refund request submitted to Admin.</div>`;
                    } else if (data.chat.refund_status === 'approved') {
                        statusContainer.innerHTML = `<div style="background:#dcfce3; color:#166534; padding:10px; border-radius:8px; font-weight:600;">Refund processed successfully.</div>`;
                    } else if (data.chat.refund_status === 'declined') {
                        statusContainer.innerHTML = `<div style="background:#fee2e2; color:#991b1b; padding:10px; border-radius:8px; font-weight:600;">Refund request declined.</div>`;
                    }
                }
            }
        } catch (e) {}
    }

    document.getElementById('btnSendGlobalChat')?.addEventListener('click', async () => {
        const input = document.getElementById('globalChatInput');
        const msg = input.value.trim();
        if (!msg) return;
        
        let user;
        if (window.storage) user = window.storage.getUser();
        
        try {
            await fetch('/api/chat.php', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ticket_id: currentTicket,
                    sender_role: user?.role || 'user',
                    sender_id: user?.id || 0,
                    message: msg,
                    event_owner_id: user?.id || 0
                })
            });
            input.value = '';
            loadGlobalMessages();
        } catch (e) {}
    });

    // Enter key sends message
    document.getElementById('globalChatInput')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            document.getElementById('btnSendGlobalChat')?.click();
        }
    });

    document.getElementById('btnEscalateAdmin')?.addEventListener('click', async () => {
        if (!currentTicket || currentTicket === 'general') return;
        await fetch('/api/chat.php', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'escalate', ticket_id: currentTicket })
        });
        if (window.Swal) Swal.fire('Escalated', 'Admin has been notified.', 'success');
    });

    document.getElementById('btnRequestRefund')?.addEventListener('click', async () => {
        if (!currentChatContextId) return;
        await fetch('/api/refund.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'request', chat_id: currentChatContextId })
        });
        loadGlobalMessages();
    });
});
