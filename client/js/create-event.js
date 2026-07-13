function showCreateEventModal(eventToEdit = null) {
    const user = storage.getUser();
    if (!user) return;

    if (!user.verification_status || user.verification_status !== 'verified') {
        Swal.fire({
            title: 'Account Not Approved',
            html: user.verification_status === 'rejected'
                ? '<strong>Your account was rejected.</strong><br>Please update your profile and resubmit for administrator review before creating events.'
                : '<strong>Your account is pending approval.</strong><br>You cannot create events until an administrator approves your profile.',
            icon: 'warning',
            confirmButtonColor: '#722f37',
            confirmButtonText: 'Update My Profile',
            showCancelButton: true,
            cancelButtonText: 'Close',
            cancelButtonColor: '#9ca3af'
        }).then((result) => {
            if (result.isConfirmed && typeof window.showProfileEditModal === 'function') {
                window.showProfileEditModal();
            }
        });
        return;
    }

    const modalHTML = `
        <link rel="stylesheet" href="../../public/css/time-picker.css">
        <div id="createEventModal" class="modal-backdrop active" role="dialog" aria-modal="true" aria-hidden="false" 
             style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.6); display: flex; justify-content: center; align-items: center; z-index: 10000; backdrop-filter: blur(8px);">
            <div class="modal-content" style="
                width: 95%;
                max-width: 1100px;
                max-height: 92vh;
                overflow-y: auto;
                background: linear-gradient(135deg, #f5f3ff 0%, #fdf4ff 50%, ##1f2937 50%);
                border-radius: 10px;
                box-shadow: 0 25px 50px rgba(0, 0, 0, 0.15);
                position: relative;
                animation: slideIn 0.3s ease-out;">
                
                <!-- Decorative Background Pattern -->
                <div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; overflow: hidden; border-radius: 10px; opacity: 0.4; pointer-events: none;">
                    <div style="position: absolute; top: -50px; right: -50px; width: 200px; height: 200px; background: radial-gradient(circle, rgba(2, 36, 41, 0.88), transparent); border-radius: 20%;"></div>
                    <div style="position: absolute; bottom: -30px; left: -30px; width: 150px; height: 150px; background: radial-gradient(circle, rgba(8, 88, 102, 0.3), transparent); border-radius: 20%;"></div>
                    <div style="position: absolute; top: 50%; left: 50%; width: 300px; height: 300px; background: radial-gradient(circle, rgba(8, 27, 68, 0.2), transparent); border-radius: 20%; transform: translate(-50%, -50%);"></div>
                </div>
                
                <div style="position: relative; z-index: 1;">
                    <div class="modal-header" style="padding: 2.5rem 3rem 1.5rem; border-bottom: 1px solid rgba(9, 29, 143, 0.1);">
                        <div style="text-align: center;">
                            <div style="display: inline-block; background: linear-gradient(135deg, #09287eff, #722f37); -webkit-background-clip: text; -webkit-text-fill-color: transparent; font-size: 1rem; font-weight: 700; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 0.5rem;">EVENTRA</div>
                            <h2 style="font-size: 2rem; font-weight: 800; color: #1f2937; margin: 0;">Create Event</h2>
                        </div>
                        <button class="modal-close" onclick="closeCreateEventModal()" 
                                style="position: absolute; top: 1.5rem; right: 1.5rem; background: white; border: none; width: 40px; height: 40px; border-radius: 50%; font-size: 1.5rem; cursor: pointer; box-shadow: 0 4px 12px rgba(0,0,0,0.1); transition: all 0.2s;">×</button>
                    </div>
                    
                    <div class="modal-body" style="padding: 2.5rem 3rem 3rem;">
                        <form id="createEventForm" enctype="multipart/form-data">
                            <!-- Event Image Upload -->
                            <div style="margin-bottom: 3rem;">
                                <div style="position: relative; transition: all 0.3s ease;">
                                    <img id="eventImagePreview" 
                                         src="" 
                                         style="width: 100%; height: 280px; object-fit: cover; border-radius: 20px; border: 3px solid rgba(255, 255, 255, 0.8); box-shadow: 0 10px 30px rgba(0,0,0,0.1);">
                                    <label for="eventImageInput" style="position: absolute; bottom: 1.5rem; right: 1.5rem; background: rgba(255, 255, 255, 0.95); color: #722f37; padding: 0.875rem 1.75rem; border-radius: 50px; cursor: pointer; font-weight: 700; box-shadow: 0 8px 20px rgba(139, 92, 246, 0.3); backdrop-filter: blur(10px); transition: all 0.3s; border: 2px solid rgba(139, 92, 246, 0.2);">
                                        📷 Upload Banner <span style="color: #ef4444">*</span>
                                    </label>
                                    <input type="file" id="eventImageInput" name="event_image" accept="image/*" required style="display: none;" onchange="previewEventImage(event)">
                                </div>
                            </div>

                            <div style="display: grid; gap: 2.5rem;">
                                <!-- Row 1: First & Last Name -->
                                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem;">
                                    <div class="form-group">
                                        <label style="display: block; font-size: 0.875rem; font-weight: 600; color: #6b7280; margin-bottom: 0.5rem; text-transform: uppercase; letter-spacing: 0.5px;">Event Name <span style="color: #ef4444">*</span></label>
                                        <input type="text" name="event_name" id="eventNameInput" required placeholder="Enter event name" oninput="generateEventTagAndLink()" 
                                               style="width: 100%; padding: 1rem 1.25rem; border: 2px solid #e5e7eb; border-radius: 12px; font-size: 1rem; background: white; transition: all 0.3s; box-shadow: 0 2px 8px rgba(0,0,0,0.04);">
                                    </div>

                                    <div class="form-group">
                                        <label style="display: block; font-size: 0.875rem; font-weight: 600; color: #6b7280; margin-bottom: 0.5rem; text-transform: uppercase; letter-spacing: 0.5px;">Category <span style="color: #ef4444">*</span></label>
                                        <select name="event_type" required style="width: 100%; padding: 1rem 1.25rem; border: 2px solid #e5e7eb; border-radius: 12px; font-size: 1rem; background: white; transition: all 0.3s; box-shadow: 0 2px 8px rgba(0,0,0,0.04);">
                                            <option value="">Select Category</option>
                                            <option value="Conference">Conference</option>
                                            <option value="Workshop">Workshop</option>
                                            <option value="Seminar">Seminar</option>
                                            <option value="Entertainment">Entertainment (Music, Film, Comedy, etc)</option>
                                            <option value="Sport & Fitness">Sports & Fitness</option>
                                            <option value="Exhibition">Exhibition</option>
                                            <option value="Networking">Networking</option>
                                            <option value="Festival">Festival</option>
                                            <option value="Concert">Concert</option>
                                            <option value="Business">Business</option>
                                            <option value="Education">Education</option>
                                            <option value="Social">Social</option>
                                            <option value="Personal">Personal (Wedding, Anniversary, etc.)</option>
                                            <option value="Community">Community</option> 
                                            <option value="Religion">Religion</option>
                                            <option value="Cultural">Cultural</option>
                                            <option value="Technology">Technology</option>
                                            <option value="Art">Art</option>
                                            <option value="Health">Health</option>
                                            <option value="Food">Food</option>
                                            <option value="Agriculture">Agriculture</option>
                                            <option value="Tourism">Tourism</option>
                                            <option value="Fashion">Fashion</option>
                                            <option value="Real Estate">Real Estate</option>
                                            <option value="Awards">Awards</option>
                                            <option value="Charity">Charity</option>
                                            <option value="Finance">Finance</option>
                                            <option value="Gaming">Gaming</option>
                                            <option value="Political">Political</option>
                                            <option value="Other">Other</option>
                                        </select>
                                    </div>
                                </div>

                                <!-- Email Address (Full Width) -->
                                <div class="form-group">
                                    <label style="display: block; font-size: 0.875rem; font-weight: 600; color: #6b7280; margin-bottom: 0.5rem; text-transform: uppercase; letter-spacing: 0.5px;">Description <span style="color: #ef4444">*</span></label>
                                    <textarea name="description" rows="4" required placeholder="Describe what attendees can expect..." 
                                              style="width: 100%; padding: 1rem 1.25rem; border: 2px solid #e5e7eb; border-radius: 12px; resize: vertical; font-size: 1rem; background: white; transition: all 0.3s; box-shadow: 0 2px 8px rgba(0,0,0,0.04); font-family: inherit;"></textarea>
                                </div>

                                <!-- Address Line 1 -->
                                <div class="form-group">
                                    <label style="display: block; font-size: 0.875rem; font-weight: 600; color: #6b7280; margin-bottom: 0.5rem; text-transform: uppercase; letter-spacing: 0.5px;">Full Venue Address <span style="color: #ef4444">*</span></label>
                                    <textarea name="address" rows="2" required placeholder="Street address, landmarks..." 
                                              style="width: 100%; padding: 1rem 1.25rem; border: 2px solid #e5e7eb; border-radius: 12px; font-size: 1rem; background: white; transition: all 0.3s; box-shadow: 0 2px 8px rgba(0,0,0,0.04); font-family: inherit;"></textarea>
                                </div>

                                <div style="display: grid; grid-template-columns: 1fr; gap: 1.5rem;">
                                    <div class="form-group" style="position: relative;">
                                        <label style="display: block; font-size: 0.875rem; font-weight: 600; color: #6b7280; margin-bottom: 0.75rem; text-transform: uppercase; letter-spacing: 0.5px;">Google Calendar Scheduling</label>
                                        <div style="background: linear-gradient(135deg, rgba(114, 47, 55, 0.08), rgba(59, 130, 246, 0.08)); border: 1px solid rgba(114, 47, 55, 0.12); border-radius: 16px; padding: 1.25rem;">
                                            <div style="font-weight: 700; color: #1f2937; margin-bottom: 0.4rem;">Schedule in Google Calendar and keep the event in Draft until you publish it from the app.</div>
                                            <div style="font-size: 0.95rem; color: #4b5563; line-height: 1.6;">The calendar entry will include a clickable “View App Dashboard” link so you can return to Eventra and publish it when ready.</div>
                                        </div>
                                        <input type="hidden" name="status" value="draft">
                                        <input type="hidden" name="event_date" id="eventDateInput" value="">
                                        <input type="hidden" name="event_time" id="eventTimeInput" value="">
                                        <input type="hidden" name="event_start" id="eventStartInput" value="">
                                        <input type="hidden" name="event_end" id="eventEndInput" value="">
                                    </div>

                                    <div class="form-group" style="position: relative;">
                                        <label style="display: block; font-size: 0.875rem; font-weight: 600; color: #6b7280; margin-bottom: 0.5rem; text-transform: uppercase; letter-spacing: 0.5px;">State(s) <span style="color: #ef4444">*</span></label>
                                        <div id="stateSelectContainer" class="state-select-container">
                                            <div class="state-select-display" id="stateSelectDisplay" onclick="toggleStateSelect()" style="padding: 1rem 1.25rem; border: 1px solid #e2e8f0; border-radius: 12px; font-weight: 600; cursor: pointer; display: flex; justify-content: space-between; align-items: center; background: white; min-width: 0;">
                                                <span id="selectedStatesText" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; min-width: 0;">Select State(s)</span>
                                            </div>
                                            <div id="stateSelectDropdown" class="state-select-dropdown">
                                                <div style="display: grid; gap: 4px;">
                                                    ${getNigerianStates(true).map(state => `
                                                        <label class="state-option-label">
                                                            <input type="checkbox" class="state-checkbox state-checkbox-custom" value="${state}" onchange="updateSelectedStates()">
                                                            <span class="state-option-text">${state}</span>
                                                        </label>
                                                    `).join('')}
                                                </div>
                                            </div>
                                            <input type="hidden" name="state" id="eventStateInput" required>
                                        </div>
                                    </div>
                                </div>

                                <!-- Primary Contact - Full width -->
                                <div class="form-group">
                                    <label style="display: block; font-size: 0.875rem; font-weight: 600; color: #6b7280; margin-bottom: 0.5rem; text-transform: uppercase; letter-spacing: 0.5px;">Primary Contact <span style="color: #ef4444">*</span></label>
                                    <input type="tel" name="phone_contact_1" required placeholder="+234..." 
                                           style="width: 100%; padding: 1rem 1.25rem; border: 2px solid #e5e7eb; border-radius: 12px; font-size: 1rem; background: white; transition: all 0.3s; box-shadow: 0 2px 8px rgba(0,0,0,0.04);">
                                </div>

                                <!-- Secondary Contact - Full width -->
                                <div class="form-group">
                                    <label style="display: block; font-size: 0.875rem; font-weight: 600; color: #6b7280; margin-bottom: 0.5rem; text-transform: uppercase; letter-spacing: 0.5px;">Secondary Contact</label>
                                    <input type="tel" name="phone_contact_2" placeholder="+234... (optional)" 
                                           style="width: 100%; padding: 1rem 1.25rem; border: 2px solid #e5e7eb; border-radius: 12px; font-size: 1rem; background: white; transition: all 0.3s; box-shadow: 0 2px 8px rgba(0,0,0,0.04);">
                                </div>

                                <!-- FREE checkbox + Visibility - Two column row -->
                                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem;">
                                    <div class="form-group">
                                        <label style="display: block; font-size: 0.875rem; font-weight: 600; color: #6b7280; margin-bottom: 0.5rem; text-transform: uppercase; letter-spacing: 0.5px;">Ticket Pricing</label>
                                        <label style="display: flex; align-items: center; gap: 0.75rem; cursor: pointer; user-select: none; font-weight: 600; color: #475569; background: white; padding: 1rem 1.25rem; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); border: 2px solid #e5e7eb; height: 56px;">
                                            <input type="checkbox" id="freeEventCheckbox" name="is_free" value="1" class="state-checkbox-custom"> FREE EVENT
                                        </label>
                                    </div>
                                </div>

                                <!-- Max Capacity (shown only when FREE is checked) -->
                                <div class="form-group" id="maxCapacityGroup" style="display: none;">
                                    <label style="display: block; font-size: 0.875rem; font-weight: 600; color: #6b7280; margin-bottom: 0.5rem; text-transform: uppercase; letter-spacing: 0.5px;">Max Capacity <span style="color: #ef4444">*</span></label>
                                    <input type="number" name="max_capacity" id="maxCapacityInput" placeholder="Total tickets available" min="1" 
                                           style="width: 100%; padding: 1rem 1.25rem; border: 2px solid #e5e7eb; border-radius: 12px; font-size: 1rem; background: white; transition: all 0.3s; box-shadow: 0 2px 8px rgba(0,0,0,0.04);">
                                </div>

                                <!-- Ticket Type Configuration -->
                                <div id="ticketTypeConfigSection" style="background: white; padding: 1.5rem; border-radius: 12px; border: 2px solid #e5e7eb; margin-bottom: 1.5rem;">
                                    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.75rem; margin-bottom: 1.5rem;">
                                        <label style="display: flex; flex-direction: column; align-items: center; gap: 0.5rem; cursor: pointer; padding: 0.75rem; border: 2px solid #e5e7eb; border-radius: 10px; transition: all 0.2s;" class="ticket-type-label">
                                            <input type="checkbox" name="ticket_type_mode[]" value="regular" class="ticket-type-checkbox" style="accent-color: #2563eb;">
                                            <span style="font-weight: 700; font-size: 0.85rem;">Regular</span>
                                        </label>
                                        <label style="display: flex; flex-direction: column; align-items: center; gap: 0.5rem; cursor: pointer; padding: 0.75rem; border: 2px solid #e5e7eb; border-radius: 10px; transition: all 0.2s;" class="ticket-type-label">
                                            <input type="checkbox" name="ticket_type_mode[]" value="vip" class="ticket-type-checkbox" style="accent-color: #2563eb;">
                                            <span style="font-weight: 700; font-size: 0.85rem;">VIP</span>
                                        </label>
                                        <label style="display: flex; flex-direction: column; align-items: center; gap: 0.5rem; cursor: pointer; padding: 0.75rem; border: 2px solid #e5e7eb; border-radius: 10px; transition: all 0.2s;" class="ticket-type-label">
                                            <input type="checkbox" name="ticket_type_mode[]" value="premium" class="ticket-type-checkbox" style="accent-color: #2563eb;">
                                            <span style="font-weight: 700; font-size: 0.85rem;">Premium</span>
                                        </label>
                                        <label style="display: flex; flex-direction: column; align-items: center; gap: 0.5rem; cursor: pointer; padding: 0.75rem; border: 2px solid #e5e7eb; border-radius: 10px; transition: all 0.2s;" class="ticket-type-label">
                                            <input type="checkbox" name="ticket_type_mode[]" value="all" class="ticket-type-checkbox" style="accent-color: #2563eb;">
                                            <span style="font-weight: 700; font-size: 0.85rem;">All</span>
                                        </label>
                                    </div>

                                    <!-- Conditional Price/Quantity Inputs -->
                                    <div id="regularConfig" class="ticket-price-section" style="display: none;">
                                        <label style="display: block; font-size: 0.75rem; font-weight: 700; color: #475569; margin-bottom: 0.5rem; text-transform: uppercase;">Regular Ticket Price (₦)</label>
                                        <input type="number" name="regular_price" id="regularPriceInput" placeholder="0.00" min="0" step="0.01" style="width: 100%; padding: 0.75rem 1rem; border: 2px solid #cbd5e1; border-radius: 10px; margin-bottom: 1rem;">
                                        <label style="display: block; font-size: 0.75rem; font-weight: 700; color: #475569; margin-bottom: 0.5rem; text-transform: uppercase;">Quantity</label>
                                        <input type="number" name="regular_quantity" placeholder="No limit" min="1" style="width: 100%; padding: 0.75rem 1rem; border: 2px solid #cbd5e1; border-radius: 10px;">
                                    </div>

                                    <div id="vipConfig" class="ticket-price-section" style="display: none;">
                                        <label style="display: block; font-size: 0.75rem; font-weight: 700; color: #475569; margin-bottom: 0.5rem; text-transform: uppercase;">VIP Ticket Price (₦)</label>
                                        <input type="number" name="vip_price" id="vipPriceInput" placeholder="0.00" min="0" step="0.01" style="width: 100%; padding: 0.75rem 1rem; border: 2px solid #cbd5e1; border-radius: 10px; margin-bottom: 1rem;">
                                        <label style="display: block; font-size: 0.75rem; font-weight: 700; color: #475569; margin-bottom: 0.5rem; text-transform: uppercase;">Quantity</label>
                                        <input type="number" name="vip_quantity" placeholder="No limit" min="1" style="width: 100%; padding: 0.75rem 1rem; border: 2px solid #cbd5e1; border-radius: 10px;">
                                    </div>

                                    <div id="premiumConfig" class="ticket-price-section" style="display: none;">
                                        <label style="display: block; font-size: 0.75rem; font-weight: 700; color: #475569; margin-bottom: 0.5rem; text-transform: uppercase;">Premium Ticket Price (₦)</label>
                                        <input type="number" name="premium_price" id="premiumPriceInput" placeholder="0.00" min="0" step="0.01" style="width: 100%; padding: 0.75rem 1rem; border: 2px solid #cbd5e1; border-radius: 10px; margin-bottom: 1rem;">
                                        <label style="display: block; font-size: 0.75rem; font-weight: 700; color: #475569; margin-bottom: 0.5rem; text-transform: uppercase;">Quantity</label>
                                        <input type="number" name="premium_quantity" placeholder="No limit" min="1" style="width: 100%; padding: 0.75rem 1rem; border: 2px solid #cbd5e1; border-radius: 10px;">
                                    </div>

                                    <div id="allConfig" class="ticket-price-section" style="display: block;">
                                        <label style="display: block; font-size: 0.75rem; font-weight: 700; color: #475569; margin-bottom: 0.5rem; text-transform: uppercase;">All Ticket Price (₦)</label>
                                        <input type="number" name="price" id="allPriceInput" placeholder="0.00" min="0" step="0.01" style="width: 100%; padding: 0.75rem 1rem; border: 2px solid #2563eb; border-radius: 10px; background: #f8fafc;">
                                        <p style="font-size: 0.75rem; color: #64748b; margin-top: 0.5rem;">One price for all ticket tiers (Regular, VIP, Premium).</p>
                                    </div>
                                </div>

                                <div class="form-group">
                                    <label style="display: block; font-size: 0.875rem; font-weight: 600; color: #6b7280; margin-bottom: 0.5rem; margin-top: 1.5rem; text-transform: uppercase; letter-spacing: 0.5px;">Visibility</label>
                                    <select id="eventVisibilitySelect" name="event_visibility"
                                            style="width: 100%; padding: 1rem 1.25rem; border: 2px solid #e5e7eb; border-radius: 12px; font-size: 1rem; font-weight: 600; background: white; color: #374151; box-shadow: 0 2px 8px rgba(0,0,0,0.04); cursor: pointer; height: 56px;">
                                        <option value="public">🌐 Public</option>
                                        <option value="private">🔒 Private</option>
                                    </select>
                                </div>

                                <!-- Auto-Generated Info -->
                                <div style="background: rgba(139, 92, 246, 0.05); padding: 2rem; border-radius: 16px; border: 2px solid rgba(139, 92, 246, 0.2);">
                                    <h4 style="margin: 0 0 1.25rem 0; font-weight: 800; color: #722f37; font-size: 1rem; text-transform: uppercase; letter-spacing: 1px;">🔗 Auto-Generated Links</h4>
                                    <div style="display: grid; gap: 1.25rem;">
                                        <div>
                                            <label style="font-size: 0.8rem; font-weight: 700; color: #722f37; margin-bottom: 0.5rem; display: block; text-transform: uppercase; letter-spacing: 0.5px;">Event Tag</label>
                                            <input type="text" id="eventTagField" name="tag" readonly placeholder="Enter event name first..." 
                                                   style="width: 100%; padding: 0.875rem 1.25rem; background: white; border: 2px solid rgba(139, 92, 246, 0.2); border-radius: 10px; font-family: 'Courier New', monospace; color: #722f37; font-weight: 600; font-size: 0.95rem;">
                                        </div>

                                        <div>
                                            <label style="font-size: 0.8rem; font-weight: 700; color: #722f37; margin-bottom: 0.5rem; display: block; text-transform: uppercase; letter-spacing: 0.5px;">Shareable Link</label>
                                            <input type="text" id="eventLinkField" name="external_link" readonly placeholder="Enter event name first..." 
                                                   style="width: 100%; padding: 0.875rem 1.25rem; background: white; border: 2px solid rgba(139, 92, 246, 0.2); border-radius: 10px; font-family: 'Courier New', monospace; color: #722f37; font-weight: 600; font-size: 0.85rem;">
                                        </div>
                                    </div>
                                </div>

                                <!-- Submit Buttons -->
                                <div style="display: flex; gap: 1.25rem; margin-top: 1rem;">
                                    <button type="submit" class="btn btn-primary" style="flex: 2; padding: 1.25rem; font-size: 1.125rem; font-weight: 700; justify-content: center; background: #722f37; border: none; border-radius: 14px; color: white; cursor: pointer; box-shadow: 0 10px 25px rgba(79, 70, 229, 0.3); transition: all 0.3s;">
                                        Schedule via Google Calendar
                                    </button>
                                    <button type="button" class="btn btn-secondary" onclick="closeCreateEventModal()" style="flex: 1; padding: 1.25rem; font-size: 1.125rem; justify-content: center; background: white; border: 2px solid #e5e7eb; border-radius: 14px; color: #6b7280; cursor: pointer; font-weight: 600; transition: all 0.3s;">
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </div>

        <style>
            @keyframes slideIn {
                from {
                    opacity: 0;
                    transform: translateY(30px) scale(0.95);
                }
                to {
                    opacity: 1;
                    transform: translateY(0) scale(1);
                }
            }

            #createEventModal input:focus,
            #createEventModal select:focus,
            #createEventModal textarea:focus {
                outline: none;
                border-color: #722f37 !important;
                box-shadow: 0 0 0 4px rgba(139, 92, 246, 0.2) !important;
            }

            #createEventModal input::placeholder,
            #createEventModal textarea::placeholder {
                color: #9ca3af;
            }

            #createEventModal .btn-primary:hover {
                transform: translateY(-2px);
                box-shadow: 0 15px 35px rgba(26, 50, 158, 0.4);
            }

            #createEventModal .btn-secondary:hover {
                background: #f9fafb;
                border-color: #d1d5db;
            }

            #createEventModal .modal-close:hover {
                transform: rotate(90deg);
                background: #fee2e2;
                color: #dc2626;
            }

            #createEventModal label[for="eventImageInput"]:hover {
                transform: translateY(-4px);
                box-shadow: 0 12px 30px rgba(24, 55, 122, 0.4);
                background: rgba(255, 255, 255, 1);
            }

            .state-option-label:hover {
                background: #f3f4f6;
            }
            .state-option-label:has(input:checked) {
                background: rgba(114, 47, 55, 0.05);
            }

            .material-datepicker {
                position: absolute; top: calc(100% + 5px); left: 0; display: none; background: #fff; width: 320px; border-radius: 16px; box-shadow: 0 10px 40px rgba(0,0,0,0.15); font-family: 'Inter', sans-serif; z-index: 99999; overflow: hidden;
            }
            .material-datepicker.active { display: block; animation: slideDown 0.2s ease-out; }
            .mdp-header { background: #008080; color: white; padding: 20px; }
            .mdp-year { font-size: 1rem; font-weight: 600; opacity: 0.8; margin-bottom: 5px; }
            .mdp-date { font-size: 1.8rem; font-weight: 700; line-height: 1.1; }
            .mdp-body { padding: 15px; background: white; }
            .mdp-month-nav { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; font-weight: 600; color: #374151; font-size: 1.1rem; }
            .mdp-nav-btn { background: none; border: none; font-size: 1.25rem; cursor: pointer; color: #6b7280; padding: 5px 10px; border-radius: 50%; transition: 0.2s; }
            .mdp-nav-btn:hover { background: #f3f4f6; color: #111827; }
            .mdp-days-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 5px; text-align: center; }
            .mdp-day-header { font-size: 0.75rem; font-weight: 600; color: #9ca3af; margin-bottom: 5px; text-transform: uppercase; }
            .mdp-day { width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; border-radius: 50%; cursor: pointer; font-size: 0.9rem; font-weight: 500; color: #374151; transition: 0.2s; margin: auto; }
            .mdp-day:hover:not(.disabled) { background: #f3f4f6; }
            .mdp-day.selected { background: #008080; color: white; box-shadow: 0 4px 12px rgba(0,128,128,0.3); }
            .mdp-day.disabled { color: #d1d5db; cursor: not-allowed; text-decoration: line-through; opacity: 0.5; }
            .mdp-footer { padding: 10px 20px 20px; display: flex; justify-content: flex-end; gap: 15px; background: white; }
            .mdp-btn { background: none; border: none; color: #008080; font-weight: 700; font-size: 0.9rem; cursor: pointer; transition: 0.2s; padding: 8px 16px; border-radius: 8px; text-transform: uppercase; }
            .mdp-btn:hover { background: rgba(0,128,128,0.08); }
            @keyframes slideDown { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
            .per-state-container { background: #f9fafc; padding: 1.25rem; border-radius: 12px; border: 1px solid #eaeef2; margin-top: 1rem; }
            .per-state-section { display: flex; flex-direction: column; gap: 1rem; }
            .per-state-header { display: flex; gap: 0.75rem; align-items: flex-start; }
            .per-state-title { font-size: 0.85rem; font-weight: 700; color: #111827; text-transform: uppercase; letter-spacing: 0.5px; }
            .per-state-desc { font-size: 0.8rem; color: #6b7280; margin-top: 0.15rem; }
            .per-state-toggle { display: flex; align-items: center; gap: 0.5rem; padding: 0.65rem 0.75rem; background: rgba(99,102,241,0.08); border-radius: 6px; border: 1px solid #eaeef2; font-size: 0.82rem; font-weight: 600; cursor: pointer; }
            .per-state-toggle input { accent-color: #6366f1; }
            .per-state-cards { display: flex; flex-direction: column; gap: 0.75rem; }
            .per-state-card { background: #fff; border: 1px solid #eaeef2; border-radius: 12px; padding: 1rem; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
            .per-state-card-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; }
            .per-state-badge { font-size: 0.82rem; font-weight: 700; color: #6366f1; background: rgba(99,102,241,0.1); padding: 0.2rem 0.6rem; border-radius: 6px; }
            .per-state-required { font-size: 0.65rem; font-weight: 700; color: #ef4444; text-transform: uppercase; }
            .per-state-address-input { width: 100%; padding: 0.75rem 1rem; border: 1px solid #eaeef2; border-radius: 6px; font-size: 0.9rem; font-family: inherit; resize: vertical; }
            .per-state-datetime { grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-top: 0.5rem; }
            .per-state-field { position: relative; }
            .per-state-field label, .per-state-field > span { display: block; font-size: 0.72rem; font-weight: 600; color: #6b7280; margin-bottom: 0.25rem; text-transform: uppercase; }
            .per-state-date-wrap { position: relative; }
            .per-state-date-display { width: 100%; padding: 0.65rem 1rem; border: 1px solid #eaeef2; border-radius: 6px; font-size: 0.85rem; background: #fff; cursor: pointer; box-sizing: border-box; }
            .per-state-date-wrap > span { position: absolute; right: 0.75rem; top: 50%; transform: translateY(-50%); color: #9ca3af; pointer-events: none; }
            .per-state-mdp { display: none; position: absolute; top: calc(100% + 4px); left: 0; z-index: 9999; background: #fff; border-radius: 12px; box-shadow: 0 10px 15px rgba(0,0,0,0.1); width: 280px; overflow: hidden; border: 1px solid #eaeef2; }
            .per-state-mdp.open { display: block; }
            .per-state-mdp-head { background: #6366f1; color: white; padding: 14px 16px; }
            .per-state-mdp-nav { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; font-weight: 600; padding: 0 12px; }
            .per-state-mdp-nav button { background: none; border: none; cursor: pointer; color: #6b7280; }
            .per-state-mdp-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 3px; text-align: center; font-size: 0.8rem; padding: 0 12px 12px; }
            .per-state-mdp-foot { display: flex; justify-content: flex-end; gap: 10px; padding: 8px 16px 14px; }
            .per-state-mdp-foot button { background: none; border: none; color: #6366f1; font-weight: 700; font-size: 0.85rem; cursor: pointer; }
            .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
        </style>
    `;

    // Remove existing modal if any
    const existing = document.getElementById('createEventModal');
    if (existing) existing.remove();

    // Add modal to body
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    const createEventForm = document.getElementById('createEventForm');

    // If editing, populate form and change title
    if (eventToEdit) {
        document.querySelector('#createEventModal h2').textContent = 'Edit Event';
        createEventForm.setAttribute('data-event-id', eventToEdit.id);

        // Basic fields
        document.getElementById('eventNameInput').value = (eventToEdit.event_name || '').replace(/\s*#\d+$/, '');
        createEventForm.querySelector('select[name="event_type"]').value = eventToEdit.event_type || '';
        createEventForm.querySelector('textarea[name="description"]').value = eventToEdit.description || '';
        createEventForm.querySelector('input[name="phone_contact_1"]').value = eventToEdit.phone_contact_1 || '';

        // Secondary contact
        const phone2Input = createEventForm.querySelector('input[name="phone_contact_2"]');
        if (phone2Input) phone2Input.value = eventToEdit.phone_contact_2 || '';

        // Visibility
        const visibilitySelect = document.getElementById('eventVisibilitySelect');
        if (visibilitySelect && eventToEdit.event_visibility) visibilitySelect.value = eventToEdit.event_visibility;

        // Status
        const statusSelect = createEventForm.querySelector('select[name="status"]');
        if (statusSelect && eventToEdit.status) statusSelect.value = eventToEdit.status;

        // Free event checkbox
        const freeCheckbox = document.getElementById('freeEventCheckbox');
        if (freeCheckbox) {
            const basePrice = parseFloat(eventToEdit.price) || 0;
            const isFreeEvent = basePrice === 0 && !eventToEdit.regular_price && !eventToEdit.vip_price && !eventToEdit.premium_price;
            freeCheckbox.checked = !!eventToEdit.is_free || isFreeEvent;
        }

        // Date & Time (global)
        document.getElementById('customDateDisplay').value = eventToEdit.event_date || '';
        createEventForm.querySelector('input[name="event_date"]').value = eventToEdit.event_date || '';

        if (eventToEdit.event_time) {
            document.getElementById('eventTimeInput').value = eventToEdit.event_time;
            const displaySpan = document.getElementById('eventTimeDisplay');
            if (displaySpan) {
                displaySpan.textContent = eventToEdit.event_time;
                displaySpan.style.color = '#1f2937'; // Active color
            }
        }

        // Image
        if (eventToEdit.image_path) {
            document.getElementById('eventImagePreview').src = (typeof getImageUrl === 'function')
                ? getImageUrl(eventToEdit.image_path)
                : (eventToEdit.image_path.startsWith('/') ? eventToEdit.image_path : '/' + eventToEdit.image_path);
            document.getElementById('eventImageInput').removeAttribute('required');
        }

        // Parse metadata to extract ticket data
        let metadata = {};
        if (eventToEdit.metadata) {
            try {
                metadata = typeof eventToEdit.metadata === 'string' ? JSON.parse(eventToEdit.metadata) : eventToEdit.metadata;
            } catch (e) { }
        }

        // Tickets & Prices
        if (metadata.ticket_type_mode) {
            const modes = metadata.ticket_type_mode.toLowerCase();
            document.querySelectorAll('.ticket-type-checkbox').forEach(cb => {
                if (modes.includes('all') && cb.value === 'all') cb.checked = true;
                if (modes.includes('regular') && cb.value === 'regular') cb.checked = true;
                if (modes.includes('vip') && cb.value === 'vip') cb.checked = true;
                if (modes.includes('premium') && cb.value === 'premium') cb.checked = true;
            });
            updateTicketTypeSections();
        }

        if (document.getElementById('regularPriceInput') && metadata.regular_price) document.getElementById('regularPriceInput').value = metadata.regular_price;
        if (document.getElementById('vipPriceInput') && metadata.vip_price) document.getElementById('vipPriceInput').value = metadata.vip_price;
        if (document.getElementById('premiumPriceInput') && metadata.premium_price) document.getElementById('premiumPriceInput').value = metadata.premium_price;
        if (document.getElementById('allPriceInput') && eventToEdit.price) document.getElementById('allPriceInput').value = eventToEdit.price;

        // Ticket quantities
        const regularQtyInput = createEventForm.querySelector('input[name="regular_quantity"]');
        if (regularQtyInput && metadata.regular_quantity) regularQtyInput.value = metadata.regular_quantity;
        const vipQtyInput = createEventForm.querySelector('input[name="vip_quantity"]');
        if (vipQtyInput && metadata.vip_quantity) vipQtyInput.value = metadata.vip_quantity;
        const premiumQtyInput = createEventForm.querySelector('input[name="premium_quantity"]');
        if (premiumQtyInput && metadata.premium_quantity) premiumQtyInput.value = metadata.premium_quantity;

        // Total Tickets
        if (eventToEdit.total_tickets) {
            createEventForm.querySelector('input[name="total_tickets"]').value = eventToEdit.total_tickets;
        }

        // Location / States
        if (eventToEdit.state) {
            const states = eventToEdit.state.split(',').map(s => s.trim());
            document.querySelectorAll('.state-checkbox').forEach(cb => {
                if (states.includes(cb.value)) cb.checked = true;
            });
            updateSelectedStates();

            // Per-state logic
            setTimeout(() => {
                const mainAddressTextarea = document.getElementById('mainAddressTextarea');
                if (states.length === 1) {
                    if (mainAddressTextarea) mainAddressTextarea.value = eventToEdit.address || '';
                } else if (states.length > 1 && eventToEdit.locations) {
                    let locs = [];
                    try {
                        locs = typeof eventToEdit.locations === 'string' ? JSON.parse(eventToEdit.locations) : eventToEdit.locations;
                    } catch (e) { }

                    let hasCustomDates = false;
                    locs.forEach(loc => {
                        const ta = document.querySelector(`textarea[data-state="${loc.state}"]`);
                        if (ta) ta.value = loc.address || '';

                        if (loc.date || loc.time) hasCustomDates = true;

                        if (loc.date) {
                            const di = document.querySelector(`input[data-type="date"][data-state="${loc.state}"]`);
                            if (di) di.value = loc.date;
                        }
                        if (loc.time) {
                            const ti = document.querySelector(`input[data-type="time"][data-state="${loc.state}"]`);
                            if (ti) ti.value = loc.time;
                        }
                    });

                    if (hasCustomDates) {
                        const customizeCb = document.getElementById('customizeDatesPerStateCheckbox');
                        if (customizeCb) {
                            customizeCb.checked = true;
                            togglePerStateDateTimeFields();
                        }
                    }
                }
            }, 100);
        }

        // Change Submit Button text
        const submitBtn = createEventForm.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.textContent = 'Save Changes';
    }


    // Set minimum date to today is handled by the new Material DatePicker JS component
    // Close date picker when clicking outside
    document.addEventListener('click', (e) => {
        const dp = document.getElementById('materialDatePicker');
        const display = document.getElementById('customDateDisplay');
        if (dp && dp.classList.contains('active')) {
            if (!dp.contains(e.target) && e.target !== display) {
                closeMaterialDatePicker();
            }
        }
    });

    // Add form submit handler
    createEventForm.addEventListener('submit', handleGoogleCalendarSchedule);

    // Inject the per-state address container below the main address textarea
    injectPerStateContainer();

    // Add persistence: save on input
    createEventForm.addEventListener('input', () => saveFormState('createEventForm'));
    createEventForm.addEventListener('change', () => saveFormState('createEventForm'));

    // Restore saved state
    restoreFormState('createEventForm');

    // Sync date display after restoration
    const restoredDate = document.getElementById('eventDateInput')?.value;
    if (restoredDate) {
        const dateObj = new Date(restoredDate + 'T00:00:00');
        if (!isNaN(dateObj.getTime())) {
            const displayOpts = { month: 'long', day: 'numeric', year: 'numeric' };
            document.getElementById('customDateDisplay').value = dateObj.toLocaleDateString('en-US', displayOpts);
            window.mdpSelectedDate = dateObj;
        }
    }

    // Sync time picker UI with restored value if it exists
    const restoredTime = document.getElementById('eventTimeInput')?.value;
    if (restoredTime && typeof setTimePickerValue === 'function') {
        setTimePickerValue('eventTimePickerContainer', restoredTime);
    }

    // Free Event Checkbox Handler
    const freeCheckbox = document.getElementById('freeEventCheckbox');
    const priceInput = document.getElementById('priceInput');
    const priceInputGroup = document.getElementById('priceInputGroup');
    const ticketConfig = document.getElementById('ticketTypeConfigSection');

    freeCheckbox.addEventListener('change', function () {
        if (this.checked) {
            // If free, hide ticket config and set hidden inputs to 0
            if (ticketConfig) ticketConfig.style.display = 'none';

            const regularPriceInput = document.getElementById('regularPriceInput');
            const vipPriceInput = document.getElementById('vipPriceInput');
            const premiumPriceInput = document.getElementById('premiumPriceInput');
            const allPriceInput = document.getElementById('allPriceInput');

            if (regularPriceInput) { regularPriceInput.value = 0; regularPriceInput.required = false; }
            if (vipPriceInput) { vipPriceInput.value = 0; vipPriceInput.required = false; }
            if (premiumPriceInput) { premiumPriceInput.value = 0; premiumPriceInput.required = false; }
            if (allPriceInput) { allPriceInput.value = 0; allPriceInput.required = false; }

            // Clear quantities
            const qtyInputs = document.querySelectorAll('#ticketTypeConfigSection input[type="number"]');
            qtyInputs.forEach(input => {
                if (input.name.includes('quantity')) input.value = '';
            });
        } else {
            // Restore visibility and requirements
            if (ticketConfig) ticketConfig.style.display = 'block';
            updateTicketTypeSections(); // Recalculate requirements
        }
    });

    const statusInput = document.querySelector('input[name="status"]');
    if (statusInput) statusInput.value = 'draft';

    // Ticket Type Mode Handler — multi-checkbox variant
    const ticketTypeCheckboxes = document.querySelectorAll('.ticket-type-checkbox');
    const regularPriceSection = document.getElementById('regularPriceSection');
    const vipPriceSection = document.getElementById('vipPriceSection');
    const premiumPriceSection = document.getElementById('premiumPriceSection');
    const allPriceSection = document.getElementById('allPriceSection');

    const regularPriceInput = document.getElementById('regularPriceInput');
    const vipPriceInput = document.getElementById('vipPriceInput');
    const premiumPriceInput = document.getElementById('premiumPriceInput');
    const allPriceInput = document.getElementById('allPriceInput');

    function updateTicketTypeSections() {
        // Collect ALL currently-checked ticket type checkboxes
        const checkedBoxes = document.querySelectorAll('.ticket-type-checkbox:checked');
        const selectedModes = Array.from(checkedBoxes).map(cb => cb.value);

        // ── Fix: When "All" is checked, auto-select regular/vip/premium ──────
        const allCb = document.querySelector('.ticket-type-checkbox[value="all"]');
        const individualTypes = ['regular', 'vip', 'premium'];
        if (allCb && allCb.checked) {
            // Force-check the three individual checkboxes
            individualTypes.forEach(type => {
                const cb = document.querySelector(`.ticket-type-checkbox[value="${type}"]`);
                if (cb && !cb.checked) cb.checked = true;
            });
            // Hide the "allConfig" panel — we show the three individual panels instead
            const allPanel = document.getElementById('allConfig');
            if (allPanel) allPanel.style.display = 'none';
        } else if (allCb && !allCb.checked) {
            // When "All" is unchecked, uncheck and hide the individual types only if
            // they were selected solely because of "All" (i.e. no independent reason)
            // We do nothing here — user may have individually selected them
        }

        // Re-collect after possible auto-check above
        const finalCheckedBoxes = document.querySelectorAll('.ticket-type-checkbox:checked');
        const finalModes = Array.from(finalCheckedBoxes).map(cb => cb.value);

        // Show / hide each price config panel based on final selection
        const sections = {
            'regular': document.getElementById('regularConfig'),
            'vip': document.getElementById('vipConfig'),
            'premium': document.getElementById('premiumConfig'),
            'all': document.getElementById('allConfig')
        };

        // Always hide allConfig — individual panels used instead
        if (sections['all']) sections['all'].style.display = 'none';
        ['regular', 'vip', 'premium'].forEach(key => {
            if (sections[key]) {
                sections[key].style.display = finalModes.includes(key) ? 'block' : 'none';
            }
        });

        // Update label highlight styles
        document.querySelectorAll('.ticket-type-label').forEach(label => {
            const input = label.querySelector('input');
            if (input && input.checked) {
                label.style.borderColor = '#2563eb';
                label.style.background = '#eff6ff';
            } else {
                label.style.borderColor = '#e5e7eb';
                label.style.background = 'transparent';
            }
        });

        // Update required attribute only for visible (checked) price inputs
        const rpi = document.getElementById('regularPriceInput');
        const vpi = document.getElementById('vipPriceInput');
        const ppi = document.getElementById('premiumPriceInput');
        const api = document.getElementById('allPriceInput');

        if (rpi) rpi.required = finalModes.includes('regular');
        if (vpi) vpi.required = finalModes.includes('vip');
        if (ppi) ppi.required = finalModes.includes('premium');
        if (api) api.required = false; // allConfig is hidden, never required
    }

    ticketTypeCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', updateTicketTypeSections);
    });

    // Sync prices when inputs change
    if (regularPriceInput) regularPriceInput.addEventListener('change', updateTicketTypeSections);
    if (vipPriceInput) vipPriceInput.addEventListener('change', updateTicketTypeSections);
    if (premiumPriceInput) premiumPriceInput.addEventListener('change', updateTicketTypeSections);
    if (allPriceInput) allPriceInput.addEventListener('change', updateTicketTypeSections);

    // Initial render
    updateTicketTypeSections();

    // ── Fix 5: Paste suppression — don't trigger red-border validation on paste ──
    // When user pastes into any field, set a flag that validation checks before
    // applying the error highlight
    createEventForm.addEventListener('paste', () => {
        window._isPasting = true;
        setTimeout(() => { window._isPasting = false; }, 300);
    }, true);
}

