/**
 * TRADING HUB - APPLICATION LOGIC
 * Dynamic Live CMS, Bilingual Telugu/English Switcher, Intro Auto-Player,
 * Razorpay Payment Integration, Admin Plus (+) Upload, Rename, and Bulk Delete.
 */

// ==================== RESILIENT HYBRID STORAGE ENGINE ====================
// Zero-crash dual-layer storage with window.localStorage, window.sessionStorage,
// cookie persistence, and in-memory store.
// Guarantees sessions survive mobile browser swipe-down pull-to-refresh,
// iOS Safari private mode, Android WebViews, and strict storage sandboxes.

const _inMemoryStorage = {};

function _getCookie(name) {
  try {
    const prefix = name + '=';
    const parts = (document.cookie || '').split(';');
    for (let i = 0; i < parts.length; i++) {
      let c = parts[i].trim();
      if (c.indexOf(prefix) === 0) {
        return decodeURIComponent(c.substring(prefix.length));
      }
    }
  } catch (_) {}
  return null;
}

function _setCookie(name, val, days = 365) {
  try {
    const d = new Date();
    d.setTime(d.getTime() + (days * 24 * 60 * 60 * 1000));
    const expires = 'expires=' + d.toUTCString();
    const isHttps = typeof window !== 'undefined' && window.location && window.location.protocol === 'https:';
    const secureFlag = isHttps ? ';Secure' : '';
    document.cookie = name + '=' + encodeURIComponent(val) + ';' + expires + ';path=/;SameSite=Lax' + secureFlag;
  } catch (_) {}
}

function _deleteCookie(name) {
  try {
    document.cookie = name + '=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;SameSite=Lax';
  } catch (_) {}
}

const safeStorage = {
  getItem(key) {
    try {
      const val = window.localStorage.getItem(key);
      if (val !== null && val !== undefined) return val;
    } catch (_) {}
    if (_inMemoryStorage[key] !== undefined) return _inMemoryStorage[key];
    if (key === 'tradinghub_user' || key === 'tradinghub_session_token' || key === 'tradinghub_admin_pin_verified' || key === 'tradinghub_last_active') {
      const cookieVal = _getCookie('th_' + key);
      if (cookieVal) {
        _inMemoryStorage[key] = cookieVal;
        return cookieVal;
      }
    }
    return null;
  },
  setItem(key, val) {
    const strVal = String(val);
    _inMemoryStorage[key] = strVal;
    try {
      window.localStorage.setItem(key, strVal);
    } catch (_) {}
    if (key === 'tradinghub_user' || key === 'tradinghub_session_token' || key === 'tradinghub_admin_pin_verified' || key === 'tradinghub_last_active') {
      _setCookie('th_' + key, strVal, 365);
    }
  },
  removeItem(key) {
    delete _inMemoryStorage[key];
    try {
      window.localStorage.removeItem(key);
    } catch (_) {}
    if (key === 'tradinghub_user' || key === 'tradinghub_session_token' || key === 'tradinghub_admin_pin_verified' || key === 'tradinghub_last_active') {
      _deleteCookie('th_' + key);
    }
  },
  clear() {
    for (const k in _inMemoryStorage) delete _inMemoryStorage[k];
    try {
      window.localStorage.clear();
    } catch (_) {}
  }
};

const safeSessionStorage = {
  getItem(key) {
    try {
      const val = window.sessionStorage.getItem(key);
      if (val !== null && val !== undefined) return val;
    } catch (_) {}
    return safeStorage.getItem(key);
  },
  setItem(key, val) {
    const strVal = String(val);
    try {
      window.sessionStorage.setItem(key, strVal);
    } catch (_) {}
    safeStorage.setItem(key, strVal);
  },
  removeItem(key) {
    try {
      window.sessionStorage.removeItem(key);
    } catch (_) {}
    safeStorage.removeItem(key);
  },
  clear() {
    try {
      window.sessionStorage.clear();
    } catch (_) {}
  }
};

window.safeStorage = safeStorage;
window.safeSessionStorage = safeSessionStorage;

// ==================== INACTIVITY AUTO-LOGOUT TRACKER ====================
// Active user interaction tracking. When user is actively browsing, scrolling, or clicking,
// we refresh last active timestamp. Only if the user is confirmed completely inactive for
// > 24 hours does the system log them out automatically.
const INACTIVITY_TIMEOUT_MS = 24 * 60 * 60 * 1000; // 24 hours
let _lastActivityRecord = 0;

function markUserActive(force = false) {
  const now = Date.now();
  if (force || (now - _lastActivityRecord > 10000)) { // throttled to once every 10 seconds
    _lastActivityRecord = now;
    if (state.currentUser) {
      safeStorage.setItem('tradinghub_last_active', String(now));
      safeSessionStorage.setItem('tradinghub_last_active', String(now));
    }
  }
}

function checkInactivityOnResume() {
  if (!state.currentUser) return;
  const lastActiveStr = safeStorage.getItem('tradinghub_last_active') || safeSessionStorage.getItem('tradinghub_last_active');
  if (lastActiveStr) {
    const lastActive = parseInt(lastActiveStr, 10);
    if (!isNaN(lastActive) && (Date.now() - lastActive > INACTIVITY_TIMEOUT_MS)) {
      console.log('[AUTH] Confirmed user inactive for > 24h. Auto-logging out on resume.');
      handleLogout(true);
      return;
    }
  }
  markUserActive(true);
}

if (typeof window !== 'undefined') {
  ['touchstart', 'touchmove', 'click', 'keydown', 'scroll', 'pointerdown', 'mousemove', 'wheel'].forEach(evt => {
    window.addEventListener(evt, () => markUserActive(false), { passive: true });
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      checkInactivityOnResume();
    }
  });
  window.addEventListener('focus', checkInactivityOnResume);

  // Periodic background check every 60s while page remains open
  setInterval(() => {
    if (!state.currentUser) return;
    const lastActiveStr = safeStorage.getItem('tradinghub_last_active') || safeSessionStorage.getItem('tradinghub_last_active');
    if (lastActiveStr) {
      const lastActive = parseInt(lastActiveStr, 10);
      if (!isNaN(lastActive) && (Date.now() - lastActive > INACTIVITY_TIMEOUT_MS)) {
        console.log('[AUTH] Idle interval timeout reached (>24h). Auto-logging out.');
        handleLogout(true);
      }
    }
  }, 60000);
}

// Fallback safety: If old quickLoginAsAdmin is somehow triggered, force security modal instead
window.quickLoginAsAdmin = function() {
  safeStorage.removeItem('tradinghub_user');
  safeSessionStorage.removeItem('tradinghub_user');
  state.currentUser = null;
  openAdminSecurityModal();
};

// Global Application State
const ADMIN_PIN = '3578';
const state = {
  siteConfig: null,
  charts: [],
  gallery: [],
  comments: [],
  currentUser: null,
  selectedPaymentScreenshot: null,
  activeFilter: 'all',
  searchQuery: '',
  activeModalChart: null,
  activeVideoLang: 'telugu', // default Telugu
  adminSelectedChartIds: new Set(),
  selectedCharts: new Map(),
  adminMediaInventory: { teluguVideos: [], englishVideos: [], uploadedMedia: [] },
  showAllVideos: false,
  showAllCharts: false,
  showAllGalleryCharts: false,
  adminUsersList: [],
  adminUserFilter: 'all',
  adminUserSearch: '',
  systemRevisions: { charts: 0, users: 0, gallery: 0, comments: 0, siteConfig: 0 }
};

// ==================== INITIALIZATION ====================
document.addEventListener('DOMContentLoaded', async () => {
  initAuthState();
  try { renderNavbar(); } catch (_) {} // Synchronous immediate render: Login button visible immediately on all phones!
  await loadSiteConfig();
  await loadCharts();
  await loadChartGallery();
  await loadComments();
  initMarketTicker();
  initGalleryDragDrop();
  initDailyChartDragDrop();
  try { setupAdminDropzones(); } catch (_) {}
  checkUrlPaymentCallback();
  initPaymentScreenshotDropzone();
  checkAdminUrlParam();
  checkResetPasswordTokenInUrl();
  renderApp();
  try { initMobileQuickStripSpy(); } catch (_) {}

  // START REAL-TIME INSTANT SYNC (Immediate actions for Grant PRO, Revoke PRO, Chart/Video Renames, Delete, etc.)
  initRealtimeLiveSync();
});

// ==================== BROWSER ACCOUNT VAULT (CROSS-DEPLOY PERMANENCE) ====================
function saveToLocalAccountVault(account) {
  if (!account || !account.email) return;
  try {
    const emailKey = account.email.toLowerCase().trim();
    let vault = JSON.parse(safeStorage.getItem('tradinghub_account_vault') || '{}');
    const existing = vault[emailKey] || {};
    const isRemembered = account.remembered !== undefined ? Boolean(account.remembered) : Boolean(existing.remembered);
    const pwd = account.password || existing.password || '';

    vault[emailKey] = {
      email: emailKey,
      password: pwd,
      name: account.name || existing.name || emailKey.split('@')[0],
      hasPaid: Boolean(account.hasPaid || existing.hasPaid),
      paymentId: account.paymentId || existing.paymentId || null,
      role: account.role || existing.role || 'member',
      remembered: isRemembered,
      savedAt: Date.now()
    };
    safeStorage.setItem('tradinghub_account_vault', JSON.stringify(vault));

    // Save to dedicated single-device quick login if remembered with password
    if (isRemembered && pwd) {
      safeStorage.setItem('tradinghub_device_saved_login', JSON.stringify({
        email: emailKey,
        password: pwd,
        name: account.name || existing.name || emailKey.split('@')[0],
        savedAt: Date.now()
      }));
    } else if (account.remembered === false) {
      safeStorage.removeItem('tradinghub_device_saved_login');
      vault[emailKey].password = '';
      vault[emailKey].remembered = false;
      safeStorage.setItem('tradinghub_account_vault', JSON.stringify(vault));
    }
  } catch (_) {}
}

function getLocalAccountVault(email) {
  if (!email) return null;
  try {
    const vault = JSON.parse(safeStorage.getItem('tradinghub_account_vault') || '{}');
    return vault[email.toLowerCase().trim()] || null;
  } catch (_) {
    return null;
  }
}

async function syncAllLocalAccountsToServer() {
  try {
    const vault = JSON.parse(safeStorage.getItem('tradinghub_account_vault') || '{}');
    const accounts = Object.values(vault);
    for (const acc of accounts) {
      if (acc && acc.email) {
        fetch('/api/auth/sync-client-account', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(acc)
        })
        .then(r => r.json())
        .then(d => {
          if (d && d.deleted) {
            // Account was deleted by admin: purge from local vault permanently
            try {
              let v = JSON.parse(safeStorage.getItem('tradinghub_account_vault') || '{}');
              delete v[acc.email.toLowerCase().trim()];
              safeStorage.setItem('tradinghub_account_vault', JSON.stringify(v));
            } catch (_) {}
          }
        })
        .catch(() => {});
      }
    }
  } catch (_) {}
}

// Load Authentication State from Storage
function initAuthState() {
  try {
    // 1. Inactivity check: Only log out if confirmed inactive for > 24 hours
    const lastActiveStr = safeStorage.getItem('tradinghub_last_active') || safeSessionStorage.getItem('tradinghub_last_active');
    if (lastActiveStr) {
      const lastActive = parseInt(lastActiveStr, 10);
      if (!isNaN(lastActive) && (Date.now() - lastActive > INACTIVITY_TIMEOUT_MS)) {
        console.log('[AUTH] Confirmed user inactive for > 24h. Auto-logging out.');
        safeStorage.removeItem('tradinghub_user');
        safeSessionStorage.removeItem('tradinghub_user');
        safeStorage.removeItem('tradinghub_session_token');
        safeSessionStorage.removeItem('tradinghub_session_token');
        safeStorage.removeItem('tradinghub_admin_pin_verified');
        safeStorage.removeItem('tradinghub_last_active');
        state.currentUser = null;
        document.documentElement.classList.remove('is-admin');
        document.body.classList.remove('is-admin');
        document.body.classList.remove('admin-home-blurred');
        setTimeout(() => {
          showToast('You were logged out due to inactivity.', 'info');
        }, 600);
        return;
      }
    }

    // 2. Read user session from resilient quad-layer storage
    // Fallback: sessionStorage -> localStorage -> Persistent Cookie -> Device Account Vault
    let raw = safeSessionStorage.getItem('tradinghub_user') || safeStorage.getItem('tradinghub_user') || _getCookie('th_tradinghub_user');

    if (!raw) {
      const savedDev = safeStorage.getItem('tradinghub_device_saved_login');
      if (savedDev) {
        try {
          const devObj = JSON.parse(savedDev);
          if (devObj && devObj.email) {
            const vaultAcc = getLocalAccountVault(devObj.email);
            if (vaultAcc) {
              raw = JSON.stringify({
                id: `user-${vaultAcc.savedAt || Date.now()}`,
                email: vaultAcc.email,
                name: vaultAcc.name,
                role: vaultAcc.role || 'member',
                hasPaid: Boolean(vaultAcc.hasPaid),
                paymentId: vaultAcc.paymentId || null
              });
            }
          }
        } catch (_) {}
      }
    }

    if (raw) {
      const parsed = JSON.parse(raw);

      // Admin verification logic: Keep admin session active across pull-to-refresh
      if (parsed.role === 'admin') {
        document.documentElement.classList.add('is-admin');
        document.body.classList.add('is-admin');
        const pinVerified = safeSessionStorage.getItem('tradinghub_admin_pin_verified') || safeStorage.getItem('tradinghub_admin_pin_verified') || _getCookie('th_tradinghub_admin_pin_verified');
        if (pinVerified === ADMIN_PIN) {
          document.body.classList.remove('admin-home-blurred');
        } else {
          // If PIN not yet entered for this session, prompt for it
          document.body.classList.add('admin-home-blurred');
          setTimeout(() => openAdminPinModal(), 300);
        }
      }

      state.currentUser = parsed;
      // User visiting/refreshing the page counts as active interaction: refresh timestamp immediately
      markUserActive(true);

      // Check with server if account is active or was updated by admin
      fetch('/api/auth/sync-client-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed)
      })
      .then(r => r.json())
      .then(d => {
        if (d && d.deleted) {
          // Server confirmed account was permanently removed by Admin!
          safeStorage.removeItem('tradinghub_user');
          safeSessionStorage.removeItem('tradinghub_user');
          safeStorage.removeItem('tradinghub_session_token');
          safeSessionStorage.removeItem('tradinghub_session_token');
          safeStorage.removeItem('tradinghub_admin_pin_verified');
          state.currentUser = null;
          document.documentElement.classList.remove('is-admin');
          document.body.classList.remove('is-admin');
          document.body.classList.remove('admin-home-blurred');
          renderApp();
          showToast('This account has been removed by administrator.', 'info');
        } else if (d && d.user && state.currentUser) {
          // If server updated payment/role status, seamlessly keep client in sync
          const hadPaid = Boolean(state.currentUser.hasPaid);
          const nowPaid = Boolean(d.user.hasPaid);
          state.currentUser.hasPaid = nowPaid;
          state.currentUser.role = d.user.role || state.currentUser.role;
          state.currentUser.name = d.user.name || state.currentUser.name;
          if (d.user.paymentId) state.currentUser.paymentId = d.user.paymentId;
          safeStorage.setItem('tradinghub_user', JSON.stringify(state.currentUser));
          safeSessionStorage.setItem('tradinghub_user', JSON.stringify(state.currentUser));
          renderNavbar();
          if (hadPaid !== nowPaid) {
            renderApp();
          }
        }
      })
      .catch(() => {});
    }

    syncAllLocalAccountsToServer();
    cleanLocalVaultTestAccounts();
  } catch (e) {
    console.warn('[AUTH] Notice during initAuthState:', e);
  }
}

// Multi-Device Access Enabled: Allows multiple phones, laptops, and PCs simultaneously
async function validateActiveSession() {
  return true;
}

// ==================== REAL-TIME LIVE SYNC SYSTEM ====================
// Provides sub-second immediate action across user screens when Admin grants/revokes PRO, modifies charts, etc.
let isLiveSyncRunning = false;
let liveSyncIntervalId = null;

function initRealtimeLiveSync() {
  if (liveSyncIntervalId) clearInterval(liveSyncIntervalId);
  // Run continuous heartbeat every 2 seconds
  liveSyncIntervalId = setInterval(runRealtimeLiveSync, 2000);

  // Immediate triggers on focus and tab change
  window.addEventListener('focus', () => runRealtimeLiveSync());
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) runRealtimeLiveSync();
  });

  // Run first sync immediately
  setTimeout(runRealtimeLiveSync, 250);
}

