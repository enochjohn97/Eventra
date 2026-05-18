/**
 * Client Modals JavaScript
 * Handles all modal functionality for client dashboard
 */

// Profile Edit Modal
function showProfileEditModal() {
    const user = storage.get('client_user') || storage.get('user');
    if (!user) return;

    const modalHTML = `
        <div id="profileEditModal" class="modal-backdrop active" role="dialog" aria-modal="true">
            <div class="modal-content modal-content-animate" style="max-width: 800px;">
                <div class="modal-header">
                    <h2>Edit Profile</h2>
                    <button class="modal-close" onclick="closeProfileEditModal()">×</button>
                </div>
                <div class="modal-body">
                    <form id="profileEditForm" enctype="multipart/form-data">
                        <!-- Profile Picture -->
                        <div class="profile-edit-avatar-container">
                                <div class="avatar-wrapper">
                                    <img id="profilePreview" class="profile-preview-img"
                                         src="${user.profile_pic || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=random&size=160`}">
                                    ${getVerificationBadge(user.verification_status)}
                                    
                                    <label for="profilePicInput" class="avatar-upload-label">
                                        📷
                                    </label>
                                </div>
                                <input type="file" id="profilePicInput" name="profile_pic" accept="image/*" style="display: none;" onchange="previewProfilePic(event)">
                        </div>

                        <!-- Personal Information Section -->
                        <h3 class="modal-form-section-title">Personal Information</h3>
                        
                        <div class="modal-grid">
                            <div class="form-group modal-grid-full">
                                <label style="font-weight: 600; margin-bottom: 0.5rem; display: block;">Client ID</label>
                                <input type="text" value="${escapeHTML(user.custom_id) || 'Generating...'}" readonly style="width: 100%; padding: 0.75rem; border: 1px solid #e0e0e0; border-radius: 8px; background: #f8fafc; color: #2ecc71; font-weight: 700; font-family: monospace; letter-spacing: 1px;">
                            </div>

                            <div class="form-group">
                                <label style="font-weight: 600; margin-bottom: 0.5rem; display: block;">Contact Name <span class="text-danger">*</span></label>
                                <input type="text" name="name" value="${escapeHTML(user.name)}" required class="form-control">
                            </div>
                            <div class="form-group">
                                <label style="font-weight: 600; margin-bottom: 0.5rem; display: block;">Business/Organization Name <span class="text-danger">*</span></label>
                                <input type="text" name="business_name" value="${escapeHTML(user.business_name) || ''}" placeholder="Eventra Inc." class="form-control" required>
                            </div>
                            <div class="form-group">
                                <label style="font-weight: 600; margin-bottom: 0.5rem; display: block;">Email <span style="color:#64748b; font-size:0.8rem;">(read-only)</span></label>
                                <input type="email" value="${escapeHTML(user.email)}" disabled class="form-control disabled">
                            </div>
                            <div class="form-group">
                                <label style="font-weight: 600; margin-bottom: 0.5rem; display: block;">Phone <span class="text-danger">*</span></label>
                                <input type="tel" name="phone" value="${escapeHTML(user.phone) || ''}" placeholder="+234..." class="form-control" required>
                            </div>
                            
                            <div class="form-group modal-grid-full">
                                <label style="font-weight: 600; margin-bottom: 0.5rem; display: flex; align-items: center; justify-content: space-between; width: 100%;">
                                    <span>NIN (National Identity Number) <span class="text-danger">*</span></span>
                                    <div id="ninStatus" class="verification-status-indicator"></div>
                                </label>
                                <input type="text" id="ninInput" name="nin" value="${escapeHTML(user.nin) || ''}" placeholder="11-digit NIN" class="form-control" onblur="validateAndVerifyField('nin')" required>
                            </div>

                            <div class="form-group">
                                <label style="font-weight: 600; margin-bottom: 0.5rem; display: block;">Date of Birth <span class="text-danger">*</span></label>
                                <input type="date" name="dob" value="${escapeHTML(user.dob) || ''}" class="form-control" required>
                            </div>
                            <div class="form-group">
                                <label style="font-weight: 600; margin-bottom: 0.5rem; display: block;">Gender <span class="text-danger">*</span></label>
                                <select name="gender" class="form-control" required>
                                    <option value="">Select Gender</option>
                                    <option value="male" ${user.gender === 'male' ? 'selected' : ''}>Male</option>
                                    <option value="female" ${user.gender === 'female' ? 'selected' : ''}>Female</option>
                                    <option value="other" ${user.gender === 'other' ? 'selected' : ''}>Other</option>
                                </select>
                            </div>
                            
                            <div class="form-group modal-grid-full">
                                <label style="font-weight: 600; margin-bottom: 0.5rem; display: block;">Address <span class="text-danger">*</span></label>
                                <textarea name="address" rows="2" placeholder="Full address" class="form-control" required>${escapeHTML(user.address) || ''}</textarea>
                            </div>
                            
                            <div class="form-group">
                                <label style="font-weight: 600; margin-bottom: 0.5rem; display: block;">Job Title <span class="text-danger">*</span></label>
                                <input type="text" name="job_title" value="${escapeHTML(user.job_title) || ''}" placeholder="Event Organizer" class="form-control" required>
                            </div>
                            <div class="form-group">
                                <label style="font-weight: 600; margin-bottom: 0.5rem; display: block;">Company <span class="text-danger">*</span></label>
                                <input type="text" name="company" value="${escapeHTML(user.company) || ''}" placeholder="Company Name" class="form-control" required>
                            </div>
                            <div class="form-group">
                                <label style="font-weight: 600; margin-bottom: 0.5rem; display: block;">City <span class="text-danger">*</span></label>
                                <input type="text" name="city" value="${escapeHTML(user.city) || ''}" placeholder="Lagos" class="form-control" required>
                            </div>
                            <div class="form-group">
                                <label style="font-weight: 600; margin-bottom: 0.5rem; display: block;">State <span class="text-danger">*</span></label>
                                <select name="state" class="form-control" required>
                                    <option value="">Select State</option>
                                    ${getNigerianStates().map(state => 
                                        `<option value="${state}" ${user.state === state ? 'selected' : ''}>${state}</option>`
                                    ).join('')}
                                </select>
                            </div>
                            <div class="form-group modal-grid-full">
                                <label style="font-weight: 600; margin-bottom: 0.5rem; display: block;">Country <span class="text-danger">*</span></label>
                                <input type="text" name="country" value="${escapeHTML(user.country) || ''}" placeholder="Nigeria" class="form-control" required>
                            </div>
                        </div>

                        <!-- Payment Information Section -->
                        <h3 class="modal-form-section-title">Payment Information</h3>
                        
                        <div class="modal-grid">
                            <div class="form-group modal-grid-full">
                                <label style="font-weight: 600; margin-bottom: 0.5rem; display: block;">Settlement Bank <span class="text-danger">*</span></label>
                                <select id="bankSelect" name="bank_code" class="form-control" onchange="resolveAccount()" required>
                                    <option value="">Select Bank</option>
                                </select>
                                <input type="hidden" name="bank_name" id="bankNameInput" value="${escapeHTML(user.bank_name) || ''}">
                            </div>
                            <div class="form-group modal-grid-full">
                                <label style="font-weight: 600; margin-bottom: 0.5rem; display: flex; align-items: center; justify-content: space-between; width: 100%;">
                                    <span>Account Number (10 Digits) <span class="text-danger">*</span></span>
                                    <div id="accountStatus" class="verification-status-indicator">
                                        ${user.subaccount_code 
                                            ? '<span style="color:#722f37; font-weight: bold;" title="Verified Subaccount">✓ Verified</span>' 
                                            : ''}
                                    </div>
                                </label>
                                <input type="text" id="accountNumberInput" name="account_number" value="${(user.account_number && !/^[0]*$/.test(user.account_number)) ? escapeHTML(user.account_number) : ''}" maxlength="10" placeholder="10-digit Account Number" class="form-control" oninput="this.value = this.value.replace(/[^0-9]/g, '');" onblur="resolveAccount()" required>
                            </div>
                            <div class="form-group modal-grid-full">
                                <label style="font-weight: 600; margin-bottom: 0.5rem; display: flex; align-items: center; justify-content: space-between; width: 100%;">
                                    <span>BVN (11 Digits) <span class="text-danger">*</span></span>
                                    <div id="bvnStatus" class="verification-status-indicator"></div>
                                </label>
                                <input type="text" id="bvnInput" name="bvn" value="${escapeHTML(user.bvn) || ''}" maxlength="11" placeholder="11-digit BVN" class="form-control" oninput="this.value = this.value.replace(/[^0-9]/g, '');" onblur="validateAndVerifyField('bvn')" required>
                                <small style="display: block; margin-top: 5px; color: #64748b; font-size: 0.8rem; font-style: italic;">Note: Your BVN is for identity verification only.</small>
                            </div>
                            <div class="form-group modal-grid-full">
                                <label style="font-weight: 600; margin-bottom: 0.5rem; display: block;">Account Holder Name (Auto-resolved) <span class="text-danger">*</span></label>
                                <input type="text" id="accountNameInput" name="account_name" value="${escapeHTML(user.account_name) || ''}" class="form-control" style="font-weight: 500;" required>
                            </div>
                        </div>

                        <!-- Submit Button -->
                        <div style="display: flex; gap: 1rem; margin-top: 2rem;">
                            <button type="submit" class="btn btn-primary" style="flex: 1;">Save Changes</button>
                            <button type="button" class="btn btn-secondary" onclick="closeProfileEditModal()" style="flex: 1;">Cancel</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    `;

    // Remove existing modal if any
    const existing = document.getElementById('profileEditModal');
    if (existing) existing.remove();

    // Add modal to body
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    // Populate Banks
    const bankSelect = document.getElementById('bankSelect');
    if (bankSelect && window.PaystackBanks) {
        window.PaystackBanks.populate(bankSelect, user.bank_code);
    }

    // Add form submit handler
    const profileEditForm = document.getElementById('profileEditForm');
    profileEditForm.addEventListener('submit', handleProfileUpdate);

    // Add persistence: save on input
    profileEditForm.addEventListener('input', () => saveFormState('profileEditForm'));
    profileEditForm.addEventListener('change', () => saveFormState('profileEditForm'));

    // Restore saved state
    restoreFormState('profileEditForm');

    // Initialize verification statuses
    if (user.nin_verified == 1) updateFieldStatus('nin', 'success');
    if (user.bvn_verified == 1) updateFieldStatus('bvn', 'success');
}

function closeProfileEditModal() {
    const modal = document.getElementById('profileEditModal');
    if (modal) modal.remove();
}

function previewProfilePic(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            document.getElementById('profilePreview').src = e.target.result;
        };
        reader.readAsDataURL(file);
    }
}

async function handleProfileUpdate(e) {
    e.preventDefault();
    const form = e.target;
    const formData = new FormData(form);

    // ── Pre-flight validation ───────────────────────────────────────────────
    const requiredFields = [
        { name: 'name',           label: 'Contact Name' },
        { name: 'business_name',  label: 'Business/Organization Name' },
        { name: 'phone',          label: 'Phone' },
        { name: 'address',        label: 'Address' },
        { name: 'city',           label: 'City' },
        { name: 'state',          label: 'State' },
        { name: 'country',        label: 'Country' },
        { name: 'job_title',      label: 'Job Title' },
        { name: 'company',        label: 'Company' },
        { name: 'dob',            label: 'Date of Birth' },
        { name: 'gender',         label: 'Gender' },
        { name: 'nin',            label: 'NIN' },
        { name: 'bvn',            label: 'BVN' },
        { name: 'bank_code',      label: 'Settlement Bank' },
        { name: 'account_number', label: 'Account Number' },
        { name: 'account_name',   label: 'Account Holder Name' },
    ];

    let firstInvalidField = null;
    for (const field of requiredFields) {
        const el = form.querySelector(`[name="${field.name}"]`);
        if (!el || !el.value.trim()) {
            if (!firstInvalidField) firstInvalidField = el;
            if (el) {
                el.style.borderColor = '#ef4444';
                el.addEventListener('input', () => { el.style.borderColor = ''; }, { once: true });
            }
        }
    }

    if (firstInvalidField) {
        firstInvalidField.focus();
        Swal.fire({
            icon: 'error',
            title: 'Missing Required Fields',
            text: 'Please fill in all fields marked with a red asterisk (*)',
            confirmButtonColor: '#722f37'
        });
        return;
    }

    // ── Digit-specific validations ─────────────────────────────────────────
    const nin = formData.get('nin');
    if (nin && !/^\d{11}$/.test(nin.replace(/\D/g, ''))) {
        Swal.fire('Error', 'NIN must be exactly 11 digits', 'error');
        return;
    }

    const bvn = formData.get('bvn');
    if (bvn && !/^\d{11}$/.test(bvn.replace(/\D/g, ''))) {
        Swal.fire('Error', 'BVN must be exactly 11 digits', 'error');
        return;
    }

    const accountNumber = formData.get('account_number');
    if (accountNumber && !/^\d{10}$/.test(accountNumber.replace(/\D/g, ''))) {
        Swal.fire('Error', 'Account number must be exactly 10 digits', 'error');
        return;
    }

    const submitBtn = form.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner"></span> Saving...';

    try {
        const response = await apiFetch('/api/clients/update-profile.php', {
            method: 'POST',
            body: formData
        });

        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            showNotification('Server returned an invalid response. Please try again.', 'error');
            return;
        }

        const profileResult = await response.json();

        if (profileResult.success) {
            showNotification('Profile updated successfully!', 'success');

            // Clear saved form state
            if (typeof clearFormState === 'function') clearFormState('profileEditForm');

            // Update stored user data
            storage.set('client_user', profileResult.user);
            if (window.storage) window.storage.set('user', profileResult.user);
            
            // Dispatch event for unified UI sync (used in utils.js)
            document.dispatchEvent(new CustomEvent('EventraProfileUpdated', { 
                detail: profileResult.user 
            }));

            // Close modal
            closeProfileEditModal();

            // Refresh UI components
            if (window.updateClientNameDisplay) {
                window.updateClientNameDisplay(profileResult.user);
            }

            // Optional: Reload or update stats if dashboard function exists
            if (window.loadDashboardStats) {
                window.loadDashboardStats();
            }

            // Sync with sidebar if applicable
            const sidebarName = document.getElementById('sidebarUserName');
            if (sidebarName) sidebarName.textContent = profileResult.user.name;

            // Success feedback and eventual reload
            showNotification('Profile updated successfully!', 'success');
            setTimeout(() => window.location.reload(), 1500);
        } else {
            showNotification(profileResult.message || 'Failed to update profile', 'error');
        }
    } catch (error) {
        showNotification(error.message || 'An unexpected error occurred during profile update', 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
    }
}

// Real-time Account Resolution — Pure client-side (no external API calls)
function resolveAccount() {
    const bankSelect   = document.getElementById('bankSelect');
    const bankCode     = bankSelect ? bankSelect.value : '';
    const accountInput = document.getElementById('accountNumberInput');
    const accountNumber = accountInput ? accountInput.value.replace(/\D/g, '') : '';
    const statusDiv    = document.getElementById('accountStatus');
    const nameInput    = document.getElementById('accountNameInput');
    const bankNameInput = document.getElementById('bankNameInput');

    // Keep bank_name hidden input in sync
    if (bankCode && bankSelect) {
        const selectedOption = bankSelect.options[bankSelect.selectedIndex];
        if (bankNameInput) bankNameInput.value = selectedOption.text;
    }

    // Neither bank nor account entered yet — clear status quietly
    if (!bankCode && !accountNumber) {
        if (statusDiv) statusDiv.innerHTML = '';
        if (nameInput) nameInput.value = '';
        return;
    }

    // Validate: must be exactly 10 digits
    if (accountNumber.length !== 10) {
        if (statusDiv) statusDiv.innerHTML = '<span style="color:#ef4444; font-weight: bold;">Account number must be 10 digits</span>';
        if (nameInput) nameInput.value = '';
        return;
    }

    // ✓ Valid — populate with test name instantly (no API call)
    if (statusDiv) statusDiv.innerHTML = '<span style="color:#722f37; font-weight: bold;">✓ Verified</span>';
    if (nameInput) nameInput.value = 'Test Account';
}

// Dynamic Field Verification Logic
async function validateAndVerifyField(type) {
    const input = document.getElementById(`${type}Input`);
    const statusDiv = document.getElementById(`${type}Status`);
    if (!input || !statusDiv) return;

    const value = input.value.trim();
    if (!value) {
        statusDiv.innerHTML = ''; // Hide if empty
        return;
    }

    // Show Spinner
    updateFieldStatus(type, 'loading');

    try {
        const response = await apiFetch('/api/clients/verify-identity.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: type, number: value })
        });

        const result = await response.json();

        if (result.success) {
            updateFieldStatus(type, 'success');
            showNotification(`${type.toUpperCase()} verified successfully!`, 'success');
            
            // Update local user object for preview
            const user = storage.get('client_user') || storage.get('user');
            if (user) {
                user[`${type}_verified`] = 1;
                user[type] = value;
                storage.set('client_user', user);
                updateVerificationBadge();
            }
            
            // Sync hidden form input
            const hiddenStatus = document.getElementById(`${type}VerifiedInput`);
            if (hiddenStatus) hiddenStatus.value = 1;
        } else {
            const errorMsg = result.message || `Invalid ${type.toUpperCase()}`;
            updateFieldStatus(type, 'error', escapeHTML(errorMsg));
            // User requested notifications only on success
            
            const user = storage.get('client_user') || storage.get('user');
            if (user) {
                user[`${type}_verified`] = 0;
                storage.set('client_user', user);
                updateVerificationBadge();
            }

            // Sync hidden form input
            const hiddenStatus = document.getElementById(`${type}VerifiedInput`);
            if (hiddenStatus) hiddenStatus.value = 0;
        }
    } catch (error) {
        updateFieldStatus(type, 'error', 'Connection error');
    }
}

function updateFieldStatus(type, status, message = '') {
    const statusDiv = document.getElementById(`${type}Status`);
    if (!statusDiv) return;

    if (status === 'loading') {
        statusDiv.innerHTML = '<span class="spinner" style="width: 16px; height: 16px; border: 2px solid #3b82f6; border-top-color: transparent; border-radius: 50%; display: inline-block; animation: spin 0.8s linear infinite;"></span>';
    } else if (status === 'success') {
        statusDiv.innerHTML = '<span style="color:#722f37; font-size: 1.1rem; font-weight: bold;" title="Verified">✓</span>';
    } else if (status === 'error') {
        statusDiv.innerHTML = `<span style="color:#ef4444; font-size: 1.1rem; font-weight: bold; cursor: help;" title="${escapeHTML(message)}">✕</span>`;
    }
}

function updateVerificationBadge() {
    const user = storage.get('client_user') || storage.get('user');
    const container = document.querySelector('.avatar-wrapper');
    if (!container || !user) return;

    // Replace existing badge
    const oldBadge = container.querySelector('.verification-badge');
    if (oldBadge) oldBadge.remove();
    
    container.insertAdjacentHTML('beforeend', getVerificationBadge(user.verification_status));
    
    // Re-initialize icons if using Lucide
    if (window.lucide) window.lucide.createIcons();
}

// Add CSS for spin animation
if (!document.getElementById('modal-animations')) {
    const style = document.createElement('style');
    style.id = 'modal-animations';
    style.textContent = `
        @keyframes spin { to { transform: rotate(360deg); } }
    `;
    document.head.appendChild(style);
}

// Event Preview Modal
function showEventPreviewModal(eventId) {
    // Show loading
    const loadingHTML = `
        <div id="eventPreviewModal" class="modal-backdrop active" role="dialog" aria-modal="true" aria-hidden="false">
            <div class="modal-content" style="max-width: 800px;">
                <div class="modal-header">
                    <h2>Event Details</h2>
                    <button class="modal-close" onclick="closeEventPreviewModal()">×</button>
                </div>
                <div class="modal-body" style="text-align: center; padding: 3rem;">
                    <div class="spinner"></div>
                    <p>Loading event details...</p>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', loadingHTML);

    // Fetch event details
    fetchEventDetails(eventId);
}

