/**
 * Eventra — unified Check Ticket verification component.
 *
 * One self-contained modal shared by the user homepage, admin dashboard and
 * client dashboard. Used to live in three places with three different
 * behaviours; now every surface gets the same experience:
 *
 *  • A ticket icon sits in the header next to the notification bell
 *    (fixed / always visible) and opens this modal — no page navigation.
 *  • Typing or pasting a Ticket ID AUTO-LOADS the ticket's real QR code
 *    (debounced) — there is no "Load QR" or "Verify QR" button any more.
 *  • The QR image is the exact one emailed with the ticket; it is fully
 *    scannable by any phone camera. Scanning is capped server-side
 *    (5 scans) to defeat screenshot sharing; the Ticket-ID text check
 *    stays unlimited.
 *  • The proof/success dialog renders ABOVE this modal (higher z-index),
 *    so it never hides behind it.
 *
 * Backend:
 *   GET  /api/tickets/qr-image.php?ticket_id=...
 *   POST /api/tickets/check  { mode: 'id', ticket_id }
 *
 * Public API: window.EventraTicketVerification.open() / .close()
 * Auto-binds: any [data-check-ticket] element, #checkTicketBtn (legacy
 * profile-menu link) and #checkTicketIconBtn, and inserts a header icon
 * when a .header-actions container exists but has no icon yet.
 */