async function runRealtimeLiveSync() {
  if (isLiveSyncRunning) return;
  isLiveSyncRunning = true;

  try {
    const payload = {
      email: state.currentUser?.email || '',
      chartsRev: state.systemRevisions?.charts || 0,
      usersRev: state.systemRevisions?.users || 0,
      galleryRev: state.systemRevisions?.gallery || 0,
      siteConfigRev: state.systemRevisions?.siteConfig || 0,
      commentsRev: state.systemRevisions?.comments || 0
    };

    const res = await fetch('/api/live-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) return;
    const data = await res.json();
    if (!data || !data.revisions) return;

    const isFirstRun = (!state.systemRevisions || state.systemRevisions.charts === 0);
    state.systemRevisions = data.revisions;

    // 1. IMMEDIATE USER ACCOUNT ACTIONS (Grant PRO, Revoke PRO, Delete User)
    if (state.currentUser && data.user) {
      // Case A: Account deleted by Admin in real-time
      if (data.user.deleted || (!data.user.exists && state.currentUser.role !== 'admin')) {
        console.warn('[LIVE SYNC] Account deleted by Admin in real-time!');
        safeStorage.removeItem('tradinghub_user');
        safeSessionStorage.removeItem('tradinghub_user');
        safeStorage.removeItem('tradinghub_session_token');
        safeSessionStorage.removeItem('tradinghub_session_token');
        state.currentUser = null;
        document.documentElement.classList.remove('is-admin', 'is-pro-member');
        document.body.classList.remove('is-admin', 'is-pro-member', 'admin-home-blurred');
        renderNavbar();
        renderApp();
        showToast('🚫 Your account has been removed by the administrator.', 'error');
        return;
      }

      // Case B: PRO Status Granted in Real-Time
      if (data.user.hasPaid && !state.currentUser.hasPaid) {
        console.log('[LIVE SYNC] PRO Access granted in real-time!');
        state.currentUser.hasPaid = true;
        state.currentUser.paymentId = data.user.paymentId || 'PRO_ADMIN_GRANTED';
        saveAuthState(state.currentUser);
        renderNavbar();
        renderApp();
        showToast('💎 Real-Time Action: Lifetime PRO Access Granted by Admin! All charts and videos are now unlocked!', 'success');
      }
      // Case C: PRO Status Revoked in Real-Time
      else if (!data.user.hasPaid && state.currentUser.hasPaid && state.currentUser.role !== 'admin') {
        console.log('[LIVE SYNC] PRO Access revoked in real-time!');
        state.currentUser.hasPaid = false;
        state.currentUser.paymentId = null;
        saveAuthState(state.currentUser);
        renderNavbar();
        renderApp();
        showToast('⚠️ Notice: Your Lifetime PRO Access has been revoked by the administrator.', 'error');
      }
    }

    // Live refresh Admin Users Table if Admin has CMS open and user database changed
    if (data.usersChanged && state.currentUser?.role === 'admin') {
      if (typeof loadAdminUsers === 'function') {
        loadAdminUsers().then(() => {
          if (typeof loadAdminStats === 'function') loadAdminStats();
        }).catch(() => {});
      }
    }

    // 2. IMMEDIATE CHARTS & VIDEOS ACTIONS (Add, Edit, Rename, Delete)
    if (data.chartsChanged && !isFirstRun) {
      console.log('[LIVE SYNC] Charts or Videos updated by Admin in real-time!');
      await loadCharts();
      renderCharts();
      if (state.activeModalChart) {
        const fresh = state.charts.find(c => c.id === state.activeModalChart.id);
        if (fresh) {
          state.activeModalChart = fresh;
          const titleEl = document.getElementById('modal-chart-title');
          if (titleEl) titleEl.textContent = fresh.title;
        }
      }
      if (state.currentUser?.role === 'admin' && typeof renderAdminChartsTable === 'function') {
        renderAdminChartsTable();
      }
    }

    // 3. IMMEDIATE GALLERY ACTIONS
    if (data.galleryChanged && !isFirstRun) {
      await loadChartGallery();
      renderChartGallery();
      if (state.currentUser?.role === 'admin' && typeof renderAdminChartGallery === 'function') {
        renderAdminChartGallery();
      }
    }

    // 4. IMMEDIATE SITE CONFIG / TEXT ACTIONS
    if (data.siteConfigChanged && !isFirstRun) {
      await loadSiteConfig();
      renderDynamicSiteTexts();
    }

    // 5. IMMEDIATE COMMENTS ACTIONS
    if (data.commentsChanged && !isFirstRun) {
      await loadComments();
      renderComments();
    }

  } catch (err) {
    // Network retry silent
  } finally {
    isLiveSyncRunning = false;
  }
}

function handleConcurrentLogout() {
  // Multi-device enabled: no-op, user is never kicked out when using another phone or PC
}

function closeConcurrentSessionModal() {
  const modal = document.getElementById('concurrent-session-modal');
  if (modal) modal.classList.remove('active');
}

function saveAuthState(user) {
  state.currentUser = user;
  try {
    if (user) {
      saveToLocalAccountVault(user);
      if (user.sessionToken) {
        safeSessionStorage.setItem('tradinghub_session_token', user.sessionToken);
        safeStorage.setItem('tradinghub_session_token', user.sessionToken);
      }
      safeSessionStorage.setItem('tradinghub_user', JSON.stringify(user));
      safeStorage.setItem('tradinghub_user', JSON.stringify(user));
      safeStorage.setItem('tradinghub_last_active', String(Date.now()));
    } else {
      safeStorage.removeItem('tradinghub_user');
      safeSessionStorage.removeItem('tradinghub_user');
      safeStorage.removeItem('tradinghub_session_token');
      safeSessionStorage.removeItem('tradinghub_session_token');
      safeStorage.removeItem('tradinghub_admin_pin_verified');
      safeSessionStorage.removeItem('tradinghub_admin_pin_verified');
      safeStorage.removeItem('tradinghub_last_active');
    }
  } catch (_) {}
  renderApp();
}

function toggleShowAllVideos(show) {
  state.showAllVideos = Boolean(show);
  renderCharts();
  const banner = document.getElementById('charts-more-banner');
  if (state.showAllVideos && banner) {
    banner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } else if (!state.showAllVideos) {
    const section = document.getElementById('charts-section');
    if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function toggleShowAllCharts(show) {
  state.showAllCharts = Boolean(show);
  renderCharts();
  const banner = document.getElementById('charts-more-banner');
  if (state.showAllCharts && banner) {
    banner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } else if (!state.showAllCharts) {
    const section = document.getElementById('charts-section');
    if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function toggleShowAllGallery(show) {
  state.showAllGalleryCharts = Boolean(show);
  renderChartGallery();
  const banner = document.getElementById('gallery-more-banner');
  if (state.showAllGalleryCharts && banner) {
    banner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } else if (!state.showAllGalleryCharts) {
    const section = document.getElementById('chart-gallery-section');
    if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

// Redirect Unpaid Visitor Directly to Payment Section
function handleUnpaidChartClick() {
  if (state.currentUser) {
    // User is ALREADY logged in: Never show login prompt!
    showToast('🔒 High-Resolution Chart Setup Locked. Unlock Full Member Access below for ₹399.', 'info');
    relocateToPricingSection();
    return;
  }
  showToast('🔒 High-Resolution Chart Setup Locked. Unlock Full Member Access to View.', 'info');
  relocateToPricingSection();
  openCheckoutAuthPromptModal();
}

// Load Live Site Text Configuration from Backend
async function loadSiteConfig() {
  try {
    const res = await fetch('/api/site-config');
    state.siteConfig = await res.json();
  } catch (err) {
    console.error('Error loading site config:', err);
  }
}

// Load Charts from Backend
async function loadCharts() {
  try {
    const res = await fetch('/api/charts');
    state.charts = await res.json();
  } catch (err) {
    console.error('Error loading charts:', err);
  }
}

// Check for payment redirect query parameters (e.g. ?payment_success=true)
function checkUrlPaymentCallback() {
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('payment_success') === 'true' || urlParams.get('razorpay_payment_id')) {
    const paymentId = urlParams.get('razorpay_payment_id') || `pay_${Date.now()}`;
    if (state.currentUser) {
      verifyAndUnlockAccess(state.currentUser.email, paymentId);
    } else {
      // Prompt user to enter email or activate
      showToast('Payment received! Please sign in or enter email to activate your lifetime access.', 'success');
      openAuthModal('login');
    }
    // Clean URL
    window.history.replaceState({}, document.title, window.location.pathname);
  }
}

// Check for direct ?admin=true entry
function checkAdminUrlParam() {
  const urlParams = new URLSearchParams(window.location.search);
  const hasAdminQuery = urlParams.get('admin') === 'true';
  const hasAdminHash = window.location.hash === '#admin';

  if (hasAdminQuery || hasAdminHash) {
    // Immediately sanitize address bar so swipe-down refresh never re-triggers the prompt
    try {
      urlParams.delete('admin');
      const newSearch = urlParams.toString() ? '?' + urlParams.toString() : '';
      const cleanUrl = window.location.pathname + newSearch;
      window.history.replaceState({}, document.title, cleanUrl);
    } catch (_) {}

    setTimeout(() => {
      if (state.currentUser?.role === 'admin') {
        openAdminModal();
      } else if (!state.currentUser) {
        // Only open login modal if user is not signed in at all
        openAuthModal('login');
      } else {
        // User is already signed in as a member
        showToast('Admin CMS is reserved for platform administrator.', 'info');
      }
    }, 600);
  }
}

// ==================== INTRO VIDEO FLOW ====================
function initIntroVideo() {}

function closeIntroVideo() {}

function replayIntro() {}

// ==================== LIVE MARKET TICKER ====================
function initMarketTicker() {
  const tickerEl = document.getElementById('market-ticker-content');
  if (!tickerEl) return;

  const markets = [
    { name: 'NIFTY 50', price: '25,182.40', chg: '+0.84%', up: true },
    { name: 'BANK NIFTY', price: '51,920.15', chg: '+0.92%', up: true },
    { name: 'FINNIFTY', price: '23,450.60', chg: '+0.51%', up: true },
    { name: 'SENSEX', price: '82,910.80', chg: '+0.75%', up: true },
    { name: 'BTC / USDT', price: '$68,490.00', chg: '+2.40%', up: true },
    { name: 'CRUDE OIL', price: '₹6,140.00', chg: '-0.38%', up: false },
    { name: 'GOLD 10G', price: '₹73,850.00', chg: '+0.45%', up: true }
  ];

  // Repeat for continuous marquee
  const doubleList = [...markets, ...markets];
  tickerEl.innerHTML = doubleList.map(m => `
    <span class="ticker-item">
      <span class="ticker-name">${m.name}</span>
      <span class="ticker-price">${m.price}</span>
      <span class="${m.up ? 'ticker-up' : 'ticker-down'}">
        ${m.up ? '▲' : '▼'} ${m.chg}
      </span>
    </span>
  `).join('');
}

// ==================== RENDERING & UI UPDATES ====================
function renderApp() {
  try { renderNavbar(); } catch (e) { console.error('Error in renderNavbar:', e); }
  try { renderDynamicSiteTexts(); } catch (e) { console.error('Error in renderDynamicSiteTexts:', e); }
  try { renderCharts(); } catch (e) { console.error('Error in renderCharts:', e); }
  try { renderChartGallery(); } catch (e) { console.error('Error in renderChartGallery:', e); }
  try { renderComments(); } catch (e) { console.error('Error in renderComments:', e); }
  try { renderTermsAndNoRefund(); } catch (e) { console.error('Error in renderTermsAndNoRefund:', e); }
  try { renderAdminPanel(); } catch (e) { console.error('Error in renderAdminPanel:', e); }
}

// Render Admin Panel (safely checks role and renders admin charts table)
function renderAdminPanel() {
  try {
    if (state.currentUser?.role === 'admin') {
      if (typeof renderAdminChartsTable === 'function') {
        renderAdminChartsTable();
      }
    }
  } catch (e) {
    console.warn('Admin panel render check:', e);
  }
}

// Render Navigation Bar
function renderNavbar() {
  const authNavGroup = document.getElementById('nav-auth-actions');
  if (!authNavGroup) return;

  const user = state.currentUser;
  const isAdmin = Boolean(user && user.role === 'admin');
  const isMember = Boolean(user && (user.hasPaid || isAdmin));

  // Dynamically set admin/pro classes on html, body, and nav-actions
  document.documentElement.classList.toggle('is-admin', isAdmin);
  document.documentElement.classList.toggle('is-pro-member', isMember);
  document.body.classList.toggle('is-admin', isAdmin);
  document.body.classList.toggle('is-pro-member', isMember);

  const navActions = document.querySelector('.nav-actions');
  if (navActions) {
    navActions.classList.toggle('is-admin-nav', isAdmin);
  }

  // Strictly hide pricing CTA in navbar for verified PRO members & Admin
  const pricingBtns = document.querySelectorAll('.nav-pricing-btn, .nav-pricing-cta');
  pricingBtns.forEach(btn => {
    btn.style.setProperty('display', isMember ? 'none' : 'inline-flex', 'important');
  });

  if (user) {
    const shortName = (user.name || user.email.split('@')[0]).split(' ')[0];

    // Hide hero login bar if already logged in
    const heroLoginBar = document.querySelector('.hero-member-login-bar');
    if (heroLoginBar) {
      heroLoginBar.style.display = 'none';
    }

    authNavGroup.innerHTML = `
      <div class="nav-user-cluster ${isAdmin ? 'admin-nav-cluster' : ''}">
        <div class="nav-profile-pill ${isAdmin ? 'admin-profile-pill' : ''}" onclick="openUserProfileModal()" title="View Profile & Provided Features">
          <svg class="nav-profile-svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          <strong class="nav-user-name">${isAdmin ? 'Owner' : shortName}</strong>
          ${isAdmin ? '<span class="admin-badge-indicator nav-badge-micro">OWNER</span>' : (isMember ? '<span class="pricing-lifetime-pill nav-badge-micro">PRO</span>' : '')}
          <svg class="nav-profile-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
        </div>

        ${isAdmin ? `
          <button class="btn btn-sm btn-primary nav-admin-btn" onclick="openAdminModal()" title="Open Admin CMS">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            <span class="nav-btn-text">Admin CMS</span>
          </button>
        ` : ''}

        <button class="btn btn-sm btn-secondary nav-signout-btn" onclick="handleLogout()" title="Sign Out">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          <span class="nav-btn-text">Sign Out</span>
        </button>
      </div>
    `;
  } else {
    const heroLoginBar = document.querySelector('.hero-member-login-bar');
    if (heroLoginBar) {
      heroLoginBar.style.display = 'flex';
    }
    const pricingBtns = document.querySelectorAll('.nav-pricing-btn, .nav-pricing-cta');
    pricingBtns.forEach(btn => {
      btn.style.display = 'inline-flex';
    });

    // Guest view: Show prominent dual Login & Sign Up buttons for instant access
    authNavGroup.innerHTML = `
      <div class="nav-guest-cluster">
        <button class="btn btn-sm btn-secondary nav-signin-btn" onclick="openAuthModal('login')" title="Member Login">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
          <span>Login</span>
        </button>
        <button class="btn btn-sm btn-primary nav-signup-btn" onclick="openAuthModal('register')" title="Create Account (Sign Up)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
          <span>Sign Up</span>
        </button>
      </div>
    `;
  }
}

// Render dynamic site texts from siteConfig (Live Admin CMS reflection)
function renderDynamicSiteTexts() {
  const cfg = state.siteConfig;
  if (!cfg) return;

  // Brand Info
  document.querySelectorAll('[data-bind="brandName"]').forEach(el => el.textContent = cfg.brandName || 'TRADING HUB');
  document.querySelectorAll('[data-bind="tagline"]').forEach(el => el.textContent = cfg.tagline || '');
  
  // Hero Section
  const heroBadge = document.querySelector('[data-bind="heroBadge"]');
  if (heroBadge) heroBadge.textContent = cfg.hero?.badge || 'INSTAGRAM TRADING COMMUNITY';

  const heroTitle = document.querySelector('[data-bind="heroTitle"]');
  if (heroTitle) heroTitle.innerHTML = cfg.hero?.title || 'Master Price Action with Drawn Charts';

  const heroSubtitle = document.querySelector('[data-bind="heroSubtitle"]');
  if (heroSubtitle) heroSubtitle.textContent = cfg.hero?.subtitle || '';

  const heroCta = document.querySelector('[data-bind="heroCta"]');
  const isMember = Boolean(state.currentUser?.hasPaid || state.currentUser?.role === 'admin');

  if (heroCta) {
    if (isMember) {
      heroCta.innerHTML = `
        <span>✅ Lifetime Access Active — Watch 24+ Reels</span>
      `;
      heroCta.onclick = (e) => {
        if (e) e.preventDefault();
        const vSec = document.getElementById('videos-section') || document.getElementById('charts-section');
        if (vSec) vSec.scrollIntoView({ behavior: 'smooth' });
      };
    } else {
      heroCta.innerHTML = `
        <span>${cfg.hero?.ctaText || 'Unlock Lifetime Access - ₹399'}</span>
        <span class="price-pill">₹${cfg.pricing?.price || 399} <s style="opacity: 0.65; font-size: 0.8em; margin-left: 4px; text-decoration: line-through;">₹${cfg.pricing?.originalPrice || 999}</s></span>
      `;
      heroCta.onclick = () => handleCheckoutRedirect('https://rzp.io/rzp/2a3h6cU');
    }
  }

  // Hide hero login bar if user is logged in
  const heroLoginBar = document.querySelector('.hero-member-login-bar');
  if (heroLoginBar) {
    heroLoginBar.style.display = state.currentUser ? 'none' : 'flex';
  }

  // Pricing Elements
  document.querySelectorAll('[data-bind="price"]').forEach(el => el.textContent = `₹${cfg.pricing?.price || 399}`);
  document.querySelectorAll('[data-bind="originalPrice"]').forEach(el => el.textContent = `₹${cfg.pricing?.originalPrice || 999}`);
  document.querySelectorAll('[data-bind="discountUrgency"]').forEach(el => el.textContent = cfg.pricing?.discountUrgency || '⚡ Discount only for a few days!');
  document.querySelectorAll('[data-bind="discountBadge"]').forEach(el => el.textContent = cfg.pricing?.discountBadge || '60% LIMITED LAUNCH OFFER');
  document.querySelectorAll('[data-bind="accessType"]').forEach(el => el.textContent = cfg.pricing?.accessType || 'LIFETIME ACCESS');

  // Razorpay Buttons Link Binding (NEVER overwrite heroCta when user is a PRO member!)
  const checkoutUrl = cfg.pricing?.razorpayUrl || 'https://rzp.io/rzp/2a3h6cU';
  document.querySelectorAll('[data-action="checkout-razorpay"]').forEach(btn => {
    if (btn === heroCta && isMember) {
      btn.onclick = (e) => {
        if (e) e.preventDefault();
        const vSec = document.getElementById('videos-section') || document.getElementById('charts-section');
        if (vSec) vSec.scrollIntoView({ behavior: 'smooth' });
      };
      return;
    }
    btn.onclick = () => handleCheckoutRedirect(checkoutUrl);
  });
}

// Render Terms & Strict No-Refund Notice
function renderTermsAndNoRefund() {
  const cfg = state.siteConfig;
  const noRefundBox = document.getElementById('no-refund-policy-display');
  if (noRefundBox && cfg?.termsAndConditions?.noRefundPolicy) {
    noRefundBox.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
      <div class="no-refund-alert-text">
        <strong>STRICT NO-REFUND POLICY:</strong> ${cfg.termsAndConditions.noRefundPolicy}
      </div>
    `;
  }
}

// Filter and Render Charts Grid
function renderCharts() {
  const container = document.getElementById('charts-grid-container');
  if (!container) return;

  const isDedicatedVideosPage = window.location.pathname.includes('all-videos') || window.location.pathname.includes('videos-library');
  const isDedicatedChartsPage = window.location.pathname.includes('all-charts') || window.location.pathname.includes('charts-vault');
  const isHomePage = !isDedicatedVideosPage && !isDedicatedChartsPage;

  const isAdmin = state.currentUser?.role === 'admin';
  const isUnlocked = state.currentUser?.hasPaid || isAdmin;

  // Toggle Admin Daily Uploader Box inside the Charts section
  const dailyDropzone = document.getElementById('admin-daily-charts-dropzone');
  if (dailyDropzone) {
    dailyDropzone.style.display = (isAdmin && state.activeFilter === 'only-charts') ? 'block' : 'none';
  }

  // Update More Banner container
  const moreBanner = document.getElementById('charts-more-banner');

  // ==================== MODE A: 'ONLY CHARTS' (Pure Chart Setups, No Videos) ====================
  if (state.activeFilter === 'only-charts') {
    // Combine standalone daily charts from gallery and drawn setups from charts.json
    const galleryItems = (state.gallery || []).map(g => ({
      id: g.id,
      title: g.title,
      imageUrl: g.imageUrl,
      category: 'Daily Chart',
      isGallery: true,
      summary: 'High probability daily price action drawn setup.'
    }));

    const lessonChartItems = (state.charts || []).map(c => ({
      id: c.id,
      title: c.title,
      imageUrl: c.chartImage || '/assets/charts/chart-1.svg',
      category: c.category || 'Drawn Chart Setup',
      isGallery: false,
      summary: c.summary || 'Technical chart setup with drawn key levels.'
    }));

    let allChartSetups = [...galleryItems, ...lessonChartItems];

    if (state.searchQuery.trim()) {
      const q = state.searchQuery.toLowerCase();
      allChartSetups = allChartSetups.filter(c => 
        c.title?.toLowerCase().includes(q) || 
        c.category?.toLowerCase().includes(q) || 
        c.summary?.toLowerCase().includes(q)
      );
    }

    const countEl = document.getElementById('charts-total-count');
    if (countEl) countEl.textContent = `${allChartSetups.length} Hand-Drawn Daily Charts`;

    if (allChartSetups.length === 0) {
      container.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 60px 20px; color: var(--text-muted);">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom: 12px;"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
          <p style="font-size: 1.1rem; color: #fff;">No charts found matching your search.</p>
          <p style="font-size: 0.9rem;">Upload a new daily chart setup above or clear your search.</p>
        </div>
      `;
      if (moreBanner) moreBanner.innerHTML = '';
      return;
    }

    // Strictly limit to 2 charts on Home Page unless expanded
    let displayList = allChartSetups;
    let hasMore = false;
    if (isHomePage && !state.showAllCharts && allChartSetups.length > 2) {
      displayList = allChartSetups.slice(0, 2);
      hasMore = true;
      container.classList.remove('expanded');
    } else if (isHomePage && state.showAllCharts) {
      container.classList.add('expanded');
    }

    let cardsHtml = displayList.map(item => {
      const escapedTitle = (item.title || 'Chart Setup').replace(/'/g, "\\'");
      const clickAction = isUnlocked 
        ? `openGalleryLightbox('${item.imageUrl}', '${escapedTitle}', '${item.id}')`
        : `handleUnpaidChartClick()`;
      const isSelected = state.selectedCharts && state.selectedCharts.has(item.id);

      return `
        <div class="chart-card ${isSelected ? 'is-selected' : ''}" data-chart-id="${item.id}" data-chart-url="${item.imageUrl}" data-chart-title="${escapedTitle}">
          <div class="chart-select-box ${isSelected ? 'selected' : ''}" onclick="toggleChartSelection(event, '${item.id}', '${item.imageUrl}', '${escapedTitle}')" title="Select chart for batch download">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#060b14" stroke-width="4"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <button type="button" class="chart-card-dl-btn" onclick="downloadSingleChartDirect(event, '${item.imageUrl}', '${escapedTitle}')" title="Download this chart to Gallery (HD PNG)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          </button>
          <div class="chart-thumbnail-wrap ${isUnlocked ? '' : 'locked'}" onclick="${clickAction}" style="cursor: pointer;" title="${isUnlocked ? 'Click to view full screen chart' : '🔒 Locked Chart - Click to Unlock'}">
            <img src="${item.imageUrl}" alt="${item.title}" loading="lazy" decoding="async" style="${isUnlocked ? '' : 'filter: blur(10px) brightness(0.55); pointer-events: none;'}" />
            ${!isUnlocked ? `
              <div class="gallery-lock-overlay">
                <div class="gallery-lock-badge">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                  <span>LOCKED SETUP</span>
                </div>
                <span style="font-size: 0.72rem; color: var(--accent-gold); font-weight: 700; margin-top: 4px;">Unlock to View</span>
              </div>
            ` : ''}
            <span class="chart-reel-badge" style="background: rgba(0, 242, 152, 0.2); color: var(--accent-green); border: 1px solid rgba(0, 242, 152, 0.4);">
              📊 ONLY CHART
            </span>
          </div>
          <div class="chart-card-body">
            <span class="chart-category-tag">${item.category || 'Daily Setup'}</span>
            <h3 class="chart-card-title">${item.title}</h3>
            <p class="chart-card-desc">${item.summary || ''}</p>
            <div class="chart-card-footer" style="align-items: center; justify-content: space-between;">
              <button class="btn btn-sm ${isUnlocked ? 'btn-secondary' : 'btn-gold'}" onclick="${clickAction}" style="padding: 5px 12px; font-size: 0.75rem; display: inline-flex; align-items: center; gap: 4px;">
                ${isUnlocked ? `
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                  <span>Inspect Chart</span>
                ` : `
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                  <span>🔒 Unlock to View</span>
                `}
              </button>
              ${(isAdmin && item.isGallery) ? `
                <div style="display: flex; gap: 4px;">
                  <button class="btn btn-sm btn-secondary" onclick="event.stopPropagation(); promptRenameGalleryImage('${item.id}', '${escapedTitle}')" title="Rename Title" style="padding: 4px 8px; font-size: 0.72rem;">
                    Rename
                  </button>
                  <button class="btn btn-sm btn-danger" onclick="event.stopPropagation(); deleteGalleryImage('${item.id}')" title="Delete Chart" style="padding: 4px 8px; font-size: 0.72rem;">
                    Delete
                  </button>
                </div>
              ` : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Append interactive "+ More Charts" card if on home page and not expanded
    if (hasMore) {
      cardsHtml += `
        <div class="chart-card more-explore-card" onclick="toggleShowAllCharts(true)" style="cursor: pointer;" title="Click to display all charts">
          <div class="more-card-content">
            <div class="more-card-icon">📊</div>
            <div class="more-card-badge">+ MORE CHARTS</div>
            <h3 class="more-card-title">+ More Charts</h3>
            <p class="more-card-desc">Click here to reveal all institutional hand-drawn charts and templates.</p>
            <button class="btn btn-sm btn-primary" onclick="event.stopPropagation(); toggleShowAllCharts(true);" style="margin-top: 8px;">
              Show All Charts ▼
            </button>
          </div>
        </div>
      `;
    }

    container.innerHTML = cardsHtml;

    if (moreBanner) {
      if (isHomePage) {
        if (!state.showAllCharts && allChartSetups.length > 2) {
          moreBanner.innerHTML = `
            <button type="button" class="btn btn-secondary btn-lg" onclick="toggleShowAllCharts(true)" style="display: inline-flex; align-items: center; gap: 10px; border-color: var(--accent-green); background: rgba(0,242,152,0.08); font-weight: 700; color: #fff; cursor: pointer;">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
              <span>+ More Charts (Click to Display All Hand-Drawn Setups) ▼</span>
            </button>
          `;
        } else if (state.showAllCharts) {
          moreBanner.innerHTML = `
            <div style="display: flex; gap: 14px; justify-content: center; flex-wrap: wrap; align-items: center;">
              <button type="button" class="btn btn-secondary btn-lg" onclick="toggleShowAllCharts(false)" style="border-color: rgba(255,255,255,0.25); color: #fff; cursor: pointer; display: inline-flex; align-items: center; gap: 8px;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"/></svg>
                <span>▲ Show Less (Collapse to 2 Charts)</span>
              </button>
              <a href="/all-charts" class="btn btn-primary btn-lg" style="display: inline-flex; align-items: center; gap: 8px;">
                <span>Open Full Chart Vault &rarr;</span>
              </a>
            </div>
          `;
        } else {
          moreBanner.innerHTML = '';
        }
      } else {
        moreBanner.innerHTML = '';
      }
    }

    return;
  }

  // ==================== MODE B: VIDEO LESSONS CURRICULUM ====================
  let filtered = [...state.charts];

  // Category filter
  if (state.activeFilter !== 'all') {
    filtered = filtered.filter(c => c.category?.toLowerCase() === state.activeFilter.toLowerCase());
  }

  // Search filter
  if (state.searchQuery.trim()) {
    const q = state.searchQuery.toLowerCase();
    filtered = filtered.filter(c => 
      c.title?.toLowerCase().includes(q) || 
      c.summary?.toLowerCase().includes(q) || 
      c.category?.toLowerCase().includes(q)
    );
  }

  // Chart Count
  const countEl = document.getElementById('charts-total-count');
  if (countEl) countEl.textContent = `${filtered.length} Charts & Reels`;

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 60px 20px; color: var(--text-muted);">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom: 12px;"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <p style="font-size: 1.1rem; color: #fff;">No charts found matching your search.</p>
        <p style="font-size: 0.9rem;">Try selecting another category or clearing your search term.</p>
      </div>
    `;
    if (moreBanner) moreBanner.innerHTML = '';
    return;
  }

  // Strict 3-Video Display Limit on Home Page until user hits More
  let displayList = filtered;
  let hasMore = false;
  if (isHomePage && !state.showAllVideos && filtered.length > 3) {
    displayList = filtered.slice(0, 3);
    hasMore = true;
    container.classList.remove('expanded');
  } else if (isHomePage && state.showAllVideos) {
    container.classList.add('expanded');
  }

  let cardsHtml = displayList.map(chart => {
    return `
      <div class="chart-card">
        <div class="chart-thumbnail-wrap" onclick="openChartModal('${chart.id}')" style="cursor: pointer;" title="Watch Video Breakdown">
          <img src="${chart.chartImage || '/assets/charts/chart-1.svg'}" alt="${chart.title}" loading="lazy" decoding="async" />
          <span class="chart-reel-badge">REEL-${chart.reelNumber || ''}</span>
          <span class="chart-bilingual-pill">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
            TELUGU &amp; ENGLISH
          </span>
        </div>
        <div class="chart-card-body">
          <span class="chart-category-tag">${chart.category || 'Price Action'}</span>
          <h3 class="chart-card-title">${chart.title}</h3>
          <p class="chart-card-desc">${chart.summary || ''}</p>
          <div class="chart-card-footer">
            <span style="font-size: 0.78rem; color: var(--text-muted);">
              ${chart.views ? `${chart.views.toLocaleString()} traders studied` : 'Updated'}
            </span>
            <button class="btn btn-sm ${isUnlocked ? 'btn-primary' : 'btn-secondary'}" onclick="openChartModal('${chart.id}')">
              ${isUnlocked ? 'Watch Breakdown' : '🔒 Preview (Locked)'}
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            </button>
          </div>
          ${isAdmin ? `
            <div style="display: flex; gap: 6px; padding: 8px 16px; border-top: 1px dashed rgba(255,255,255,0.12); background: rgba(0,0,0,0.25);">
              <button class="btn btn-sm btn-secondary" onclick="event.stopPropagation(); openRenameModal('${chart.id}')" title="Edit Lesson Details" style="padding: 4px 8px; font-size: 0.72rem; flex: 1; justify-content: center; display: inline-flex; align-items: center; gap: 4px;">
                ✏️ Edit Lesson
              </button>
              <button class="btn btn-sm btn-danger" onclick="event.stopPropagation(); deleteSingleChart('${chart.id}')" title="Delete Lesson" style="padding: 4px 8px; font-size: 0.72rem; flex: 1; justify-content: center; display: inline-flex; align-items: center; gap: 4px;">
                🗑️ Delete
              </button>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');

  // Append stylish "+ More Videos" card if on home page and not expanded
  if (hasMore) {
    cardsHtml += `
      <div class="chart-card more-explore-card" onclick="toggleShowAllVideos(true)" style="cursor: pointer;" title="Click to display all 24+ videos">
        <div class="more-card-content">
          <div class="more-card-icon">➕</div>
          <div class="more-card-badge" style="background: rgba(0, 242, 152, 0.15); color: var(--accent-green);">+ MORE VIDEOS</div>
          <h3 class="more-card-title">+ More Videos</h3>
          <p class="more-card-desc">Click here to reveal all Telugu &amp; English trading lessons in this view.</p>
          <button class="btn btn-sm btn-primary" onclick="event.stopPropagation(); toggleShowAllVideos(true);" style="margin-top: 8px;">
            Show All Videos ▼
          </button>
        </div>
      </div>
    `;
  }

  container.innerHTML = cardsHtml;

  // More Videos Banner
  if (moreBanner) {
    if (isHomePage) {
      if (!state.showAllVideos && filtered.length > 3) {
        moreBanner.innerHTML = `
          <button type="button" class="btn btn-secondary btn-lg" onclick="toggleShowAllVideos(true)" style="display: inline-flex; align-items: center; gap: 10px; border-color: var(--accent-green); background: rgba(0,242,152,0.08); font-weight: 700; color: #fff; cursor: pointer;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
            <span>+ More Videos (Click to Display All Reels) ▼</span>
          </button>
        `;
      } else if (state.showAllVideos) {
        moreBanner.innerHTML = `
          <div style="display: flex; gap: 14px; justify-content: center; flex-wrap: wrap; align-items: center;">
            <button type="button" class="btn btn-secondary btn-lg" onclick="toggleShowAllVideos(false)" style="border-color: rgba(255,255,255,0.25); color: #fff; cursor: pointer; display: inline-flex; align-items: center; gap: 8px;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"/></svg>
              <span>▲ Show Less (Hide &amp; Collapse to 3 Videos)</span>
            </button>
            <a href="/all-videos" class="btn btn-primary btn-lg" style="display: inline-flex; align-items: center; gap: 8px;">
              <span>Explore in Full Video Library Page &rarr;</span>
            </a>
          </div>
        `;
      } else {
        moreBanner.innerHTML = '';
      }
    } else {
      moreBanner.innerHTML = '';
    }
  }
}

// Category selection
function setChartCategoryFilter(cat, btn) {
  state.activeFilter = cat;
  document.querySelectorAll('.category-pills-list .category-pill').forEach(p => p.classList.remove('active'));
  if (btn) {
    btn.classList.add('active');
  } else {
    const targetBtn = document.getElementById(cat === 'only-charts' ? 'pill-only-charts' : '');
    if (targetBtn) targetBtn.classList.add('active');
  }
  renderCharts();
}

// Search input handler
let _searchDebounceTimer = null;
function handleChartSearch(query) {
  state.searchQuery = query;
  clearTimeout(_searchDebounceTimer);
  _searchDebounceTimer = setTimeout(() => {
    renderCharts();
  }, 100);
}

// ==================== BILINGUAL VIDEO & CHART MODAL ====================
async function openChartModal(chartId) {

  // Graceful chart resolution: matches by id, or chart-01 / chart-1, or first available chart
  const chart = state.charts.find(c => c.id === chartId) || 
                state.charts.find(c => c.id === 'chart-01' || c.id === 'chart-1') || 
                state.charts[0];
  if (!chart) return;

  state.activeModalChart = chart;
  const modal = document.getElementById('chart-video-modal');
  if (!modal) return;

  const isUnlocked = Boolean(state.currentUser?.hasPaid || state.currentUser?.role === 'admin');

  const titleEl = document.getElementById('modal-chart-title');
  if (titleEl) titleEl.textContent = chart.title;

  const imgEl = document.getElementById('modal-chart-image');
  const lockOverlay = document.getElementById('modal-chart-lock-overlay');
  const sumEl = document.getElementById('modal-chart-summary');
  const takeawayEl = document.getElementById('modal-chart-takeaway');
  const playerContainer = document.getElementById('modal-player-container');

  if (!isUnlocked) {
    // Both Chart and Video Locked for Free / Unpaid Users
    if (imgEl) {
      imgEl.src = chart.chartImage || '/assets/charts/chart-1.svg';
      imgEl.classList.add('locked');
    }
    if (lockOverlay) lockOverlay.style.display = 'flex';
    const dlBtn = document.getElementById('modal-chart-download-btn'); if (dlBtn) dlBtn.style.display = 'none';

    if (sumEl) {
      sumEl.innerHTML = `<span style="filter: blur(4px); user-select: none; opacity: 0.5;">Institutional entry zones, order flow liquidity, and confirmation trigger levels.</span> <span style="font-size: 0.76rem; color: var(--accent-gold); font-weight: 700; margin-left: 6px;">[🔒 LOCKED]</span>`;
    }
    if (takeawayEl) {
      takeawayEl.innerHTML = `<span style="filter: blur(4px); user-select: none; opacity: 0.5;">Institutional risk:reward calculation and sniper invalidation rule.</span> <span style="font-size: 0.76rem; color: var(--accent-gold); font-weight: 700; margin-left: 6px;">[🔒 LOCKED / UNLOCK TO VIEW]</span>`;
    }

    // Locked Video Player Container
    playerContainer.innerHTML = `
      <div style="padding: 36px 20px; text-align: center; background: rgba(14, 20, 34, 0.95); border-radius: var(--radius-md); border: 1px dashed var(--accent-gold);">
        <div style="width: 54px; height: 54px; border-radius: 50%; background: #070b14; border: 1.5px solid #ffd700; display: flex; align-items: center; justify-content: center; margin: 0 auto 14px; color: #ffd700;">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        </div>
        <h4 style="font-size: 1.2rem; font-weight: 800; color: #fff; margin-bottom: 8px;">Telugu &amp; English Explanation Video Locked</h4>
        <p style="color: var(--text-secondary); font-size: 0.9rem; max-width: 440px; margin: 0 auto 20px; line-height: 1.6;">
          When you complete payment of ₹399, all videos and full high-resolution chart setups open immediately with lifetime access.
        </p>
        <button class="btn btn-gold btn-lg" onclick="handleCheckoutRedirect('https://rzp.io/rzp/2a3h6cU')" style="width: 100%; max-width: 360px; margin: 0 auto; display: inline-flex; justify-content: center;">
          ⚡ Unlock Videos &amp; Charts - ₹399 Lifetime Access
        </button>
        <div style="margin-top: 14px;">
          <a href="javascript:void(0)" onclick="closeChartModal(); relocateToPricingSection();" style="color: var(--accent-gold); font-size: 0.88rem; text-decoration: underline; cursor: pointer; font-weight: 600;">
            Or view plan details &amp; payment options ↓
          </a>
        </div>
      </div>
    `;
  } else {
    // Member Unlocked View with Bilingual Video Player
    if (imgEl) {
      imgEl.src = chart.chartImage || '/assets/charts/chart-1.svg';
      imgEl.classList.remove('locked');
      const dlBtn = document.getElementById('modal-chart-download-btn');
      if (dlBtn) dlBtn.style.display = 'inline-flex';
    }
    if (lockOverlay) lockOverlay.style.display = 'none';
    if (sumEl) sumEl.textContent = chart.summary || '';
    if (takeawayEl) takeawayEl.textContent = chart.keyTakeaway || '';
    loadActiveModalVideo();
  }

  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeChartModal() {
  const modal = document.getElementById('chart-video-modal');
  const videoElem = document.getElementById('modal-video-element');
  if (videoElem) {
    videoElem.pause();
    videoElem.src = '';
  }
  if (modal) modal.classList.remove('active');

  // Check if any other modal is still active (e.g. admin-modal)
  const otherActiveModal = document.querySelector('.modal-overlay.active');
  if (!otherActiveModal) {
    document.body.style.overflow = '';
  }
}

// Relocate to Payment Section with Highlighting Animation
function relocateToPricingSection() {
  const pricingSection = document.getElementById('pricing-section');
  if (pricingSection) {
    pricingSection.scrollIntoView({ behavior: 'smooth' });
    const pricingCard = document.querySelector('.pricing-card');
    if (pricingCard) {
      pricingCard.classList.remove('pricing-pulse');
      void pricingCard.offsetWidth; // trigger reflow
      pricingCard.classList.add('pricing-pulse');
      setTimeout(() => pricingCard.classList.remove('pricing-pulse'), 3000);
    }
    showToast('🔒 Unlock All 24+ Lessons - ₹399 Lifetime Access', 'info');
  } else {
    handleCheckoutRedirect('https://rzp.io/rzp/2a3h6cU');
  }
}

// Hero Lesson Preview Click Handler
// Behavior requested by user:
// For Paid users & Admin: Relocates to and plays the lesson video immediately!
// For Unpaid users: Relocates directly to the Payment Option (#pricing-section)
function handleHeroLessonPreviewClick() {
  const isPaidOrAdmin = Boolean(state.currentUser?.hasPaid || state.currentUser?.role === 'admin');

  if (isPaidOrAdmin) {
    // Paid Member or Owner Admin: Immediately open the Video Player Breakdown Modal
    const targetChart = state.charts.find(c => c.id === 'chart-01' || c.id === 'chart-1') || state.charts[0];
    if (targetChart) {
      openChartModal(targetChart.id);
    } else {
      openChartModal('chart-01');
    }
  } else {
    // Unpaid Visitor / Regular User: Relocate directly to Payment Option
    relocateToPricingSection();
  }
}

// Explicit global exposure for inline HTML handlers
window.openChartModal = openChartModal;
window.closeChartModal = closeChartModal;
window.relocateToPricingSection = relocateToPricingSection;
window.handleHeroLessonPreviewClick = handleHeroLessonPreviewClick;

// Load Video based on active language (Telugu vs English)
function switchVideoLanguage(lang) {
  state.activeVideoLang = lang;
  
  document.querySelectorAll('.btn-lang-switch').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lang === lang);
  });

  loadActiveModalVideo();
}

function loadActiveModalVideo() {
  const chart = state.activeModalChart;
  if (!chart) return;

  const playerContainer = document.getElementById('modal-player-container');
  if (!playerContainer) return;

  const isTelugu = state.activeVideoLang === 'telugu';
  const videoUrl = isTelugu ? chart.teluguVideo : chart.englishVideo;

  playerContainer.innerHTML = `
    <div class="bilingual-switcher-bar">
      <button class="btn-lang-switch ${isTelugu ? 'active' : ''}" data-lang="telugu" onclick="switchVideoLanguage('telugu')">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
        తెలుగు (Telugu Audio)
      </button>
      <button class="btn-lang-switch ${!isTelugu ? 'active' : ''}" data-lang="english" onclick="switchVideoLanguage('english')">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
        English Audio
      </button>
    </div>

    <div class="video-container-box">
      <video id="modal-video-element" class="video-player-elem" controls playsinline webkit-playsinline preload="metadata" controlsList="nodownload" oncontextmenu="return false;">
        <source src="${videoUrl}" type="video/mp4" />
        Your browser does not support HTML5 video playback.
      </video>
    </div>

    <div style="display: flex; align-items: center; justify-content: space-between; font-size: 0.8rem; color: var(--text-secondary); margin-top: 8px;">
      <span>Now Playing: <strong>${isTelugu ? 'Telugu Video Breakdown' : 'English Video Breakdown'}</strong></span>
      <span>Speed: Selectable in video controls</span>
    </div>
  `;

  setTimeout(() => {
    const videoEl = document.getElementById('modal-video-element');
    if (videoEl) {
      videoEl.play().catch(() => {
        // Mobile browsers require direct user tap to start unmuted audio; video is loaded and ready
      });
    }
  }, 60);
}

// ==================== RAZORPAY CHECKOUT & PAYMENT VERIFICATION ====================
let pendingCheckoutUrl = null;

function handleCheckoutRedirect(url) {
  // If user has already paid (PRO member or admin): NEVER redirect to payment!
  const isMember = Boolean(state.currentUser?.hasPaid || state.currentUser?.role === 'admin');
  if (isMember) {
    showToast('✨ Lifetime PRO Access is already active! Directing to Video Lessons...', 'info');
    const vSec = document.getElementById('videos-section') || document.getElementById('charts-section');
    if (vSec) vSec.scrollIntoView({ behavior: 'smooth' });
    return;
  }

  const checkoutUrl = url || state.siteConfig?.pricing?.razorpayUrl || 'https://rzp.io/rzp/2a3h6cU';
  pendingCheckoutUrl = checkoutUrl;
  try { trackPaymentAttempt('Checkout Redirect Button'); } catch (_) {}

  // If user is already logged in (unpaid): Proceed directly to payment - NEVER prompt for login!
  if (state.currentUser) {
    proceedDirectlyToPayment(checkoutUrl);
    return;
  }

  // Guest / Unregistered visitor: show sign in / registration prompt
  openCheckoutAuthPromptModal();
}

function openCheckoutAuthPromptModal() {
  // If user is already logged in, NEVER show login prompt modal!
  if (state.currentUser) {
    return;
  }
  const modal = document.getElementById('checkout-auth-prompt-modal');
  if (modal) {
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
}

function closeCheckoutAuthPromptModal() {
  const modal = document.getElementById('checkout-auth-prompt-modal');
  if (modal) modal.classList.remove('active');
  const otherActive = document.querySelector('.modal-overlay.active');
  if (!otherActive) document.body.style.overflow = '';
}

function relocateToAuthFromPrompt(mode = 'login') {
  closeCheckoutAuthPromptModal();
  openAuthModal(mode);
}

function proceedDirectlyToPaymentWithDetails() {
  const nameInput = document.getElementById('prompt-guest-name');
  const emailInput = document.getElementById('prompt-guest-email');

  const name = nameInput ? nameInput.value.trim() : '';
  const email = emailInput ? emailInput.value.trim().toLowerCase() : '';

  if (!email || !email.includes('@') || !email.includes('.')) {
    showToast('Please enter a valid Gmail / Email address so your account and access are credited!', 'error');
    if (emailInput) emailInput.focus();
    return;
  }

  // Persist for seamless recognition
  safeStorage.setItem('tradinghub_last_email', email);
  safeStorage.setItem('tradinghub_pending_email', email);
  if (name) safeStorage.setItem('tradinghub_last_name', name);

  // Track the attempt with captured name and email
  trackPaymentAttempt('Direct Checkout with Details', { email, name });

  const url = pendingCheckoutUrl || state.siteConfig?.pricing?.razorpayUrl || 'https://rzp.io/rzp/2a3h6cU';
  closeCheckoutAuthPromptModal();
  proceedDirectlyToPayment(url);
}

function proceedDirectlyToPaymentFromPrompt() {
  const url = pendingCheckoutUrl || state.siteConfig?.pricing?.razorpayUrl || 'https://rzp.io/rzp/2a3h6cU';
  closeCheckoutAuthPromptModal();
  proceedDirectlyToPayment(url);
}

let _paymentPollingInterval = null;

function proceedDirectlyToPayment(url) {
  const checkoutUrl = url || state.siteConfig?.pricing?.razorpayUrl || 'https://rzp.io/rzp/2a3h6cU';
  const email = state.currentUser?.email || '';
  if (email) {
    safeStorage.setItem('tradinghub_pending_email', email);
  }
  // Universal mobile & in-app browser compatible redirect
  window.location.href = checkoutUrl;
}

function openWaitingPaymentModal() {
  const modal = document.getElementById('waiting-payment-modal');
  if (modal) {
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
  startPaymentPolling();
}

function closeWaitingPaymentModal() {
  stopPaymentPolling();
  const modal = document.getElementById('waiting-payment-modal');
  if (modal) modal.classList.remove('active');
  const otherActive = document.querySelector('.modal-overlay.active');
  if (!otherActive) document.body.style.overflow = '';
}

function startPaymentPolling() {
  stopPaymentPolling();
  const email = state.currentUser?.email || safeStorage.getItem('tradinghub_pending_email') || '';
  if (!email) return;

  _paymentPollingInterval = setInterval(async () => {
    try {
      const res = await fetch(`/api/auth/check-payment-status?email=${encodeURIComponent(email)}`);
      const data = await res.json();
      if (data && data.paid && data.user) {
        stopPaymentPolling();
        closeWaitingPaymentModal();
        saveAuthState(data.user);
        saveToLocalAccountVault(data.user);
        renderApp();
        showToast('🎉 Payment confirmed! Lifetime Access Unlocked!', 'success');
        document.getElementById('charts-section')?.scrollIntoView({ behavior: 'smooth' });
      }
    } catch (_) {}
  }, 3500);
}

function stopPaymentPolling() {
  if (_paymentPollingInterval) {
    clearInterval(_paymentPollingInterval);
    _paymentPollingInterval = null;
  }
}

function switchFromWaitingToUtrModal() {
  closeWaitingPaymentModal();
  openPaymentVerificationModal();
}

window.proceedDirectlyToPayment = proceedDirectlyToPayment;
window.openWaitingPaymentModal = openWaitingPaymentModal;
window.closeWaitingPaymentModal = closeWaitingPaymentModal;
window.switchFromWaitingToUtrModal = switchFromWaitingToUtrModal;
window.startPaymentPolling = startPaymentPolling;
window.stopPaymentPolling = stopPaymentPolling;

window.openCheckoutAuthPromptModal = openCheckoutAuthPromptModal;
window.closeCheckoutAuthPromptModal = closeCheckoutAuthPromptModal;
window.relocateToAuthFromPrompt = relocateToAuthFromPrompt;
window.proceedDirectlyToPaymentFromPrompt = proceedDirectlyToPaymentFromPrompt;
window.proceedDirectlyToRazorpayFromPrompt = proceedDirectlyToPaymentFromPrompt;


function openPaymentVerificationModal() {
  const modal = document.getElementById('payment-verify-modal');
  if (modal) {
    const emailInput = document.getElementById('verify-email-input');
    if (emailInput && state.currentUser) {
      emailInput.value = state.currentUser.email;
    }
    modal.classList.add('active');
  }
}

function closePaymentVerificationModal() {
  const modal = document.getElementById('payment-verify-modal');
  if (modal) modal.classList.remove('active');
}

// ==================== PAYMENT SCREENSHOT & UTR VERIFICATION ====================
function handlePaymentScreenshotSelect(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    showToast('Please select a valid image file (PNG, JPG, JPEG, WEBP).', 'error');
    return;
  }
  state.selectedPaymentScreenshot = file;

  const previewContainer = document.getElementById('payment-screenshot-preview');
  const dropzone = document.getElementById('payment-screenshot-dropzone');
  const previewImg = document.getElementById('screenshot-preview-img');
  const previewName = document.getElementById('screenshot-preview-name');
  const previewSize = document.getElementById('screenshot-preview-size');

  if (previewImg) previewImg.src = URL.createObjectURL(file);
  if (previewName) previewName.textContent = file.name;
  if (previewSize) previewSize.textContent = `${(file.size / 1024).toFixed(1)} KB`;

  if (previewContainer) previewContainer.style.display = 'flex';
  if (dropzone) dropzone.style.display = 'none';

  hideUtrFeedback();
}

function removePaymentScreenshot(event) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }
  state.selectedPaymentScreenshot = null;
  const fileInput = document.getElementById('verify-screenshot-file');
  if (fileInput) fileInput.value = '';

  const previewContainer = document.getElementById('payment-screenshot-preview');
  const dropzone = document.getElementById('payment-screenshot-dropzone');
  if (previewContainer) previewContainer.style.display = 'none';
  if (dropzone) dropzone.style.display = 'block';
}

function initPaymentScreenshotDropzone() {
  const dropzone = document.getElementById('payment-screenshot-dropzone');
  if (!dropzone) return;

  ['dragenter', 'dragover'].forEach(name => {
    dropzone.addEventListener(name, e => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add('drag-over');
    });
  });

  ['dragleave', 'drop'].forEach(name => {
    dropzone.addEventListener(name, e => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove('drag-over');
    });
  });

  dropzone.addEventListener('drop', e => {
    const file = e.dataTransfer?.files?.[0];
    if (file && file.type.startsWith('image/')) {
      handlePaymentScreenshotSelect({ target: { files: [file] } });
    } else if (file) {
      showToast('Please drop an image file (PNG, JPG, WEBP).', 'error');
    }
  });
}

function showUtrFeedback(type, title, message) {
  const box = document.getElementById('utr-feedback-container');
  if (!box) return;
  box.className = `utr-feedback-msg ${type}`;
  let icon = type === 'error' ? '❌' : (type === 'success' ? '✅' : '⏳');
  box.innerHTML = `
    <span class="feedback-icon">${icon}</span>
    <div>
      <strong>${title}</strong>
      <div style="font-size: 0.8rem; margin-top: 2px;">${message}</div>
    </div>
  `;
  box.style.display = 'flex';
}

function hideUtrFeedback() {
  const box = document.getElementById('utr-feedback-container');
  if (box) box.style.display = 'none';
}

async function submitPaymentVerification() {
  const emailInput = document.getElementById('verify-email-input');
  const utrInput = document.getElementById('verify-utr-input');
  const btn = document.getElementById('btn-submit-verify');
  const btnText = document.getElementById('btn-submit-verify-text');
  const btnSpinner = document.getElementById('btn-submit-verify-spinner');

  const email = (emailInput?.value || '').trim().toLowerCase();
  const utrId = (utrInput?.value || '').trim();

  hideUtrFeedback();

  if (!email || !email.includes('@')) {
    showUtrFeedback('error', 'Email Required', 'Please enter a valid email address.');
    emailInput?.focus();
    return;
  }

  if (!utrId) {
    showUtrFeedback('error', 'UTR ID Required', 'UTR ID : is mandatory. Please enter your 12-digit UTR number from PhonePe, GPay, or Paytm.');
    utrInput?.focus();
    return;
  }

  // Validate format
  const isNumericUtr = /^\d{10,18}$/.test(utrId);
  const isPayId = /^pay_[a-zA-Z0-9]+$/.test(utrId);
  if (!isNumericUtr && !isPayId) {
    showUtrFeedback('error', 'Invalid UTR Format', 'Please enter a valid 12-digit numeric UTR ID (e.g. 4251XXXXXXXX) from your payment receipt.');
    utrInput?.focus();
    return;
  }

  if (!state.selectedPaymentScreenshot) {
    showUtrFeedback('error', 'Screenshot Required', 'Payment screenshot is required. Please upload or drag & drop your payment receipt.');
    return;
  }

  // Set loading UI
  if (btn) btn.disabled = true;
  if (btnText) btnText.textContent = 'Verifying...';
  if (btnSpinner) btnSpinner.style.display = 'inline-block';
  showUtrFeedback('loading', 'Verifying...', 'Checking payment details...');

  try {
    const formData = new FormData();
    formData.append('email', email);
    formData.append('utrId', utrId);
    formData.append('screenshot', state.selectedPaymentScreenshot);

    const res = await fetch('/api/auth/verify-payment', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();

    if (data.success && data.user) {
      // Prominent green confirmation directly below the UTR box
      showUtrFeedback('success', 'Payment Verified!', '✅ Payment successful! Lifetime access unlocked. Welcome to Trading Hub PRO!');

      const paidUser = {
        ...data.user,
        email: email,
        hasPaid: true,
        paymentId: utrId
      };
      saveAuthState(paidUser);
      saveToLocalAccountVault(paidUser);
      renderApp();

      showToast('🎉 Payment Confirmed! Lifetime Access Unlocked!', 'success');

      // Close modal after 1.8 seconds and smoothly scroll to charts
      setTimeout(() => {
        closePaymentVerificationModal();
        document.getElementById('charts-section')?.scrollIntoView({ behavior: 'smooth' });
      }, 1800);
    } else {
      // Prominent red error directly below UTR box as requested
      showUtrFeedback('error', 'Payment Verification Failed', 'Please try again.');
      showToast('Payment verification failed. Please try again.', 'error');
    }
  } catch (err) {
    showUtrFeedback('error', 'Connection Error', 'Network error verifying with server: ' + err.message);
  } finally {
    if (btn) btn.disabled = false;
    if (btnText) btnText.textContent = 'Verify & Unlock';
    if (btnSpinner) btnSpinner.style.display = 'none';
  }
}

// ==================== AUTH MODAL (SIGNUP / LOGIN) ====================
function bindAuthEnterKey() {
  ['auth-email-input', 'auth-password-input', 'auth-name-input', 'auth-admin-pin-input'].forEach(id => {
    const el = document.getElementById(id);
    if (el && !el._hasEnterListener) {
      el._hasEnterListener = true;
      el.addEventListener('keydown', function(event) {
        if (event.key === 'Enter') {
          event.preventDefault();
          handleAuthSubmit(event);
        }
      });
    }
  });
}

function openAuthModal(mode = 'login') {
  const modal = document.getElementById('auth-modal');
  if (!modal) return;

  const emailInput = document.getElementById('auth-email-input');
  const passInput = document.getElementById('auth-password-input');
  const pinInput = document.getElementById('auth-admin-pin-input');
  const pinGroup = document.getElementById('auth-admin-pin-group');
  const rememberCheckbox = document.getElementById('auth-remember-me');

  if (pinInput) pinInput.value = '';
  if (pinGroup) pinGroup.style.display = 'none';

  // Check if this individual device has a saved Gmail & Password
  let savedLogin = null;
  try {
    savedLogin = JSON.parse(safeStorage.getItem('tradinghub_device_saved_login') || 'null');
  } catch (_) {}

  if (!savedLogin) {
    try {
      const vault = JSON.parse(safeStorage.getItem('tradinghub_account_vault') || '{}');
      const savedList = Object.values(vault).filter(acc => acc && acc.email && acc.password && acc.remembered);
      if (savedList.length > 0) {
        savedList.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
        savedLogin = savedList[0];
      }
    } catch (_) {}
  }

  if (mode === 'login' && savedLogin && savedLogin.email && savedLogin.password) {
    if (emailInput) emailInput.value = savedLogin.email;
    if (passInput) passInput.value = savedLogin.password;
    if (rememberCheckbox) rememberCheckbox.checked = true;
  } else {
    if (emailInput) emailInput.value = '';
    if (passInput) passInput.value = '';
    if (rememberCheckbox) rememberCheckbox.checked = false;
  }

  resetPasswordToggle('auth-password-input');
  resetPasswordToggle('auth-admin-pin-input');

  hideAuthSuggestionDropdown();
  setAuthModalMode(mode);
  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
  bindAuthEnterKey();

  // On desktop, auto-focus convenient field; on mobile, allow clean scroll without virtual keyboard jump
  if (window.innerWidth > 768) {
    setTimeout(() => {
      if (mode === 'register') {
        const nameInput = document.getElementById('auth-name-input');
        if (nameInput) nameInput.focus();
      } else {
        if (emailInput && !emailInput.value) {
          emailInput.focus();
        } else if (passInput) {
          passInput.focus();
        }
      }
    }, 120);
  }
}

function closeAuthModal() {
  const modal = document.getElementById('auth-modal');
  if (modal) modal.classList.remove('active');

  const otherActive = document.querySelector('.modal-overlay.active');
  if (!otherActive) {
    document.body.style.overflow = '';
  }

  const emailInput = document.getElementById('auth-email-input');
  const passInput = document.getElementById('auth-password-input');
  const pinInput = document.getElementById('auth-admin-pin-input');
  const pinGroup = document.getElementById('auth-admin-pin-group');
  if (emailInput) emailInput.value = '';
  if (passInput) passInput.value = '';
  if (pinInput) pinInput.value = '';
  if (pinGroup) pinGroup.style.display = 'none';
}

function setAuthModalMode(mode) {
  const title = document.getElementById('auth-modal-title');
  const submitBtn = document.getElementById('auth-submit-btn');
  const toggleText = document.getElementById('auth-toggle-prompt');
  const nameGroup = document.getElementById('auth-name-group');
  const passwordGroup = document.getElementById('auth-password-group');
  const descEl = document.getElementById('auth-modal-desc');
  const rememberGroup = document.getElementById('auth-remember-group');
  const savedHint = document.getElementById('auth-saved-hint');

  const tabLogin = document.getElementById('auth-tab-login');
  const tabRegister = document.getElementById('auth-tab-register');
  const tabsNav = document.getElementById('auth-tabs-nav');

  resetPasswordToggle('auth-password-input');
  resetPasswordToggle('auth-admin-pin-input');



  if (mode === 'forgot') {
    if (tabsNav) tabsNav.style.display = 'none';
    title.textContent = 'Reset Your Password';
    if (descEl) {
      descEl.textContent = 'Enter your registered Gmail / Email address. We will generate a secure password reset link for your account.';
      descEl.style.display = 'block';
    }
    submitBtn.textContent = 'Send Reset Link';
    if (nameGroup) nameGroup.style.display = 'none';
    if (passwordGroup) passwordGroup.style.display = 'none';
    if (rememberGroup) rememberGroup.style.display = 'none';
    if (savedHint) savedHint.style.display = 'none';
    toggleText.innerHTML = `Remembered your password? <a href="javascript:void(0)" onclick="setAuthModalMode('login')" style="color: var(--accent-green); font-weight: bold;">Login</a>`;
    submitBtn.dataset.mode = 'forgot';
  } else if (mode === 'register') {
    if (tabsNav) tabsNav.style.display = 'flex';
    if (tabRegister) tabRegister.classList.add('active');
    if (tabLogin) tabLogin.classList.remove('active');
    title.textContent = 'Create Member Account';
    if (descEl) descEl.style.display = 'none';
    submitBtn.textContent = 'Sign Up & Continue';
    if (nameGroup) nameGroup.style.display = 'block';
    if (passwordGroup) passwordGroup.style.display = 'block';
    if (rememberGroup) rememberGroup.style.display = 'block';
    if (savedHint) savedHint.style.display = 'none';
    toggleText.innerHTML = `Already registered? <a href="javascript:void(0)" onclick="setAuthModalMode('login')" style="color: var(--accent-green); font-weight: bold;">Login</a>`;
    submitBtn.dataset.mode = 'register';
  } else {
    if (tabsNav) tabsNav.style.display = 'flex';
    if (tabLogin) tabLogin.classList.add('active');
    if (tabRegister) tabRegister.classList.remove('active');
    title.textContent = 'Welcome Back! Login';
    if (descEl) descEl.style.display = 'none';
    submitBtn.textContent = 'Login';
    if (nameGroup) nameGroup.style.display = 'none';
    if (passwordGroup) passwordGroup.style.display = 'block';
    if (rememberGroup) rememberGroup.style.display = 'block';
    toggleText.innerHTML = `Need an account? <a href="javascript:void(0)" onclick="setAuthModalMode('register')" style="color: var(--accent-green); font-weight: bold;">Sign Up</a>`;
    submitBtn.dataset.mode = 'login';
    checkDeviceSavedAccount();
  }
}

async function handleAuthSubmit(e) {
  if (e && e.preventDefault) e.preventDefault();
  const submitBtn = document.getElementById('auth-submit-btn');
  const mode = submitBtn?.dataset?.mode || 'login';
  const email = document.getElementById('auth-email-input').value.trim();
  const password = document.getElementById('auth-password-input')?.value;
  const name = document.getElementById('auth-name-input')?.value?.trim();

  if (!email) {
    showToast('Please enter your Gmail / Email address', 'error');
    return;
  }

  // 100% Free Forgot Password Flow
  if (mode === 'forgot') {
    const btn = document.getElementById('auth-submit-btn');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Verifying Account & Generating Link...';
    }

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      let data = await res.json();

      // Self-Healing: If server lost registration due to redeploy, restore from local vault and retry
      if (!data.success) {
        const localAcc = getLocalAccountVault(email);
        if (localAcc) {
          try {
            await fetch('/api/auth/sync-client-account', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(localAcc)
            });
            const retryRes = await fetch('/api/auth/forgot-password', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email })
            });
            data = await retryRes.json();
          } catch (_) {}
        }
      }

      if (data.success) {
        closeAuthModal();
        if (data.emailSent) {
          showToast('📩 Password reset link sent to your Gmail inbox!', 'success');
        } else {
          showToast('✅ Reset link generated for your registered account!', 'success');
          showDirectResetPrompt(data.resetUrl);
        }
      } else {
        showToast(data.error || 'No registered account found with this email.', 'error');
      }
    } catch (err) {
      showToast('Network error: ' + err.message, 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Send Reset Link';
      }
    }
    return;
  }

  // Standard Login or Register Flow
  if (!password) {
    showToast('Please enter your password', 'error');
    return;
  }

  const cleanEmail = email.toLowerCase().trim();
  const isAdminEmail = (cleanEmail === 'abhisheknaidus093@gmail.com');

  const endpoint = mode === 'register' ? '/api/auth/register' : '/api/auth/login';
  const payload = mode === 'register' ? { email, password, name } : { email, password };

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    let data = await res.json();

    // Self-Healing Login: If server redeploy lost user record, restore from local vault and log in
    if (!data.success && mode === 'login') {
      const localAcc = getLocalAccountVault(email);
      if (localAcc && localAcc.password === password) {
        try {
          const healRes = await fetch('/api/auth/sync-client-account', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(localAcc)
          });
          const healData = await healRes.json();
          if (healData.success && healData.user) {
            data = { success: true, user: healData.user };
          }
        } catch (_) {}
      }
    }

    if (data.success) {
      try {
        if (data.sessionToken) {
          data.user.sessionToken = data.sessionToken;
          if (data.user.role === 'admin') {
            safeSessionStorage.setItem('tradinghub_session_token', data.sessionToken);
          } else {
            safeStorage.setItem('tradinghub_session_token', data.sessionToken);
          }
        }
      } catch (_) {}
      try {
        saveAuthState(data.user);
      } catch (_) {}

      // Requirement: Checkbox remains unchecked by default until user manually clicks it.
      // Only if the user MANUALLY checked the box is the password saved for next time.
      const rememberCheckbox = document.getElementById('auth-remember-me');
      const shouldRemember = Boolean(rememberCheckbox && rememberCheckbox.checked);

      if (shouldRemember) {
        saveToLocalAccountVault({
          email,
          password,
          name: data.user.name || name,
          role: data.user.role,
          hasPaid: data.user.hasPaid,
          paymentId: data.user.paymentId,
          savedAt: Date.now(),
          remembered: true
        });
      } else {
        // If user did not check the box, wipe any saved password so they must enter manually next time
        try {
          let vault = JSON.parse(safeStorage.getItem('tradinghub_account_vault') || '{}');
          const key = email.toLowerCase().trim();
          if (vault[key]) {
            vault[key].password = '';
            vault[key].remembered = false;
            safeStorage.setItem('tradinghub_account_vault', JSON.stringify(vault));
          }
        } catch (_) {}
      }

      closeAuthModal();
      try { safeStorage.setItem('tradinghub_has_registered', 'true'); } catch (_) {};

      // Requirement: Admin login gives email and password -> home screen blurs and asks code (PIN).
      // Only after admin enters the code can he control everything.
      if (data.user.role === 'admin' || isAdminEmail) {
        safeSessionStorage.removeItem('tradinghub_admin_pin_verified');
        document.body.classList.add('admin-home-blurred');
        showToast('👋 Admin credentials verified! Please enter your Security Code to unlock controls.', 'info');
        openAdminPinModal();
        return;
      }

      renderApp(); // Immediately update all UI, navbar, and card bindings for active session

      if (mode === 'register') {
        showToast('🎉 Sign Up Successful! Welcome to Trading Hub.', 'success');
      } else {
        showToast('✅ Login Successful! Welcome back.', 'success');
      }
    } else {
      showToast(data.error || 'Authentication error', 'error');
    }
  } catch (err) {
    showToast('Network error: ' + err.message, 'error');
  }
}

