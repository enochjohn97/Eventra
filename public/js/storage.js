/**
 * Local Storage Utility
 * Simple wrapper for localStorage with JSON support.
 *
 * Guest identity: a server-issued UUID cookie (EVENTRA_GUEST_ID) plus a
 * mirrored localStorage UUID (`eventra_guest_uuid`) identify a BROWSER so the
 * homepage can show "previously viewed event images" only to returning
 * browsers. A fresh browser (no cookie + no UUID) sees nothing.
 */
(function () {
  function ensureGuestUuid() {
    try {
      let uuid = localStorage.getItem("eventra_guest_uuid");
      if (
        !uuid ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          uuid,
        )
      ) {
        if (window.crypto && crypto.randomUUID) {
          uuid = crypto.randomUUID();
        } else {
          // RFC4122 v4 fallback for older browsers
          uuid = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
            /[xy]/g,
            function (c) {
              const r = (Math.random() * 16) | 0;
              const v = c === "x" ? r : (r & 0x3) | 0x8;
              return v.toString(16);
            },
          );
        }
        localStorage.setItem("eventra_guest_uuid", uuid);
      }
      return uuid;
    } catch (e) {
      return null;
    }
  }

  // Expose synchronously so callers never get undefined on first paint
  window.getGuestUuid = ensureGuestUuid;
  ensureGuestUuid();
})();

if (typeof window.storage === "undefined" || !window.storage) {
  window.storage = {
    set: function (key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch (error) {
        return false;
      }
    },

    get: function (key) {
      try {
        const item = localStorage.getItem(key);
        if (!item) return null;
        try {
          return JSON.parse(item);
        } catch (e) {
          // If it's not JSON, return the raw value (e.g. "mock-token")
          return item;
        }
      } catch (error) {
        return null;
      }
    },

    remove: function (key) {
      try {
        localStorage.removeItem(key);
        return true;
      } catch (error) {
        return false;
      }
    },

    clear: function () {
      try {
        const keys = this.getRoleKeys();
        this.remove(keys.user);
        this.remove(keys.token);
        this.remove("redirect_after_login");
        return true;
      } catch (error) {
        return false;
      }
    },

    getRoleKeys: function () {
      const currentPath = window.location.pathname;
      if (currentPath.includes("/admin/")) {
        return { user: "admin_user", token: "admin_auth_token" };
      } else if (currentPath.includes("/client/")) {
        return { user: "client_user", token: "client_auth_token" };
      }
      return { user: "user", token: "auth_token" };
    },

    getUser: function () {
      const keys = this.getRoleKeys();
      return this.get(keys.user);
    },

    setUser: function (userData) {
      const keys = this.getRoleKeys();
      if (userData && userData.token) {
        this.set(keys.token, userData.token);
      }
      // Stamp login time so auth-controller can trust local auth within the session window
      localStorage.setItem("login_timestamp", Date.now().toString());
      return this.set(keys.user, userData);
    },

    getToken: function () {
      const keys = this.getRoleKeys();
      return this.get(keys.token);
    },

    setToken: function (token) {
      const keys = this.getRoleKeys();
      return this.set(keys.token, token);
    },

    clearRoleSessions: function () {
      const keys = this.getRoleKeys();
      this.remove(keys.user);
      this.remove(keys.token);
      localStorage.removeItem("login_timestamp");
    },
  };
}

// Global helper for role-specific keys (backward-compatible shorthand)
if (typeof getRoleKeys === "undefined") {
  window.getRoleKeys = function () {
    return window.storage.getRoleKeys();
  };
}

// Global alias: expose storage to global scope so existing code using bare `storage.` works
var storage = window.storage;
