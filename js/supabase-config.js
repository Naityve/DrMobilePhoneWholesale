// ══════════════════════════════════════════
// DrMobilePhone — Supabase Configuration
// ══════════════════════════════════════════
//
// ⚠️  SETUP INSTRUCTIONS:
// 1. Go to your Supabase project dashboard
// 2. Go to Settings → API
// 3. Replace the values below with your Project URL and Anon Key
//
const SUPABASE_URL = 'https://btzbifpqtzgpyvlyipxk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0emJpZnBxdHpncHl2bHlpcHhrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5NTM0ODMsImV4cCI6MjA4NzUyOTQ4M30.oIdVuiKlstdYUi6bSjev61wGNr4hbL5rIWtwIwT_R-s';

// Initialize Supabase client
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── Auth Helpers ──

async function getCurrentUser() {
    const { data: { user }, error } = await db.auth.getUser();
    if (error || !user) return null;
    return user;
}

async function getUserProfile(userId) {
    const { data, error } = await db
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
    if (error) return null;
    return data;
}

async function signOut() {
    await db.auth.signOut();
    window.location.href = '/login.html';
}

// ── Route Protection ──

async function requireAuth(allowedStatuses = ['approved']) {
    const user = await getCurrentUser();

    if (!user) {
        window.location.href = '/login.html';
        return null;
    }

    const profile = await getUserProfile(user.id);

    if (!profile) {
        window.location.href = '/login.html';
        return null;
    }

    if (!allowedStatuses.includes(profile.status)) {
        if (profile.status === 'pending') {
            window.location.href = '/pending.html';
        } else if (profile.status === 'rejected') {
            window.location.href = '/login.html';
        }
        return null;
    }

    return { user, profile };
}

async function requireAdmin() {
    const user = await getCurrentUser();

    if (!user) {
        window.location.href = '/login.html';
        return null;
    }

    const profile = await getUserProfile(user.id);

    if (!profile || !profile.is_admin) {
        window.location.href = '/login.html';
        return null;
    }

    return { user, profile };
}

// ── UI Helpers ──

function showAlert(elementId, message, type = 'error') {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.className = `alert alert-${type} show`;
    el.textContent = message;
}

function hideAlert(elementId) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.className = 'alert';
}

function setLoading(buttonEl, loading) {
    if (loading) {
        buttonEl.dataset.originalText = buttonEl.innerHTML;
        buttonEl.innerHTML = '<span class="spinner"></span>';
        buttonEl.disabled = true;
    } else {
        buttonEl.innerHTML = buttonEl.dataset.originalText || 'Submit';
        buttonEl.disabled = false;
    }
}

// ── Nav Helpers ──

function renderNav(profile = null) {
    const navLinks = document.querySelector('.nav-links');
    if (!navLinks) return;

    if (profile) {
        let links = '<button class="nav-close" onclick="toggleMobileMenu()"><svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg></button>';
        if (profile.is_admin) {
            links += '<a href="/admin.html">Admin</a>';
        }
        if (profile.status === 'approved') {
            links += '<a href="/store.html">Store</a>';
        }
        links += `<a href="#" onclick="signOut(); return false;" class="nav-cta">Sign Out</a>`;
        navLinks.innerHTML = links;
    } else {
        navLinks.innerHTML = `
            <button class="nav-close" onclick="toggleMobileMenu()"><svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
            <a href="/login.html">Login</a>
            <a href="/register.html" class="nav-cta">Register</a>
        `;
    }

    ensureHamburger();
}

function ensureHamburger() {
    if (document.querySelector('.hamburger')) return;
    const nav = document.querySelector('nav');
    if (!nav) return;
    const btn = document.createElement('button');
    btn.className = 'hamburger';
    btn.setAttribute('onclick', 'toggleMobileMenu()');
    btn.innerHTML = '<svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M3 12h18M3 6h18M3 18h18"/></svg>';
    nav.appendChild(btn);
}

function toggleMobileMenu() {
    const navLinks = document.querySelector('.nav-links');
    if (navLinks) navLinks.classList.toggle('open');
}
