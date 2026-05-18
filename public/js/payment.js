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
                // Proceed to polling regardless of immediate result, get-order will handle the final state
                startPolling(reference);
            } catch (err) {
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
const maxPolls = 15; // ~45 seconds of polling
const maxConsecutiveErrors = 3;

async function startPolling(reference) {
    const paymentLoading = document.getElementById('paymentLoading');
    const paymentForm = document.getElementById('paymentForm');
    const statusContainer = document.getElementById('paymentStatusContainer');
    
    const icon = document.getElementById('statusIcon');
    const title = document.getElementById('statusTitle');
    const msg = document.getElementById('statusMessage');
    const actions = document.getElementById('successActions');
    const downloadBtn = document.getElementById('downloadTicketBtn');

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
                    // SUCCESS!
                    const cleanedName = (order.event_name || '').replace(/\s*#\d+$/, '');
                    
                    // Hide any remaining loading indicators
                    if (paymentLoading) paymentLoading.style.display = 'none';
                    if (paymentForm) paymentForm.style.display = 'none';
                    if (statusContainer) statusContainer.style.display = 'block';

                    // Build QR using the SAME validation URL as the ticket PDF
                    const firstBarcode  = order.barcode || (order.tickets && order.tickets[0]?.barcode);
                    const qrPayload     = firstBarcode
                        ? `${window.location.origin}/api/tickets/validate-ticket.php?barcode=${encodeURIComponent(firstBarcode)}`
                        : `${window.location.origin}/api/payments/get-order.php?reference=${reference}`;
                    
                    
                    icon.innerHTML = `<div id="qrcode-container" 
                                           oncontextmenu="return false;" 
                                           onmousedown="return false;"
                                           style="display: flex; flex-direction: column; align-items: center; justify-content: center; margin-bottom: 1.5rem; pointer-events: none; user-select: none;">
                                        <div id="qrcode" style="position: relative; background: #fff; padding: 10px; border-radius: 1rem; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1); border: 1px solid #e2e8f0;"></div>
                                        <div style="position: absolute; width: 160px; height: 160px; background: transparent; z-index: 5;"></div>
                                      </div>
                                      <div style="font-size:0.75rem; font-weight: 600; color:#64748b; margin-top:-0.5rem; margin-bottom:0.75rem; user-select: none;">Scan to validate ticket</div>`;
                    
                    try {
                        new QRCode(document.getElementById("qrcode"), {
                            text: String(qrPayload),
                            width: 160,
                            height: 160,
                            colorDark : "#000000",
                            colorLight : "#ffffff",
                            correctLevel : QRCode.CorrectLevel.L
                        });
                    } catch (e) {
                        console.error("QRCode generation failed:", e);
                        const qrContainer = document.getElementById('qrcode');
                        if (qrContainer) {
                            qrContainer.innerHTML = '<div style="font-size: 0.7rem; color: #ef4444; padding: 20px;">QR Generation Error</div>';
                        }
                    }
                    
                    title.textContent = order.is_free ? 'Ticket Confirmed! 🎉' : 'Payment Successful! 🎉';
                    msg.innerHTML = `Your ticket${(order.quantity||1) > 1 ? 's' : ''} for <strong>${escapeHTML(cleanedName)}</strong> ${order.is_free ? 'have been issued' : 'are ready'}.<br><span style="font-size:0.8rem;color:#6b7280;">Ref: ${escapeHTML(reference)}</span>`;
                    
                    if (order) {
                        renderSummary(order, order.quantity || quantity || 1, order.ticket_type || ticket_type || 'regular');
                    }
                    
                    if (firstBarcode) {
                        // Populate hidden ticket card for PDF generation
                        prepareTicketForDownload(order, firstBarcode);
                        
                        // FIX: Use robust server-side PDF generation instead of client-side html2pdf.js
                        if (downloadBtn) {
                            downloadBtn.onclick = () => {
                                const downloadUrl = `/api/tickets/download-ticket.php?code=${encodeURIComponent(firstBarcode)}`;
                                window.location.href = downloadUrl;
                            };
                        }
                        if (actions) actions.style.display = 'flex';
                    }
                    
                    sessionStorage.removeItem('pending_order');
                    sessionStorage.setItem('purchase_success_redirection', 'true');
                    return; // Stop polling

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

        setTimeout(poll, 4000); // Increased delay to 4s as requested (3-5s)
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
                Swal.fire({
                    title: 'Tickets Issued!',
                    text: 'Your free tickets are ready. Check your email.',
                    icon: 'success'
                }).then(() => { window.location.href = 'index.html'; });
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
    let locationStr = '';
    if (event.location || event.address) {
        locationStr = [event.location || event.address, event.city, event.state].filter(Boolean).join(', ');
    } else {
        locationStr = 'Location details unavailable';
    }

    container.innerHTML = `
        <div style="display: flex; gap: 1rem; margin-bottom: 2rem;">
            <img src="${imgUrl}" onerror="this.src='${fallback}'" style="width: 80px; height: 80px; border-radius: 1rem; object-fit: cover;">
            <div>
                <h4 style="font-weight: 700; color: #1e293b;">${escapeHTML(cleanEventName)}</h4>
                <p style="font-size: 0.8rem; color: #64748b;">${escapeHTML(locationStr)}</p>
                <p style="font-size: 0.75rem; color: #722f37; font-weight: 600; margin-top: 4px; text-transform: uppercase;">
                    ${escapeHTML(typeLabel)} Ticket
                </p>
            </div>
        </div>
        <div class="summary-item">
            <span>Price</span>
            <span>${priceNum === 0 ? 'FREE' : '₦' + priceNum.toLocaleString()}</span>
        </div>
        <div class="summary-item">
            <span>Quantity</span>
            <span>× ${qty}</span>
        </div>
        <div class="summary-total">
            <span>Amount Paid</span>
            <span>${total === 0 ? 'FREE' : '₦' + total.toLocaleString()}</span>
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
    const date = formatDate(order.event_date) || 'TBA';
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
    if (qrContainer) {
        qrContainer.innerHTML = ''; // Clear previous
        const safeBarcode = (typeof barcode === 'string') ? barcode : String(barcode || '');
        const qrPayload = `${window.location.origin}/api/tickets/validate-ticket.php?barcode=${encodeURIComponent(safeBarcode)}`;
        try {
            new QRCode(qrContainer, {
                text: String(qrPayload),
                width: 130,
                height: 130,
                colorDark : "#000000",
                colorLight : "#ffffff",
                correctLevel : QRCode.CorrectLevel.L
            });
        } catch (e) {
            console.error("Ticket QR generation failed:", e);
        }
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

