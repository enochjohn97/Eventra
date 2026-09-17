/**
 * Guest Identity + Recently-Viewed Event Images
 */
(function () {
  "use strict";

  const VIEWED_KEY = "eventra_recently_viewed_events";
  const MAX_ENTRIES = 12;

  function isKnownBrowser() {
    try {
      const uuid = window.getGuestUuid ? window.getGuestUuid() : null;
      if (!uuid) return false;
      const hasCookie = document.cookie
        .split(";")
        .some((c) => c.trim().startsWith("EVENTRA_GUEST_ID="));
      const hasSession =
        !!(window.storage && (storage.getUser() || storage.get("user")));
      return hasCookie || hasSession;
    } catch (e) {
      return false;
    }
  }

  function getStore() {
    try {
      const uuid = window.getGuestUuid ? window.getGuestUuid() : null;
      if (!uuid) return { uuid: null, items: [] };
      const raw = localStorage.getItem(VIEWED_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      // Store per-UUID so multiple browser profiles on one device never mix
      const items = Array.isArray(parsed[uuid]) ? parsed[uuid] : [];
      return { uuid, items };
    } catch (e) {
      return { uuid: null, items: [] };
    }
  }

  function setStore(uuid, items) {
    try {
      const raw = localStorage.getItem(VIEWED_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      parsed[uuid] = items;
      localStorage.setItem(VIEWED_KEY, JSON.stringify(parsed));
    } catch (e) {
      /* storage full/unavailable — non-fatal */
    }
  }

  /**
   * Record an event view. Safe to call from any page.
   * @param {number|string} eventId
   * @param {string} imagePath  web path from the API (already normalized)
   */
  window.recordEventView = function (eventId, imagePath) {
    if (!eventId || !imagePath || !isKnownBrowser()) return;
    const { uuid, items } = getStore();
    if (!uuid) return;

    // Dedupe by id, most-recent first
    const filtered = items.filter((it) => String(it.id) !== String(eventId));
    filtered.unshift({ id: eventId, image: imagePath, at: Date.now() });
    setStore(uuid, filtered.slice(0, MAX_ENTRIES));
  };

  /**
   * Get recently-viewed event images for THIS browser.
   * Returns [] on fresh browsers — that's the "display nothing" contract.
   * @returns {Array<{id: string, image: string}>}
   */
  window.getRecentlyViewedEvents = function () {
    if (!isKnownBrowser()) return [];
    const { items } = getStore();
    return items.map(({ id, image }) => ({ id, image }));
  };
})();
