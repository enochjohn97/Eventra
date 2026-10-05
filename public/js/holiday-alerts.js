/**
 * Eventra Holiday & Festive Toast Alerts
 * ---------------------------------------------------------------
 * Fetches the calendar-year holiday list from /api/utils/holiday-alerts.php
 * (Google Calendar "Holidays in Nigeria" via GOOGLE_CALENDAR_API_KEY) and
 * shows a toast on the admin dashboard, client dashboard and public homepage:
 *
 *   - When today is a holiday (Christmas, Sallah/Eid big & small, Easter,
 *     New Year, National Day, ...) -> celebratory toast.
 *   - When a holiday falls within the next 7 days -> advance notice toast.
 *
 * Each toast fires at most once per browser per holiday (localStorage), so
 * navigating between pages never spams the user. The holiday payload itself is
 * cached for 6 hours to keep API/Google usage minimal.
 *
 * Toast rendering prefers the host page's existing toast system and falls back
 * to a self-contained DOM toast so it works on every portal.
 */
(function () {
  "use strict";

  if (window.EventraHolidayAlerts) return; // guard against double-inclusion

  var ENDPOINT = "/api/utils/holiday-alerts.php";
  var DATA_CACHE_KEY = "eventra_holiday_data_v1";
  var DATA_CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours
  var SHOWN_LOG_KEY = "eventra_holiday_shown_v1";
  var SHOWN_LOG_TTL = 60 * 24 * 60 * 60 * 1000; // prune entries older than 60 days
  var UPCOMING_WINDOW_DAYS = 7;
  var INITIAL_DELAY_MS = 1800; // let the page settle first

  // ------------------------------------------------------------------
  // Small helpers
  // ------------------------------------------------------------------

  function localISODate(d) {
    var m = String(d.getMonth() + 1);
    var day = String(d.getDate());
    return d.getFullYear() + "-" + (m.length < 2 ? "0" + m : m) + "-" + (day.length < 2 ? "0" + day : day);
  }

  function daysBetween(fromISO, toISO) {
    var a = Date.UTC(+fromISO.slice(0, 4), +fromISO.slice(5, 7) - 1, +fromISO.slice(8, 10));
    var b = Date.UTC(+toISO.slice(0, 4), +toISO.slice(5, 7) - 1, +toISO.slice(8, 10));
    return Math.round((b - a) / 86400000);
  }

  function safeReadJSON(key) {
    try {
      var raw = window.localStorage ? localStorage.getItem(key) : null;
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function safeWriteJSON(key, value) {
    try {
      if (window.localStorage) localStorage.setItem(key, JSON.stringify(value));
    } catch (e) { /* private mode / quota - alerts simply show again next visit */ }
  }

  /** Strip angle brackets so external titles can never inject markup into toasts. */
  function sanitize(str) {
    return String(str == null ? "" : str).replace(/[<>]/g, "");
  }

  // ------------------------------------------------------------------
  // "Already shown?" log (per holiday, per browser)
  // ------------------------------------------------------------------

  function readShownLog() {
    var log = safeReadJSON(SHOWN_LOG_KEY);
    if (!log || typeof log !== "object") return {};
    var now = Date.now();
    var fresh = {};
    for (var k in log) {
      if (Object.prototype.hasOwnProperty.call(log, k)) {
        if (typeof log[k] === "number" && now - log[k] < SHOWN_LOG_TTL) fresh[k] = log[k];
      }
    }
    return fresh;
  }

  function wasShown(log, key) {
    return Object.prototype.hasOwnProperty.call(log, key);
  }

  function markShown(log, key) {
    log[key] = Date.now();
    safeWriteJSON(SHOWN_LOG_KEY, log);
  }

  // ------------------------------------------------------------------
  // Message building
  // ------------------------------------------------------------------

  function emojiFor(title) {
    var t = title.toLowerCase();
    if (t.indexOf("christmas") !== -1) return "\uD83C\uDF84"; // christmas tree
    if (t.indexOf("eid") !== -1 || t.indexOf("el-fitr") !== -1 || t.indexOf("id el") !== -1 ||
        t.indexOf("kabir") !== -1 || t.indexOf("maulud") !== -1 || t.indexOf("ramadan") !== -1 ||
        t.indexOf("sallah") !== -1 || t.indexOf("al-hijra") !== -1) return "\uD83C\uDF19"; // crescent
    if (t.indexOf("new year") !== -1) return "\uD83C\uDF86"; // fireworks
    if (t.indexOf("easter") !== -1 || t.indexOf("good friday") !== -1 || t.indexOf("ash wednesday") !== -1) return "\u261D"; // pointing up
    if (t.indexOf("valentine") !== -1) return "\u2764\uFE0F"; // red heart
    if (t.indexOf("democracy") !== -1 || t.indexOf("national day") !== -1 || t.indexOf("workers") !== -1 ||
        t.indexOf("children") !== -1) return "\uD83C\uDDE6\uD83C\uDDF1"; // Nigerian flag
    if (t.indexOf("box") !== -1) return "\uD83C\uDF81"; // gift
    return "\uD83C\uDF89"; // party popper
  }

  function greetingFor(title) {
    var t = title.toLowerCase();
    if (t.indexOf("christmas") !== -1) return "Merry Christmas!";
    if (t.indexOf("eid el-fitr") !== -1 || t.indexOf("el-fitr") !== -1 || t.indexOf("fitr") !== -1 ||
        t.indexOf("id el fitr") !== -1) return "Eid Mubarak! Happy Sallah!";
    if (t.indexOf("kabir") !== -1 || t.indexOf("adha") !== -1) return "Eid al-Adha Mubarak! Happy Sallah!";
    if (t.indexOf("maulud") !== -1 || t.indexOf("mawlid") !== -1) return "Happy Maulud Nabi!";
    if (t.indexOf("ramadan") !== -1) return "Ramadan Kareem!";
    if (t.indexOf("new year") !== -1) return "Happy New Year!";
    if (t.indexOf("good friday") !== -1) return "Blessed Good Friday.";
    if (t.indexOf("easter") !== -1) return "Happy Easter!";
    if (t.indexOf("valentine") !== -1) return "Happy Valentine's Day!";
    return null;
  }

  function formatDateFriendly(iso) {
    try {
      var parts = iso.split("-");
      var d = new Date(+parts[0], +parts[1] - 1, +parts[2]);
      return d.toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      });
    } catch (e) {
      return iso;
    }
  }

  function buildTodayMessage(holidays) {
    var titles = holidays.slice(0, 3).map(function (h) { return sanitize(h.title); });
    var greeting = null;
    for (var i = 0; i < holidays.length && !greeting; i++) {
      greeting = greetingFor(holidays[i].title);
    }
    var emoji = emojiFor(titles[0] || "");
    var listText = titles.join(" & ");
    if (titles.length > 1) listText += " and more";
    var head = greeting ? greeting : "It's a holiday today!";
    return emoji + " " + head + " Today is " + listText + " \u2014 " +
      formatDateFriendly(holidays[0].date) + ". Enjoy the celebration!";
  }

  function buildUpcomingMessage(holiday, fromDateISO) {
    var title = sanitize(holiday.title);
    var emoji = emojiFor(title);
    var days = daysBetween(fromDateISO, holiday.date);
    var when = days <= 0 ? "today" :
      days === 1 ? "tomorrow" :
      "in " + days + " days";
    return emoji + " Upcoming holiday: " + title + " " + when +
      " (" + formatDateFriendly(holiday.date) + "). Get ready!";
  }

  // ------------------------------------------------------------------
  // Toast rendering - host system first, self-contained fallback last
  // ------------------------------------------------------------------

  function showToast(message, type, duration) {
    duration = duration || 7000;

    // Admin portal toast system (admin/js/toast-notification.js)
    if (window.toast && typeof window.toast.show === "function") {
      try { window.toast.show(message, type || "success", duration); return; } catch (e) { }
    }

    // SweetAlert2 toast - loaded on every portal
    if (window.Swal && typeof window.Swal.fire === "function") {
      try {
        window.Swal.fire({
          toast: true,
          position: "top-end",
          icon: type === "error" ? "error" : "info",
          title: message,
          showConfirmButton: false,
          timer: duration,
          timerProgressBar: true,
          didOpen: function (toastEl) {
            toastEl.addEventListener("mouseenter", function () { window.Swal.stopTimer && window.Swal.stopTimer(toastEl); });
            toastEl.addEventListener("mouseleave", function () { window.Swal.resumeTimer && window.Swal.resumeTimer(toastEl); });
          },
        });
        return;
      } catch (e) { }
    }

    // Shared helper (public/js/utils.js)
    if (typeof window.showNotification === "function") {
      try { window.showNotification(message, type || "info"); return; } catch (e) { }
    }

    fallbackToast(message, duration);
  }

  /** Self-contained toast so alerts render even if no host toast system exists. */
  function fallbackToast(message, duration) {
    try {
      var el = document.createElement("div");
      el.setAttribute("role", "status");
      el.setAttribute("aria-live", "polite");
      el.style.cssText =
        "position:fixed;top:80px;right:20px;max-width:360px;z-index:999999;" +
        "background:#111827;color:#fff;padding:14px 18px;border-radius:12px;" +
        "box-shadow:0 12px 40px rgba(0,0,0,.28);font:600 14px/1.5 system-ui,-apple-system,sans-serif;" +
        "opacity:0;transform:translateX(24px);transition:opacity .3s ease,transform .3s ease;";
      el.textContent = message;
      document.body.appendChild(el);
      requestAnimationFrame(function () {
        el.style.opacity = "1";
        el.style.transform = "translateX(0)";
      });
      setTimeout(function () {
        el.style.opacity = "0";
        el.style.transform = "translateX(24px)";
        setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 320);
      }, duration);
    } catch (e) { /* never let the alert feature break the page */ }
  }

  // ------------------------------------------------------------------
  // Data fetching (with localStorage cache)
  // ------------------------------------------------------------------

  function fetchHolidays(force) {
    var cached = safeReadJSON(DATA_CACHE_KEY);
    if (!force && cached && cached.fetched_at && (Date.now() - cached.fetched_at) < DATA_CACHE_TTL &&
        cached.holidays && Array.isArray(cached.holidays)) {
      return Promise.resolve(cached.holidays);
    }

    var doFetch = (typeof window.apiFetch === "function")
      ? window.apiFetch(ENDPOINT, { method: "GET", cache: "no-store" })
      : fetch(ENDPOINT, { credentials: "include", headers: { Accept: "application/json" } });

    return doFetch.then(function (res) {
      if (!res || !res.ok) throw new Error("holiday endpoint unavailable");
      return res.json();
    }).then(function (data) {
      if (!data || data.success !== true || !Array.isArray(data.holidays)) {
        throw new Error("unexpected holiday payload");
      }
      safeWriteJSON(DATA_CACHE_KEY, { fetched_at: Date.now(), holidays: data.holidays });
      return data.holidays;
    });
  }

  // ------------------------------------------------------------------
  // Evaluation: today's holidays first, otherwise nearest upcoming
  // ------------------------------------------------------------------

  /**
   * "Today" can be overridden with ?holiday_preview=YYYY-MM-DD so the alerts
   * can be demoed/QA'd on any date. Preview mode bypasses the once-per-day
   * dedupe log so repeated test loads always render.
   */
  function previewDate() {
    try {
      var m = /[?&]holiday_preview=(\d{4}-\d{2}-\d{2})/.exec(window.location.search);
      if (m && /^\d{4}-\d{2}-\d{2}$/.test(m[1])) return m[1];
    } catch (e) { }
    return null;
  }

  function evaluate(holidays) {
    if (!Array.isArray(holidays) || holidays.length === 0) return;

    var isPreview = previewDate();
    var today = isPreview || localISODate(new Date());
    var upcoming = holidays
      .filter(function (h) { return h && typeof h.date === "string"; })
      .sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });

    var todaysHolidays = upcoming.filter(function (h) { return h.date === today; });
    var log = isPreview ? {} : readShownLog();
    // Preview runs must never overwrite the real once-per-day dedupe log.
    function seen(key) { return isPreview ? false : wasShown(log, key); }
    function remember(key) { if (!isPreview) markShown(log, key); }

    if (todaysHolidays.length > 0) {
      var key = "today:" + today;
      if (seen(key)) return;
      remember(key);
      showToast(buildTodayMessage(todaysHolidays), "success");
      return;
    }

    // No holiday today -> notify once about the next holiday within the window.
    for (var i = 0; i < upcoming.length; i++) {
      var diff = daysBetween(today, upcoming[i].date);
      if (diff <= 0) continue;
      if (diff > UPCOMING_WINDOW_DAYS) break; // list is sorted; nothing else is close
      var upKey = "upcoming:" + today + ":" + upcoming[i].date + ":" + upcoming[i].title;
      if (seen(upKey)) return; // already announced today
      remember(upKey);
      showToast(buildUpcomingMessage(upcoming[i], today), "info");
      return;
    }
  }

  function run(force) {
    fetchHolidays(force)
      .then(evaluate)
      .catch(function () { /* silent: holiday alerts are best-effort */ });
  }

  // ------------------------------------------------------------------
  // Boot
  // ------------------------------------------------------------------

  function boot() {
    setTimeout(function () { run(false); }, INITIAL_DELAY_MS);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  // Public surface (refresh after a manual cache clear, or preview a date).
  window.EventraHolidayAlerts = {
    refresh: function () { run(true); },
    preview: function (isoDate) {
      fetchHolidays(false)
        .then(function (holidays) {
          var todays = holidays.filter(function (h) { return h && h.date === isoDate; });
          if (todays.length) showToast(buildTodayMessage(todays), "success");
        })
        .catch(function () { });
    },
  };
})();
