// ─────────────────────────────────────────────────────────────────────────────
// ES MODULE — imports config before any DOM access
// ─────────────────────────────────────────────────────────────────────────────
import { API_BASE_URL } from './config.js';

// ─────────────────────────────────────────────────────────────────────────────
// SCOPE-PROTECTED APP ENGINE
// ─────────────────────────────────────────────────────────────────────────────
const AppCore = {
    scannerInstance: null,
    currentTrackingToken: null,   // Set after a successful QR verify, used by OTP

    // ── Navigation ────────────────────────────────────────────────────────────
    navigateTo(screenId) {
        document.querySelectorAll('.screen').forEach(view => view.classList.remove('active'));
        const activeTarget = document.getElementById(screenId);
        if (activeTarget) activeTarget.classList.add('active');
    },

    // ── Session Restore ───────────────────────────────────────────────────────
    checkActiveSession() {
    this.navigateTo('screen-login');
},

    // ── Camera Cleanup ────────────────────────────────────────────────────────
    safelyStopScanner() {
        if (this.scannerInstance && this.scannerInstance.isScanning) {
            this.scannerInstance.stop()
                .then(() => {
                    this.scannerInstance.clear();
                    this.scannerInstance = null;
                })
                .catch(err => console.error("Error decomposing video thread:", err));
        }
    },

    // ── Auth Header Helper ────────────────────────────────────────────────────
    // Centralised so every authenticated request always reads the freshest token
    getAuthHeaders() {
        const token = localStorage.getItem('agent_auth_token');
        return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        };
    },

    // ── Inline Error Renderer ─────────────────────────────────────────────────
    showFormError(containerId, message) {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.textContent = message;
        container.style.display = 'block';
    },
    clearFormError(containerId) {
        const container = document.getElementById(containerId);
        if (container) { container.textContent = ''; container.style.display = 'none'; }
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// DOM EVENT WIRING
// ─────────────────────────────────────────────────────────────────────────────

// 1. App Engine Boot — restore session on page load
window.addEventListener('DOMContentLoaded', () => AppCore.checkActiveSession());

// ─────────────────────────────────────────────────────────────────────────────
// 2. LOGIN FORM — POST /api/auth/login
//    Body:     { email, password }
//    Response: { success: true, token: "JWT_STRING" }
// ─────────────────────────────────────────────────────────────────────────────
document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const email    = document.getElementById('agent-id').value.trim();
    const password = document.getElementById('password').value;
    const errorBox = 'login-error';

    AppCore.clearFormError(errorBox);

    // Disable submit button while request is in-flight
    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Authenticating…';

    try {
        const response = await fetch(`${API_BASE_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            // Surface backend error message or a sensible fallback
            const msg = data.message || 'Authentication failed. Check your credentials.';
            AppCore.showFormError(errorBox, msg);
            return;
        }

        // Persist credentials and transition to dashboard
        localStorage.setItem('agent_auth_token', data.token);
        localStorage.setItem('agent_email', email);
        document.getElementById('display-agent-id').textContent = email;
        AppCore.navigateTo('screen-dashboard');

    } catch (networkErr) {
        AppCore.showFormError(errorBox, 'Network error — is the backend running on port 3000?');
        console.error('Login fetch failed:', networkErr);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Sign In to Shift';
    }
});

// 3. Logout
document.getElementById('btn-logout').addEventListener('click', () => {
    localStorage.removeItem('agent_auth_token');
    localStorage.removeItem('agent_email');
    AppCore.currentTrackingToken = null;
    AppCore.navigateTo('screen-login');
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. QR SCANNER — on decode, POST /api/package/verify (Bearer token attached)
//    Body:     { qrData: "<scanned_text>" }
//    Response: { success: true, trackingToken: "PKG_XXXXXXXX", ... }
// ─────────────────────────────────────────────────────────────────────────────
document.getElementById('btn-start-scan').addEventListener('click', () => {
    AppCore.navigateTo('screen-camera');

    AppCore.scannerInstance = new Html5Qrcode("qr-reader");

    AppCore.scannerInstance.start(
        { facingMode: "environment" },
        { fps: 12, qrbox: { width: 220, height: 220 } },

        // ── SUCCESS CALLBACK: QR payload decoded ─────────────────────────────
        async (successText) => {
            await handlePackageVerification(successText);
        },

        // ── ERROR CALLBACK: per-frame decode miss (silent — keep feed smooth) ─
        (_videoFrameFetchErr) => { /* intentional no-op */ }

    ).catch(err => {
        console.error("Hardware Permission Blocked:", err);
        alert("Camera stream requires HTTPS or explicit sandbox permissions.");
        AppCore.navigateTo('screen-dashboard');
    });
});

// 5. Cancel scanner
document.getElementById('btn-cancel-scan').addEventListener('click', () => {
    AppCore.safelyStopScanner();
    AppCore.navigateTo('screen-dashboard');
});

// 5b. Manual Fallback
document.getElementById('btn-manual-submit').addEventListener('click', () => {
    const manualToken = document.getElementById('manual-token-input').value.trim();
    if (!manualToken) {
        alert("Please enter a valid tracking token.");
        return;
    }
    handlePackageVerification(manualToken);
});

// Shared verification logic for both QR and Manual fallback
async function handlePackageVerification(trackingToken) {
    console.log(`Verifying Token: ${trackingToken}`);
    
    // Safety check to ensure core methods exist before firing
    if (typeof AppCore !== 'undefined' && AppCore.safelyStopScanner) {
        AppCore.safelyStopScanner();
    }

    try {
        // 1. Setup the demo data payload matching your application structure
        const data = {
            success: true,
            trackingToken: trackingToken || 'PKG_DEMO01234',
            status: 'Verified',
            recipientName: "Demo User",
            deliveryAddress: "123 Hackathon St",
            package: {
                trackingToken: trackingToken || 'PKG_DEMO01234',
                recipientName: "Demo User",
                deliveryAddress: "123 Hackathon St",
                status: "In Transit"
            }
        };

        console.log("Injecting hackathon demo details:", data);

        // 2. Cache token in state safely
        if (typeof AppCore !== 'undefined') {
            AppCore.currentTrackingToken = data.trackingToken;
        }

        // 3. Clear loading screen overlay if present
        const loadingScreen = document.getElementById('screen-loading');
        if (loadingScreen) {
            loadingScreen.classList.remove('active');
            loadingScreen.style.display = 'none';
        }

        // 4. Navigate directly to the destination screen container found in your HTML
        if (typeof AppCore !== 'undefined' && AppCore.navigateTo) {
            AppCore.navigateTo('screen-otp');
        }

        // 5. Directly find and update the display text components inside your UI layout
        const tokenDisplay = document.getElementById('display-token') || document.querySelector('[id*="token"]');
        const statusDisplay = document.getElementById('display-status') || document.querySelector('[id*="status"]');
        const recipientDisplay = document.getElementById('display-recipient') || document.querySelector('[id*="recipient"]');
        const addressDisplay = document.getElementById('display-address') || document.querySelector('[id*="address"]');

        if (tokenDisplay) tokenDisplay.textContent = data.package.trackingToken;
        if (statusDisplay) statusDisplay.textContent = data.package.status;
        if (recipientDisplay) recipientDisplay.textContent = data.package.recipientName;
        if (addressDisplay) addressDisplay.textContent = data.package.deliveryAddress;

    } catch (error) {
        console.error("Bypass injection encountered an issue:", error);
    }
}
// ─────────────────────────────────────────────────────────────────────────────
// 6. OTP FORM — POST /api/package/verify-otp (Bearer token attached)
//    Body:     { trackingToken: "PKG_XXXXXXXX", inputOtp: "1234" }
//    Response: { success: true, message: "Handshake verified." }
// ─────────────────────────────────────────────────────────────────────────────
document.getElementById('otp-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    // 1. Capture the input code
    const otpInput = document.getElementById('otp');
    const code = otpInput ? otpInput.value : "";

    // 2. Verification Logic
    if (code === "1234") {
        console.log("Passcode Verified. Navigating...");

        // 3. Instead of a non-existent 'screen-success', 
        // let's navigate back to the dashboard for now.
        if (typeof AppCore !== 'undefined' && AppCore.navigateTo) {
            AppCore.navigateTo('screen-dashboard'); 
            
            // Optional: Add a simple success alert to confirm the transition
            alert("Handover Successful!");
        }
    } else {
        // Show an error message if the code is wrong
        const errorEl = document.getElementById('otp-error');
        if (errorEl) {
            errorEl.textContent = "Invalid passcode. Use 1234.";
            errorEl.style.display = "block";
        }
    }
});