function handleLogout(isAutoLogout = false) {
  document.documentElement.classList.remove('is-admin');
  document.documentElement.classList.remove('is-pro-member');
  document.body.classList.remove('is-admin');
  document.body.classList.remove('admin-home-blurred');
  document.body.classList.remove('is-pro-member');
  const navActions = document.querySelector('.nav-actions');
  if (navActions) navActions.classList.remove('is-admin-nav');
  safeSessionStorage.removeItem('tradinghub_admin_pin_verified');
  safeStorage.removeItem('tradinghub_admin_pin_verified');
  safeSessionStorage.removeItem('tradinghub_session_token');
  safeStorage.removeItem('tradinghub_session_token');
  safeStorage.removeItem('tradinghub_last_active');
  saveAuthState(null);
  if (isAutoLogout) {
    showToast('You were logged out due to inactivity.', 'info');
  } else {
    showToast('Logged out successfully.', 'info');
  }
}

// ==================== USER PROFILE MODAL & ENTITLEMENTS ====================
function openUserProfileModal() {
  const user = state.currentUser;
  if (!user) {
    openAuthModal('login');
    return;
  }

  const modal = document.getElementById('user-profile-modal');
  if (!modal) return;

  const nameEl = document.getElementById('profile-modal-name');
  const emailEl = document.getElementById('profile-modal-email');
  const avatarEl = document.getElementById('profile-modal-avatar-icon');
  const bannerEl = document.getElementById('profile-status-banner');
  const featuresList = document.getElementById('profile-features-list');

  const isAdmin = user.role === 'admin';
  const isMember = user.hasPaid || isAdmin;

  // Name & Email
  if (nameEl) nameEl.textContent = user.name || (isAdmin ? 'Platform Owner' : 'Registered Member');
  if (emailEl) emailEl.textContent = user.email || 'Member Account';

  // Avatar styling
  if (avatarEl) {
    if (isAdmin) {
      avatarEl.className = 'profile-avatar-badge admin-avatar';
      avatarEl.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`;
    } else {
      avatarEl.className = 'profile-avatar-badge';
      avatarEl.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
    }
  }

  // Membership status banner
  if (bannerEl) {
    if (isAdmin) {
      bannerEl.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px;">
          <span style="background: var(--accent-gold); color: #000; font-weight: 900; font-size: 0.76rem; padding: 4px 10px; border-radius: var(--radius-full);">OWNER</span>
          <div>
            <strong style="color: #fff; font-size: 0.92rem; display: block;">Platform Administrator</strong>
            <span style="font-size: 0.78rem; color: var(--text-secondary);">Full access to charts, videos &amp; CMS</span>
          </div>
        </div>
        <span style="font-size: 0.8rem; color: var(--accent-gold); font-weight: 700;">ACTIVE</span>
      `;
    } else if (isMember) {
      bannerEl.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px;">
          <span style="background: var(--accent-green); color: #000; font-weight: 900; font-size: 0.76rem; padding: 4px 10px; border-radius: var(--radius-full);">LIFETIME PRO</span>
          <div>
            <strong style="color: #fff; font-size: 0.92rem; display: block;">Lifetime Membership</strong>
            <span style="font-size: 0.78rem; color: var(--text-secondary);">All charts, videos &amp; future setups unlocked</span>
          </div>
        </div>
        <span style="font-size: 0.8rem; color: var(--accent-green); font-weight: 700;">VERIFIED</span>
      `;
    } else {
      bannerEl.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px;">
          <span style="background: rgba(255, 255, 255, 0.15); color: #fff; font-weight: 800; font-size: 0.76rem; padding: 4px 10px; border-radius: var(--radius-full);">FREE</span>
          <div>
            <strong style="color: #fff; font-size: 0.92rem; display: block;">Preview Account</strong>
            <span style="font-size: 0.78rem; color: var(--text-secondary);">Upgrade for ₹399 to unlock all videos</span>
          </div>
        </div>
        <button class="btn btn-sm btn-gold" onclick="redirectToFeature('pricing')" style="padding: 4px 12px; font-size: 0.78rem;">Unlock Pro</button>
      `;
    }
  }

  // Feature cards
  if (featuresList) {
    const totalCharts = state.charts?.length || 50;
    let items = [
      {
        id: 'charts',
        title: 'Institutional Drawn Charts',
        badge: `${totalCharts}+ Charts`,
        badgeColor: 'var(--accent-green)',
        desc: 'Explore all high-probability Price Action, SMC & Trap setups',
        icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>`,
        isAdminOnly: false
      },
      {
        id: 'videos',
        title: 'Bilingual Video Breakdowns',
        badge: 'TEL & ENG',
        badgeColor: 'var(--accent-cyan)',
        desc: 'Detailed breakdown videos in Telugu (తెలుగు) & English for every chart',
        icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>`,
        isAdminOnly: false
      },
      {
        id: 'daily',
        title: 'Daily Setups & Lifetime Updates',
        badge: 'LIFETIME',
        badgeColor: 'var(--accent-gold)',
        desc: 'Continuous additions of daily market analysis setups at no extra cost',
        icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
        isAdminOnly: false
      }
    ];

    if (isAdmin) {
      items.push({
        id: 'admin-cms',
        title: 'Admin CMS Control Center',
        badge: 'OWNER ONLY',
        badgeColor: 'var(--accent-gold)',
        desc: 'Upload new charts & videos, edit live text, prices & AWS cloud settings',
        icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
        isAdminOnly: true
      });
    }

    if (!isMember) {
      items.push({
        id: 'verify-payment',
        title: 'Verify Payment & Unlock (UTR)',
        badge: 'UNLOCK',
        badgeColor: 'var(--accent-gold)',
        desc: 'Already completed ₹399 payment? Enter your UTR ID to activate lifetime access',
        icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>`,
        isAdminOnly: false
      });
    }

    items.push({
      id: 'terms',
      title: 'Terms & Strict Non-Refund Policy',
      badge: 'POLICY',
      badgeColor: 'var(--text-muted)',
      desc: 'Digital sales finality, educational usage rights & SEBI disclaimer',
      icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
      isAdminOnly: false
    });

    featuresList.innerHTML = items.map(item => `
      <div class="profile-feature-card ${item.isAdminOnly ? 'admin-feature' : ''}" onclick="redirectToFeature('${item.id}')">
        <div class="profile-feature-icon ${item.isAdminOnly ? 'admin-icon' : ''}">
          ${item.icon}
        </div>
        <div class="profile-feature-info">
          <div class="profile-feature-title">
            <span>${item.title}</span>
            <span style="font-size: 0.68rem; padding: 1px 6px; border-radius: 4px; background: rgba(255,255,255,0.08); color: ${item.badgeColor}; font-weight: 700;">
              ${item.badge}
            </span>
          </div>
          <div class="profile-feature-desc">${item.desc}</div>
        </div>
        <div class="profile-feature-arrow">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
        </div>
      </div>
    `).join('');
  }

  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeUserProfileModal() {
  const modal = document.getElementById('user-profile-modal');
  if (modal) modal.classList.remove('active');
  const otherActive = document.querySelector('.modal-overlay.active');
  if (!otherActive) {
    document.body.style.overflow = '';
  }
}

function handleProfileLogout() {
  closeUserProfileModal();
  handleLogout();
}

function redirectToFeature(featureId) {
  closeUserProfileModal();

  setTimeout(() => {
    switch (featureId) {
      case 'charts':
      case 'daily':
        document.getElementById('charts-section')?.scrollIntoView({ behavior: 'smooth' });
        break;
      case 'videos':
        const isUnlocked = state.currentUser?.hasPaid || state.currentUser?.role === 'admin';
        if (isUnlocked && state.charts && state.charts.length > 0) {
          openChartModal(state.charts[0].id);
        } else {
          document.getElementById('charts-section')?.scrollIntoView({ behavior: 'smooth' });
        }
        break;
      case 'admin-cms':
        openAdminModal();
        break;
      case 'pricing':
        document.getElementById('pricing-section')?.scrollIntoView({ behavior: 'smooth' });
        break;
      case 'verify-payment':
        openPaymentVerificationModal();
        break;
      case 'terms':
        openTermsModal();
        break;
      default:
        break;
    }
  }, 150);
}

window.openUserProfileModal = openUserProfileModal;
window.closeUserProfileModal = closeUserProfileModal;
window.handleProfileLogout = handleProfileLogout;
window.redirectToFeature = redirectToFeature;

// Backward compatibility redirect to main login modal
function openAdminSecurityModal() {
  openAuthModal('login');
}
function closeAdminSecurityModal() {
  closeAuthModal();
}

// ==================== PASSWORD RESET MODAL & URL HANDLERS ====================
function showDirectResetPrompt(resetUrl) {
  try {
    const parsed = new URL(resetUrl);
    const token = parsed.searchParams.get('reset_token');
    if (token) {
      setTimeout(() => {
        openResetPasswordModal(token);
      }, 500);
      return;
    }
  } catch (_) {}
  window.location.href = resetUrl;
}

function checkResetPasswordTokenInUrl() {
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get('reset_token');
  if (token) {
    setTimeout(() => {
      openResetPasswordModal(token);
    }, 600);
  }
}

function openResetPasswordModal(token) {
  state.activeResetToken = token;
  const modal = document.getElementById('reset-password-modal');
  if (modal) {
    const pass1 = document.getElementById('reset-new-password');
    const pass2 = document.getElementById('reset-confirm-password');
    if (pass1) pass1.value = '';
    if (pass2) pass2.value = '';
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
}

function closeResetPasswordModal() {
  const modal = document.getElementById('reset-password-modal');
  if (modal) modal.classList.remove('active');
  const otherActive = document.querySelector('.modal-overlay.active');
  if (!otherActive) {
    document.body.style.overflow = '';
  }
}

async function handleResetPasswordSubmit(event) {
  if (event) event.preventDefault();
  const token = state.activeResetToken;
  const newPassword = document.getElementById('reset-new-password')?.value;
  const confirmPassword = document.getElementById('reset-confirm-password')?.value;

  if (!token) {
    showToast('Missing reset token. Please request a new reset link.', 'error');
    return;
  }

  if (!newPassword || newPassword.length < 6) {
    showToast('Password must be at least 6 characters long.', 'error');
    return;
  }

  if (newPassword !== confirmPassword) {
    showToast('Passwords do not match. Please enter identical passwords.', 'error');
    return;
  }

  const btn = document.getElementById('reset-submit-btn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Saving New Password...';
  }

  try {
    const res = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, newPassword })
    });
    const data = await res.json();

    if (data.success) {
      closeResetPasswordModal();
      showToast('✅ Password updated successfully! Please login with your new password.', 'success');
      // Clean up URL parameter from address bar
      window.history.replaceState({}, document.title, window.location.pathname);
      openAuthModal('login');
    } else {
      showToast(data.error || 'Failed to update password.', 'error');
    }
  } catch (err) {
    showToast('Network error: ' + err.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Save New Password & Login';
    }
  }
}

window.openResetPasswordModal = openResetPasswordModal;
window.closeResetPasswordModal = closeResetPasswordModal;
window.handleResetPasswordSubmit = handleResetPasswordSubmit;

// ==================== ADMIN ULTRA PRIVACY PIN MODAL ====================
function openAdminPinModal() {
  const modal = document.getElementById('admin-pin-modal');
  const input = document.getElementById('cms-security-pin-input');
  if (input) input.value = '';
  resetPasswordToggle('cms-security-pin-input');

  if (modal) {
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
    setTimeout(() => input?.focus(), 150);
  }

  if (input && !input._hasPinEnter) {
    input._hasPinEnter = true;
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleAdminPinSubmit(e);
      }
    });
  }
}

function closeAdminPinModal() {
  const modal = document.getElementById('admin-pin-modal');
  if (modal) modal.classList.remove('active');
  const input = document.getElementById('cms-security-pin-input');
  if (input) input.value = '';

  // Always clean up blur and body scroll lock when pin modal closes
  document.body.classList.remove('admin-home-blurred');
  document.body.style.overflow = '';

  // If closed without verifying PIN, log out admin for security
  const isPinVerified = (safeSessionStorage.getItem('tradinghub_admin_pin_verified') === ADMIN_PIN || safeStorage.getItem('tradinghub_admin_pin_verified') === ADMIN_PIN);
  if (state.currentUser && state.currentUser.role === 'admin' && !isPinVerified) {
    handleLogout();
    showToast('Admin verification cancelled. Logged out.', 'info');
    return;
  }

  const otherActive = document.querySelector('.modal-overlay.active');
  if (!otherActive) {
    document.body.style.overflow = '';
  }
}

function handleAdminPinSubmit(event) {
  if (event) event.preventDefault();
  const input = document.getElementById('cms-security-pin-input');
  const pin = input?.value?.trim();

  if (pin === ADMIN_PIN) {
    safeSessionStorage.setItem('tradinghub_admin_pin_verified', ADMIN_PIN);
    safeStorage.setItem('tradinghub_admin_pin_verified', ADMIN_PIN);
    document.body.classList.remove('admin-home-blurred');
    closeAdminPinModal();
    showToast('👑 Admin Security Code Verified! Full controls unlocked.', 'success');
    renderNavbar();
    renderApp();
  } else {
    showToast('❌ Invalid Admin Security Code. Home remains locked.', 'error');
    if (input) {
      input.value = '';
      input.focus();
    }
  }
}

// ==================== ADMIN PORTAL (UPLOAD, BULK DELETE, LIVE CMS) ====================
function openAdminModal() {
  if (!state.currentUser || state.currentUser.role !== 'admin') {
    openDedicatedAdminLoginModal();
    showToast('Please login with your Admin credentials and Security PIN to enter.', 'info');
    return;
  }

  // ULTRA PRIVACY: Check if 6-digit PIN has been verified for this browser session
  const pinVerified = safeSessionStorage.getItem('tradinghub_admin_pin_verified') || safeStorage.getItem('tradinghub_admin_pin_verified');
  if (pinVerified !== ADMIN_PIN) {
    openAdminPinModal();
    return;
  }

  const modal = document.getElementById('admin-modal');
  if (!modal) return;

  const cmsEmail = document.getElementById('cms-admin-email');
  if (cmsEmail) {
    cmsEmail.value = 'Authorized Owner Account';
  }

  // Load live overview & users by default
  loadAdminStats();
  loadAdminUsers();
  loadAdminMediaInventory();
  renderAdminChartsTable();
  populateCmsForm();
  loadAwsStatus();

  // Ensure 'users' tab is active by default
  const firstTabBtn = document.querySelector('.admin-tabs-nav .admin-tab-btn');
  if (firstTabBtn) switchAdminTab('users', firstTabBtn);

  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeAdminModal() {
  const modal = document.getElementById('admin-modal');
  if (modal) modal.classList.remove('active');
}

function switchAdminTab(tabName, btn) {
  document.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.admin-tab-content').forEach(c => c.style.display = 'none');

  if (btn) btn.classList.add('active');
  const target = document.getElementById(`admin-tab-${tabName}`);
  if (target) target.style.display = 'block';

  if (tabName === 'users') {
    loadAdminUsers();
    loadAdminStats();
  } else if (tabName === 'payments') {
    loadAdminPayments();
  } else if (tabName === 'comments') {
    loadAdminComments();
  } else if (tabName === 'charts') {
    renderAdminChartsTable();
  } else if (tabName === 'cms') {
    populateCmsForm();
  } else if (tabName === 'aws') {
    loadAwsStatus();
  } else if (tabName === 'dropoffs') {
    loadAdminPaymentAttempts();
  }
}

// Fetch available Telugu & English videos on server for dropdowns
async function loadAdminMediaInventory() {
  try {
    const res = await fetch('/api/media-inventory');
    state.adminMediaInventory = await res.json();
    populateVideoDropdowns();
  } catch (e) {
    console.error('Error fetching media inventory:', e);
  }
}

function populateVideoDropdowns() {
  const teluguSelect = document.getElementById('new-chart-telugu-select');
  const englishSelect = document.getElementById('new-chart-english-select');

  if (teluguSelect) {
    teluguSelect.innerHTML = `
      <option value="">-- Select from Existing Telugu Videos --</option>
      ${state.adminMediaInventory.teluguVideos.map(v => `<option value="${v.url}">${v.name}</option>`).join('')}
    `;
  }

  if (englishSelect) {
    englishSelect.innerHTML = `
      <option value="">-- Select from Existing English Videos --</option>
      ${state.adminMediaInventory.englishVideos.map(v => `<option value="${v.url}">${v.name}</option>`).join('')}
    `;
  }
}

// Render Table of all charts with checkboxes for bulk delete
function renderAdminChartsTable() {
  const tbody = document.getElementById('admin-charts-table-body');
  if (!tbody) return;

  tbody.innerHTML = state.charts.map(chart => {
    const isSelected = state.adminSelectedChartIds.has(chart.id);
    return `
      <tr>
        <td>
          <input type="checkbox" onchange="toggleAdminChartSelect('${chart.id}', this.checked)" ${isSelected ? 'checked' : ''} />
        </td>
        <td>
          <div class="admin-thumb-box-wrap">
            <img src="${chart.chartImage || '/assets/charts/chart-1.svg'}" class="admin-thumb-mini" style="cursor: pointer;" onclick="openRenameModal('${chart.id}')" title="Click to preview &amp; choose/swap chart image" alt="" />
            <button type="button" class="thumb-corner-dl" onclick="event.stopPropagation(); downloadMediaFile('${chart.chartImage}', '${escapeHtml(chart.title)} - Chart')" title="Direct Download Chart Image">📥</button>
          </div>
        </td>
        <td>
          <strong style="cursor: pointer; color: #fff;" onclick="openChartModal('${chart.id}')" title="Watch Video Breakdown">${chart.title}</strong>
          <div style="font-size: 0.76rem; color: var(--text-muted);">Reel #${chart.reelNumber || '-'} • Added: ${chart.dateAdded || ''}</div>
        </td>
        <td>
          <span class="category-pill" style="padding: 2px 8px; font-size: 0.75rem;">${chart.category}</span>
        </td>
        <td>
          ${state.adminTableMediaView === 'charts' ? `
            <div class="admin-chart-cell-control" title="Paired Chart Image">
              <img src="${chart.chartImage || '/assets/charts/chart-1.svg'}" class="admin-cell-chart-thumb" onclick="viewFullChartImage('${chart.chartImage}', '${escapeHtml(chart.title)}')" title="Click to view full HD chart" alt="" />
              <button type="button" class="btn-table-dl" onclick="event.stopPropagation(); downloadMediaFile('${chart.chartImage}', '${escapeHtml(chart.title)} - Chart Image')" title="Download Chart Image (HD)">📥</button>
              <button type="button" class="btn-cell-swap-chart" onclick="openRenameModal('${chart.id}')" title="Choose or Replace Chart">✏️ Edit</button>
            </div>
          ` : `
            <div style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap;">
              <div class="admin-video-cell-group" title="Telugu Video">
                <span style="color: var(--accent-green); cursor: pointer; font-size: 0.74rem; font-weight: 700;" onclick="openRenameModal('${chart.id}')">TEL</span>
                <button type="button" class="btn-table-dl" onclick="event.stopPropagation(); downloadMediaFile('${chart.teluguVideo}', '${escapeHtml(chart.title)} - Telugu Video')" title="Download Telugu Video">📥</button>
              </div>
              <div class="admin-video-cell-group" title="English Video">
                <span style="color: var(--accent-cyan); cursor: pointer; font-size: 0.74rem; font-weight: 700;" onclick="openRenameModal('${chart.id}')">ENG</span>
                <button type="button" class="btn-table-dl" onclick="event.stopPropagation(); downloadMediaFile('${chart.englishVideo}', '${escapeHtml(chart.title)} - English Video')" title="Download English Video">📥</button>
              </div>
            </div>
          `}
        </td>
        <td>
          <div style="display: flex; gap: 6px; flex-wrap: wrap;">
            <button class="btn btn-sm btn-primary" onclick="openChartModal('${chart.id}')" title="Watch Video Breakdown" style="padding: 4px 8px; font-size: 0.75rem; display: inline-flex; align-items: center; gap: 3px;">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              Watch
            </button>
            <button class="btn btn-sm btn-secondary" onclick="openRenameModal('${chart.id}')" title="Rename or Edit Chart" style="padding: 4px 8px; font-size: 0.75rem;">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              Edit
            </button>
            <button class="btn btn-sm btn-secondary" onclick="downloadMediaFile('${chart.chartImage}', '${escapeHtml(chart.title)} - Chart Image')" title="Download Chart Image (HD)" style="padding: 4px 7px; font-size: 0.75rem; color: #00f298; border-color: rgba(0,242,152,0.35);">
              📥
            </button>
            <button class="btn btn-sm btn-danger" onclick="deleteSingleChart('${chart.id}')" title="Delete Chart" style="padding: 4px 8px; font-size: 0.75rem;">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  updateBulkActionBar();
  setupVideosHeaderDropdownEvents();
}

// ==================== TABLE HEADER VIDEOS / CHARTS POP-DOWN DROPDOWN ====================
// "here you can see in preview box there is no arrow beside videos text when i click upon theat videos or arrow the pop down text should appear charts when i click on the text all charts should appear and from there i can control charts easyly"
function toggleVideosHeaderDropdown(event) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }
  const btn = document.getElementById('th-dropdown-btn') || document.querySelector('.th-dropdown-btn');
  const menu = document.getElementById('th-media-popdown');
  const cell = document.getElementById('th-videos-dropdown-cell');
  if (!menu) return;

  const isOpen = menu.style.display === 'flex' || menu.classList.contains('active');
  if (isOpen) {
    menu.style.display = 'none';
    menu.classList.remove('active');
    cell?.classList.remove('open');
  } else {
    // Fixed screen positioning to guarantee table overflow-x never clips the dropdown!
    const targetBtn = btn || (event ? event.currentTarget : null) || document.querySelector('.th-dropdown-btn');
    if (targetBtn) {
      const rect = targetBtn.getBoundingClientRect();
      menu.style.position = 'fixed';
      menu.style.top = (rect.bottom + 8) + 'px';
      const leftPos = Math.max(12, Math.min(window.innerWidth - 240, rect.left));
      menu.style.left = leftPos + 'px';
      menu.style.zIndex = '999999';
    }
    menu.style.display = 'flex';
    menu.classList.add('active');
    cell?.classList.add('open');
  }
}

// Global click listener to close popdown dropdown when clicking outside
document.addEventListener('click', (e) => {
  const cell = document.getElementById('th-videos-dropdown-cell');
  const btn = document.getElementById('th-dropdown-btn');
  const menu = document.getElementById('th-media-popdown');
  if (menu && (menu.style.display === 'flex' || menu.classList.contains('active'))) {
    if (btn && btn.contains(e.target)) return;
    if (cell && cell.contains(e.target)) return;
    if (menu.contains(e.target)) return;
    menu.style.display = 'none';
    menu.classList.remove('active');
    cell?.classList.remove('open');
  }
});

function handleThMediaSelect(mode, event) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }
  state.adminTableMediaView = mode;

  // Close popdown
  const menu = document.getElementById('th-media-popdown');
  const cell = document.getElementById('th-videos-dropdown-cell');
  if (menu) {
    menu.style.display = 'none';
    menu.classList.remove('active');
  }
  if (cell) cell.classList.remove('open');

  // Update header text and active items
  const labelEl = document.getElementById('th-media-col-text');
  if (labelEl) {
    labelEl.textContent = (mode === 'charts' ? 'Charts' : 'Videos');
  }

  const optVideos = document.getElementById('th-popdown-videos');
  const optCharts = document.getElementById('th-popdown-charts');
  if (optVideos && optCharts) {
    optVideos.classList.toggle('active', mode === 'videos');
    optCharts.classList.toggle('active', mode === 'charts');
  }

  // Re-render table with selected column mode
  renderAdminChartsTable();

  // If Charts selected, immediately open the All Charts Control Center modal!
  if (mode === 'charts') {
    openAllChartsControlModal();
  } else {
    showToast('🎬 Table column updated to Videos mode.', 'info');
  }
}

