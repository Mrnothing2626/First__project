// =============================================================================
// admin.js — Admin Panel Logic (ES Module)
// =============================================================================
import { API_BASE_URL } from './config.js';

// ── State ─────────────────────────────────────────────────────────────────────
let adminToken = null;

// ── Helpers ───────────────────────────────────────────────────────────────────
const authHeaders = () => ({
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${adminToken}`
});

function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const el = document.getElementById(id);
    if (el) el.classList.add('active');
}

function showError(id, msg) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = msg;
    el.style.display = 'block';
}

function clearError(id) {
    const el = document.getElementById(id);
    if (el) { el.textContent = ''; el.style.display = 'none'; }
}

function statusBadgeClass(status) {
    const map = {
        'Order Placed':      'badge-placed',
        'In Warehouse':      'badge-warehouse',
        'Out for Delivery':  'badge-out',
        'Arrived at Sector': 'badge-arrived',
        'Delivered':         'badge-delivered',
    };
    return map[status] || 'badge-placed';
}

// ── Boot ──────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
    const saved = localStorage.getItem('admin_token');
    if (saved) {
        adminToken = saved;
        showScreen('screen-dashboard');
        document.getElementById('admin-name-display').textContent =
            localStorage.getItem('admin_name') || 'Admin';
        loadPackages();
    } else {
        showScreen('screen-login');
    }
});

// ── LOGIN ─────────────────────────────────────────────────────────────────────
document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError('login-error');

    const agentId = document.getElementById('admin-id').value.trim();
    const password = document.getElementById('admin-password').value;
    const btn = e.target.querySelector('button[type="submit"]');

    btn.disabled = true;
    btn.textContent = 'Signing in...';

    try {
        const res = await fetch(`${API_BASE_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: agentId, password })
        });

        const data = await res.json();

        if (res.ok && data.token) {
            adminToken = data.token;
            localStorage.setItem('admin_token', adminToken);
            localStorage.setItem('admin_name', data.name || agentId);

            document.getElementById('admin-name-display').textContent = data.name || agentId;
            showScreen('screen-dashboard');
            loadPackages();
        } else {
            showError('login-error', data.message || 'Invalid credentials.');
        }
    } catch (error) {
        console.error("Login error:", error);
        showError('login-error', 'Network error - is the backend running?');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Sign In';
    }
});

// ── LOGOUT ────────────────────────────────────────────────────────────────────
document.getElementById('btn-logout').addEventListener('click', () => {
    adminToken = null;
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_name');
    document.getElementById('create-form').reset();
    document.getElementById('qr-result').style.display = 'none';
    showScreen('screen-login');
});

// ── CREATE PACKAGE ────────────────────────────────────────────────────────────
document.getElementById('create-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError('create-error');

    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Creating…';

    const body = {
        customerName:  document.getElementById('customerName').value.trim(),
        phone:         document.getElementById('phone').value.trim(),
        macroLocation: document.getElementById('macroLocation').value.trim(),
        microLocation: document.getElementById('microLocation').value.trim(),
    };

    try {
        const res  = await fetch(`${API_BASE_URL}/package/create`, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify(body)
        });
        const data = await res.json();

        if (!res.ok || !data.success) {
            showError('create-error', data.message || data.error || 'Failed to create package.');
            return;
        }

        // Show QR result panel
        const pkg = data.data.package;
        document.getElementById('qr-token').textContent  = pkg.trackingToken;
        document.getElementById('qr-customer').textContent = pkg.piiData?.customerName || '—';
        document.getElementById('qr-location').textContent = pkg.piiData?.macroLocation || '—';
        document.getElementById('qr-image').src          = data.data.qrCode;
        document.getElementById('qr-result').style.display = 'block';
        document.getElementById('qr-result').scrollIntoView({ behavior: 'smooth' });

        // Refresh table
        e.target.reset();
        loadPackages();

    } catch (err) {
        showError('create-error', 'Network error during package creation.');
        console.error(err);
    } finally {
        btn.disabled = false;
        btn.textContent = '✦ Generate Package & QR';
    }
});

// ── PRINT QR ──────────────────────────────────────────────────────────────────
document.getElementById('btn-print').addEventListener('click', () => {
    window.print();
});

// ── LOAD PACKAGES TABLE ───────────────────────────────────────────────────────
async function loadPackages() {
    const tbody = document.getElementById('pkg-tbody');
    tbody.innerHTML = `<tr><td colspan="5" class="tbl-loading">Loading…</td></tr>`;

    try {
        const res  = await fetch(`${API_BASE_URL}/package/list`, {
            headers: authHeaders()
        });
        const data = await res.json();

        if (!res.ok || !data.success) {
            tbody.innerHTML = `<tr><td colspan="5" class="tbl-loading">Failed to load packages.</td></tr>`;
            return;
        }

        if (!data.data.length) {
            tbody.innerHTML = `<tr><td colspan="5" class="tbl-loading">No packages yet. Create one above.</td></tr>`;
            return;
        }

        tbody.innerHTML = data.data.map(pkg => `
            <tr>
                <td class="mono">${pkg.trackingToken}</td>
                <td>${pkg.piiData?.customerName || '—'}</td>
                <td>${pkg.piiData?.macroLocation || '—'}</td>
                <td><span class="badge ${statusBadgeClass(pkg.status)}">${pkg.status}</span></td>
                <td>${new Date(pkg.createdAt).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}</td>
            </tr>
        `).join('');

    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="5" class="tbl-loading">Network error.</td></tr>`;
    }
}

document.getElementById('btn-refresh').addEventListener('click', loadPackages);