function closeCreateEventModal() {
    const modal = document.getElementById('createEventModal');
    if (modal) modal.remove();
}

function previewEventImage(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function (e) {
            document.getElementById('eventImagePreview').src = e.target.result;
        };
        reader.readAsDataURL(file);
    }
}

function generateEventTagAndLink() {
    const eventNameInput = document.getElementById('eventNameInput');
    const eventName = eventNameInput.value.trim();

    if (!eventName) {
        document.getElementById('eventTagField').value = '';
        document.getElementById('eventLinkField').value = '';
        return;
    }

    // Generate tag: lowercase, remove special chars, replace spaces with hyphens
    const tag = eventName
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-');

    // Get client name from stored user data
    const user = storage.getUser();
    const clientName = user.name
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-');

    // Generate external link
    const baseUrl = window.location.origin;
    const externalLink = `${baseUrl}/public/pages/event-details.html?event=${tag}&client=${clientName}`;

    // Update fields
    document.getElementById('eventTagField').value = tag;
    document.getElementById('eventLinkField').value = externalLink;
}

async function handleGoogleCalendarSchedule(e) {
    e.preventDefault();

    const formData = new FormData(e.target);
    formData.set('status', 'draft');

    const now = new Date();
    const startDateTime = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
    const endDateTime = new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString();
    formData.set('event_start', startDateTime);
    formData.set('event_end', endDateTime);
    formData.set('event_date', startDateTime.slice(0, 10));
    formData.set('event_time', startDateTime.slice(11, 16));

    const perStateTextareas = document.querySelectorAll('#perStateAddressContainer textarea[data-state]');
    if (perStateTextareas.length > 0) {
        const locations = Array.from(perStateTextareas).map(ta => ({
            state: ta.dataset.state,
            address: ta.value.trim()
        })).filter(l => l.state);

        if (locations.length > 0) {
            const missing = locations.filter(l => !l.address);
            if (missing.length > 0) {
                showNotification(`Please enter the venue address for: ${missing.map(l => l.state).join(', ')}`, 'error');
                return;
            }
            formData.set('locations_json', JSON.stringify(locations));
            if (locations[0] && !formData.get('address')) {
                formData.set('address', locations[0].address);
            }
        }
    } else {
        const singleState = formData.get('state') || '';
        const singleAddr = formData.get('address') || '';
        if (singleState && singleAddr) {
            formData.set('locations_json', JSON.stringify([{ state: singleState, address: singleAddr }]));
        }
    }

    const eventId = e.target.getAttribute('data-event-id');
    if (eventId) {
        formData.append('event_id', eventId);
    }

    const endpoint = '/api/events/create-event.php';
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'Connecting to Google...';
    submitBtn.disabled = true;

    try {
        const configResponse = await apiFetch('/api/config/get-google-config.php');
        const configResult = await configResponse.json();
        if (!configResult.success || !configResult.client_id) {
            throw new Error(configResult.message || 'Google Calendar is not configured');
        }

        if (!window.google?.accounts?.oauth2) {
            await new Promise((resolve, reject) => {
                if (document.getElementById('google-gsi-script')) {
                    const check = () => {
                        if (window.google?.accounts?.oauth2) resolve(); else setTimeout(check, 200);
                    };
                    check();
                    return;
                }
                const script = document.createElement('script');
                script.id = 'google-gsi-script';
                script.src = 'https://accounts.google.com/gsi/client';
                script.async = true;
                script.defer = true;
                script.onload = () => resolve();
                script.onerror = () => reject(new Error('Google SDK failed to load'));
                document.head.appendChild(script);
            });
        }

        const tokenClient = window.google.accounts.oauth2.initTokenClient({
            client_id: configResult.client_id,
            scope: 'https://www.googleapis.com/auth/calendar.events',
            callback: async (tokenResponse) => {
                try {
                    if (tokenResponse.error) {
                        throw new Error(tokenResponse.error_description || 'Google authorization was cancelled');
                    }
                    formData.set('access_token', tokenResponse.access_token);
                    const response = await apiFetch(endpoint, {
                        method: 'POST',
                        body: formData
                    });
                    const result = await response.json();
                    if (result.success) {
                        showNotification(eventId ? 'Event updated successfully!' : 'Event created successfully and queued in Google Calendar.', 'success');
                        clearFormState('createEventForm');
                        closeCreateEventModal();
                        setTimeout(() => window.location.reload(), 1000);
                    } else {
                        showNotification((eventId ? 'Failed to update event: ' : 'Failed to create event: ') + result.message, 'error');
                        submitBtn.textContent = originalText;
                        submitBtn.disabled = false;
                    }
                } catch (error) {
                    showNotification(error.message || (eventId ? 'An error occurred while updating event' : 'An error occurred while creating event'), 'error');
                    submitBtn.textContent = originalText;
                    submitBtn.disabled = false;
                }
            }
        });

        tokenClient.requestAccessToken({ prompt: 'consent' });
    } catch (error) {
        showNotification(error.message || 'Unable to connect Google Calendar right now.', 'error');
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
    }
}

