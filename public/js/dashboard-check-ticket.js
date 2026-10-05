/**
 * Check Ticket — anti-fraud verification for Admin & Client dashboards.
 *
 * 2026-10-02: the full-screen workspace was replaced by the shared modal
 * component public/js/ticket-verification.js, which is now used by ALL
 * portals (user homepage, admin dashboard, client dashboard):
 *
 *   • The 🎟️ icon in the header (beside the notification bell) opens a MODAL
 *     — the sidenav "Check Ticket" page is gone.
 *   • Typing the Ticket ID auto-generates & displays the real QR image —
 *     no "Load Ticket QR" / "Verify this QR" buttons any more.
 *   • The verification-success proof dialog renders ABOVE the modal.
 *
 * Backend (used by the shared component):
 *   POST /api/tickets/check  { mode: 'id', ticket_id }
 *   GET  /api/tickets/qr-image.php?ticket_id=...
 */
(function () {
  'use strict';

  function openCTWs() {
    if (window.EventraTicketVerification) {
      window.EventraTicketVerification.open();
      return;
    }
    // Shared component not executed yet — retry after DOM is ready.
    window.__ctPendingOpen = true;
  }

  // Flush a pending open once the shared component arrives
  document.addEventListener('DOMContentLoaded', () => {
    if (window.__ctPendingOpen && window.EventraTicketVerification) {
      window.__ctPendingOpen = false;
      window.EventraTicketVerification.open();
    }
  });

  // ── Wire legacy sidenav entries if a page still has them ────────────────
  document.addEventListener('DOMContentLoaded', () => {
    const nav = document.getElementById('adminCheckTicketNav') || document.getElementById('clientCheckTicketNav');
    if (nav) {
      nav.addEventListener('click', (e) => {
        e.preventDefault();
        openCTWs();
      });
    }
  });

  // Legacy hooks
  window.__openCheckTicketWorkspace = openCTWs;
  window.__openCheckTicket = openCTWs;
})();
