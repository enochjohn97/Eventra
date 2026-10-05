/**
 * Check Ticket — anti-fraud ticket verification for the user homepage.
 *
 * 2026-10-02: the full implementation moved to the shared component
 * public/js/ticket-verification.js (one identical modal for user, admin and
 * client portals). This shim keeps the legacy public surface working:
 *
 *   • #checkTicketBtn (profile menu) opens the shared MODAL — no navigation.
 *   • window.__openCheckTicket still opens the modal for old callers.
 *   • Typing the Ticket ID auto-generates & displays the real QR image.
 *   • The verification-success proof dialog renders ABOVE the check modal.
 *
 * Backend (used by the shared component):
 *   POST /api/tickets/check  { mode: 'id', ticket_id }
 *   GET  /api/tickets/qr-image.php?ticket_id=...
 */
(function () {
  'use strict';

  function openCT() {
    if (window.EventraTicketVerification) {
      window.EventraTicketVerification.open();
      return;
    }
    // The shared component ships before this shim on every page that uses
    // both; if it is missing the icon binding in ticket-verification.js will
    // still create the modal on DOMContentLoaded.
    window.__ctPendingOpen = true;
  }

  // Legacy hook
  window.__openCheckTicket = openCT;

  // Flush a pending open once the shared component arrives
  document.addEventListener('DOMContentLoaded', () => {
    if (window.__ctPendingOpen && window.EventraTicketVerification) {
      window.__ctPendingOpen = false;
      window.EventraTicketVerification.open();
    }
  });

  // ── Wire the profile-dropdown entry ──────────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('checkTicketBtn');
    if (!btn) return;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const dd = document.getElementById('profileDropdown');
      if (dd) {
        dd.style.display = 'none';
        if (dd.classList) dd.classList.remove('show');
      }
      openCT();
    });
  });
})();
