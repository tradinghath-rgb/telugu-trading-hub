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
const state = {
  siteConfig: null,
  charts: [],
  currentUser: null,
  activeFilter: 'all',
  searchQuery: '',
  activeModalChart: null,
  activeVideoLang: 'telugu', // default Telugu
  adminSelectedChartIds: new Set(),
  adminMediaInventory: { teluguVideos: [], englishVideos: [], uploadedMedia: [] }
};

// ==================== INITIALIZATION ====================
document.addEventListener('DOMContentLoaded', async () => {
  initAuthState();
  await loadSiteConfig();
  await loadCharts();
  initIntroVideo();
  initMarketTicker();
  checkUrlPaymentCallback();
  checkAdminUrlParam();
  renderApp();
});

// Load Authentication State from Storage
function initAuthState() {
  try {
    const raw = sessionStorage.getItem('tradinghub_user') || localStorage.getItem('tradinghub_user');
    if (raw) {
      const parsed = JSON.parse(raw);
      // STRICT OWNER SECURITY POLICY:
      // If someone has an old admin session or non-owner admin session, wipe it immediately!
      if (parsed.role === 'admin' && parsed.email?.toLowerCase() !== 'abhisheknaidus093@gmail.com') {
        localStorage.removeItem('tradinghub_user');
        sessionStorage.removeItem('tradinghub_user');
        state.currentUser = null;
        return;
      }
      // Never allow auto-login as admin from localStorage across browser restarts!
      // Admin must explicitly enter abhisheknaidus093@gmail.com and password 22NE1A04E1!
      if (parsed.role === 'admin') {
        const sessionAuth = sessionStorage.getItem('tradinghub_user');
        if (!sessionAuth) {
          localStorage.removeItem('tradinghub_user');
          state.currentUser = null;
          return;
        }
      }
      state.currentUser = parsed;
    }
  } catch (e) {
    localStorage.removeItem('tradinghub_user');
    sessionStorage.removeItem('tradinghub_user');
    state.currentUser = null;
  }
}

function saveAuthState(user) {
  state.currentUser = user;
  if (user) {
    if (user.role === 'admin') {
      // Store admin session strictly in sessionStorage so closing browser requires re-entry of password
      sessionStorage.setItem('tradinghub_user', JSON.stringify(user));
      localStorage.removeItem('tradinghub_user');
    } else {
      localStorage.setItem('tradinghub_user', JSON.stringify(user));
    }
  } else {
    localStorage.removeItem('tradinghub_user');
    sessionStorage.removeItem('tradinghub_user');
  }
  renderApp();
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
      if (state.currentUser?.role === 'admin' && state.currentUser?.email?.toLowerCase() === 'abhisheknaidus093@gmail.com') {
        openAdminModal();
      } else {
        openAdminSecurityModal();
      }
    }, 600);
  }
}