async function fetchEventDetails(eventId) {
    try {
        const response = await apiFetch(`/api/events/get-event-details.php?event_id=${eventId}`);
        const result = await response.json();

        if (result.success && result.event) {
            displayEventPreview(result.event);
        } else {
            showNotification(result.message || 'Event not found', 'error');
            closeEventPreviewModal();
        }
    } catch (error) {
        showNotification('Failed to load event details', 'error');
        closeEventPreviewModal();
    }
}

function displayEventPreview(event) {
    const eventImage = event.image_path || 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=1200&fit=crop';
    const normalizedImage = eventImage.startsWith('http') ? eventImage : getImageUrl(eventImage);
    const status = event.status || 'draft';
    // Format prices dynamically
    let price = 'Free';
    const basePrice = parseFloat(event.price) || 0;
    const regPrice = parseFloat(event.regular_price) || 0;
    const vPrice = parseFloat(event.vip_price) || 0;
    const premPrice = parseFloat(event.premium_price) || 0;
    
    const isFree = basePrice === 0 && regPrice === 0 && vPrice === 0 && premPrice === 0;
    
    if (!isFree) {
        const mode = event.ticket_type_mode || 'all';
        if (mode === 'all' || mode.includes('all')) {
            price = `₦${basePrice.toLocaleString()}`;
        } else {
            const modes = mode.split(',').map(m => m.trim().toLowerCase());
            const prices = [];
            if (modes.includes('regular') && regPrice > 0) prices.push(`Regular: ₦${regPrice.toLocaleString()}`);
            if (modes.includes('vip') && vPrice > 0) prices.push(`VIP: ₦${vPrice.toLocaleString()}`);
            if (modes.includes('premium') && premPrice > 0) prices.push(`Premium: ₦${premPrice.toLocaleString()}`);
            
            if (prices.length > 0) {
                price = `<div style="display: flex; flex-direction: column; gap: 4px;">${prices.map(p => `<span>${p}</span>`).join('')}</div>`;
            } else if (basePrice > 0) {
                price = `₦${basePrice.toLocaleString()}`;
            } else {
                price = 'Paid';
            }
        }
    }
    const date = new Date(event.event_date + 'T00:00:00').toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
    const time = event.event_time ? event.event_time.substring(0, 5) : '--:--';
    
    // Get client name for sharing
    const user = storage.get('client_user') || storage.get('user') || {};
    const organizerName = user.name || 'organizer';
    const computedClientSlug = encodeURIComponent(organizerName.trim().toLowerCase().replace(/\s+/g, '-'));
    const computedEventSlug = encodeURIComponent((event.event_name || 'event').trim().toLowerCase().replace(/\s+/g, '-'));
    const shareDomain = 'https://eventra-website.liveblog365.com/public/pages/index.html';
    const shareLink = `${shareDomain}?event=${event.tag || event.id}&organizer=${computedClientSlug}&name=${computedEventSlug}`;

    const modalContent = `
        <div id="eventPreviewModal" class="modal-backdrop active" role="dialog" aria-modal="true">
            <div class="modal-content modal-content-animate" style="max-width: 800px; padding: 0; overflow: hidden;">
                <div class="event-preview">
                    <!-- Close Button -->
                    <button onclick="closeEventPreviewModal()" style="position: absolute; top: 1.5rem; right: 1.5rem; background: rgba(255,255,255,0.2); border: none; width: 40px; height: 40px; border-radius: 50%; color: white; font-size: 1.5rem; cursor: pointer; z-index: 10; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(4px);">&times;</button>
                    
                    <div class="event-preview-hero">
                        <img src="${normalizedImage}" alt="Event">
                        <div class="event-status-badge" style="background: ${getStatusBadgeColor(status.toLowerCase())};">
                            ${status}
                        </div>
                    </div>
                    
                    <div class="event-preview-content" style="background: white;">
                        <div style="margin-bottom: 2.5rem;">
                            <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem;">
                                <h1 class="event-preview-title" style="margin: 0; flex: 1;">${escapeHTML((event.event_name || '').replace(/\s*#\d+$/, ''))}</h1>
                                <div style="background: #4f46e5; color: white; padding: 0.5rem 1rem; border-radius: 20px; font-size: 0.85rem; font-weight: 700; white-space: nowrap;">
                                    ID: ${escapeHTML(event.custom_id || event.id || 'N/A')}
                                </div>
                            </div>
                            <p style="color: #6b7280; font-size: 1.1rem;">Organized by ${escapeHTML(user.name) || 'Eventra'}</p>
                        </div>

                        <div class="event-info-grid">
                            <div class="event-info-item">
                                <div class="event-info-icon" style="background: #eef2ff;">📅</div>
                                <div>
                                    <div class="event-info-label">Date</div>
                                    <div class="event-info-value">${date}</div>
                                </div>
                            </div>
                            <div class="event-info-item">
                                <div class="event-info-icon" style="background: #fff7ed;">🕒</div>
                                <div>
                                    <div class="event-info-label">Time</div>
                                    <div class="event-info-value">${time}</div>
                                </div>
                            </div>
                            <div class="event-info-item">
                                <div class="event-info-icon" style="background: #f0fdf4;">💰</div>
                                <div>
                                    <div class="event-info-label">Price</div>
                                    <div class="event-info-value">${price}</div>
                                </div>
                            </div>
                            <div class="event-info-item">
                                <div class="event-info-icon" style="background: #fdf2f8;">📂</div>
                                <div>
                                    <div class="event-info-label">Category</div>
                                    <div class="event-info-value">${escapeHTML(event.category || event.event_type) || 'General'}</div>
                                </div>
                            </div>
                        </div>

                        <div style="margin-bottom: 2.5rem;">
                            <label style="display: block; font-size: 0.9rem; color: #111827; margin-bottom: 1rem; text-transform: uppercase; font-weight: 800; letter-spacing: 0.05em;">📍 Venue & Location</label>
                            <div style="background: #f9fafb; padding: 1.25rem; border-radius: 16px; border: 1px solid #e5e7eb; color: #4b5563; font-weight: 500; line-height: 1.6;">
                                ${(() => {
                                    // Try structured locations JSON (multi-state events)
                                    let locs = null;
                                    try {
                                        locs = event.locations
                                            ? (typeof event.locations === 'string' ? JSON.parse(event.locations) : event.locations)
                                            : null;
                                    } catch(e) {}
                                    if (Array.isArray(locs) && locs.length > 1) {
                                        return locs.map(loc => `
                                            <div style="margin-bottom:0.6rem;padding-bottom:0.6rem;border-bottom:1px dashed #e5e7eb;">
                                                <div style="font-weight:700;color:#111827;font-size:0.9rem;margin-bottom:0.2rem;">${escapeHTML(loc.state)}</div>
                                                ${loc.address ? `<div style="color:#6b7280;font-size:0.82rem;">${escapeHTML(loc.address)}</div>` : ''}
                                            </div>
                                        `).join('');
                                    }
                                    // Fallback: single address/state
                                    return (escapeHTML(event.address) || 'No address provided')
                                        + (event.state ? `<br><span style="color:#111827;font-weight:700;">${escapeHTML(event.state)}</span>` : '');
                                })()}
                            </div>
                        </div>

                        <div style="margin-bottom: 2.5rem;">
                            <label style="display: block; font-size: 0.9rem; color: #111827; margin-bottom: 1rem; text-transform: uppercase; font-weight: 800; letter-spacing: 0.05em;">📝 Event Description</label>
                            <div style="color: #4b5563; line-height: 1.7; white-space: pre-wrap; background: #f9fafb; padding: 1.25rem; border-radius: 16px; border: 1px solid #e5e7eb; font-size: 1.05rem;">
                                ${escapeHTML(event.description) || 'No description available'}
                            </div>
                        </div>

                        <div style="margin-bottom: 2.5rem;">
                            <label style="display: block; font-size: 0.9rem; color: #111827; margin-bottom: 1rem; text-transform: uppercase; font-weight: 800; letter-spacing: 0.05em;">👥 Audience</label>
                            <div style="display: flex; align-items: center; gap: 15px; background: #f9fafb; padding: 1.25rem; border-radius: 16px; border: 1px solid #e5e7eb;">
                                <div style="display: flex;">
                                    ${[...Array(Math.min(parseInt(event.attendee_count) || 0, 5))].map((_, i) => `
                                        <img src="https://ui-avatars.com/api/?name=User+${i}&background=random" 
                                             style="width: 40px; height: 40px; border-radius: 50%; border: 3px solid white; margin-left: ${i === 0 ? '0' : '-12px'}; transition: transform 0.2s;">
                                    `).join('')}
                                    ${(parseInt(event.attendee_count) || 0) > 5 ? `<div style="width: 40px; height: 40px; border-radius: 50%; border: 3px solid white; margin-left: -12px; background: #4f46e5; color: white; display: flex; align-items: center; justify-content: center; font-size: 0.75rem; font-weight: 700;">+${parseInt(event.attendee_count) - 5}</div>` : ''}
                                </div>
                                <span style="font-size: 1.1rem; color: #111827; font-weight: 700;">${parseInt(event.attendee_count) || 0} people attending</span>
                            </div>
                        </div>
                        
                        <div style="margin-top: 3rem; padding-top: 2.5rem; border-top: 2px solid #f3f4f6;">
                            <div style="margin-bottom: 1.5rem;">
                                <label style="display: block; font-size: 0.9rem; color: #111827; margin-bottom: 1rem; text-transform: uppercase; font-weight: 800; letter-spacing: 0.05em;">🔗 Events Tag</label>
                                <div style="display: flex; gap: 0.75rem; align-items: center;">
                                    <code style="background: #f3f4f6; padding: 0.85rem 1.25rem; border-radius: 12px; border: 1px solid #e5e7eb; font-family: 'JetBrains Mono', monospace; font-size: 1rem; flex: 1; color: #111827; font-weight: 700;">${escapeHTML(event.tag)}</code>
                                    <button onclick="navigator.clipboard.writeText('${escapeHTML(event.tag)}').then(() => showNotification('Tag copied!', 'success'))" style="background: white; border: 1px solid #d1d5db; width: 48px; height: 48px; border-radius: 12px; cursor: pointer; transition: all 0.2s; font-size: 1.25rem; display: flex; align-items: center; justify-content: center;" title="Copy Tag">📋</button>
                                </div>
                            </div>
                            <div style="margin-bottom: 1.5rem;">
                                <label style="display: block; font-size: 0.9rem; color: #111827; margin-bottom: 1rem; text-transform: uppercase; font-weight: 800; letter-spacing: 0.05em;">🆔 Event ID</label>
                                <div style="display: flex; gap: 0.75rem; align-items: center;">
                                    <code style="background: #f3f4f6; padding: 0.85rem 1.25rem; border-radius: 12px; border: 1px solid #e5e7eb; font-family: 'JetBrains Mono', monospace; font-size: 1rem; flex: 1; color: #111827; font-weight: 700;">${escapeHTML(event.custom_id || event.id || 'N/A')}</code>
                                    <button onclick="navigator.clipboard.writeText('${escapeHTML(event.custom_id || event.id)}').then(() => showNotification('ID copied!', 'success'))" style="background: white; border: 1px solid #d1d5db; width: 48px; height: 48px; border-radius: 12px; cursor: pointer; transition: all 0.2s; font-size: 1.25rem; display: flex; align-items: center; justify-content: center;" title="Copy ID">📋</button>
                                </div>
                            </div>
                            <div style="margin-bottom: 2.5rem;">
                                <label style="display: block; font-size: 0.9rem; color: #111827; margin-bottom: 1rem; text-transform: uppercase; font-weight: 800; letter-spacing: 0.05em;">🚀 Shareable Link</label>
                                <div style="display: flex; gap: 0.75rem; align-items: center;">
                                    <input type="text" readonly value="${escapeHTML(shareLink)}" 
                                           style="background: #f3f4f6; padding: 0.85rem 1.25rem; border-radius: 12px; border: 1px solid #e5e7eb; font-family: inherit; font-size: 1rem; flex: 1; color: #111827; font-weight: 600;">
                                    <button onclick="navigator.clipboard.writeText('${escapeHTML(shareLink)}').then(() => showNotification('Link copied!', 'success'))" style="background: #4F46E5; color: white; border: none; padding: 0.85rem 1.75rem; border-radius: 12px; cursor: pointer; transition: all 0.2s; font-size: 1rem; font-weight: 700; box-shadow: 0 4px 12px rgba(79, 70, 229, 0.25);">Copy Link</button>
                                </div>
                            </div>

                            <div style="display: flex; gap: 1rem;">
                                <button onclick="editEvent(${event.id})" class="btn" style="flex: 1; background: white; border: 2px solid #e5e7eb; color: #374151; padding: 1.1rem; border-radius: 14px; font-weight: 700; cursor: pointer; transition: all 0.2s; font-size: 1rem;">
                                    ✏️ Edit Event
                                </button>
                                ${status.toLowerCase() === 'published' ? `
                                    <button onclick="window.open('${shareLink}', '_blank')" class="btn" style="flex: 2; background: #4f46e5; color: white; border: none; padding: 1.1rem; border-radius: 14px; font-weight: 700; cursor: pointer; transition: all 0.2s; font-size: 1rem; box-shadow: 0 4px 12px rgba(79, 70, 229, 0.2);">
                                        👁️ View Public Page
                                    </button>
                                ` : (event.event_visibility === 'private' ? `
                                    <button onclick="navigator.clipboard.writeText('${escapeHTML(shareLink)}').then(() => showNotification('Private link copied! Share with selected people.', 'success'))" class="btn" style="flex: 2; background: #7c3aed; color: white; border: none; padding: 1.1rem; border-radius: 14px; font-weight: 700; cursor: pointer; transition: all 0.2s; font-size: 1rem; box-shadow: 0 4px 12px rgba(124, 58, 237, 0.2); display: flex; align-items: center; justify-content: center; gap: 8px;">
                                        🔒 Copy Private Link
                                    </button>
                                ` : `
                                    <button onclick="publishEvent(${event.id})" class="btn" style="flex: 2; background: #722f37; color: white; border: none; padding: 1.1rem; border-radius: 14px; font-weight: 700; cursor: pointer; transition: all 0.2s; font-size: 1rem; box-shadow: 0 4px 12px rgba(16, 185, 129, 0.2);">
                                        ✓ Publish Now
                                    </button>
                                `)}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Remove existing modal
    const existing = document.getElementById('eventPreviewModal');
    if (existing) existing.remove();

    // Add new modal
    document.body.insertAdjacentHTML('beforeend', modalContent);

    // Animate in
    setTimeout(() => {
        const modal = document.getElementById('eventPreviewModal');
        if (modal) {
            modal.querySelector('.modal-content').style.transform = 'translateY(0)';
        }
    }, 10);
}

function closeEventPreviewModal() {
    const modal = document.getElementById('eventPreviewModal');
    if (modal) modal.remove();
}

function shareEvent(link) {
    if (navigator.share) {
        navigator.share({
            title: 'Check out this event!',
            url: link
        });
    } else {
        // Fallback: copy to clipboard
        navigator.clipboard.writeText(link).then(() => {
            showNotification('Event link copied to clipboard!', 'success');
        });
    }
}

// Helper Functions
function getNigerianStates(includeGlobal = false) {
    const states = [
        'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue', 'Borno',
        'Cross River', 'Delta', 'Ebonyi', 'Edo', 'Ekiti', 'Enugu', 'FCT', 'Gombe', 'Imo',
        'Jigawa', 'Kaduna', 'Kano', 'Katsina', 'Kebbi', 'Kogi', 'Kwara', 'Lagos', 'Nasarawa',
        'Niger', 'Ogun', 'Ondo', 'Osun', 'Oyo', 'Plateau', 'Sokoto', 'Taraba',
        'Yobe', 'Zamfara'
    ];
    if (includeGlobal) {
        states.unshift('All States');
    }
    return states;
}

function getStatusBadgeColor(status) {
    const colors = {
        'published': '#722f37',
        'scheduled': '#3b82f6',
        'draft': '#ef4444',
        'cancelled': '#6b7280'
    };
    return colors[status] || '#6b7280';
}

function getPriorityBadgeColor(priority) {
    const colors = {
        'hot': '#ef4444',
        'trending': '#f59e0b',
        'featured': '#2ecc71',
        'nearby': '#722f37',
        'upcoming': '#3b82f6'
    };
    return colors[priority] || '#6b7280';
}

function getPriorityIcon(priority) {
    const icons = {
        'hot': '🔥',
        'trending': '📈',
        'featured': '⭐',
        'nearby': '📍',
        'upcoming': '🕒'
    };
    return icons[priority] || '';
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
        weekday: 'long',
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
    });
}

// Event Action Modal (for publishing/canceling events)


async function publishEvent(eventId) {
    if (document.activeElement) document.activeElement.blur();
    const confirmed = await Swal.fire({
        title: 'Publish Event?',
        text: 'Are you sure you want to publish this event? It will be visible to all users on the platform.',
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#722f37',
        cancelButtonColor: '#9ca3af',
        confirmButtonText: 'Yes, Publish',
        cancelButtonText: 'Wait'
    });

    if (!confirmed.isConfirmed) return;

    // ── Step 1: call the API ──
    let publishResult;
    try {
        const response = await apiFetch('/api/events/publish-event.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ event_id: eventId })
        });
        publishResult = await response.json();
    } catch (error) {
        showNotification('An error occurred while publishing event', 'error');
        return;
    }

    // ── Step 2: react to the result — UI changes ONLY on success ──
    if (publishResult.success) {
        showNotification('Event published successfully!', 'success');
        setTimeout(() => window.location.reload(), 1500);

        if (typeof closeEventActionModal === 'function') {
            closeEventActionModal();
        }

        // Trigger dashboard stat update if on dashboard
        if (typeof window.loadDashboardStats === 'function') {
            const user = storage.get('client_user') || storage.get('user');
            if (user) window.loadDashboardStats(user.id);
        }

        // Reload page to reflect changes
        setTimeout(() => window.location.reload(), 1000);
    } else {
        showNotification('Failed to publish event: ' + publishResult.message, 'error');
    }
}

// Edit Event Modal
function showEditEventModal(event) {
    // Parse metadata if it exists to get pricing fields
    let metadata = {};
    if (event.metadata) {
        try {
            metadata = typeof event.metadata === 'string' ? JSON.parse(event.metadata) : event.metadata;
        } catch (e) {
            console.error("Error parsing event metadata:", e);
        }
    }

    // Merge metadata into event object for easier template access
    const pricingFields = ['regular_price', 'vip_price', 'premium_price', 'regular_quantity', 'vip_quantity', 'premium_quantity', 'ticket_type_mode'];
    pricingFields.forEach(field => {
        if (metadata[field] !== undefined) {
            event[field] = metadata[field];
        }
    });

    const modalHTML = `
        <link rel="stylesheet" href="../../public/css/time-picker.css">
        <div id="editEventModal" class="modal-backdrop active" role="dialog" aria-modal="true" aria-hidden="false">
            <div class="modal-content modal-content-animate" style="max-width: 1200px; padding: 0; border-radius: 20px; overflow: hidden; border: none; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5); background: white;">
                <div class="modal-header" style="background: white; padding: 1.5rem 2.5rem; border-bottom: 1px solid #f1f5f9; display: flex; justify-content: space-between; align-items: center;">
                    <h2 style="color: #0f172a; margin: 0; font-size: 1.5rem; font-weight: 800; letter-spacing: -0.5px;">Edit Event</h2>
                    <button class="modal-close" onclick="closeEditEventModal()" style="background: #f8fafc; color: #64748b; border: none; width: 36px; height: 36px; border-radius: 50%; font-size: 1.25rem; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s;">×</button>
                </div>

                <style>
                    @media (max-width: 900px) {
                        #editEventModal .modal-content {
                            width: 95% !important;
                            margin: 10px !important;
                        }
                        #editEventModal form > div {
                            grid-template-columns: 1fr !important;
                        }
                        #editEventModal .modal-body {
                            max-height: 85vh !important;
                        }
                    }
                </style>
                
                <div class="modal-body" style="padding: 0; max-height: 82vh; overflow-y: auto; scrollbar-width: thin;">
                    <form id="editEventForm" enctype="multipart/form-data">
                        <input type="hidden" name="event_id" value="${event.id}">
                        
                        <div style="display: grid; grid-template-columns: 1fr 1.3fr; gap: 0;">
                            <!-- Left Column: Visuals -->
                            <div style="padding: 2.5rem; background: #fafafa; border-right: 1px solid #f1f5f9;">
                                <div style="margin-bottom: 2.5rem;">
                                    <label style="display: block; font-size: 0.75rem; font-weight: 800; color: #1e293b; margin-bottom: 1rem; text-transform: uppercase; letter-spacing: 1px;">Event Cover Image</label>
                                    <div style="position: relative; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.05);">
                                        <img id="editEventImagePreview" 
                                             src="${event.image_path ? getImageUrl(event.image_path) : 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=800&auto=format&fit=crop'}" 
                                             style="width: 100%; height: 320px; object-fit: cover; display: block; transition: transform 0.5s;">
                                        <label for="editEventImageInput" style="position: absolute; inset: 0; background: rgba(0,0,0,0.4); display: flex; flex-direction: column; align-items: center; justify-content: center; opacity: 0; transition: all 0.3s; cursor: pointer; color: white;" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0'">
                                            <span style="font-size: 2rem; margin-bottom: 0.5rem;">📷</span>
                                            <span style="font-weight: 700; font-size: 0.9rem; text-transform: uppercase;">Change Photo</span>
                                        </label>
                                        <input type="file" id="editEventImageInput" name="event_image" accept="image/*" style="display: none;" onchange="previewEditEventImage(event)">
                                    </div>
                                </div>

                                <div class="form-group" style="margin-bottom: 2rem;">
                                    <label style="display: block; font-size: 0.75rem; font-weight: 800; color: #1e293b; margin-bottom: 1rem; text-transform: uppercase; letter-spacing: 1px;">📍 Venue & State <span style="color: #ef4444">*</span></label>
                                    <div id="editStateSelectContainer" class="state-select-container" style="margin-bottom: 1rem;">
                                        <div class="state-select-display" id="editStateSelectDisplay" onclick="toggleEditStateSelect()" style="padding: 1rem 1.25rem; border: 1px solid #e2e8f0; border-radius: 12px; font-weight: 600; cursor: pointer; display: flex; justify-content: space-between; align-items: center; background: white; min-width: 0;">
                                            <span id="editSelectedStatesText" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; min-width: 0;">${event.state ? event.state.split(',').join(', ') : 'Select State(s)'}</span>
                                        </div>
                                        <div id="editStateSelectDropdown" class="state-select-dropdown" style="max-height: 250px; overflow-y: auto;">
                                            <div style="display: grid; gap: 4px;">
                                                ${getNigerianStates(true).map(state => `
                                                    <label class="state-option-label" style="display: flex; align-items: center; gap: 12px; padding: 10px 15px; cursor: pointer; transition: 0.2s;">
                                                        <input type="checkbox" class="edit-state-checkbox state-checkbox-custom" value="${state}" onchange="updateEditSelectedStates()" ${event.state && event.state.split(',').includes(state) ? 'checked' : ''}>
                                                        <span class="state-option-text" style="font-weight: 500;">${state}</span>
                                                    </label>
                                                `).join('')}
                                            </div>
                                        </div>
                                        <input type="hidden" name="state" id="editEventStateInput" value="${event.state || ''}" required>
                                    </div>

                                    <div class="form-group" id="editMainAddressGroup" style="display: ${event.state && event.state.split(',').length > 1 ? 'none' : 'block'};">
                                        <label style="display: block; font-size: 0.75rem; font-weight: 800; color: #64748b; text-transform: uppercase; margin-bottom: 0.5rem; letter-spacing: 0.025em;">Venue Address</label>
                                        <textarea name="address" id="editEventAddress" rows="3" placeholder="Full venue address..." style="width: 100%; padding: 0.75rem; border: 1px solid #e2e8f0; border-radius: 10px; font-size: 0.9rem; transition: all 0.2s;" onfocus="this.style.borderColor='#0f172a'; this.style.boxShadow='0 0 0 3px rgba(15, 23, 42, 0.1)';" onblur="this.style.borderColor='#e2e8f0'; this.style.boxShadow='none';">${escapeHTML(event.address || '')}</textarea>
                                    </div>
                                    <div id="perStateEditAddressContainer" style="margin-bottom: 1rem; display: ${event.state && event.state.split(',').length > 1 ? 'block' : 'none'};"></div>
                                    <p id="editAddressHelpText" style="font-size: 0.7rem; color: #64748b; margin-top: 0.4rem; display: ${event.state && event.state.split(',').length > 1 ? 'block' : 'none'};">Multiple states selected. Please provide specific addresses for each state above.</p>
                                </div>

                                <div style="background: #f8fafc; padding: 1.5rem; border-radius: 16px; border: 1px solid #e2e8f0;">
                                    <h4 style="margin: 0 0 1rem 0; font-size: 0.7rem; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 1px;">📞 Contact Information</h4>
                                    <div style="display: grid; gap: 1rem;">
                                        <input type="tel" name="phone_contact_1" value="${event.phone_contact_1}" placeholder="Primary Phone Number" required style="width: 100%; padding: 0.875rem 1.25rem; border: 1px solid #e2e8f0; border-radius: 10px; font-size: 0.95rem; font-weight: 600;">
                                        <input type="tel" name="phone_contact_2" value="${event.phone_contact_2 || ''}" placeholder="Secondary (Optional)" style="width: 100%; padding: 0.875rem 1.25rem; border: 1px solid #e2e8f0; border-radius: 10px; font-size: 0.95rem; font-weight: 600;">
                                    </div>
                                </div>
                            </div>

                            <!-- Right Column: Details -->
                            <div style="padding: 2.5rem;">
                                <div style="display: grid; gap: 1.75rem;">
                                    <div class="form-group">
                                        <label style="display: block; font-size: 0.75rem; font-weight: 800; color: #1e293b; margin-bottom: 0.75rem; text-transform: uppercase; letter-spacing: 0.5px;">Event Name <span style="color: #ef4444">*</span></label>
                                        <input type="text" name="event_name" value="${escapeHTML(event.event_name)}" placeholder="Event Name" required style="width: 100%; padding: 1rem 1.25rem; border: 1px solid #e2e8f0; border-radius: 12px; font-size: 1rem; font-weight: 600; color: #0f172a;">
                                    </div>

                                    <div class="form-group">
                                        <label style="display: block; font-size: 0.75rem; font-weight: 800; color: #1e293b; margin-bottom: 0.75rem; text-transform: uppercase; letter-spacing: 0.5px;">Event Type/Category <span style="color: #ef4444">*</span></label>
                                        <select name="event_type" required style="width: 100%; padding: 1rem 1.25rem; border: 1px solid #e2e8f0; border-radius: 12px; font-size: 1rem; font-weight: 600; background: white; cursor: pointer;">
                                            <option value="">Select Category</option>
                                            ${(window.EVENT_CATEGORIES || ['Conference', 'Workshop', 'Entertainment', 'Sports', 'Exhibition', 'Concert', 'Social', 'Other']).map(cat => `
                                                <option value="${cat}" ${event.event_type === cat || event.category === cat ? 'selected' : ''}>${cat}</option>
                                            `).join('')}
                                        </select>
                                    </div>

                                    <!-- SYSTEM RANKING Section -->
                                    <div class="form-group" style="background: #f0f9ff; padding: 1.5rem; border-radius: 16px; border: 1px solid #e0f2fe;">
                                        <label style="display: block; font-size: 0.75rem; font-weight: 800; color: #0369a1; margin-bottom: 1rem; text-transform: uppercase; letter-spacing: 0.5px;">System Ranking</label>
                                        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 0.75rem;">
                                            <div style="background: #0ea5e9; color: white; padding: 0.5rem 1rem; border-radius: 8px; font-size: 0.75rem; font-weight: 800; display: flex; align-items: center; gap: 6px;">
                                                <span style="font-size: 1rem;">🕒</span> UPCOMING
                                            </div>
                                        </div>
                                        <p style="margin: 0; font-size: 0.8rem; color: #0369a1; font-weight: 500; line-height: 1.5;">* Ranking is automatically assigned based on merit score and fresh proximity.</p>
                                    </div>

                                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.25rem;">
                                        <div class="form-group">
                                            <label style="display: block; font-size: 0.75rem; font-weight: 800; color: #1e293b; margin-bottom: 0.75rem; text-transform: uppercase; letter-spacing: 0.5px;">Event Date <span style="color: #ef4444">*</span></label>
                                            <input type="date" name="event_date" value="${event.event_date}" required style="width: 100%; padding: 1rem 1.25rem; border: 1px solid #e2e8f0; border-radius: 12px; font-size: 1rem; font-weight: 600;">
                                        </div>
                                        <div class="form-group">
                                            <label style="display: block; font-size: 0.75rem; font-weight: 800; color: #1e293b; margin-bottom: 0.75rem; text-transform: uppercase; letter-spacing: 0.5px;">Event Time <span style="color: #ef4444">*</span></label>
                                            <div id="editEventTimePickerContainer" class="time-picker-container">
                                                <div class="time-picker-display" onclick="toggleTimePicker('editEventTimePickerDropdown')" style="padding: 1rem 1.25rem; border: 1px solid #e2e8f0; border-radius: 12px; font-weight: 600; cursor: pointer; display: flex; justify-content: space-between; align-items: center; background: white;">
                                                    <span id="editEventTimeDisplay">${event.event_time ? event.event_time.substring(0, 5) : 'Select Time'}</span>
                                                    <span style="font-size: 0.8rem; opacity: 0.5;">🕒</span>
                                                </div>
                                                <div id="editEventTimePickerDropdown" class="time-picker-dropdown">
                                                    <div class="time-picker-section">
                                                        <label class="time-picker-label">Hours</label>
                                                        <div class="time-picker-grid hours" id="editHourGrid">
                                                            ${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(h => `<button type="button" class="time-btn" onclick="selectHour('${h}', 'editEventTimePickerContainer')">${h}</button>`).join('')}
                                                        </div>
                                                    </div>
                                                    <div class="time-picker-section">
                                                        <label class="time-picker-label">Minutes</label>
                                                        <div class="time-picker-grid minutes" id="editMinuteGrid">
                                                            ${['00', '15', '30', '45'].map(m => `<button type="button" class="time-btn" onclick="selectMinute('${m}', 'editEventTimePickerContainer')">${m}</button>`).join('')}
                                                        </div>
                                                    </div>
                                                    <div class="time-picker-section">
                                                        <div class="time-picker-ampm">
                                                            <button type="button" class="time-btn am" onclick="selectAmPm('am', 'editEventTimePickerContainer')">AM</button>
                                                            <button type="button" class="time-btn pm" onclick="selectAmPm('pm', 'editEventTimePickerContainer')">PM</button>
                                                        </div>
                                                    </div>
                                                </div>
                                                <input type="hidden" name="event_time" id="editEventTimeInput" value="${event.event_time}" required>
                                            </div>
                                        </div>
                                    </div>

                                    <!-- Pricing Section -->
                                    <div style="background: #f8fafc; padding: 1.5rem; border-radius: 20px; border: 1px solid #e2e8f0;">
                                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
                                            <h3 style="margin: 0; font-size: 0.8rem; font-weight: 800; color: #1e293b; text-transform: uppercase; letter-spacing: 1px;">💰 Tickets</h3>
                                            <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; padding: 0.5rem 1rem; background: white; border-radius: 10px; font-weight: 700; font-size: 0.8rem; color: #64748b; border: 1px solid #e2e8f0;">
                                                <input type="checkbox" id="editFreeEventCheckbox" name="is_free" value="1" ${parseFloat(event.price) === 0 && (!event.ticket_type_mode || event.ticket_type_mode === 'all') ? 'checked' : ''} class="state-checkbox-custom"> FREE
                                            </label>
                                        </div>

                                        <div id="editTicketTypeConfigSection" style="${parseFloat(event.price) === 0 ? 'display: none;' : ''}">
                                            <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.5rem; margin-bottom: 1.5rem;">
                                                <label class="edit-ticket-type-label" style="display: flex; flex-direction: column; align-items: center; gap: 0.4rem; cursor: pointer; padding: 0.8rem 0.2rem; border: 1px solid #e2e8f0; border-radius: 10px; transition: all 0.2s;">Ticket Type</label>
                                                    <input type="checkbox" name="ticket_type_mode[]" value="regular" ${event.ticket_type_mode && event.ticket_type_mode.includes('regular') ? 'checked' : ''} class="edit-ticket-type-checkbox" style="accent-color: #0f172a;">
                                                    <span style="font-weight: 700; font-size: 0.7rem; text-transform: uppercase;">Regular</span>
                                                </label>
                                                <label class="edit-ticket-type-label" style="display: flex; flex-direction: column; align-items: center; gap: 0.4rem; cursor: pointer; padding: 0.8rem 0.2rem; border: 1px solid #e2e8f0; border-radius: 10px; transition: all 0.2s;">
                                                    <input type="checkbox" name="ticket_type_mode[]" value="vip" ${event.ticket_type_mode && event.ticket_type_mode.includes('vip') ? 'checked' : ''} class="edit-ticket-type-checkbox" style="accent-color: #0f172a;">
                                                    <span style="font-weight: 700; font-size: 0.7rem; text-transform: uppercase;">VIP</span>
                                                </label>
                                                <label class="edit-ticket-type-label" style="display: flex; flex-direction: column; align-items: center; gap: 0.4rem; cursor: pointer; padding: 0.8rem 0.2rem; border: 1px solid #e2e8f0; border-radius: 10px; transition: all 0.2s;">
                                                    <input type="checkbox" name="ticket_type_mode[]" value="premium" ${event.ticket_type_mode && event.ticket_type_mode.includes('premium') ? 'checked' : ''} class="edit-ticket-type-checkbox" style="accent-color: #0f172a;">
                                                    <span style="font-weight: 700; font-size: 0.7rem; text-transform: uppercase;">Premium</span>
                                                </label>
                                                <label class="edit-ticket-type-label" style="display: flex; flex-direction: column; align-items: center; gap: 0.4rem; cursor: pointer; padding: 0.8rem 0.2rem; border: 1px solid #e2e8f0; border-radius: 10px; transition: all 0.2s;">
                                                    <input type="checkbox" name="ticket_type_mode[]" value="all" ${event.ticket_type_mode && event.ticket_type_mode.includes('all') ? 'checked' : ''} class="edit-ticket-type-checkbox" style="accent-color: #0f172a;">
                                                    <span style="font-weight: 700; font-size: 0.7rem; text-transform: uppercase;">All</span>
                                                </label>
                                            </div>

                                            <div id="editRegularConfig" class="edit-ticket-price-section" style="display: none;">
                                                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                                                    <div class="form-group">
                                                        <label style="display: block; font-size: 0.7rem; font-weight: 800; color: #64748b; margin-bottom: 0.5rem; text-transform: uppercase;">Price (₦)</label>
                                                        <input type="number" name="regular_price" id="editRegularPriceInput" value="${event.regular_price || 0}" min="0" step="0.01" style="width: 100%; padding: 0.75rem 1rem; border: 1px solid #e2e8f0; border-radius: 10px; font-weight: 700; background: white;">
                                                    </div>
                                                    <div class="form-group">
                                                        <label style="display: block; font-size: 0.7rem; font-weight: 800; color: #64748b; margin-bottom: 0.5rem; text-transform: uppercase;">Qty</label>
                                                        <input type="number" name="regular_quantity" value="${event.regular_quantity || ''}" placeholder="∞" min="1" style="width: 100%; padding: 0.75rem 1rem; border: 1px solid #e2e8f0; border-radius: 10px; font-weight: 700; background: white;">
                                                    </div>
                                                </div>
                                            </div>

                                            <div id="editVipConfig" class="edit-ticket-price-section" style="display: none;">
                                                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                                                    <div class="form-group">
                                                        <label style="display: block; font-size: 0.7rem; font-weight: 800; color: #64748b; margin-bottom: 0.5rem; text-transform: uppercase;">Price (₦)</label>
                                                        <input type="number" name="vip_price" id="editVipPriceInput" value="${event.vip_price || 0}" min="0" step="0.01" style="width: 100%; padding: 0.75rem 1rem; border: 1px solid #e2e8f0; border-radius: 10px; font-weight: 700; background: white;">
                                                    </div>
                                                    <div class="form-group">
                                                        <label style="display: block; font-size: 0.7rem; font-weight: 800; color: #64748b; margin-bottom: 0.5rem; text-transform: uppercase;">Qty</label>
                                                        <input type="number" name="vip_quantity" value="${event.vip_quantity || ''}" placeholder="∞" min="1" style="width: 100%; padding: 0.75rem 1rem; border: 1px solid #e2e8f0; border-radius: 10px; font-weight: 700; background: white;">
                                                    </div>
                                                </div>
                                            </div>

                                            <div id="editPremiumConfig" class="edit-ticket-price-section" style="display: none;">
                                                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                                                    <div class="form-group">
                                                        <label style="display: block; font-size: 0.7rem; font-weight: 800; color: #64748b; margin-bottom: 0.5rem; text-transform: uppercase;">Price (₦)</label>
                                                        <input type="number" name="premium_price" id="editPremiumPriceInput" value="${event.premium_price || 0}" min="0" step="0.01" style="width: 100%; padding: 0.75rem 1rem; border: 1px solid #e2e8f0; border-radius: 10px; font-weight: 700; background: white;">
                                                    </div>
                                                    <div class="form-group">
                                                        <label style="display: block; font-size: 0.7rem; font-weight: 800; color: #64748b; margin-bottom: 0.5rem; text-transform: uppercase;">Qty</label>
                                                        <input type="number" name="premium_quantity" value="${event.premium_quantity || ''}" placeholder="∞" min="1" style="width: 100%; padding: 0.75rem 1rem; border: 1px solid #e2e8f0; border-radius: 10px; font-weight: 700; background: white;">
                                                    </div>
                                                </div>
                                            </div>

                                            <div id="editAllConfig" class="edit-ticket-price-section" style="display: none;">
                                                <div style="display: grid; grid-template-columns: 1.5fr 1fr; gap: 1rem;">
                                                    <div class="form-group">
                                                        <label style="display: block; font-size: 0.7rem; font-weight: 800; color: #64748b; margin-bottom: 0.5rem; text-transform: uppercase;">Universal Price (₦)</label>
                                                        <input type="number" name="price" id="editAllPriceInput" value="${event.price || 0}" min="0" step="0.01" style="width: 100%; padding: 0.75rem 1rem; border: 1px solid #0f172a; border-radius: 10px; background: white; font-weight: 800; color: #0f172a;">
                                                    </div>
                                                    <div class="form-group">
                                                        <label style="display: block; font-size: 0.7rem; font-weight: 800; color: #64748b; margin-bottom: 0.5rem; text-transform: uppercase;">Total Capacity</label>
                                                        <input type="number" name="total_tickets" value="${event.total_tickets || ''}" placeholder="∞" min="1" style="width: 100%; padding: 0.75rem 1rem; border: 1px solid #e2e8f0; border-radius: 10px; font-weight: 700; background: white;">
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div class="form-group">
                                        <label style="display: block; font-size: 0.75rem; font-weight: 800; color: #1e293b; margin-bottom: 0.75rem; text-transform: uppercase; letter-spacing: 0.5px;">About the Event <span style="color: #ef4444">*</span></label>
                                        <textarea name="description" rows="5" placeholder="Share what makes this event special..." required style="width: 100%; padding: 1.25rem; border: 1px solid #e2e8f0; border-radius: 16px; font-size: 0.95rem; line-height: 1.6; transition: all 0.3s; background: white;">${event.description}</textarea>
                                    </div>

                                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.25rem;">
                                        <div class="form-group">
                                            <label style="display: block; font-size: 0.75rem; font-weight: 800; color: #1e293b; margin-bottom: 0.75rem; text-transform: uppercase; letter-spacing: 0.5px;">Status</label>
                                            <select name="status" id="editEventStatusSelect" style="width: 100%; padding: 1rem 1.25rem; border: 1px solid #e2e8f0; border-radius: 12px; font-size: 1rem; font-weight: 600; background: white;">
                                                <option value="draft" ${event.status === 'draft' ? 'selected' : ''}>Draft</option>
                                                <option value="scheduled" ${event.status === 'scheduled' ? 'selected' : ''}>Scheduled</option>
                                            </select>
                                        </div>
                                        <div class="form-group" id="editScheduledTimeGroup" style="display: ${event.status === 'scheduled' ? 'block' : 'none'};">
                                            <label style="display: block; font-size: 0.75rem; font-weight: 800; color: #1e293b; margin-bottom: 0.75rem; text-transform: uppercase; letter-spacing: 0.5px;">Publish At</label>
                                            <input type="datetime-local" name="scheduled_publish_time" value="${event.scheduled_publish_time ? event.scheduled_publish_time.slice(0, 16) : ''}" style="width: 100%; padding: 1rem 1.25rem; border: 1px solid #fbbf24; border-radius: 12px; background: #fffbeb; font-weight: 600;">
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Footer Actions -->
                        <div style="padding: 1.5rem 2.5rem; background: #f8fafc; border-top: 1px solid #f1f5f9; display: flex; justify-content: flex-end; gap: 1rem; position: sticky; bottom: 0; z-index: 10;">
                            <button type="button" class="btn btn-secondary" onclick="closeEditEventModal()" style="padding: 0.875rem 2rem; font-size: 0.95rem; font-weight: 700; background: white; border: 1px solid #e2e8f0; border-radius: 12px; color: #64748b; cursor: pointer; transition: all 0.2s;">
                                Cancel
                            </button>
                            <button type="submit" class="btn btn-primary" style="padding: 0.875rem 2.5rem; font-size: 0.95rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; background: #0f172a; border: none; border-radius: 12px; color: white; cursor: pointer; box-shadow: 0 10px 15px -3px rgba(15, 23, 42, 0.3); transition: all 0.2s;">
                                Save Changes
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    `;

    // Remove existing modal if any
    const existing = document.getElementById('editEventModal');
    if (existing) existing.remove();

    // Add modal to body
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    // Add persistence - use event ID to prevent data leakage between different events
    const persistenceKey = `editEventForm_${event.id}`;
    const editEventForm = document.getElementById('editEventForm');
    editEventForm.addEventListener('input', () => saveFormState(persistenceKey, 'editEventForm'));
    editEventForm.addEventListener('change', () => saveFormState(persistenceKey, 'editEventForm'));

    // Restore saved state
    restoreFormState(persistenceKey, 'editEventForm');

    // Add submit handler
    editEventForm.addEventListener('submit', handleEventUpdate);

    // Add status change handler
    const editStatusSelect = document.getElementById('editEventStatusSelect');
    const editScheduledTimeGroup = document.getElementById('editScheduledTimeGroup');
    if (editStatusSelect && editScheduledTimeGroup) {
        editStatusSelect.addEventListener('change', function(e) {
            editScheduledTimeGroup.style.display = e.target.value === 'scheduled' ? 'block' : 'none';
        });
    }

    // Ticket Type Configuration Logic (Edit Modal)
    const editTicketTypeCheckboxes = document.querySelectorAll('.edit-ticket-type-checkbox');
    const editRegularPriceSection = document.getElementById('editRegularPriceSection');
    const editVipPriceSection = document.getElementById('editVipPriceSection');
    const editPremiumPriceSection = document.getElementById('editPremiumPriceSection');
    const editAllPriceSection = document.getElementById('editAllPriceSection');
    
    const editRegularPriceInput = document.getElementById('editRegularPriceInput');
    const editVipPriceInput = document.getElementById('editVipPriceInput');
    const editPremiumPriceInput = document.getElementById('editPremiumPriceInput');
    const editAllPriceInput = document.getElementById('editAllPriceInput');

    function updateEditTicketTypeSections() {
        const checkedBoxes = document.querySelectorAll('.edit-ticket-type-checkbox:checked');
        const selectedModes = Array.from(checkedBoxes).map(cb => cb.value);
        
        // Sections
        const sections = {
            'regular': document.getElementById('editRegularConfig'),
            'vip': document.getElementById('editVipConfig'),
            'premium': document.getElementById('editPremiumConfig'),
            'all': document.getElementById('editAllConfig')
        };

        Object.keys(sections).forEach(key => {
            if (sections[key]) {
                sections[key].style.display = selectedModes.includes(key) ? 'block' : 'none';
                
                // If All is selected, we can optionally hide others or just show all. 
                // Creating consistency with create-event.js which shows All separately.
            }
        });

        // Toggle selected styles on labels
        document.querySelectorAll('.edit-ticket-type-label').forEach(label => {
            const input = label.querySelector('input');
            if (input.checked) {
                label.style.borderColor = '#0f172a';
                label.style.background = '#f1f5f9';
            } else {
                label.style.borderColor = '#e2e8f0';
                label.style.background = 'white';
            }
        });
        
        // Update required attribute
        if (editRegularPriceInput) editRegularPriceInput.required = selectedModes.includes('regular');
        if (editVipPriceInput) editVipPriceInput.required = selectedModes.includes('vip');
        if (editPremiumPriceInput) editPremiumPriceInput.required = selectedModes.includes('premium');
        if (editAllPriceInput) editAllPriceInput.required = selectedModes.includes('all');
    }

    // Initialize Ticket Sections
    updateEditTicketTypeSections();

    // Initialize State and Per-State Addresses
    // Parse locations if present
    if (event.locations) {
        try {
            const locs = typeof event.locations === 'string' ? JSON.parse(event.locations) : event.locations;
            if (Array.isArray(locs) && locs.length > 0) {
                // We need to render the fields first, then fill them
                const selectedStates = event.state ? event.state.split(',') : [];
                renderPerStateEditAddressFields(selectedStates);
                
                const container = document.getElementById('perStateEditAddressContainer');
                locs.forEach(loc => {
                    const ta = container.querySelector(`textarea[data-state="${loc.state}"]`);
                    if (ta) ta.value = loc.address;
                });
                
                // Update hidden input
                const hiddenLocations = document.getElementById('editLocationsJsonInput');
                if (hiddenLocations) hiddenLocations.value = JSON.stringify(locs);
            }
        } catch (e) {
            console.error("Error parsing locations for edit modal", e);
        }
    } else {
        // Just call update to handle the single state case / disabling
        updateEditSelectedStates();
    }

    editTicketTypeCheckboxes.forEach(cb => {
        cb.addEventListener('change', updateEditTicketTypeSections);
    });

    // Free Event Checkbox Handler (Edit Modal)
    const freeCheckbox = document.getElementById('editFreeEventCheckbox');
    const ticketConfig = document.getElementById('editTicketTypeConfigSection');
    if (freeCheckbox && ticketConfig) {
        const handleFreeToggle = () => {
            if (freeCheckbox.checked) {
                ticketConfig.style.display = 'none';
                if (editRegularPriceInput) { editRegularPriceInput.value = 0; editRegularPriceInput.required = false; }
                if (editVipPriceInput) { editVipPriceInput.value = 0; editVipPriceInput.required = false; }
                if (editPremiumPriceInput) { editPremiumPriceInput.value = 0; editPremiumPriceInput.required = false; }
                if (editAllPriceInput) { editAllPriceInput.value = 0; editAllPriceInput.required = false; }
                
                const qtyInputs = document.querySelectorAll('#editTicketTypeConfigSection input[type="number"]');
                qtyInputs.forEach(input => {
                    if (input.name.includes('quantity')) input.value = '';
                });
            } else {
                ticketConfig.style.display = 'block';
                updateEditTicketTypeSections();
            }
        };

        // Initial state
        handleFreeToggle();
        freeCheckbox.addEventListener('change', handleFreeToggle);
    }

    // Initial update
    updateEditTicketTypeSections();

    // Add status change handler (Edit Modal)
    const statusSelect = document.getElementById('editEventStatusSelect');
    if (statusSelect) {
        statusSelect.addEventListener('change', function(e) {
            const scheduledGroup = document.getElementById('editScheduledTimeGroup');
            if (scheduledGroup) {
                scheduledGroup.style.display = e.target.value === 'scheduled' ? 'block' : 'none';
            }
        });
    }

    // Initialize Time Picker highlights if time exists
    if (event.event_time) {
        if (typeof setTimePickerValue === 'function') {
            setTimePickerValue('editEventTimePickerContainer', event.event_time);
        }
    }
}

/**
 * Edit Modal State Selection Helpers
 */
function toggleEditStateSelect() {
    const dropdown = document.getElementById('editStateSelectDropdown');
    const display = document.getElementById('editStateSelectDisplay');
    if (!dropdown || !display) return;

    dropdown.classList.toggle('active');
    display.classList.toggle('active');

    if (dropdown.classList.contains('active')) {
        const closeDropdown = (e) => {
            const container = document.getElementById('editStateSelectContainer');
            if (!container) {
                document.removeEventListener('click', closeDropdown);
                return;
            }
            if (!container.contains(e.target)) {
                dropdown.classList.remove('active');
                display.classList.remove('active');
                document.removeEventListener('click', closeDropdown);
            }
        };
        setTimeout(() => document.addEventListener('click', closeDropdown), 10);
    }
}

function renderPerStateEditAddressFields(selectedStates) {
    const container = document.getElementById('perStateEditAddressContainer');
    const mainAddress = document.getElementById('editEventAddress');
    const helpText = document.getElementById('editAddressHelpText');
    if (!container) return;

    // Save existing values to prevent data loss when re-rendering
    const existingValues = {};
    container.querySelectorAll('textarea').forEach(ta => {
        existingValues[ta.dataset.state] = ta.value;
    });

    if (selectedStates.length > 1) {
        container.style.display = 'block';
        const mainAddressGroup = document.getElementById('editMainAddressGroup');
        if (mainAddressGroup) mainAddressGroup.style.display = 'none';
        if (helpText) helpText.style.display = 'block';
        // ... rest of logic

        container.innerHTML = selectedStates.map(state => `
            <div style="margin-bottom: 0.75rem;">
                <label style="display: block; font-size: 0.7rem; font-weight: 700; color: #475569; margin-bottom: 0.3rem;">Venue for ${state}</label>
                <textarea 
                    data-state="${state}"
                    placeholder="Address for ${state}..." 
                    style="width: 100%; padding: 0.6rem; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 0.85rem;"
                    onfocus="this.style.borderColor='#0f172a';"
                    onblur="this.style.borderColor='#e2e8f0';"
                >${existingValues[state] || ''}</textarea>
            </div>
        `).join('');

        // Re-inject locations_json hidden input logic if needed
        const hiddenLocations = document.createElement('input');
        hiddenLocations.type = 'hidden';
        hiddenLocations.name = 'locations_json';
        hiddenLocations.id = 'editLocationsJsonInput';
        container.appendChild(hiddenLocations);

        const updateJson = () => {
            const locs = [];
            container.querySelectorAll('textarea').forEach(ta => {
                locs.push({ state: ta.dataset.state, address: ta.value });
            });
            hiddenLocations.value = JSON.stringify(locs);
        };

        container.querySelectorAll('textarea').forEach(ta => {
            ta.addEventListener('input', updateJson);
        });
        updateJson();
    } else {
        container.style.display = 'none';
        container.innerHTML = '';
        if (mainAddress) {
            mainAddress.disabled = false;
            mainAddress.style.backgroundColor = 'white';
            mainAddress.placeholder = 'Full venue address...';
        }
        if (helpText) helpText.style.display = 'none';
        
        // Remove locations_json input if it exists
        const locInput = document.getElementById('editLocationsJsonInput');
        if (locInput) locInput.remove();
    }
}

function updateEditSelectedStates() {
    const checkboxes = document.querySelectorAll('.edit-state-checkbox:checked');
    const selectedValues = Array.from(checkboxes).map(cb => cb.value);
    const displaySpan = document.getElementById('editSelectedStatesText');
    const hiddenInput = document.getElementById('editEventStateInput');

    if (selectedValues.length === 0) {
        displaySpan.textContent = 'Select State(s)';
        displaySpan.style.color = '#9ca3af';
        hiddenInput.value = '';
    } else {
        displaySpan.textContent = selectedValues.join(', ');
        displaySpan.style.color = '#1e293b';
        hiddenInput.value = selectedValues.join(',');
    }
    
    renderPerStateEditAddressFields(selectedValues);
    
    // Trigger input event for persistence
    hiddenInput.dispatchEvent(new Event('input', { bubbles: true }));
}

window.toggleEditStateSelect = toggleEditStateSelect;
window.updateEditSelectedStates = updateEditSelectedStates;
window.previewEditEventImage = previewEditEventImage;

function closeEditEventModal() {
    const modal = document.getElementById('editEventModal');
    if (modal) modal.remove();
}

function previewEditEventImage(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            document.getElementById('editEventImagePreview').src = e.target.result;
        };
        reader.readAsDataURL(file);
    }
}

async function handleEventUpdate(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const eventId = formData.get('event_id');
    
    // Show loading state
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'Updating...';
    submitBtn.disabled = true;
    
    try {
        const response = await apiFetch('/api/events/update-event.php', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (result.success) {
            showNotification('Event updated successfully!', 'success');
            
            // Clear saved form state ONLY on success
            clearFormState(`editEventForm_${eventId}`);
            
            closeEditEventModal();
            
            // Update UI immediately without refresh
            if (result.event) {
                if (typeof window.updateEventInList === 'function') {
                    window.updateEventInList(result.event);
                } else if (typeof window.updateEventOnDashboard === 'function') {
                    window.updateEventOnDashboard(result.event);
                }
            }
            setTimeout(() => window.location.reload(), 500);
        } else {
            showNotification('Failed to update event: ' + result.message, 'error');
            submitBtn.textContent = originalText;
            submitBtn.disabled = false;
        }
    } catch (error) {
        showNotification('An error occurred while updating event', 'error');
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
    }
}

// Ticket Preview Modal
function renderStyledTicketQr(container, barcode) {
    if (!container || !barcode) return;
    const payload = `${window.location.origin}/api/tickets/validate-ticket.php?barcode=${encodeURIComponent(barcode)}`;

    if (typeof QRCode !== 'undefined') {
        container.innerHTML = `
            <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;margin-top:12px;pointer-events:none;user-select:none;">
                <div id="ticketPreviewQrInner" style="position:relative;background:#fff;padding:10px;border-radius:1rem;box-shadow:0 10px 25px -5px rgba(0,0,0,0.1);border:1px solid #e2e8f0;"></div>
            </div>`;
        try {
            new QRCode(document.getElementById('ticketPreviewQrInner'), {
                text: String(payload),
                width: 160,
                height: 160,
                colorDark: '#000000',
                colorLight: '#ffffff',
                correctLevel: QRCode.CorrectLevel.L
            });
            return;
        } catch (e) {
            console.error('QR generation failed', e);
        }
    }

    if (typeof QRCode === 'undefined') {
        const apiUrl = `${window.location.origin}/api/barcodes/generate-barcode.php?text=${encodeURIComponent(payload)}`;
        container.innerHTML = `
            <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;margin-top:12px;pointer-events:none;user-select:none;">
                <div style="position:relative;background:#fff;padding:10px;border-radius:1rem;box-shadow:0 10px 25px -5px rgba(0,0,0,0.1);border:1px solid #e2e8f0;">
                    <img src="${apiUrl}" alt="QR Code" width="160" height="160" style="width:160px;height:160px;display:block;">
                </div>
            </div>`;
    }
}

function showTicketPreviewModal(ticket) {
    const imgSrc = ticket.event_image ? getImageUrl(ticket.event_image) : null;
    const heroFallback = 'linear-gradient(135deg, #6366f1 0%, #2ecc71 100%)';
    const paidAmount = parseFloat(ticket.amount ?? ticket.price ?? ticket.total_price ?? 0);
    const eventPrice = parseFloat(ticket.event_price ?? 0);

    const isFree = paidAmount <= 0 && eventPrice <= 0;
    const priceValue = paidAmount > 0 ? paidAmount : (eventPrice > 0 ? eventPrice : 0);
    const price = isFree ? 'Free' : `₦${priceValue.toLocaleString()}`;
    const typeLabel = isFree ? 'Free' : (ticket.ticket_type_display || ticket.ticket_type || 'regular');
    const statusClass = ticket.status === 'valid' ? 'tkt-active' : ticket.status === 'used' ? 'tkt-used' : 'tkt-cancelled';
    const statusLabel = { valid: '✓ Valid', used: '👁 Used', cancelled: '✕ Cancelled' }[ticket.status] || (ticket.status ? ticket.status.toUpperCase() : 'N/A');

    const heroImageHtml = imgSrc
        ? `<img src="${imgSrc.replace(/"/g, '&quot;')}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;" onerror="this.style.display='none';">`
        : '';

    const modalHTML = `
    <div id="ticketPreviewModal" style="position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:9100;backdrop-filter:blur(6px);padding:1rem;">
        <div style="background:white;border-radius:20px;overflow:hidden;max-width:520px;width:100%;box-shadow:0 25px 60px rgba(0,0,0,.25);animation:slideUp .3s ease-out;">
            <!-- Event Image Hero -->
            <div style="height:160px;background:${heroFallback};background-size:cover;background-position:center;position:relative;overflow:hidden;">
                ${heroImageHtml}
                <button onclick="closeTicketPreviewModal()" style="position:absolute;top:1rem;right:1rem;background:rgba(0,0,0,.4);border:none;color:white;width:34px;height:34px;border-radius:50%;font-size:1.2rem;cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:2;">&times;</button>
                <div style="position:absolute;bottom:1rem;left:1.5rem;z-index:2;">
                    <div style="font-size:.7rem;font-weight:700;color:rgba(255,255,255,.7);text-transform:uppercase;letter-spacing:.07em;margin-bottom:2px;">Event</div>
                    <div style="font-size:1.25rem;font-weight:800;color:white;text-shadow:0 2px 8px rgba(0,0,0,.4);">${escapeHTML(ticket.event_name || '—')}</div>
                </div>
            </div>
            <!-- Details -->
            <div style="padding:1.5rem;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.25rem;">
                    <span class="tkt-badge ${statusClass}" style="font-size:.82rem; padding: 4px 12px; border-radius: 20px; font-weight: 600;">${escapeHTML(statusLabel)}</span>
                    <span style="font-family:monospace;font-size:.85rem;color:#6366f1;font-weight:700;">${escapeHTML(ticket.custom_id || ticket.id)}</span>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:.85rem;">
                    <div><div style="font-size:.7rem;color:#94a3b8;font-weight:700;text-transform:uppercase;margin-bottom:2px;">Buyer</div><div style="font-weight:600;">${escapeHTML(ticket.buyer_name || ticket.user_name || '—')}</div></div>
                    <div><div style="font-size:.7rem;color:#94a3b8;font-weight:700;text-transform:uppercase;margin-bottom:2px;">Price</div><div style="font-weight:700;">${price}</div></div>
                    <div><div style="font-size:.7rem;color:#94a3b8;font-weight:700;text-transform:uppercase;margin-bottom:2px;">Category</div><div style="font-weight:600;">${escapeHTML(ticket.category || ticket.event_category || 'General')}</div></div>
                    <div><div style="font-size:.7rem;color:#94a3b8;font-weight:700;text-transform:uppercase;margin-bottom:2px;">Date Purchased</div><div style="font-weight:600;">${ticket.purchase_date || ticket.created_at ? new Date(ticket.purchase_date || ticket.created_at).toLocaleDateString() : '—'}</div></div>
                    <div><div style="font-size:.7rem;color:#94a3b8;font-weight:700;text-transform:uppercase;margin-bottom:2px;">Ticket Type</div><div style="font-weight:600;text-transform:capitalize;color:#6366f1;">${escapeHTML(typeLabel)}</div></div>
                </div>
                <div style="background: #f8fafc; padding: 1.25rem; border-radius: 12px; margin: 1.25rem 0; text-align: center; border: 1px dashed #e2e8f0;">
                    <div style="font-size: .7rem; color: #94a3b8; font-weight: 700; text-transform: uppercase; margin-bottom: 1rem; letter-spacing: 0.05em;">Ticket Barcode</div>
                    <svg id="ticketBarcode" style="margin: 0 auto; min-width: 200px; height: 60px;"></svg>
                    <div style="font-family: 'Courier New', monospace; font-size: .85rem; color: #1e293b; margin-top: 0.75rem; font-weight: 700; background: white; padding: 4px 12px; border-radius: 4px; display: inline-block;">${escapeHTML(ticket.custom_id || ticket.barcode || 'TKT-' + (ticket.id || Math.random().toString(36).substr(2, 9).toUpperCase()))}</div>

                    <div id="ticketQrContainer" style="margin-top:12px;"></div>
                </div>
                <div style="display:flex;gap:.75rem;margin-top:1.5rem;">
                    <button onclick="closeTicketPreviewModal()" style="flex:1;padding:.75rem;background:#6366f1;color:white;border:none;border-radius:10px;font-weight:700;cursor:pointer;font-size:.9rem;">Close</button>
                </div>
            </div>
        </div>
    </div>`;

    const existing = document.getElementById('ticketPreviewModal');
    if (existing) existing.remove();

    document.body.insertAdjacentHTML('beforeend', modalHTML);

    // Reinitialize Lucide icons if available
    if (typeof lucide !== 'undefined' && lucide.createIcons) {
        lucide.createIcons();
    }

    // Render barcode if library exists
    if (typeof JsBarcode !== 'undefined') {
        try {
            JsBarcode("#ticketBarcode", ticket.custom_id || ticket.barcode || ticket.id.toString(), {
                format: "CODE128",
                width: 2,
                height: 60,
                displayValue: false,
                margin: 0,
                background: "transparent",
                lineColor: "#1e293b"
            });
        } catch (e) {
        }
    }

    // Render QR code using the same styled container as payment.html
    (function renderTicketQr() {
        const qrContainer = document.getElementById('ticketQrContainer');
        if (!qrContainer) return;

        const barcode = ticket.barcode || ticket.custom_id || (ticket.id ? 'TKT-' + ticket.id : null);
        if (barcode) {
            renderStyledTicketQr(qrContainer, barcode);
        }
    })();
}

