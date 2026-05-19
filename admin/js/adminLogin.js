document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const usernameInput = document.getElementById('username');
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
    // Final intent resolution
    const intent = roleParam || intentParam || document.body.getAttribute('data-intent') || 'admin';
    // Role-Specific UI Adjustments
    if (intent === 'admin') {
        document.title = "Admin Login - Eventra";
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
                if (typeof showNotification === 'function') {
                    showNotification('Your session has expired. Please log in again.', 'error');
                }
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
    const basePath = getBasePath();

    async function handleLogin() {
        const originalBtnText = loginButton.innerHTML;
        loginButton.disabled = true;
        loginButton.innerHTML = '<span class="spinner"></span> Logging in...';

        try {
            if (!usernameInput || !passwordInput) {
                loginButton.disabled = false;
                loginButton.innerHTML = originalBtnText;
                return;
            }

            const response = await apiFetch('/api/auth/login.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    intent: 'admin',
                    username: usernameInput.value,
                    password: passwordInput.value,
                    remember_me: rememberMeInput?.checked || false,
                })
            });

            const contentType = response.headers.get("content-type");
            if (!contentType || !contentType.includes("application/json")) {
                const text = await response.text();
                throw new Error("Server returned non-JSON response. Status: " + response.status);
            }

            // apiFetch now handles non-ok responses by throwing, 
            // but for login we want to parse the JSON if it's a 200
            const result = await response.json();

            if (result.success) {
                if (window.storage && typeof window.storage.setToken === 'function') {
                    window.storage.setUser(result.user);
                    if (result.user.token) {
                        window.storage.setToken(result.user.token);
                    }
                } else {
                    // Fallback: store directly to localStorage if storage manager not ready
                    try {
                        localStorage.setItem('admin_auth_token', result.user.token || '');
                        localStorage.setItem('admin_user', JSON.stringify(result.user));
                    } catch (e) {
                    }
                }

                // Premium Feedback
                if (typeof Swal !== 'undefined') {
                    Swal.fire({
                        icon: 'success',
                        title: 'Welcome Back!',
                        text: `Logging you in as ${result.user.name || 'Admin'}...`,
                        timer: 1500,
                        showConfirmButton: false,
                        background: 'rgba(30, 41, 59, 0.95)',
                        color: '#fff',
                        backdrop: 'rgba(15, 23, 42, 0.8)'
                    });
                } else if (successMessage) {
                    successMessage.classList.add('show');
                    successMessage.textContent = 'Login successful! Redirecting...';
                }

                setTimeout(() => {
                    const redirectUrl = result.redirect || '/admin/pages/adminDashboard.html';
                    window.location.href = redirectUrl;
                }, 1600);
            } else {
                // Clear any stale state on failure
                if (window.authController) window.authController.clearLocalState();

                const errorElement = result.message?.toLowerCase().includes('username') ? 'usernameError' : 'passwordError';
                showError(errorElement, result.message || 'Invalid username or password');
                loginButton.disabled = false;
                loginButton.innerHTML = originalBtnText;
            }
        } catch (error) {
            showError('passwordError', error.message || 'An error occurred. Please try again later.');
            loginButton.disabled = false;
            loginButton.innerHTML = originalBtnText;
        }
    }


    // Event Image Slider Logic
    async function initSlider() {
        const sliderContainer = document.querySelector('.slider-images');
        if (!sliderContainer) return;

        const basePath = typeof getBasePath === 'function' ? getBasePath() : '../../';
        const escapeHTML = window.escapeHTML || (text => text);

        const showFallback = () => {
            sliderContainer.innerHTML = `
                <img src="" 
                     alt="Eventra Admin"
                     class="slider-img active">
            `;
        };

        try {
            const response = await apiFetch('/api/events/get-events.php?status=published&limit=10');
            const data = await response.json();

            if (data.success && data.events && data.events.length > 0) {
                const eventsWithImages = data.events.filter(e => e.image_path);

                if (eventsWithImages.length === 0) {
                    showFallback();
                    return;
                }

                // Inject images
                sliderContainer.innerHTML = eventsWithImages.map((event, index) => {
                    const cleanPath = event.image_path.replace(/^\/+/, '');
                    // Normalize path: Ensure it points to the correct location relative to admin/pages/
                    // If it already starts with public/, keep it. If it starts with assets/, it might be missing public/
                    let webPath = cleanPath;
                    if (cleanPath.startsWith('assets/') && !cleanPath.includes('public/')) {
                        webPath = 'public/' + cleanPath;
                    }

                    const imgUrl = event.image_path.startsWith('http') ? event.image_path : basePath + webPath;

                    return `
                        <img src="${imgUrl}" 
                             alt="${escapeHTML(event.event_name)}" 
                             class="slider-img ${index === 0 ? 'active' : ''}" 
                             data-index="${index}"
                             onerror="this.style.display='none'">
                    `;
                }).join('');

                let currentIndex = 0;
                const images = sliderContainer.querySelectorAll('.slider-img');

                if (images.length === 0) {
                    showFallback();
                    return;
                }

                const updateSlider = () => {
                    const currentImages = sliderContainer.querySelectorAll('.slider-img');
                    if (currentImages.length <= 1) return;

                    currentImages[currentIndex].classList.remove('active');
                    currentIndex = (currentIndex + 1) % currentImages.length;
                    currentImages[currentIndex].classList.add('active');
                };

                // Cycle every 5 seconds
                if (images.length > 1) {
                    setInterval(updateSlider, 5000);
                }
            } else {
                showFallback();
            }
        } catch (error) {
            console.error('Slider Error:', error);
            showFallback();
        }
    }

    initSlider();
});

// Password Recovery Flow
async function handleForgotPassword() {
    const { value: email } = await Swal.fire({
        title: 'Forgot Password?',
        text: 'Enter your registered email to receive an OTP.',
        input: 'email',
        inputPlaceholder: 'admin@eventra.com',
        showCancelButton: true,
        confirmButtonText: 'Send OTP',
        background: '#1e293b',
        color: '#fff',
        confirmButtonColor: '#2ecc71'
    });

    if (!email) return;

    Swal.showLoading();

    try {
        const response = await apiFetch('/api/auth/forgot-password.php', {
            method: 'POST',
            body: JSON.stringify({ email, intent })
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
                body: JSON.stringify({ email, otp, intent })
            });
            const verifyResult = await verifyRes.json();

            if (verifyResult.success) {
                // Step 3: Prompt for New Password
                const { value: password } = await Swal.fire({
                    title: 'Reset Password',
                    text: 'Enter your new password (min. 6 characters).',
                    input: 'password',
                    inputPlaceholder: 'New Password',
                    showCancelButton: true,
                    confirmButtonText: 'Reset Password',
                    background: '#1e293b',
                    color: '#fff',
                    confirmButtonColor: '#2ecc71'
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
