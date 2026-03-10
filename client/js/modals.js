/**
 * Client Modals JavaScript
 * Handles all modal functionality for client dashboard
 */

// Profile Edit Modal
function showProfileEditModal() {
    const user = storage.get('client_user') || storage.get('user');
    if (!user) return;

    const modalHTML = `
        <div id="profileEditModal" class="modal-backdrop active" role="dialog" aria-modal="true" aria-hidden="false">
            <div class="modal-content" style="max-width: 800px; max-height: 90vh; overflow-y: auto; margin: auto;">
                <div class="modal-header">
                    <h2>Edit Profile</h2>
                    <button class="modal-close" onclick="closeProfileEditModal()">×</button>
                </div>
                <div class="modal-body">
                    <form id="profileEditForm" enctype="multipart/form-data">
                        <!-- Profile Picture -->
                        <div style="text-align: center; margin-bottom: 3.5rem; margin-top: 1rem;">
                            <div style="position: relative; display: inline-block;">
                                <img id="profilePreview" 
                                     src="${user.profile_pic || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=random&size=160`}" 
                                     style="width: 160px; height: 160px; border-radius: 50%; object-fit: cover; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">
                                     
                                <div class="profile-badge-overlay" style="position: absolute; bottom: 8px; right: 8px; background: white; border-radius: 50%; padding: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.15); display: flex; align-items: center; justify-content: center; z-index: 2;">
                                    ${(Number(user.nin_verified) === 1 && Number(user.bvn_verified) === 1)
                                       ? '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="#10b981" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="border-radius: 50%;"><polyline points="20 6 9 17 4 12"></polyline></svg>'
                                       : '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="#ef4444" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="border-radius: 50%;"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>'}
                                </div>
                                
                                <label for="profilePicInput" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: rgba(139, 92, 246, 0.8); color: white; width: 44px; height: 44px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 1.2rem; box-shadow: 0 4px 12px rgba(0,0,0,0.15); transition: all 0.2s; z-index: 3;" onmouseover="this.style.transform='translate(-50%, -50%) scale(1.1)'; this.style.background='rgba(139, 92, 246, 0.9)'" onmouseout="this.style.transform='translate(-50%, -50%)'; this.style.background='rgba(139, 92, 246, 0.8)'">
                                    📷
                                </label>
                                <input type="file" id="profilePicInput" name="profile_pic" accept="image/*" style="display: none;" onchange="previewProfilePic(event)">
                            </div>
                        </div>

                        <!-- Personal Information Section -->
                        <h3 style="margin-top: 1rem; margin-bottom: 1.5rem; padding-bottom: 0.75rem; border-bottom: 2px solid #f0f0f0; color: #333; font-size: 1.25rem;">Personal Information</h3>
                        
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem;">
                            <div class="form-group" style="grid-column: span 2;">
                                <label style="font-weight: 600; margin-bottom: 0.5rem; display: block;">Full Name *</label>
                                <input type="text" name="name" value="${user.name}" required style="width: 100%; padding: 0.75rem; border: 1px solid #ccc; border-radius: 8px;">
                            </div>
                            <div class="form-group">
                                <label style="font-weight: 600; margin-bottom: 0.5rem; display: block;">Email</label>
                                <input type="email" value="${user.email}" disabled style="width: 100%; padding: 0.75rem; border: 1px solid #e0e0e0; border-radius: 8px; background: #f9f9f9; color: #777;">
                            </div>
                            <div class="form-group">
                                <label style="font-weight: 600; margin-bottom: 0.5rem; display: block;">Phone</label>
                                <input type="tel" name="phone" value="${user.phone || ''}" placeholder="+234..." style="width: 100%; padding: 0.75rem; border: 1px solid #ccc; border-radius: 8px;">
                            </div>
                            
                            <div class="form-group" style="grid-column: span 2;">
                                <label style="font-weight: 600; margin-bottom: 0.5rem; display: flex; align-items: center; justify-content: space-between; width: 100%;">
                                    <span>NIN (National Identity Number)</span>
                                    <div id="ninStatus" class="verification-status-indicator" style="display: flex; align-items: center; gap: 0.5rem;">
                                        <!-- Will be populated dynamically -->
                                    </div>
                                </label>
                                <input type="text" id="ninInput" name="nin" value="${user.nin || ''}" placeholder="11-digit NIN" style="width: 100%; padding: 0.75rem; border: 1px solid #ccc; border-radius: 8px;" onblur="validateAndVerifyField('nin')">
                            </div>

                            <div class="form-group">
                                <label style="font-weight: 600; margin-bottom: 0.5rem; display: block;">Date of Birth</label>
                                <input type="date" name="dob" value="${user.dob || ''}" style="width: 100%; padding: 0.75rem; border: 1px solid #ccc; border-radius: 8px;">
                            </div>
                            <div class="form-group">
                                <label style="font-weight: 600; margin-bottom: 0.5rem; display: block;">Gender</label>
                                <select name="gender" style="width: 100%; padding: 0.75rem; border: 1px solid #ccc; border-radius: 8px; background: white;">
                                    <option value="">Select Gender</option>
                                    <option value="male" ${user.gender === 'male' ? 'selected' : ''}>Male</option>
                                    <option value="female" ${user.gender === 'female' ? 'selected' : ''}>Female</option>
                                    <option value="other" ${user.gender === 'other' ? 'selected' : ''}>Other</option>
                                </select>
                            </div>
                            
                            <div class="form-group" style="grid-column: span 2;">
                                <label style="font-weight: 600; margin-bottom: 0.5rem; display: block;">Address</label>
                                <textarea name="address" rows="2" placeholder="Full address" style="width: 100%; padding: 0.75rem; border: 1px solid #ccc; border-radius: 8px;">${user.address || ''}</textarea>
                            </div>
                            
                            <div class="form-group">
                                <label style="font-weight: 600; margin-bottom: 0.5rem; display: block;">Job Title</label>
                                <input type="text" name="job_title" value="${user.job_title || ''}" placeholder="Event Organizer" style="width: 100%; padding: 0.75rem; border: 1px solid #ccc; border-radius: 8px;">
                            </div>
                            <div class="form-group">
                                <label style="font-weight: 600; margin-bottom: 0.5rem; display: block;">Company</label>
                                <input type="text" name="company" value="${user.company || ''}" placeholder="Company Name" style="width: 100%; padding: 0.75rem; border: 1px solid #ccc; border-radius: 8px;">
                            </div>
                            <div class="form-group">
                                <label style="font-weight: 600; margin-bottom: 0.5rem; display: block;">City</label>
                                <input type="text" name="city" value="${user.city || ''}" placeholder="Lagos" style="width: 100%; padding: 0.75rem; border: 1px solid #ccc; border-radius: 8px;">
                            </div>
                            <div class="form-group">
                                <label style="font-weight: 600; margin-bottom: 0.5rem; display: block;">State</label>
                                <select name="state" style="width: 100%; padding: 0.75rem; border: 1px solid #ccc; border-radius: 8px; background: white;">
                                    <option value="">Select State</option>
                                    ${getNigerianStates().map(state => 
                                        `<option value="${state}" ${user.state === state ? 'selected' : ''}>${state}</option>`
                                    ).join('')}
                                </select>
                            </div>
                            <div class="form-group" style="grid-column: span 2;">
                                <label style="font-weight: 600; margin-bottom: 0.5rem; display: block;">Country</label>
                                <input type="text" name="country" value="${user.country || ''}" placeholder="Nigeria" style="width: 100%; padding: 0.75rem; border: 1px solid #ccc; border-radius: 8px;">
                            </div>
                        </div>

                        <!-- Payment Information Section -->
                        <h3 style="margin-top: 2.5rem; margin-bottom: 1.5rem; padding-bottom: 0.75rem; border-bottom: 2px solid #f0f0f0; color: #333; font-size: 1.25rem;">Payment Information</h3>
                        
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem;">
                            <div class="form-group" style="grid-column: span 2;">
                                <label style="font-weight: 600; margin-bottom: 0.5rem; display: flex; align-items: center; justify-content: space-between; width: 100%;">
                                    <span>BVN (Bank Verification Number)</span>
                                    <div id="bvnStatus" class="verification-status-indicator" style="display: flex; align-items: center; gap: 0.5rem;">
                                        <!-- Will be populated dynamically -->
                                    </div>
                                </label>
                                <input type="text" id="bvnInput" name="bvn" value="${user.bvn || ''}" placeholder="11-digit BVN" style="width: 100%; padding: 0.75rem; border: 1px solid #ccc; border-radius: 8px;" onblur="validateAndVerifyField('bvn')">
                            </div>
                            <div class="form-group" style="grid-column: span 2;">
                                <label style="font-weight: 600; margin-bottom: 0.5rem; display: block;">Account Name</label>
                                <input type="text" name="account_name" value="${user.account_name || ''}" placeholder="John Doe" style="width: 100%; padding: 0.75rem; border: 1px solid #ccc; border-radius: 8px;">
                            </div>
                            <div class="form-group">
                                <label style="font-weight: 600; margin-bottom: 0.5rem; display: block;">Account Number</label>
                                <input type="text" name="account_number" value="${user.account_number || ''}" placeholder="0123456789" style="width: 100%; padding: 0.75rem; border: 1px solid #ccc; border-radius: 8px;">
                            </div>
                            <div class="form-group">
                                <label style="font-weight: 600; margin-bottom: 0.5rem; display: block;">Bank Name</label>
                                <input type="text" name="bank_name" value="${user.bank_name || ''}" placeholder="e.g. GTBank" style="width: 100%; padding: 0.75rem; border: 1px solid #ccc; border-radius: 8px;">
                            </div>
                        </div>


                        <!-- Submit Button -->
                        <div style="display: flex; gap: 1rem; margin-top: 2rem;">
                            <button type="submit" class="btn btn-primary" style="flex: 1;">
                                Save Changes
                            </button>
                            <button type="button" class="btn btn-secondary" onclick="closeProfileEditModal()" style="flex: 1;">
                                Cancel
                            </button>
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

    // Add form submit handler
    document.getElementById('profileEditForm').addEventListener('submit', handleProfileUpdate);
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
    
    const formData = new FormData(e.target);
    
    try {
        const response = await apiFetch('../../api/clients/update-profile.php', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (result.success) {
            showNotification('Profile updated successfully!', 'success');
            
            // Update stored user data
            storage.set('client_user', result.user);
            
            // Close modal
            closeProfileEditModal();
            
            // Reload page to reflect changes
            if (window.loadDashboardStats) {
                window.loadDashboardStats(result.user.id);
            }
            
            // Update sidebar profile if exists
            if (document.getElementById('sidebarUserName')) {
                document.getElementById('sidebarUserName').textContent = result.user.name;
            }
            
            setTimeout(() => window.location.reload(), 1000);
        } else {
            showNotification('Failed to update profile: ' + result.message, 'error');
        }
    } catch (error) {
        console.error('Error updating profile:', error);
        showNotification('An error occurred while updating profile', 'error');
    }
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
        const response = await apiFetch('../../api/admin/dojah-mock.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: type, number: value })
        });

        const result = await response.json();

        if (result.success && result.data.verified) {
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
        } else {
            const errorMsg = result.data?.message || `Invalid ${type.toUpperCase()}`;
            updateFieldStatus(type, 'error', errorMsg);
            showNotification(`${type.toUpperCase()} verification failed.`, 'error');
            
            const user = storage.get('client_user') || storage.get('user');
            if (user) {
                user[`${type}_verified`] = 0;
                storage.set('client_user', user);
                updateVerificationBadge();
            }
        }
    } catch (error) {
        console.error(`Error verifying ${type}:`, error);
        updateFieldStatus(type, 'error', 'Connection error');
    }
}

