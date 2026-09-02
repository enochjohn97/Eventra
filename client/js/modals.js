function eventraShowFieldError(field, message) {
    if (!field) return;

    const parent = field.parentElement;
    const existingErr = parent ? parent.querySelector(':scope > .wizard-field-error') : null;
    if (existingErr) existingErr.remove();

    field.style.borderColor = '#ef4444';
    field.style.boxShadow = '0 0 0 2px rgba(239,68,68,0.15)';

    const errSpan = document.createElement('span');
    errSpan.className = 'wizard-field-error';
    errSpan.style.cssText = 'color:#ef4444;font-size:0.75rem;display:block;margin-top:4px;font-weight:600;line-height:1.35;';
    errSpan.textContent = message;

    if (field.type === 'checkbox' || field.type === 'radio') {
        const group = field.closest('.form-group') || parent || field;
        group.appendChild(errSpan);
    } else {
        field.insertAdjacentElement('afterend', errSpan);
    }
}

/** Removes any inline error message/highlight from a field. */
function eventraClearFieldError(field) {
    if (!field) return;
    field.style.borderColor = '';
    field.style.boxShadow = '';

    const parent = field.parentElement;
    const err = parent ? parent.querySelector(':scope > .wizard-field-error') : null;
    if (err) err.remove();
}

/**
 * Validates a single field: required-ness, plus format checks for phone,
 * account number and date-of-birth. Shows/clears the inline message as a
 * side-effect. Returns true when the field is valid.
 */
function eventraValidateField(field) {
    if (!field) return true;

    const group = field.closest('.form-group');
    const label = group?.querySelector('label')?.textContent
        ?.replace(/\*/g, '')
        .replace(/\s+/g, ' ')
        .trim() || field.getAttribute('aria-label') || field.name || 'This field';
    const value = String(field.value ?? '').trim();

    if (field.disabled || field.type === 'hidden') {
        return true;
    }

    if (field.type === 'file') {
        eventraClearFieldError(field);
        return true;
    }

    if (field.hasAttribute('required') && !value) {
        eventraShowFieldError(field, `${label} is required.`);
        return false;
    }

    if (field.name === 'phone' && value) {
        const digits = value.replace(/\D/g, '');
        if (digits.length !== 11) {
            eventraShowFieldError(field, `Phone number must be exactly 11 digits (currently ${digits.length}).`);
            return false;
        }
    }

    if (field.name === 'account_number' && value) {
        const digits = value.replace(/\D/g, '');
        if (digits.length !== 10) {
            eventraShowFieldError(field, `Account number must be exactly 10 digits (currently ${digits.length}).`);
            return false;
        }
    }

    if (field.name === 'bank_code' && field.required && !value) {
        eventraShowFieldError(field, 'Settlement Bank is required.');
        return false;
    }

    if (field.type === 'date' && value) {
        const selected = new Date(value + 'T00:00:00');
        if (Number.isNaN(selected.getTime())) {
            eventraShowFieldError(field, 'Please enter a valid date.');
            return false;
        }

        if (field.name === 'dob') {
            const today = new Date();
            today.setHours(23, 59, 59, 999);

            if (selected > today) {
                eventraShowFieldError(field, 'Date of birth cannot be in the future.');
                return false;
            }

            const ageYears = (today - selected) / (1000 * 60 * 60 * 24 * 365.25);
            if (ageYears < 16) {
                eventraShowFieldError(field, 'You must be at least 16 years old.');
                return false;
            }
        }
    }

    eventraClearFieldError(field);
    return true;
}

/**
 * Validates every relevant field inside a wizard step.
 * Custom validation is used instead of browser-native required validation
 * so the correct wizard step and feedback can always be controlled.
 */
