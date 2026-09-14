/**
 * TRADING HUB - APPLICATION LOGIC
 * Dynamic Live CMS, Bilingual Telugu/English Switcher, Intro Auto-Player,
 * Razorpay Payment Integration, Admin Plus (+) Upload, Rename, and Bulk Delete.
 */

// Immediately flush any stale/legacy demo sessions from browser cache
try {
  const stale = localStorage.getItem('tradinghub_user');
  if (stale && (stale.includes('Master') || stale.includes('admin@') || stale.includes('"role":"admin"'))) {
    localStorage.removeItem('tradinghub_user');
    sessionStorage.removeItem('tradinghub_user');
  }
} catch (_) {}

// Fallback safety: If old quickLoginAsAdmin is somehow triggered, force security modal instead
window.quickLoginAsAdmin = function() {
  localStorage.removeItem('tradinghub_user');
  sessionStorage.removeItem('tradinghub_user');
  state.currentUser = null;
  openAdminSecurityModal();
};

// Global Application State
const ADMIN_PIN = '200514';
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
  adminMediaInventory: { teluguVideos: [], englishVideos: [], uploadedMedia: [] },
  showAllVideos: false,
  showAllCharts: false,
  showAllGalleryCharts: false,
  adminUsersList: [],
  adminUserFilter: 'all',
  adminUserSearch: ''
};

// ==================== INITIALIZATION ====================
document.addEventListener('DOMContentLoaded', async () => {
  initAuthState();
  await loadSiteConfig();
  await loadCharts();
  await loadChartGallery();
  await loadComments();
  initIntroVideo();
  initMarketTicker();
  initGalleryDragDrop();
  initDailyChartDragDrop();
  checkUrlPaymentCallback();
  initPaymentScreenshotDropzone();
  checkAdminUrlParam();
  checkResetPasswordTokenInUrl();
  renderApp();
});

// ==================== BROWSER ACCOUNT VAULT (CROSS-DEPLOY PERMANENCE) ====================
function saveToLocalAccountVault(account) {
  if (!account || !account.email) return;
  try {
    const emailKey = account.email.toLowerCase().trim();
    let vault = JSON.parse(localStorage.getItem('tradinghub_account_vault') || '{}');
    const existing = vault[emailKey] || {};
    vault[emailKey] = {
      email: emailKey,
      password: account.password || existing.password || '',
      name: account.name || existing.name || emailKey.split('@')[0],
      hasPaid: Boolean(account.hasPaid || existing.hasPaid),
      paymentId: account.paymentId || existing.paymentId || null,
      role: account.role || existing.role || 'member',
      savedAt: Date.now()
    };
    localStorage.setItem('tradinghub_account_vault', JSON.stringify(vault));
  } catch (_) {}
}

function getLocalAccountVault(email) {
  if (!email) return null;
  try {
    const vault = JSON.parse(localStorage.getItem('tradinghub_account_vault') || '{}');
    return vault[email.toLowerCase().trim()] || null;
  } catch (_) {
    return null;
  }
}

async function syncAllLocalAccountsToServer() {
  try {
    const vault = JSON.parse(localStorage.getItem('tradinghub_account_vault') || '{}');
    const accounts = Object.values(vault);
    for (const acc of accounts) {
      if (acc && acc.email) {
        fetch('/api/auth/sync-client-account', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(acc)
        }).catch(() => {});
      }
    }
  } catch (_) {}
}

// Load Authentication State from Storage
function initAuthState() {
  try {
    const raw = sessionStorage.getItem('tradinghub_user') || localStorage.getItem('tradinghub_user');
    if (raw) {
      const parsed = JSON.parse(raw);
      // Only keep admin session if active in current browser session
      if (parsed.role === 'admin') {
        const sessionAuth = sessionStorage.getItem('tradinghub_user');
        if (!sessionAuth) {
          localStorage.removeItem('tradinghub_user');
          state.currentUser = null;
          return;
        }
        // Ultra Privacy: If PIN is not verified for this session, blur home and prompt PIN code
        if (sessionStorage.getItem('tradinghub_admin_pin_verified') !== ADMIN_PIN) {
          document.body.classList.add('admin-home-blurred');
          setTimeout(() => openAdminPinModal(), 300);
        }
      }
      // Explicitly revoke unverified flagged test accounts
      if (parsed.email && parsed.email.toLowerCase().trim() === 'abhisheknaidu2005@gmail.com') {
        localStorage.removeItem('tradinghub_user');
        sessionStorage.removeItem('tradinghub_user');
        localStorage.removeItem('tradinghub_session_token');
        try {
          let vault = JSON.parse(localStorage.getItem('tradinghub_account_vault') || '{}');
          if (vault['abhisheknaidu2005@gmail.com']) {
            vault['abhisheknaidu2005@gmail.com'].hasPaid = false;
            vault['abhisheknaidu2005@gmail.com'].paymentId = null;
            localStorage.setItem('tradinghub_account_vault', JSON.stringify(vault));
          }
        } catch (_) {}
        state.currentUser = null;
        return;
      }
      state.currentUser = parsed;
      // Auto-heal account on server in case of new deployment
      fetch('/api/auth/sync-client-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed)
      }).catch(() => {});
    }
    syncAllLocalAccountsToServer();
    cleanLocalVaultTestAccounts();
  } catch (e) {
    localStorage.removeItem('tradinghub_user');
    sessionStorage.removeItem('tradinghub_user');
    state.currentUser = null;
  }
}