// Make functions globally available
window.showCreateEventModal = showCreateEventModal;
window.closeCreateEventModal = closeCreateEventModal;
window.previewEventImage = previewEventImage;
window.generateEventTagAndLink = generateEventTagAndLink;


// Global Material DatePicker Logic
window.mdpCurrentDate = new Date();
window.mdpSelectedDate = null;
window.mdpToday = new Date();
window.mdpToday.setHours(0, 0, 0, 0);

function openMaterialDatePicker() {
    const dp = document.getElementById('materialDatePicker');
    const display = document.getElementById('customDateDisplay');
    dp.classList.add('active');
    if (display) display.setAttribute('aria-expanded', 'true');
    if (!window.mdpSelectedDate) window.mdpSelectedDate = new Date();
    window.mdpCurrentDate = new Date(window.mdpSelectedDate);
    renderMaterialDatePicker();
    const firstDay = dp.querySelector('.mdp-day:not(.disabled)');
    if (firstDay) firstDay.focus();
}

function closeMaterialDatePicker() {
    const dp = document.getElementById('materialDatePicker');
    const display = document.getElementById('customDateDisplay');
    dp.classList.remove('active');
    if (display) {
        display.setAttribute('aria-expanded', 'false');
        display.focus();
    }
}

function mdpChangeMonth(delta) {
    window.mdpCurrentDate.setMonth(window.mdpCurrentDate.getMonth() + delta);
    renderMaterialDatePicker();
}