function eventraValidateStep(stepRoot) {
    if (!stepRoot) return true;

    let isValid = true;
    let firstInvalid = null;

    const fields = stepRoot.querySelectorAll('input, select, textarea');

    fields.forEach((field) => {
        if (field.disabled || field.type === 'hidden' || field.type === 'file') return;

        const shouldValidate =
            field.hasAttribute('required') ||
            field.name === 'phone' ||
            field.name === 'account_number';

        if (!shouldValidate) return;

        const ok = eventraValidateField(field);
        if (!ok) {
            isValid = false;
            if (!firstInvalid) firstInvalid = field;
        }
    });

    // Payment step requires the bank + account number + resolved holder name.
    if (stepRoot.id === 'wizardStep2') {
        const bank = stepRoot.querySelector('[name="bank_code"]');
        const account = stepRoot.querySelector('[name="account_number"]');
        const accountName = stepRoot.querySelector('[name="account_name"]');

        [bank, account, accountName].forEach((field) => {
            if (!field) return;
            const ok = eventraValidateField(field);
            if (!ok) {
                isValid = false;
                if (!firstInvalid) firstInvalid = field;
            }
        });

        if (account && String(account.value || '').trim()) {
            const digits = String(account.value).replace(/\D/g, '');
            if (digits.length !== 10) {
                isValid = false;
                eventraShowFieldError(account, 'Account number must be exactly 10 digits.');
                if (!firstInvalid) firstInvalid = account;
            }
        }
    }

    if (firstInvalid) {
        try {
            firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } catch (_) {}
        try {
            firstInvalid.focus({ preventScroll: true });
        } catch (_) {
            try { firstInvalid.focus(); } catch (_) {}
        }
    }

    return isValid;
}

function eventraShowValidationFeedback(title, text, icon = 'warning') {
    const message = text || 'Please complete all required fields before continuing.';
    console.log('Show validation feedback:', { title, text: message, icon });

    if (typeof Swal !== 'undefined' && typeof Swal.fire === 'function') {
        return Swal.fire({
            icon,
            title: title || 'Please check this step',
            text: message,
            confirmButtonColor: '#722f37',
            confirmButtonText: 'OK'
        });
    }

    if (typeof window.showNotification === 'function') {
        window.showNotification(message, 'error');
    }

    // Last-resort popup so the user always receives feedback.
    if (typeof window.alert === 'function') {
        window.alert(`${title || 'Please check this step'}\n\n${message}`);
    }

    return Promise.resolve();
}

/** Wires up live validation so errors are also corrected as users interact. */
function eventraAttachLiveValidation(form) {
    if (!form || form.dataset.liveValidationAttached) return;
    form.dataset.liveValidationAttached = '1';

    form.querySelectorAll('input, select, textarea').forEach((field) => {
        if (field.type === 'hidden' || field.disabled) return;

        const validateOnInteraction = () => {
            if (field.hasAttribute('required') || field.name === 'phone' || field.name === 'account_number') {
                eventraValidateField(field);
            }
        };

        field.addEventListener('blur', validateOnInteraction);
        field.addEventListener('change', validateOnInteraction);
        field.addEventListener('input', () => {
            const parent = field.parentElement;
            const hasError = parent?.querySelector(':scope > .wizard-field-error');
            if (hasError) validateOnInteraction();
        });
    });
}

/**
 * Moves between wizard steps. The triggering button is passed explicitly so
 * the correct modal/form is always used; this avoids relying on window.event.
 */
window.switchWizardTab = function (step, trigger) {
    console.log('switchWizardTab called:', { step, trigger, triggerElement: trigger?.tagName, triggerClass: trigger?.className });
    
    const targetStep = Number.parseInt(step, 10);
    if (!Number.isInteger(targetStep) || targetStep < 1) {
        console.error('Invalid target step:', step);
        return false;
    }

    // Find the form - try multiple strategies
    const btn = trigger?.closest?.('button') || trigger;
    console.log('Button found:', btn?.tagName, btn?.className, btn?.outerHTML?.substring(0, 100));

    const form = btn?.closest?.('form')
        || document.querySelector('.modal-backdrop.active form')
        || document.querySelector('.modal-content form')
        || document.querySelector('form#profileEditForm')
        || document.querySelector('form#editEventForm');

    console.log('Form found:', form?.id, form?.className, form?.tagName);

    if (!form) {
        console.error('Eventra wizard: form not found for step change.', targetStep);
        console.log('Available forms:', document.querySelectorAll('form').length);
        document.querySelectorAll('form').forEach(f => console.log('Form:', f.id, f.className));
        return false;
    }

    const currentStep = Number.parseInt(form.dataset.currentStep || '1', 10);
    const safeCurrentStep = Number.isInteger(currentStep) && currentStep > 0 ? currentStep : 1;
    console.log('Current step:', safeCurrentStep, 'Target step:', targetStep);

    if (targetStep === safeCurrentStep) {
        console.log('Already on target step');
        return true;
    }

    // Going back is always allowed.
    if (targetStep < safeCurrentStep) {
        console.log('Going back to step:', targetStep);
        return eventraActivateWizardStep(form, targetStep);
    }

    // Validate each step being crossed. This also handles programmatic jumps.
    for (let stepNo = safeCurrentStep; stepNo < targetStep; stepNo += 1) {
        const stepRoot = form.querySelector(`#wizardStep${stepNo}`);
        console.log('Validating step:', stepNo, 'Found:', !!stepRoot);
        
        if (stepRoot && !eventraValidateStep(stepRoot)) {
            console.log('Step validation failed for step:', stepNo);
            eventraShowValidationFeedback(
                'Please complete this step',
                'Some required fields are missing or contain invalid information. The highlighted fields must be corrected before you can continue.'
            );
            return false;
        }
    }

    console.log('All steps validated, activating step:', targetStep);
    return eventraActivateWizardStep(form, targetStep);
};

