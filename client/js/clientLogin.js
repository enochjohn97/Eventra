document.addEventListener("DOMContentLoaded", () => {
  const basePath = getBasePath();
  const loginForm = document.getElementById("loginForm");
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const rememberMeInput = document.getElementById("rememberMe");
  const togglePassword = document.getElementById("togglePassword");
  const loginButton = document.getElementById("loginButton");
  const successMessage = document.getElementById("successMessage");
  const forgotPasswordLink = document.querySelector(".forgot-password");

  // Role Context (Detected from URL role/intent or body data-intent)
  const urlParams = new URLSearchParams(window.location.search);
  const roleParam = urlParams.get("role");
  const intentParam = urlParams.get("intent");
  const trigger = urlParams.get("trigger");

  function clearStoredLoginState() {
    const keys = [
      "admin_user",
      "admin_auth_token",
      "client_user",
      "client_auth_token",
      "user",
      "auth_token",
      "redirect_after_login",
    ];
    keys.forEach((key) => {
      try {
        localStorage.removeItem(key);
      } catch (e) {}
    });
    try {
      sessionStorage.removeItem("just_logged_in");
    } catch (e) {}
    try {
      sessionStorage.removeItem("skip_auth_redirect");
    } catch (e) {}
  }
  clearStoredLoginState();

  // Final intent resolution
  let intent =
    roleParam ||
    intentParam ||
    document.body.getAttribute("data-intent") ||
    "client";

  // Special case: if we are clearly in the public scope and no intent is forced,
  // we might want to default to 'user' for discovery, but for this login page, 'client' is the standard.
  const isHomepageFlow = intent === "user" || trigger === "google";
  if (isHomepageFlow) intent = "user";

  // Role-Specific UI Adjustments
  // Role-Specific UI Adjustments
  if (intent === "client") {
    document.title = "Client Login - EventOut";
    const sliderText = document.querySelector(".slider-text");
    if (sliderText) sliderText.style.display = "none";
  } else if (intent === "user") {
    // Users should only use Google Sign-in via the homepage modal
    window.location.href = "../../index.html";
    return;
  }

  // Check for session timeout error
  if (urlParams.get("error") === "session_timeout") {
    setTimeout(() => {
      if (typeof Swal !== "undefined") {
        Swal.fire({
          icon: "warning",
          title: "Session Expired",
          text: "Your session has timed out. Please log in again to continue.",
          toast: true,
          position: "top-end",
          showConfirmButton: false,
          timer: 5000,
          timerProgressBar: true,
          background: "#1e293b",
          color: "#fff",
        });
      } else {
        showNotification(
          "Your session has expired. Please log in again.",
          "error",
        );
      }
    }, 500);
  }

  // Toggle password visibility
  if (togglePassword && passwordInput) {
    togglePassword.addEventListener("click", () => {
      const isPassword = passwordInput.getAttribute("type") === "password";
      const type = isPassword ? "text" : "password";
      passwordInput.setAttribute("type", type);

      // Update Icon
      togglePassword.innerHTML = isPassword
        ? '<i data-lucide="eye-off" style="width: 18px; height: 18px;"></i>'
        : '<i data-lucide="eye" style="width: 18px; height: 18px;"></i>';

      // Re-create icons for the new element
      if (window.lucide) {
        window.lucide.createIcons();
      }
    });
  }

  function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    return re.test(String(email).toLowerCase());
  }

  // Field-level state helper (delegates to the shared engine when available)
  function setFieldState(inputElement, state, message) {
    if (window.eventraSetFieldState && inputElement) {
      window.eventraSetFieldState(inputElement, state, message);
    }
  }

  function showError(elementId, message) {
    const errorElement = document.getElementById(elementId);
    if (errorElement) {
      errorElement.textContent = message;
      errorElement.style.display = "block";
      errorElement.style.color = "#EF4444";
    }
    const inputId = elementId.replace("Error", "");
    const inputElement = document.getElementById(inputId);
    if (inputElement) {
      inputElement.classList.add("error");
      if (window.eventraSetFieldState)
        window.eventraSetFieldState(inputElement, "error", message);
    }
  }

  function resetErrors() {
    document
      .querySelectorAll(".error-message")
      .forEach((err) => (err.style.display = "none"));
    document
      .querySelectorAll(".form-input")
      .forEach((input) => input.classList.remove("error"));
  }

  // Helper to detect project root depth
  function getBasePath() {
    const path = window.location.pathname;
    // If we are in /public/pages/ or similar depth 2 path
    if (path.includes("/pages/")) return "../../";
    // If we are in /admin/ or /client/ (depth 1)
    return "../";
  }

  // Add form submission listener
  if (loginForm) {
    loginForm.addEventListener("submit", (e) => {
      e.preventDefault();

      // Client-side format validation before hitting the API.
      let isValid = true;
      const identity = emailInput?.value.trim() || "";
      const password = passwordInput?.value || "";

      resetErrors();

      if (!identity) {
        showError("emailError", "Email is required.");
        isValid = false;
      } else if (!validateEmail(identity)) {
        showError("emailError", "Enter a valid email address.");
        isValid = false;
      }

      if (!password) {
        showError("passwordError", "Password is required.");
        isValid = false;
      } else if (password.length < 6) {
        showError("passwordError", "Password must be at least 6 characters.");
        isValid = false;
      }

      if (isValid) {
        setFieldState(emailInput, "success");
        setFieldState(passwordInput, "success");
        handleLogin();
      }
    });
  }

  // Forgot Password Link Handler
  if (forgotPasswordLink) {
    forgotPasswordLink.addEventListener("click", (e) => {
      e.preventDefault();
      handleForgotPassword();
    });
  }

  async function handleLogin() {
    resetErrors();
    if (!emailInput?.value.trim()) {
      showError("emailError", "Username or email is required.");
      return;
    }
    if (!passwordInput?.value) {
      showError("passwordError", "Password is required.");
      return;
    }

    const originalBtnText = loginButton.innerHTML;
    loginButton.disabled = true;
    loginButton.innerHTML = '<span class="spinner"></span> Logging in...';

    try {
      const response = await apiFetch("/api/clients/login.php", {
        method: "POST",
        body: JSON.stringify({
          username: emailInput.value.trim(),
          password: passwordInput.value,
          remember_me: rememberMeInput?.checked || false,
          intent: intent,
        }),
      });

      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await response.text();
        throw new Error(
          "Server returned non-JSON response. Status: " + response.status,
        );
      }

      const result = await response.json();

      const isOtpStep =
        result.success ||
        result.status === "success" ||
        result.otp_required ||
        result.next_step === "otp_verification";

      if (
        isOtpStep &&
        (result.otp_required || result.next_step === "otp_verification")
      ) {
        // --- CUSTOM OTP MODAL FLOW ---
        loginButton.innerHTML = originalBtnText;
        loginButton.disabled = false;

        const otpModal = document.getElementById("otpModal");
        const otpForm = document.getElementById("otpForm");
        const otpCodeInput = document.getElementById("otpCode");
        const otpError = document.getElementById("otpError");
        const cancelBtn = document.getElementById("cancelOtpButton");

        if (otpModal) {
          otpModal.style.display = "flex";
          otpCodeInput.inputMode = "numeric";
          otpCodeInput.setAttribute("pattern", "[0-9]{6}");
          otpCodeInput.addEventListener("input", () => {
            otpCodeInput.value = otpCodeInput.value
              .replace(/\D/g, "")
              .slice(0, 6);
          });
          otpCodeInput.focus();
          otpError.style.display = "none";
          otpForm.reset();

          // Handle Cancellation
          cancelBtn.onclick = () => {
            otpModal.style.display = "none";
            otpForm.reset();
          };

          // Handle Resend logic
          const resendBtn = document.getElementById("resendOtpLink");
          let resendCooldown = 0;
          let cooldownTimer;

          const startCooldown = (seconds) => {
            resendCooldown = seconds;
            resendBtn.style.pointerEvents = "none";
            resendBtn.style.opacity = "0.5";

            if (cooldownTimer) clearInterval(cooldownTimer);

            cooldownTimer = setInterval(() => {
              resendCooldown--;
              if (resendCooldown <= 0) {
                clearInterval(cooldownTimer);
                resendBtn.textContent = "Resend Code";
                resendBtn.style.pointerEvents = "auto";
                resendBtn.style.opacity = "1";
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
              resendBtn.textContent = "Sending...";
              otpError.style.display = "none";

              try {
                const res = await apiFetch("/api/clients/login.php", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    username: emailInput.value.trim(),
                    password: passwordInput.value,
                    remember_me: rememberMeInput?.checked || false,
                    intent: intent,
                  }),
                });
                const data = await res.json();
                if (data.success) {
                  if (typeof Swal !== "undefined") {
                    Swal.fire({
                      icon: "success",
                      title: "Code Resent",
                      text: "A new verification code has been sent to your email.",
                      toast: true,
                      position: "top-end",
                      showConfirmButton: false,
                      timer: 3000,
                      background: "#1e293b",
                      color: "#fff",
                    });
                  }
                  startCooldown(60);
                } else {
                  otpError.textContent =
                    data.message || "Failed to resend code.";
                  otpError.style.display = "block";
                  resendBtn.textContent = originalText;
                }
              } catch (err) {
                otpError.textContent = "Failed to resend code. Try again.";
                otpError.style.display = "block";
                resendBtn.textContent = originalText;
              }
            };
          }

          // Handle Submission
          otpForm.onsubmit = async (e) => {
            e.preventDefault();
            const verifyBtn = document.getElementById("verifyOtpButton");
            const originalVerifyText = verifyBtn.innerHTML;

            if (!/^\d{6}$/.test(otpCodeInput.value)) {
              otpError.textContent = "Please enter all 6 digits.";
              otpError.style.display = "block";
              return;
            }

            verifyBtn.disabled = true;
            verifyBtn.innerHTML = '<span class="spinner"></span> Verifying...';
            otpError.style.display = "none";

            try {
              const verifyRes = await apiFetch("/api/auth/verify-otp.php", {
                method: "POST",
                body: JSON.stringify({
                  identity: emailInput.value,
                  auth_id: result.auth_id,
                  otp: otpCodeInput.value,
                  intent: "client_login_otp",
                }),
              });

              const verifyResult = await verifyRes.json();

              if (verifyResult.success) {
                if (cooldownTimer) clearInterval(cooldownTimer);
                otpModal.style.display = "none";

                if (verifyResult.next_step === "change_password") {
                  // Trigger the password reset flow using the reset_token
                  promptForNewPassword(verifyResult.reset_token);
                } else {
                  completeLoginSession(verifyResult);
                }
              } else {
                otpError.textContent = verifyResult.message || "Invalid code.";
                otpError.style.display = "block";
                verifyBtn.disabled = false;
                verifyBtn.innerHTML = originalVerifyText;
              }
            } catch (err) {
              otpError.textContent = "Verification failed. Try again.";
              otpError.style.display = "block";
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

        const msg = result.message || "Invalid username/email or password.";
        const isDatabaseError = msg.toLowerCase().includes("database error");

        if (isDatabaseError) {
          showError("databaseErrorBanner", msg);
        } else {
          const errorElement =
            msg.toLowerCase().includes("username") ||
            msg.toLowerCase().includes("email")
              ? "emailError"
              : "passwordError";
          showError(errorElement, msg);
        }

        loginButton.disabled = false;
        loginButton.innerHTML = originalBtnText;
      }
    } catch (error) {
      showError(
        "databaseErrorBanner",
        "A system error occurred. Please try again later.",
      );
      loginButton.disabled = false;
      loginButton.innerHTML = originalBtnText;
    }
  }

  /**
   * Handle forced password change before login
   */
  async function promptForNewPassword(resetToken) {
    const { value: password } = await Swal.fire({
      title: "Change Password Required",
      text: "You must change your password before logging in.",
      input: "password",
      inputPlaceholder: "New Password",
      showCancelButton: true,
      confirmButtonText: "Change Password",
      background: "#eee",
      color: "#111",
      confirmButtonColor: "#722f37",
      inputValidator: (value) => {
        if (!value) return "You need to write something!";
        if (value.length < 8)
          return "Password must be at least 8 characters long.";
      },
    });

    if (!password) {
      Swal.fire(
        "Login Cancelled",
        "You must change your password to log in.",
        "warning",
      );
      return;
    }

    Swal.showLoading();
    try {
      const resetRes = await apiFetch("/api/auth/reset-password.php", {
        method: "POST",
        body: JSON.stringify({
          reset_token: resetToken,
          password: password,
        }),
      });
      const resetResult = await resetRes.json();

      if (resetResult.success) {
        await Swal.fire({
          icon: "success",
          title: "Success!",
          text: "Password changed successfully. Please log in again with your new password.",
          background: "#eee",
          color: "#111",
        });
        // Clear any state and let them log in again
        if (window.authController) window.authController.clearLocalState();
        window.location.reload();
      } else {
        Swal.fire("Error", resetResult.message, "error");
      }
    } catch (error) {
      Swal.fire("Error", "Failed to change password.", "error");
    }
  }

  /**
   * Shared logic to finalize session after successful password or OTP verification
   */
  function completeLoginSession(result) {
    // Show Success SweetAlert
    if (typeof Swal !== "undefined") {
      Swal.fire({
        icon: "success",
        title: "Login Successful",
        text: "Welcome back!",
        toast: true,
        position: "top-end",
        showConfirmButton: false,
        timer: 1500,
        timerProgressBar: true,
        background: "#1e293b",
        color: "#fff",
      });
    }

    // Isolate session storage by role - store BOTH user and token
    if (window.storage && typeof window.storage.setToken === "function") {
      window.storage.setUser(result.user);
      if (result.user.token) {
        window.storage.setToken(result.user.token);
      }
    } else {
      // Fallback: store directly to localStorage if storage manager not ready
      try {
        localStorage.setItem("client_auth_token", result.user.token || "");
        localStorage.setItem("client_user", JSON.stringify(result.user));
      } catch (e) {}
    }

    // Signal a fresh login to help the auth-guard be more patient
    sessionStorage.setItem("just_logged_in", "true");

    setTimeout(() => {
      const redirectUrl = new URL(
        result.redirect || "/client/dashboard.html",
        window.location.origin,
      );
      redirectUrl.searchParams.set("session_refresh", Date.now().toString());

      // Use unified redirect handler if available for consistency
      if (
        window.authController &&
        typeof window.authController.handleRedirect === "function"
      ) {
        window.authController.handleRedirect(
          redirectUrl.pathname + redirectUrl.search,
        );
      } else {
        window.location.replace(redirectUrl.pathname + redirectUrl.search);
      }
    }, 1600);
  }

  // handleCredentialResponse is now handled by AuthController.handleGoogleResponse

  function parseJwt(token) {
    var base64Url = token.split(".")[1];
    var base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    var jsonPayload = decodeURIComponent(
      window
        .atob(base64)
        .split("")
        .map(function (c) {
          return "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2);
        })
        .join(""),
    );
    return JSON.parse(jsonPayload);
  }

  // Event Image Slider Logic - Personalized for Clients
  async function initSlider() {
    const escapeHTML = window.escapeHTML || ((text) => text);
    const sliderContainer = document.querySelector(".slider-images");
    if (!sliderContainer) return;

    try {
      const urlParams = new URLSearchParams(window.location.search);
      const clientId = urlParams.get("client_id");

      // Build API URL — use client-specific events if available, else general published events
      const apiUrl = clientId
        ? `/api/events/get-events.php?status=published&limit=10&client_id=${encodeURIComponent(clientId)}`
        : `/api/events/get-events.php?status=published&limit=10`;

      const response = await apiFetch(apiUrl);
      const data = await response.json();

      let events =
        data.success && Array.isArray(data.events)
          ? data.events.filter((e) => e.image_path)
          : [];

      if (events.length === 0) return;

      // Display events sequentially in their natural order (newest first) —
      // no shuffling so slides advance one after the other predictably.

      // Inject images
      sliderContainer.innerHTML = events
        .map((event, index) => {
          const cleanPath = event.image_path.replace(/^\/+/, "");
          let webPath = cleanPath;
          if (
            cleanPath.startsWith("assets/") &&
            !cleanPath.includes("public/")
          ) {
            webPath = "public/" + cleanPath;
          }
          const imgUrl =
            event.image_path.startsWith("http") ||
            event.image_path.startsWith(".")
              ? event.image_path
              : "/" + webPath;

          return `
                        <img src="${imgUrl}" 
                             alt="${escapeHTML(event.event_name)}" 
                             class="slider-img bouncy-image ${index === 0 ? "active" : ""}" 
                             data-index="${index}"
                             onerror="this.style.display='none'">
                    `;
        })
        .join("");

      let currentIndex = 0;
      const updateSlider = () => {
        const images = document.querySelectorAll(".slider-img");
        if (images.length === 0) return;

        images[currentIndex].classList.remove("active");
        currentIndex = (currentIndex + 1) % images.length;
        images[currentIndex].classList.add("active");
      };

      if (events.length > 1) setInterval(updateSlider, 5000);
    } catch (error) {
      sliderContainer.innerHTML = "";
    }
  }

  /**
   * Google Auth Logic for Clients
   */
  async function initGoogleAuth() {
    if (
      window.authController.state === window.authController.states.AUTHENTICATED
    )
      return;

    try {
      const response = await apiFetch("/api/config/get-google-config.php");
      const data = await response.json();

      if (data.success && data.client_id) {
        const googleLoaded = await window.authController.loadGoogleScript();

        if (googleLoaded) {
          // Initialize Google with the client-specific container
          window.authController.initGoogle(
            data.client_id,
            "googleSignInContainer",
          );
        }
      }
    } catch (error) {
      showNotification("Google Sign-In is temporarily unavailable.", "info");
    }
  }

  initGoogleAuth();
  initSlider();
});