(function () {
  'use strict';

  const CHECK_API = '/api/tickets/check';
  const QR_API = '/api/tickets/qr-image.php';
  const Z_MODAL = 35000;   // check-ticket modal
  const Z_PROOF = 40000;   // verification-success dialog — always on top

  let abortCtrl = null;
  let debounceTimer = null;
  let lastRenderedId = '';

  // ── helpers ─────────────────────────────────────────────────────────────
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function fmtDate(v) {
    if (!v) return '—';
    const d = new Date(String(v).replace(' ', 'T'));
    if (isNaN(d)) return String(v);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) +
      (String(v).includes(':') ? ' · ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '');
  }

  function toast(msg, kind, timer) {
    const icon = kind === 'warning' ? 'warning' : (kind === 'error' ? 'error' : 'info');
    if (window.Swal) {
      window.Swal.fire({ icon, title: msg, timer: timer || 4200, showConfirmButton: false, timerProgressBar: true });
    } else {
      alert(msg);
    }
  }

  // ── modal shell ─────────────────────────────────────────────────────────
  function ensureModal() {
    if (document.getElementById('checkTicketModal')) return;
    const wrap = document.createElement('div');
    wrap.id = 'checkTicketModal';
    wrap.style.cssText =
      'position:fixed;inset:0;z-index:' + Z_MODAL + ';display:none;align-items:center;justify-content:center;background:rgba(2,6,23,.72);backdrop-filter:blur(4px);padding:16px;';
    wrap.innerHTML = `
      <div style="background:#fff;border-radius:20px;max-width:760px;width:100%;max-height:92vh;overflow:auto;box-shadow:0 30px 80px -20px rgba(2,6,23,.6);font-family:inherit;">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:18px 22px;border-bottom:1px solid #eef2f7;position:sticky;top:0;background:#fff;z-index:2;">
          <div>
            <h3 style="margin:0;font-size:1.15rem;font-weight:800;color:#0f172a;">🎟️ Check Ticket</h3>
            <p style="margin:2px 0 0;font-size:.8rem;color:#64748b;">Prove ticket validity — protects against fraud &amp; ticket reuse.</p>
          </div>
          <button id="ctClose" aria-label="Close" style="border:none;background:#f1f5f9;width:34px;height:34px;border-radius:50%;font-size:1rem;cursor:pointer;">✕</button>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:0;">
          <!-- LEFT: QR (auto-generated from the Ticket ID) -->
          <div style="padding:22px;border-right:1px solid #eef2f7;">
            <h4 style="margin:0 0 4px;font-size:.95rem;font-weight:700;">🔳 Ticket QR Code</h4>
            <p style="margin:0 0 12px;font-size:.75rem;color:#64748b;">Generated automatically from the Ticket ID — scan it with any phone.</p>
            <div id="ctQrBox" style="width:100%;min-height:230px;border:2px dashed #e2e8f0;border-radius:12px;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#94a3b8;gap:8px;margin-bottom:12px;padding:14px;text-align:center;">
              <span style="font-size:2rem;">🔳</span>
              <span style="font-size:.78rem;">Type or paste the Ticket ID on the right —<br>the QR code appears here instantly.</span>
            </div>
            <div id="ctQrMeta" style="display:none;margin:-4px 0 10px;font-size:.72rem;font-weight:700;color:#1d4ed8;background:#eff6ff;border-radius:8px;padding:6px 10px;"></div>
          </div>
          <!-- RIGHT: Ticket ID -->
          <div style="padding:22px;">
            <h4 style="margin:0 0 4px;font-size:.95rem;font-weight:700;">🔑 Verify by Ticket ID</h4>
            <p style="margin:0 0 12px;font-size:.75rem;color:#64748b;">Unlimited verifications. Works even when QR scans run out.</p>
            <input id="ctTicketId" type="text" placeholder="e.g. TKT-20260929-0697" autocomplete="off" spellcheck="false"
              style="width:100%;border:1.5px solid #e2e8f0;border-radius:10px;padding:12px 14px;font-size:.9rem;font-weight:600;letter-spacing:.4px;margin-bottom:10px;text-transform:uppercase;" />
            <button id="ctVerifyId" style="width:100%;border:none;background:#722f37;color:#fff;padding:12px;border-radius:10px;font-weight:800;font-size:.86rem;cursor:pointer;">Verify Ticket</button>
            <div style="margin-top:18px;background:#fff7f7;border:1px solid #ffe4e6;border-radius:12px;padding:12px 14px;">
              <p style="margin:0;font-size:.72rem;color:#9f1239;line-height:1.55;">
                <b>Why we check:</b> every QR holds a signed, tamper-proof token. Camera scanning is limited to 5 tries to stop screenshot sharing; the ticket ID field remains available to the rightful owner at any time.
              </p>
            </div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(wrap);

    wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });
    wrap.querySelector('#ctClose').addEventListener('click', close);
    wrap.querySelector('#ctVerifyId').addEventListener('click', verifyById);
    wrap.querySelector('#ctTicketId').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') verifyById();
    });
    wrap.querySelector('#ctTicketId').addEventListener('input', (e) => {
      const ticketId = (e.target.value || '').trim();
      clearTimeout(debounceTimer);
      if (ticketId.length < 4) {
        lastRenderedId = '';
        resetQrBox();
        return;
      }
      debounceTimer = setTimeout(() => autoShowQr(ticketId), 450);
    });

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const proof = document.getElementById('ctProofOverlay');
      if (proof) { proof.remove(); return; }
      const m = document.getElementById('checkTicketModal');
      if (m && m.style.display !== 'none') close();
    });
  }

  function resetQrBox() {
    const box = document.getElementById('ctQrBox');
    const meta = document.getElementById('ctQrMeta');
    if (!box) return;
    box.innerHTML =
      '<span style="font-size:2rem;">🔳</span><span style="font-size:.78rem;">Type or paste the Ticket ID on the right —<br>the QR code appears here instantly.</span>';
    if (meta) meta.style.display = 'none';
  }

  function open() {
    ensureModal();
    document.getElementById('checkTicketModal').style.display = 'flex';
    document.body.style.overflow = 'hidden';
    const input = document.getElementById('ctTicketId');
    if (input) setTimeout(() => input.focus(), 60);
  }

  function close() {
    const m = document.getElementById('checkTicketModal');
    if (m) m.style.display = 'none';
    document.body.style.overflow = '';
    if (abortCtrl) abortCtrl.abort();
    lastRenderedId = '';
  }

  // ── auto-load & display the ticket's real QR image ──────────────────────
  async function autoShowQr(ticketId) {
    ensureModal();
    const box = document.getElementById('ctQrBox');
    const meta = document.getElementById('ctQrMeta');
    if (!box) return;
    if (ticketId === lastRenderedId) return;
    lastRenderedId = ticketId;

    if (abortCtrl) abortCtrl.abort();
    abortCtrl = new AbortController();

    box.innerHTML = '<span style="font-size:1.8rem;">⏳</span><span style="font-size:.78rem;">Generating ticket QR…</span>';
    if (meta) meta.style.display = 'none';

    try {
      const res = await fetch(QR_API + '?ticket_id=' + encodeURIComponent(ticketId), {
        credentials: 'include',
        signal: abortCtrl.signal,
      });
      const data = await res.json();
      if (data.qr_locked) {
        box.innerHTML =
          '<span style="font-size:2.2rem;">🔒</span><span style="font-size:.8rem;color:#b45309;">QR inaccessible — 5 scans used.<br>Use "Verify Ticket" (ID) instead.</span>';
        return toast('🔒 ' + data.message, 'warning', 7000);
      }
      if (!data.success) {
        box.innerHTML =
          '<span style="font-size:2rem;">⚠️</span><span style="font-size:.8rem;">' + esc(data.message || 'Could not generate QR for this ID.') + '</span>';
        return;
      }
      box.innerHTML = '<img src="' + data.data_uri + '" alt="Ticket QR" style="width:200px;height:200px;object-fit:contain;background:#fff;" />' +
        '<span style="font-size:.72rem;color:#64748b;">📷 Scan with any phone camera to verify</span>';
      if (meta) {
        meta.style.display = 'block';
        meta.textContent = 'Ticket ' + data.ticket_id + ' · ' + data.scans_used + '/' + data.scan_limit +
          ' QR scans used · ' + data.scans_remaining + ' remaining';
      }
    } catch (err) {
      if (err && err.name === 'AbortError') return; // superseded by a newer keystroke
      box.innerHTML = '<span style="font-size:2rem;">⚠️</span><span style="font-size:.8rem;">Network error — please try again.</span>';
    }
  }

  // ── verify by ticket ID (unlimited) ─────────────────────────────────────
  async function verifyById() {
    const input = document.getElementById('ctTicketId');
    const ticketId = ((input && input.value) || '').trim();
    if (!ticketId) return toast('Enter the ticket ID first — e.g. TKT-12345678-1234', 'warning');
    const btn = document.getElementById('ctVerifyId');
    btn.disabled = true;
    btn.textContent = 'Verifying…';
    try {
      const res = await fetch(CHECK_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ mode: 'id', ticket_id: ticketId }),
      });
      const data = await res.json();
      if (!data.success) return toast(data.message || 'Ticket could not be verified.', 'error');
      showProof(data.data, 'id', null);
    } catch (err) {
      toast('Network error. Please check your connection and try again.', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Verify Ticket';
    }
  }

  // ── proof dialog (renders ABOVE the check modal) ────────────────────────
  function showProof(d, mode, qrMeta) {
    const old = document.getElementById('ctProofOverlay');
    if (old) old.remove();

    const img = d.event_image
      ? `<img src="${esc(d.event_image)}" alt="" style="width:100%;height:170px;object-fit:cover;border-radius:12px;" onerror="this.style.display='none'" />`
      : '';
    const statusColor = d.ticket_status === 'Valid' ? '#16a34a' : (d.ticket_status === 'Used' ? '#d97706' : '#dc2626');

    const row = (label, value) => `
      <div style="display:flex;justify-content:space-between;gap:14px;padding:9px 0;border-bottom:1px dashed #eef2f7;">
        <span style="color:#64748b;font-size:.78rem;font-weight:600;white-space:nowrap;">${label}</span>
        <span style="color:#0f172a;font-size:.82rem;font-weight:700;text-align:right;">${value}</span>
      </div>`;

    const html = `
      <div style="text-align:center;margin-bottom:12px;">${img}</div>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:6px;">
        <h3 style="margin:0;font-size:1.12rem;font-weight:800;color:#0f172a;">${esc(d.event_name)}</h3>
        <span style="background:#f0fdf4;color:#15803d;font-size:.68rem;font-weight:700;padding:3px 9px;border-radius:999px;white-space:nowrap;">Verified by Ticket ID</span>
      </div>
      <div style="display:flex;gap:8px;margin:8px 0 14px;flex-wrap:wrap;">
        <span style="background:#f7f7f8;border:1px solid #eee;border-radius:999px;padding:4px 11px;font-size:.72rem;font-weight:700;color:#0f172a;">${esc(d.ticket_type)}</span>
        <span style="background:#fdf2f8;border:1px solid #fce7f3;border-radius:999px;padding:4px 11px;font-size:.72rem;font-weight:800;color:#be185d;">${esc(d.price_display)}</span>
        <span style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:999px;padding:4px 11px;font-size:.72rem;font-weight:800;color:${statusColor};">● ${esc(d.ticket_status)}</span>
      </div>
      ${row('Payment / Transaction Date', esc(fmtDate(d.payment_date)))}
      ${row('Event Date & Time', esc(fmtDate(d.event_date)) + (d.event_time ? ' · ' + esc(d.event_time) : ''))}
      ${row('Event Custom ID', esc(d.event_custom_id || '—'))}
      ${row('Ticket ID', esc(d.ticket_id))}
      ${row('Payment Reference', esc(d.payment_reference || '—'))}`;

    const overlay = document.createElement('div');
    overlay.id = 'ctProofOverlay';
    overlay.style.cssText =
      'position:fixed;inset:0;z-index:' + Z_PROOF + ';background:rgba(2,6,23,.75);display:flex;align-items:center;justify-content:center;padding:16px;';
    overlay.innerHTML = `<div style="background:#fff;border-radius:16px;max-width:460px;width:100%;max-height:88vh;overflow:auto;padding:22px;box-shadow:0 30px 80px -20px rgba(2,6,23,.6);">
      <div style="text-align:center;font-size:.95rem;font-weight:800;color:#15803d;margin-bottom:12px;">✅ Ticket Verified Successfully</div>
      ${html}
      <button id="ctProofClose" style="margin-top:14px;width:100%;border:none;background:#722f37;color:#fff;padding:11px;border-radius:10px;font-weight:700;cursor:pointer;">Done</button>
    </div>`;
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    overlay.querySelector('#ctProofClose').addEventListener('click', () => overlay.remove());
    document.body.appendChild(overlay);
  }

  // ── header icon (fixed, beside the notification bell) ───────────────────
  function ensureHeaderIcon() {
    // Already explicitly present in the page?
    if (document.getElementById('checkTicketIconBtn')) {
      document.getElementById('checkTicketIconBtn').addEventListener('click', (e) => {
        e.preventDefault(); open();
      });
      return;
    }
    const actions = document.querySelector('.header-actions');
    if (!actions) return;
    const bell = actions.querySelector('#notificationBellIcon') ||
                 actions.querySelector('[data-drawer="notifications"]') ||
                 actions.firstElementChild;
    const btn = document.createElement('div');
    btn.id = 'checkTicketIconBtn';
    btn.className = 'action-icon check-ticket-icon-btn';
    btn.title = 'Check Ticket';
    btn.setAttribute('role', 'button');
    btn.setAttribute('tabindex', '0');
    btn.textContent = '🎟️';
    btn.style.cssText = 'cursor:pointer;flex-shrink:0;user-select:none;';
    btn.addEventListener('click', (e) => { e.preventDefault(); open(); });
    btn.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    if (bell && bell.parentNode === actions) {
      actions.insertBefore(btn, bell); // directly beside the notification icon
    } else {
      actions.appendChild(btn);
    }
  }

  function bind() {
    ensureHeaderIcon();
    // Legacy profile-menu entry (user homepage) + any data-check-ticket hooks
    document.querySelectorAll('[data-check-ticket], #checkTicketBtn').forEach((el) => {
      if (el.dataset.ctBound) return;
      el.dataset.ctBound = '1';
      el.addEventListener('click', (e) => {
        e.preventDefault();
        const dd = document.getElementById('profileDropdown');
        if (dd) dd.style.display = 'none';
        if (dd && dd.classList) dd.classList.remove('show');
        open();
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }

  // Expose public API
  window.EventraTicketVerification = { open, close, bind };
})();