function selectMdpDate(year, month, date) {
    const selected = new Date(year, month, date);
    if (selected < window.mdpToday) return; // Previous days not accessible
    window.mdpSelectedDate = selected;
    renderMaterialDatePicker();

    // Auto-confirm on click for smoother experience
    setTimeout(() => {
        confirmMaterialDatePicker();
    }, 100);
}

function confirmMaterialDatePicker() {
    if (window.mdpSelectedDate) {
        // Format YYYY-MM-DD for input value
        const yyyy = window.mdpSelectedDate.getFullYear();
        const mm = String(window.mdpSelectedDate.getMonth() + 1).padStart(2, '0');
        const dd = String(window.mdpSelectedDate.getDate()).padStart(2, '0');

        const dateInput = document.getElementById('eventDateInput');
        dateInput.value = `${yyyy}-${mm}-${dd}`;
        dateInput.dispatchEvent(new Event('input', { bubbles: true }));

        // Format display
        const displayOpts = { month: 'long', day: 'numeric', year: 'numeric' };
        const displayInput = document.getElementById('customDateDisplay');
        displayInput.value = window.mdpSelectedDate.toLocaleDateString('en-US', displayOpts);
        displayInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    closeMaterialDatePicker();
}

function renderMaterialDatePicker() {
    const year = window.mdpCurrentDate.getFullYear();
    const month = window.mdpCurrentDate.getMonth();

    // Update header (if selected date exists, use it, else current)
    const refDate = window.mdpSelectedDate || window.mdpCurrentDate;
    document.getElementById('mdpYear').textContent = refDate.getFullYear();
    const shortDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const shortMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    document.getElementById('mdpDateDisplay').textContent = `${shortDays[refDate.getDay()]}, ${shortMonths[refDate.getMonth()]} ${refDate.getDate()}`;

    // Month Year display
    const longMonths = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    document.getElementById('mdpMonthYear').textContent = `${longMonths[month]} ${year}`;

    // generate grid
    const grid = document.getElementById('mdpDaysGrid');

    let html = '';
    ['S', 'M', 'T', 'W', 'T', 'F', 'S'].forEach(d => {
        html += `<div class="mdp-day-header">${d}</div>`;
    });

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    for (let i = 0; i < firstDay; i++) {
        html += `<div></div>`;
    }

    for (let d = 1; d <= daysInMonth; d++) {
        const dateObj = new Date(year, month, d);
        const isPast = dateObj < window.mdpToday;

        let classes = 'mdp-day';
        if (isPast) classes += ' disabled';

        if (window.mdpSelectedDate && window.mdpSelectedDate.getFullYear() === year && window.mdpSelectedDate.getMonth() === month && window.mdpSelectedDate.getDate() === d) {
            classes += ' selected';
        }

        if (isPast) {
            html += `<div class="${classes}" aria-disabled="true">${d}</div>`;
        } else {
            html += `<div class="${classes}" role="button" tabindex="0" aria-label="${longMonths[month]} ${d}, ${year}" onclick="selectMdpDate(${year}, ${month}, ${d})" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();selectMdpDate(${year}, ${month}, ${d});}">${d}</div>`;
        }
    }

    grid.innerHTML = html;
}

window.openMaterialDatePicker = openMaterialDatePicker;
window.closeMaterialDatePicker = closeMaterialDatePicker;
window.mdpChangeMonth = mdpChangeMonth;
window.selectMdpDate = selectMdpDate;
window.confirmMaterialDatePicker = confirmMaterialDatePicker;

/**
 * Multi-select State Logic
 */
function toggleStateSelect() {
    const dropdown = document.getElementById('stateSelectDropdown');
    const display = document.getElementById('stateSelectDisplay');
    if (!dropdown || !display) return;

    // Close time picker if open
    const timeDropdown = document.getElementById('eventTimePickerDropdown');
    if (timeDropdown) timeDropdown.classList.remove('active');

    dropdown.classList.toggle('active');
    display.classList.toggle('active');

    if (dropdown.classList.contains('active')) {
        const closeDropdown = (e) => {
            const container = document.getElementById('stateSelectContainer');
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

function updateSelectedStates() {
    const checkboxes = document.querySelectorAll('.state-checkbox:checked');
    const selectedValues = Array.from(checkboxes).map(cb => cb.value);
    const displaySpan = document.getElementById('selectedStatesText');
    const hiddenInput = document.getElementById('eventStateInput');

    if (selectedValues.length === 0) {
        displaySpan.textContent = 'Select State(s)';
        displaySpan.style.color = '#9ca3af';
        hiddenInput.value = '';
    } else {
        displaySpan.textContent = selectedValues.join(', ');
        displaySpan.style.color = '#334155';
        hiddenInput.value = selectedValues.join(',');
    }

    // Trigger input event for persistence
    hiddenInput.dispatchEvent(new Event('input', { bubbles: true }));

    // ── Address textarea enable / disable logic ───────────────────────────────
    // Enable  : no selection, exactly 1 state, or "All States" is chosen.
    // Disable : 2+ individual states are selected (per-state fields are used instead).
    const mainAddressTextarea = document.querySelector('#createEventForm textarea[name="address"]');
    if (mainAddressTextarea) {
        const hasMultipleIndividual =
            selectedValues.length > 1 && !selectedValues.includes('All States');
        mainAddressTextarea.disabled = hasMultipleIndividual;
        mainAddressTextarea.style.background = hasMultipleIndividual ? '#f3f4f6' : 'white';
        mainAddressTextarea.style.cursor = hasMultipleIndividual ? 'not-allowed' : 'text';
        mainAddressTextarea.style.opacity = hasMultipleIndividual ? '0.6' : '1';
        mainAddressTextarea.placeholder = hasMultipleIndividual
            ? 'Using per-state addresses below…'
            : 'Street address, landmarks…';
    }

    // Inject per-state address fields if multiple states are selected
    renderPerStateAddressFields(selectedValues);
}

/**
 * Dynamically renders one address textarea per selected state.
 * The inputs are named `state_address[StateName]` so they can be
 * collected and serialised as a `locations` JSON blob on submit.
 */
function renderPerStateAddressFields(states) {
    const container = document.getElementById('perStateAddressContainer');
    if (!container) return;

    if (!states || states.length <= 1) {
        container.innerHTML = '';
        container.style.display = 'none';
        return;
    }

    container.style.display = 'block';

    // Preserve existing values before re-render
    const existing = {};
    const existingDate = {};
    const existingTime = {};
    const customizeDatesWasChecked = container.querySelector('#customizeDatesPerStateCheckbox')?.checked || false;
    container.querySelectorAll('textarea[data-state]').forEach(ta => {
        existing[ta.dataset.state] = ta.value;
    });
    container.querySelectorAll('input[data-date-state]').forEach(inp => {
        existingDate[inp.dataset.dateState] = inp.value;
    });
    container.querySelectorAll('input[data-time-state]').forEach(inp => {
        existingTime[inp.dataset.timeState] = inp.value;
    });

    container.innerHTML = `
        <div class="per-state-section">
            <div class="per-state-header">
                <span class="per-state-icon">📍</span>
                <div>
                    <div class="per-state-title">Per-State Venue &amp; Schedule</div>
                    <p class="per-state-desc">Enter the venue address for each selected state.</p>
                </div>
            </div>
            <label class="per-state-toggle">
                <input type="checkbox" id="customizeDatesPerStateCheckbox" ${customizeDatesWasChecked ? 'checked' : ''} onchange="togglePerStateDateTimeFields()">
                <span>Use different dates &amp; times per state</span>
            </label>
            <div class="per-state-cards">
        ${states.map(state => {
        const sid = state.replace(/\s+/g, '_');
        return `
            <div class="per-state-card">
                <div class="per-state-card-head">
                    <span class="per-state-badge">${escapeHTML(state)}</span>
                    <span class="per-state-required">Required</span>
                </div>
                <label class="sr-only" for="stateAddr_${sid}">Venue address in ${escapeHTML(state)}</label>
                <textarea
                    id="stateAddr_${sid}"
                    name="state_address_${sid}"
                    data-state="${state}"
                    placeholder="Full venue address in ${state}..."
                    rows="2"
                    required
                    class="per-state-address-input"
                >${existing[state] || ''}</textarea>
                <div class="per-state-datetime" style="display:${customizeDatesWasChecked ? 'grid' : 'none'};">
                    <div class="per-state-field">
                        <label for="psDateDisp_${sid}">Date</label>
                        <div class="per-state-date-wrap">
                            <input type="text" id="psDateDisp_${sid}" readonly placeholder="Select date"
                                role="button" tabindex="0" aria-haspopup="dialog" aria-label="Date for ${escapeHTML(state)}"
                                onclick="openPerStateDatePicker('${sid}')"
                                onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openPerStateDatePicker('${sid}');}"
                                value="${existingDate[state] || ''}"
                                class="per-state-date-display">
                            <span aria-hidden="true">📅</span>
                        </div>
                        <input type="hidden" data-date-state="${state}" id="psDateVal_${sid}" value="${existingDate[state] || ''}">
                        <div id="psMDP_${sid}" class="per-state-mdp" role="dialog" aria-modal="true" aria-label="Choose date for ${escapeHTML(state)}">
                            <div class="per-state-mdp-head">
                                <div id="psMDPYear_${sid}"></div>
                                <div id="psMDPDate_${sid}"></div>
                            </div>
                            <div class="per-state-mdp-body">
                                <div class="per-state-mdp-nav">
                                    <button type="button" aria-label="Previous month" onclick="psChangeMonth('${sid}',-1)">&#10094;</button>
                                    <span id="psMDPMY_${sid}"></span>
                                    <button type="button" aria-label="Next month" onclick="psChangeMonth('${sid}',1)">&#10095;</button>
                                </div>
                                <div id="psMDPGrid_${sid}" class="per-state-mdp-grid"></div>
                            </div>
                            <div class="per-state-mdp-foot">
                                <button type="button" onclick="closePsDatePicker('${sid}')">Cancel</button>
                                <button type="button" onclick="confirmPsDate('${sid}')">OK</button>
                            </div>
                        </div>
                    </div>
                    <div class="per-state-field">
                        <span id="psTimeLabel_${sid}">Time</span>
                        <div id="psTC_${sid}" class="time-picker-container">
                            <button type="button" class="time-picker-display per-state-time-btn" aria-labelledby="psTimeLabel_${sid}" aria-haspopup="listbox" aria-expanded="false" onclick="toggleTimePicker('psTD_${sid}')">
                                <span class="ps-time-text">Select Time</span>
                                <span aria-hidden="true">🕒</span>
                            </button>
                            <div id="psTD_${sid}" class="time-picker-dropdown">
                                <div class="time-picker-section">
                                    <span class="time-picker-label">Hours</span>
                                    <div class="time-picker-grid hours">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(h => `<button type="button" class="time-btn" onclick="selectHour('${h}','psTC_${sid}')">${h}</button>`).join('')}</div>
                                </div>
                                <div class="time-picker-section">
                                    <span class="time-picker-label">Minutes</span>
                                    <div class="time-picker-grid minutes">${['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'].map(m => `<button type="button" class="time-btn" onclick="selectMinute('${m}','psTC_${sid}')">${m}</button>`).join('')}</div>
                                </div>
                                <div class="time-picker-section">
                                    <div class="time-picker-ampm">
                                        <button type="button" class="time-btn ampm-btn" onclick="selectAmPm('am','psTC_${sid}')">am</button>
                                        <button type="button" class="time-btn ampm-btn" onclick="selectAmPm('pm','psTC_${sid}')">pm</button>
                                    </div>
                                </div>
                            </div>
                            <input type="hidden" data-time-state="${state}" id="psTimeVal_${sid}">
                        </div>
                    </div>
                </div>
            </div>
        `}).join('')}
            </div>
        </div>
    `;

    // Initialise per-state mini datepickers
    if (!window._psDPState) window._psDPState = {};
    states.forEach(state => {
        const sid = state.replace(/\s+/g, '_');
        const existing_date = existingDate[state] || null;
        const now = existing_date ? new Date(existing_date + 'T00:00:00') : new Date();
        window._psDPState[sid] = { month: now.getMonth(), year: now.getFullYear(), selected: existing_date, temp: existing_date };
        renderPsDatePicker(sid);
        if (existing_date) {
            const d = new Date(existing_date + 'T00:00:00');
            const dispEl = document.getElementById('psDateDisp_' + sid);
            const yearEl = document.getElementById('psMDPYear_' + sid);
            const dateEl = document.getElementById('psMDPDate_' + sid);
            if (dispEl) dispEl.value = existing_date;
            if (yearEl) yearEl.textContent = d.getFullYear();
            if (dateEl) dateEl.textContent = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        }
    });
}

function openPerStateDatePicker(sid) {
    document.querySelectorAll('.per-state-mdp').forEach(el => el.classList.remove('open'));
    const dp = document.getElementById('psMDP_' + sid);
    if (dp) { dp.classList.add('open'); renderPsDatePicker(sid); }
}

function closePsDatePicker(sid) {
    const dp = document.getElementById('psMDP_' + sid);
    if (dp) dp.classList.remove('open');
}

function confirmPsDate(sid) {
    const state = window._psDPState && window._psDPState[sid];
    if (state && state.temp) {
        state.selected = state.temp;
        const valEl = document.getElementById('psDateVal_' + sid);
        const dispEl = document.getElementById('psDateDisp_' + sid);
        if (valEl) valEl.value = state.selected;
        if (dispEl) dispEl.value = state.selected;
    }
    closePsDatePicker(sid);
}

function psChangeMonth(sid, delta) {
    if (!window._psDPState || !window._psDPState[sid]) return;
    const s = window._psDPState[sid];
    s.month += delta;
    if (s.month > 11) { s.month = 0; s.year++; }
    if (s.month < 0) { s.month = 11; s.year--; }
    renderPsDatePicker(sid);
}

function psDaySelect(sid, dateStr) {
    if (!window._psDPState || !window._psDPState[sid]) return;
    const s = window._psDPState[sid];
    s.temp = dateStr;
    const d = new Date(dateStr + 'T00:00:00');
    const yearEl = document.getElementById('psMDPYear_' + sid);
    const dateEl = document.getElementById('psMDPDate_' + sid);
    if (yearEl) yearEl.textContent = d.getFullYear();
    if (dateEl) dateEl.textContent = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    renderPsDatePicker(sid);
}

function renderPsDatePicker(sid) {
    if (!window._psDPState || !window._psDPState[sid]) return;
    const s = window._psDPState[sid];
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const daysH = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
    const myEl = document.getElementById('psMDPMY_' + sid);
    const gridEl = document.getElementById('psMDPGrid_' + sid);
    if (!myEl || !gridEl) return;
    myEl.textContent = `${months[s.month]} ${s.year}`;
    const firstDay = new Date(s.year, s.month, 1).getDay();
    const daysInMonth = new Date(s.year, s.month + 1, 0).getDate();
    const today = new Date(); today.setHours(0, 0, 0, 0);
    let html = daysH.map(d => `<div style="font-size:0.65rem;font-weight:700;color:#9ca3af;text-transform:uppercase;padding:2px;">${d}</div>`).join('');
    for (let i = 0; i < firstDay; i++) html += '<div></div>';
    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${s.year}-${String(s.month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const isPast = new Date(s.year, s.month, d) < today;
        const isSel = s.temp === dateStr || s.selected === dateStr;
        const isToday = new Date(s.year, s.month, d).getTime() === today.getTime();
        html += `<div onclick="${isPast ? '' : `psDaySelect('${sid}','${dateStr}')`}" style="width:30px;height:30px;display:flex;align-items:center;justify-content:center;border-radius:50%;margin:auto;cursor:${isPast ? 'not-allowed' : 'pointer'};font-size:0.8rem;font-weight:500;${isSel ? 'background:#008080;color:white;' : isToday ? 'border:2px solid #008080;color:#008080;' : isPast ? 'color:#d1d5db;' : 'color:#374151;'}">${d}</div>`;
    }
    gridEl.innerHTML = html;
}

function togglePerStateDateTimeFields() {
    const checkbox = document.getElementById('customizeDatesPerStateCheckbox');
    const fields = document.querySelectorAll('#perStateAddressContainer .per-state-datetime');
    const show = checkbox ? checkbox.checked : false;
    fields.forEach(f => { f.style.display = show ? 'grid' : 'none'; });

    // ── Fix 1: Lock / unlock the global Date & Time fields ────────────────────
    // When per-state dates are active, the global date/time fields should be
    // inaccessible (disabled + visually greyed out) to avoid confusion.
    const globalDateDisplay = document.getElementById('customDateDisplay');
    const globalDateInput = document.getElementById('eventDateInput');
    const globalTimeBtn = document.getElementById('eventTimeDisplayBtn');
    const globalTimeInput = document.getElementById('eventTimeInput');

    const disabledStyle = 'background: #f3f4f6; cursor: not-allowed; opacity: 0.5; pointer-events: none;';
    const enabledStyle = '';

    if (globalDateDisplay) {
        if (show) {
            globalDateDisplay.style.backgroundColor = '#f3f4f6';
            globalDateDisplay.style.cursor = 'not-allowed';
            globalDateDisplay.style.opacity = '0.5';
            globalDateDisplay.style.pointerEvents = 'none';
            globalDateDisplay.setAttribute('tabindex', '-1');
            globalDateDisplay.removeAttribute('onclick');
            globalDateDisplay.removeAttribute('onkeydown');
        } else {
            globalDateDisplay.style.backgroundColor = 'white';
            globalDateDisplay.style.cursor = 'pointer';
            globalDateDisplay.style.opacity = '';
            globalDateDisplay.style.pointerEvents = '';
            globalDateDisplay.setAttribute('tabindex', '0');
            globalDateDisplay.setAttribute('onclick', 'openMaterialDatePicker()');
            globalDateDisplay.setAttribute('onkeydown', "if(event.key==='Enter'||event.key===' '){event.preventDefault();openMaterialDatePicker();}");
        }
    }
    if (globalTimeBtn) {
        if (show) {
            globalTimeBtn.style.backgroundColor = '#f3f4f6';
            globalTimeBtn.style.cursor = 'not-allowed';
            globalTimeBtn.style.opacity = '0.5';
            globalTimeBtn.style.pointerEvents = 'none';
        } else {
            globalTimeBtn.style.backgroundColor = 'white';
            globalTimeBtn.style.cursor = 'pointer';
            globalTimeBtn.style.opacity = '';
            globalTimeBtn.style.pointerEvents = '';
        }
        globalTimeBtn.disabled = show;
    }
    if (globalDateInput) globalDateInput.required = !show;
    if (globalTimeInput) globalTimeInput.required = !show;
}

// Expose per-state container placeholder in the form HTML (injected once the form opens)
function injectPerStateContainer() {
    const addressGroup = document.querySelector('#createEventForm .form-group textarea[name="address"]')?.closest('.form-group');
    if (!addressGroup) return;
    if (document.getElementById('perStateAddressContainer')) return;
    const div = document.createElement('div');
    div.id = 'perStateAddressContainer';
    div.className = 'per-state-container';
    div.style.display = 'none';
    addressGroup.after(div);
}

window.toggleStateSelect = toggleStateSelect;
window.updateSelectedStates = updateSelectedStates;
window.togglePerStateDateTimeFields = togglePerStateDateTimeFields;