// ==================== INTRO VIDEO FLOW ====================
function initIntroVideo() {
  const overlay = document.getElementById('intro-overlay');
  const video = document.getElementById('intro-video-element');
  const skipBtn = document.getElementById('intro-skip-btn');
  const muteBtn = document.getElementById('intro-mute-btn');
  const progressBar = document.getElementById('intro-progress-line');

  if (!overlay || !video) return;

  const introSeen = sessionStorage.getItem('tradinghub_intro_seen');
  
  if (introSeen) {
    overlay.classList.add('hidden');
    return;
  }

  // Set video source
  const introSrc = state.siteConfig?.introVideo || '/intro-video';
  video.src = introSrc;

  // Browser Autoplay handling (often requires muted initially)
  video.muted = true;
  const playPromise = video.play();

  if (playPromise !== undefined) {
    playPromise.then(() => {
      // Autoplay started successfully (muted)
      if (muteBtn) {
        muteBtn.innerHTML = `
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 5L6 9H2v6h4l5 4V5z"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
          <span>Tap for Sound</span>
        `;
      }
    }).catch(err => {
      console.log('Autoplay waiting for user gesture:', err.message);
      if (muteBtn) {
        muteBtn.innerHTML = `
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          <span>Play Intro</span>
        `;
      }
    });
  }

  // Progress update
  video.addEventListener('timeupdate', () => {
    if (video.duration && progressBar) {
      const pct = (video.currentTime / video.duration) * 100;
      progressBar.style.width = `${pct}%`;
    }
  });

  // Auto transition when intro ends
  video.addEventListener('ended', () => {
    closeIntroVideo();
  });

  // Skip button
  if (skipBtn) {
    skipBtn.addEventListener('click', closeIntroVideo);
  }

  // Mute / Unmute / Play trigger button
  if (muteBtn) {
    muteBtn.addEventListener('click', () => {
      if (video.paused) {
        video.play();
        video.muted = false;
        muteBtn.innerHTML = `
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
          <span>Mute Audio</span>
        `;
      } else {
        video.muted = !video.muted;
        muteBtn.innerHTML = video.muted
          ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 5L6 9H2v6h4l5 4V5z"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg><span>Unmute Audio</span>`
          : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg><span>Mute Audio</span>`;
      }
    });
  }
}

function closeIntroVideo() {
  const overlay = document.getElementById('intro-overlay');
  const video = document.getElementById('intro-video-element');
  if (video) video.pause();
  if (overlay) overlay.classList.add('hidden');
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
    const isAdmin = user.role === 'admin' && user.email?.toLowerCase() === 'abhisheknaidus093@gmail.com';
    const isMember = user.hasPaid || isAdmin;
    const shortName = (user.name || user.email.split('@')[0]).split(' ')[0];

    authNavGroup.innerHTML = `
      <div class="nav-user-cluster">
        <div class="nav-profile-pill" title="${user.email}">
          <svg class="nav-profile-svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          <strong class="nav-user-name">${shortName}</strong>
          ${isAdmin ? '<span class="admin-badge-indicator nav-badge-micro">OWNER</span>' : (isMember ? '<span class="pricing-lifetime-pill nav-badge-micro">PRO</span>' : '')}
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
    // Guest view: Show prominent Login button with Profile Icon for visitors and registered members
    authNavGroup.innerHTML = `
      <div class="nav-guest-cluster">
        <button class="btn btn-sm btn-primary nav-signin-btn" onclick="openAuthModal('login')" title="Member Login">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          <span>Login</span>
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
    heroCta.innerHTML = `
      <span>${cfg.hero?.ctaText || 'Unlock Lifetime Access - ₹399'}</span>
      <span class="price-pill">₹${cfg.pricing?.price || 399}</span>
    `;
  }

  // Pricing Elements
  document.querySelectorAll('[data-bind="price"]').forEach(el => el.textContent = `₹${cfg.pricing?.price || 399}`);
  document.querySelectorAll('[data-bind="originalPrice"]').forEach(el => el.textContent = `₹${cfg.pricing?.originalPrice || 1999}`);
  document.querySelectorAll('[data-bind="discountBadge"]').forEach(el => el.textContent = cfg.pricing?.discountBadge || '80% OFF');
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

  const isUnlocked = state.currentUser?.hasPaid || state.currentUser?.role === 'admin';

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
    return;
  }

  container.innerHTML = filtered.map(chart => {
    return `
      <div class="chart-card" onclick="openChartModal('${chart.id}')">
        <div class="chart-thumbnail-wrap">
          <img src="${chart.chartImage || '/assets/charts/chart-1.svg'}" alt="${chart.title}" loading="lazy" />
          <span class="chart-reel-badge">LESSON #${chart.reelNumber || ''}</span>
          <span class="chart-bilingual-pill">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
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
              ${isUnlocked ? 'Watch Breakdown' : 'Preview Chart'}
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// Category selection
function setChartCategoryFilter(cat, btn) {
  state.activeFilter = cat;
  document.querySelectorAll('.category-pill').forEach(p => p.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderCharts();
}

// Search input handler
function handleChartSearch(query) {
  state.searchQuery = query;
  renderCharts();
}

// ==================== BILINGUAL VIDEO & CHART MODAL ====================
function openChartModal(chartId) {
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
  if (imgEl) imgEl.src = chart.chartImage || '/assets/charts/chart-1.svg';

  const sumEl = document.getElementById('modal-chart-summary');
  if (sumEl) sumEl.textContent = chart.summary || '';

  const takeawayEl = document.getElementById('modal-chart-takeaway');
  if (takeawayEl) takeawayEl.textContent = chart.keyTakeaway || '';

  const playerContainer = document.getElementById('modal-player-container');

  if (!isUnlocked) {
    // Locked Preview View for Free/Unpaid Users
    playerContainer.innerHTML = `
      <div style="padding: 36px 20px; text-align: center; background: rgba(14, 20, 34, 0.95); border-radius: var(--radius-md); border: 1px dashed var(--accent-gold);">
        <div style="width: 54px; height: 54px; border-radius: 50%; background: rgba(255, 215, 0, 0.15); display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; color: var(--accent-gold);">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        </div>
        <h4 style="font-size: 1.2rem; font-weight: 800; color: #fff; margin-bottom: 8px;">Telugu &amp; English Explanation Video Locked</h4>
        <p style="color: var(--text-secondary); font-size: 0.9rem; max-width: 440px; margin: 0 auto 20px; line-height: 1.6;">
          Unlock this video along with all 24+ drawn charts and daily setups for a one-time fee of ₹399.
        </p>
        <button class="btn btn-gold btn-lg" onclick="handleCheckoutRedirect('https://rzp.io/rzp/2a3h6cU')" style="width: 100%; max-width: 360px; margin: 0 auto; display: inline-flex; justify-content: center;">
          ⚡ Unlock All Lessons - ₹399 Lifetime Access
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
      <video id="modal-video-element" class="video-player-elem" controls autoplay playsinline controlsList="nodownload">
        <source src="${videoUrl}" type="video/mp4" />
        Your browser does not support HTML5 video playback.
      </video>
    </div>

    <div style="display: flex; align-items: center; justify-content: space-between; font-size: 0.8rem; color: var(--text-secondary); margin-top: 8px;">
      <span>Now Playing: <strong>${isTelugu ? 'Telugu Video Breakdown' : 'English Video Breakdown'}</strong></span>
      <span>Speed: Selectable in video controls</span>
    </div>
  `;
}

// ==================== RAZORPAY CHECKOUT & PAYMENT VERIFICATION ====================
function handleCheckoutRedirect(url) {
  const checkoutUrl = url || state.siteConfig?.pricing?.razorpayUrl || 'https://rzp.io/rzp/2a3h6cU';

  // If user is not logged in, advise them to sign up so lifetime access is registered to their email
  if (!state.currentUser) {
    if (confirm('Please sign in or create an account with your Email & Password so your lifetime access is saved. Would you like to sign in now?')) {
      openAuthModal('register');
      return;
    }
  }

  // Open Razorpay link in new tab
  window.open(checkoutUrl, '_blank');

  // Open the post-payment verification modal
  setTimeout(() => {
    openPaymentVerificationModal();
  }, 1000);
}

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

async function submitPaymentVerification() {
  const email = document.getElementById('verify-email-input')?.value?.trim();
  const paymentId = document.getElementById('verify-payment-id-input')?.value?.trim() || `pay_rzp_${Date.now()}`;

  if (!email) {
    showToast('Please enter your email to activate lifetime access', 'error');
    return;
  }

  try {
    const res = await fetch('/api/auth/verify-payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, paymentId })
    });
    const data = await res.json();

    if (data.success) {
      saveAuthState(data.user);
      closePaymentVerificationModal();
      showToast('🎉 Congratulations! Lifetime Access Unlocked!', 'success');
      // Scroll to member dashboard
      document.getElementById('charts-section')?.scrollIntoView({ behavior: 'smooth' });
    } else {
      showToast(data.error || 'Failed to verify payment.', 'error');
    }
  } catch (err) {
    showToast('Error verifying payment: ' + err.message, 'error');
  }
}

// ==================== AUTH MODAL (SIGNUP / LOGIN) ====================
function openAuthModal(mode = 'login') {
  const modal = document.getElementById('auth-modal');
  if (!modal) return;

  setAuthModalMode(mode);
  modal.classList.add('active');
}

function closeAuthModal() {
  const modal = document.getElementById('auth-modal');
  if (modal) modal.classList.remove('active');
}

function setAuthModalMode(mode) {
  const title = document.getElementById('auth-modal-title');
  const submitBtn = document.getElementById('auth-submit-btn');
  const toggleText = document.getElementById('auth-toggle-prompt');
  const nameGroup = document.getElementById('auth-name-group');

  if (mode === 'register') {
    title.textContent = 'Create Member Account';
    submitBtn.textContent = 'Sign Up & Continue';
    nameGroup.style.display = 'block';
    toggleText.innerHTML = `Already registered? <a href="javascript:void(0)" onclick="setAuthModalMode('login')" style="color: var(--accent-green); font-weight: bold;">Login</a>`;
    submitBtn.dataset.mode = 'register';
  } else {
    title.textContent = 'Welcome Back! Login';
    submitBtn.textContent = 'Login';
    nameGroup.style.display = 'none';
    toggleText.innerHTML = `Need an account? <a href="javascript:void(0)" onclick="setAuthModalMode('register')" style="color: var(--accent-green); font-weight: bold;">Sign Up</a>`;
    submitBtn.dataset.mode = 'login';
  }
}

async function handleAuthSubmit() {
  const mode = document.getElementById('auth-submit-btn').dataset.mode || 'login';
  const email = document.getElementById('auth-email-input').value.trim();
  const password = document.getElementById('auth-password-input').value;
  const name = document.getElementById('auth-name-input')?.value?.trim();

  if (!email || !password) {
    showToast('Please enter both email and password', 'error');
    return;
  }

  const endpoint = mode === 'register' ? '/api/auth/register' : '/api/auth/login';
  const payload = mode === 'register' ? { email, password, name } : { email, password };

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (data.success) {
      saveAuthState(data.user);
      closeAuthModal();
      localStorage.setItem('tradinghub_has_registered', 'true');

      if (data.user.role === 'admin') {
        showToast('👑 Admin Login Successful! Welcome Abhishek Naidu.', 'success');
      } else if (mode === 'register') {
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
  saveAuthState(null);
  showToast('Logged out successfully.', 'info');
}

// ==================== SECURE OWNER / ADMIN AUTHENTICATION ====================
function openAdminSecurityModal() {
  const modal = document.getElementById('admin-security-modal');
  const emailInput = document.getElementById('admin-security-email');
  const passInput = document.getElementById('admin-security-password');
  if (emailInput) emailInput.value = 'abhisheknaidus093@gmail.com';
  if (passInput) passInput.value = '';
  if (modal) modal.classList.add('active');
}

function closeAdminSecurityModal() {
  const modal = document.getElementById('admin-security-modal');
  if (modal) modal.classList.remove('active');
}

async function handleAdminSecurityLogin(event) {
  if (event) event.preventDefault();
  const email = document.getElementById('admin-security-email').value.trim();
  const password = document.getElementById('admin-security-password').value;

  if (!email || !password) {
    showToast('Please enter both Owner Email and Password', 'error');
    return;
  }

  const OWNER_EMAIL = 'abhisheknaidus093@gmail.com';
  if (email.toLowerCase() !== OWNER_EMAIL) {
    showToast('❌ Access Denied: Only owner account abhisheknaidus093@gmail.com is authorized to enter Admin CMS.', 'error');
    return;
  }

  const btn = document.getElementById('admin-security-btn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Verifying Security Credentials...';
  }

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();

    if (data.success && data.user.role === 'admin' && data.user.email.toLowerCase() === OWNER_EMAIL) {
      saveAuthState(data.user);
      closeAdminSecurityModal();
      showToast('👑 Admin Login Successful! Welcome Abhishek Naidu.', 'success');
      openAdminModal();
    } else {
      showToast('❌ Access Denied: Invalid Owner Password.', 'error');
    }
  } catch (e) {
    showToast('Connection error: ' + e.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Authenticate & Open Admin CMS';
    }
  }
}

// ==================== ADMIN PORTAL (UPLOAD, BULK DELETE, LIVE CMS) ====================
function openAdminModal() {
  const OWNER_EMAIL = 'abhisheknaidus093@gmail.com';
  if (!state.currentUser || state.currentUser.role !== 'admin' || state.currentUser.email?.toLowerCase() !== OWNER_EMAIL) {
    openAdminSecurityModal();
    return;
  }

  const modal = document.getElementById('admin-modal');
  if (!modal) return;

  loadAdminMediaInventory();
  renderAdminChartsTable();
  populateCmsForm();
  loadAwsStatus();

  modal.classList.add('active');
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
  document.getElementById('cms-original-price').value = cfg.pricing?.originalPrice || 1999;
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
      originalPrice: parseInt(document.getElementById('cms-original-price').value, 10) || 1999,
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
