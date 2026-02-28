document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const rememberMeInput = document.getElementById('rememberMe');
    const togglePassword = document.getElementById('togglePassword');
    const loginButton = document.getElementById('loginButton');
    const successMessage = document.getElementById('successMessage');
    const googleSignIn = document.getElementById('googleSignIn');
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

    //console.log("Login session initialized with intent:", intent);

    // Role-Specific UI Adjustments
    // Role-Specific UI Adjustments
    if (intent === 'client') {
        document.title = "Client Login - Eventra";
        const sliderText = document.querySelector('.slider-text');
        if (sliderText) sliderText.style.display = 'none';
       // console.log("Client context activated.");
    } else if (intent === 'user') {
        document.title = "User Login - Eventra";
        console.log("User context activated.");
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

    // Google Sign In (Immediate Trigger)
    if (googleSignIn) {
        googleSignIn.addEventListener('click', () => {
            handleGoogleSignIn();
        });
        
        // Auto-trigger if requested (e.g., from homepage)
        if (trigger === 'google' && intent === 'user') {
            handleGoogleSignIn();
        }
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
    const basePath = getBasePath();

    async function handleLogin() {
        const originalBtnText = loginButton.innerHTML;
        loginButton.disabled = true;
        loginButton.innerHTML = '<span class="spinner"></span> Logging in...';

        try {
            const loginEndpoint = intent === 'client' ? 'api/clients/login.php' : 'api/users/login.php';
            const response = await apiFetch(basePath + loginEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: emailInput.value,
                    password: passwordInput.value,
                    remember_me: rememberMeInput?.checked || false,
                })
            });

            const contentType = response.headers.get("content-type");
            if (!contentType || !contentType.includes("application/json")) {
                const text = await response.text();
                console.error("Non-JSON response received:", text);
                throw new Error("Server returned non-JSON response. Status: " + response.status);
            }

            const result = await response.json();
            console.log("Login Result:", result);

            if (result.success) {
                // Isolate session storage by role
                storage.setUser(result.user);

                // Premium Feedback
                if (typeof Swal !== 'undefined') {
                    Swal.fire({
                        icon: 'success',
                        title: 'Welcome Back!',
                        text: `Logging you in as ${result.user.name}...`,
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
                    let redirectUrl = result.redirect || 'public/pages/index.html';
                    const cleanRedirect = redirectUrl.startsWith('/') ? redirectUrl.substring(1) : redirectUrl;
                    const finalTarget = basePath + cleanRedirect;
                    window.location.href = finalTarget;
                }, 1600);
            } else {
                // If the message contains "Email", show it there, otherwise show at password
                const errorElement = result.message?.toLowerCase().includes('email') ? 'emailError' : 'passwordError';
                showError(errorElement, result.message || 'Invalid email or password');
                loginButton.disabled = false;
                loginButton.innerHTML = originalBtnText;
            }
        } catch (error) {
            console.error('Error:', error);
            showError('passwordError', 'An error occurred. Please try again later.');
            loginButton.disabled = false;
            loginButton.innerHTML = originalBtnText;
        }
    }

    async function handleGoogleSignIn() {
        // Fetch Google Client ID from server
        let clientId;
        try {
            const configResponse = await apiFetch(basePath + 'api/config/get-google-config.php');
            const configData = await configResponse.json();
            
            if (!configData.success || !configData.client_id) {
                Swal.fire('Configuration Error', 'Google Sign-in is not configured on the server. Please contact the administrator.', 'error');
                return;
            }
            
            clientId = configData.client_id;
        } catch (error) {
            console.error('Failed to fetch Google config:', error);
            Swal.fire('Error', 'Could not load Google Sign-in configuration. Please try again later.', 'error');
            return;
        }
        
        let attempts = 0;
        const attemptGoogleInit = () => {
            if (typeof google !== 'undefined') {
                try {
                    google.accounts.id.initialize({
                        client_id: clientId,
                        callback: handleCredentialResponse,
                        auto_select: false,
                        cancel_on_tap_outside: true,
                    });

                    google.accounts.id.prompt();
                } catch (error) {
                    console.error('Google Initialization Error:', error);
                    const errorMsg = 'Could not initialize Google Sign-in.\n\nPossible causes:\n- Ad blocker or privacy extension is blocking Google\n- Network connectivity issues\n- Browser security settings\n\nPlease try:\n1. Disabling ad blockers\n2. Using email/password login instead';
                    Swal.fire('Error', errorMsg, 'error');
                }
            } else if (attempts < 20) {
                attempts++;
                setTimeout(attemptGoogleInit, 100);
            } else {
                const errorMsg = 'Google Sign-in is currently blocked by your browser or an extension (e.g., ad-blocker, privacy extension).\n\nTo use Google Sign-in:\n1. Disable your ad blocker for this site\n2. Disable privacy extensions temporarily\n3. Try again\n\nAlternatively, you can sign in using email and password.';
                Swal.fire('Blocked', errorMsg, 'warning');
            }
        };
        attemptGoogleInit();
    }

    async function handleCredentialResponse(response) {
        const decodedToken = parseJwt(response.credential);
        const googleData = {
            google_id: decodedToken.sub,
            email: decodedToken.email,
            name: decodedToken.name,
            profile_pic: decodedToken.picture
        };

        try {
            const res = await apiFetch(basePath + 'api/auth/google-handler.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...googleData,
                    intent: intent
                })
            });
            
            // Handle non-JSON responses (like 405 or 500 html errors)
            const contentType = res.headers.get("content-type");
            if (!contentType || !contentType.includes("application/json")) {
                const text = await res.text();
                console.error("Non-JSON response received:", text);
                throw new Error("Server returned non-JSON response. Status: " + res.status);
            }

            const result = await res.json();

            if (result.success) {
                storage.setUser(result.user);
                
                if (typeof Swal !== 'undefined') {
                    Swal.fire({
                        icon: 'success',
                        title: 'Authenticated!',
                        text: 'Google Sign-in successful. Redirecting...',
                        timer: 1500,
                        showConfirmButton: false,
                        background: 'rgba(30, 41, 59, 0.95)',
                        color: '#fff'
                    });
                } else if (successMessage) {
                    successMessage.classList.add('show');
                    successMessage.textContent = 'Google Sign-in successful! Redirecting...';
                }

                setTimeout(() => {
                    const redirectUrl = result.redirect || 'client/pages/clientDashboard.html';
                    const cleanRedirect = redirectUrl.startsWith('/') ? redirectUrl.substring(1) : redirectUrl;
                    window.location.href = basePath + cleanRedirect;
                }, 1600);
            } else {
                Swal.fire('Login Failed', result.message, 'error');
            }
        } catch (error) {
            console.error('Error:', error);
            Swal.fire('Error', 'An error occurred during Google Sign-in.', 'error');
        }
    }

    function parseJwt(token) {
        var base64Url = token.split('.')[1];
        var base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        var jsonPayload = decodeURIComponent(window.atob(base64).split('').map(function(c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
        return JSON.parse(jsonPayload);
    };

    // Event Image Slider Logic
    async function initSlider() {
        const sliderContainer = document.querySelector('.slider-images');
        
        if (!sliderContainer) return;

        try {
            const response = await apiFetch(basePath + 'api/events/get-events.php?status=published&limit=10');
            const data = await response.json();

            if (data.success && data.events.length > 0) {
                const events = data.events.filter(e => e.image_path);
                if (events.length === 0) return;

                // Inject images (using high quality placeholder or actual path)
                sliderContainer.innerHTML = events.map((event, index) => `
                    <img src="${event.image_path}" 
                         alt="${event.event_name}" 
                         class="slider-img ${index === 0 ? 'active' : ''}" 
                         data-index="${index}">
                `).join('');

                let currentIndex = 0;
                
                const updateSlider = () => {
                    const images = document.querySelectorAll('.slider-img');
                    if (images.length === 0) return;
                    
                    images[currentIndex].classList.remove('active');
                    currentIndex = (currentIndex + 1) % images.length;
                    images[currentIndex].classList.add('active');
                };

                // Cycle every 5 seconds
                setInterval(updateSlider, 5000);
            }
        } catch (error) {
            console.error('Slider init error:', error);
        }
    }

    initSlider();
});
