function showCreateEventModal() {
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
                                            <option value="Entertainment">Entertainment</option>
                                            <option value="Sports">Sports</option>
                                            <option value="Exhibition">Exhibition</option>
                                            <option value="Networking">Networking</option>
                                            <option value="Festival">Festival</option>
                                            <option value="Concert">Concert</option>
                                            <option value="Business">Business</option>
                                            <option value="Educational">Educational</option>
                                            <option value="Social">Social</option>
                                            <option value="Personal">Personal</option>
                                            <option value="Community">Community</option>
                                            <option value="Religious">Religious</option>
                                            <option value="Cultural">Cultural</option>
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

                                <!-- Row: City, State, Zip -->
                                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1.5rem;">
                                    <div class="form-group" style="position: relative;">
                                        <label style="display: block; font-size: 0.875rem; font-weight: 600; color: #6b7280; margin-bottom: 0.5rem; text-transform: uppercase; letter-spacing: 0.5px;">Date <span style="color: #ef4444">*</span></label>
                                        <div style="position: relative;">
                                            <input type="text" id="customDateDisplay" readonly required placeholder="Select a date" 
                                                   style="width: 100%; padding: 1rem 1.25rem; border: 2px solid #e5e7eb; border-radius: 12px; font-size: 1rem; background: white; transition: all 0.3s; box-shadow: 0 2px 8px rgba(0,0,0,0.04); cursor: pointer;"
                                                   onclick="openMaterialDatePicker()">
                                            <span style="position: absolute; right: 1rem; top: 1rem; color: #9ca3af; pointer-events: none; font-size: 1.25rem;">📅</span>
                                        </div>
                                        <input type="hidden" name="event_date" id="eventDateInput" required>
                                        
                                        <!-- Material Datepicker Dropdown -->
                                        <div id="materialDatePicker" class="material-datepicker">
                                            <div class="mdp-header">
                                                <div id="mdpYear" class="mdp-year">2026</div>
                                                <div id="mdpDateDisplay" class="mdp-date">Thu, Apr 16</div>
                                            </div>
                                            <div class="mdp-body">
                                                <div class="mdp-month-nav">
                                                    <button type="button" class="mdp-nav-btn" onclick="mdpChangeMonth(-1)">&#10094;</button>
                                                    <div id="mdpMonthYear">April 2026</div>
                                                    <button type="button" class="mdp-nav-btn" onclick="mdpChangeMonth(1)">&#10095;</button>
                                                </div>
                                                <div class="mdp-days-grid" id="mdpDaysGrid">
                                                    <!-- Days will be generated by JS -->
                                                </div>
                                            </div>
                                            <div class="mdp-footer">
                                                <button type="button" class="mdp-btn" onclick="closeMaterialDatePicker()">CANCEL</button>
                                                <button type="button" class="mdp-btn" onclick="confirmMaterialDatePicker()">OK</button>
                                            </div>
                                        </div>
                                    </div>

                                    <div class="form-group">
                                        <label style="display: block; font-size: 0.875rem; font-weight: 600; color: #6b7280; margin-bottom: 0.5rem; text-transform: uppercase; letter-spacing: 0.5px;">Time <span style="color: #ef4444">*</span></label>
                                        <div id="eventTimePickerContainer" class="time-picker-container">
                                            <div class="time-picker-display" onclick="toggleTimePicker('eventTimePickerDropdown')">
                                                <span id="eventTimeDisplay">Select Time</span>
                                                <span style="font-size: 0.8rem; opacity: 0.5;">🕒</span>
                                            </div>
                                            <div id="eventTimePickerDropdown" class="time-picker-dropdown">
                                                <!-- Top Section: Hours -->
                                                <div class="time-picker-section">
                                                    <label class="time-picker-label">Hours</label>
                                                    <div class="time-picker-grid hours" id="hourGrid">
                                                        ${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(h => `<button type="button" class="time-btn" onclick="selectHour('${h}', 'eventTimePickerContainer')">${h}</button>`).join('')}
                                                    </div>
                                                </div>
                                                <!-- Middle Section: Minutes -->
                                                <div class="time-picker-section">
                                                    <label class="time-picker-label">Minutes</label>
                                                    <div class="time-picker-grid minutes" id="minuteGrid">
                                                        ${['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'].map(m => `<button type="button" class="time-btn" onclick="selectMinute('${m}', 'eventTimePickerContainer')">${m}</button>`).join('')}
                                                    </div>
                                                </div>
                                                <!-- Bottom Section: Period -->
                                                <div class="time-picker-section">
                                                    <div class="time-picker-ampm">
                                                        <button type="button" class="time-btn ampm-btn" onclick="selectAmPm('am', 'eventTimePickerContainer')">am</button>
                                                        <button type="button" class="time-btn ampm-btn" onclick="selectAmPm('pm', 'eventTimePickerContainer')">pm</button>
                                                    </div>
                                                </div>
                                            </div>
                                            <input type="hidden" name="event_time" id="eventTimeInput" required>
                                        </div>
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

                                <div class="form-group">
                                    <label style="display: block; font-size: 0.875rem; font-weight: 600; color: #6b7280; margin-bottom: 0.5rem; text-transform: uppercase; letter-spacing: 0.5px;">Status</label>
                                    <select name="status" style="width: 100%; padding: 1rem 1.25rem; border: 2px solid #e5e7eb; border-radius: 12px; font-size: 1rem; background: white; transition: all 0.3s; box-shadow: 0 2px 8px rgba(0,0,0,0.04);">
                                        <option value="draft">Draft</option>
                                        <option value="scheduled">Schedule</option>
                                    </select>
                                </div>

                                <!-- Scheduled Time (Conditional) -->
                                <div class="form-group" id="scheduledTimeGroup" style="display: none; background: linear-gradient(135deg, #fef3c7, #fde68a); padding: 1.5rem; border-radius: 16px; border: 2px solid #fbbf24;">
                                    <label style="font-weight: 700; color: #92400e; margin-bottom: 0.75rem; display: block; font-size: 0.875rem; text-transform: uppercase; letter-spacing: 0.5px;">Scheduled Publish Time</label>
                                    <input type="datetime-local" name="scheduled_publish_time" style="width: 100%; padding: 1rem 1.25rem; border: 2px solid #fbbf24; border-radius: 12px; background: white; font-size: 1rem;">
                                    <div style="color: #b45309; margin-top: 0.75rem; font-size: 0.875rem; font-weight: 500;">Event will be automatically published at this time</div>
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
                                        Create Event
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
        </style>
    `;

    // Remove existing modal if any
    const existing = document.getElementById('createEventModal');
    if (existing) existing.remove();

    // Add modal to body
    document.body.insertAdjacentHTML('beforeend', modalHTML);



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
    const createEventForm = document.getElementById('createEventForm');
    createEventForm.addEventListener('submit', handleEventCreation);

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

    freeCheckbox.addEventListener('change', function() {
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

    // Add status change handler
    document.querySelector('select[name="status"]').addEventListener('change', function(e) {
        const scheduledGroup = document.getElementById('scheduledTimeGroup');
        scheduledGroup.style.display = e.target.value === 'scheduled' ? 'block' : 'none';
        
        // Ensure priority fields are visible regardless of status
    });

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

        // Show / hide each price config panel based on selection
        const sections = {
            'regular': document.getElementById('regularConfig'),
            'vip':     document.getElementById('vipConfig'),
            'premium': document.getElementById('premiumConfig'),
            'all':     document.getElementById('allConfig')
        };

        Object.keys(sections).forEach(key => {
            if (sections[key]) {
                sections[key].style.display = selectedModes.includes(key) ? 'block' : 'none';
            }
        });

        // Update label highlight styles
        document.querySelectorAll('.ticket-type-label').forEach(label => {
            const input = label.querySelector('input');
            if (input && input.checked) {
                label.style.borderColor = '#2563eb';
                label.style.background  = '#eff6ff';
            } else {
                label.style.borderColor = '#e5e7eb';
                label.style.background  = 'transparent';
            }
        });

        // Update required attribute only for visible (checked) price inputs
        const rpi = document.getElementById('regularPriceInput');
        const vpi = document.getElementById('vipPriceInput');
        const ppi = document.getElementById('premiumPriceInput');
        const api = document.getElementById('allPriceInput');

        if (rpi) rpi.required = selectedModes.includes('regular');
        if (vpi) vpi.required = selectedModes.includes('vip');
        if (ppi) ppi.required = selectedModes.includes('premium');
        if (api) api.required = selectedModes.includes('all');
    }

    ticketTypeCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', updateTicketTypeSections);
    });

    // Sync prices when inputs change
    if (regularPriceInput) regularPriceInput.addEventListener('change', updateTicketTypeSections);
    if (vipPriceInput)     vipPriceInput.addEventListener('change', updateTicketTypeSections);
    if (premiumPriceInput) premiumPriceInput.addEventListener('change', updateTicketTypeSections);
    if (allPriceInput)     allPriceInput.addEventListener('change', updateTicketTypeSections);

    // Initial render
    updateTicketTypeSections();
}

function closeCreateEventModal() {
    const modal = document.getElementById('createEventModal');
    if (modal) modal.remove();
}

function previewEventImage(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
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

async function handleEventCreation(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);

    // ── Build structured locations JSON from per-state address fields ──────────
    const perStateTextareas = document.querySelectorAll('#perStateAddressContainer textarea[data-state]');
    if (perStateTextareas.length > 0) {
        // Multi-state mode: collect each state → address + optional date/time
        const customizeDates = document.getElementById('customizeDatesPerStateCheckbox')?.checked || false;
        const locations = Array.from(perStateTextareas).map(ta => {
            const state = ta.dataset.state;
            const loc = { state, address: ta.value.trim() };
            if (customizeDates) {
                const dateInput = document.querySelector(`#perStateAddressContainer input[data-date-state="${state}"]`);
                const timeInput = document.querySelector(`#perStateAddressContainer input[data-time-state="${state}"]`);
                if (dateInput && dateInput.value) loc.date = dateInput.value;
                if (timeInput && timeInput.value) loc.time = timeInput.value;
            }
            return loc;
        }).filter(l => l.state);

        // Validate all per-state addresses are filled
        const missing = locations.filter(l => !l.address);
        if (missing.length > 0) {
            showNotification(`Please enter the venue address for: ${missing.map(l => l.state).join(', ')}`, 'error');
            return;
        }

        // Validate per-state dates/times if customization is enabled
        if (customizeDates) {
            const missingDates = locations.filter(l => !l.date);
            if (missingDates.length > 0) {
                showNotification(`Please enter the date for: ${missingDates.map(l => l.state).join(', ')}`, 'error');
                return;
            }
            const missingTimes = locations.filter(l => !l.time);
            if (missingTimes.length > 0) {
                showNotification(`Please enter the time for: ${missingTimes.map(l => l.state).join(', ')}`, 'error');
                return;
            }
            // Compute earliest date/time → use as the main event_date / event_time
            const sorted = [...locations].sort((a, b) => {
                const da = new Date(`${a.date}T${a.time || '00:00'}`);
                const db = new Date(`${b.date}T${b.time || '00:00'}`);
                return da - db;
            });
            formData.set('event_date', sorted[0].date);
            if (sorted[0].time) formData.set('event_time', sorted[0].time);
        }

        formData.set('locations_json', JSON.stringify(locations));
        // Use the first state's address as the canonical `address` fallback
        if (locations[0] && !formData.get('address')) {
            formData.set('address', locations[0].address);
        }
    } else {
        // Single-state: build a minimal locations array from the main address field
        const singleState  = formData.get('state') || '';
        const singleAddr   = formData.get('address') || '';
        if (singleState && singleAddr) {
            formData.set('locations_json', JSON.stringify([{ state: singleState, address: singleAddr }]));
        }
    }
    // ─────────────────────────────────────────────────────────────────────────
    
    // Show loading state
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'Creating... ⏳';
    submitBtn.disabled = true;
    
    try {
        const response = await apiFetch('/api/events/create-event.php', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (result.success) {
            showNotification('Event created successfully!', 'success');
            clearFormState('createEventForm');
            closeCreateEventModal();
            setTimeout(() => window.location.reload(), 1000);
        } else {
            showNotification('Failed to create event: ' + result.message, 'error');
            submitBtn.textContent = originalText;
            submitBtn.disabled = false;
        }
    } catch (error) {
        showNotification('An error occurred while creating event', 'error');
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
window.mdpToday.setHours(0,0,0,0);

function openMaterialDatePicker() {
    document.getElementById('materialDatePicker').classList.add('active');
    if (!window.mdpSelectedDate) window.mdpSelectedDate = new Date();
    window.mdpCurrentDate = new Date(window.mdpSelectedDate);
    renderMaterialDatePicker();
}

function closeMaterialDatePicker() {
    document.getElementById('materialDatePicker').classList.remove('active');
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
    const shortDays = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const shortMonths = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    document.getElementById('mdpDateDisplay').textContent = `${shortDays[refDate.getDay()]}, ${shortMonths[refDate.getMonth()]} ${refDate.getDate()}`;
    
    // Month Year display
    const longMonths = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    document.getElementById('mdpMonthYear').textContent = `${longMonths[month]} ${year}`;
    
    // generate grid
    const grid = document.getElementById('mdpDaysGrid');
    
    let html = '';
    ['S','M','T','W','T','F','S'].forEach(d => {
        html += `<div class="mdp-day-header">${d}</div>`;
    });
    
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    for(let i=0; i<firstDay; i++) {
        html += `<div></div>`;
    }
    
    for(let d=1; d<=daysInMonth; d++) {
        const dateObj = new Date(year, month, d);
        const isPast = dateObj < window.mdpToday;
        
        let classes = 'mdp-day';
        if (isPast) classes += ' disabled';
        
        if (window.mdpSelectedDate && window.mdpSelectedDate.getFullYear() === year && window.mdpSelectedDate.getMonth() === month && window.mdpSelectedDate.getDate() === d) {
            classes += ' selected';
        }
        
        if (isPast) {
            html += `<div class="${classes}">${d}</div>`;
        } else {
            html += `<div class="${classes}" onclick="selectMdpDate(${year}, ${month}, ${d})">${d}</div>`;
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
        mainAddressTextarea.disabled   = hasMultipleIndividual;
        mainAddressTextarea.style.background  = hasMultipleIndividual ? '#f3f4f6' : 'white';
        mainAddressTextarea.style.cursor      = hasMultipleIndividual ? 'not-allowed' : 'text';
        mainAddressTextarea.style.opacity     = hasMultipleIndividual ? '0.6' : '1';
        mainAddressTextarea.placeholder       = hasMultipleIndividual
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
        <div style="margin-bottom:0.5rem; font-size:0.85rem; font-weight:700; color:#722f37; text-transform:uppercase; letter-spacing:0.5px;">
            📍 Per-State Venue Address &amp; Schedule
        </div>
        <p style="font-size:0.8rem; color:#6b7280; margin-bottom:0.75rem;">
            Enter the specific venue address for each selected state.
        </p>
        <label style="display:flex; align-items:center; gap:0.5rem; font-size:0.82rem; font-weight:600; color:#374151; margin-bottom:1rem; cursor:pointer; padding:0.6rem 0.75rem; background:#fff7ed; border-radius:8px; border:1px solid #fed7aa;">
            <input type="checkbox" id="customizeDatesPerStateCheckbox" ${customizeDatesWasChecked ? 'checked' : ''} onchange="togglePerStateDateTimeFields()" style="width:16px;height:16px;cursor:pointer;accent-color:#f97316;">
            <span>📅 Use different dates &amp; times for each state</span>
        </label>
        ${states.map(state => `
            <div style="margin-bottom:1.25rem; background:#fff; padding:1rem; border-radius:12px; border:1px solid #e5e7eb; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
                <label style="display:block; font-size:0.82rem; font-weight:700; color:#374151; margin-bottom:0.5rem;">
                    📍 ${state} <span style="color:#ef4444">*</span>
                </label>
                <textarea
                    name="state_address_${state.replace(/\s+/g, '_')}"
                    data-state="${state}"
                    placeholder="Full venue address in ${state}..."
                    rows="2"
                    required
                    style="width:100%; padding:0.75rem 1rem; border:2px solid #e5e7eb; border-radius:10px; font-size:0.9rem; background:white; font-family:inherit; resize:vertical; margin-bottom:0.5rem;"
                >${existing[state] || ''}</textarea>
                <div class="per-state-datetime" style="display:${customizeDatesWasChecked ? 'flex' : 'none'}; gap:0.75rem; flex-wrap:wrap; margin-top:0.5rem;">
                    <div style="flex:1; min-width:140px;">
                        <label style="display:block; font-size:0.72rem; font-weight:600; color:#6b7280; margin-bottom:0.25rem; text-transform:uppercase; letter-spacing:0.4px;">📅 Date *</label>
                        <input type="date"
                            data-date-state="${state}"
                            value="${existingDate[state] || ''}"
                            style="width:100%; padding:0.6rem 0.75rem; border:2px solid #e5e7eb; border-radius:8px; font-size:0.85rem; background:white; font-family:inherit; box-sizing:border-box;">
                    </div>
                    <div style="flex:1; min-width:120px;">
                        <label style="display:block; font-size:0.72rem; font-weight:600; color:#6b7280; margin-bottom:0.25rem; text-transform:uppercase; letter-spacing:0.4px;">🕒 Time *</label>
                        <input type="time"
                            data-time-state="${state}"
                            value="${existingTime[state] || ''}"
                            style="width:100%; padding:0.6rem 0.75rem; border:2px solid #e5e7eb; border-radius:8px; font-size:0.85rem; background:white; font-family:inherit; box-sizing:border-box;">
                    </div>
                </div>
            </div>
        `).join('')}
    `;
}

function togglePerStateDateTimeFields() {
    const checkbox = document.getElementById('customizeDatesPerStateCheckbox');
    const fields = document.querySelectorAll('#perStateAddressContainer .per-state-datetime');
    const show = checkbox ? checkbox.checked : false;
    fields.forEach(f => { f.style.display = show ? 'flex' : 'none'; });
}

// Expose per-state container placeholder in the form HTML (injected once the form opens)
function injectPerStateContainer() {
    const addressGroup = document.querySelector('#createEventForm .form-group textarea[name="address"]')?.closest('.form-group');
    if (!addressGroup) return;
    if (document.getElementById('perStateAddressContainer')) return;
    const div = document.createElement('div');
    div.id = 'perStateAddressContainer';
    div.style.cssText = 'display:none; background:#f8fafc; padding:1.25rem; border-radius:12px; border:2px solid #e5e7eb; margin-top:1rem;';
    addressGroup.after(div);
}

window.toggleStateSelect = toggleStateSelect;
window.updateSelectedStates = updateSelectedStates;
window.togglePerStateDateTimeFields = togglePerStateDateTimeFields;