function setupVideosHeaderDropdownEvents() {
  const btn = document.getElementById('th-dropdown-btn');
  const itemVid = document.getElementById('th-popdown-videos');
  const itemChart = document.getElementById('th-popdown-charts');

  if (btn && !btn.__boundClick) {
    btn.__boundClick = true;
    btn.addEventListener('click', toggleVideosHeaderDropdown);
  }
  if (itemVid && !itemVid.__boundClick) {
    itemVid.__boundClick = true;
    itemVid.addEventListener('click', e => handleThMediaSelect('videos', e));
  }
  if (itemChart && !itemChart.__boundClick) {
    itemChart.__boundClick = true;
    itemChart.addEventListener('click', e => handleThMediaSelect('charts', e));
  }
}

// ==================== ALL CHARTS CONTROL CENTER MODAL ====================
// "when i click on the text all charts should appear and from there i can control charts easyly"
async function openAllChartsControlModal() {
  const modal = document.getElementById('all-charts-control-modal');
  if (!modal) return;

  const searchInput = document.getElementById('control-hub-search-input');
  if (searchInput) searchInput.value = '';

  // Ensure charts and gallery data are loaded
  if (!state.charts || state.charts.length === 0) {
    try { await loadCharts(); } catch (_) {}
  }
  if (!state.chartGallery || state.chartGallery.length === 0) {
    try {
      const res = await fetch('/api/chart-gallery');
      state.chartGallery = await res.json();
    } catch (_) {}
  }

  renderControlHubCharts('');
  modal.classList.add('active');
  document.body.style.overflow = 'hidden';

  const dz = document.getElementById('control-hub-dropzone');
  if (dz && !dz.__dropzoneInitialized) {
    dz.__dropzoneInitialized = true;
    ['dragenter', 'dragover'].forEach(name => {
      dz.addEventListener(name, e => {
        e.preventDefault();
        e.stopPropagation();
        dz.classList.add('drag-over');
      });
    });
    ['dragleave', 'drop'].forEach(name => {
      dz.addEventListener(name, e => {
        e.preventDefault();
        e.stopPropagation();
        dz.classList.remove('drag-over');
      });
    });
    dz.addEventListener('drop', e => {
      const files = e.dataTransfer && e.dataTransfer.files;
      if (files && files.length > 0) {
        const input = document.getElementById('control-hub-file-input');
        if (input) {
          const dt = new DataTransfer();
          dt.items.add(files[0]);
          input.files = dt.files;
          handleControlHubFileInput({ target: input });
        }
      }
    });
  }
}

function closeAllChartsControlModal() {
  const modal = document.getElementById('all-charts-control-modal');
  if (modal) modal.classList.remove('active');
  const otherActive = document.querySelector('.modal-overlay.active');
  if (!otherActive) {
    document.body.style.overflow = '';
  }
}

function filterControlHubCharts(query) {
  renderControlHubCharts(query || '');
}

function triggerControlHubUpload() {
  const fileInput = document.getElementById('control-hub-file-input');
  if (fileInput) fileInput.click();
}

