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
  const SENSITIVE_KEYS = ['auth_token', 'admin_auth_token', 'client_auth_token', 'token', 'refresh_token', 'access_token', 'password', 'secret', 'session_token', 'otp', 'code', 'verification_code'];
  const ENCRYPT_PREFIX = '__enc:v1:';
  let _encKey = null;
  let _encKeyPromise = null;

  async function getEncKey() {
    if (_encKey) return _encKey;
    if (_encKeyPromise) return _encKeyPromise;
    _encKeyPromise = (async () => {
      const keyName = 'storage_enc_key';
      const stored = localStorage.getItem(keyName);
      if (stored) {
        try {
          const raw = Uint8Array.from(atob(stored), c => c.charCodeAt(0));
          _encKey = await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
          return _encKey;
        } catch (_) {}
      }
      const raw = crypto.getRandomValues(new Uint8Array(32));
      const exported = btoa(String.fromCharCode.apply(null, Array.from(raw)));
      localStorage.setItem(keyName, exported);
      _encKey = await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
      return _encKey;
    })();
    _encKey = await _encKeyPromise;
    return _encKey;
  }

  async function enc(text) {
    if (typeof text !== 'string') text = JSON.stringify(text);
    const key = await getEncKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(text);
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
    const out = new Uint8Array(iv.length + ct.byteLength);
    out.set(iv, 0);
    out.set(new Uint8Array(ct), iv.length);
    return ENCRYPT_PREFIX + btoa(String.fromCharCode.apply(null, Array.from(out)));
  }

  async function dec(envelope) {
    if (typeof envelope !== 'string' || !envelope.startsWith(ENCRYPT_PREFIX)) return envelope;
    try {
      const b64 = envelope.slice(ENCRYPT_PREFIX.length);
      const data = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      if (data.length < 13) return envelope;
      const iv = data.slice(0, 12);
      const ct = data.slice(12);
      const key = await getEncKey();
      const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
      return new TextDecoder().decode(pt);
    } catch (_) { return envelope; }
  }

  function isSensitiveKey(k) {
    if (!k) return false;
    const kk = k.toLowerCase();
    if (SENSITIVE_KEYS.some(s => kk.includes(s))) return true;
    if (kk.indexOf('token') !== -1 || kk.indexOf('secret') !== -1 || kk.indexOf('password') !== -1) return true;
    return false;
  }

  const _mem = {};
  window.storage = {
    set: function (key, value) {
      try {
        if (isSensitiveKey(key)) {
          _mem[key] = value;
          if (typeof crypto !== 'undefined' && crypto.subtle) {
            enc(value).then(v => {
              localStorage.setItem(key, v);
            }).catch(e => {
              localStorage.setItem(key, '__mem__' + JSON.stringify(value));
            });
            return true;
          }
        }
        localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch (error) {
        return false;
      }
    },

    get: function (key) {
      try {
        if (isSensitiveKey(key) && _mem.hasOwnProperty(key)) {
          return _mem[key];
        }
        const item = localStorage.getItem(key);
        if (!item) return null;
        if (typeof item === 'string' && item.startsWith('__mem__')) {
          const v = JSON.parse(item.slice(6));
          if (isSensitiveKey(key)) _mem[key] = v;
          return v;
        }
        if (typeof item === 'string' && item.startsWith(ENCRYPT_PREFIX)) {
          // Decrypt async and update mem; return null first time if mem empty? But we also stored mem on set.
          // Try to parse as JSON if someone stored differently? No. For current session mem should exist if just set.
          dec(item).then(pt => {
            try {
              const v = JSON.parse(pt);
              _mem[key] = v;
            } catch (_) {
              _mem[key] = pt;
            }
          }).catch(() => {});
          return _mem.hasOwnProperty(key) ? _mem[key] : null;
        }
        try {
          const v = JSON.parse(item);
          if (isSensitiveKey(key)) _mem[key] = v;
          return v;
        } catch (e) {
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
        for (const k in _mem) {
          if (_mem.hasOwnProperty(k)) delete _mem[k];
        }
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
      for (const k in _mem) {
        if (_mem.hasOwnProperty(k)) delete _mem[k];
      }
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
