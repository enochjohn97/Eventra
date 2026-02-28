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
    // 3. Setup Paystack Payment Action WITH OTP
    const payBtn = document.getElementById('paystackBtn');
    const otpModal = document.getElementById('otpModal');
    const closeOtpModal = document.getElementById('closeOtpModal');
    const sendEmailOtp = document.getElementById('sendEmailOtp');
    const sendSmsOtp = document.getElementById('sendSmsOtp');
    const verifyOtpBtn = document.getElementById('verifyOtpBtn');
    const resendOtpBtn = document.getElementById('resendOtpBtn');
    const backToChannels = document.getElementById('backToChannels');
    const otpChannelSelection = document.getElementById('otpChannelSelection');
    const otpInputSection = document.getElementById('otpInputSection');
    const otpDigits = document.querySelectorAll('.otp-digit');

    let currentPaymentRef = null;
    let selectedChannel = null;

    payBtn.addEventListener('click', () => {
        // Validation
        const phone = document.getElementById('phoneNum').value;
        const fname = document.getElementById('firstName').value;
        const lname = document.getElementById('lastName').value;

        if (!phone || !fname || !lname) {
            showNotification('Please provide all contact information.', 'error');
            return;
        }

        const exactPrice = parseFloat(eventData.price) || 0;
        if (exactPrice === 0) {
            createTicket(eventId, currentQuantity, null);
            return;
        }

        // Show OTP Modal
        document.getElementById('otpEmailOverlay').textContent = currentUser.email;
        document.getElementById('otpPhoneOverlay').textContent = phone;
        otpModal.style.display = 'flex';
        resetOtpInput();
    });

    closeOtpModal.addEventListener('click', () => {
        otpModal.style.display = 'none';
        resetPayBtn(eventData, currentQuantity);
    });

    sendEmailOtp.addEventListener('click', () => initiateOtp('email'));
    sendSmsOtp.addEventListener('click', () => initiateOtp('sms'));

    async function initiateOtp(channel) {
        selectedChannel = channel;
        payBtn.disabled = true;
        
        try {
            const res = await apiFetch('../../api/otps/generate-otp.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ channel: channel })
            });
            const result = await res.json();
            
            if (result.success) {
                currentPaymentRef = result.payment_reference;
                otpChannelSelection.style.display = 'none';
                otpInputSection.style.display = 'block';
                otpDigits[0].focus();
                showNotification('Verification code sent!', 'success');
            } else {
                showNotification(result.message, 'error');
            }
        } catch (error) {
            console.error('OTP Init Error:', error);
            showNotification('Failed to send verification code', 'error');
        }
    }

    verifyOtpBtn.addEventListener('click', async () => {
        const otp = Array.from(otpDigits).map(i => i.value).join('');
        if (otp.length < 6) {
            showNotification('Please enter the full 6-digit code', 'error');
            return;
        }

        verifyOtpBtn.disabled = true;
        verifyOtpBtn.textContent = 'Verifying...';

        try {
            const res = await apiFetch('../../api/otps/verify-otp.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ otp: otp, payment_reference: currentPaymentRef })
            });
            const result = await res.json();

            if (result.success) {
                otpModal.style.display = 'none';
                startPaystackFlow();
            } else {
                showNotification(result.message, 'error');
                verifyOtpBtn.disabled = false;
                verifyOtpBtn.textContent = 'Verify Code';
            }
        } catch (error) {
            console.error('OTP Verify Error:', error);
            showNotification('Verification failed', 'error');
            verifyOtpBtn.disabled = false;
            verifyOtpBtn.textContent = 'Verify Code';
        }
    });

    resendOtpBtn.addEventListener('click', () => initiateOtp(selectedChannel));
    backToChannels.addEventListener('click', () => {
        otpInputSection.style.display = 'none';
        otpChannelSelection.style.display = 'block';
    });

    // Handle OTP digit inputs
    otpDigits.forEach((digit, idx) => {
        digit.addEventListener('input', (e) => {
            if (e.target.value && idx < 5) {
                otpDigits[idx + 1].focus();
            }
        });
        digit.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace' && !e.target.value && idx > 0) {
                otpDigits[idx - 1].focus();
            }
        });
    });

    function resetOtpInput() {
        otpDigits.forEach(d => d.value = '');
        otpChannelSelection.style.display = 'block';
        otpInputSection.style.display = 'none';
        verifyOtpBtn.disabled = false;
        verifyOtpBtn.textContent = 'Verify Code';
    }

    function startPaystackFlow() {
        if (!paystackPublicKey) {
            showNotification('Payment gateway not initialized.', 'error');
            return;
        }

        const totalAmountNaira = (parseFloat(eventData.price) || 0) * currentQuantity;
        const paystackAmountKobo = Math.round(totalAmountNaira * 100);

        const handler = PaystackPop.setup({
            key: paystackPublicKey,
            email: currentUser.email,
            amount: paystackAmountKobo,
            currency: 'NGN',
            metadata: {
                custom_fields: [
                    { display_name: "Event Internal ID", variable_name: "event_id", value: eventId },
                    { display_name: "Quantity", variable_name: "quantity", value: currentQuantity }
                ]
            },
            callback: function(response) {
                // Success!
                document.getElementById('loadingOverlay').style.display = 'flex';
                document.querySelector('#loadingOverlay h3').textContent = 'Confirming Payment...';
                createTicket(eventId, currentQuantity, currentPaymentRef); // Use currentPaymentRef as our reference
            },
            onClose: function() {
                showNotification('Payment window closed.', 'info');
                resetPayBtn(eventData, currentQuantity);
            }
        });

        handler.openIframe();
    }

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
