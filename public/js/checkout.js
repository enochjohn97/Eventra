document.addEventListener('DOMContentLoaded', async () => {
    // 1. Initial State & URL Parsing
    const urlParams = new URLSearchParams(window.location.search);
    const eventId = urlParams.get('id');
    const quantityParam = urlParams.get('quantity') || '1';
    let currentQuantity = parseInt(quantityParam, 10);
    
    if (isNaN(currentQuantity) || currentQuantity < 1) currentQuantity = 1;

    let eventData = null;
    window._checkoutEventData = null; // module-scope reference for helpers
    let paystackPublicKey = null;
    let currentUser = null;

    if (!eventId) {
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
        const eventRes = await apiFetch(`../../api/events/get-event-details.php?event_id=${eventId}`);
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
        renderEventSummary(eventData, currentQuantity);

        // Fetch Paystack Config
        const paystackRes = await apiFetch('../../api/payments/paystack.php');
        const paystackResult = await paystackRes.json();

        if (paystackResult.success && paystackResult.public_key) {
            paystackPublicKey = paystackResult.public_key;
        } else {
            console.error('Paystack Config Error:', paystackResult.message);
            showNotification('Payment system is currently unavailable', 'error');
            document.getElementById('paystackBtn').disabled = true;
        }

        // Hide overlay once everything is loaded
        document.getElementById('loadingOverlay').style.display = 'none';

    } catch (error) {
        console.error('Checkout Initialization Error:', error);
        showErrorAndRedirect('Failed to initialize checkout secure environment', 'index.html');
    }

    // 3. Setup Payment Action
    const payBtn = document.getElementById('paystackBtn');

    if (payBtn) {
        payBtn.addEventListener('click', (e) => {
            e.preventDefault();
            // Validation
            const phone = document.getElementById('phoneNum')?.value.trim();
            const email = document.getElementById('emailAdd')?.value.trim();
            const fname = document.getElementById('firstName')?.value.trim();
            const lname = document.getElementById('lastName')?.value.trim();

            if (!phone || !email || !fname || !lname) {
                showNotification('Please provide all contact information.', 'error');
                return;
            }

            const exactPrice = eventData?.price || 0;
            if (exactPrice === 0) {
                createTicket(eventId, currentQuantity, null);
                return;
            }

            // Proceed to real Payment Page
            const orderData = {
                eventId: eventId,
                quantity: currentQuantity,
                contactInfo: {
                    firstName: fname,
                    lastName: lname,
                    email: email,
                    phone: phone
                }
            };
            
            // Store pending order securely
            sessionStorage.setItem('pending_order', JSON.stringify(orderData));
            
            // Redirect to payment page
            window.location.href = 'payment.html';
        });
    }

    // Modals and Flow code removed - Moved to payment.html/payment.js
});

// Helper: Render Left Column
function renderEventSummary(event, quantity) {
    const price = event.price || 0;
    const total = price * quantity;

    // Use absolute URL from API with fallback
    const summaryImg = document.getElementById('summaryImg');
    summaryImg.src = event.absolute_image_url || 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=600&h=400&fit=crop';
    summaryImg.onerror = () => {
        summaryImg.src = 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=600&h=400&fit=crop';
    };

    const elTitle = document.getElementById('summaryTitle');
    if (elTitle) elTitle.innerHTML = `<strong>${event.event_name}</strong>`;

    const elDate = document.getElementById('summaryDate');
    if (elDate) elDate.textContent = `${formatDate(event.event_date)} • ${event.event_time || 'TBA'}`;

    const elLoc = document.getElementById('summaryLocation');
    if (elLoc) elLoc.textContent = `${event.city || ''}, ${event.state || 'Nigeria'}`.replace(/^, /, '');

    const elDesc = document.getElementById('summaryDescription');
    if (elDesc) elDesc.textContent = event.description || '';
    
    const elPrice = document.getElementById('summaryPrice');
    if (elPrice) elPrice.textContent = price === 0 ? 'FREE' : `₦${price.toLocaleString()}`;
    const elQty = document.getElementById('summaryQty');
    if (elQty) elQty.textContent = `x${quantity}`;

    const elTotal = document.getElementById('summaryTotal');
    if (elTotal) elTotal.textContent = total === 0 ? 'FREE' : `₦${total.toLocaleString()}`;

    // Update button text
    resetPayBtn(event, quantity);
}

function resetPayBtn(event, quantity) {
     const payBtn = document.getElementById('paystackBtn');
     if (!payBtn) return;
     const price = event.price || 0;
     const total = price * quantity;
     payBtn.disabled = false;
     payBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                        Checkout <span id="btnPayAmount">${total === 0 ? 'FREE (Claim)' : `₦${total.toLocaleString()}`}</span>`;
}

// Helper: Trigger the actual DB ticket insertion via Backend API
async function createTicket(eventId, quantity, paymentReference) {
    const referral = sessionStorage.getItem('referral_client');

    try {
        const response = await apiFetch('../../api/tickets/purchase-ticket.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                event_id: eventId,
                quantity: parseInt(quantity),
                referred_by_client: referral,
                payment_reference: paymentReference
            })
        });

        const result = await response.json();
        if (result.success) {
            // Send Receipt and Ticket Emails asynchronously
            apiFetch('../../api/emails/send-email.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'receipt',
                    payment_reference: paymentReference
                })
            }).catch(err => console.error('Receipt Email Error:', err));

            apiFetch('../../api/emails/send-email.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'ticket',
                    payment_reference: paymentReference
                })
            }).catch(err => console.error('Ticket Email Error:', err));

            document.getElementById('loadingOverlay').style.display = 'none';
            Swal.fire({
                title: 'Payment Successful!',
                text: 'Your tickets have been secured.',
                icon: 'success',
                confirmButtonColor: '#ff5a5f'
            }).then(() => {
                const keys = typeof getRoleKeys === 'function' ? getRoleKeys() : { role: 'role' };
                const role = window.storage?.get(keys.role) || window.storage?.get('role') || (window.storage?.getUser()?.role);
                if(role === 'client') {
                    window.location.href = '../../client/pages/tickets.html';
                } else if(role === 'admin') {
                    window.location.href = '../../admin/pages/tickets.html';
                } else {
                    window.location.href = 'index.html';
                }
            });
        } else {
            document.getElementById('loadingOverlay').style.display = 'none';
            showNotification(result.message || 'Ticket generation failed', 'error');
            resetPayBtn(window._checkoutEventData || {}, quantity);
        }
    } catch (error) {
        document.getElementById('loadingOverlay').style.display = 'none';
        console.error('Ticket Creation Error:', error);
        showNotification('Fatal Error creating ticket. Check email for receipt.', 'error');
    }
}

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
