document.addEventListener('DOMContentLoaded', async () => {
    // 1. Initial State & URL Parsing
    const urlParams = new URLSearchParams(window.location.search);
    const eventId = urlParams.get('id');
    const quantityParam = urlParams.get('quantity') || '1';
    let currentQuantity = parseInt(quantityParam, 10);
    
    if (isNaN(currentQuantity) || currentQuantity < 1) currentQuantity = 1;

    let eventData = null;
    let paystackPublicKey = null;
    let currentUser = null;

    if (!eventId) {
        showErrorAndRedirect('No event specified for checkout', 'index.html');
        return;
    }

    // 2. Auth Check
    if (!isAuthenticated()) {
        sessionStorage.setItem('redirect_after_login', window.location.href);
        window.location.href = 'index.html'; // Trigger index.html login modal logic
        return;
    }

    try {
        // Fetch User Data from storage
        const keys = typeof getRoleKeys === 'function' ? getRoleKeys() : { user: 'user' };
        currentUser = storage.get(keys.user) || storage.get('user');
        
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
        
        // Block checkout if event is past
        const eventDateObj = new Date(eventData.event_date);
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        if (eventDateObj < now) {
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

    // 3. Setup Paystack Payment Action
    const payBtn = document.getElementById('paystackBtn');
    payBtn.addEventListener('click', () => {
        payBtn.disabled = true;
        payBtn.innerHTML = '<span class="spinner" style="width: 20px; height: 20px; border-width: 2px;"></span> Processing...';
        
        // Validation
        const phone = document.getElementById('phoneNum').value;
        const fname = document.getElementById('firstName').value;
        const lname = document.getElementById('lastName').value;

        if (!phone || !fname || !lname) {
            showNotification('Please provide all contact information.', 'error');
            resetPayBtn(eventData, currentQuantity);
            return;
        }

        const exactPrice = parseFloat(eventData.price) || 0;
        const isFree = exactPrice === 0;

        if (isFree) {
            // Bypass Paystack entirely if free
            createTicket(eventId, currentQuantity, null);
            return;
        }

        if (!paystackPublicKey) {
            showNotification('Payment gateway not initialized.', 'error');
            resetPayBtn(eventData, currentQuantity);
            return;
        }

        const totalAmountNaira = exactPrice * currentQuantity;
        const paystackAmountKobo = Math.round(totalAmountNaira * 100);

        // Start Paystack Popup
        const handler = PaystackPop.setup({
            key: paystackPublicKey,
            email: currentUser.email,
            amount: paystackAmountKobo,
            currency: 'NGN',
            metadata: {
                custom_fields: [
                    {
                        display_name: "Event Internal ID",
                        variable_name: "event_id",
                        value: eventId
                    },
                    {
                        display_name: "Quantity",
                        variable_name: "quantity",
                        value: currentQuantity
                    }
                ]
            },
            callback: function(response) {
                // Success!
                const reference = response.reference;
                
                // Show loading block on form
                document.getElementById('loadingOverlay').style.display = 'flex';
                document.querySelector('#loadingOverlay h3').textContent = 'Confirming Payment...';
                
                // Immediately create the ticket as successful
                createTicket(eventId, currentQuantity, reference);
            },
            onClose: function() {
                showNotification('Payment window closed.', 'info');
                resetPayBtn(eventData, currentQuantity);
            }
        });

        handler.openIframe();
    });

});

// Helper: Render Left Column
function renderEventSummary(event, quantity) {
    const price = parseFloat(event.price) || 0;
    const total = price * quantity;

    document.getElementById('summaryImg').src = event.image_path ? `../../${event.image_path.replace(/^\/+/, '')}` : 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=600&h=400&fit=crop';
    document.getElementById('summaryTitle').textContent = event.event_name;
    document.getElementById('summaryDate').textContent = `${formatDate(event.event_date)} • ${event.event_time || 'TBA'}`;
    document.getElementById('summaryLocation').textContent = `${event.city || ''}, ${event.state || 'Nigeria'}`.replace(/^, /, '');
    
    document.getElementById('summaryPrice').textContent = price === 0 ? 'Free' : `₦${price.toLocaleString()}`;
    document.getElementById('summaryQty').textContent = `x${quantity}`;
    document.getElementById('summaryTotal').textContent = total === 0 ? 'Free' : `₦${total.toLocaleString()}`;

    // Update button text
    resetPayBtn(event, quantity);
}

function resetPayBtn(event, quantity) {
     const payBtn = document.getElementById('paystackBtn');
     if (!payBtn) return;
     const price = parseFloat(event.price) || 0;
     const total = price * quantity;
     payBtn.disabled = false;
     payBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                        Pay <span id="btnPayAmount">${total === 0 ? 'Free (Claim)' : `₦${total.toLocaleString()}`}</span>`;
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
            document.getElementById('loadingOverlay').style.display = 'none';
            Swal.fire({
                title: 'Payment Successful!',
                text: 'Your tickets have been secured.',
                icon: 'success',
                confirmButtonColor: '#ff5a5f'
            }).then(() => {
                const keys = typeof getRoleKeys === 'function' ? getRoleKeys() : { role: 'role' };
                const role = storage.get(keys.role) || storage.get('role');
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
            resetPayBtn(window.eventDataForReset, quantity);
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