function updateFieldStatus(type, status, message = '') {
    const statusDiv = document.getElementById(`${type}Status`);
    if (!statusDiv) return;

    if (status === 'loading') {
        statusDiv.innerHTML = '<span class="spinner" style="width: 16px; height: 16px; border: 2px solid #3b82f6; border-top-color: transparent; border-radius: 50%; display: inline-block; animation: spin 0.8s linear infinite;"></span>';
    } else if (status === 'success') {
        statusDiv.innerHTML = '<span style="color:#10b981; font-size: 1.1rem; font-weight: bold;" title="Verified">✓</span>';
    } else if (status === 'error') {
        statusDiv.innerHTML = `<span style="color:#ef4444; font-size: 1.1rem; font-weight: bold; cursor: help;" title="${message}">✕</span>`;
    }
}

function updateVerificationBadge() {
    const user = storage.get('client_user') || storage.get('user');
    const badgeContainer = document.querySelector('.profile-badge-overlay');
    if (!badgeContainer || !user) return;

    const isFullyVerified = Number(user.nin_verified) === 1 && Number(user.bvn_verified) === 1;
    
    badgeContainer.innerHTML = isFullyVerified 
        ? '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="#10b981" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="border-radius: 50%;"><polyline points="20 6 9 17 4 12"></polyline></svg>'
        : '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="#ef4444" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="border-radius: 50%;"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>';
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
        const response = await apiFetch(`../../api/events/get-event-details.php?event_id=${eventId}`);
        const result = await response.json();

        if (result.success && result.event) {
            displayEventPreview(result.event);
        } else {
            showNotification(result.message || 'Event not found', 'error');
            closeEventPreviewModal();
        }
    } catch (error) {
        console.error('Error fetching event:', error);
        showNotification('Failed to load event details', 'error');
        closeEventPreviewModal();
    }
}