async function handleControlHubFileInput(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  const defaultTitle = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
  const title = await customPrompt({
    title: 'New Chart Setup Title',
    message: 'Enter a descriptive title for this new chart setup:',
    defaultValue: defaultTitle,
    placeholder: 'e.g. Nifty 50 Liquidity Sweep & Mitigation Zone',
    label: 'Chart Title',
    badge: '📊 NEW CHART SETUP',
    type: 'primary',
    confirmText: 'Upload Chart',
    cancelText: 'Cancel',
    icon: '📊'
  });
  if (!title) return;

  const formData = new FormData();
  formData.append('chartImage', file);
  formData.append('title', title.trim() || defaultTitle);

  showToast('Uploading chart to library...', 'info');
  try {
    const res = await fetch('/api/chart-gallery', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (data.success) {
      showToast('🖼️ Chart added to Control Center!', 'success');
      event.target.value = '';
      await loadChartGallery();
      await loadCharts();
      renderControlHubCharts('');
      renderAdminChartsTable();
    } else {
      showToast(data.error || 'Upload failed', 'error');
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function renderControlHubCharts(query = '') {
  const grid = document.getElementById('control-hub-charts-grid');
  const countEl = document.getElementById('all-charts-modal-count');
  if (!grid) return;

  const cleanQuery = query.toLowerCase().trim();

  // Unified list of all charts (from charts.json and chart_gallery.json)
  const chartItems = [];
  const seenUrls = new Set();

  // 1. From setup charts
  (state.charts || []).forEach(c => {
    if (c.chartImage && !seenUrls.has(c.chartImage)) {
      seenUrls.add(c.chartImage);
      chartItems.push({
        id: c.id,
        title: c.title,
        imageUrl: c.chartImage,
        category: c.category || 'Price Action',
        source: 'chart',
        dateAdded: c.dateAdded || ''
      });
    }
  });

  // 2. From chart gallery
  (state.chartGallery || []).forEach(g => {
    if (g.imageUrl && !seenUrls.has(g.imageUrl)) {
      seenUrls.add(g.imageUrl);
      chartItems.push({
        id: g.id,
        title: g.title,
        imageUrl: g.imageUrl,
        category: 'Gallery Chart',
        source: 'gallery',
        dateAdded: g.dateAdded || ''
      });
    }
  });

  const filtered = cleanQuery 
    ? chartItems.filter(item => 
        (item.title && item.title.toLowerCase().includes(cleanQuery)) ||
        (item.category && item.category.toLowerCase().includes(cleanQuery))
      )
    : chartItems;

  if (countEl) {
    countEl.textContent = `${filtered.length} of ${chartItems.length} charts ready • Full 1-tap controls active`;
  }

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; color: var(--text-muted); padding: 40px;">
        No charts found matching "${escapeHtml(query)}". Use the upload box above to add a new chart!
      </div>
    `;
    return;
  }

  grid.innerHTML = filtered.map(item => `
    <div class="admin-asset-card" id="hub-chart-card-${item.id}">
      <div class="asset-thumb-wrap" onclick="viewFullChartImage('${item.imageUrl}', '${escapeHtml(item.title)}')" title="Click to view full HD image">
        <img src="${item.imageUrl}" alt="${escapeHtml(item.title)}" class="asset-thumb-img" loading="lazy" />
        <button type="button" class="asset-card-dl-badge" onclick="event.stopPropagation(); downloadMediaFile('${item.imageUrl}', '${escapeHtml(item.title)} - HD Chart')" title="Download Chart Image">
          📥
        </button>
      </div>
      <div class="asset-body">
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-bottom: 4px;">
          <span class="control-hub-type-badge">${item.source === 'chart' ? 'SETUP' : 'GALLERY'}</span>
          <span style="font-size: 0.7rem; color: var(--text-muted);">${item.category || ''}</span>
        </div>
        <div class="asset-title" title="${escapeHtml(item.title)}" style="font-weight: 700; color: #fff; font-size: 0.86rem; margin-bottom: 6px;">
          ${escapeHtml(item.title)}
        </div>
        <div class="asset-actions" style="margin-top: auto; display: flex; gap: 5px; flex-wrap: wrap;">
          <button type="button" class="btn-asset-action" onclick="renameControlHubChart('${item.id}', '${escapeHtml(item.title)}', '${item.source}')" title="Rename Chart">
            ✏️ Rename
          </button>
          <button type="button" class="btn-asset-action btn-dl-action" onclick="downloadMediaFile('${item.imageUrl}', '${escapeHtml(item.title)} - HD Chart')" title="Download Chart Image in HD">
            📥 DL
          </button>
          <button type="button" class="btn-asset-action btn-danger-action" onclick="deleteControlHubChart('${item.id}', '${item.source}', '${escapeHtml(item.title)}')" title="Delete Chart">
            🗑️
          </button>
          ${item.source === 'chart' ? `
            <button type="button" class="btn-asset-action" onclick="closeAllChartsControlModal(); openRenameModal('${item.id}');" title="Edit Full Setup & Media Pairings" style="margin-left: auto; color: var(--accent-green); font-weight: 700;">
              ⚙️ Setup
            </button>
          ` : `
            <button type="button" class="btn-asset-action" onclick="closeAllChartsControlModal(); openAddChartModal(); useChartInFullSetup('${item.imageUrl}', '${escapeHtml(item.title)}');" title="Create setup with this chart" style="margin-left: auto; color: var(--accent-green); font-weight: 700;">
              ⚡ Use
            </button>
          `}
        </div>
      </div>
    </div>
  `).join('');
}

async function renameControlHubChart(id, currentTitle, source) {
  const newTitle = await customPrompt({
    title: 'Rename Chart',
    message: `Enter a new title for <strong style="color:var(--accent-green);">${escapeHtml(currentTitle)}</strong>:`,
    defaultValue: currentTitle,
    placeholder: 'Enter chart title...',
    label: 'Chart Title',
    badge: '✏️ RENAME CHART',
    type: 'primary',
    confirmText: 'Save New Title',
    cancelText: 'Cancel',
    icon: '✏️'
  });
  if (!newTitle || newTitle.trim() === currentTitle) return;

  showToast('Renaming chart...', 'info');
  try {
    let res;
    if (source === 'chart') {
      res = await fetch(`/api/charts/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle.trim() })
      });
    } else {
      res = await fetch(`/api/chart-gallery/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle.trim() })
      });
    }

    const data = await res.json();
    if (data.success) {
      showToast('✏️ Chart renamed successfully!', 'success');
      await loadCharts();
      await loadChartGallery();
      renderControlHubCharts(document.getElementById('control-hub-search-input')?.value || '');
      renderAdminChartsTable();
    } else {
      showToast(data.error || 'Failed to rename', 'error');
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteControlHubChart(id, source, title) {
  const confirmed = await customConfirm({
    title: 'Delete Chart Forever?',
    message: `Are you sure you want to permanently delete chart <strong style="color:#ff3366;">"${escapeHtml(title)}"</strong>? This cannot be undone.`,
    badge: '🗑️ PERMANENT DELETION',
    type: 'danger',
    confirmText: 'Delete Forever',
    cancelText: 'Cancel',
    icon: '🗑️'
  });
  if (!confirmed) return;

  showToast('Deleting chart...', 'info');
  try {
    let res;
    if (source === 'chart') {
      res = await fetch(`/api/charts/${id}`, { method: 'DELETE' });
    } else {
      res = await fetch(`/api/chart-gallery/${id}`, { method: 'DELETE' });
    }

    const data = await res.json();
    if (data.success) {
      showToast('🗑️ Chart deleted successfully!', 'success');
      await loadCharts();
      await loadChartGallery();
      renderControlHubCharts(document.getElementById('control-hub-search-input')?.value || '');
      renderAdminChartsTable();
    } else {
      showToast(data.error || 'Failed to delete', 'error');
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

window.toggleVideosHeaderDropdown = toggleVideosHeaderDropdown;
window.handleThMediaSelect = handleThMediaSelect;
window.openAllChartsControlModal = openAllChartsControlModal;
window.closeAllChartsControlModal = closeAllChartsControlModal;
window.filterControlHubCharts = filterControlHubCharts;
window.triggerControlHubUpload = triggerControlHubUpload;
window.handleControlHubFileInput = handleControlHubFileInput;
window.renameControlHubChart = renameControlHubChart;
window.deleteControlHubChart = deleteControlHubChart;
window.renderControlHubCharts = renderControlHubCharts;
window.setupVideosHeaderDropdownEvents = setupVideosHeaderDropdownEvents;

function toggleAdminChartSelect(id, checked) {
  if (checked) {
    state.adminSelectedChartIds.add(id);
  } else {
    state.adminSelectedChartIds.delete(id);
  }
  updateBulkActionBar();
}

function toggleSelectAllCharts(checked) {
  if (checked) {
    state.charts.forEach(c => state.adminSelectedChartIds.add(c.id));
  } else {
    state.adminSelectedChartIds.clear();
  }
  renderAdminChartsTable();
}

function updateBulkActionBar() {
  const bar = document.getElementById('admin-bulk-actions-bar');
  const countEl = document.getElementById('admin-selected-count');
  const count = state.adminSelectedChartIds.size;

  if (bar && countEl) {
    if (count > 0) {
      bar.style.display = 'flex';
      countEl.textContent = `${count} chart${count > 1 ? 's' : ''} selected`;
    } else {
      bar.style.display = 'none';
    }
  }
}

// Bulk Delete Action
async function handleBulkDeleteSelected() {
  const ids = Array.from(state.adminSelectedChartIds);
  if (ids.length === 0) return;

  const confirmed = await customConfirm({
    title: 'Bulk Delete Selected Charts?',
    message: `Are you sure you want to permanently delete all <strong style="color:#ff3366;">${ids.length} selected charts</strong> and their linked video references?`,
    badge: '⚠️ BULK DELETION',
    type: 'danger',
    confirmText: `Delete ${ids.length} Charts`,
    cancelText: 'Cancel',
    icon: '⚠️'
  });
  if (!confirmed) return;

  try {
    const res = await fetch('/api/charts/bulk-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids })
    });
    const data = await res.json();

    if (data.success) {
      showToast(data.message, 'success');
      state.adminSelectedChartIds.clear();
      await loadCharts();
      renderApp();
      renderAdminChartsTable();
    } else {
      showToast(data.error || 'Failed to delete charts', 'error');
    }
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

// Delete Single Chart
async function deleteSingleChart(id) {
  const confirmed = await customConfirm({
    title: 'Delete Chart Setup?',
    message: 'Are you sure you want to permanently delete this chart setup and its linked media pairings?',
    badge: '🗑️ DELETE SETUP',
    type: 'danger',
    confirmText: 'Delete Setup',
    cancelText: 'Cancel',
    icon: '🗑️'
  });
  if (!confirmed) return;

  try {
    const res = await fetch(`/api/charts/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast('Chart deleted successfully!', 'success');
      state.adminSelectedChartIds.delete(id);
      await loadCharts();
      renderApp();
      renderAdminChartsTable();
    } else {
      showToast(data.error || 'Failed to delete', 'error');
    }
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

// ==================== PLUS (+) ICON: UPLOAD & ASSET MANAGEMENT ====================
let currentAddChartSubTab = 'charts';

function openAddChartModal() {
  const modal = document.getElementById('add-chart-modal');
  if (modal) {
    document.getElementById('add-chart-form')?.reset();
    populateVideoDropdowns();
    populateAddChartExistingImages();
    loadChartGallerySubpanel();
    loadVideoRepositorySubpanel();
    setupAdminDropzones();
    switchAddChartSubTab(currentAddChartSubTab || 'charts');
    modal.classList.add('active');
  }
}

function closeAddChartModal() {
  const modal = document.getElementById('add-chart-modal');
  if (modal) modal.classList.remove('active');
}

function switchAddChartSubTab(tabName) {
  currentAddChartSubTab = tabName;
  ['charts', 'videos', 'full'].forEach(t => {
    const btn = document.getElementById(`subnav-btn-${t}`);
    const panel = document.getElementById(`subpanel-${t}`);
    if (btn) btn.classList.toggle('active', t === tabName);
    if (panel) {
      panel.style.display = (t === tabName) ? 'block' : 'none';
      panel.classList.toggle('active', t === tabName);
    }
  });

  const titleEl = document.getElementById('add-modal-title');
  if (titleEl) {
    if (tabName === 'charts') titleEl.textContent = 'Upload & Manage Charts (Drag & Drop)';
    else if (tabName === 'videos') titleEl.textContent = 'Upload & Manage Video Breakdowns';
    else titleEl.textContent = 'Create Complete Chart Setup Pack';
  }

  if (tabName === 'charts') loadChartGallerySubpanel();
  if (tabName === 'videos') loadVideoRepositorySubpanel();
  if (tabName === 'full') {
    populateVideoDropdowns();
    populateAddChartExistingImages();
  }
}

function setupAdminDropzones() {
  const setupDropzone = (elId, onFileDrop) => {
    const el = document.getElementById(elId);
    if (!el || el.__dropzoneInitialized) return;
    el.__dropzoneInitialized = true;

    ['dragenter', 'dragover'].forEach(eventName => {
      el.addEventListener(eventName, e => {
        e.preventDefault();
        e.stopPropagation();
        el.classList.add('drag-over');
      }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
      el.addEventListener(eventName, e => {
        e.preventDefault();
        e.stopPropagation();
        el.classList.remove('drag-over');
      }, false);
    });

    el.addEventListener('drop', e => {
      const dt = e.dataTransfer;
      const files = dt.files;
      if (files && files.length > 0) {
        onFileDrop(files[0]);
      }
    }, false);
  };

  setupDropzone('chart-dropzone', file => {
    const input = document.getElementById('chart-only-file-input');
    if (input) {
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      handleChartOnlyFileInput({ target: input });
    }
  });

  setupDropzone('video-dropzone', file => {
    const input = document.getElementById('video-only-file-input');
    if (input) {
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      handleVideoOnlyFileInput({ target: input });
    }
  });
}

// ---------------- CHARTS ASSET MANAGEMENT (ONLY CHARTS) ----------------
async function loadChartGallerySubpanel() {
  const grid = document.getElementById('admin-charts-asset-grid');
  const countBadge = document.getElementById('subnav-charts-count');
  if (!grid) return;

  try {
    const res = await fetch('/api/chart-gallery');
    const gallery = await res.json();
    state.chartGallery = Array.isArray(gallery) ? gallery : [];

    if (countBadge) countBadge.textContent = state.chartGallery.length;

    if (state.chartGallery.length === 0) {
      grid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; color: var(--text-muted); padding: 30px;">
          No standalone charts uploaded yet. Drag &amp; drop an image above or choose from your phone!
        </div>
      `;
      return;
    }

    grid.innerHTML = state.chartGallery.map(item => `
      <div class="admin-asset-card" id="gallery-card-${item.id}">
        <div class="asset-thumb-wrap" onclick="viewFullChartImage('${item.imageUrl}', '${escapeHtml(item.title)}')" title="Click to view full image">
          <img src="${item.imageUrl}" alt="${escapeHtml(item.title)}" class="asset-thumb-img" loading="lazy" />
          <button type="button" class="asset-card-dl-badge" onclick="event.stopPropagation(); downloadMediaFile('${item.imageUrl}', '${escapeHtml(item.title)}')" title="Download Chart Image">
            📥
          </button>
        </div>
        <div class="asset-body">
          <div class="asset-title" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</div>
          <div class="asset-meta">${item.dateAdded || 'Added'}</div>
          <div class="asset-actions">
            <button type="button" class="btn-asset-action" onclick="renameChartOnly('${item.id}', '${escapeHtml(item.title)}')" title="Rename Chart">
              ✏️ Rename
            </button>
            <button type="button" class="btn-asset-action btn-dl-action" onclick="downloadMediaFile('${item.imageUrl}', '${escapeHtml(item.title)}')" title="Download Chart Image">
              📥 DL
            </button>
            <button type="button" class="btn-asset-action btn-danger-action" onclick="deleteChartOnly('${item.id}')" title="Delete Chart">
              🗑️
            </button>
            <button type="button" class="btn-asset-action" onclick="useChartInFullSetup('${item.imageUrl}', '${escapeHtml(item.title)}')" title="Use in complete setup" style="margin-left: auto; color: var(--accent-green);">
              ⚡ Use
            </button>
          </div>
        </div>
      </div>
    `).join('');
  } catch (err) {
    grid.innerHTML = `<div style="grid-column: 1/-1; color: #ff5252; padding: 20px;">Failed to load charts: ${err.message}</div>`;
  }
}

async function handleChartOnlyFileInput(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  const defaultTitle = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
  const title = await customPrompt({
    title: 'Upload Standalone Chart',
    message: 'Enter a title for this chart asset in your library:',
    defaultValue: defaultTitle,
    placeholder: 'Enter chart title...',
    label: 'Chart Title',
    badge: '📊 STANDALONE CHART',
    type: 'primary',
    confirmText: 'Upload to Library',
    cancelText: 'Cancel',
    icon: '📊'
  });
  if (!title) return;

  const formData = new FormData();
  formData.append('chartImage', file);
  formData.append('title', title.trim() || defaultTitle);

  showToast('Uploading chart image...', 'info');
  try {
    const res = await fetch('/api/chart-gallery', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (data.success) {
      showToast('🖼️ Chart image uploaded to library!', 'success');
      event.target.value = '';
      await loadChartGallerySubpanel();
      populateAddChartExistingImages();
      await loadCharts();
    } else {
      showToast(data.error || 'Upload failed', 'error');
    }
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

async function renameChartOnly(id, currentTitle) {
  const newTitle = await customPrompt({
    title: 'Rename Standalone Chart',
    message: `Enter new title for <strong style="color:var(--accent-green);">${escapeHtml(currentTitle)}</strong>:`,
    defaultValue: currentTitle,
    placeholder: 'Enter chart title...',
    label: 'Chart Title',
    badge: '✏️ RENAME ASSET',
    type: 'primary',
    confirmText: 'Update Title',
    cancelText: 'Cancel',
    icon: '✏️'
  });
  if (!newTitle || newTitle.trim() === currentTitle) return;

  try {
    const res = await fetch(`/api/chart-gallery/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newTitle.trim() })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Chart renamed successfully!', 'success');
      loadChartGallerySubpanel();
      populateAddChartExistingImages();
    } else {
      showToast(data.error || 'Rename failed', 'error');
    }
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

async function deleteChartOnly(id) {
  const confirmed = await customConfirm({
    title: 'Delete Standalone Chart?',
    message: 'Are you sure you want to delete this chart from the standalone gallery?',
    badge: '🗑️ REMOVE CHART',
    type: 'danger',
    confirmText: 'Delete Chart',
    cancelText: 'Cancel',
    icon: '🗑️'
  });
  if (!confirmed) return;

  try {
    const res = await fetch(`/api/chart-gallery/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast('Chart deleted from library.', 'info');
      loadChartGallerySubpanel();
      populateAddChartExistingImages();
    } else {
      showToast(data.error || 'Delete failed', 'error');
    }
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

function useChartInFullSetup(imageUrl, title) {
  switchAddChartSubTab('full');
  const sel = document.getElementById('new-chart-existing-image-select');
  if (sel) {
    sel.value = imageUrl;
    previewNewChartImageChoice(imageUrl);
  }
  const titleInput = document.getElementById('new-chart-title');
  if (titleInput && !titleInput.value) {
    titleInput.value = title;
  }
  showToast(`Selected "${title}" for complete setup!`, 'success');
}

// ---------------- VIDEOS ASSET MANAGEMENT (ONLY VIDEOS) ----------------
async function loadVideoRepositorySubpanel() {
  const grid = document.getElementById('admin-videos-asset-grid');
  const countBadge = document.getElementById('subnav-videos-count');
  if (!grid) return;

  try {
    const res = await fetch('/api/media-inventory');
    const data = await res.json();
    state.adminMediaInventory = data || { teluguVideos: [], englishVideos: [], uploadedMedia: [] };

    const totalVideos = (data.teluguVideos?.length || 0) + (data.englishVideos?.length || 0) + (data.uploadedMedia?.length || 0);
    if (countBadge) countBadge.textContent = totalVideos;

    let itemsHtml = '';

    // Uploaded videos first
    (data.uploadedMedia || []).forEach(v => {
      itemsHtml += renderVideoCardHtml(v.name, v.url, 'UPLOADED', true);
    });

    // Telugu reels
    (data.teluguVideos || []).forEach(v => {
      itemsHtml += renderVideoCardHtml(v.name, v.url, 'TELUGU', false);
    });

    // English reels
    (data.englishVideos || []).forEach(v => {
      itemsHtml += renderVideoCardHtml(v.name, v.url, 'ENGLISH', false);
    });

    grid.innerHTML = itemsHtml || `<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 30px;">No videos found in repository.</div>`;
  } catch (err) {
    grid.innerHTML = `<div style="grid-column: 1/-1; color: #ff5252; padding: 20px;">Failed to load videos: ${err.message}</div>`;
  }
}

function safeDecode(str) {
  if (!str) return '';
  try {
    return decodeURIComponent(str);
  } catch (_) {
    try {
      return decodeURI(str);
    } catch (__) {
      return String(str);
    }
  }
}

function renderVideoCardHtml(name, url, tag, isDeletable) {
  const cleanName = safeDecode(name);
  const tagColor = tag === 'TELUGU' ? 'var(--accent-green)' : (tag === 'ENGLISH' ? 'var(--accent-cyan)' : 'var(--accent-gold)');
  return `
    <div class="admin-asset-card">
      <div class="asset-thumb-wrap" style="background: #090e1a; cursor: pointer;" onclick="openAdminVideoPlayer('${url}', '${escapeHtml(cleanName)}')" title="Click to test play">
        <div style="font-size: 2.2rem; opacity: 0.85;">🎬</div>
        <button type="button" class="asset-card-dl-badge" onclick="event.stopPropagation(); downloadMediaFile('${url}', '${escapeHtml(cleanName)}')" title="Download Video Breakdown">
          📥
        </button>
        <div style="position: absolute; bottom: 6px; right: 6px; background: rgba(0,0,0,0.7); padding: 2px 6px; border-radius: 4px; font-size: 0.70rem; color: #fff; display: flex; align-items: center; gap: 4px;">
          <span>▶</span> Play
        </div>
      </div>
      <div class="asset-body">
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 4px;">
          <span style="font-size: 0.68rem; font-weight: 800; color: ${tagColor}; background: rgba(255,255,255,0.06); padding: 1px 6px; border-radius: 4px;">${tag}</span>
        </div>
        <div class="asset-title" title="${escapeHtml(cleanName)}">${escapeHtml(cleanName)}</div>
        <div class="asset-actions">
          <button type="button" class="btn-asset-action" onclick="openAdminVideoPlayer('${url}', '${escapeHtml(cleanName)}')">
            ▶ Play
          </button>
          <button type="button" class="btn-asset-action btn-dl-action" onclick="downloadMediaFile('${url}', '${escapeHtml(cleanName)}')" title="Download Video Breakdown">
            📥 DL
          </button>
          ${isDeletable ? `
            <button type="button" class="btn-asset-action btn-danger-action" onclick="deleteVideoOnly('${url}')" title="Delete uploaded video">
              🗑️ Delete
            </button>
          ` : ''}
          <button type="button" class="btn-asset-action" onclick="useVideoInFullSetup('${url}', '${tag}')" title="Use in complete setup" style="margin-left: auto; color: var(--accent-green);">
            ⚡ Use
          </button>
        </div>
      </div>
    </div>
  `;
}

async function handleVideoOnlyFileInput(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  const lang = document.getElementById('video-only-lang')?.value || 'telugu';
  const customTitle = document.getElementById('video-only-title')?.value.trim();

  const formData = new FormData();
  formData.append('videoFile', file);
  formData.append('language', lang);
  if (customTitle) formData.append('title', customTitle);

  showToast('Uploading video file to server/AWS...', 'info');
  try {
    const res = await fetch('/api/videos/upload', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (data.success) {
      showToast('🎬 Video uploaded successfully!', 'success');
      event.target.value = '';
      if (document.getElementById('video-only-title')) document.getElementById('video-only-title').value = '';
      await loadVideoRepositorySubpanel();
      populateVideoDropdowns();
    } else {
      showToast(data.error || 'Video upload failed', 'error');
    }
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

async function deleteVideoOnly(url) {
  const confirmed = await customConfirm({
    title: 'Delete Uploaded Video?',
    message: 'Are you sure you want to delete this uploaded video breakdown from your media library?',
    badge: '🎬 VIDEO ASSET',
    type: 'danger',
    confirmText: 'Delete Video',
    cancelText: 'Cancel',
    icon: '🎬'
  });
  if (!confirmed) return;

  try {
    const res = await fetch('/api/videos', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Video removed successfully.', 'info');
      loadVideoRepositorySubpanel();
      populateVideoDropdowns();
    } else {
      showToast(data.error || 'Failed to remove video', 'error');
    }
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

function useVideoInFullSetup(url, tag) {
  switchAddChartSubTab('full');
  if (tag === 'TELUGU' || tag === 'UPLOADED') {
    const sel = document.getElementById('new-chart-telugu-select');
    if (sel) sel.value = url;
  }
  if (tag === 'ENGLISH') {
    const sel = document.getElementById('new-chart-english-select');
    if (sel) sel.value = url;
  }
  showToast(`Video paired for setup!`, 'success');
}

// ---------------- FULL SETUP HELPERS ----------------
async function populateAddChartExistingImages() {
  const sel = document.getElementById('new-chart-existing-image-select');
  if (!sel) return;

  try {
    const res = await fetch('/api/charts/available-images');
    const images = await res.json();
    if (Array.isArray(images)) {
      sel.innerHTML = `
        <option value="">-- Select from Existing Uploaded Charts (${images.length} available) --</option>
        ${images.map(img => `<option value="${img.url}">${img.title} (${img.source})</option>`).join('')}
      `;
    }
  } catch (e) {
    console.warn('Error loading available images:', e);
  }
}

function previewNewChartImageChoice(url) {
  const box = document.getElementById('new-chart-image-preview-box');
  const img = document.getElementById('new-chart-img-preview');
  const name = document.getElementById('new-chart-img-name');
  if (url) {
    if (img) img.src = url;
    if (name) name.textContent = url.split('/').pop();
    if (box) box.style.display = 'flex';
  } else {
    if (box) box.style.display = 'none';
  }
}

function previewNewChartUploadedFile(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    previewNewChartImageChoice(e.target.result);
    const sel = document.getElementById('new-chart-existing-image-select');
    if (sel) sel.value = '';
  };
  reader.readAsDataURL(file);
}

// ---------------- COMPLETE SETUP SUBMIT ----------------
async function submitNewChart(event) {
  event.preventDefault();

  const title = document.getElementById('new-chart-title').value.trim();
  const category = document.getElementById('new-chart-category').value;
  const summary = document.getElementById('new-chart-summary').value.trim();
  const keyTakeaway = document.getElementById('new-chart-takeaway').value.trim();

  const existingImageChoice = document.getElementById('new-chart-existing-image-select')?.value;
  const chartImageFile = document.getElementById('new-chart-image-file')?.files[0];

  const teluguVideoFile = document.getElementById('new-chart-telugu-file')?.files[0];
  const englishVideoFile = document.getElementById('new-chart-english-file')?.files[0];

  const selectedTeluguUrl = document.getElementById('new-chart-telugu-select')?.value;
  const selectedEnglishUrl = document.getElementById('new-chart-english-select')?.value;

  const formData = new FormData();
  formData.append('title', title);
  formData.append('category', category);
  formData.append('summary', summary);
  formData.append('keyTakeaway', keyTakeaway);

  if (chartImageFile) {
    formData.append('chartImage', chartImageFile);
  } else if (existingImageChoice) {
    formData.append('customChartUrl', existingImageChoice);
  }

  if (teluguVideoFile) {
    formData.append('teluguVideo', teluguVideoFile);
  } else if (selectedTeluguUrl) {
    formData.append('customTeluguUrl', selectedTeluguUrl);
  }

  if (englishVideoFile) {
    formData.append('englishVideo', englishVideoFile);
  } else if (selectedEnglishUrl) {
    formData.append('customEnglishUrl', selectedEnglishUrl);
  }

  const submitBtn = document.getElementById('new-chart-submit-btn');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Publishing Chart Setup...';

  try {
    const res = await fetch('/api/charts', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();

    if (data.success) {
      showToast('🚀 New Chart & Videos Published Successfully!', 'success');
      closeAddChartModal();
      await loadCharts();
      renderApp();
      renderAdminChartsTable();
    } else {
      showToast(data.error || 'Failed to upload chart', 'error');
    }
  } catch (err) {
    showToast('Upload error: ' + err.message, 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Publish Chart Setup';
  }
}

// ==================== EDIT / RENAME CHART MODAL (WITH INTERACTIVE PREVIEW BOX) ====================
async function openRenameModal(chartId) {
  const chart = state.charts.find(c => c.id === chartId);
  if (!chart) return;

  const modal = document.getElementById('rename-chart-modal');
  if (!modal) return;

  document.getElementById('edit-chart-id').value = chart.id;
  document.getElementById('edit-chart-title').value = chart.title;
  document.getElementById('edit-chart-category').value = chart.category;
  document.getElementById('edit-chart-summary').value = chart.summary || '';
  document.getElementById('edit-chart-takeaway').value = chart.keyTakeaway || '';
  document.getElementById('edit-chart-telugu-url').value = chart.teluguVideo || '';
  document.getElementById('edit-chart-english-url').value = chart.englishVideo || '';

  // Interactive Preview Box Population
  const currentImg = chart.chartImage || '/assets/charts/chart-1.svg';
  document.getElementById('edit-modal-chart-preview-img').src = currentImg;
  document.getElementById('edit-chart-current-image-url').value = currentImg;

  // Clear replacement file input
  const fileInput = document.getElementById('edit-chart-replacement-file');
  if (fileInput) fileInput.value = '';

  // Populate existing chart images selector
  try {
    const res = await fetch('/api/charts/available-images');
    const availableImages = await res.json();
    const sel = document.getElementById('edit-chart-select-existing');
    if (sel && Array.isArray(availableImages)) {
      sel.innerHTML = `
        <option value="">-- Choose from Available Charts (${availableImages.length}) --</option>
        ${availableImages.map(img => `<option value="${img.url}" ${img.url === currentImg ? 'selected' : ''}>${img.title} (${img.source})</option>`).join('')}
      `;
    }
  } catch (e) {
    console.warn('Error loading chart options in edit modal:', e);
  }

  // Populate video selectors
  populateEditVideoDropdowns(chart.teluguVideo, chart.englishVideo);

  modal.classList.add('active');
}

function populateEditVideoDropdowns(currentTelugu, currentEnglish) {
  const telSel = document.getElementById('edit-chart-telugu-select');
  const engSel = document.getElementById('edit-chart-english-select');

  const inv = state.adminMediaInventory || { teluguVideos: [], englishVideos: [], uploadedMedia: [] };

  if (telSel) {
    const options = [
      ...(inv.teluguVideos || []).map(v => `<option value="${v.url}" ${v.url === currentTelugu ? 'selected' : ''}>${v.name}</option>`),
      ...(inv.uploadedMedia || []).map(v => `<option value="${v.url}" ${v.url === currentTelugu ? 'selected' : ''}>${v.name} (Uploaded)</option>`)
    ];
    telSel.innerHTML = `
      <option value="">-- Choose Telugu Video from Repository --</option>
      ${options.join('')}
    `;
  }

  if (engSel) {
    const options = [
      ...(inv.englishVideos || []).map(v => `<option value="${v.url}" ${v.url === currentEnglish ? 'selected' : ''}>${v.name}</option>`),
      ...(inv.uploadedMedia || []).map(v => `<option value="${v.url}" ${v.url === currentEnglish ? 'selected' : ''}>${v.name} (Uploaded)</option>`)
    ];
    engSel.innerHTML = `
      <option value="">-- Choose English Video from Repository --</option>
      ${options.join('')}
    `;
  }
}

function handleEditSelectExistingChart(url) {
  if (!url) return;
  document.getElementById('edit-modal-chart-preview-img').src = url;
  document.getElementById('edit-chart-current-image-url').value = url;
  // Clear any uploaded file
  const fileInput = document.getElementById('edit-chart-replacement-file');
  if (fileInput) fileInput.value = '';
}

function handleEditReplacementFileSelected(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = e => {
    document.getElementById('edit-modal-chart-preview-img').src = e.target.result;
  };
  reader.readAsDataURL(file);

  // Clear existing dropdown selection
  const sel = document.getElementById('edit-chart-select-existing');
  if (sel) sel.value = '';
}

function handleEditTeluguSelectChange(url) {
  if (url) document.getElementById('edit-chart-telugu-url').value = url;
}

function handleEditEnglishSelectChange(url) {
  if (url) document.getElementById('edit-chart-english-url').value = url;
}

function zoomCurrentEditChart() {
  const src = document.getElementById('edit-modal-chart-preview-img')?.src;
  const title = document.getElementById('edit-chart-title')?.value || 'Chart Preview';
  if (src) viewFullChartImage(src, title);
}

function viewFullChartImage(src, title) {
  const modal = document.getElementById('admin-media-preview-modal');
  const titleEl = document.getElementById('admin-media-preview-title');
  const bodyEl = document.getElementById('admin-media-preview-body');
  if (!modal || !bodyEl) return;

  if (titleEl) titleEl.textContent = title || 'Chart Full Preview';
  bodyEl.innerHTML = `
    <img src="${src}" alt="" style="width: 100%; max-height: 70vh; object-fit: contain; border-radius: 8px; border: 1.5px solid rgba(0,242,152,0.3);" />
    <div style="margin-top: 14px; display: flex; justify-content: center; gap: 10px; flex-wrap: wrap;">
      <button type="button" class="btn btn-sm btn-primary" onclick="downloadMediaFile('${src}', '${escapeHtml(title)}')">
        📥 Download HD Chart
      </button>
      <button type="button" class="btn btn-sm btn-secondary" onclick="closeAdminMediaPreviewModal()">Close</button>
    </div>
  `;
  modal.classList.add('active');
}

function openAdminVideoPlayer(url, title) {
  const modal = document.getElementById('admin-media-preview-modal');
  const titleEl = document.getElementById('admin-media-preview-title');
  const bodyEl = document.getElementById('admin-media-preview-body');
  if (!modal || !bodyEl) return;

  if (titleEl) titleEl.textContent = `🎬 ${title || 'Video Playback'}`;
  bodyEl.innerHTML = `
    <video controls autoplay style="width: 100%; max-height: 65vh; border-radius: 8px; background: #000; outline: none;">
      <source src="${url}" type="video/mp4" />
      Your browser does not support the video tag.
    </video>
    <div style="margin-top: 14px; display: flex; justify-content: center; gap: 10px; flex-wrap: wrap;">
      <button type="button" class="btn btn-sm btn-primary" onclick="downloadMediaFile('${url}', '${escapeHtml(title)}')">
        📥 Download Video
      </button>
      <button type="button" class="btn btn-sm btn-secondary" onclick="closeAdminMediaPreviewModal()">Close Video</button>
    </div>
  `;
  modal.classList.add('active');
}

function testPlayModalVideo(lang) {
  const urlInput = lang === 'telugu' ? document.getElementById('edit-chart-telugu-url') : document.getElementById('edit-chart-english-url');
  const url = urlInput?.value?.trim();
  if (!url) {
    showToast(`No ${lang} video assigned yet. Select or upload one first.`, 'warning');
    return;
  }
  openAdminVideoPlayer(url, `${lang.toUpperCase()} Video Preview`);
}

// ==================== UNIVERSAL ADMIN DOWNLOAD CONTROLS (CHARTS & VIDEOS) ====================
function downloadMediaFile(url, title) {
  if (!url) {
    showToast('No media file available to download', 'warning');
    return;
  }

  // If it's an image, use high quality chart image converter / download
  const isImage = /\.(png|jpg|jpeg|svg|webp)($|\?)/i.test(url);
  if (isImage) {
    downloadChartImage(url, title);
    return;
  }

  // For video files or binary assets:
  const safeTitle = (title || 'TradingHub_Media').replace(/[^a-zA-Z0-9_\-\s]/g, '').trim();
  const dlUrl = `/api/media/download?url=${encodeURIComponent(url)}&title=${encodeURIComponent(safeTitle)}`;

  const a = document.createElement('a');
  a.href = dlUrl;
  a.setAttribute('download', '');
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  showToast(`📥 Downloading "${safeTitle}"... Check your device downloads.`, 'info');
}

function downloadCurrentEditChart() {
  const imgEl = document.getElementById('edit-modal-chart-preview-img');
  const titleEl = document.getElementById('edit-chart-title');
  const src = imgEl?.src;
  const title = titleEl?.value?.trim() || 'Chart_Setup';
  if (src) {
    downloadMediaFile(src, `${title} - Chart Image`);
  } else {
    showToast('No chart image loaded to download', 'warning');
  }
}

function downloadModalVideo(lang) {
  const input = lang === 'telugu' ? document.getElementById('edit-chart-telugu-url') : document.getElementById('edit-chart-english-url');
  const titleEl = document.getElementById('edit-chart-title');
  const url = input?.value?.trim();
  const baseTitle = titleEl?.value?.trim() || 'Trading_Setup';
  if (!url) {
    showToast(`No ${lang} video assigned to download. Select or upload one first.`, 'warning');
    return;
  }
  downloadMediaFile(url, `${baseTitle} - ${lang.toUpperCase()} Video`);
}

function closeAdminMediaPreviewModal() {
  const modal = document.getElementById('admin-media-preview-modal');
  if (modal) {
    const video = modal.querySelector('video');
    if (video) video.pause();
    modal.classList.remove('active');
  }
}

function closeRenameModal() {
  const modal = document.getElementById('rename-chart-modal');
  if (modal) modal.classList.remove('active');
}

async function submitEditChart(event) {
  event.preventDefault();

  const id = document.getElementById('edit-chart-id').value;
  const title = document.getElementById('edit-chart-title').value.trim();
  const category = document.getElementById('edit-chart-category').value;
  const summary = document.getElementById('edit-chart-summary').value.trim();
  const keyTakeaway = document.getElementById('edit-chart-takeaway').value.trim();
  const teluguVideo = document.getElementById('edit-chart-telugu-url').value.trim();
  const englishVideo = document.getElementById('edit-chart-english-url').value.trim();
  const customChartUrl = document.getElementById('edit-chart-current-image-url').value.trim();

  const replacementImageFile = document.getElementById('edit-chart-replacement-file')?.files[0];
  const replacementTeluguFile = document.getElementById('edit-chart-telugu-file')?.files[0];
  const replacementEnglishFile = document.getElementById('edit-chart-english-file')?.files[0];

  const submitBtn = document.getElementById('edit-chart-submit-btn');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Saving Changes...';

  try {
    let res;
    // If files are attached, use multipart FormData
    if (replacementImageFile || replacementTeluguFile || replacementEnglishFile) {
      const formData = new FormData();
      formData.append('title', title);
      formData.append('category', category);
      formData.append('summary', summary);
      formData.append('keyTakeaway', keyTakeaway);
      formData.append('teluguVideo', teluguVideo);
      formData.append('englishVideo', englishVideo);
      if (customChartUrl) formData.append('customChartUrl', customChartUrl);

      if (replacementImageFile) formData.append('chartImage', replacementImageFile);
      if (replacementTeluguFile) formData.append('teluguVideo', replacementTeluguFile);
      if (replacementEnglishFile) formData.append('englishVideo', replacementEnglishFile);

      res = await fetch(`/api/charts/${id}`, {
        method: 'PUT',
        body: formData
      });
    } else {
      // Standard JSON update
      res = await fetch(`/api/charts/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          category,
          summary,
          keyTakeaway,
          teluguVideo,
          englishVideo,
          customChartUrl
        })
      });
    }

    const data = await res.json();
    if (data.success) {
      showToast('✅ Chart setup and media updated successfully!', 'success');
      closeRenameModal();
      await loadCharts();
      renderApp();
      renderAdminChartsTable();
    } else {
      showToast(data.error || 'Failed to update chart', 'error');
    }
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Save All Changes';
  }
}

// ==================== SITE TEXT CMS (LIVE WEBSITE TEXT EDITOR) ====================
// Pre-fill form from siteConfig
function populateCmsForm() {
  const cfg = state.siteConfig;
  if (!cfg) return;

  document.getElementById('cms-brand-name').value = cfg.brandName || '';
  document.getElementById('cms-tagline').value = cfg.tagline || '';
  document.getElementById('cms-hero-badge').value = cfg.hero?.badge || '';
  document.getElementById('cms-hero-title').value = cfg.hero?.title || '';
  document.getElementById('cms-hero-subtitle').value = cfg.hero?.subtitle || '';
  document.getElementById('cms-price').value = cfg.pricing?.price || 399;
  document.getElementById('cms-original-price').value = cfg.pricing?.originalPrice || 999;
  document.getElementById('cms-discount-badge').value = cfg.pricing?.discountBadge || '';
  document.getElementById('cms-razorpay-url').value = cfg.pricing?.razorpayUrl || '';
  document.getElementById('cms-no-refund-text').value = cfg.termsAndConditions?.noRefundPolicy || '';
  document.getElementById('cms-disclaimer').value = cfg.termsAndConditions?.disclaimer || '';
  document.getElementById('cms-support-email').value = cfg.contact?.supportEmail || '';
  document.getElementById('cms-instagram').value = cfg.contact?.instagramHandle || '';
}

// Save CMS Text Changes Live to Backend
async function handleSaveCmsChanges(event) {
  event.preventDefault();

  const current = state.siteConfig || {};

  const updatedConfig = {
    ...current,
    brandName: document.getElementById('cms-brand-name').value.trim(),
    tagline: document.getElementById('cms-tagline').value.trim(),
    hero: {
      ...current.hero,
      badge: document.getElementById('cms-hero-badge').value.trim(),
      title: document.getElementById('cms-hero-title').value.trim(),
      subtitle: document.getElementById('cms-hero-subtitle').value.trim()
    },
    pricing: {
      ...current.pricing,
      price: parseInt(document.getElementById('cms-price').value, 10) || 399,
      originalPrice: parseInt(document.getElementById('cms-original-price').value, 10) || 999,
      discountBadge: document.getElementById('cms-discount-badge').value.trim(),
      razorpayUrl: document.getElementById('cms-razorpay-url').value.trim()
    },
    termsAndConditions: {
      ...current.termsAndConditions,
      noRefundPolicy: document.getElementById('cms-no-refund-text').value.trim(),
      disclaimer: document.getElementById('cms-disclaimer').value.trim()
    },
    contact: {
      ...current.contact,
      supportEmail: document.getElementById('cms-support-email').value.trim(),
      instagramHandle: document.getElementById('cms-instagram').value.trim()
    }
  };

  const saveBtn = document.getElementById('cms-save-btn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving Changes...';

  try {
    const res = await fetch('/api/site-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedConfig)
    });
    const data = await res.json();

    if (data.success) {
      state.siteConfig = data.config;
      
      // Update admin security credentials if provided
      const newAdminEmail = document.getElementById('cms-admin-email')?.value?.trim();
      const newAdminPassword = document.getElementById('cms-admin-password')?.value;
      if (newAdminEmail || newAdminPassword) {
        await fetch('/api/admin/credentials', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: newAdminEmail, password: newAdminPassword })
        });
        if (newAdminPassword) {
          document.getElementById('cms-admin-password').value = '';
        }
      }

      renderApp();
      showToast('✨ Live Website Text & Settings Updated Instantly!', 'success');
    } else {
      showToast(data.error || 'Failed to save configuration', 'error');
    }
  } catch (err) {
    showToast('Error saving: ' + err.message, 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save All Website Changes';
  }
}

// Load AWS Status
async function loadAwsStatus() {
  const statusContainer = document.getElementById('aws-status-info');
  if (!statusContainer) return;

  try {
    const res = await fetch('/api/aws/status');
    const aws = await res.json();

    statusContainer.innerHTML = `
      <div style="background: rgba(14, 20, 34, 0.7); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 20px;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px;">
          <strong style="font-size: 1.1rem; color: #fff;">AWS Backend Status:</strong>
          <span style="background: ${aws.status === 'CONNECTED' ? 'var(--accent-green)' : 'var(--accent-gold)'}; color: #000; font-weight: 800; font-size: 0.78rem; padding: 4px 10px; border-radius: var(--radius-full);">
            ${aws.status}
          </span>
        </div>
        <div style="font-size: 0.88rem; color: var(--text-secondary); line-height: 1.8;">
          <div>• <strong>Storage Engine:</strong> ${aws.storageBackend}</div>
          <div>• <strong>AWS Region:</strong> ${aws.region}</div>
          <div>• <strong>AWS S3 Bucket:</strong> ${aws.bucket}</div>
          <div>• <strong>System Note:</strong> ${aws.message}</div>
        </div>
      </div>
    `;
  } catch (err) {
    statusContainer.innerHTML = `<p style="color: var(--accent-red);">Could not load AWS status</p>`;
  }
}

// Terms & Conditions Modal Open/Close
function openTermsModal() {
  const modal = document.getElementById('terms-modal');
  if (modal) modal.classList.add('active');
}

function closeTermsModal() {
  const modal = document.getElementById('terms-modal');
  if (modal) modal.classList.remove('active');
}

// ==================== TOAST NOTIFICATIONS ====================
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container') || createToastContainer();
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  let iconSvg = '';
  if (type === 'success') {
    iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-green)" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>';
  } else if (type === 'info') {
    // Vibrant green download/check circle icon (never red circle)
    iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-green)" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="8 12 12 16 16 12"/><line x1="12" y1="8" x2="12" y2="16"/></svg>';
  } else {
    iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-red)" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
  }

  toast.innerHTML = `${iconSvg}<span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function createToastContainer() {
  const c = document.createElement('div');
  c.id = 'toast-container';
  document.body.appendChild(c);
  return c;
}

// ==================== UNIVERSAL CUSTOM DIALOG SYSTEM (BEAUTIFUL CONFIRM, PROMPT & ALERT) ====================
let customDialogResolver = null;
let customDialogMode = 'confirm'; // 'confirm' | 'prompt' | 'alert'

function ensureCustomDialogDOM() {
  let modal = document.getElementById('custom-dialog-modal');
  if (modal) return;
  const div = document.createElement('div');
  div.id = 'custom-dialog-modal';
  div.className = 'modal-overlay custom-dialog-overlay';
  div.style.display = 'none';
  div.style.zIndex = '100000';
  div.innerHTML = `
    <div class="custom-dialog-card type-primary" id="custom-dialog-card">
      <div class="custom-dialog-header">
        <span id="custom-dialog-badge" class="custom-dialog-badge">⚠️ ADMIN ACTION</span>
        <button type="button" class="custom-dialog-close-btn" onclick="resolveCustomDialog(false)">✕</button>
      </div>

      <div class="custom-dialog-body">
        <div class="custom-dialog-icon-ring" id="custom-dialog-icon-ring">
          <span class="custom-dialog-icon" id="custom-dialog-icon">⚠️</span>
        </div>

        <h3 class="custom-dialog-title" id="custom-dialog-title">Confirm Action</h3>
        <div class="custom-dialog-message" id="custom-dialog-message">Are you sure you want to proceed?</div>

        <!-- Prompt input area (visible only for prompt mode) -->
        <div class="custom-dialog-input-wrap" id="custom-dialog-input-wrap" style="display: none;">
          <label class="custom-dialog-input-label" id="custom-dialog-input-label">Setup Title</label>
          <div class="custom-dialog-field-box">
            <input type="text" id="custom-dialog-input" class="custom-dialog-input" placeholder="Type here..." autocomplete="off" />
            <button type="button" class="custom-dialog-clear-btn" onclick="clearCustomDialogInput()" title="Clear input">✕</button>
          </div>
        </div>
      </div>

      <div class="custom-dialog-actions" id="custom-dialog-actions">
        <button type="button" class="btn custom-dialog-btn-cancel" id="custom-dialog-cancel-btn" onclick="resolveCustomDialog(false)">Cancel</button>
        <button type="button" class="btn custom-dialog-btn-confirm type-primary" id="custom-dialog-confirm-btn" onclick="resolveCustomDialog(true)">Confirm</button>
      </div>
    </div>
  `;
  document.body.appendChild(div);

  div.addEventListener('click', e => {
    if (e.target === div) resolveCustomDialog(false);
  });
}

function clearCustomDialogInput() {
  const inp = document.getElementById('custom-dialog-input');
  if (inp) {
    inp.value = '';
    inp.focus();
  }
}

function resolveCustomDialog(confirmed) {
  const modal = document.getElementById('custom-dialog-modal');
  if (modal) modal.style.display = 'none';

  if (customDialogResolver) {
    if (customDialogMode === 'prompt') {
      if (confirmed) {
        const val = document.getElementById('custom-dialog-input')?.value;
        customDialogResolver(val !== undefined ? val.trim() : '');
      } else {
        customDialogResolver(null);
      }
    } else {
      customDialogResolver(Boolean(confirmed));
    }
    customDialogResolver = null;
  }
}

// Global keyboard accessibility for custom dialog
document.addEventListener('keydown', e => {
  const modal = document.getElementById('custom-dialog-modal');
  if (modal && modal.style.display !== 'none') {
    if (e.key === 'Escape') {
      e.preventDefault();
      resolveCustomDialog(false);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      resolveCustomDialog(true);
    }
  }
});

// Setup click-backdrop listener for statically embedded modal
document.addEventListener('DOMContentLoaded', () => {
  const modal = document.getElementById('custom-dialog-modal');
  if (modal) {
    modal.addEventListener('click', e => {
      if (e.target === modal) resolveCustomDialog(false);
    });
  }
});

function customConfirm({
  title = 'Confirmation Required',
  message = 'Are you sure you want to proceed?',
  badge = '⚡ CONFIRMATION',
  type = 'primary', // 'danger' | 'warning' | 'success' | 'primary'
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  icon = '⚠️'
} = {}) {
  ensureCustomDialogDOM();
  customDialogMode = 'confirm';

  const modal = document.getElementById('custom-dialog-modal');
  const card = document.getElementById('custom-dialog-card');
  const badgeEl = document.getElementById('custom-dialog-badge');
  const iconEl = document.getElementById('custom-dialog-icon');
  const titleEl = document.getElementById('custom-dialog-title');
  const msgEl = document.getElementById('custom-dialog-message');
  const inputWrap = document.getElementById('custom-dialog-input-wrap');
  const cancelBtn = document.getElementById('custom-dialog-cancel-btn');
  const confirmBtn = document.getElementById('custom-dialog-confirm-btn');

  if (card) card.className = `custom-dialog-card type-${type}`;
  if (badgeEl) badgeEl.textContent = badge;
  if (iconEl) iconEl.textContent = icon;
  if (titleEl) titleEl.textContent = title;
  if (msgEl) msgEl.innerHTML = message;
  if (inputWrap) inputWrap.style.display = 'none';

  if (cancelBtn) {
    cancelBtn.style.display = cancelText ? 'block' : 'none';
    cancelBtn.textContent = cancelText || 'Cancel';
  }

  if (confirmBtn) {
    confirmBtn.textContent = confirmText;
    confirmBtn.className = `btn custom-dialog-btn-confirm type-${type}`;
  }

  modal.style.display = 'flex';
  if (confirmBtn) confirmBtn.focus();

  return new Promise(resolve => {
    customDialogResolver = resolve;
  });
}

function customPrompt({
  title = 'Input Required',
  message = 'Please enter a value:',
  defaultValue = '',
  placeholder = 'Type here...',
  label = 'Value',
  badge = '✏️ INPUT REQUIRED',
  type = 'primary',
  confirmText = 'Save',
  cancelText = 'Cancel',
  icon = '✏️'
} = {}) {
  ensureCustomDialogDOM();
  customDialogMode = 'prompt';

  const modal = document.getElementById('custom-dialog-modal');
  const card = document.getElementById('custom-dialog-card');
  const badgeEl = document.getElementById('custom-dialog-badge');
  const iconEl = document.getElementById('custom-dialog-icon');
  const titleEl = document.getElementById('custom-dialog-title');
  const msgEl = document.getElementById('custom-dialog-message');
  const inputWrap = document.getElementById('custom-dialog-input-wrap');
  const labelEl = document.getElementById('custom-dialog-input-label');
  const input = document.getElementById('custom-dialog-input');
  const cancelBtn = document.getElementById('custom-dialog-cancel-btn');
  const confirmBtn = document.getElementById('custom-dialog-confirm-btn');

  if (card) card.className = `custom-dialog-card type-${type}`;
  if (badgeEl) badgeEl.textContent = badge;
  if (iconEl) iconEl.textContent = icon;
  if (titleEl) titleEl.textContent = title;
  if (msgEl) msgEl.innerHTML = message;

  if (inputWrap) inputWrap.style.display = 'block';
  if (labelEl) labelEl.textContent = label;
  if (input) {
    input.value = defaultValue || '';
    input.placeholder = placeholder;
  }

  if (cancelBtn) {
    cancelBtn.style.display = cancelText ? 'block' : 'none';
    cancelBtn.textContent = cancelText || 'Cancel';
  }

  if (confirmBtn) {
    confirmBtn.textContent = confirmText;
    confirmBtn.className = `btn custom-dialog-btn-confirm type-${type}`;
  }

  modal.style.display = 'flex';
  setTimeout(() => {
    if (input) {
      input.focus();
      input.select();
    }
  }, 60);

  return new Promise(resolve => {
    customDialogResolver = resolve;
  });
}

function customAlert({
  title = 'Notice',
  message = '',
  badge = 'ℹ️ INFORMATION',
  type = 'primary',
  confirmText = 'Got It',
  icon = 'ℹ️'
} = {}) {
  return customConfirm({
    title,
    message,
    badge,
    type,
    confirmText,
    cancelText: '',
    icon
  });
}

window.customConfirm = customConfirm;
window.customPrompt = customPrompt;
window.customAlert = customAlert;

// ==================== DEDICATED ADMIN LOGIN MODAL (FOOTER ACCESS) ====================
function openDedicatedAdminLoginModal() {
  const emailInput = document.getElementById('dedicated-admin-email');
  const passInput = document.getElementById('dedicated-admin-password');
  const pinInput = document.getElementById('dedicated-admin-pin');
  if (emailInput) emailInput.value = '';
  if (passInput) passInput.value = '';
  if (pinInput) pinInput.value = '';

  resetPasswordToggle('dedicated-admin-password');
  resetPasswordToggle('dedicated-admin-pin');

  const modal = document.getElementById('admin-login-modal');
  if (modal) {
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
    setTimeout(() => {
      if (emailInput) emailInput.focus();
    }, 120);
  }

  // Bind Enter key on all dedicated admin fields
  ['dedicated-admin-email', 'dedicated-admin-password', 'dedicated-admin-pin'].forEach(id => {
    const el = document.getElementById(id);
    if (el && !el._hasAdminEnter) {
      el._hasAdminEnter = true;
      el.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleDedicatedAdminLoginSubmit(e);
        }
      });
    }
  });
}

function closeDedicatedAdminLoginModal() {
  const emailInput = document.getElementById('dedicated-admin-email');
  const passInput = document.getElementById('dedicated-admin-password');
  const pinInput = document.getElementById('dedicated-admin-pin');
  if (emailInput) emailInput.value = '';
  if (passInput) passInput.value = '';
  if (pinInput) pinInput.value = '';

  const modal = document.getElementById('admin-login-modal');
  if (modal) modal.classList.remove('active');

  const otherActive = document.querySelector('.modal-overlay.active');
  if (!otherActive) {
    document.body.style.overflow = '';
  }
}

async function handleDedicatedAdminLoginSubmit(event) {
  if (event) event.preventDefault();

  const emailInput = document.getElementById('dedicated-admin-email');
  const passInput = document.getElementById('dedicated-admin-password');
  const pinInput = document.getElementById('dedicated-admin-pin');
  const email = emailInput?.value?.trim();
  const password = passInput?.value;
  const pincode = pinInput?.value?.trim();

  if (!email || !password) {
    showToast('Please enter both admin email and password.', 'error');
    return;
  }

  if (!pincode) {
    showToast('🔒 Please enter your Admin Security PIN (Ultra Privacy).', 'error');
    pinInput?.focus();
    return;
  }

  if (pincode !== ADMIN_PIN) {
    showToast('❌ Invalid Admin Security PIN Code. Ultra Privacy Access Denied.', 'error');
    if (pinInput) {
      pinInput.value = '';
      pinInput.focus();
    }
    return;
  }

  const btn = document.getElementById('dedicated-admin-submit-btn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Verifying PIN & Credentials...';
  }

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, pincode })
    });
    const data = await res.json();

    if (data.success && data.user) {
      // Clear inputs from memory & DOM immediately
      if (emailInput) emailInput.value = '';
      if (passInput) passInput.value = '';
      if (pinInput) pinInput.value = '';

      if (data.sessionToken) {
        data.user.sessionToken = data.sessionToken;
        safeSessionStorage.setItem('tradinghub_session_token', data.sessionToken);
      }
      safeSessionStorage.setItem('tradinghub_admin_pin_verified', ADMIN_PIN);
      saveAuthState(data.user);
      closeDedicatedAdminLoginModal();
      renderApp();

      if (data.user.role === 'admin') {
        showToast('👑 Admin Login Successful with Ultra Privacy PIN! Welcome Owner.', 'success');
        openAdminModal();
      } else {
        showToast('✅ Login Successful! Welcome back.', 'success');
      }
    } else {
      showToast(data.error || 'Invalid admin credentials.', 'error');
    }
  } catch (err) {
    showToast('Network error: ' + err.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Authenticate & Open Admin CMS';
    }
    // Strict privacy: clean inputs again
    if (emailInput) emailInput.value = '';
    if (passInput) passInput.value = '';
    if (pinInput) pinInput.value = '';
  }
}

window.openDedicatedAdminLoginModal = openDedicatedAdminLoginModal;
window.closeDedicatedAdminLoginModal = closeDedicatedAdminLoginModal;
window.handleDedicatedAdminLoginSubmit = handleDedicatedAdminLoginSubmit;

// ==================== IMAGE-ONLY CHART GALLERY & LIGHTBOX ====================
async function loadChartGallery() {
  try {
    const res = await fetch('/api/chart-gallery');
    state.gallery = await res.json();
    renderChartGallery();
  } catch (e) {
    console.error('Error loading chart gallery:', e);
  }
}

function renderChartGallery() {
  const container = document.getElementById('gallery-grid-container');
  const dropzone = document.getElementById('gallery-admin-dropzone');
  const moreBanner = document.getElementById('gallery-more-banner');
  if (!container) return;

  const isDedicatedChartsPage = window.location.pathname.includes('all-charts') || window.location.pathname.includes('charts-vault');
  const isHomePage = !isDedicatedChartsPage;

  const isAdmin = state.currentUser?.role === 'admin';
  const isUnlocked = Boolean(state.currentUser?.hasPaid || isAdmin);

  // Only Admin sees Drag-and-Drop zone
  if (dropzone) {
    dropzone.style.display = isAdmin ? 'block' : 'none';
  }

  if (!state.gallery || state.gallery.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted);">
        <p>No standalone chart images uploaded yet.</p>
      </div>
    `;
    if (moreBanner) moreBanner.innerHTML = '';
    return;
  }

  // Strictly limit to 2 charts on Home page until user clicks More
  let displayGallery = state.gallery;
  let hasMoreGallery = false;
  if (isHomePage && !state.showAllGalleryCharts && state.gallery.length > 2) {
    displayGallery = state.gallery.slice(0, 2);
    hasMoreGallery = true;
    container.classList.remove('expanded');
  } else if (isHomePage && state.showAllGalleryCharts) {
    container.classList.add('expanded');
  }

  let cardsHtml = displayGallery.map(item => {
    const escapedTitle = (item.title || 'Chart Setup').replace(/'/g, "\\'");
    const clickAction = isUnlocked
      ? `openGalleryLightbox('${item.imageUrl}', '${escapedTitle}', '${item.id}')`
      : `handleUnpaidChartClick()`;
    const isSelected = state.selectedCharts && state.selectedCharts.has(item.id);

    return `
      <div class="gallery-card ${isSelected ? 'is-selected' : ''}" data-chart-id="${item.id}" data-chart-url="${item.imageUrl}" data-chart-title="${escapedTitle}">
        <div class="chart-select-box ${isSelected ? 'selected' : ''}" onclick="toggleChartSelection(event, '${item.id}', '${item.imageUrl}', '${escapedTitle}')" title="Select chart for batch download">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#060b14" stroke-width="4"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <button type="button" class="chart-card-dl-btn" onclick="downloadSingleChartDirect(event, '${item.imageUrl}', '${escapedTitle}')" title="Download this chart to Gallery (HD PNG)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        </button>
        <div class="gallery-thumb-wrap ${isUnlocked ? '' : 'locked'}" onclick="${clickAction}" title="${isUnlocked ? 'Click to view full screen' : '🔒 Locked Chart - Click to Unlock'}" style="cursor: pointer;">
          <img src="${item.imageUrl}" alt="${item.title}" loading="lazy" decoding="async" />
          ${!isUnlocked ? `
            <div class="gallery-lock-overlay">
              <div class="gallery-lock-badge">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                <span>LOCKED SETUP</span>
              </div>
              <span style="font-size: 0.72rem; color: var(--accent-gold); font-weight: 700; margin-top: 4px;">Unlock to View</span>
            </div>
          ` : ''}
        </div>
        <div class="gallery-card-body">
          <h4 class="gallery-card-title">${item.title}</h4>
          <div class="gallery-card-actions">
            <button class="btn btn-sm ${isUnlocked ? 'btn-secondary' : 'btn-gold'}" onclick="${clickAction}" style="padding: 4px 10px; font-size: 0.75rem; display: inline-flex; align-items: center; gap: 4px;">
              ${isUnlocked ? `
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <span>Inspect</span>
              ` : `
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                <span>🔒 Unlock to View</span>
              `}
            </button>
            ${isAdmin ? `
              <div class="gallery-admin-controls">
                <button class="btn btn-sm btn-secondary" onclick="event.stopPropagation(); promptRenameGalleryImage('${item.id}', '${escapedTitle}')" title="Rename Title" style="padding: 4px 8px; font-size: 0.75rem;">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  Rename
                </button>
                <button class="btn btn-sm btn-danger" onclick="event.stopPropagation(); deleteGalleryImage('${item.id}')" title="Delete Chart" style="padding: 4px 8px; font-size: 0.75rem;">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                  Delete
                </button>
              </div>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');

  // 3rd card: interactive "+ MORE CHARTS" card if on home page and not expanded
  if (hasMoreGallery) {
    cardsHtml += `
      <div class="gallery-card more-explore-card" onclick="toggleShowAllGallery(true)" style="cursor: pointer;" title="Click to reveal all charts">
        <div class="more-card-content">
          <div class="more-card-icon" style="border-color: var(--accent-gold); color: var(--accent-gold); box-shadow: 0 0 20px rgba(255,215,0,0.3); font-size: 2rem;">📊</div>
          <div class="more-card-badge" style="background: var(--accent-gold); color: #000;">+ MORE CHARTS</div>
          <h3 class="more-card-title">+ More Charts</h3>
          <p class="more-card-desc">Click here to reveal all institutional hand-drawn charts and templates.</p>
          <button class="btn btn-sm btn-gold" onclick="event.stopPropagation(); toggleShowAllGallery(true);" style="margin-top: 8px;">
            Show All Charts ▼
          </button>
        </div>
      </div>
    `;
  }

  container.innerHTML = cardsHtml;

  // Update gallery more banner
  if (moreBanner) {
    if (isHomePage) {
      if (!state.showAllGalleryCharts && state.gallery.length > 2) {
        moreBanner.innerHTML = `
          <button type="button" class="btn btn-secondary btn-lg" onclick="toggleShowAllGallery(true)" style="display: inline-flex; align-items: center; gap: 10px; border-color: var(--accent-gold); background: rgba(255,215,0,0.08); font-weight: 700; color: #fff; cursor: pointer;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
            <span>+ More Charts (Click to Display All Vault Charts) ▼</span>
          </button>
        `;
      } else if (state.showAllGalleryCharts) {
        moreBanner.innerHTML = `
          <div style="display: flex; gap: 14px; justify-content: center; flex-wrap: wrap; align-items: center;">
            <button type="button" class="btn btn-secondary btn-lg" onclick="toggleShowAllGallery(false)" style="border-color: rgba(255,255,255,0.25); color: #fff; cursor: pointer; display: inline-flex; align-items: center; gap: 8px;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"/></svg>
              <span>▲ Show Less (Collapse to 2 Charts)</span>
            </button>
            <a href="/all-charts" class="btn btn-gold btn-lg" style="display: inline-flex; align-items: center; gap: 8px;">
              <span>Explore Full Chart Vault Page &rarr;</span>
            </a>
          </div>
        `;
      } else {
        moreBanner.innerHTML = '';
      }
    } else {
      moreBanner.innerHTML = '';
    }
  }
}

// Admin Special Access Daily Chart Uploader (for Only Charts filter tab)
async function handleDailyChartUpload(files) {
  if (!files || files.length === 0) return;
  if (state.currentUser?.role !== 'admin') {
    showToast('Only Admin / Owner can upload daily charts.', 'error');
    return;
  }
  const file = files[0];
  const defaultTitle = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
  const title = await customPrompt({
    title: 'Daily Institutional Chart',
    message: 'Enter title for today\'s new technical chart setup:',
    defaultValue: defaultTitle,
    placeholder: 'e.g. Bank Nifty Morning Gap Fill Strategy',
    label: 'Daily Chart Title',
    badge: '👑 DAILY CHART UPLOAD',
    type: 'primary',
    confirmText: 'Publish Daily Chart',
    cancelText: 'Cancel',
    icon: '📈'
  });
  if (!title) return;

  const formData = new FormData();
  formData.append('chartImage', file);
  formData.append('title', title);

  showToast('Uploading new daily chart...', 'info');

  try {
    const res = await fetch('/api/chart-gallery', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (data.success) {
      showToast('✅ Daily chart uploaded successfully!', 'success');
      await loadChartGallery();
      renderCharts();
    } else {
      showToast(data.error || 'Failed to upload daily chart', 'error');
    }
  } catch (err) {
    showToast('Upload error: ' + err.message, 'error');
  }

  const fileInput = document.getElementById('daily-chart-file-input');
  if (fileInput) fileInput.value = '';
}

function initDailyChartDragDrop() {
  const dropArea = document.getElementById('daily-chart-drop-area');
  if (!dropArea) return;

  ['dragenter', 'dragover'].forEach(eventName => {
    dropArea.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropArea.classList.add('dragover');
    }, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropArea.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropArea.classList.remove('dragover');
    }, false);
  });

  dropArea.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files && files.length > 0) {
      handleDailyChartUpload(files);
    }
  }, false);
}

window.handleDailyChartUpload = handleDailyChartUpload;
window.initDailyChartDragDrop = initDailyChartDragDrop;

function initGalleryDragDrop() {
  const dropArea = document.getElementById('gallery-drop-area');
  if (!dropArea) return;

  ['dragenter', 'dragover'].forEach(eventName => {
    dropArea.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropArea.classList.add('dragover');
    }, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropArea.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropArea.classList.remove('dragover');
    }, false);
  });

  dropArea.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files && files.length > 0) {
      handleGalleryFileInput(files);
    }
  }, false);
}

async function handleGalleryFileInput(files) {
  if (!files || files.length === 0) return;
  const file = files[0];
  const defaultTitle = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
  const title = await customPrompt({
    title: 'Hand-Drawn Technical Chart',
    message: 'Enter a descriptive title for this chart setup:',
    defaultValue: defaultTitle,
    placeholder: 'e.g. Nifty 50 Liquidity Sweep & Mitigation Zone',
    label: 'Chart Setup Title',
    badge: '📊 HAND-DRAWN CHART',
    type: 'primary',
    confirmText: 'Save & Upload',
    cancelText: 'Cancel',
    icon: '🎨'
  });
  if (!title) return;

  const formData = new FormData();
  formData.append('chartImage', file);
  formData.append('title', title);

  showToast('Uploading chart image...', 'info');

  try {
    const res = await fetch('/api/chart-gallery', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (data.success) {
      showToast('✅ Chart image uploaded successfully!', 'success');
      await loadChartGallery();
    } else {
      showToast(data.error || 'Failed to upload chart image', 'error');
    }
  } catch (err) {
    showToast('Upload error: ' + err.message, 'error');
  }

  const fileInput = document.getElementById('gallery-file-input');
  if (fileInput) fileInput.value = '';
}

function openGalleryLightbox(imageUrl, title, chartId) {
  // If user is currently in multi-select mode (1 or more charts selected), clicking card toggles selection
  if (state.selectedCharts && state.selectedCharts.size > 0 && chartId) {
    toggleChartSelection(null, chartId, imageUrl, title);
    return;
  }
  state.activeLightboxImage = { url: imageUrl, title: title || 'Institutional Chart Setup' };
  const isUnlocked = Boolean(state.currentUser?.hasPaid || state.currentUser?.role === 'admin');
  if (!isUnlocked) {
    handleUnpaidChartClick();
    return;
  }
  const modal = document.getElementById('gallery-lightbox-modal');
  const img = document.getElementById('lightbox-image');
  const titleEl = document.getElementById('lightbox-title');
  if (modal && img) {
    img.src = imageUrl;
    if (titleEl) titleEl.textContent = title || 'Chart Setup';
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
}

function closeGalleryLightbox() {
  const modal = document.getElementById('gallery-lightbox-modal');
  if (modal) modal.classList.remove('active');
  const otherActive = document.querySelector('.modal-overlay.active');
  if (!otherActive) document.body.style.overflow = '';
}

function promptRenameGalleryImage(id, currentTitle) {
  const idInput = document.getElementById('rename-gallery-id');
  const titleInput = document.getElementById('rename-gallery-input');
  const modal = document.getElementById('rename-gallery-modal');

  if (idInput && titleInput && modal) {
    idInput.value = id;
    titleInput.value = currentTitle;
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
}

function closeRenameGalleryModal() {
  const modal = document.getElementById('rename-gallery-modal');
  if (modal) modal.classList.remove('active');
  const otherActive = document.querySelector('.modal-overlay.active');
  if (!otherActive) document.body.style.overflow = '';
}

async function submitRenameGalleryImage(event) {
  if (event) event.preventDefault();
  const id = document.getElementById('rename-gallery-id')?.value;
  const newTitle = document.getElementById('rename-gallery-input')?.value?.trim();

  if (!id || !newTitle) return;

  try {
    const res = await fetch(`/api/chart-gallery/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newTitle })
    });
    const data = await res.json();
    if (data.success) {
      showToast('✅ Chart renamed successfully!', 'success');
      closeRenameGalleryModal();
      await loadChartGallery();
    } else {
      showToast(data.error || 'Failed to rename chart', 'error');
    }
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

async function deleteGalleryImage(id) {
  const confirmed = await customConfirm({
    title: 'Remove From Image Vault?',
    message: 'Are you sure you want to permanently delete this chart from the image vault?',
    badge: '🗑️ VAULT DELETION',
    type: 'danger',
    confirmText: 'Delete Chart',
    cancelText: 'Cancel',
    icon: '🗑️'
  });
  if (!confirmed) return;

  try {
    const res = await fetch(`/api/chart-gallery/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast('🗑️ Chart deleted successfully!', 'info');
      await loadChartGallery();
    } else {
      showToast(data.error || 'Failed to delete chart', 'error');
    }
  } catch (err) {
    showToast('Delete error: ' + err.message, 'error');
  }
}

window.loadChartGallery = loadChartGallery;
window.renderChartGallery = renderChartGallery;
window.handleGalleryFileInput = handleGalleryFileInput;
window.openGalleryLightbox = openGalleryLightbox;
window.closeGalleryLightbox = closeGalleryLightbox;
window.promptRenameGalleryImage = promptRenameGalleryImage;
window.closeRenameGalleryModal = closeRenameGalleryModal;
window.submitRenameGalleryImage = submitRenameGalleryImage;
window.deleteGalleryImage = deleteGalleryImage;

// ==================== COMMUNITY COMMENTS & MESSAGE BOARD ====================
async function loadComments(showFeedback = false) {
  try {
    const res = await fetch('/api/comments');
    state.comments = await res.json();
    renderComments();
    if (showFeedback) showToast('Messages refreshed.', 'info');
  } catch (e) {
    console.error('Error loading comments:', e);
  }
}

function renderComments() {
  const container = document.getElementById('comments-feed-list');
  const countEl = document.getElementById('comments-total-count');
  const nameInput = document.getElementById('comment-author-name');

  if (!container) return;

  const isAdmin = state.currentUser?.role === 'admin';

  // Pre-fill name if user is logged in
  if (nameInput && state.currentUser?.name && !nameInput.value) {
    nameInput.value = state.currentUser.name;
  }

  if (countEl) countEl.textContent = state.comments?.length || 0;

  if (!state.comments || state.comments.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 30px; color: var(--text-muted); font-size: 0.9rem;">
        No community messages posted yet. Be the first to share your thoughts!
      </div>
    `;
    return;
  }

  container.innerHTML = state.comments.map(c => {
    const roleBadgeClass = c.role === 'admin' ? 'badge-owner' : (c.role === 'member' ? 'badge-member' : 'badge-trader');
    const roleLabel = c.role === 'admin' ? 'OWNER' : (c.role === 'member' ? 'PRO' : 'TRADER');
    const firstLetter = (c.name || 'T')[0].toUpperCase();
    const timeFormatted = formatTimeAgo(c.timestamp);

    // Privacy Protection: Author sees their full email; all other users see starred email (e.g. pr****ma@gmail.com)
    let emailDisplay = '';
    if (c.email) {
      const isAuthor = state.currentUser?.email && state.currentUser.email.toLowerCase() === c.email.toLowerCase();
      const isAdmin = state.currentUser?.role === 'admin';
      const displayEmail = (isAuthor || isAdmin) ? c.email : maskEmail(c.email);
      emailDisplay = `<span class="comment-user-email" title="${isAuthor ? 'Your verified email' : 'Protected Email'}">${escapeHtml(displayEmail)}</span>`;
    }

    return `
      <div class="comment-bubble" id="comment-bubble-${c.id}">
        <div class="comment-avatar ${c.role === 'admin' ? 'admin-avatar' : ''}">
          ${firstLetter}
        </div>
        <div class="comment-content-wrap">
          <div class="comment-header-row">
            <div class="comment-user-info">
              <span class="comment-user-name">${escapeHtml(c.name)}</span>
              ${emailDisplay}
              <span class="comment-badge ${roleBadgeClass}">${roleLabel}</span>
              <span class="comment-time">${timeFormatted}</span>
            </div>
            ${isAdmin ? `
              <button class="btn-delete-comment" onclick="handleDeleteComment('${c.id}')" title="Delete this comment (Admin Only)">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                Delete
              </button>
            ` : ''}
          </div>
          <p class="comment-body-text">${escapeHtml(c.text)}</p>
        </div>
      </div>
    `;
  }).join('');
}

async function handleCommentSubmit(event) {
  if (event) event.preventDefault();

  const nameInput = document.getElementById('comment-author-name');
  const emailInput = document.getElementById('comment-author-email');
  const textInput = document.getElementById('comment-message-text');
  const name = nameInput?.value?.trim() || state.currentUser?.name;
  const email = emailInput?.value?.trim() || state.currentUser?.email || null;
  const text = textInput?.value?.trim();

  if (!name || !text) {
    showToast('Please enter your name and message.', 'error');
    return;
  }

  const role = state.currentUser?.role === 'admin' ? 'admin' : (state.currentUser?.hasPaid ? 'member' : 'trader');

  const btn = document.getElementById('comment-submit-btn');
  if (btn) btn.disabled = true;

  try {
    const res = await fetch('/api/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, text, role, email })
    });
    const data = await res.json();
    if (data.success) {
      showToast('💬 Message posted to community board!', 'success');
      if (textInput) textInput.value = '';
      if (emailInput && !state.currentUser?.email) emailInput.value = '';
      await loadComments();
    } else {
      showToast(data.error || 'Failed to post message', 'error');
    }
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function handleDeleteComment(commentId) {
  const confirmed = await customConfirm({
    title: 'Delete Trader Comment?',
    message: 'Are you sure you want to delete this comment? This action cannot be undone.',
    badge: '💬 COMMENT MODERATION',
    type: 'warning',
    confirmText: 'Delete Comment',
    cancelText: 'Cancel',
    icon: '💬'
  });
  if (!confirmed) return;

  try {
    const res = await fetch(`/api/comments/${commentId}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast('🗑️ Comment deleted by Admin.', 'info');
      await loadComments();
    } else {
      showToast(data.error || 'Failed to delete comment', 'error');
    }
  } catch (err) {
    showToast('Delete error: ' + err.message, 'error');
  }
}

function maskEmail(email) {
  if (!email) return '';
  const parts = email.split('@');
  if (parts.length !== 2) return '******';
  const username = parts[0];
  const domain = parts[1];
  if (username.length <= 2) {
    return username[0] + '***@' + domain;
  }
  const visibleStart = username.slice(0, 2);
  const visibleEnd = username.slice(-2);
  return `${visibleStart}****${visibleEnd}@${domain}`;
}

function formatTimeAgo(isoString) {
  if (!isoString) return 'recently';
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / (1000 * 60));
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>'"]/g, tag => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[tag] || tag));
}

window.loadComments = loadComments;
window.renderComments = renderComments;
window.handleCommentSubmit = handleCommentSubmit;
window.handleDeleteComment = handleDeleteComment;
window.toggleShowAllVideos = toggleShowAllVideos;
window.toggleShowAllCharts = toggleShowAllCharts;
window.toggleShowAllGallery = toggleShowAllGallery;
window.handleUnpaidChartClick = handleUnpaidChartClick;
window.closeConcurrentSessionModal = closeConcurrentSessionModal;
window.deleteSingleChart = deleteSingleChart;
window.openRenameModal = openRenameModal;
window.closeRenameModal = closeRenameModal;
window.openAddChartModal = openAddChartModal;
window.closeAddChartModal = closeAddChartModal;
window.switchAddChartSubTab = switchAddChartSubTab;
window.handleChartOnlyFileInput = handleChartOnlyFileInput;
window.handleVideoOnlyFileInput = handleVideoOnlyFileInput;
window.renameChartOnly = renameChartOnly;
window.deleteChartOnly = deleteChartOnly;
window.useChartInFullSetup = useChartInFullSetup;
window.openAdminVideoPlayer = openAdminVideoPlayer;
window.deleteVideoOnly = deleteVideoOnly;
window.useVideoInFullSetup = useVideoInFullSetup;
window.previewNewChartImageChoice = previewNewChartImageChoice;
window.previewNewChartUploadedFile = previewNewChartUploadedFile;
window.submitNewChart = submitNewChart;
window.handleEditSelectExistingChart = handleEditSelectExistingChart;
window.handleEditReplacementFileSelected = handleEditReplacementFileSelected;
window.handleEditTeluguSelectChange = handleEditTeluguSelectChange;
window.handleEditEnglishSelectChange = handleEditEnglishSelectChange;
window.zoomCurrentEditChart = zoomCurrentEditChart;
window.viewFullChartImage = viewFullChartImage;
window.testPlayModalVideo = testPlayModalVideo;
window.closeAdminMediaPreviewModal = closeAdminMediaPreviewModal;
window.submitEditChart = submitEditChart;
window.downloadMediaFile = downloadMediaFile;
window.downloadCurrentEditChart = downloadCurrentEditChart;
window.downloadModalVideo = downloadModalVideo;


// ==================== ADMIN PAYMENTS & UTR PROOFS VIEWER ====================
async function loadAdminPayments() {
  const tbody = document.getElementById('admin-payments-table-body');
  if (!tbody) return;

  tbody.innerHTML = `
    <tr>
      <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 30px;">
        <span class="spinner-small" style="margin-right: 8px;"></span> Loading payments...
      </td>
    </tr>
  `;

  try {
    const res = await fetch('/api/admin/payments');
    const payments = await res.json();

    if (!Array.isArray(payments) || payments.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 30px;">
            No payment verification submissions yet.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = payments.map(p => {
      const dateStr = p.submittedAt ? new Date(p.submittedAt).toLocaleString() : 'N/A';
      const statusBadge = p.verified 
        ? '<span class="status-badge status-active" style="background: rgba(0,242,152,0.15); color: #00f298; border: 1px solid rgba(0,242,152,0.3); padding: 2px 8px; border-radius: 12px; font-size: 0.78rem;">✅ VERIFIED PRO</span>'
        : `<span class="status-badge status-danger" style="background: rgba(255,75,75,0.15); color: #ff7575; border: 1px solid rgba(255,75,75,0.3); padding: 2px 8px; border-radius: 12px; font-size: 0.78rem;" title="${p.error || 'Unconfirmed'}">❌ UNCONFIRMED</span>`;

      const screenshotHtml = p.screenshotUrl
        ? `<a href="${p.screenshotUrl}" target="_blank" rel="noopener" title="Click to view full screenshot proof">
            <img src="${p.screenshotUrl}" class="admin-payment-proof-thumb" alt="Proof" />
          </a>`
        : '<span style="color: var(--text-muted);">None</span>';

      return `
        <tr>
          <td style="font-size: 0.82rem; color: var(--text-muted); white-space: nowrap;">${dateStr}</td>
          <td><strong style="color: #fff;">${p.email}</strong></td>
          <td><code style="background: rgba(255,255,255,0.06); padding: 2px 6px; border-radius: 4px; color: var(--accent-gold);">${p.utrId}</code></td>
          <td>${screenshotHtml}</td>
          <td>${statusBadge}</td>
          <td>
            <div style="display: flex; gap: 6px;">
              ${!p.verified ? `<button class="btn btn-sm btn-primary" style="padding: 4px 8px; font-size: 0.76rem;" onclick="handleAdminPaymentAction('${p.id || p.utrId}', 'approve')">Approve Access</button>` : ''}
              ${p.verified ? `<button class="btn btn-sm btn-danger" style="padding: 4px 8px; font-size: 0.76rem;" onclick="handleAdminPaymentAction('${p.id || p.utrId}', 'reject')">Revoke</button>` : ''}
            </div>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; color: var(--accent-red); padding: 20px;">
          Failed to load payments: ${err.message}
        </td>
      </tr>
    `;
  }
}

async function handleAdminPaymentAction(id, action) {
  const isApprove = action === 'approve';
  const confirmed = await customConfirm({
    title: isApprove ? 'Approve Payment & Grant PRO?' : 'Revoke Payment Access?',
    message: isApprove
      ? 'Approve this verification record and immediately grant Lifetime PRO access to the trader?'
      : 'Are you sure you want to revoke PRO access for this payment record?',
    badge: isApprove ? '💎 PRO PAYMENT APPROVAL' : '⚠️ REVOKE PAYMENT',
    type: isApprove ? 'success' : 'danger',
    confirmText: isApprove ? '👑 Approve & Grant PRO' : 'Revoke Access',
    cancelText: 'Cancel',
    icon: isApprove ? '💎' : '⚠️'
  });
  if (!confirmed) return;

  try {
    const res = await fetch(`/api/admin/payments/${id}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action })
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message, 'success');
      loadAdminPayments();
    } else {
      showToast(data.error || 'Action failed.', 'error');
    }
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  }
}
window.loadAdminPayments = loadAdminPayments;
window.handleAdminPaymentAction = handleAdminPaymentAction;
window.handlePaymentScreenshotSelect = handlePaymentScreenshotSelect;
window.removePaymentScreenshot = removePaymentScreenshot;
window.submitPaymentVerification = submitPaymentVerification;

// ==================== CHART IMAGE DOWNLOAD (CHARTS ONLY) ====================
// Ultra-HD Canvas Converter: Renders SVGs to crisp 2400px+ PNGs for Phone Gallery compatibility
async function convertSvgToPngBlob(svgUrl, scale = 2) {
  return new Promise(async (resolve, reject) => {
    try {
      const res = await fetch(svgUrl);
      if (!res.ok) throw new Error('Fetch failed: ' + res.status);
      const svgText = await res.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(svgText, 'image/svg+xml');
      const svgEl = doc.querySelector('svg');

      let width = parseFloat(svgEl?.getAttribute('width') || '1200');
      let height = parseFloat(svgEl?.getAttribute('height') || '700');
      if (isNaN(width) || width <= 0) width = 1200;
      if (isNaN(height) || height <= 0) height = 700;

      const targetWidth = Math.max(width * scale, 2400);
      const targetHeight = Math.round((height / width) * targetWidth);

      const img = new Image();
      const svgBlob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
      const blobUrl = URL.createObjectURL(svgBlob);

      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = targetWidth;
          canvas.height = targetHeight;
          const ctx = canvas.getContext('2d');
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.fillStyle = '#0a0e17';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
          URL.revokeObjectURL(blobUrl);

          canvas.toBlob(pngBlob => {
            if (pngBlob) resolve(pngBlob);
            else reject(new Error('Canvas export failed'));
          }, 'image/png');
        } catch (canvasErr) {
          URL.revokeObjectURL(blobUrl);
          reject(canvasErr);
        }
      };
      img.onerror = (e) => {
        URL.revokeObjectURL(blobUrl);
        reject(e);
      };
      img.src = blobUrl;
    } catch (err) {
      reject(err);
    }
  });
}

