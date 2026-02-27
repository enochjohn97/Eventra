// Utility functions

// Format currency
function formatCurrency(amount, currency = '₦') {
  return `${currency} ${amount.toLocaleString()}`;
}

// Format date
function formatDate(date) {
  const options = { year: 'numeric', month: 'long', day: 'numeric' };
  return new Date(date).toLocaleDateString('en-US', options);
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
      color: '#000000'
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
    z-index: 10000;
    animation: slideIn 0.3s ease;
  `;

  document.body.appendChild(notification);

  // Remove after 3 seconds
  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}



// Local storage helpers
const storage = {
  set: (key, value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.error('Error saving to localStorage:', e);
      return false;
    }
  },
  get: (key) => {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : null;
    } catch (e) {
      console.error('Error reading from localStorage:', e);
      return null;
    }
  },
  remove: (key) => {
    try {
      localStorage.removeItem(key);
      return true;
    } catch (e) {
      console.error('Error removing from localStorage:', e);
      return false;
    }
  },
  // Role-aware helpers
  getUser: () => {
    const keys = getRoleKeys();
    return storage.get(keys.user);
  },
  setUser: (userData) => {
    const keys = getRoleKeys();
    return storage.set(keys.user, userData);
  },
  getToken: () => {
    const keys = getRoleKeys();
    return storage.get(keys.token);
  },
  setToken: (token) => {
    const keys = getRoleKeys();
    return storage.set(keys.token, token);
  },
  clearRoleSessions: () => {
    const keys = getRoleKeys();
    storage.remove(keys.user);
    storage.remove(keys.token);
  }
};

// Auth helpers
function getRoleKeys() {
  const path = window.location.pathname;
  if (path.includes('/admin/')) return { user: 'admin_user', token: 'admin_auth_token' };
  if (path.includes('/client/')) return { user: 'client_user', token: 'client_auth_token' };
  return { user: 'user', token: 'auth_token' };
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
  const keys = getRoleKeys();
  const user = storage.get(keys.user);
  const token = storage.get(keys.token);
  return !!(user && token);
}

// Session Sync: Strictly verify authentication with the server
async function syncSession() {
  try {
    const basePath = getBasePath();
    
    // Skip sync for login pages to avoid loops
    if (window.location.pathname.includes('Login.html')) return;

    const response = await apiFetch(basePath + 'api/auth/check-session.php');
    if (!response) {
      window.dispatchEvent(new CustomEvent('sessionSyncComplete', { detail: { success: false } }));
      return;
    }

    const result = await response.json();
    if (result.success) {
      storage.setUser(result.user);
      storage.setToken(result.user.token);
      window.dispatchEvent(new CustomEvent('sessionSyncComplete', { detail: { success: true, user: result.user } }));
    } else {
      // Only clear if we were previously logged in to avoid constant clearing
      if (isAuthenticated()) {
         storage.clearRoleSessions();
      }
      window.dispatchEvent(new CustomEvent('sessionSyncComplete', { detail: { success: false } }));
    }

  } catch (error) {
    console.error('Session sync failed:', error);
    window.dispatchEvent(new CustomEvent('sessionSyncComplete', { detail: { success: false, error } }));
  }
}

// Trigger sync on load
if (typeof window !== 'undefined') {
  document.addEventListener('DOMContentLoaded', syncSession);
}

function handleAuthRedirect(targetURL) {
  if (!isAuthenticated()) {
    const effectiveTarget = targetURL || window.location.href;
    storage.set('redirect_after_login', effectiveTarget);
    
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
  
  options.headers = {
    ...options.headers,
    'X-Eventra-Portal': portal
  };
  
  try {
    const response = await fetch(url, options);
    
    // Handle 401 (Unauthorized) or 403 (Forbidden) indicating session expiration
    if (response.status === 401 || response.status === 403) {
      // Skip redirect for login endpoints themselves to avoid infinite loops
      if (!url.includes('login.php') && !url.includes('google-handler.php') && !url.includes('check-session.php')) {
        const path = window.location.pathname;
        const origin = window.location.origin;
        
        let loginPage;
        if (path.includes('/admin/')) {
          loginPage = origin + '/admin/pages/adminLogin.html?error=session_timeout';
        } else if (path.includes('/client/')) {
          loginPage = origin + '/client/pages/clientLogin.html?error=session_timeout';
        } else {
          loginPage = origin + '/public/pages/index.html?trigger=login&error=session_timeout';
        }
        
        // Clear stale local data
        storage.remove('user');
        storage.remove('auth_token');
        
        window.location.href = loginPage;
        return null;
      }
    }
    
    return response;
  } catch (error) {
    console.error('API Fetch Error:', error);
    throw error;
  }
}

// Export utilities
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    formatCurrency,
    formatDate,
    debounce,
    isValidEmail,
    showNotification,
    storage,
    getRoleKeys,
    isAuthenticated,
    handleAuthRedirect,
    apiFetch
  };
}
