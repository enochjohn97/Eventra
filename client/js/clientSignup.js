document.addEventListener('DOMContentLoaded', () => {
    const signupForm = document.getElementById('signupForm');
    const fullNameInput = document.getElementById('fullName');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const businessNameInput = document.getElementById('businessName');
    const businessNameGroup = document.getElementById('businessNameGroup');
    const signupButton = document.getElementById('signupButton');
    const successMessage = document.getElementById('successMessage');
    const togglePassword = document.getElementById('togglePassword');
    const googleSignUp = document.getElementById('googleSignUp');
    const signupTitle = document.getElementById('signupTitle');
    const loginLink = document.getElementById('loginLink');

    // Role Context (Detected from URL role/intent or body data-intent)
    const urlParams = new URLSearchParams(window.location.search);
    const roleParam = urlParams.get('role');
    const intentParam = urlParams.get('intent');
    const intent = roleParam || intentParam || document.body.getAttribute('data-intent') || 'client';

    // Role-Specific UI Adjustments
    if (intent === 'admin') {
        document.title = "Admin Registration - Eventra";
        if (googleSignUp) {
            const googleContainer = document.getElementById('googleContainer');
            const authDivider = document.getElementById('authDivider');
            if (googleContainer) googleContainer.style.display = 'none';
            if (authDivider) authDivider.style.display = 'none';
        }
        if (signupTitle) signupTitle.textContent = 'Admin Registration';
        if (signupButton) signupButton.textContent = 'Create Admin Account';
        if (loginLink) loginLink.href = `clientLogin.html?role=admin`;
        
    } else {
        if (intent === 'user') {
            window.location.href = '../../public/pages/index.html';
            return;
        }
        document.title = (intent === 'client' ? "Client" : "User") + " Registration - Eventra";
        if (signupTitle) signupTitle.textContent = (intent === 'client') ? 'Client Registration' : 'Create Account';
        if (signupButton) signupButton.textContent = (intent === 'client') ? 'Create Client Account' : 'Sign Up';
        if (loginLink) loginLink.href = `clientLogin.html?role=${intent}`;
    }

    // Handle Business Name Visibility (client only)
    if (businessNameGroup) {
        businessNameGroup.style.display = (intent === 'client') ? 'block' : 'none';
        if (businessNameInput && intent === 'client') {
            businessNameInput.required = true;
        }
    }

    // Toggle password visibility
    if (togglePassword && passwordInput) {
        togglePassword.addEventListener('click', () => {
            const isPassword = passwordInput.getAttribute('type') === 'password';
            const type = isPassword ? 'text' : 'password';
            passwordInput.setAttribute('type', type);
            
            // Update Icon
            togglePassword.innerHTML = isPassword ? 
                '<i data-lucide="eye-off" style="width: 18px; height: 18px;"></i>' : 
                '<i data-lucide="eye" style="width: 18px; height: 18px;"></i>';
            
            if (window.lucide) {
                window.lucide.createIcons();
            }
        });
    }


    // Form submission
    if (signupForm) {
        // Add persistence: save on input
        signupForm.addEventListener('input', () => saveFormState('signupForm'));
        signupForm.addEventListener('change', () => saveFormState('signupForm'));

        // Restore saved state
        restoreFormState('signupForm');

        // NO AUTO-SYNC between full name and business name – they are separate fields

        signupForm.addEventListener('submit', (e) => {
            e.preventDefault();
            
            // Basic validation
            let isValid = true;
            resetErrors();

            if (fullNameInput.value.trim().length < 2) {
                showError('fullNameError', 'Please enter your full name');
                isValid = false;
            }

            if (!validateEmail(emailInput.value)) {
                showError('emailError', 'Please enter a valid email address');
                isValid = false;
            }

            const password = passwordInput.value;
            if (password.length < 8) {
                showError('passwordError', 'Password must be at least 8 characters long.');
                isValid = false;
            }

            if (isValid) {
                handleSignup();
            }
        });
    }

    function validateEmail(email) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(String(email).toLowerCase());
    }

    function showError(elementId, message) {
        const errorElement = document.getElementById(elementId);
        if (errorElement) {
            errorElement.textContent = message;
            errorElement.style.display = 'block';
        }
        
        const inputId = elementId.replace('Error', '');
        const inputElement = document.getElementById(inputId);
        if (inputElement) {
            inputElement.classList.add('error');
        }
    }

    function resetErrors() {
        const errors = document.querySelectorAll('.error-message');
        errors.forEach(err => err.style.display = 'none');
        
        const inputs = document.querySelectorAll('.form-input');
        inputs.forEach(input => input.classList.remove('error'));
    }

    // Helper to show a general error message (not tied to a specific field)
    function showGeneralError(message) {
        // Try a dedicated general error container first
        const generalError = document.getElementById('generalError');
        if (generalError) {
            generalError.textContent = message;
            generalError.style.display = 'block';
        } else {
            // Fallback to passwordError field (common location)
            const passwordError = document.getElementById('passwordError');
            if (passwordError) {
                passwordError.textContent = message;
                passwordError.style.display = 'block';
            } else {
                // Last resort: alert (avoid if possible)
                alert(message);
            }
        }
    }

    async function handleSignup() {
        const originalBtnText = signupButton.innerHTML;
        signupButton.disabled = true;
        signupButton.innerHTML = '<span class="spinner"></span> Creating account...';

        // Clear any previous errors
        resetErrors();

        try {
            const formData = {
                name: fullNameInput.value.trim(),
                email: emailInput.value.trim(),
                password: passwordInput.value,
                business_name: businessNameInput ? businessNameInput.value.trim() : '',
                role: intent
            };

            const response = await fetch('/api/auth/register.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
                credentials: 'include'
            });

            const data = await response.json();
            console.log('✅ Registration response:', data);

            if (data.success) {
                // Success – show message and redirect to login
                if (typeof Swal !== 'undefined') {
                    Swal.fire({
                        icon: 'success',
                        title: 'Registration Successful!',
                        text: data.message || 'Your account has been created. You may now log in.',
                        timer: 2000,
                        showConfirmButton: false,
                        background: 'rgba(30, 41, 59, 0.95)',
                        color: '#fff'
                    });
                }
                
                // Clear form data
                if (typeof clearFormState === 'function') {
                    clearFormState('signupForm');
                }
                signupForm.reset();

                setTimeout(() => {
                    const loginUrl = (intent === 'admin') ? 'clientLogin.html?role=admin' : `clientLogin.html?role=${intent}`;
                    window.location.href = `${loginUrl}?registered=${encodeURIComponent(data.email || emailInput.value)}`;
                }, 2100);
            } else {
                // Backend returned success: false – show the exact error
                const errorMsg = data.message || 'Registration failed. Please try again.';
                showGeneralError(errorMsg);
                signupButton.disabled = false;
                signupButton.innerHTML = originalBtnText;
            }
        } catch (error) {
            console.error('❌ Network/parsing error:', error);
            showGeneralError('Network error. Please check your connection and try again.');
            signupButton.disabled = false;
            signupButton.innerHTML = originalBtnText;
        }
    }

    // Legacy OTP modal (kept for reference, not used in new flow)
    function showRegistrationOTPModal(email) {
        // This is a legacy function – OTP is now sent at login.
        if (typeof Swal === 'undefined') {
            alert('Please check your email for the verification code.');
            return;
        }

        Swal.fire({
            title: 'Verify Your Email',
            html: `
                <div style="text-align: left;">
                    <p style="color: #94a3b8; margin-bottom: 1.5rem; font-size: 0.95rem;">
                        We've sent a 6-digit verification code to <strong>${email}</strong>. 
                        Enter it below to complete your registration.
                    </p>
                    <div style="display: flex; justify-content: center;">
                        <input type="text" id="regOtpCode" maxlength="6" placeholder="000000" 
                               style="width: 200px; padding: 1rem; border: 2px solid #334155; background: #0f172a; color: #fff; border-radius: 12px; text-align: center; font-size: 2rem; letter-spacing: 0.5rem; font-weight: 800; font-family: monospace;" 
                               inputmode="numeric" pattern="[0-9]*">
                    </div>
                    <p style="color: #64748b; margin-top: 1.5rem; font-size: 0.85rem; text-align: center;">
                        Wait a few minutes if you don't see it, and check your spam folder.
                    </p>
                </div>
            `,
            background: 'rgba(15, 23, 42, 0.95)',
            color: '#fff',
            confirmButtonText: 'Verify & Create Account',
            confirmButtonColor: '#2563eb',
            showCancelButton: true,
            cancelButtonText: 'Cancel',
            cancelButtonColor: '#334155',
            allowOutsideClick: false,
            preConfirm: () => {
                const otp = document.getElementById('regOtpCode').value;
                if (!otp || otp.length !== 6) {
                    Swal.showValidationMessage('Please enter the 6-digit code');
                    return false;
                }
                return otp;
            }
        }).then(async (result) => {
            if (result.isConfirmed) {
                const otp = result.value;
                
                Swal.fire({
                    title: 'Verifying...',
                    allowOutsideClick: false,
                    didOpen: () => { Swal.showLoading(); }
                });

                try {
                    const response = await apiFetch('/api/auth/verify-otp.php', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            identity: email,
                            otp: otp,
                            intent: 'registration_verify'
                        })
                    });

                    const verifyResult = await response.json();

                    if (verifyResult.success) {
                        Swal.fire({
                            icon: 'success',
                            title: 'Success!',
                            text: 'Email verified. Your account is ready.',
                            timer: 2000,
                            showConfirmButton: false
                        });

                        setTimeout(() => {
                            window.location.href = verifyResult.redirect || 'clientDashboard.html';
                        }, 2100);
                    } else {
                        Swal.fire({
                            icon: 'error',
                            title: 'Verification Failed',
                            text: verifyResult.message || 'The code is invalid or expired.',
                            confirmButtonText: 'Try Again'
                        }).then(() => {
                            showRegistrationOTPModal(email);
                        });
                    }
                } catch (error) {
                    Swal.fire({
                        icon: 'error',
                        title: 'Error',
                        text: 'An error occurred during verification. Please try again.'
                    }).then(() => {
                        showRegistrationOTPModal(email);
                    });
                }
            }
        });
    }


    // Event Image Slider Logic - RESTRICTED: Clients during signup see nothing
    async function initSlider() {
        const sliderContainer = document.querySelector('.slider-images');
        if (!sliderContainer) return;

        // Requirement: New clients when signing up see nothing
        const loginRight = document.querySelector('.login-right');
        if (loginRight) loginRight.style.display = 'none';
        sliderContainer.innerHTML = '';
    }

    initSlider();
});