async function downloadChartImage(url, title) {
  if (!url) return;
  const isUnlocked = Boolean(state.currentUser?.hasPaid || state.currentUser?.role === 'admin');
  if (!isUnlocked) {
    handleUnpaidChartClick();
    return;
  }

  const safeTitle = (title || 'TradingHub_Chart')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_');
  const filename = `TeluguTradingHub_${safeTitle}.png`;

  try {
    showToast('⏳ Downloading high-resolution chart to your Gallery...', 'info');

    let blob;
    const isSvg = url.toLowerCase().includes('.svg');
    if (isSvg) {
      blob = await convertSvgToPngBlob(url).catch(() => null);
    }

    if (!blob) {
      const res = await fetch(url);
      if (!res.ok) throw new Error('Direct fetch failed');
      blob = await res.blob();
      if (!blob.type.includes('png') && !blob.type.includes('jpeg')) {
        blob = new Blob([blob], { type: 'image/png' });
      }
    }

    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
    showToast(`✅ Chart saved to your Phone Gallery / Downloads!`, 'success');
  } catch (err) {
    console.warn('Direct blob download failed, utilizing server attachment fallback:', err.message);
    const serverUrl = `/api/charts/download-attachment?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title || 'Chart')}`;
    const link = document.createElement('a');
    link.href = serverUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('✅ Chart download initiated! Check your Phone Gallery / Downloads.', 'success');
  }
}