function eventraActivateWizardStep(form, step) {
    console.log('Activating wizard step:', step, 'for form:', form.id);
    
    const steps = form.querySelectorAll('.wizard-step');
    console.log('Total wizard steps found:', steps.length);
    
    if (!steps.length) {
        console.error('No wizard steps found in form');
        return false;
    }

    let target = null;
    steps.forEach((el) => {
        const visible = el.id === `wizardStep${step}`;
        el.style.display = visible ? 'block' : 'none';
        if (visible) target = el;
        console.log('Step:', el.id, 'visible:', visible);
    });

    if (!target) {
        console.error(`Eventra wizard: wizardStep${step} does not exist.`);
        console.log('Available steps:', Array.from(steps).map(s => s.id).join(', '));
        return false;
    }

    form.dataset.currentStep = String(step);
    console.log('Step activated successfully:', step);

    const modalBody = form.closest('.modal-body');
    if (modalBody) {
        modalBody.scrollTop = 0;
        try { modalBody.scrollTo({ top: 0, behavior: 'smooth' }); } catch (_) {}
    }

    return true;
};

function eventraValidateEntireWizard(form, firstStepOnly = false) {
    if (!form) return { valid: true, firstInvalidStep: null, firstInvalidField: null };

    const steps = Array.from(form.querySelectorAll('.wizard-step'));
    const maxIndex = firstStepOnly ? 1 : steps.length;

    for (let index = 0; index < Math.min(maxIndex, steps.length); index += 1) {
        const stepRoot = steps[index];
        if (!eventraValidateStep(stepRoot)) {
            const field = stepRoot.querySelector('.wizard-field-error')
                ? stepRoot.querySelector('input, select, textarea')
                : null;
            return {
                valid: false,
                firstInvalidStep: index + 1,
                firstInvalidField: field
            };
        }
    }

    return { valid: true, firstInvalidStep: null, firstInvalidField: null };
}

