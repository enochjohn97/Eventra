// Eventra Checkout Logic v1.0.1 (Resolving ReferenceError)
document.addEventListener('DOMContentLoaded', async () => {
    // 1. Initial State & URL Parsing
    const urlParams = new URLSearchParams(window.location.search);
    const eventId = urlParams.get('id');
    const quantityParam = urlParams.get('quantity') || '1';
    const ticketType = urlParams.get('type') || urlParams.get('ticket_type') || 'regular';
    const selectedLocsParam = urlParams.get('selected_locs');
    let currentQuantity = parseInt(quantityParam, 10);
    
    if (isNaN(currentQuantity) || currentQuantity < 1) currentQuantity = 1;

    let eventData = null;
    window._checkoutEventData = null; // module-scope reference for helpers
    let paystackPublicKey = null;
    let currentUser = null;
    let currentTicketType = ticketType;

    if (!eventId) {
        const isFromSuccess = sessionStorage.getItem('purchase_success_redirection');
        if (isFromSuccess) {
            sessionStorage.removeItem('purchase_success_redirection');
            window.location.href = 'index.html';
            return;
        }
        showErrorAndRedirect('No event specified for checkout', 'index.html');
        return;
    }


    // 2. Auth Check - Initialize and ensure AuthController has finished syncing
    authController.init();
    await authController.ready;
    
    if (!isAuthenticated()) {
        sessionStorage.setItem('redirect_after_login', window.location.href);
        window.location.href = 'index.html'; // Trigger index.html login modal logic
        return;
    }

    try {
        // Fetch User Data from storage
        const keys = typeof getRoleKeys === 'function' ? getRoleKeys() : { user: 'user' };
        currentUser = (window.storage?.get(keys.user)) || (window.storage?.get('user'));
        
        if (currentUser) {
            document.getElementById('firstName').value = currentUser.name ? currentUser.name.split(' ')[0] : '';
            document.getElementById('lastName').value = currentUser.name && currentUser.name.includes(' ') ? currentUser.name.split(' ').slice(1).join(' ') : '';
            document.getElementById('emailAdd').value = currentUser.email || '';
            document.getElementById('phoneNum').value = currentUser.phone || '';
        }

        // Fetch Event Data
        const eventRes = await apiFetch(`/api/events/get-event-details.php?event_id=${eventId}`);
        const eventResult = await eventRes.json();

        if (!eventResult.success || !eventResult.event) {
            showErrorAndRedirect('Event not found or unavailable', 'index.html');
            return;
        }
        
        eventData = eventResult.event;
        window._checkoutEventData = eventData; // expose for out-of-scope helpers
        
        // Block checkout if event is past (Strict Timestamp Validation)
        const eventEndDateTime = new Date(eventData.event_end_datetime);
        const now = new Date();

        if (now > eventEndDateTime) {
            showErrorAndRedirect('This event has already concluded', 'index.html');
            return;
        }

        // Output Event Data to UI
        renderEventSummary(eventData, currentQuantity, currentTicketType);

        // Fetch Paystack Config
        const paystackRes = await apiFetch('/api/payments/paystack.php');
        const paystackResult = await paystackRes.json();

        if (paystackResult.success && paystackResult.public_key) {
            paystackPublicKey = paystackResult.public_key;
        } else {
            showNotification('Payment system is currently unavailable', 'error');
            document.getElementById('paystackBtn').disabled = true;
        }

        // Hide overlay once everything is loaded
        document.getElementById('loadingOverlay').style.display = 'none';

    } catch (error) {
        showErrorAndRedirect('Failed to initialize checkout secure environment', 'index.html');
    }

    // 3. Setup Quantity Controls
    const btnMinus = document.getElementById('qtyMinus');
    const btnPlus = document.getElementById('qtyPlus');
    
    if (btnMinus && btnPlus) {
        btnMinus.addEventListener('click', () => {
            if (currentQuantity > 1) {
                currentQuantity--;
                renderEventSummary(eventData, currentQuantity, currentTicketType);
            }
        });
        btnPlus.addEventListener('click', () => {
            if (eventData.max_capacity && (eventData.attendee_count + currentQuantity) >= eventData.max_capacity) {
                showNotification('Max capacity reached for this event', 'warning');
                return;
            }
            currentQuantity++;
            renderEventSummary(eventData, currentQuantity, currentTicketType);
        });
    }

    // 4. Setup Payment Action
    const payBtn = document.getElementById('paystackBtn');
    if (payBtn) {
        payBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            
            // 1. Basic Validation
            const phone = document.getElementById('phoneNum')?.value.trim();
            const email = document.getElementById('emailAdd')?.value.trim();
            const fname = document.getElementById('firstName')?.value.trim();
            const lname = document.getElementById('lastName')?.value.trim();

            if (!phone || !email || !fname || !lname) {
                showNotification('Please provide all contact information.', 'error');
                return;
            }

            // 2. Event Conclusion Check
            const eventEndDateTime = new Date(eventData.event_end_datetime || eventData.event_date + 'T' + (eventData.event_time || '23:59:59'));
            if (new Date() > eventEndDateTime) {
                showNotification('This event has already concluded.', 'error');
                return;
            }

            // 3. Proceed to payment directly (OTP logic removed)
            await proceedToPayment(eventId, currentQuantity, currentTicketType, fname, lname, email, phone, payBtn, eventData, null, selectedLocsParam);

        });
    }

    async function proceedToPayment(eventId, currentQuantity, currentTicketType, fname, lname, email, phone, payBtn, eventData, otpReference = null, selectedLocs = null) {
        // Disable button & show loading
        payBtn.disabled = true;
        payBtn.innerHTML = '<span class="btn-spinner"></span> Initializing...';
        
        try {
            // Initialize Order via Marketplace API
            const res = await apiFetch('/api/payments/initialize.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    event_id: eventId,
                    quantity: currentQuantity,
                    ticket_type: currentTicketType,
                    otp_reference: otpReference,
                    selected_locs: selectedLocs
                })
            });
            
            const result = await res.json();
            
            if (result.success) {
                // Paid or Free event — store order and redirect to payment processor or success page
                const orderData = {
                    eventId: eventId,
                    quantity: currentQuantity,
                    ticket_type: currentTicketType,
                    order_id: result.order_id,
                    reference: result.reference,
                    authorization_url: result.authorization_url,
                    amount: result.amount,
                    is_free: result.is_free,
                    contactInfo: {
                        firstName: fname,
                        lastName: lname,
                        email: email,
                        phone: phone
                    }
                };
                sessionStorage.setItem('pending_order', JSON.stringify(orderData));
                window.location.href = result.authorization_url;

            } else {
                Swal.fire('Error', result.message || 'Payment initialization failed.', 'error');
                resetPayBtn(eventData, currentQuantity);
            }
        } catch (err) {
            const errMsg = err?.message || 'Could not connect to payment server. Please check your connection and try again.';
            Swal.fire('Error', errMsg, 'error');
            resetPayBtn(eventData, currentQuantity);
        }
    }

    // Modals and Flow code removed - Moved to payment.html/payment.js
});