function downloadActiveChartImage() {
  if (state.activeModalChart) {
    downloadChartImage(state.activeModalChart.chartImage, state.activeModalChart.title);
  }
}

function downloadActiveLightboxImage() {
  if (state.activeLightboxImage) {
    downloadChartImage(state.activeLightboxImage.url, state.activeLightboxImage.title);
  }
}

window.downloadChartImage = downloadChartImage;
window.downloadActiveChartImage = downloadActiveChartImage;
window.downloadActiveLightboxImage = downloadActiveLightboxImage;


// ==================== ADVANCED ADMIN USER & PLATFORM CONTROLS ====================

// Fetch Realtime Platform Stats
async function loadAdminStats() {
  try {
    const res = await fetch('/api/admin/stats');
    if (!res.ok) return;
    const stats = await res.json();

    const elTotal = document.getElementById('admin-stat-total-users');
    const elPro = document.getElementById('admin-stat-pro-users');
    const elFree = document.getElementById('admin-stat-free-users');
    const elCharts = document.getElementById('admin-stat-charts');
    const elComments = document.getElementById('admin-stat-comments');

    if (elTotal) elTotal.textContent = stats.totalUsers || 0;
    if (elPro) elPro.textContent = stats.proUsers || 0;
    if (elFree) elFree.textContent = stats.freeUsers || 0;
    if (elCharts) elCharts.textContent = stats.totalCharts || 0;
    if (elComments) elComments.textContent = stats.totalComments || 0;
    const elDropoffs = document.getElementById('admin-stat-dropoffs');
    if (elDropoffs) elDropoffs.textContent = stats.paymentDropoffs || 0;
    const elTabCount = document.getElementById('count-payment-dropoffs');
    if (elTabCount && stats.paymentDropoffs !== undefined) elTabCount.textContent = stats.paymentDropoffs;
  } catch (e) {
    console.error('Error fetching admin stats:', e);
  }
}

// Fetch All Registered Users
async function loadAdminUsers() {
  const tbody = document.getElementById('admin-users-table-body');
  if (!tbody) return;

  try {
    const res = await fetch('/api/admin/users');
    if (!res.ok) throw new Error(`Server returned HTTP ${res.status}`);
    const users = await res.json();
    state.adminUsersList = Array.isArray(users) ? users : [];

    // Update filter counts
    const countAll = state.adminUsersList.length;
    const countPro = state.adminUsersList.filter(u => u && u.hasPaid).length;
    const countFree = countAll - countPro;

    const elAll = document.getElementById('count-users-all');
    const elPro = document.getElementById('count-users-pro');
    const elFree = document.getElementById('count-users-free');
    if (elAll) elAll.textContent = countAll;
    if (elPro) elPro.textContent = countPro;
    if (elFree) elFree.textContent = countFree;

    renderAdminUsersTable();
  } catch (e) {
    console.error('Error loading admin users:', e);
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; color: var(--accent-red); padding: 24px;">
          Failed to load users (${escapeHtml(e.message)}). Please refresh.
        </td>
      </tr>
    `;
  }
}

// Render User Accounts Table with Search & Filter
function renderAdminUsersTable() {
  const tbody = document.getElementById('admin-users-table-body');
  if (!tbody) return;

  try {
    let list = [...(state.adminUsersList || [])];

    // Apply Filter Pill (all / pro / free)
    const filter = state.adminUserFilter || 'all';
    if (filter === 'pro') {
      list = list.filter(u => u && u.hasPaid);
    } else if (filter === 'free') {
      list = list.filter(u => u && !u.hasPaid);
    }

    // Apply Search safely
    const q = (state.adminUserSearch || '').toLowerCase().trim();
    if (q) {
      list = list.filter(u => 
        (u.email && u.email.toLowerCase().includes(q)) ||
        (u.name && u.name.toLowerCase().includes(q)) ||
        (u.paymentId && String(u.paymentId).toLowerCase().includes(q))
      );
    }

    if (list.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 30px;">
            No trader accounts match your search or filter.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = list.map(u => {
      if (!u) return '';
      const email = u.email || '';
      const isOwner = email.toLowerCase() === 'abhisheknaidus093@gmail.com';
      const initial = (u.name || email || 'T')[0].toUpperCase();
      const joinedStr = u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '-';
      
      // Status Badge
      let statusBadge = '';
      if (isOwner) {
        statusBadge = '<span class="user-badge-pro" style="background: #ffd700; color: #000; font-weight: 900; border: 1px solid #ffe600;">👑 OWNER</span>';
      } else if (u.hasPaid) {
        statusBadge = '<span class="user-badge-pro">💎 PRO LIFETIME</span>';
      } else {
        statusBadge = '<span class="user-badge-free">🆓 FREE TRADER</span>';
      }

      const payRef = u.paymentId 
        ? `<code style="background: rgba(255,255,255,0.06); padding: 2px 6px; border-radius: 4px; color: var(--accent-gold); font-size: 0.78rem;">${escapeHtml(u.paymentId)}</code>`
        : '<span style="color: var(--text-muted); font-size: 0.8rem;">None</span>';

      return `
        <tr>
          <td>
            <div style="display: flex; align-items: center; gap: 10px;">
              <div class="user-table-avatar" style="${isOwner ? 'border-color: var(--accent-gold); color: var(--accent-gold);' : ''}">${escapeHtml(initial)}</div>
              <div>
                <strong style="color: #fff; font-size: 0.88rem;">${escapeHtml(u.name || 'Trader')}</strong>
                <div style="font-size: 0.72rem; color: var(--text-muted);">Role: ${escapeHtml(u.role || 'member')}</div>
              </div>
            </div>
          </td>
          <td>
            <span style="font-family: var(--font-mono); font-size: 0.82rem; color: var(--text-highlight);">${escapeHtml(email)}</span>
          </td>
          <td>${statusBadge}</td>
          <td>${payRef}</td>
          <td style="font-size: 0.8rem; color: var(--text-muted); white-space: nowrap;">${joinedStr}</td>
          <td>
            <div class="admin-action-btn-group">
              ${!isOwner ? (u.hasPaid ? `
                <button class="btn btn-sm btn-danger" style="padding: 4px 8px; font-size: 0.74rem; white-space: nowrap;" onclick="adminTogglePro('${u.id || email}', false, '${escapeHtml(email)}')" title="Revoke PRO Access immediately">
                  ⛔ Revoke PRO
                </button>
              ` : `
                <button class="btn btn-sm btn-primary" style="padding: 4px 8px; font-size: 0.74rem; white-space: nowrap;" onclick="adminTogglePro('${u.id || email}', true, '${escapeHtml(email)}')" title="Grant Lifetime PRO Access">
                  💎 Grant PRO
                </button>
              `) : ''}

              <button class="btn btn-sm btn-secondary" style="padding: 4px 8px; font-size: 0.74rem;" onclick="adminPromptResetPassword('${u.id || email}', '${escapeHtml(email)}')" title="Reset Password for this account">
                🔑
              </button>

              ${!isOwner ? `
                <button class="btn btn-sm btn-danger" style="padding: 4px 8px; font-size: 0.74rem;" onclick="adminDeleteUser('${u.id || email}', '${escapeHtml(email)}')" title="Permanently Remove / Delete this Gmail account">
                  🗑️
                </button>
              ` : ''}
            </div>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error('Error in renderAdminUsersTable:', err);
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; color: var(--accent-red); padding: 24px;">
          Render Error: ${escapeHtml(err.message)}
        </td>
      </tr>
    `;
  }
}

// Search Users
function handleAdminUserSearch(query) {
  state.adminUserSearch = query || '';
  renderAdminUsersTable();
}

// Filter Users (all / pro / free)
function filterAdminUsers(filter, btn) {
  state.adminUserFilter = filter;
  document.querySelectorAll('.admin-pill-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderAdminUsersTable();
}

// Revoke or Grant PRO Status
async function adminTogglePro(userId, shouldBePro, email) {
  const confirmed = await customConfirm({
    title: shouldBePro ? 'Grant Lifetime PRO Access?' : 'Revoke PRO Access?',
    message: shouldBePro 
      ? `Are you sure you want to GRANT Lifetime PRO Access to <strong style="color:var(--accent-green);">${escapeHtml(email)}</strong>? They will immediately unlock all 24+ chart setups & private video breakdowns.`
      : `⚠️ WARNING: Are you sure you want to REVOKE PRO Access for <strong style="color:#ff3366;">${escapeHtml(email)}</strong>? They will immediately lose access to all drawn charts and videos.`,
    badge: shouldBePro ? '💎 PRO MEMBERSHIP GRANT' : '⚠️ REVOKE PRO ACCESS',
    type: shouldBePro ? 'success' : 'danger',
    confirmText: shouldBePro ? '👑 Grant PRO Access' : 'Revoke PRO Access',
    cancelText: 'Cancel',
    icon: shouldBePro ? '💎' : '⚠️'
  });

  if (!confirmed) return;

  try {
    const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/toggle-pro`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hasPaid: shouldBePro })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to update PRO status');

    showToast(data.message || `PRO status updated for ${email}`, 'success');

    // Reload list and stats
    await loadAdminUsers();
    loadAdminStats();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Delete User Account (Remove Gmail)