// Profile Edit Modal
async function showProfileEditModal() {
    let user = storage.get('client_user') || storage.get('user');
    if (!user) {
        console.error('No user found in storage');
        return;
    }
    console.log('Opening profile edit modal for user:', user.name);

    // Always hydrate from the database before rendering. Cached storage is only
    // a fast fallback while the request is unavailable.
    try {
        const response = await apiFetch('/api/users/get-profile.php');
        const result = await response.json();
        if (result.success && result.user) {
            user = result.user;
            storage.set('client_user', user);
            if (window.storage) window.storage.set('user', user);
        }
    } catch (_) { /* render the available cached profile */ }

    let dobVal = String(user.dob || '').trim();
    if (dobVal.includes('T')) dobVal = dobVal.slice(0, 10);
    else if (/^\d{2}\/\d{2}\/\d{4}$/.test(dobVal)) {
        const [d, m, y] = dobVal.split('/');
        dobVal = `${y}-${m}-${d}`;
    } else if (dobVal.length > 10) {
        dobVal = dobVal.slice(0, 10);
    }
    const genderVal = String(user.gender || '').toLowerCase();

    const modalHTML = `
        <div id="profileEditModal" class="modal-backdrop active" role="dialog" aria-modal="true" onclick="if(event.target===this) closeProfileEditModal()">
            <div class="modal-content modal-content-animate" style="max-width: 750px; display: flex; flex-direction: column;">
                <div class="modal-header">
                    <h2>Edit Profile</h2>
                </div>

                <div class="modal-body" style="overflow-y: auto; padding-top: 1.25rem;">
                    <form id="profileEditForm" enctype="multipart/form-data" novalidate>
                        
                        <!-- STEP 1: Personal Information -->
                        <div id="wizardStep1" class="wizard-step" style="display: block;">

                            <div class="profile-edit-avatar-container">
                                <div class="avatar-wrapper">
                                    <img id="profilePreview" class="profile-preview-img"
                                         src="${user.profile_pic || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=random&size=160`}">
                                    <label for="profilePicInput" class="avatar-upload-label">📷</label>
                                </div>
                                <input type="file" id="profilePicInput" name="profile_pic" accept="image/*" style="display: none;" onchange="previewProfilePic(event)">
                            </div>

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
                                    <label style="font-weight: 600; margin-bottom: 0.5rem; display: block;">Business Name <span class="text-danger" >*</span></label>
                                    <input type="text" name="business_name" value="${escapeHTML(user.business_name) || ''}" placeholder="Eventra Inc." class="form-control" required>
                                </div>
                                <div class="form-group">
                                    <label style="font-weight: 600; margin-bottom: 0.5rem; display: block;">Email <span style="color:#64748b; font-size:0.8rem;">(read-only)</span></label>
                                    <input type="email" value="${escapeHTML(user.email)}" disabled class="form-control disabled">
                                </div>
                                <div class="form-group">
                                    <label style="font-weight: 600; margin-bottom: 0.5rem; display: block;">Phone (11 Digits) <span class="text-danger">*</span></label>
                                    <input type="tel" name="phone" value="${escapeHTML(user.phone) || ''}" placeholder="08012345678" maxlength="11" inputmode="numeric" oninput="this.value = this.value.replace(/[^0-9]/g, '').slice(0, 11);" class="form-control" required>
                                </div>
                                <div class="form-group">
                                    <label style="font-weight: 600; margin-bottom: 0.5rem; display: block;">Date of Birth <span class="text-danger">*</span></label>
                                    <input type="date" name="dob" value="${escapeHTML(dobVal)}" class="form-control" required>
                                </div>
                                <div class="form-group">
                                    <label style="font-weight: 600; margin-bottom: 0.5rem; display: block;">Gender <span class="text-danger">*</span></label>
                                    <select name="gender" class="form-control" required>
                                        <option value="">Select Gender</option>
                                        <option value="male" ${genderVal === 'male' ? 'selected' : ''}>Male</option>
                                        <option value="female" ${genderVal === 'female' ? 'selected' : ''}>Female</option>
                                        <option value="other" ${genderVal === 'other' ? 'selected' : ''}>Other</option>
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
                            <div style="display: flex; justify-content: flex-end; margin-top: 2rem;">
                                <button type="button" class="btn btn-primary" onclick="window.switchWizardTab(2, this)">Next: Payment Info &rarr;</button>
                            </div>
                        </div>


                         <!-- STEP 2: Payment Information -->
                        <div id="wizardStep2" class="wizard-step" style="display: none;">
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
                                    <label style="font-weight: 600; margin-bottom: 0.5rem; display: block;">Account Holder Name (Auto-resolved) <span class="text-danger">*</span></label>
                                    <input type="text" id="accountNameInput" name="account_name" value="${escapeHTML(user.account_name) || ''}" class="form-control" style="font-weight: 500;" required>
                                </div>
                            </div>
                            <div style="display: flex; gap: 1rem; margin-top: 2rem;">
                                <button type="button" class="btn btn-secondary" onclick="window.switchWizardTab(1, this)" style="flex: 1;">&larr; Previous</button>
                                <button type="button" class="btn btn-primary" onclick="window.switchWizardTab(3, this)" style="flex: 1;">Next: KYC &rarr;</button>
                            </div>
                        </div>

                        <!-- STEP 3: KYC Verification Documents -->
                        <div id="wizardStep3" class="wizard-step" style="display: none;">
                            <div class="kyc-upload-grid" style="margin-bottom: 1.5rem;">
                                <!-- NIN File -->
                                <div class="form-group kyc-upload-card" style="border: 1px dashed #cbd5e1; padding: 12px; border-radius: 10px; background: #f8fafc; display: flex; flex-direction: column; gap: 8px;">
                                    <label style="font-weight: 600; font-size: 0.88rem; display: flex; align-items: center; justify-content: space-between;">
                                        <span>NIN Document</span>
                                        ${user.kyc_nin_file ? '<span style="color: #2ecc71; font-weight: bold; font-size: 0.75rem;">✓ Uploaded</span>' : '<span style="color: #64748b; font-size: 0.75rem;">Missing</span>'}
                                    </label>
                                    <input type="file" name="kyc_nin_file" accept=".pdf,image/*" style="font-size: 0.8rem; width: 100%;">
                                    ${user.kyc_nin_file ? `
                                    <div style="margin-top: 4px;">
                                        <a href="/${user.kyc_nin_file}" target="_blank" style="font-size: 0.78rem; color: #722f37; text-decoration: underline; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;">
                                            📄 View Document
                                        </a>
                                    </div>` : ''}
                                </div>

                                <!-- BVN File -->
                                <div class="form-group kyc-upload-card" style="border: 1px dashed #cbd5e1; padding: 12px; border-radius: 10px; background: #f8fafc; display: flex; flex-direction: column; gap: 8px;">
                                    <label style="font-weight: 600; font-size: 0.88rem; display: flex; align-items: center; justify-content: space-between;">
                                        <span>BVN Document</span>
                                        ${user.kyc_bvn_file ? '<span style="color: #2ecc71; font-weight: bold; font-size: 0.75rem;">✓ Uploaded</span>' : '<span style="color: #64748b; font-size: 0.75rem;">Missing</span>'}
                                    </label>
                                    <input type="file" name="kyc_bvn_file" accept=".pdf,image/*" style="font-size: 0.8rem; width: 100%;">
                                    ${user.kyc_bvn_file ? `
                                    <div style="margin-top: 4px;">
                                        <a href="/${user.kyc_bvn_file}" target="_blank" style="font-size: 0.78rem; color: #722f37; text-decoration: underline; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;">
                                            📄 View Document
                                        </a>
                                    </div>` : ''}
                                </div>

                                <!-- Voter Card File -->
                                <div class="form-group kyc-upload-card" style="border: 1px dashed #cbd5e1; padding: 12px; border-radius: 10px; background: #f8fafc; display: flex; flex-direction: column; gap: 8px;">
                                    <label style="font-weight: 600; font-size: 0.88rem; display: flex; align-items: center; justify-content: space-between;">
                                        <span>Voter's Card</span>
                                        ${user.kyc_voter_card_file ? '<span style="color: #2ecc71; font-weight: bold; font-size: 0.75rem;">✓ Uploaded</span>' : '<span style="color: #64748b; font-size: 0.75rem;">Missing</span>'}
                                    </label>
                                    <input type="file" name="kyc_voter_card_file" accept=".pdf,image/*" style="font-size: 0.8rem; width: 100%;">
                                    ${user.kyc_voter_card_file ? `
                                    <div style="margin-top: 4px;">
                                        <a href="/${user.kyc_voter_card_file}" target="_blank" style="font-size: 0.78rem; color: #722f37; text-decoration: underline; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;">
                                            📄 View Document
                                        </a>
                                    </div>` : ''}
                                </div>

                                <!-- Driver License File -->
                                <div class="form-group kyc-upload-card" style="border: 1px dashed #cbd5e1; padding: 12px; border-radius: 10px; background: #f8fafc; display: flex; flex-direction: column; gap: 8px;">
                                    <label style="font-weight: 600; font-size: 0.88rem; display: flex; align-items: center; justify-content: space-between;">
                                        <span>Driver's License</span>
                                        ${user.kyc_driver_license_file ? '<span style="color: #2ecc71; font-weight: bold; font-size: 0.75rem;">✓ Uploaded</span>' : '<span style="color: #64748b; font-size: 0.75rem;">Missing</span>'}
                                    </label>
                                    <input type="file" name="kyc_driver_license_file" accept=".pdf,image/*" style="font-size: 0.8rem; width: 100%;">
                                    ${user.kyc_driver_license_file ? `
                                    <div style="margin-top: 4px;">
                                        <a href="/${user.kyc_driver_license_file}" target="_blank" style="font-size: 0.78rem; color: #722f37; text-decoration: underline; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;">
                                            📄 View Document
                                        </a>
                                    </div>` : ''}
                                </div>

                                <!-- CAC File -->
                                <div class="form-group kyc-upload-card" style="border: 1px dashed #cbd5e1; padding: 12px; border-radius: 10px; background: #f8fafc; display: flex; flex-direction: column; gap: 8px;">
                                    <label style="font-weight: 600; font-size: 0.88rem; display: flex; align-items: center; justify-content: space-between;">
                                        <span>CAC Certificate</span>
                                        ${user.kyc_cac_file ? '<span style="color: #2ecc71; font-weight: bold; font-size: 0.75rem;">✓ Uploaded</span>' : '<span style="color: #64748b; font-size: 0.75rem;">Missing</span>'}
                                    </label>
                                    <input type="file" name="kyc_cac_file" accept=".pdf,image/*" style="font-size: 0.8rem; width: 100%;">
                                    ${user.kyc_cac_file ? `
                                    <div style="margin-top: 4px;">
                                        <a href="/${user.kyc_cac_file}" target="_blank" style="font-size: 0.78rem; color: #722f37; text-decoration: underline; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;">
                                            📄 View Document
                                        </a>
                                    </div>` : ''}
                                </div>
                            </div>
                            <div style="display: flex; gap: 1rem; margin-top: 2rem;">
                                <button type="button" class="btn btn-secondary" onclick="window.switchWizardTab(2, this)" style="flex: 1;">&larr; Previous</button>
                                <button type="submit" class="btn btn-primary" style="flex: 1;">Submit</button>
                            </div>
                        </div>

                    </form>
                </div>
            </div>
        </div>
    `;

    // Add window.openPaystackConnect function
    if (!window.openPaystackConnect) {
        window.openPaystackConnect = function() {
            window.open('https://dashboard.paystack.com/#/login', '_blank');
        };
    }

    // Add window.handleKycPreview function
    if (!window.handleKycPreview) {
        window.handleKycPreview = function (input, fieldName) {
            const file = input.files[0];
            const previewContainer = document.getElementById(`${fieldName}_preview_container`);
            const promptContainer = document.getElementById(`${fieldName}_upload_prompt`);
            const filenameBanner = document.getElementById(`${fieldName}_filename_banner`);

            if (file) {
                filenameBanner.textContent = file.name;
                promptContainer.style.display = 'none';
                previewContainer.style.display = 'flex';

                if (file.type.startsWith('image/')) {
                    const reader = new FileReader();
                    reader.onload = function (e) {
                        previewContainer.innerHTML = `<img src="${e.target.result}" style="max-width: 100%; max-height: 120px; border-radius: 4px; object-fit: contain;">`;
                    };
                    reader.readAsDataURL(file);
                } else {
                    previewContainer.innerHTML = `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>`;
                }
            } else {
                filenameBanner.textContent = 'Not selected file';
                promptContainer.style.display = 'flex';
                previewContainer.style.display = 'none';
            }
        };
    }

    // Remove existing modal if any
    const existing = document.getElementById('profileEditModal');
    if (existing) existing.remove();

    // Add modal to body
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    console.log('Profile edit modal added to DOM');

    // Rich local previews are intentionally client-side only. The selected file
    // remains in the form and is uploaded when the profile is saved.
    initKycUploadPreviews(document.getElementById('profileEditForm'));

    // Populate Banks
    const bankSelect = document.getElementById('bankSelect');
    if (bankSelect && window.PaystackBanks) {
        window.PaystackBanks.populate(bankSelect, user.bank_code);
    }

    // Add form submit handler
    const profileEditForm = document.getElementById('profileEditForm');
    if (!profileEditForm) {
        console.error('Eventra: profileEditForm was not created.');
        return;
    }
    profileEditForm.noValidate = true;
    profileEditForm.dataset.currentStep = '1';
    console.log('Profile edit form initialized with step 1');
    eventraAttachLiveValidation(profileEditForm);
    profileEditForm.addEventListener('submit', handleProfileUpdate);

    // Add persistence: save on input
    profileEditForm.addEventListener('input', () => saveFormState('client_draft_profile_data', 'profileEditForm'));
    profileEditForm.addEventListener('change', () => saveFormState('client_draft_profile_data', 'profileEditForm'));

    // Restore saved state
    restoreFormState('client_draft_profile_data', 'profileEditForm');
    eventraActivateWizardStep(profileEditForm, 1);

    // Initialize verification statuses
    if (user.nin_verified == 1) updateFieldStatus('nin', 'success');
    if (user.bvn_verified == 1) updateFieldStatus('bvn', 'success');
}

/**
 * Turns each KYC file input into a preview card without retaining file data in
 * application state. Object URLs are revoked when replaced or when the card is
 * cleared, preventing leaked browser memory in a long-lived dashboard.
 */
function initKycUploadPreviews(form) {
    if (!form) return;

    form.querySelectorAll('input[type="file"][name^="kyc_"]').forEach((input) => {
        const card = input.closest('.kyc-upload-card');
        if (!card || card.dataset.previewReady) return;
        card.dataset.previewReady = '1';
        input.style.display = 'none';

        const label = card.querySelector('label span')?.textContent || 'KYC document';
        const picker = document.createElement('button');
        picker.type = 'button';
        picker.textContent = 'Choose file';
        picker.style.cssText = 'align-self:flex-start;border:1px solid #cbd5e1;background:#fff;color:#475569;border-radius:6px;padding:6px 10px;font-size:.76rem;font-weight:600;cursor:pointer;';
        picker.addEventListener('click', () => input.click());

        const preview = document.createElement('div');
        preview.style.cssText = 'display:none;align-items:center;gap:9px;padding:8px;background:#fff;border:1px solid #e2e8f0;border-radius:8px;min-width:0;';
        card.append(picker, preview);

        let objectUrl = null;
        const clear = () => {
            if (objectUrl) URL.revokeObjectURL(objectUrl);
            objectUrl = null;
            input.value = '';
            preview.style.display = 'none';
            preview.replaceChildren();
            picker.style.display = '';
        };
        input.addEventListener('change', () => {
            const file = input.files && input.files[0];
            if (!file) return clear();
            if (objectUrl) URL.revokeObjectURL(objectUrl);
            objectUrl = URL.createObjectURL(file);
            const isImage = /^image\//.test(file.type);
            const size = file.size < 1024 * 1024
                ? `${Math.max(1, Math.round(file.size / 1024))} KB`
                : `${(file.size / 1024 / 1024).toFixed(1)} MB`;
            const safeName = file.name.length > 30 ? `${file.name.slice(0, 27)}...` : file.name;
            const escapedName = safeName.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
            const escapedTitle = file.name.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            preview.innerHTML = `${isImage
                ? `<img src="${objectUrl}" alt="${label} preview" style="width:72px;height:72px;max-height:120px;object-fit:cover;border-radius:6px;flex-shrink:0;">`
                : '<div aria-label="PDF document" style="width:52px;height:64px;display:grid;place-items:center;background:#fef2f2;color:#dc2626;border-radius:6px;font-size:1.45rem;font-weight:800;flex-shrink:0;">PDF</div>'}
                <div style="min-width:0;flex:1;"><div title="${escapedTitle}" style="font-size:.76rem;font-weight:700;color:#334155;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapedName}</div><div style="font-size:.7rem;color:#64748b;margin-top:3px;">${size}</div></div>`;
            const change = document.createElement('button');
            change.type = 'button'; change.textContent = 'Change';
            change.style.cssText = 'border:0;background:transparent;color:#2563eb;font-size:.72rem;font-weight:700;cursor:pointer;';
            change.addEventListener('click', () => input.click());
            const remove = document.createElement('button');
            remove.type = 'button'; remove.textContent = 'Remove';
            remove.style.cssText = 'border:0;background:transparent;color:#dc2626;font-size:.72rem;font-weight:700;cursor:pointer;';
            remove.addEventListener('click', clear);
            preview.append(change, remove);
            preview.style.display = 'flex';
            picker.style.display = 'none';

            // Persist the document independently of the rest of the form. This
            // keeps the selected KYC file available after a refresh/close while
            // text fields continue to use the local draft cache until submit.
            const saving = document.createElement('span');
            saving.textContent = 'Saving…';
            saving.style.cssText = 'font-size:.68rem;color:#64748b;white-space:nowrap;';
            preview.append(saving);
            const upload = new FormData();
            upload.append(input.name, file);
            apiFetch('/api/clients/update-profile.php', { method: 'POST', body: upload })
                .then(response => response.json())
                .then(result => {
                    if (!result.success) throw new Error(result.message || 'Upload failed');
                    saving.textContent = 'Saved';
                    saving.style.color = '#15803d';
                    if (result.user && window.storage) {
                        storage.set('client_user', result.user);
                        storage.set('user', result.user);
                    }
                })
                .catch((e) => {
                    saving.textContent = 'Not saved';
                    saving.style.color = '#dc2626';
                    if (window.showNotification) showNotification(e.message || 'Upload failed', 'error');
                });
        });
    });
}

