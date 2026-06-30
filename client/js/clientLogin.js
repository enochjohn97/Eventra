document.addEventListener('DOMContentLoaded', () => {
    const basePath = getBasePath();
    const loginForm = document.getElementById('loginForm');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const rememberMeInput = document.getElementById('rememberMe');
    const togglePassword = document.getElementById('togglePassword');
    const loginButton = document.getElementById('loginButton');
    const successMessage = document.getElementById('successMessage');
    const forgotPasswordLink = document.querySelector('.forgot-password');

    // Role Context (Detected from URL role/intent or body data-intent)
    const urlParams = new URLSearchParams(window.location.search);
    const roleParam = urlParams.get('role');
    const intentParam = urlParams.get('intent');
    const trigger = urlParams.get('trigger');
    
    // Final intent resolution
    let intent = roleParam || intentParam || document.body.getAttribute('data-intent') || 'client';

    // Special case: if we are clearly in the public scope and no intent is forced, 
    // we might want to default to 'user' for discovery, but for this login page, 'client' is the standard.
    const isHomepageFlow = intent === 'user' || trigger === 'google';
    if (isHomepageFlow) intent = 'user';


    // Role-Specific UI Adjustments
    // Role-Specific UI Adjustments
    if (intent === 'client') {
        document.title = "Client Login - Eventra";
        const sliderText = document.querySelector('.slider-text');
        if (sliderText) sliderText.style.display = 'none';
    } else if (intent === 'user') {
        // Users should only use Google Sign-in via the homepage modal
        window.location.href = '../../public/pages/index.html';
        return;
    }

    // Check for session timeout error
    if (urlParams.get('error') === 'session_timeout') {
        setTimeout(() => {
            if (typeof Swal !== 'undefined') {
                Swal.fire({
                    icon: 'warning',
                    title: 'Session Expired',
                    text: 'Your session has timed out. Please log in again to continue.',
                    toast: true,
                    position: 'top-end',
                    showConfirmButton: false,
                    timer: 5000,
                    timerProgressBar: true,
                    background: '#1e293b',
                    color: '#fff'
                });
            } else {
                showNotification('Your session has expired. Please log in again.', 'error');
            }
        }, 500);
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
            
            // Re-create icons for the new element
            if (window.lucide) {
                window.lucide.createIcons();
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
        if (inputElement) inputElement.classList.add('error');
    }

    function resetErrors() {
        document.querySelectorAll('.error-message').forEach(err => err.style.display = 'none');
        document.querySelectorAll('.form-input').forEach(input => input.classList.remove('error'));
    }

    // Helper to detect project root depth
    function getBasePath() {
        const path = window.location.pathname;
        // If we are in /public/pages/ or similar depth 2 path
        if (path.includes('/pages/')) return '../../';
        // If we are in /admin/ or /client/ (depth 1)
        return '../';
    }


    // Add form submission listener
    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            handleLogin();
        });
    }

    // Forgot Password Link Handler
    if (forgotPasswordLink) {
        forgotPasswordLink.addEventListener('click', (e) => {
            e.preventDefault();
            handleForgotPassword();
        });
    }

    async function handleLogin() {
        const originalBtnText = loginButton.innerHTML;
        loginButton.disabled = true;
        loginButton.innerHTML = '<span class="spinner"></span> Logging in...';

        try {
            const response = await apiFetch('/api/clients/login.php', {
                method: 'POST',
                body: JSON.stringify({
                    email: emailInput.value,
                    password: passwordInput.value,
                    remember_me: rememberMeInput?.checked || false,
                    intent: intent
                })
            });

            const contentType = response.headers.get("content-type");
            if (!contentType || !contentType.includes("application/json")) {
                const text = await response.text();
                throw new Error("Server returned non-JSON response. Status: " + response.status);
            }

            const result = await response.json();
            
            // DEBUG: Log the API response for troubleshooting
            console.log("Login API Response:", result);

            const isOtpStep = result.success || result.status === 'success' || result.otp_required || result.next_step === 'otp_verification';

            if (isOtpStep && (result.otp_required || result.next_step === 'otp_verification')) {
                // --- CUSTOM OTP MODAL FLOW ---
                loginButton.innerHTML = originalBtnText;
                loginButton.disabled = false;

                const otpModal = document.getElementById('otpModal');
                const otpForm = document.getElementById('otpForm');
                const otpCodeInput = document.getElementById('otpCode');
                const otpError = document.getElementById('otpError');
                const cancelBtn = document.getElementById('cancelOtpButton');

                if (otpModal) {
                    otpModal.style.display = 'flex';
                    otpCodeInput.focus();
                    otpError.style.display = 'none';
                    otpForm.reset();

                    // Handle Cancellation
                    cancelBtn.onclick = () => {
                        otpModal.style.display = 'none';
                        otpForm.reset();
                    };

                    // Handle Resend logic
                    const resendBtn = document.getElementById('resendOtpLink');
                    let resendCooldown = 0;
                    let cooldownTimer;

                    const startCooldown = (seconds) => {
                        resendCooldown = seconds;
                        resendBtn.style.pointerEvents = 'none';
                        resendBtn.style.opacity = '0.5';
                        
                        if (cooldownTimer) clearInterval(cooldownTimer);
                        
                        cooldownTimer = setInterval(() => {
                            resendCooldown--;
                            if (resendCooldown <= 0) {
                                clearInterval(cooldownTimer);
                                resendBtn.textContent = 'Resend Code';
                                resendBtn.style.pointerEvents = 'auto';
                                resendBtn.style.opacity = '1';
                            } else {
                                resendBtn.textContent = `Resend in ${resendCooldown}s`;
                            }
                        }, 1000);
                    };

                    if (resendBtn) {
                        resendBtn.onclick = async (e) => {
                            e.preventDefault();
                            if (resendCooldown > 0) return;

                            const originalText = resendBtn.textContent;
                            resendBtn.textContent = 'Sending...';
                            otpError.style.display = 'none';

                            try {
                                const res = await apiFetch('/api/clients/login.php', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        email: emailInput.value,
                                        password: passwordInput.value,
                                        remember_me: rememberMeInput?.checked || false,
                                        intent: intent
                                    })
                                });
                                const data = await res.json();
                                if (data.success) {
                                    if (typeof Swal !== 'undefined') {
                                        Swal.fire({
                                            icon: 'success',
                                            title: 'Code Resent',
                                            text: 'A new verification code has been sent to your email.',
                                            toast: true,
                                            position: 'top-end',
                                            showConfirmButton: false,
                                            timer: 3000,
                                            background: '#1e293b',
                                            color: '#fff'
                                        });
                                    }
                                    startCooldown(60);
                                } else {
                                    otpError.textContent = data.message || 'Failed to resend code.';
                                    otpError.style.display = 'block';
                                    resendBtn.textContent = originalText;
                                }
                            } catch (err) {
                                otpError.textContent = 'Failed to resend code. Try again.';
                                otpError.style.display = 'block';
                                resendBtn.textContent = originalText;
                            }
                        };
                    }

                    // Handle Submission
                    otpForm.onsubmit = async (e) => {
                        e.preventDefault();
                        const verifyBtn = document.getElementById('verifyOtpButton');
                        const originalVerifyText = verifyBtn.innerHTML;
                        
                        if (otpCodeInput.value.length !== 6) {
                            otpError.textContent = 'Please enter all 6 digits.';
                            otpError.style.display = 'block';
                            return;
                        }

                        verifyBtn.disabled = true;
                        verifyBtn.innerHTML = '<span class="spinner"></span> Verifying...';
                        otpError.style.display = 'none';

                        try {
                            const verifyRes = await apiFetch('/api/auth/verify-otp.php', {
                                method: 'POST',
                                body: JSON.stringify({
                                    identity: emailInput.value,
                                    auth_id: result.auth_id,
                                    otp: otpCodeInput.value,
                                    intent: 'client_login_otp'
                                })
                            });

                            const verifyResult = await verifyRes.json();

                            if (verifyResult.success) {
                                if (cooldownTimer) clearInterval(cooldownTimer);
                                otpModal.style.display = 'none';
                                
                                if (verifyResult.next_step === 'change_password') {
                                    // Trigger the password reset flow using the reset_token
                                    promptForNewPassword(verifyResult.reset_token);
                                } else {
                                    completeLoginSession(verifyResult);
                                }
                            } else {
                                otpError.textContent = verifyResult.message || 'Invalid code.';
                                otpError.style.display = 'block';
                                verifyBtn.disabled = false;
                                verifyBtn.innerHTML = originalVerifyText;
                            }
                        } catch (err) {
                            otpError.textContent = 'Verification failed. Try again.';
                            otpError.style.display = 'block';
                            verifyBtn.disabled = false;
                            verifyBtn.innerHTML = originalVerifyText;
                        }
                    };
                }
                return;
            }

            if (result.success) {
                completeLoginSession(result);
            } else {
                // Clear any stale state on failure
                if (window.authController) window.authController.clearLocalState();
                
                const msg = result.message || 'Invalid email or password';
                const isDatabaseError = msg.toLowerCase().includes('database error');
                
                if (isDatabaseError) {
                    showError('databaseErrorBanner', msg);
                } else {
                    const errorElement = msg.toLowerCase().includes('email') ? 'emailError' : 'passwordError';
                    showError(errorElement, msg);
                }
                
                loginButton.disabled = false;
                loginButton.innerHTML = originalBtnText;
            }
        } catch (error) {
            showError('databaseErrorBanner', 'A system error occurred. Please try again later.');
            loginButton.disabled = false;
            loginButton.innerHTML = originalBtnText;
        }
    }

    /**
     * Handle forced password change before login
     */
    async function promptForNewPassword(resetToken) {
        const { value: password } = await Swal.fire({
            title: 'Change Password Required',
            text: 'You must change your password before logging in.',
            input: 'password',
            inputPlaceholder: 'New Password',
            showCancelButton: true,
            confirmButtonText: 'Change Password',
            background: '#1e293b',
            color: '#fff',
            confirmButtonColor: '#2ecc71',
            inputValidator: (value) => {
                if (!value) return 'You need to write something!';
                if (value.length < 8) return 'Password must be at least 8 characters long.';
            }
        });

        if (!password) {
            Swal.fire('Login Cancelled', 'You must change your password to log in.', 'warning');
            return;
        }

        Swal.showLoading();
        try {
            const resetRes = await apiFetch('/api/auth/reset-password.php', {
                method: 'POST',
                body: JSON.stringify({ 
                    reset_token: resetToken, 
                    password: password 
                })
            });
            const resetResult = await resetRes.json();

            if (resetResult.success) {
                await Swal.fire({
                    icon: 'success',
                    title: 'Success!',
                    text: 'Password changed successfully. Please log in again with your new password.',
                    background: '#1e293b',
                    color: '#fff'
                });
                // Clear any state and let them log in again
                if (window.authController) window.authController.clearLocalState();
                window.location.reload();
            } else {
                Swal.fire('Error', resetResult.message, 'error');
            }
        } catch (error) {
            Swal.fire('Error', 'Failed to change password.', 'error');
        }
    }

    /**
     * Shared logic to finalize session after successful password or OTP verification
     */
    function completeLoginSession(result) {
        // Show Success SweetAlert
        if (typeof Swal !== 'undefined') {
            Swal.fire({
                icon: 'success',
                title: 'Login Successful',
                text: 'Welcome back!',
                toast: true,
                position: 'top-end',
                showConfirmButton: false,
                timer: 1500,
                timerProgressBar: true,
                background: '#1e293b',
                color: '#fff'
            });
        }

        // Isolate session storage by role - store BOTH user and token
        if (window.storage && typeof window.storage.setToken === 'function') {
            window.storage.setUser(result.user);
            if (result.user.token) {
                window.storage.setToken(result.user.token);
            }
        } else {
            // Fallback: store directly to localStorage if storage manager not ready
            try {
                localStorage.setItem('client_auth_token', result.user.token || '');
                localStorage.setItem('client_user', JSON.stringify(result.user));
            } catch (e) {}
        }

        // Signal a fresh login to help the auth-guard be more patient
        sessionStorage.setItem('just_logged_in', 'true');
        
        setTimeout(() => {
            const redirectUrl = result.redirect || '/client/pages/clientDashboard.html';
            
            // Use unified redirect handler if available for consistency
            if (window.authController && typeof window.authController.handleRedirect === 'function') {
                window.authController.handleRedirect(redirectUrl);
            } else {
                window.location.href = redirectUrl;
            }
        }, 1600);
    }



    // handleCredentialResponse is now handled by AuthController.handleGoogleResponse

    function parseJwt(token) {
        var base64Url = token.split('.')[1];
        var base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        var jsonPayload = decodeURIComponent(window.atob(base64).split('').map(function(c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
        return JSON.parse(jsonPayload);
    };

    // Event Image Slider Logic - Personalized for Clients
    async function initSlider() {
        const escapeHTML = window.escapeHTML || (text => text);
        const sliderContainer = document.querySelector('.slider-images');
        if (!sliderContainer) return;

        try {
            // Fetch all published events regardless of client login status
            const response = await apiFetch('/api/events/get-events.php?status=published&limit=10');
            const data = await response.json();

            if (data.success && data.events && data.events.length > 0) {
                const events = data.events.filter(e => e.image_path);
                if (events.length === 0) return;

                // Inject images
                sliderContainer.innerHTML = events.map((event, index) => {
                    const imgUrl = typeof getImageUrl === 'function' ? getImageUrl(event.image_path) : (event.image_path || '');
                    return `
                        <img src="${imgUrl}" 
                             alt="${escapeHTML(event.event_name)}" 
                             class="slider-img ${index === 0 ? 'active' : ''}" 
                             data-index="${index}">
                    `;
                }).join('');

                let currentIndex = 0;
                const updateSlider = () => {
                    const images = document.querySelectorAll('.slider-img');
                    if (images.length === 0) return;
                    
                    images[currentIndex].classList.remove('active');
                    currentIndex = (currentIndex + 1) % images.length;
                    images[currentIndex].classList.add('active');
                };

                setInterval(updateSlider, 5000);
            }
        } catch (error) {
        }
    }

    /**
     * Google Auth Logic for Clients
     */
    async function initGoogleAuth() {
        if (window.authController.state === window.authController.states.AUTHENTICATED) return;

        try {
            const response = await apiFetch('/api/config/get-google-config.php');
            const data = await response.json();

            if (data.success && data.client_id) {
                // Wait for Google SDK to load
                const googleLoaded = await new Promise((resolve) => {
                    if (typeof google !== 'undefined' && google.accounts && google.accounts.id) {
                        return resolve(true);
                    }
                    let attempts = 0;
                    const intervalId = setInterval(() => {
                        attempts++;
                        if (typeof google !== 'undefined' && google.accounts && google.accounts.id) {
                            clearInterval(intervalId);
                            resolve(true);
                        } else if (attempts >= 50) {
                            clearInterval(intervalId);
                            resolve(false);
                        }
                    }, 200);
                });

                if (googleLoaded) {
                    // Initialize Google with the client-specific container
                    window.authController.initGoogle(data.client_id, 'googleSignInContainer');
                }
            }
        } catch (error) {
            console.error('Google init failed:', error);
        }
    }

    initGoogleAuth();
    initSlider();
});

// Password Recovery Flow
async function handleForgotPassword() {
    const { value: identity } = await Swal.fire({
        title: 'Forgot Password?',
        text: 'Enter your registered email address to receive an OTP.',
        input: 'text',
        inputPlaceholder: 'Email Address',
        showCancelButton: true,
        confirmButtonText: 'Send OTP',
        background: '#1e293b',
        color: '#fff',
        confirmButtonColor: '#2ecc71'
    });

    if (!identity) return;

    Swal.showLoading();

    try {
        const response = await apiFetch('/api/auth/forgot-password.php', {
            method: 'POST',
            body: JSON.stringify({ identity })
        });
        const result = await response.json();

        if (result.success) {
            // Step 2: Prompt for OTP
            const { value: otp } = await Swal.fire({
                title: 'Verify OTP',
                text: result.message,
                input: 'text',
                inputPlaceholder: 'Enter 6-digit OTP',
                showCancelButton: true,
                confirmButtonText: 'Verify',
                background: '#1e293b',
                color: '#fff',
                confirmButtonColor: '#2ecc71',
                inputAttributes: {
                    maxlength: 6,
                    autocapitalize: 'off',
                    autocorrect: 'off'
                }
            });

            if (!otp) return;

            Swal.showLoading();
            const verifyRes = await apiFetch('/api/auth/verify-otp.php', {
                method: 'POST',
                body: JSON.stringify({ identity, otp, intent: 'password_reset' })
            });
            const verifyResult = await verifyRes.json();

            if (verifyResult.success) {
                // Step 3: Prompt for New Password
                const { value: password } = await Swal.fire({
                    title: 'Reset Password',
                    text: 'Enter your new password (minimum 8 characters).',
                    input: 'password',
                    inputPlaceholder: 'New Password',
                    showCancelButton: true,
                    confirmButtonText: 'Reset Password',
                    background: '#1e293b',
                    color: '#fff',
                    confirmButtonColor: '#2ecc71',
                    didOpen: () => {
                        const input = Swal.getInput();
                        const eyeIcon = document.createElement('i');
                        eyeIcon.className = 'fas fa-eye';
                        eyeIcon.style.position = 'absolute';
                        eyeIcon.style.right = '15px';
                        eyeIcon.style.top = '50%';
                        eyeIcon.style.transform = 'translateY(-50%)';
                        eyeIcon.style.cursor = 'pointer';
                        eyeIcon.style.color = '#94a3b8';
                        
                        input.parentNode.style.position = 'relative';
                        input.parentNode.appendChild(eyeIcon);

                        eyeIcon.addEventListener('click', () => {
                            if (input.type === 'password') {
                                input.type = 'text';
                                eyeIcon.className = 'fas fa-eye-slash';
                            } else {
                                input.type = 'password';
                                eyeIcon.className = 'fas fa-eye';
                            }
                        });
                    },
                    inputValidator: (value) => {
                        if (!value) {
                            return 'You need to write something!';
                        }
                        if (value.length < 8) {
                            return 'Password must be at least 8 characters long.';
                        }
                    }
                });

                if (!password) return;

                Swal.showLoading();
                const resetRes = await apiFetch('/api/auth/reset-password.php', {
                    method: 'POST',
                    body: JSON.stringify({ 
                        reset_token: verifyResult.reset_token, 
                        new_password: password 
                    })
                });
                const resetResult = await resetRes.json();

                if (resetResult.success) {
                    Swal.fire({
                        icon: 'success',
                        title: 'Success!',
                        text: resetResult.message,
                        background: '#1e293b',
                        color: '#fff'
                    });
                } else {
                    Swal.fire('Error', resetResult.message, 'error');
                }
            } else {
                Swal.fire('Error', verifyResult.message, 'error');
            }
        } else {
            Swal.fire('Error', result.message, 'error');
        }
    } catch (error) {
        Swal.fire('Error', 'An unexpected error occurred.', 'error');
    }
}