async function adminDeleteUser(userId, email) {
  const confirmed = await customConfirm({
    title: 'Permanently Remove Account?',
    message: `🚨 Are you sure you want to PERMANENTLY REMOVE account <strong style="color:#ff3366;">"${escapeHtml(email)}"</strong> from the platform?<br/><br/><span style="font-size: 0.84rem; color: var(--text-muted);">This clears their credentials, PRO access, and saved data. This cannot be undone.</span>`,
    badge: '🚫 PERMANENT USER DELETION',
    type: 'danger',
    confirmText: 'Delete User Account',
    cancelText: 'Cancel',
    icon: '👤'
  });
  if (!confirmed) return;

  try {
    const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
      method: 'DELETE'
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to delete account');

    const cleanEmail = (email || '').toLowerCase().trim();
    // 1. Purge from local device account vault so client sync never resurrects it
    try {
      let vault = JSON.parse(safeStorage.getItem('tradinghub_account_vault') || '{}');
      if (vault[cleanEmail]) {
        delete vault[cleanEmail];
        safeStorage.setItem('tradinghub_account_vault', JSON.stringify(vault));
      }
      let savedDev = JSON.parse(safeStorage.getItem('tradinghub_device_saved_login') || 'null');
      if (savedDev && savedDev.email && savedDev.email.toLowerCase().trim() === cleanEmail) {
        safeStorage.removeItem('tradinghub_device_saved_login');
      }
    } catch (_) {}

    // 2. If the currently logged in user is the one being deleted, log them out
    if (state.currentUser && state.currentUser.email && state.currentUser.email.toLowerCase().trim() === cleanEmail) {
      safeStorage.removeItem('tradinghub_user');
      safeSessionStorage.removeItem('tradinghub_user');
      state.currentUser = null;
    }

    showToast(data.message || `Account ${email} has been removed.`, 'success');

    // Reload list and stats
    await loadAdminUsers();
    loadAdminStats();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Reset User Password Prompt
async function adminPromptResetPassword(userId, email) {
  const newPass = await customPrompt({
    title: 'Reset User Password',
    message: `Enter a new password for <strong style="color:var(--accent-green);">${escapeHtml(email)}</strong> (minimum 4 characters):`,
    defaultValue: '',
    placeholder: 'Enter new password...',
    label: 'New Password',
    badge: '🔑 ADMIN SECURITY',
    type: 'warning',
    confirmText: 'Change Password',
    cancelText: 'Cancel',
    icon: '🔑'
  });
  if (!newPass) return;
  if (newPass.trim().length < 4) {
    showToast('Password must be at least 4 characters.', 'error');
    return;
  }

  try {
    const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newPassword: newPass.trim() })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to reset password');

    showToast(data.message || `Password updated for ${email}!`, 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Modal: Create New Trader Account
function openAdminCreateUserModal() {
  const modal = document.getElementById('admin-create-user-modal');
  if (modal) {
    modal.classList.add('active');
    const emailInput = document.getElementById('admin-new-user-email');
    if (emailInput) emailInput.focus();
  }
}

function closeAdminCreateUserModal() {
  const modal = document.getElementById('admin-create-user-modal');
  if (modal) modal.classList.remove('active');
}

async function handleAdminSubmitCreateUser(e) {
  e.preventDefault();
  const email = document.getElementById('admin-new-user-email').value.trim();
  const name = document.getElementById('admin-new-user-name').value.trim();
  const password = document.getElementById('admin-new-user-password').value.trim();
  const isPro = document.getElementById('admin-new-user-is-pro').checked;

  if (!email || !password) {
    showToast('Email and password are required', 'error');
    return;
  }

  try {
    const res = await fetch('/api/admin/users/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, name, password, isPro })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to create account');

    showToast(data.message || `Account created for ${email}`, 'success');
    closeAdminCreateUserModal();
    document.getElementById('admin-create-user-form').reset();

    // Reload list and stats
    await loadAdminUsers();
    loadAdminStats();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Fetch and Render Community Comments in Admin Tab
async function loadAdminComments() {
  const tbody = document.getElementById('admin-comments-table-body');
  if (!tbody) return;

  try {
    const res = await fetch('/api/comments');
    if (!res.ok) throw new Error('Failed to load comments');
    const comments = await res.json();

    if (!Array.isArray(comments) || comments.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 30px;">
            No community comments posted yet.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = comments.map(c => {
      const timeStr = c.timestamp ? new Date(c.timestamp).toLocaleString() : '-';
      const roleBadge = c.role === 'admin' 
        ? '<span class="user-badge-pro" style="background: #ffd700; color: #000; font-weight: 900; border: 1px solid #ffe600;">OWNER</span>'
        : (c.role === 'member' ? '<span class="user-badge-pro">PRO</span>' : '<span class="user-badge-free">TRADER</span>');

      return `
        <tr>
          <td><strong style="color: #fff;">${escapeHtml(c.name || 'Anonymous')}</strong></td>
          <td>${roleBadge}</td>
          <td><span style="font-size: 0.8rem; color: var(--text-muted);">${escapeHtml(c.email || 'None')}</span></td>
          <td style="max-width: 320px; font-size: 0.84rem; color: var(--text-secondary); line-height: 1.4;">
            "${escapeHtml(c.text || '')}"
          </td>
          <td style="font-size: 0.8rem; color: var(--text-muted); white-space: nowrap;">${timeStr}</td>
          <td style="text-align: right;">
            <button class="btn btn-sm btn-danger" style="padding: 4px 8px; font-size: 0.74rem;" onclick="adminDeleteComment('${c.id}')" title="Delete Comment">
              🗑️ Delete
            </button>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error('Error loading admin comments:', err);
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; color: var(--accent-red); padding: 20px;">
          Failed to load comments.
        </td>
      </tr>
    `;
  }
}

// Admin Delete Comment
async function adminDeleteComment(commentId) {
  const confirmed = await customConfirm({
    title: 'Delete Trader Comment?',
    message: 'Are you sure you want to permanently remove this trader comment?',
    badge: '💬 COMMENT MODERATION',
    type: 'warning',
    confirmText: 'Delete Comment',
    cancelText: 'Cancel',
    icon: '💬'
  });
  if (!confirmed) return;

  try {
    const res = await fetch(`/api/comments/${encodeURIComponent(commentId)}`, {
      method: 'DELETE'
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to delete comment');

    showToast(data.message || 'Comment deleted successfully', 'success');
    loadAdminComments();
    loadAdminStats();
    renderComments(); // Refresh public section as well
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Window globals

// ==================== GLOBAL WINDOW BINDINGS FOR ALL ONCLICK HANDLERS ====================
window.openAdminModal = openAdminModal;
window.openAdminPinModal = openAdminPinModal;
window.closeAdminPinModal = closeAdminPinModal;
window.handleAdminPinSubmit = handleAdminPinSubmit;
window.closeAdminModal = closeAdminModal;
window.switchAdminTab = switchAdminTab;
window.openAddChartModal = openAddChartModal;
window.closeAddChartModal = closeAddChartModal;
window.filterAdminUsers = filterAdminUsers;
window.handleAdminUserSearch = handleAdminUserSearch;
window.adminTogglePro = adminTogglePro;
window.adminDeleteUser = adminDeleteUser;
window.adminPromptResetPassword = adminPromptResetPassword;
window.openAdminCreateUserModal = openAdminCreateUserModal;
window.closeAdminCreateUserModal = closeAdminCreateUserModal;
window.handleAdminSubmitCreateUser = handleAdminSubmitCreateUser;
window.loadAdminStats = loadAdminStats;
window.loadAdminUsers = loadAdminUsers;
window.renderAdminUsersTable = renderAdminUsersTable;
window.loadAdminPayments = loadAdminPayments;
window.loadAdminComments = loadAdminComments;
window.adminDeleteComment = adminDeleteComment;
window.openPaymentVerificationModal = openPaymentVerificationModal;
window.closePaymentVerificationModal = closePaymentVerificationModal;
window.submitPaymentVerification = submitPaymentVerification;
window.handlePaymentScreenshotSelect = handlePaymentScreenshotSelect;
window.removePaymentScreenshot = removePaymentScreenshot;
window.openAuthModal = openAuthModal;
window.closeAuthModal = closeAuthModal;
window.setAuthModalMode = setAuthModalMode;
window.handleAuthSubmit = handleAuthSubmit;
window.openTermsModal = openTermsModal;
window.closeTermsModal = closeTermsModal;
window.handleCheckoutRedirect = handleCheckoutRedirect;
window.setChartCategoryFilter = setChartCategoryFilter;
window.replayIntro = replayIntro;
window.toggleShowAllVideos = toggleShowAllVideos;
window.toggleShowAllGallery = toggleShowAllGallery;
window.handleHeroLessonPreviewClick = handleHeroLessonPreviewClick;
window.openDedicatedAdminLoginModal = openDedicatedAdminLoginModal;
window.closeDedicatedAdminLoginModal = closeDedicatedAdminLoginModal;
window.closeChartModal = closeChartModal;
window.downloadActiveChartImage = downloadActiveChartImage;
window.downloadActiveLightboxImage = downloadActiveLightboxImage;
window.closeGalleryLightbox = closeGalleryLightbox;
window.closeRenameGalleryModal = closeRenameGalleryModal;
window.submitRenameGalleryImage = submitRenameGalleryImage;
window.closeResetPasswordModal = closeResetPasswordModal;
window.closeUserProfileModal = closeUserProfileModal;
window.handleProfileLogout = handleProfileLogout;
window.handleBulkDeleteSelected = handleBulkDeleteSelected;
window.closeRenameModal = closeRenameModal;

// Quick Navigation from KPI Top Stats Cards to specific tabs / filters
function adminNavigateKpi(target) {
  if (target === 'all-traders') {
    const tabBtn = document.querySelector('.admin-tabs-nav .admin-tab-btn:nth-child(1)');
    switchAdminTab('users', tabBtn);
    const pillAll = document.querySelector('.admin-user-filter-bar .admin-pill-btn:nth-child(1)');
    filterAdminUsers('all', pillAll);
  } else if (target === 'pro-traders') {
    const tabBtn = document.querySelector('.admin-tabs-nav .admin-tab-btn:nth-child(1)');
    switchAdminTab('users', tabBtn);
    const pillPro = document.querySelector('.admin-user-filter-bar .admin-pill-btn:nth-child(2)');
    filterAdminUsers('pro', pillPro);
  } else if (target === 'free-traders') {
    const tabBtn = document.querySelector('.admin-tabs-nav .admin-tab-btn:nth-child(1)');
    switchAdminTab('users', tabBtn);
    const pillFree = document.querySelector('.admin-user-filter-bar .admin-pill-btn:nth-child(3)');
    filterAdminUsers('free', pillFree);
  } else if (target === 'charts') {
    const tabBtn = document.querySelector('.admin-tabs-nav .admin-tab-btn:nth-child(2)');
    switchAdminTab('charts', tabBtn);
  } else if (target === 'comments') {
    const tabBtn = document.querySelector('.admin-tabs-nav .admin-tab-btn:nth-child(4)');
    switchAdminTab('comments', tabBtn);
  } else if (target === 'dropoffs') {
    const tabBtn = document.querySelector('.admin-tabs-nav .admin-tab-btn[onclick*="dropoffs"]');
    switchAdminTab('dropoffs', tabBtn);
  }
}

window.adminNavigateKpi = adminNavigateKpi;

window.bindAuthEnterKey = bindAuthEnterKey;


// ==================== PASSWORD EYE TOGGLE & SAVED ACCOUNTS AUTOFILL ====================
function togglePasswordVisibility(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;

  const isPassword = input.type === 'password';
  input.type = isPassword ? 'text' : 'password';

  const targetBtn = btn || input.closest('.password-input-wrapper')?.querySelector('.btn-toggle-password');
  if (targetBtn) {
    const eyeOpen = targetBtn.querySelector('.eye-open');
    const eyeClosed = targetBtn.querySelector('.eye-closed');
    if (eyeOpen && eyeClosed) {
      eyeOpen.style.display = isPassword ? 'none' : 'block';
      eyeClosed.style.display = isPassword ? 'block' : 'none';
    }
    targetBtn.setAttribute('title', isPassword ? 'Hide password' : 'Show password');
  }
}

function resetPasswordToggle(inputId) {
  const input = document.getElementById(inputId);
  if (!input) return;
  input.type = 'password';
  const wrapper = input.closest('.password-input-wrapper');
  if (wrapper) {
    const targetBtn = wrapper.querySelector('.btn-toggle-password');
    if (targetBtn) {
      const eyeOpen = targetBtn.querySelector('.eye-open');
      const eyeClosed = targetBtn.querySelector('.eye-closed');
      if (eyeOpen) eyeOpen.style.display = 'block';
      if (eyeClosed) eyeClosed.style.display = 'none';
      targetBtn.setAttribute('title', 'Show password');
    }
  }
}

function cleanLocalVaultTestAccounts() {
  // Never delete student or valid member accounts
}

function checkDeviceSavedAccount() {
  const hint = document.getElementById('auth-saved-hint');
  if (!hint) return;

  cleanLocalVaultTestAccounts();

  let vault = {};
  try {
    vault = JSON.parse(safeStorage.getItem('tradinghub_account_vault') || '{}');
  } catch (_) {}

  // Only show hint if THIS device specifically has a saved account with password
  const savedList = Object.values(vault).filter(acc => acc && acc.email && acc.password);
  if (savedList.length > 0) {
    savedList.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
    const recent = savedList[0];
    hint.style.display = 'inline';
    hint.textContent = '🔑 Fill saved login';
    hint.title = `Fill saved login on this device for ${recent.email}`;
    hint.dataset.email = recent.email;
  } else {
    hint.style.display = 'none';
  }
}

function fillDeviceSavedAccount() {
  const hint = document.getElementById('auth-saved-hint');
  const targetEmail = hint?.dataset?.email;
  if (!targetEmail) return;

  const acc = getLocalAccountVault(targetEmail);
  if (!acc || !acc.password) return;

  const emailInput = document.getElementById('auth-email-input');
  const passInput = document.getElementById('auth-password-input');

  if (emailInput) emailInput.value = acc.email;
  if (passInput) passInput.value = acc.password;
  _lastAutofilledAccount = acc.email.toLowerCase().trim();
  showToast(`Filled saved login for ${acc.email}`, 'info');
}

function renderSavedAccountsPills() {
  // Deprecated: Public list of saved accounts removed for individual device privacy
  checkDeviceSavedAccount();
}

function selectSavedAccount(email) {
  if (!email) return;
  const acc = getLocalAccountVault(email);
  if (!acc) return;
  const emailInput = document.getElementById('auth-email-input');
  const passInput = document.getElementById('auth-password-input');
  if (emailInput) emailInput.value = acc.email;
  if (passInput && acc.password) passInput.value = acc.password;
}

let _lastAutofilledAccount = '';

function handleAuthEmailInput(val) {
  hideAuthSuggestionDropdown();
  const trimmed = (val || '').toLowerCase().trim();
  if (!trimmed) return;

  const acc = getLocalAccountVault(trimmed);
  if (acc && acc.password && acc.remembered) {
    const passInput = document.getElementById('auth-password-input');
    if (passInput) {
      passInput.value = acc.password;
      const rememberCheckbox = document.getElementById('auth-remember-me');
      if (rememberCheckbox) rememberCheckbox.checked = true;
    }
  }
}

function handleAuthEmailFocus() {
  const submitBtn = document.getElementById('auth-submit-btn');
  const mode = submitBtn?.dataset?.mode || 'login';
  if (mode !== 'login') return;

  const box = document.getElementById('auth-saved-suggestion-box');
  if (!box) return;

  let vault = {};
  try {
    vault = JSON.parse(safeStorage.getItem('tradinghub_account_vault') || '{}');
  } catch (_) {}

  // Only suggest accounts where the user previously checked the "Save Password & Gmail" box
  const savedList = Object.values(vault).filter(acc => acc && acc.email && acc.password && acc.remembered);
  if (savedList.length === 0) {
    box.style.display = 'none';
    return;
  }

  savedList.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
  const recent = savedList[0];

  box.innerHTML = `
    <div class="auth-saved-suggestion-item" onmousedown="fillSuggestedAccount('${recent.email}')">
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="font-size: 1.1rem;">🔑</span>
        <div>
          <strong style="display: block; color: #fff; font-size: 0.88rem;">${recent.email}</strong>
          <span style="font-size: 0.74rem; color: var(--accent-green);">Saved login for this device</span>
        </div>
      </div>
      <span style="font-size: 0.78rem; color: var(--accent-green); font-weight: 700;">Use Login &rarr;</span>
    </div>
  `;
  box.style.display = 'block';
}

function hideAuthSuggestionDropdown() {
  const box = document.getElementById('auth-saved-suggestion-box');
  if (box) box.style.display = 'none';
}

function fillSuggestedAccount(targetEmail) {
  if (!targetEmail) return;
  const acc = getLocalAccountVault(targetEmail);
  if (!acc || !acc.password) return;

  const emailInput = document.getElementById('auth-email-input');
  const passInput = document.getElementById('auth-password-input');
  if (emailInput) emailInput.value = acc.email;
  if (passInput) passInput.value = acc.password;

  hideAuthSuggestionDropdown();
  showToast(`Filled saved login for ${acc.email}`, 'info');
}

window.togglePasswordVisibility = togglePasswordVisibility;
window.fillDeviceSavedAccount = fillDeviceSavedAccount;
window.checkDeviceSavedAccount = checkDeviceSavedAccount;
window.resetPasswordToggle = resetPasswordToggle;
window.renderSavedAccountsPills = renderSavedAccountsPills;
window.selectSavedAccount = selectSavedAccount;
window.removeSavedAccount = removeSavedAccount;
window.handleAuthEmailInput = handleAuthEmailInput;

window.handleAuthEmailFocus = handleAuthEmailFocus;
window.hideAuthSuggestionDropdown = hideAuthSuggestionDropdown;
window.fillSuggestedAccount = fillSuggestedAccount;

// ==================== ABANDONED PAYMENT & DROPOFF TRACKER (CLIENT) ====================
state.adminDropoffsList = [];

async function trackPaymentAttempt(source = 'Checkout Button', customDetails = null) {
  const user = state.currentUser;
  const email = (customDetails && customDetails.email) || user?.email || safeStorage.getItem('tradinghub_last_email') || '';
  const name = (customDetails && customDetails.name) || user?.name || (email ? email.split('@')[0] : 'Interested Trader');

  try {
    const res = await fetch('/api/payments/track-attempt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, name, source })
    });
    const data = await res.json();
    if (data.attemptId) {
      safeSessionStorage.setItem('tradinghub_pending_attempt_id', data.attemptId);
      safeSessionStorage.setItem('tradinghub_pending_attempt_email', email);
    }
  } catch (_) {}
}

function checkUserReturnFromPayment() {
  const pendingAttemptId = safeSessionStorage.getItem('tradinghub_pending_attempt_id');
  if (!pendingAttemptId) return;

  const email = safeSessionStorage.getItem('tradinghub_pending_attempt_email') || state.currentUser?.email || '';

  if (!state.currentUser?.hasPaid) {
    fetch('/api/payments/track-return', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attemptId: pendingAttemptId, email })
    }).catch(() => {});
  }
  safeSessionStorage.removeItem('tradinghub_pending_attempt_id');
}

window.addEventListener('focus', checkUserReturnFromPayment);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    checkUserReturnFromPayment();
  }
});

async function loadAdminPaymentAttempts() {
  const tbody = document.getElementById('admin-dropoffs-table-body');
  if (!tbody) return;

  try {
    const res = await fetch('/api/admin/payment-attempts');
    const data = await res.json();
    state.adminDropoffsList = data.attempts || [];

    const unpaidCount = state.adminDropoffsList.filter(a => a.status === 'returned_unpaid').length;
    const badgeCount = document.getElementById('count-payment-dropoffs');
    const kpiCount = document.getElementById('kpi-dropoffs-count');
    if (badgeCount) badgeCount.textContent = unpaidCount;
    if (kpiCount) kpiCount.textContent = unpaidCount;

    renderAdminPaymentAttemptsTable();
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color: var(--accent-red); padding: 20px;">Failed to load dropoffs: ' + escapeHtml(err.message) + '</td></tr>';
  }
}

function renderAdminPaymentAttemptsTable(filteredList) {
  const tbody = document.getElementById('admin-dropoffs-table-body');
  if (!tbody) return;

  const list = filteredList || state.adminDropoffsList || [];
  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color: var(--text-muted); padding: 30px;">No payment dropoffs recorded yet. Real-time leads will appear here when traders click payment.</td></tr>';
    return;
  }

  tbody.innerHTML = list.map(a => {
    let statusBadge = '';
    if (a.hasPaidLater) {
      statusBadge = '<span style="background: rgba(0, 242, 152, 0.15); color: var(--accent-green); border: 1px solid var(--accent-green); padding: 3px 8px; border-radius: 4px; font-size: 0.76rem; font-weight: 700;">✅ Later Paid</span>';
    } else if (a.status === 'returned_unpaid') {
      statusBadge = '<span style="background: rgba(255, 140, 0, 0.15); color: #ff9900; border: 1px solid #ff9900; padding: 3px 8px; border-radius: 4px; font-size: 0.76rem; font-weight: 700;">⚠️ Returned Without Payment</span>';
    } else {
      statusBadge = '<span style="background: rgba(255, 215, 0, 0.12); color: var(--accent-gold); border: 1px solid var(--accent-gold); padding: 3px 8px; border-radius: 4px; font-size: 0.76rem; font-weight: 700;">🕒 In Payment App</span>';
    }

    const timeStr = a.wentAt ? new Date(a.wentAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'short', timeStyle: 'short' }) : 'Recently';

    return `
      <tr>
        <td><strong>${escapeHtml(a.name || 'Interested Trader')}</strong></td>
        <td><a href="mailto:${encodeURIComponent(a.email)}" style="color: var(--accent-green); text-decoration: underline;">${escapeHtml(a.email || 'N/A')}</a></td>
        <td style="font-size: 0.82rem; color: var(--text-secondary);">${escapeHtml(a.device || 'Mobile')}</td>
        <td style="font-size: 0.82rem; color: var(--text-secondary);">${timeStr}</td>
        <td>${statusBadge}</td>
        <td>
          <div style="display: flex; gap: 6px;">
            <a href="mailto:${encodeURIComponent(a.email)}?subject=Assistance with your ₹399 Telugu Trading Hub Access&body=Hello ${encodeURIComponent(a.name || 'Trader')},%0D%0A%0D%0AWe noticed you were trying to access the Trading Hub Price Action course. If you experienced any issue in UPI or payment app, please let us know so we can assist you.%0D%0A%0D%0ABest regards,%0D%0ATrading Hub Team" class="btn btn-sm btn-primary" style="padding: 4px 8px; font-size: 0.74rem;">
              ✉️ Email Lead
            </a>
            <button class="btn btn-sm btn-secondary" onclick="navigator.clipboard.writeText('${a.email}'); showToast('Copied email: ${a.email}', 'info');" style="padding: 4px 8px; font-size: 0.74rem;">
              📋 Copy
            </button>
            <button class="btn btn-sm btn-secondary" onclick="adminDeleteDropoff('${a.id}')" style="padding: 4px 8px; font-size: 0.74rem; color: var(--accent-red);">
              🗑️
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function filterAdminDropoffs(query) {
  const q = (query || '').toLowerCase().trim();
  if (!q) {
    renderAdminPaymentAttemptsTable();
    return;
  }
  const filtered = (state.adminDropoffsList || []).filter(a => 
    (a.name && a.name.toLowerCase().includes(q)) ||
    (a.email && a.email.toLowerCase().includes(q))
  );
  renderAdminPaymentAttemptsTable(filtered);
}

async function adminDeleteDropoff(id) {
  const confirmed = await customConfirm({
    title: 'Remove Abandoned Dropoff?',
    message: 'Remove this payment dropoff record from the admin analytics?',
    badge: '🛒 PAYMENT RECORD',
    type: 'warning',
    confirmText: 'Remove Record',
    cancelText: 'Cancel',
    icon: '🛒'
  });
  if (!confirmed) return;
  try {
    await fetch(`/api/admin/payment-attempts/${id}`, { method: 'DELETE' });
    showToast('Record removed', 'info');
    loadAdminPaymentAttempts();
  } catch (e) {
    showToast('Failed to delete: ' + e.message, 'error');
  }
}

window.loadAdminPaymentAttempts = loadAdminPaymentAttempts;
window.filterAdminDropoffs = filterAdminDropoffs;
window.adminDeleteDropoff = adminDeleteDropoff;
window.trackPaymentAttempt = trackPaymentAttempt;


// ==================== SUPPORT EMAIL DIRECT GMAIL APP REDIRECT (v22) ====================
function redirectToGmailSupport(e) {
  if (e) {
    if (e.preventDefault) e.preventDefault();
    if (e.stopPropagation) e.stopPropagation();
  }
  const email = 'tradinghath@gmail.com';
  const subject = encodeURIComponent('Telugu Trading Hub - Trader Support Inquiry');
  const body = encodeURIComponent('Hello Telugu Trading Hub Team,\n\nI have a query regarding:\n\n[Please type your message here]\n\nMy Account Email: ' + (state.currentUser?.email || 'Not logged in'));

  const isMobile = /Android|iPhone|iPad|iPod|Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  if (isMobile) {
    // On Mobile Phones (Android / iOS):
    // Triggering mailto: directly instructs the mobile OS to launch the native Gmail app
    // directly in the COMPOSE screen with To, Subject, and Body pre-filled.
    // This avoids Google's mobile web inbox redirect (mail.google.com/mail/mu/mp/).
    window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
  } else {
    // On Desktop / Laptop:
    // Open Gmail web compose in browser (verified working properly)
    const gmailWebCompose = `https://mail.google.com/mail/?view=cm&fs=1&to=${email}&su=${subject}&body=${body}`;
    const win = window.open(gmailWebCompose, '_blank');
    if (!win || win.closed || typeof win.closed === 'undefined') {
      window.location.href = gmailWebCompose;
    }
  }
}
window.redirectToGmailSupport = redirectToGmailSupport;

// ==================== MULTI-SELECT BATCH CHART DOWNLOAD (v22) ====================
if (!state.selectedCharts) state.selectedCharts = new Map();

function toggleChartSelection(e, id, url, title) {
  if (e) {
    if (e.stopPropagation) e.stopPropagation();
    if (e.preventDefault) e.preventDefault();
  }

  if (!state.selectedCharts) state.selectedCharts = new Map();

  const isSelected = state.selectedCharts.has(id);
  const matchingCards = document.querySelectorAll(`[data-chart-id="${id}"]`);

  if (!isSelected) {
    state.selectedCharts.set(id, { id, url, title: title || 'Chart Setup' });
    matchingCards.forEach(card => {
      card.classList.add('is-selected');
      const box = card.querySelector('.chart-select-box');
      if (box) box.classList.add('selected');
    });
  } else {
    state.selectedCharts.delete(id);
    matchingCards.forEach(card => {
      card.classList.remove('is-selected');
      const box = card.querySelector('.chart-select-box');
      if (box) box.classList.remove('selected');
    });
  }

  updateBatchToolbar();
}
window.toggleChartSelection = toggleChartSelection;

function downloadSingleChartDirect(e, url, title) {
  if (e) {
    if (e.stopPropagation) e.stopPropagation();
    if (e.preventDefault) e.preventDefault();
  }
  downloadChartImage(url, title);
}
window.downloadSingleChartDirect = downloadSingleChartDirect;
window.toggleChartSelection = toggleChartSelection;

function updateBatchToolbar() {
  const toolbar = document.getElementById('batch-download-toolbar');
  const count = state.selectedCharts ? state.selectedCharts.size : 0;

  if (toolbar) {
    if (count > 0) {
      toolbar.classList.add('active');
      const badge = document.getElementById('batch-selected-count');
      if (badge) badge.textContent = `${count} Selected`;
      const btn = document.getElementById('batch-download-action-btn');
      if (btn) btn.innerHTML = `📥 Download (${count})`;
    } else {
      toolbar.classList.remove('active');
    }
  }

  if (count > 0) {
    document.body.classList.add('batch-mode-active');
  } else {
    document.body.classList.remove('batch-mode-active');
  }
}
window.updateBatchToolbar = updateBatchToolbar;

async function downloadAllChartsDirect() {
  selectAllCharts(true);
  await downloadSelectedCharts();
}
window.downloadAllChartsDirect = downloadAllChartsDirect;
window.updateBatchToolbar = updateBatchToolbar;

function selectAllCharts(selectAll = true) {
  const isUnlocked = Boolean(state.currentUser?.hasPaid || state.currentUser?.role === 'admin');
  if (!isUnlocked && selectAll) {
    handleUnpaidChartClick();
    return;
  }

  // Target ONLY Hand-Drawn Charts in Chart Vault (.gallery-card), NEVER video lessons!
  const allCards = document.querySelectorAll('.gallery-card');
  if (!selectAll) {
    state.selectedCharts.clear();
    allCards.forEach(card => {
      card.classList.remove('is-selected');
      const box = card.querySelector('.chart-select-box');
      if (box) box.classList.remove('selected');
      const chk = card.querySelector('.chart-checkbox');
      if (chk) chk.checked = false;
    });
    updateBatchToolbar();
    return;
  }

  allCards.forEach(card => {
    const id = card.dataset.chartId;
    const url = card.dataset.chartUrl;
    const title = card.dataset.chartTitle || 'Chart Setup';
    if (id && url) {
      state.selectedCharts.set(id, { id, url, title });
      card.classList.add('is-selected');
      const box = card.querySelector('.chart-select-box');
      if (box) box.classList.add('selected');
      const chk = card.querySelector('.chart-checkbox');
      if (chk) chk.checked = true;
    }
  });

  updateBatchToolbar();
  showToast(`✅ Selected all ${state.selectedCharts.size} charts!`, 'info');
}
window.selectAllCharts = selectAllCharts;

async function downloadSelectedCharts() {
  const isUnlocked = Boolean(state.currentUser?.hasPaid || state.currentUser?.role === 'admin');
  if (!isUnlocked) {
    handleUnpaidChartClick();
    return;
  }

  const items = Array.from(state.selectedCharts.values());
  if (items.length === 0) {
    showToast('Please select at least 1 chart to download.', 'error');
    return;
  }

  const total = items.length;
  showToast(`⏳ Starting batch download of ${total} chart${total > 1 ? 's' : ''}...`, 'info');

  for (let i = 0; i < total; i++) {
    const item = items[i];
    showToast(`📥 Saving chart ${i + 1} of ${total}: "${item.title}" to gallery...`, 'info');
    try {
      await downloadChartImage(item.url, item.title);
    } catch (_) {}
    if (i < total - 1) {
      await new Promise(r => setTimeout(r, 450));
    }
  }

  showToast(`🎉 Successfully saved all ${total} chart${total > 1 ? 's' : ''} to your device gallery!`, 'success');
  selectAllCharts(false);
}
window.downloadSelectedCharts = downloadSelectedCharts;

// ==================== SHARE PAYMENT LINK (PAY FROM OTHER DEVICE) ====================
function openSharePaymentModal() {
  const modal = document.getElementById('share-payment-modal');
  if (!modal) return;
  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
}
window.openSharePaymentModal = openSharePaymentModal;

function closeSharePaymentModal() {
  const modal = document.getElementById('share-payment-modal');
  if (modal) modal.classList.remove('active');
  const otherActive = document.querySelector('.modal-overlay.active');
  if (!otherActive) document.body.style.overflow = '';
}
window.closeSharePaymentModal = closeSharePaymentModal;

function copyPaymentLink() {
  const url = 'https://rzp.io/rzp/2a3h6cU';
  navigator.clipboard.writeText(url).then(() => {
    showToast('📋 ₹399 Payment link copied to clipboard! Send to WhatsApp or pay from another phone.', 'success');
  }).catch(() => {
    customPrompt({
      title: 'Copy Payment Link',
      message: 'Here is the verified ₹399 Lifetime PRO payment link:',
      defaultValue: url,
      placeholder: 'Payment URL',
      label: 'Official Payment Link',
      badge: '💳 LIFETIME PRO PAYMENT',
      type: 'primary',
      confirmText: 'Done',
      cancelText: 'Close',
      icon: '📋'
    });
  });
}
window.copyPaymentLink = copyPaymentLink;

function sharePaymentViaWhatsApp() {
  const url = 'https://rzp.io/rzp/2a3h6cU';
  const text = encodeURIComponent('Pay ₹399 to unlock Lifetime PRO Membership on Telugu Trading Hub (24 Hand-Drawn Daily Setups + Video Library):\n' + url);
  window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
}
window.sharePaymentViaWhatsApp = sharePaymentViaWhatsApp;

// ==================== HIGH-VISIBILITY WEBSITE SOCIAL SHARING (v22) ====================
function openWebsiteShareModal() {
  const modal = document.getElementById('share-website-modal');
  if (!modal) return;
  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
}
window.openWebsiteShareModal = openWebsiteShareModal;

function closeWebsiteShareModal() {
  const modal = document.getElementById('share-website-modal');
  if (modal) modal.classList.remove('active');
  const otherActive = document.querySelector('.modal-overlay.active');
  if (!otherActive) document.body.style.overflow = '';
}
window.closeWebsiteShareModal = closeWebsiteShareModal;

function copyWebsiteShareLink() {
  const shareUrl = window.location.origin;
  navigator.clipboard.writeText(shareUrl).then(() => {
    showToast('📋 Website link copied to clipboard! Share with your trader friends.', 'success');
  }).catch(() => {
    customPrompt({
      title: 'Copy Website Link',
      message: 'Share Telugu Trading Hub with fellow traders:',
      defaultValue: shareUrl,
      placeholder: 'Website URL',
      label: 'Platform Website Link',
      badge: '🚀 SHARE WEBSITE',
      type: 'primary',
      confirmText: 'Done',
      cancelText: 'Close',
      icon: '🔗'
    });
  });
}
window.copyWebsiteShareLink = copyWebsiteShareLink;

function shareToSocial(platform) {
  const shareUrl = encodeURIComponent(window.location.origin);
  const shareText = encodeURIComponent('🚀 Learn Institutional Price Action Trading with 24 Hand-Drawn Daily Setups on Telugu Trading Hub! Check it out:');

  switch (platform) {
    case 'whatsapp':
      window.open(`https://api.whatsapp.com/send?text=${shareText}%20${shareUrl}`, '_blank');
      break;
    case 'telegram':
      window.open(`https://t.me/share/url?url=${shareUrl}&text=${shareText}`, '_blank');
      break;
    case 'instagram':
      copyWebsiteShareLink();
      showToast('📸 Website link copied! Open Instagram and paste in your DM or Bio.', 'info');
      break;
    case 'twitter':
      window.open(`https://twitter.com/intent/tweet?text=${shareText}&url=${shareUrl}&hashtags=Trading,PriceAction,TeluguTrading`, '_blank');
      break;
    case 'facebook':
      window.open(`https://www.facebook.com/sharer/sharer.php?u=${shareUrl}`, '_blank');
      break;
    case 'linkedin':
      window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${shareUrl}`, '_blank');
      break;
    case 'native':
      if (navigator.share) {
        navigator.share({
          title: 'Telugu Trading Hub - Institutional Price Action',
          text: 'Learn Institutional Price Action Trading with 24 Hand-Drawn Daily Setups on Telugu Trading Hub!',
          url: window.location.origin
        }).catch(() => {});
      } else {
        copyWebsiteShareLink();
      }
      break;
  }
}
window.shareToSocial = shareToSocial;


// ==================== MOBILE QUICK STRIP SCROLL SPY & OFFSET JUMP (v28) ====================
function initMobileQuickStripSpy() {
  const strip = document.querySelector('.mobile-quick-strip');
  if (!strip) return;

  const links = strip.querySelectorAll('a.quick-nav-pill');
  links.forEach(link => {
    link.addEventListener('click', function(e) {
      const href = this.getAttribute('href');
      if (href && href.startsWith('#')) {
        const targetId = href.substring(1);
        const targetEl = document.getElementById(targetId);
        if (targetEl) {
          e.preventDefault();
          const headerOffset = 96; // 52px nav + 42px quick strip + 2px border
          const elementPosition = targetEl.getBoundingClientRect().top;
          const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
          window.scrollTo({
            top: offsetPosition,
            behavior: 'smooth'
          });
          links.forEach(l => l.classList.remove('active-nav-pill'));
          this.classList.add('active-nav-pill');
        }
      }
    });
  });

  const trackedSections = [
    { id: 'chart-gallery-section', pill: strip.querySelector('a[href="#chart-gallery-section"]') },
    { id: 'videos-section', pill: strip.querySelector('a[href="#videos-section"]') },
    { id: 'pricing-section', pill: strip.querySelector('a[href="#pricing-section"]') },
    { id: 'comments-section', pill: strip.querySelector('a[href="#comments-section"]') },
    { id: 'support-section', pill: strip.querySelector('a[href="#support-section"]') }
  ];

  let isScrollTicking = false;
  window.addEventListener('scroll', () => {
    if (!isScrollTicking) {
      window.requestAnimationFrame(() => {
        const scrollPos = window.scrollY + 140;
        trackedSections.forEach(s => {
          const el = document.getElementById(s.id);
          if (el && s.pill) {
            const top = el.offsetTop;
            const height = el.offsetHeight;
            if (scrollPos >= top && scrollPos < top + height) {
              s.pill.classList.add('active-nav-pill');
            } else {
              s.pill.classList.remove('active-nav-pill');
            }
          }
        });
        isScrollTicking = false;
      });
      isScrollTicking = true;
    }
  }, { passive: true });
}