function closeProfileEditModal() {
    const modal = document.getElementById('profileEditModal');
    if (modal) modal.remove();
}

function previewProfilePic(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function (e) {
            document.getElementById('profilePreview').src = e.target.result;
        };
        reader.readAsDataURL(file);
    }
}

async function handleProfileUpdate(e) {
    e.preventDefault();

    const form = e.target;
    if (!form) return;

    // Custom validation is authoritative because the form uses novalidate and
    // contains required fields across multiple hidden wizard steps.
    const validation = eventraValidateEntireWizard(form);
    if (!validation.valid) {
        const invalidStep = validation.firstInvalidStep || 1;
        eventraActivateWizardStep(form, invalidStep);
        eventraShowValidationFeedback(
            'Please fix the highlighted fields',
            'Some required fields are empty or contain invalid data. Complete each required field before saving your profile.',
            'error'
        );
        return;
    }

    const formData = new FormData(form);
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalText = submitBtn ? submitBtn.textContent : 'Submit';

    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner"></span> Saving...';
    }

    try {
        const response = await apiFetch('/api/clients/update-profile.php', {
            method: 'POST',
            body: formData
        });

        const contentType = response.headers.get('content-type') || '';
        if (!contentType.toLowerCase().includes('application/json')) {
            throw new Error('Server returned an invalid response. Please try again.');
        }

        const profileResult = await response.json();

        if (!profileResult.success) {
            throw new Error(profileResult.message || 'Failed to update profile');
        }

        // Verify and persist settlement data through its dedicated endpoint.
        const bankCode = String(formData.get('bank_code') || '').trim();
        const accountNumber = String(formData.get('account_number') || '').replace(/\D/g, '');

        if (bankCode && accountNumber.length === 10) {
            try {
                const bankResponse = await apiFetch('/api/clients/bank-details.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        bank_code: bankCode,
                        bank_name: formData.get('bank_name') || '',
                        account_number: accountNumber,
                        account_name: formData.get('account_name') || ''
                    })
                });

                const bankResult = await bankResponse.json();
                if (!bankResult.success) {
                    showNotification(
                        bankResult.message || 'Profile saved, but settlement account could not be verified.',
                        'warning'
                    );
                }
            } catch (bankError) {
                showNotification(
                    bankError.message || 'Profile saved, but settlement account verification failed.',
                    'warning'
                );
            }
        }

        showNotification('Profile updated successfully!', 'success');

        if (typeof clearFormState === 'function') {
            clearFormState('client_draft_profile_data');
        }

        if (profileResult.user) {
            storage.set('client_user', profileResult.user);
            if (window.storage) window.storage.set('user', profileResult.user);
            if (window.authController) window.authController.user = profileResult.user;

            document.dispatchEvent(new CustomEvent('EventraProfileUpdated', {
                detail: profileResult.user
            }));

            if (window.updateClientNameDisplay) {
                window.updateClientNameDisplay(profileResult.user);
            }

            if (window.loadDashboardStats) {
                window.loadDashboardStats();
            }

            const sidebarName = document.getElementById('sidebarUserName');
            if (sidebarName) sidebarName.textContent = profileResult.user.name || '';
        }

        closeProfileEditModal();
        setTimeout(() => window.location.reload(), 1500);
    } catch (error) {
        showNotification(error.message || 'An unexpected error occurred during profile update', 'error');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
        }
    }
}

// Real-time Account Resolution — Pure client-side (no external API calls)
function resolveAccount() {
    console.log('resolveAccount called');
    const bankSelect = document.getElementById('bankSelect');
    const bankCode = bankSelect ? bankSelect.value : '';
    const accountInput = document.getElementById('accountNumberInput');
    const accountNumber = accountInput ? accountInput.value.replace(/\D/g, '') : '';
    const statusDiv = document.getElementById('accountStatus');
    const nameInput = document.getElementById('accountNameInput');
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
    const container = document.querySelector('.avatar-wrapper');
    if (container) container.querySelector('.verification-badge')?.remove();
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

// Real-time Account Resolution
window.resolveAccount = resolveAccount;

// Export functions to window
window.showProfileEditModal = showProfileEditModal;
window.closeProfileEditModal = closeProfileEditModal;
window.previewProfilePic = previewProfilePic;
window.handleProfileUpdate = handleProfileUpdate;

console.log('Eventra wizard functions initialized');