// Password Recovery Flow
async function handleForgotPassword() {
  const { value: identity } = await Swal.fire({
    title: "Forgot Password?",
    text: "Enter your registered email address to receive an OTP.",
    input: "text",
    inputPlaceholder: "Email Address",
    showCancelButton: true,
    confirmButtonText: "Send OTP",
    background: "#eee",
    color: "#111",
    confirmButtonColor: "#722f37",
  });

  if (!identity) return;

  Swal.showLoading();

  try {
    const response = await apiFetch("/api/auth/forgot-password.php", {
      method: "POST",
      body: JSON.stringify({ identity }),
    });
    const result = await response.json();

    if (result.success) {
      // Step 2: Prompt for OTP
      const { value: otp } = await Swal.fire({
        title: "Verify OTP",
        text: result.message,
        input: "text",
        inputPlaceholder: "Enter 6-digit OTP",
        showCancelButton: true,
        confirmButtonText: "Verify",
        background: "#eee",
        color: "#111",
        confirmButtonColor: "#722f37",
        inputAttributes: {
          maxlength: 6,
          autocapitalize: "off",
          autocorrect: "off",
        },
      });

      if (!otp) return;

      Swal.showLoading();
      const verifyRes = await apiFetch("/api/auth/verify-otp.php", {
        method: "POST",
        body: JSON.stringify({ identity, otp, intent: "password_reset" }),
      });
      const verifyResult = await verifyRes.json();

      if (verifyResult.success) {
        // Step 3: Prompt for New Password
        const { value: password } = await Swal.fire({
          title: "Reset Password",
          text: "Enter your new password (minimum 8 characters).",
          input: "password",
          inputPlaceholder: "New Password",
          showCancelButton: true,
          confirmButtonText: "Reset Password",
          background: "#eee",
          color: "#111",
          confirmButtonColor: "#722f37",
          inputValidator: (value) => {
            if (!value) {
              return "You need to write something!";
            }
            if (value.length < 8) {
              return "Password must be at least 8 characters long.";
            }
          },
        });

        if (!password) return;

        Swal.showLoading();
        const resetRes = await apiFetch("/api/auth/reset-password.php", {
          method: "POST",
          body: JSON.stringify({
            reset_token: verifyResult.reset_token,
            new_password: password,
          }),
        });
        const resetResult = await resetRes.json();

        if (resetResult.success) {
          Swal.fire({
            icon: "success",
            title: "Success!",
            text: resetResult.message,
            background: "#eee",
            color: "#111",
          });
        } else {
          Swal.fire("Error", resetResult.message, "error");
        }
      } else {
        Swal.fire("Error", verifyResult.message, "error");
      }
    } else {
      Swal.fire("Error", result.message, "error");
    }
  } catch (error) {
    Swal.fire("Error", "An unexpected error occurred.", "error");
  }
}