function closeTicketPreviewModal() {
    const modal = document.getElementById('ticketPreviewModal');
    if (modal) modal.remove();
}

// User Preview Modal
function showUserPreviewModal(user) {
    const hasValidUrl = user.profile_pic && user.profile_pic.startsWith('http');
    const profileImage = user.profile_pic 
        ? (hasValidUrl ? user.profile_pic : `../../${user.profile_pic}`)
        : `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name || 'User')}&background=random&size=150`;

    const modalContent = `
        <div id="userPreviewModal" class="modal-backdrop active" role="dialog" aria-modal="true" aria-hidden="false">
            <div class="modal-content" style="max-width: 1000px; border-radius: 16px; overflow: hidden; padding: 0;">
                <div class="modal-header" style="background: var(--client-bg-body); padding: 1.5rem 2rem; border-bottom: 1px solid var(--client-border);">
                    <h2 style="margin: 0; font-size: 1.25rem;">User Details</h2>
                    <button class="modal-close" onclick="closeUserPreviewModal()" style="font-size: 1.5rem;">×</button>
                </div>
                <div class="modal-body" style="padding: 2.5rem 2rem;">
                    <div style="display: flex; gap: 2.5rem; flex-wrap: wrap;">
                        <div style="text-align: center; flex: 0 0 160px;">
                            <img src="${profileImage}" style="width: 140px; height: 140px; border-radius: 50%; object-fit: cover; border: 4px solid var(--client-primary); box-shadow: 0 8px 16px rgba(0,0,0,0.1);">
                            <div style="margin-top: 1rem; font-weight: 800; font-size: 1.25rem; color: var(--client-text-main);">${user.name || 'N/A'}</div>
                            <div style="font-size: 0.9rem; color: var(--client-text-muted); font-weight: 500;">${user.email || 'N/A'}</div>
                        </div>
                        
                        <div style="flex: 1; min-width: 300px; display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem 2rem;">
                            <!-- Column 1 -->
                            <div>
                                <div style="font-size: 0.75rem; text-transform: uppercase; color: var(--client-text-muted); font-weight: 700; margin-bottom: 0.25rem; letter-spacing: 0.5px;">Phone</div>
                                <div style="font-weight: 600; color: var(--client-text-main); font-size: 1rem;">${user.phone || 'N/A'}</div>
                            </div>
                            
                            <div>
                                <div style="font-size: 0.75rem; text-transform: uppercase; color: var(--client-text-muted); font-weight: 700; margin-bottom: 0.25rem; letter-spacing: 0.5px;">State / Province</div>
                                <div style="font-weight: 600; color: var(--client-text-main); font-size: 1rem;">${user.state || 'N/A'}</div>
                            </div>

                            <div>
                                <div style="font-size: 0.75rem; text-transform: uppercase; color: var(--client-text-muted); font-weight: 700; margin-bottom: 0.25rem; letter-spacing: 0.5px;">City</div>
                                <div style="font-weight: 600; color: var(--client-text-main); font-size: 1rem;">${user.city || 'N/A'}</div>
                            </div>
                            
                            <div>
                                <div style="font-size: 0.75rem; text-transform: uppercase; color: var(--client-text-muted); font-weight: 700; margin-bottom: 0.25rem; letter-spacing: 0.5px;">Country</div>
                                <div style="font-weight: 600; color: var(--client-text-main); font-size: 1rem;">${user.country || 'N/A'}</div>
                            </div>

                            <div>
                                <div style="font-size: 0.75rem; text-transform: uppercase; color: var(--client-text-muted); font-weight: 700; margin-bottom: 0.25rem; letter-spacing: 0.5px;">Gender</div>
                                <div style="font-weight: 600; color: var(--client-text-main); font-size: 1rem; text-transform: capitalize;">${user.gender || 'N/A'}</div>
                            </div>
                            
                            <div>
                                <div style="font-size: 0.75rem; text-transform: uppercase; color: var(--client-text-muted); font-weight: 700; margin-bottom: 0.25rem; letter-spacing: 0.5px;">Date of Birth</div>
                                <div style="font-weight: 600; color: var(--client-text-main); font-size: 1rem;">${user.dob ? formatDate(user.dob) : 'N/A'}</div>
                            </div>

                            <div style="grid-column: 1 / -1; height: 1px; background: var(--client-border); margin: 0.5rem 0;"></div>

                            <div>
                                <div style="font-size: 0.75rem; text-transform: uppercase; color: var(--client-text-muted); font-weight: 700; margin-bottom: 0.25rem; letter-spacing: 0.5px;">Organiser</div>
                                <div style="font-weight: 600; color: var(--client-text-main); font-size: 1rem;">${user.client_name || 'Direct'}</div>
                            </div>

                            <div>
                                <div style="font-size: 0.75rem; text-transform: uppercase; color: var(--client-text-muted); font-weight: 700; margin-bottom: 0.25rem; letter-spacing: 0.5px;">Date Joined</div>
                                <div style="font-weight: 600; color: var(--client-text-main); font-size: 1rem;">${user.created_at ? formatDate(user.created_at) : 'N/A'}</div>
                            </div>

                            <div>
                                <div style="font-size: 0.75rem; text-transform: uppercase; color: var(--client-text-muted); font-weight: 700; margin-bottom: 0.25rem; letter-spacing: 0.5px;">Status</div>
                                <div style="font-weight: 700; padding: 4px 10px; border-radius: 20px; font-size: 0.75rem; display: inline-block; ${(user.status === 'active' || user.status === 1 || user.status === '1') ? 'background: #d1fae5; color: #722f37;' : 'background: #fee2e2; color: #ef4444;'}">
                                    ${(user.status === 'active' || user.status === 1 || user.status === '1') ? 'Active' : 'Inactive'}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="modal-footer" style="padding: 1.5rem 2rem; background: #f9fafb; border-top: 1px solid var(--client-border); display: flex; justify-content: flex-end;">
                    <button onclick="closeUserPreviewModal()" class="btn btn-primary" style="padding: 0.75rem 2rem;">
                        Close
                    </button>
                </div>
            </div>
        </div>
    `;

    const existing = document.getElementById('userPreviewModal');
    if (existing) existing.remove();

    document.body.insertAdjacentHTML('beforeend', modalContent);
}

function closeUserPreviewModal() {
    const modal = document.getElementById('userPreviewModal');
    if (modal) modal.remove();
}

// Removed local showNotification to use global one from utils.js

// Make functions globally available
window.showProfileEditModal = showProfileEditModal;
window.closeProfileEditModal = closeProfileEditModal;
window.previewProfilePic = previewProfilePic;
window.showEventPreviewModal = showEventPreviewModal;
window.closeEventPreviewModal = closeEventPreviewModal;
window.shareEvent = shareEvent;
window.publishEvent = publishEvent;
window.showEditEventModal = showEditEventModal;
window.closeEditEventModal = closeEditEventModal;
window.previewEditEventImage = previewEditEventImage;
// console.log("State Select Helpers initialized");
window.showTicketPreviewModal = showTicketPreviewModal;
window.closeTicketPreviewModal = closeTicketPreviewModal;
window.showUserPreviewModal = showUserPreviewModal;
window.closeUserPreviewModal = closeUserPreviewModal;