// Multi-Device Access Enabled: Allows multiple phones, laptops, and PCs simultaneously
async function validateActiveSession() {
  return true;
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
  if (user) {
    saveToLocalAccountVault(user);
    if (user.sessionToken) {
      if (user.role === 'admin') {
        sessionStorage.setItem('tradinghub_session_token', user.sessionToken);
      } else {
        localStorage.setItem('tradinghub_session_token', user.sessionToken);
      }
    }
    if (user.role === 'admin') {
      sessionStorage.setItem('tradinghub_user', JSON.stringify(user));
      localStorage.setItem('tradinghub_user', JSON.stringify(user));
    } else {
      localStorage.setItem('tradinghub_user', JSON.stringify(user));
      sessionStorage.setItem('tradinghub_user', JSON.stringify(user));
    }
  } else {
    localStorage.removeItem('tradinghub_user');
    sessionStorage.removeItem('tradinghub_user');
    localStorage.removeItem('tradinghub_session_token');
    sessionStorage.removeItem('tradinghub_session_token');
  }
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
  if (urlParams.get('admin') === 'true' || window.location.hash === '#admin') {
    setTimeout(() => {
      if (state.currentUser?.role === 'admin') {
        openAdminModal();
      } else {
        openAuthModal('login');
      }
    }, 600);
  }
}

// ==================== INTRO VIDEO FLOW ====================
function initIntroVideo() {
  const overlay = document.getElementById('intro-overlay');
  if (overlay) overlay.remove();
}

function closeIntroVideo() {
  const overlay = document.getElementById('intro-overlay');
  if (overlay) overlay.remove();
  sessionStorage.setItem('tradinghub_intro_seen', 'true');
}

