/**
 * Payment Logic — Callback & Verification
 * Handles: Paystack redirect callback, order polling, and success UI.
 */

document.addEventListener('DOMContentLoaded', async () => {
    // 0. Wait for AuthController to be ready to ensure tokens/session are synced
    if (window.authController) {
        await window.authController.init();
        await window.authController.ready;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const reference = urlParams.get('reference');
    const orderData = JSON.parse(sessionStorage.getItem('pending_order'));
    
    const paymentLoading = document.getElementById('paymentLoading');
    const paymentForm = document.getElementById('paymentForm');
    const statusContainer = document.getElementById('paymentStatusContainer');
    const summaryContent = document.getElementById('summaryContent');

    // 1. Check if this is a callback from Paystack
    if (reference) {
        if (paymentLoading) paymentLoading.style.display = 'none';
        if (paymentForm) paymentForm.style.display = 'none';
        if (statusContainer) statusContainer.style.display = 'block';

        // Trigger server-side verification (Idempotent)
        (async () => {
            const title = document.getElementById('statusTitle');
            const msg = document.getElementById('statusMessage');
            const icon = document.getElementById('statusIcon');

            if (title) title.textContent = 'Verifying Payment...';
            if (msg) msg.textContent = 'Confirming your transaction...';
            if (icon) icon.textContent = '⏳';

            try {
                const verifyRes = await apiFetch(`/api/payments/verify-payment.php?reference=${reference}`);
                const verifyData = verifyRes ? await verifyRes.json() : null;
                
                if (verifyData && verifyData.success && verifyData.barcode) {
                    await showPaymentSuccess(reference, verifyData.barcode);
                    return;
                }
                startPolling(reference);
            } catch (err) {
                console.error("Verification error:", err);
                
                // Only start polling if it's explicitly a pending state or network blip,
                // Do NOT poll on a hard 500 error from the server.
                const isServerError = err.message && (err.message.includes('500') || err.message.includes('crash'));
                const isExplicitFailure = err.data && (err.data.status === 'failed' || err.data.success === false);
                
                if (isServerError || isExplicitFailure) {
                    const icon = document.getElementById('statusIcon');
                    const title = document.getElementById('statusTitle');
                    const msg = document.getElementById('statusMessage');
                    if (icon) icon.textContent = '❌';
                    if (title) title.textContent = 'Verification Failed';
                    if (msg) msg.textContent = escapeHTML(err.message || 'An unexpected error occurred while verifying payment.');
                    return;
                }
                
                startPolling(reference);
            }
        })();
        return;
    }

    // 2. No reference? Check for pending order in session
    if (!orderData) {
        Swal.fire('Error', 'No pending order found.', 'error').then(() => {
            window.location.href = 'index.html';
        });
        return;
    }

    const { eventId, quantity, ticket_type, contactInfo, authorization_url } = orderData;

    // 3. Pending order has an authorization URL (Paid Event)
    if (authorization_url) {
        if (paymentForm) paymentForm.style.display = 'none';
        
        // OTP logic removed. If the user lands here with a pending order, we assume they've verified or OTP is disabled.
        window.location.href = authorization_url;
        return;
    }

    // 4. Fallback: Load Event Details for summary / Legacy OTP Flow / Free Events
    try {
        const res = await apiFetch(`/api/events/get-event-details.php?event_id=${eventId}`);
        const result = await res.json();
        
        if (result.success && result.event) {
            const eventData = result.event;
            renderSummary(eventData, quantity, ticket_type);
            
            const isFree = parseFloat(eventData.price || 0) === 0;
            if (isFree) {
                setupFreeEventState(paymentForm, eventData, quantity, ticket_type);
            } else {
                if (paymentLoading) paymentLoading.style.display = 'none';
                if (paymentForm) paymentForm.style.display = 'block';
                // setupLegacyFlow removed as OTP is disabled.
            }
        } else {
            Swal.fire('Error', 'Failed to load event details.', 'error').then(() => {
                window.location.href = 'index.html';
            });
        }
    } catch (e) {
        Swal.fire('Error', 'An error occurred fetching event details.', 'error');
    }
});

// ─── Polling Logic ──────────────────────────────────────────────────────────

let pollCount = 0;
let consecutiveErrors = 0;
const maxPolls = 20;
const maxConsecutiveErrors = 3;

async function showPaymentSuccess(reference, barcode) {
    const paymentLoading = document.getElementById('paymentLoading');
    const paymentForm = document.getElementById('paymentForm');
    const statusContainer = document.getElementById('paymentStatusContainer');
    const icon = document.getElementById('statusIcon');
    const title = document.getElementById('statusTitle');
    const msg = document.getElementById('statusMessage');
    const actions = document.getElementById('successActions');

    if (paymentLoading) paymentLoading.style.display = 'none';
    if (paymentForm) paymentForm.style.display = 'none';
    if (statusContainer) statusContainer.style.display = 'block';

    let order = null;
    try {
        const res = await apiFetch(`/api/payments/get-order.php?reference=${reference}`);
        const result = res ? await res.json() : null;
        if (result && result.success) order = result.order;
    } catch (e) {}

    const cleanedName = (order?.event_name || '').replace(/\s*#\d+$/, '');
    const finalBarcode = barcode || (order?.barcode) || (order?.tickets?.[0]?.barcode) || (order?.ticket_id) || reference || 'N/A';
    const qrPayload = `https://eventra-website.liveblog365.com/api/tickets/validate-ticket.php?barcode=${encodeURIComponent(finalBarcode)}`;

    icon.innerHTML = `<div style="font-size:4rem;margin-bottom:1rem;">🎉</div>`;


    title.textContent = order?.amount <= 0 ? 'Ticket Confirmed! 🎉' : 'Payment Successful! 🎉';
    msg.innerHTML = `Your ticket${(order?.quantity||1) > 1 ? 's' : ''} for <strong>${escapeHTML(cleanedName)}</strong> ${order?.amount <= 0 ? 'have been issued' : 'are ready'}.<br><span style="font-size:0.8rem;color:var(--text-muted);">Ref: ${escapeHTML(reference)}</span>`;

    if (actions) actions.style.display = 'flex';
    sessionStorage.removeItem('pending_order');
    sessionStorage.setItem('purchase_success_redirection', 'true');
}

async function startPolling(reference) {
    const paymentLoading = document.getElementById('paymentLoading');
    const paymentForm = document.getElementById('paymentForm');
    const statusContainer = document.getElementById('paymentStatusContainer');
    
    const icon = document.getElementById('statusIcon');
    const title = document.getElementById('statusTitle');
    const msg = document.getElementById('statusMessage');
    const actions = document.getElementById('successActions');

    const poll = async () => {
        pollCount++;
        
        try {
            const res = await apiFetch(`/api/payments/get-order.php?reference=${reference}`);
            
            if (!res) {
                return;
            }

            // Reset consecutive errors on any successful response (even if 404/500 is handled by apiFetch as throw)
            // Wait, apiFetch throws for 404/500. So we only reach here for 200 OK.
            consecutiveErrors = 0;

            const result = await res.json();

            if (result.success && result.order) {
                const order = result.order;
                const status = result.status || order.payment_status;
                
                if (status === 'paid' || status === 'success') {
                    const firstBarcode = order.barcode || (order.tickets && order.tickets[0]?.barcode);
                    if (firstBarcode) {
                        await showPaymentSuccess(reference, firstBarcode);
                        return;
                    }
                }
                
                if (status === 'failed') {
                    icon.textContent = '❌';
                    title.textContent = 'Payment Failed';
                    msg.textContent = 'The transaction was declined. Please try again or contact support.';
                    return; // Stop polling
                }

                // If status is 'pending', we continue polling below
                if (pollCount % 3 === 0) {
                    msg.textContent = 'Still waiting for confirmation from the payment gateway...';
                }
            }
        } catch (e) {
            consecutiveErrors++;

            if (consecutiveErrors >= maxConsecutiveErrors) {
                icon.textContent = '⚠️';
                title.textContent = 'Connection Issue';
                msg.textContent = 'We are having trouble reaching the server. Please refresh the page in a few moments to check your status.';
                return; // Stop polling on repeated errors
            }
            
            // For 404 Specifically (if handled by apiFetch throw)
            if (e.message.includes('404')) {
                // If it's early in polling, treat 404 as "not yet created"
                if (pollCount > 8) {
                    icon.textContent = '❓';
                    title.textContent = 'Order Not Found';
                    msg.textContent = 'We could not locate your order record. If you were debited, please contact support with your reference.';
                    return;
                }
            }
        }

        if (pollCount >= maxPolls) {
            icon.textContent = '⏳';
            title.textContent = 'Verification in Progress';
            msg.innerHTML = "Confirmation is taking longer than expected. We'll continue processing in the background. You can safely close this page and check your mail later.";
            return;
        }

        setTimeout(poll, pollCount <= 5 ? 1500 : 2500);
    };

    poll();
}

// ─── Free Event Handler ─────────────────────────────────────────────────────

function setupFreeEventState(form, eventData, quantity, ticketType = 'regular') {
    const paymentLoading = document.getElementById('paymentLoading');
    if (paymentLoading) paymentLoading.style.display = 'none';
    form.style.display = 'block';

    const titleEl = document.querySelector('.section-title');
    if (titleEl) {
        titleEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg> Confirm Free Tickets`;
    }
    
    form.innerHTML = `
        <div style="text-align: center; padding: 1rem 0;">
            <p style="color: #64748b; margin-bottom: 2rem;">This event is free. Click below to secure your ${quantity} ticket(s).</p>
            <button type="button" class="pay-btn" id="confirmFreeBtn">
                ✓ Confirm & Claim Free Tickets
            </button>
        </div>
    `;

    document.getElementById('confirmFreeBtn').addEventListener('click', async () => {
        const btn = document.getElementById('confirmFreeBtn');
        btn.disabled = true;
        btn.textContent = 'Processing...';

        try {
            const finalRef = 'FREE-' + Math.random().toString(36).substr(2, 9).toUpperCase();
            const res = await apiFetch('/api/tickets/purchase-ticket.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    event_id: eventData.id,
                    quantity: quantity,
                    ticket_type: ticketType,
                    payment_reference: finalRef
                })
            });
            const result = await res.json();

            if (result.success) {
                sessionStorage.removeItem('pending_order');
                const barcode = result.barcode || (result.tickets && result.tickets[0]);
                const paymentForm = document.getElementById('paymentForm');
                const statusContainer = document.getElementById('paymentStatusContainer');
                if (paymentForm) paymentForm.style.display = 'none';
                if (statusContainer) statusContainer.style.display = 'block';
                if (barcode && typeof showPaymentSuccess === 'function') {
                    await showPaymentSuccess(finalRef, barcode);
                } else {
                    Swal.fire({ title: 'Tickets Issued!', text: 'Your free tickets are ready.', icon: 'success' })
                        .then(() => { window.location.href = 'index.html'; });
                }
            } else {
                Swal.fire('Error', result.message, 'error');
                btn.disabled = false;
                btn.textContent = 'Confirm & Claim Free Tickets';
            }
        } catch (e) {
            Swal.fire('Error', 'An internal error occurred.', 'error');
            btn.disabled = false;
        }
    });
}

// ─── Summary UI ─────────────────────────────────────────────────────────────

function renderSummary(event, qty, ticketType = 'regular') {
    // Merge metadata if present
    if (event.metadata && typeof event.metadata === 'string') {
        try {
            const meta = JSON.parse(event.metadata);
            Object.assign(event, meta);
        } catch(e) {}
    }

    let priceNum = parseFloat(event.price || 0);

    // Dynamic price lookup (tiered pricing)
    if (ticketType === 'vip' && event.vip_price) priceNum = parseFloat(event.vip_price);
    else if (ticketType === 'premium' && event.premium_price) priceNum = parseFloat(event.premium_price);
    else if (ticketType === 'regular' && event.regular_price) priceNum = parseFloat(event.regular_price);

    const total = priceNum * qty;
    const typeLabel = priceNum === 0 ? 'Free' : ticketType;
    const container = document.getElementById('summaryContent');
    if (!container) return;
    
    const relPath = event.image_path ? `../../${event.image_path.replace(/^\/+/ , '')}` : null;
    const fallback = 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=600&h=400&fit=crop';
    const imgUrl = (relPath || event.absolute_image_url || fallback);
    const cleanEventName = (event.event_name || '').replace(/\s*#\d+$/, '');
    
    // Normalize address/location
    let locationHtml = '';
    let locs = null;
    try {
        locs = event.locations ? (typeof event.locations === 'string' ? JSON.parse(event.locations) : event.locations) : null;
    } catch (e) {}
    const states = (event.state || '').split(',').map(s => s.trim()).filter(Boolean);
    const isMultiple = (Array.isArray(locs) && locs.length > 1) || (states.length > 1 && !states.includes('All States'));
    if (isMultiple && typeof buildMultiLocationHTML === 'function') {
        const locList = Array.isArray(locs) && locs.length > 0 ? locs : states.map(s => ({ state: s, address: event.address || '' }));
        locationHtml = buildMultiLocationHTML(locList, { expandable: true, idPrefix: 'payMloc' });
    } else {
        const locationStr = [event.location || event.address, event.city, event.state].filter(Boolean).join(', ') || 'Location details unavailable';
        locationHtml = `<p style="font-size: 0.8rem; color: var(--text-muted);">${escapeHTML(locationStr)}</p>`;
    }

    container.innerHTML = `
        <div style="display: flex; gap: 1rem; margin-bottom: 2rem;">
            <img src="${imgUrl}" onerror="this.src='${fallback}'" style="width: 80px; height: 80px; border-radius: 1rem; object-fit: cover;">
            <div style="flex:1;min-width:0;">
                <h4 style="font-weight: 700; color: var(--text-main);">${escapeHTML(cleanEventName)}</h4>
                ${locationHtml}
                <p style="font-size: 0.75rem; color: var(--primary-color); font-weight: 600; margin-top: 4px; text-transform: uppercase;">
                    ${escapeHTML(typeLabel)} Ticket
                </p>
            </div>
        </div>
        <div class="summary-item">
            <span>Quantity</span>
            <span>× ${qty}</span>
        </div>
        <div class="summary-total">
            <span>Amount Paid</span>
            <span>${(event.amount !== undefined ? parseFloat(event.amount) : total) === 0 ? 'FREE' : '₦' + (event.amount !== undefined ? parseFloat(event.amount) : total).toLocaleString()}</span>
        </div>
    `;
}

/**
 * Populates the hidden #ticket-card with order details for html2pdf.js
 */
function prepareTicketForDownload(order, barcode) {
    const cleanName = (order.event_name || '').replace(/\s*#\d+$/, '');
    const orderAmount = parseFloat(order.amount ?? order.price ?? 0);
    const ticketType = orderAmount <= 0 ? 'FREE' : (order.ticket_type || 'regular').toUpperCase();
    const attendee = order.user_name || (order.contactInfo ? `${order.contactInfo.firstName} ${order.contactInfo.lastName}` : 'Guest');
    let date = 'TBA';
    if (order.event_date) {
        const d = new Date(order.event_date);
        date = !isNaN(d.getTime()) ? d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }) : order.event_date;
    }
    const time = order.event_time || 'TBA';
    const venue = order.address || order.location || 'See event details';
    
    // Update elements
    const elName = document.getElementById('ticketEventName');
    const elBadge = document.getElementById('ticketBadge');
    const elDateTime = document.getElementById('ticketDateTime');
    const elVenue = document.getElementById('ticketVenue');
    const elAttendee = document.getElementById('ticketAttendee');
    const elID = document.getElementById('ticketID');
    const elBarcodeText = document.getElementById('ticketBarcodeText');

    if(elName) elName.textContent = cleanName;
    if(elBadge) elBadge.textContent = ticketType;
    if(elDateTime) elDateTime.textContent = `${date} | ${time}`;
    if(elVenue) elVenue.textContent = venue;
    if(elAttendee) elAttendee.textContent = attendee;
    if(elID) elID.textContent = barcode;
    if(elBarcodeText) elBarcodeText.textContent = barcode;
    
    // Apply interaction restrictions to ticket QR as well
    const ticketQR = document.getElementById('ticketQR');
    if (ticketQR) {
        ticketQR.style.pointerEvents = 'none';
        ticketQR.style.userSelect = 'none';
        ticketQR.oncontextmenu = () => false;
    }
    
    // Set banner image
    const banner = document.getElementById('ticketEventBanner');
    if (banner) {
        const relPath = order.image_path ? `../../${order.image_path.replace(/^\/+/ , '')}` : null;
        const fallback = 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=600&h=400&fit=crop';
        const imgUrl = (relPath || order.absolute_image_url || fallback);
        banner.style.backgroundImage = `url('${imgUrl}')`;
    }

    // Generate QR Code for the ticket
    const qrContainer = document.getElementById('ticketQR');
    if (qrContainer && typeof QRCode !== 'undefined') {
        qrContainer.innerHTML = '';
        new QRCode(qrContainer, {
            text: 'https://eventra-website.liveblog365.com/api/tickets/validate-ticket.php?barcode=' + encodeURIComponent(barcode || ''),
            width: 140,
            height: 130,
            colorDark: "#000000",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.H
        });
    }
}

// ─── Legacy Flows (Removed) ─────────────────────────────────────────────────

// Functions below removed to prevent conflict with otp-modal.js
// triggerOTP and verifyOTP are now handled by showOTPModal utility

async function reinitializeAndRedirect(eventId, quantity) {
    const btn = document.getElementById('confirmPaymentBtn');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="btn-spinner"></span> Redirecting to Paystack...';
    }

    try {
        const res = await apiFetch('/api/payments/initialize.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                event_id: eventId,
                quantity: quantity
            })
        });
        const result = await res.json();

        if (result.success && result.authorization_url) {
            // Update session and redirect
            const orderData = JSON.parse(sessionStorage.getItem('pending_order') || '{}');
            orderData.authorization_url = result.authorization_url;
            sessionStorage.setItem('pending_order', JSON.stringify(orderData));
            
            window.location.href = result.authorization_url;
        } else {
            showNotification(result.message || 'Failed to initialize Paystack.', 'error');
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Pay';
            }
        }
    } catch (e) {
        showNotification('Error connecting to payment gateway.', 'error');
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Pay';
        }
    }
}