function displayEventPreview(event) {
    const eventImage = event.image_path || 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=1200&fit=crop';
    const status = event.status || 'draft';
    const price = parseFloat(event.price) === 0 ? 'Free' : `₦${parseFloat(event.price).toLocaleString()}`;
    const date = new Date(event.event_date).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
    const time = event.event_time ? event.event_time.substring(0, 5) : '--:--';
    
    // Get client name for sharing
    const user = storage.get('client_user') || storage.get('user') || {};
    const clientNameSlug = (user.name || '').toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-');
    const shareLink = `${window.location.origin}/public/pages/event-details.html?event=${event.tag}&client=${clientNameSlug}`;

    const modalContent = `
        <div id="eventPreviewModal" class="modal-backdrop active" role="dialog" aria-modal="true" aria-hidden="false" style="background: rgba(0,0,0,0.6); backdrop-filter: blur(6px);">
            <div class="modal-content" style="max-width: 800px; padding: 0; border-radius: 20px; overflow: hidden; transform: translateY(20px); transition: all 0.3s ease;">
                <div class="event-preview">
                    <!-- Close Button -->
                    <button onclick="closeEventPreviewModal()" style="position: absolute; top: 1.5rem; right: 1.5rem; background: rgba(255,255,255,0.2); border: none; width: 40px; height: 40px; border-radius: 50%; color: white; font-size: 1.5rem; cursor: pointer; z-index: 10; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(4px);">&times;</button>
                    
                    <div style="height: 300px; overflow: hidden; position: relative;">
                        <img src="${eventImage.startsWith('http') ? eventImage : (eventImage.startsWith('/') ? '../..' + eventImage : '../../' + eventImage)}" style="width: 100%; height: 100%; object-fit: cover;" alt="Event">
                        <div style="position: absolute; top: 1.5rem; left: 1.5rem; background: ${getStatusBadgeColor(status.toLowerCase())}; color: white; padding: 0.6rem 1.25rem; border-radius: 30px; font-weight: 700; font-size: 0.8rem; text-transform: uppercase; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
                            ${status}
                        </div>
                    </div>
                    
                    <div style="padding: 2.5rem; background: white;">
                        <div style="margin-bottom: 2.5rem;">
                            <h1 style="font-size: 2.25rem; font-weight: 800; color: #111827; line-height: 1.2; margin-bottom: 0.5rem;">${event.event_name}</h1>
                            <p style="color: #6b7280; font-size: 1.1rem;">Organized by ${user.name || 'Eventra'}</p>
                        </div>

                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 1.5rem; margin-bottom: 2.5rem;">
                            <div style="display: flex; align-items: center; gap: 0.85rem;">
                                <div style="width: 48px; height: 48px; background: #eef2ff; border-radius: 14px; display: flex; align-items: center; justify-content: center; font-size: 1.35rem;">📅</div>
                                <div>
                                    <div style="font-size: 0.75rem; color: #6b7280; font-weight: 700; text-transform: uppercase; letter-spacing: 0.025em; margin-bottom: 2px;">Date</div>
                                    <div style="font-weight: 700; color: #1f2937;">${date}</div>
                                </div>
                            </div>
                            <div style="display: flex; align-items: center; gap: 0.85rem;">
                                <div style="width: 48px; height: 48px; background: #fff7ed; border-radius: 14px; display: flex; align-items: center; justify-content: center; font-size: 1.35rem;">🕒</div>
                                <div>
                                    <div style="font-size: 0.75rem; color: #6b7280; font-weight: 700; text-transform: uppercase; letter-spacing: 0.025em; margin-bottom: 2px;">Time</div>
                                    <div style="font-weight: 700; color: #1f2937;">${time}</div>
                                </div>
                            </div>
                            <div style="display: flex; align-items: center; gap: 0.85rem;">
                                <div style="width: 48px; height: 48px; background: #f0fdf4; border-radius: 14px; display: flex; align-items: center; justify-content: center; font-size: 1.35rem;">💰</div>
                                <div>
                                    <div style="font-size: 0.75rem; color: #6b7280; font-weight: 700; text-transform: uppercase; letter-spacing: 0.025em; margin-bottom: 2px;">Price</div>
                                    <div style="font-weight: 700; color: #1f2937;">${price}</div>
                                </div>
                            </div>
                            <div style="display: flex; align-items: center; gap: 0.85rem;">
                                <div style="width: 48px; height: 48px; background: #fdf2f8; border-radius: 14px; display: flex; align-items: center; justify-content: center; font-size: 1.35rem;">📂</div>
                                <div>
                                    <div style="font-size: 0.75rem; color: #6b7280; font-weight: 700; text-transform: uppercase; letter-spacing: 0.025em; margin-bottom: 2px;">Category</div>
                                    <div style="font-weight: 700; color: #1f2937;">${event.category || event.event_type || 'General'}</div>
                                </div>
                            </div>
                        </div>

                        <div style="margin-bottom: 2.5rem;">
                            <label style="display: block; font-size: 0.9rem; color: #111827; margin-bottom: 1rem; text-transform: uppercase; font-weight: 800; letter-spacing: 0.05em;">📍 Venue & Location</label>
                            <div style="background: #f9fafb; padding: 1.25rem; border-radius: 16px; border: 1px solid #e5e7eb; color: #4b5563; font-weight: 500; line-height: 1.5;">
                                ${event.address || 'No address provided'}
                                ${event.state ? `<br><span style="color: #111827; font-weight: 700;">${event.state}</span>` : ''}
                            </div>
                        </div>

                        <div style="margin-bottom: 2.5rem;">
                            <label style="display: block; font-size: 0.9rem; color: #111827; margin-bottom: 1rem; text-transform: uppercase; font-weight: 800; letter-spacing: 0.05em;">📝 Event Description</label>
                            <div style="color: #4b5563; line-height: 1.7; white-space: pre-wrap; background: #f9fafb; padding: 1.25rem; border-radius: 16px; border: 1px solid #e5e7eb; font-size: 1.05rem;">
                                ${event.description || 'No description available'}
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
                                <span style="font-size: 1.1rem; color: #111827; font-weight: 700;">${event.attendee_count || 0} people attending</span>
                            </div>
                        </div>
                        
                        <div style="margin-top: 3rem; padding-top: 2.5rem; border-top: 2px solid #f3f4f6;">
                            <div style="margin-bottom: 1.5rem;">
                                <label style="display: block; font-size: 0.9rem; color: #111827; margin-bottom: 1rem; text-transform: uppercase; font-weight: 800; letter-spacing: 0.05em;">🔗 Events Tag</label>
                                <div style="display: flex; gap: 0.75rem; align-items: center;">
                                    <code style="background: #f3f4f6; padding: 0.85rem 1.25rem; border-radius: 12px; border: 1px solid #e5e7eb; font-family: 'JetBrains Mono', monospace; font-size: 1rem; flex: 1; color: #111827; font-weight: 700;">${event.tag}</code>
                                    <button onclick="navigator.clipboard.writeText('${event.tag}').then(() => showNotification('Tag copied!', 'success'))" style="background: white; border: 1px solid #d1d5db; width: 48px; height: 48px; border-radius: 12px; cursor: pointer; transition: all 0.2s; font-size: 1.25rem; display: flex; align-items: center; justify-content: center;" title="Copy Tag">📋</button>
                                </div>
                            </div>
                            <div style="margin-bottom: 2.5rem;">
                                <label style="display: block; font-size: 0.9rem; color: #111827; margin-bottom: 1rem; text-transform: uppercase; font-weight: 800; letter-spacing: 0.05em;">🚀 Shareable Link</label>
                                <div style="display: flex; gap: 0.75rem; align-items: center;">
                                    <input type="text" readonly value="${shareLink}" 
                                           style="background: #f3f4f6; padding: 0.85rem 1.25rem; border-radius: 12px; border: 1px solid #e5e7eb; font-family: inherit; font-size: 1rem; flex: 1; color: #111827; font-weight: 600;">
                                    <button onclick="navigator.clipboard.writeText('${shareLink}').then(() => showNotification('Link copied!', 'success'))" style="background: #4F46E5; color: white; border: none; padding: 0.85rem 1.75rem; border-radius: 12px; cursor: pointer; transition: all 0.2s; font-size: 1rem; font-weight: 700; box-shadow: 0 4px 12px rgba(79, 70, 229, 0.25);">Copy Link</button>
                                </div>
                            </div>

                            <div style="display: flex; gap: 1rem;">
                                <button onclick="editEvent(${event.id})" class="btn" style="flex: 1; background: white; border: 2px solid #e5e7eb; color: #374151; padding: 1.1rem; border-radius: 14px; font-weight: 700; cursor: pointer; transition: all 0.2s; font-size: 1rem;">
                                    ✏️ Edit Event
                                </button>
                                ${status.toLowerCase() !== 'published' ? `
                                    <button onclick="publishEvent(${event.id})" class="btn" style="flex: 2; background: #10b981; color: white; border: none; padding: 1.1rem; border-radius: 14px; font-weight: 700; cursor: pointer; transition: all 0.2s; font-size: 1rem; box-shadow: 0 4px 12px rgba(16, 185, 129, 0.2);">
                                        ✓ Publish Now
                                    </button>
                                ` : `
                                    <button onclick="window.open('${shareLink}', '_blank')" class="btn" style="flex: 2; background: #4f46e5; color: white; border: none; padding: 1.1rem; border-radius: 14px; font-weight: 700; cursor: pointer; transition: all 0.2s; font-size: 1rem; box-shadow: 0 4px 12px rgba(79, 70, 229, 0.2);">
                                        👁️ View Public Page
                                    </button>
                                `}
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
        }).catch(err => console.log('Error sharing:', err));
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
        'Niger', 'Ogun', 'Ondo', 'Osun', 'Oyo', 'Plateau', 'Rivers', 'Sokoto', 'Taraba',
        'Yobe', 'Zamfara'
    ];
    if (includeGlobal) {
        states.unshift('All States');
    }
    return states;
}

function getStatusBadgeColor(status) {
    const colors = {
        'published': '#10b981',
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
        'featured': '#8b5cf6',
        'nearby': '#10b981',
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
    const result = await Swal.fire({
        title: 'Publish Event?',
        text: 'Are you sure you want to publish this event? It will be visible to all users on the platform.',
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#10b981',
        cancelButtonColor: '#9ca3af',
        confirmButtonText: 'Yes, Publish',
        cancelButtonText: 'Wait'
    });

    if (!result.isConfirmed) return;

    try {
        const response = await apiFetch('../../api/events/publish-event.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ event_id: eventId })
        });

        const result = await response.json();

        if (result.success) {
            showNotification('Event published successfully!', 'success');
            closeEventActionModal();
            // Trigger dashboard stat update if on dashboard
            if (window.loadDashboardStats) {
                const user = storage.get('client_user') || storage.get('user');
                window.loadDashboardStats(user ? user.id : null);
            }
            
            // Reload page to reflect changes
            setTimeout(() => window.location.reload(), 1000);
        } else {
            showNotification('Failed to publish event: ' + result.message, 'error');
        }
    } catch (error) {
        console.error('Error publishing event:', error);
        showNotification('An error occurred while publishing event', 'error');
    }
}

// Edit Event Modal
function showEditEventModal(event) {
    const modalHTML = `
        <div id="editEventModal" class="modal-backdrop active" role="dialog" aria-modal="true" aria-hidden="false">
            <div class="modal-content" style="max-width: 800px; max-height: 90vh; overflow-y: auto;">
                <div class="modal-header">
                    <h2>Edit Event</h2>
                    <button class="modal-close" onclick="closeEditEventModal()">×</button>
                </div>
                <div class="modal-body">
                    <form id="editEventForm" enctype="multipart/form-data">
                        <input type="hidden" name="event_id" value="${event.id}">
                        
                        <!-- Event Image -->
                        <div style="margin-bottom: 2rem;">
                            <label style="display: block; font-weight: 600; margin-bottom: 0.5rem;">Event Image</label>
                            <div style="position: relative;">
                                <img id="editEventImagePreview" 
                                     src="${event.image_path ? (event.image_path.startsWith('/') ? '../..' + event.image_path : '../../' + event.image_path) : ''}" 
                                     style="width: 100%; height: 250px; object-fit: cover; border-radius: 12px; border: 2px dashed #d1d5db;">
                                <label for="editEventImageInput" style="position: absolute; bottom: 1rem; right: 1rem; background: var(--card-blue); color: white; padding: 0.75rem 1.5rem; border-radius: 8px; cursor: pointer; font-weight: 600; box-shadow: 0 4px 12px rgba(0,0,0,0.2);">
                                    📷 Change Image
                                </label>
                                <input type="file" id="editEventImageInput" name="event_image" accept="image/*" style="display: none;" onchange="previewEditEventImage(event)">
                            </div>
                        </div>

                        <!-- Event Basic Info -->
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                            <div class="form-group" style="grid-column: 1 / -1;">
                                <label>Event Name *</label>
                                <input type="text" name="event_name" value="${event.event_name}" required>
                            </div>

                            <div class="form-group">
                                <label>Event Type/Category *</label>
                                <select name="event_type" required>
                                    <option value="Conference" ${event.event_type === 'Conference' ? 'selected' : ''}>Conference</option>
                                    <option value="Workshop" ${event.event_type === 'Workshop' ? 'selected' : ''}>Workshop</option>
                                    <option value="Seminar" ${event.event_type === 'Seminar' ? 'selected' : ''}>Seminar</option>
                                    <option value="Entertainment" ${event.event_type === 'Entertainment' ? 'selected' : ''}>Entertainment</option>
                                    <option value="Sports" ${event.event_type === 'Sports' ? 'selected' : ''}>Sports</option>
                                    <option value="Exhibition" ${event.event_type === 'Exhibition' ? 'selected' : ''}>Exhibition</option>
                                    <option value="Networking" ${event.event_type === 'Networking' ? 'selected' : ''}>Networking</option>
                                    <option value="Festival" ${event.event_type === 'Festival' ? 'selected' : ''}>Festival</option>
                                    <option value="Concert" ${event.event_type === 'Concert' ? 'selected' : ''}>Concert</option>
                                    <option value="Social" ${event.event_type === 'Social' ? 'selected' : ''}>Social</option>
                                    <option value="Personal" ${event.event_type === 'Personal' ? 'selected' : ''}>Personal</option>
                                    <option value="Community" ${event.event_type === 'Community' ? 'selected' : ''}>Community</option>
                                    <option value="Religious" ${event.event_type === 'Religious' ? 'selected' : ''}>Religious</option>
                                    <option value="Cultural" ${event.event_type === 'Cultural' ? 'selected' : ''}>Cultural</option>
                                    <option value="Educational" ${event.event_type === 'Educational' ? 'selected' : ''}>Educational</option>
                                    <option value="Other" ${event.event_type === 'Other' ? 'selected' : ''}>Other</option>
                                </select>
                            </div>

                            <div class="form-group">
                                <label>Priority Level</label>
                                <select name="priority" id="editPrioritySelect">
                                    <option value="nearby" ${event.priority === 'nearby' || event.priority === 'normal' ? 'selected' : ''}>📍 Nearby</option>
                                    <option value="hot" ${event.priority === 'hot' ? 'selected' : ''}>🔥 Hot</option>
                                    <option value="trending" ${event.priority === 'trending' ? 'selected' : ''}>📈 Trending</option>
                                    <option value="featured" ${event.priority === 'featured' ? 'selected' : ''}>⭐ Featured</option>
                                    <option value="upcoming" ${event.priority === 'upcoming' ? 'selected' : ''}>🕒 Upcoming</option>
                                </select>
                            </div>

                            <div class="form-group">
                                <label>Event Date *</label>
                                <input type="date" name="event_date" value="${event.event_date}" required>
                            </div>

                            <div class="form-group">
                                <label>Event Time *</label>
                                <input type="time" name="event_time" value="${event.event_time}" required>
                            </div>

                            <div class="form-group">
                                <label>Ticket Price (₦) *</label>
                                <input type="number" name="price" value="${event.price}" required min="0" step="0.01">
                            </div>

                            <div class="form-group">
                                <label>Status</label>
                                <select name="status">
                                    <option value="draft" ${event.status === 'draft' ? 'selected' : ''}>Draft</option>
                                    <option value="scheduled" ${event.status === 'scheduled' ? 'selected' : ''}>Scheduled</option>
                                    <option value="published" ${event.status === 'published' ? 'selected' : ''}>Published</option>
                                </select>
                            </div>
                        </div>

                        <!-- Description -->
                        <div class="form-group">
                            <label>Event Description *</label>
                            <textarea name="description" rows="4" required>${event.description}</textarea>
                        </div>

                        <!-- Location Details -->
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                            <div class="form-group">
                                <label>State *</label>
                                <select name="state" required>
                                    ${getNigerianStates(true).map(state => 
                                        `<option value="${state}" ${event.state === state ? 'selected' : ''}>${state}</option>`
                                    ).join('')}
                                </select>
                            </div>
                        </div>

                        <div class="form-group">
                            <label>Venue Address *</label>
                            <textarea name="address" rows="2" required>${event.address}</textarea>
                        </div>

                        <!-- Contact Information -->
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                            <div class="form-group">
                                <label>Primary Contact *</label>
                                <input type="tel" name="phone_contact_1" value="${event.phone_contact_1}" required>
                            </div>

                            <div class="form-group">
                                <label>Secondary Contact</label>
                                <input type="tel" name="phone_contact_2" value="${event.phone_contact_2 || ''}">
                            </div>
                        </div>

                        <!-- Submit Buttons -->
                        <div style="display: flex; gap: 1rem; margin-top: 2rem;">
                            <button type="submit" class="btn btn-primary" style="flex: 1;">
                                Update Event
                            </button>
                            <button type="button" class="btn btn-secondary" onclick="closeEditEventModal()">
                                Cancel
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

    // Add form submit handler
    document.getElementById('editEventForm').addEventListener('submit', handleEventUpdate);

    // Logic for visibility binding removed as requested
}

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
    
    // Show loading state
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'Updating...';
    submitBtn.disabled = true;
    
    try {
        const response = await apiFetch('../../api/events/update-event.php', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (result.success) {
            showNotification('Event updated successfully!', 'success');
            closeEditEventModal();
            setTimeout(() => window.location.reload(), 1000);
        } else {
            showNotification('Failed to update event: ' + result.message, 'error');
            submitBtn.textContent = originalText;
            submitBtn.disabled = false;
        }
    } catch (error) {
        console.error('Error updating event:', error);
        showNotification('An error occurred while updating event', 'error');
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
    }
}