// Helper: Render Left Column
function renderEventSummary(event, quantity, ticketType = 'regular') {
    let price = parseFloat(event.price || 0);

    // Dynamic price lookup
    if (ticketType === 'vip' && event.vip_price) price = parseFloat(event.vip_price);
    else if (ticketType === 'premium' && event.premium_price) price = parseFloat(event.premium_price);
    else if (ticketType === 'regular' && event.regular_price) price = parseFloat(event.regular_price);

    const total = price * quantity;

    // Use absolute URL from API with fallback
    const summaryImg = document.getElementById('summaryImg');
    const relPath = event.image_path ? `../../${event.image_path.replace(/^\/+/ , '')}` : null;
    const fallback = 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=600&h=400&fit=crop';
    const imgUrl = encodeURI(relPath || event.absolute_image_url || fallback);
    
    summaryImg.src = imgUrl;
    summaryImg.loading = 'lazy'; // Performance: Lazy load
    summaryImg.onerror = () => {
        summaryImg.src = fallback;
    };

    const elTitle = document.getElementById('summaryTitle');
    if (elTitle) elTitle.innerHTML = `<strong>${escapeHTML((event.event_name || '').replace(/\s*#\d+$/, ''))}</strong>`;

    const elDate = document.getElementById('summaryDate');
    if (elDate) elDate.textContent = `${formatDate(event.event_date)} • ${event.event_time || 'TBA'}`;

    const elLoc = document.getElementById('summaryLocation');
    if (elLoc) {
        // Parse locations JSON
        let locs = null;
        try {
            locs = event.locations ? (typeof event.locations === 'string' ? JSON.parse(event.locations) : event.locations) : null;
        } catch (e) {
            console.error("Error parsing event locations:", e);
        }

        const states = (event.state || '').split(',').map(s => s.trim()).filter(Boolean);
        const isMultiple = (Array.isArray(locs) && locs.length > 1) || (states.length > 1 && !states.includes('All States'));

        if (isMultiple) {
            // Multi-location UI
            const locList = Array.isArray(locs) && locs.length > 0 
                ? locs 
                : states.map(s => ({ state: s, address: '' }));

            elLoc.innerHTML = `
                <div class="location-summary-container">
                    <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; cursor: pointer;" onclick="toggleLocationExpand()">
                        <span style="font-weight: 600; color: #1e293b;">Multiple Locations</span>
                        <button type="button" id="locationToggleBtn" style="background: #f1f5f9; border: none; padding: 4px 8px; border-radius: 6px; font-size: 0.75rem; font-weight: 700; color: #722f37; cursor: pointer; display: flex; align-items: center; gap: 4px;">
                            See more <span id="locToggleIcon">▼</span>
                        </button>
                    </div>
                    <div id="expandedLocations" style="display: none; margin-top: 12px; padding-top: 12px; border-top: 1px dashed #e2e8f0; max-height: 200px; overflow-y: auto;">
                        <ul style="list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 10px;">
                            ${locList.map(loc => `
                                <li style="display: flex; flex-direction: column; gap: 2px;">
                                    <div style="font-weight: 700; color: #0f172a; font-size: 0.85rem;">📍 ${escapeHTML(loc.state)}</div>
                                    <div style="font-size: 0.8rem; color: #64748b; line-height: 1.4; padding-left: 18px;">${escapeHTML(loc.address || 'Address TBA')}</div>
                                </li>
                            `).join('')}
                        </ul>
                    </div>
                </div>
            `;
            
            // Add global toggle function if not exists
            if (!window.toggleLocationExpand) {
                window.toggleLocationExpand = function() {
                    const expanded = document.getElementById('expandedLocations');
                    const btnText = document.querySelector('#locationToggleBtn');
                    const icon = document.getElementById('locToggleIcon');
                    if (expanded.style.display === 'none') {
                        expanded.style.display = 'block';
                        icon.textContent = '▲';
                        if (btnText) btnText.firstChild.textContent = 'See less ';
                    } else {
                        expanded.style.display = 'none';
                        icon.textContent = '▼';
                        if (btnText) btnText.firstChild.textContent = 'See more ';
                    }
                };
            }
        } else {
            // Single location UI
            const stateText = event.state || 'Nigeria';
            const addressText = event.address ? `${event.address}, ` : '';
            elLoc.textContent = `${addressText}${stateText}`;
        }
    }

    const elCat = document.getElementById('summaryCategory');
    if (elCat) {
        if (price === 0) {
            elCat.textContent = 'Free';
        } else {
            elCat.textContent = (ticketType.charAt(0).toUpperCase() + ticketType.slice(1)) + ' Ticket';
        }
    }

    const elDesc = document.getElementById('summaryDescription');
    if (elDesc) elDesc.textContent = event.description || '';
    
    const elPrice = document.getElementById('summaryPrice');
    if (elPrice) elPrice.textContent = price === 0 ? 'FREE' : `₦${price.toLocaleString()}`;
    const elQty = document.getElementById('summaryQty');
    if (elQty) elQty.textContent = `x${quantity}`;

    const elTotal = document.getElementById('summaryTotal');
    if (elTotal) elTotal.textContent = total === 0 ? 'FREE' : `₦${total.toLocaleString()}`;

    // Update button text
    resetPayBtn(price, quantity);
}

function resetPayBtn(price, quantity) {
     const payBtn = document.getElementById('paystackBtn');
     if (!payBtn) return;
     const total = price * quantity;
     payBtn.disabled = false;
     payBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                        Checkout <span id="btnPayAmount">${total === 0 ? 'FREE (Claim)' : `₦${total.toLocaleString()}`}</span>`;
}

// Helper: createTicket function removed - now handled by payment.html / payment.js

function showErrorAndRedirect(msg, url) {
    document.getElementById('loadingOverlay').style.display = 'none';
    Swal.fire({
        title: 'Notice',
        text: msg,
        icon: 'warning',
        confirmButtonColor: '#ff5a5f'
    }).then(() => {
        window.location.href = url;
    });
}

// 5. Cleanup
sessionStorage.removeItem('pending_order_initialized');