function replayIntro() {
  const overlay = document.getElementById('intro-overlay');
  const video = document.getElementById('intro-video-element');
  if (!overlay || !video) return;

  overlay.classList.remove('hidden');
  video.currentTime = 0;
  video.muted = false;
  video.play().catch(() => {
    video.muted = true;
    video.play();
  });
}

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

  if (user) {
    const isAdmin = user.role === 'admin';
    const isMember = user.hasPaid || isAdmin;
    const shortName = (user.name || user.email.split('@')[0]).split(' ')[0];

    // Hide pricing CTA in navbar for verified PRO members & Admin
    const pricingCta = document.querySelector('.nav-pricing-cta');
    if (pricingCta) {
      pricingCta.style.display = isMember ? 'none' : 'inline-flex';
    }

    authNavGroup.innerHTML = `
      <div class="nav-user-cluster">
        <div class="nav-profile-pill" onclick="openUserProfileModal()" title="View Profile & Provided Features">
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
  if (heroCta) {
    const isMember = Boolean(state.currentUser?.hasPaid || state.currentUser?.role === 'admin');
    if (isMember) {
      heroCta.innerHTML = `
        <span>✅ Lifetime Access Active — Watch 24+ Lessons</span>
      `;
      heroCta.onclick = () => {
        document.getElementById('charts-section')?.scrollIntoView({ behavior: 'smooth' });
      };
    } else {
      heroCta.innerHTML = `
        <span>${cfg.hero?.ctaText || 'Unlock Lifetime Access - ₹399'}</span>
        <span class="price-pill">₹${cfg.pricing?.price || 399} <s style="opacity: 0.65; font-size: 0.8em; margin-left: 4px; text-decoration: line-through;">₹${cfg.pricing?.originalPrice || 999}</s></span>
      `;
      heroCta.onclick = () => handleCheckoutRedirect('https://rzp.io/rzp/2a3h6cU');
    }
  }

  // Pricing Elements
  document.querySelectorAll('[data-bind="price"]').forEach(el => el.textContent = `₹${cfg.pricing?.price || 399}`);
  document.querySelectorAll('[data-bind="originalPrice"]').forEach(el => el.textContent = `₹${cfg.pricing?.originalPrice || 999}`);
  document.querySelectorAll('[data-bind="discountUrgency"]').forEach(el => el.textContent = cfg.pricing?.discountUrgency || '⚡ Discount only for a few days!');
  document.querySelectorAll('[data-bind="discountBadge"]').forEach(el => el.textContent = cfg.pricing?.discountBadge || '60% LIMITED LAUNCH OFFER');
  document.querySelectorAll('[data-bind="accessType"]').forEach(el => el.textContent = cfg.pricing?.accessType || 'LIFETIME ACCESS');

  // Razorpay Buttons Link Binding
  const checkoutUrl = cfg.pricing?.razorpayUrl || 'https://rzp.io/rzp/2a3h6cU';
  document.querySelectorAll('[data-action="checkout-razorpay"]').forEach(btn => {
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
        ? `openGalleryLightbox('${item.imageUrl}', '${escapedTitle}')`
        : `handleUnpaidChartClick()`;

      return `
        <div class="chart-card">
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
  if (countEl) countEl.textContent = `${filtered.length} Charts & Video Lessons`;

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
      <div class="chart-card" onclick="openChartModal('${chart.id}')">
        <div class="chart-thumbnail-wrap">
          <img src="${chart.chartImage || '/assets/charts/chart-1.svg'}" alt="${chart.title}" loading="lazy" decoding="async" />
          <span class="chart-reel-badge">LESSON #${chart.reelNumber || ''}</span>
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
            <button class="btn btn-sm ${isUnlocked ? 'btn-primary' : 'btn-secondary'}">
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
            <span>+ More Videos (Click to Display All Lessons) ▼</span>
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
  const checkoutUrl = url || state.siteConfig?.pricing?.razorpayUrl || 'https://rzp.io/rzp/2a3h6cU';
  pendingCheckoutUrl = checkoutUrl;

  // If user is already logged in: Proceed directly to payment - NEVER prompt for login!
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
    localStorage.setItem('tradinghub_pending_email', email);
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
  const email = state.currentUser?.email || localStorage.getItem('tradinghub_pending_email') || '';
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
  if (emailInput) emailInput.value = '';
  if (passInput) passInput.value = '';
  if (pinInput) pinInput.value = '';
  if (pinGroup) pinGroup.style.display = 'none';

  resetPasswordToggle('auth-password-input');
  resetPasswordToggle('auth-admin-pin-input');
  
  // Requirement: Checkbox remains unchecked by default until user manually clicks it
  const rememberCheckbox = document.getElementById('auth-remember-me');
  if (rememberCheckbox) rememberCheckbox.checked = false;

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
      if (data.sessionToken) {
        data.user.sessionToken = data.sessionToken;
        if (data.user.role === 'admin') {
          sessionStorage.setItem('tradinghub_session_token', data.sessionToken);
        } else {
          localStorage.setItem('tradinghub_session_token', data.sessionToken);
        }
      }
      saveAuthState(data.user);

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
          let vault = JSON.parse(localStorage.getItem('tradinghub_account_vault') || '{}');
          const key = email.toLowerCase().trim();
          if (vault[key]) {
            vault[key].password = '';
            vault[key].remembered = false;
            localStorage.setItem('tradinghub_account_vault', JSON.stringify(vault));
          }
        } catch (_) {}
      }

      closeAuthModal();
      localStorage.setItem('tradinghub_has_registered', 'true');

      // Requirement: Admin login gives email and password -> home screen blurs and asks code (PIN).
      // Only after admin enters the code can he control everything.
      if (data.user.role === 'admin' || isAdminEmail) {
        sessionStorage.removeItem('tradinghub_admin_pin_verified');
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

function handleLogout() {
  sessionStorage.removeItem('tradinghub_admin_pin_verified');
  sessionStorage.removeItem('tradinghub_session_token');
  saveAuthState(null);
  showToast('Logged out successfully.', 'info');
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

    items.push({
      id: 'intro',
      title: 'Watch Platform Intro Video',
      badge: 'REPLAY',
      badgeColor: 'var(--text-muted)',
      desc: 'Watch the full introduction video explaining trading methodology',
      icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/></svg>`,
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
      case 'intro':
        replayIntro();
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

  // If closed without verifying PIN, log out admin and remove blur for security
  if (state.currentUser && state.currentUser.role === 'admin' && sessionStorage.getItem('tradinghub_admin_pin_verified') !== ADMIN_PIN) {
    document.body.classList.remove('admin-home-blurred');
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
    sessionStorage.setItem('tradinghub_admin_pin_verified', ADMIN_PIN);
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
  if (sessionStorage.getItem('tradinghub_admin_pin_verified') !== ADMIN_PIN) {
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
          <img src="${chart.chartImage || '/assets/charts/chart-1.svg'}" class="admin-thumb-mini" style="cursor: pointer; transition: transform 0.2s ease;" onclick="openChartModal('${chart.id}')" title="Watch Video Breakdown" alt="" />
        </td>
        <td>
          <strong style="cursor: pointer; color: #fff;" onclick="openChartModal('${chart.id}')" title="Watch Video Breakdown">${chart.title}</strong>
          <div style="font-size: 0.76rem; color: var(--text-muted);">Reel #${chart.reelNumber || '-'} • Added: ${chart.dateAdded || ''}</div>
        </td>
        <td>
          <span class="category-pill" style="padding: 2px 8px; font-size: 0.75rem;">${chart.category}</span>
        </td>
        <td>
          <div style="display: flex; gap: 4px; font-size: 0.72rem;">
            <span style="color: var(--accent-green); background: rgba(0,242,152,0.1); padding: 2px 6px; border-radius: 4px;">TEL</span>
            <span style="color: var(--accent-cyan); background: rgba(0,210,255,0.1); padding: 2px 6px; border-radius: 4px;">ENG</span>
          </div>
        </td>
        <td>
          <div style="display: flex; gap: 6px; flex-wrap: wrap;">
            <button class="btn btn-sm btn-primary" onclick="openChartModal('${chart.id}')" title="Watch Video Breakdown" style="padding: 4px 10px; font-size: 0.75rem; display: inline-flex; align-items: center; gap: 4px;">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              Watch
            </button>
            <button class="btn btn-sm btn-secondary" onclick="openRenameModal('${chart.id}')" title="Rename or Edit Chart" style="padding: 4px 8px; font-size: 0.75rem;">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              Edit
            </button>
            <button class="btn btn-sm btn-danger" onclick="deleteSingleChart('${chart.id}')" title="Delete Chart" style="padding: 4px 8px; font-size: 0.75rem;">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  updateBulkActionBar();
}

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

  if (!confirm(`Are you sure you want to permanently delete these ${ids.length} charts and their linked video references?`)) {
    return;
  }

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
  if (!confirm('Are you sure you want to delete this chart?')) return;

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

// ==================== PLUS (+) ICON: UPLOAD NEW CHART & VIDEOS ====================
function openAddChartModal() {
  const modal = document.getElementById('add-chart-modal');
  if (modal) {
    document.getElementById('add-chart-form').reset();
    populateVideoDropdowns();
    modal.classList.add('active');
  }
}

function closeAddChartModal() {
  const modal = document.getElementById('add-chart-modal');
  if (modal) modal.classList.remove('active');
}

async function submitNewChart(event) {
  event.preventDefault();

  const title = document.getElementById('new-chart-title').value.trim();
  const category = document.getElementById('new-chart-category').value;
  const summary = document.getElementById('new-chart-summary').value.trim();
  const keyTakeaway = document.getElementById('new-chart-takeaway').value.trim();

  const chartImageFile = document.getElementById('new-chart-image-file').files[0];
  const teluguVideoFile = document.getElementById('new-chart-telugu-file').files[0];
  const englishVideoFile = document.getElementById('new-chart-english-file').files[0];

  const selectedTeluguUrl = document.getElementById('new-chart-telugu-select').value;
  const selectedEnglishUrl = document.getElementById('new-chart-english-select').value;

  const formData = new FormData();
  formData.append('title', title);
  formData.append('category', category);
  formData.append('summary', summary);
  formData.append('keyTakeaway', keyTakeaway);

  if (chartImageFile) formData.append('chartImage', chartImageFile);
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
  submitBtn.textContent = 'Uploading to Server/AWS...';

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

// ==================== EDIT / RENAME CHART MODAL ====================
function openRenameModal(chartId) {
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

  modal.classList.add('active');
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

  try {
    const res = await fetch(`/api/charts/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, category, summary, keyTakeaway, teluguVideo, englishVideo })
    });
    const data = await res.json();

    if (data.success) {
      showToast('Chart details updated successfully!', 'success');
      closeRenameModal();
      await loadCharts();
      renderApp();
      renderAdminChartsTable();
    } else {
      showToast(data.error || 'Failed to update chart', 'error');
    }
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
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
  toast.innerHTML = `
    ${type === 'success' 
      ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-green)" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>'
      : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-red)" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>'
    }
    <span>${message}</span>
  `;
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
    showToast('🔒 Please enter your 6-digit Admin Security PIN (Ultra Privacy).', 'error');
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
        sessionStorage.setItem('tradinghub_session_token', data.sessionToken);
      }
      sessionStorage.setItem('tradinghub_admin_pin_verified', ADMIN_PIN);
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
      ? `openGalleryLightbox('${item.imageUrl}', '${escapedTitle}')`
      : `handleUnpaidChartClick()`;

    return `
      <div class="gallery-card">
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
  const title = prompt('👑 Admin: Enter title for this new daily chart:', defaultTitle) || defaultTitle;

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
  const title = prompt('Enter a title for this chart setup:', defaultTitle) || defaultTitle;

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

function openGalleryLightbox(imageUrl, title) {
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
  if (!confirm('Are you sure you want to delete this chart from the image vault?')) return;

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
  if (!confirm('Are you sure you want to delete this comment? This action cannot be undone.')) return;

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
  const confirmMsg = action === 'approve' 
    ? 'Are you sure you want to approve this payment and grant lifetime access to this user?'
    : 'Are you sure you want to revoke access for this payment?';
  if (!confirm(confirmMsg)) return;

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
async function downloadChartImage(url, title) {
  if (!url) return;
  const isUnlocked = Boolean(state.currentUser?.hasPaid || state.currentUser?.role === 'admin');
  if (!isUnlocked) {
    handleUnpaidChartClick();
    return;
  }

  try {
    showToast('Downloading high-resolution chart image...', 'info');

    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to fetch image file');
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);

    const safeTitle = (title || 'TradingHub_Chart')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .replace(/_+/g, '_');

    const isSvg = url.toLowerCase().includes('.svg');
    const isPng = url.toLowerCase().includes('.png');
    const ext = isSvg ? 'svg' : (isPng ? 'png' : 'jpg');
    const filename = `${safeTitle}.${ext}`;

    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setTimeout(() => URL.revokeObjectURL(blobUrl), 1500);
    showToast(`✅ Chart "${title || 'Setup'}" downloaded to device!`, 'success');
  } catch (err) {
    console.warn('Direct blob download failed, attempting direct link download:', err.message);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${(title || 'Trading_Chart').replace(/\s+/g, '_')}.png`;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
  const actionName = shouldBePro ? 'GRANT Lifetime PRO Access' : 'REVOKE PRO Access';
  const warning = shouldBePro 
    ? `Are you sure you want to GRANT Lifetime PRO Access to ${email}?`
    : `⚠️ WARNING: Are you sure you want to REVOKE PRO Access for ${email}? They will immediately lose access to all drawn charts and videos.`;

  if (!confirm(warning)) return;

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
  const confirmMsg = `🚨 DANGER: Are you sure you want to PERMANENTLY REMOVE account '${email}' from the platform?\n\nThis will remove the user, clear their credentials, and delete any associated records. This cannot be undone.`;
  if (!confirm(confirmMsg)) return;

  try {
    const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
      method: 'DELETE'
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to delete account');

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
  const newPass = prompt(`Enter a new password for ${email} (minimum 4 characters):`);
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
  if (!confirm('Are you sure you want to delete this comment?')) return;

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
  try {
    let vault = JSON.parse(localStorage.getItem('tradinghub_account_vault') || '{}');
    let changed = false;
    ['student@tradinghub.in', 'student@tradinghub.com', 'abhisheknaidu2005@gmail.com', 'test@test.com'].forEach(dummy => {
      if (vault[dummy]) {
        delete vault[dummy];
        changed = true;
      }
    });
    if (changed) {
      localStorage.setItem('tradinghub_account_vault', JSON.stringify(vault));
    }
  } catch (_) {}
}

function checkDeviceSavedAccount() {
  const hint = document.getElementById('auth-saved-hint');
  if (!hint) return;

  cleanLocalVaultTestAccounts();

  let vault = {};
  try {
    vault = JSON.parse(localStorage.getItem('tradinghub_account_vault') || '{}');
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
  // Requirement: Do NOT give password automatically when user types email.
  // Password is only populated if the user explicitly clicked the suggestion on focus.
  hideAuthSuggestionDropdown();
}

function handleAuthEmailFocus() {
  const submitBtn = document.getElementById('auth-submit-btn');
  const mode = submitBtn?.dataset?.mode || 'login';
  if (mode !== 'login') return;

  const box = document.getElementById('auth-saved-suggestion-box');
  if (!box) return;

  let vault = {};
  try {
    vault = JSON.parse(localStorage.getItem('tradinghub_account_vault') || '{}');
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