// Ticket Preview Modal
function showTicketPreviewModal(ticket) {
    const modalContent = `
        <div id="ticketPreviewModal" class="modal-backdrop active" role="dialog" aria-modal="true" aria-hidden="false">
            <div class="modal-content" style="max-width: 600px;">
                <div class="modal-header">
                    <h2>Ticket Details</h2>
                    <button class="modal-close" onclick="closeTicketPreviewModal()">×</button>
                </div>
                <div class="modal-body" style="padding: 0;">
                    <!-- User Profile Image for Ticket Preview -->
                    <div style="width: 100%; height: 200px; overflow: hidden; border-radius: 12px 12px 0 0;">
                        <img src="${(storage.get('client_user') || storage.get('user') || {}).profile_pic || 'https://ui-avatars.com/api/?name=' + encodeURIComponent((storage.get('client_user') || storage.get('user') || {}).name || 'User')}" 
                             style="width: 100%; height: 100%; object-fit: cover;">
                    </div>
                    <div style="display: grid; gap: 1.5rem; padding: 1.5rem;">
                        <div>
                            <div style="font-size: 0.85rem; color: #666; margin-bottom: 0.25rem;">🎫 Ticket ID</div>
                            <div style="font-weight: 600;">${ticket.id}</div>
                        </div>
                        <div>
                            <div style="font-size: 0.85rem; color: #666; margin-bottom: 0.25rem;">📅 Event Name</div>
                            <div style="font-weight: 600;">${ticket.event_name || 'N/A'}</div>
                        </div>
                        <div>
                            <div style="font-size: 0.85rem; color: #666; margin-bottom: 0.25rem;">👤 Buyer</div>
                            <div style="font-weight: 600;">${ticket.buyer_name || 'N/A'}</div>
                        </div>
                        <div>
                            <div style="font-size: 0.85rem; color: #666; margin-bottom: 0.25rem;">💰 Price</div>
                            <div style="font-weight: 600;">${parseFloat(ticket.price || 0) === 0 ? 'Free' : '₦' + parseFloat(ticket.price || 0).toLocaleString()}</div>
                        </div>
                        <div>
                            <div style="font-size: 0.85rem; color: #666; margin-bottom: 0.25rem;">📆 Purchase Date</div>
                            <div style="font-weight: 600;">${ticket.purchase_date || 'N/A'}</div>
                        </div>
                        <div>
                            <div style="font-size: 0.85rem; color: #666; margin-bottom: 0.25rem;">📊 Status</div>
                            <div style="font-weight: 600; color: ${ticket.status === 'confirmed' ? '#10b981' : '#ef4444'};">
                                ${ticket.status ? ticket.status.toUpperCase() : 'N/A'}
                            </div>
                        </div>
                    </div>
                    <div style="margin-top: 2rem;">
                        <button onclick="closeTicketPreviewModal()" class="btn btn-secondary" style="width: 100%;">
                            Close
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

    const existing = document.getElementById('ticketPreviewModal');
    if (existing) existing.remove();

    document.body.insertAdjacentHTML('beforeend', modalContent);
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
            <div class="modal-content" style="max-width: 800px; border-radius: 16px; overflow: hidden; padding: 0;">
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
                                <div style="font-weight: 700; padding: 4px 10px; border-radius: 20px; font-size: 0.75rem; display: inline-block; ${(user.status === 'active' || user.status === 1 || user.status === '1') ? 'background: #d1fae5; color: #10b981;' : 'background: #fee2e2; color: #ef4444;'}">
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
window.showTicketPreviewModal = showTicketPreviewModal;
window.closeTicketPreviewModal = closeTicketPreviewModal;
window.showUserPreviewModal = showUserPreviewModal;
window.closeUserPreviewModal = closeUserPreviewModal;
