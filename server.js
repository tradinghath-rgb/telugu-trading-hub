require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const crypto = require('crypto');

// Optional free Gmail SMTP transporter via Nodemailer
let nodemailer = null;
try {
  nodemailer = require('nodemailer');
} catch (e) {
  console.warn('Nodemailer not loaded, running in direct token reset mode.');
}

// AWS S3 SDK v3
let S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand;
try {
  const s3Sdk = require('@aws-sdk/client-s3');
  S3Client = s3Sdk.S3Client;
  PutObjectCommand = s3Sdk.PutObjectCommand;
  GetObjectCommand = s3Sdk.GetObjectCommand;
  DeleteObjectCommand = s3Sdk.DeleteObjectCommand;
} catch (e) {
  console.warn('AWS S3 SDK not loaded, using local storage mode.');
}

const app = express();
const PORT = process.env.PORT || 3000;

// AWS S3 Client Setup
const AWS_REGION = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'ap-south-1'; // Default Mumbai region
const AWS_S3_BUCKET = process.env.AWS_S3_BUCKET || '';
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID || '';
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY || '';

let s3 = null;
if (S3Client && AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY && AWS_S3_BUCKET) {
  try {
    s3 = new S3Client({
      region: AWS_REGION,
      credentials: {
        accessKeyId: AWS_ACCESS_KEY_ID,
        secretAccessKey: AWS_SECRET_ACCESS_KEY
      }
    });
    console.log(`[AWS S3] Initialized S3 client for region: ${AWS_REGION}, bucket: ${AWS_S3_BUCKET}`);
  } catch (err) {
    console.warn('[AWS S3] Initialization error, falling back to local storage:', err.message);
  }
} else {
  console.log('[AWS] Running in Hybrid/Local Mode. (Set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_S3_BUCKET in .env to enable direct AWS S3 cloud uploads)');
}

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Disable browser caching for live UI assets so updates are immediate
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// ==================== SMART 8-HOUR KEEP-ALIVE SYSTEM ====================
// Keeps the website active on Render for 8 hours after any visitor visits the website.
// After 8 hours with no visitors, self-ping stops allowing Render to enter idle sleep to save quota.
// Whenever anyone clicks the website link in your bio, Render wakes up and resets the 8-hour timer!
const KEEP_ALIVE_DURATION_MS = 8 * 60 * 60 * 1000; // 8 hours in ms
const SELF_PING_INTERVAL_MS = 10 * 60 * 1000;      // Ping every 10 minutes (Render sleeps at 15 mins)
const APP_PUBLIC_URL = process.env.RENDER_EXTERNAL_URL || 'https://telugu-trading-hub.onrender.com';

let lastVisitorTimestamp = Date.now(); // Initialized to start time

// Visitor Activity Tracking Middleware
app.use((req, res, next) => {
  const isInternalPing = req.headers['x-keep-alive'] === 'internal-ping' || req.path === '/api/keepalive';
  if (!isInternalPing) {
    // Real visitor landed on website or made an API request!
    lastVisitorTimestamp = Date.now();
  }
  next();
});

// Directories
const DATA_DIR = path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const TELUGU_VIDEO_DIR = path.join(__dirname, 'TELUGU VIDEO');
const ENGLISH_VIDEO_DIR = path.join(__dirname, 'ENGLISH VIDEO');
const INTRO_DIR = path.join(__dirname, 'INTRO');
const LOGO_DIR = path.join(__dirname, 'LOGO');
const PUBLIC_DIR = path.join(__dirname, 'public');

[DATA_DIR, UPLOADS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Configure Multer for File Uploads (Chart Images & Videos)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const cleanName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    cb(null, `${Date.now()}-${cleanName}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 250 * 1024 * 1024 } // 250MB limit for high-res charts and videos
});

// Configure Multer for Payment Proof Screenshots
const PAYMENT_UPLOADS_DIR = path.join(UPLOADS_DIR, 'payments');
if (!fs.existsSync(PAYMENT_UPLOADS_DIR)) {
  fs.mkdirSync(PAYMENT_UPLOADS_DIR, { recursive: true });
}

const paymentStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, PAYMENT_UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.png';
    const safeName = `proof_${Date.now()}_${Math.random().toString(36).substring(2, 8)}${ext}`;
    cb(null, safeName);
  }
});

const uploadPaymentProof = multer({
  storage: paymentStorage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files (PNG, JPG, JPEG, WEBP) are allowed for payment proof.'));
    }
  }
});

// Blacklist of revoked unverified accounts
const REVOKED_EMAILS = ['abhisheknaidu2005@gmail.com'];

// Helper for Database JSON read/write
function readJson(fileName, fallback = []) {
  const filePath = path.join(DATA_DIR, fileName);
  if (!fs.existsSync(filePath)) return fallback;
  try {
    const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
    const data = JSON.parse(raw);
    if (fileName === 'users.json' && Array.isArray(data)) {
      return data.map(u => {
        if (u && u.email && typeof REVOKED_EMAILS !== 'undefined' && REVOKED_EMAILS.includes(u.email.toLowerCase().trim())) {
          return { ...u, hasPaid: false, paymentId: null, paidAt: null };
        }
        if (u && u.email && u.email.toLowerCase().trim() === 'student@tradinghub.in') {
          return { ...u, hasPaid: true, paymentId: u.paymentId || 'pay_DEMO_VERIFIED_LIFETIME' };
        }
        return u;
      });
    }
    return data;
  } catch (e) {
    console.error(`Error reading ${fileName}:`, e.message);
    return fallback;
  }
}

// ==================== CROSS-DEPLOY PERMANENT CLOUD DATA VAULT ====================
// Automatically preserves all registered user accounts, passwords, lifetime paid statuses,
// comments, and uploaded charts across Render restarts, redeploys, and code updates.
// ==================== CROSS-DEPLOY PERMANENT CLOUD DATA VAULT ====================
// Automatically preserves all registered user accounts, passwords, lifetime paid statuses,
// comments, and uploaded charts across Render restarts, redeploys, and code updates.
// Powered by Dual Redundant Cloud Mirrors + Local Persistent Snapshots.
const CLOUD_SYNC_MAP = {
  'users.json': {
    primaryId: 'ff808181a067127101a09c13b7dc0be0',
    secondaryId: 'ff808181a067127101a09c30c3bc0c2d',
    key: 'users',
    name: 'tradinghub_users'
  },
  'chart_gallery.json': {
    primaryId: 'ff808181a067127101a09c1477550be3',
    secondaryId: 'ff808181a067127101a09c30eaf80c2f',
    key: 'gallery',
    name: 'tradinghub_gallery'
  },
  'comments.json': {
    primaryId: 'ff808181a067127101a09c14773f0be2',
    secondaryId: 'ff808181a067127101a09c30eadb0c2e',
    key: 'comments',
    name: 'tradinghub_comments'
  }
};

async function syncToCloud(fileName, data) {
  const cfg = CLOUD_SYNC_MAP[fileName];
  if (!cfg || !data) return;

  // 1. Local permanent backup snapshot
  try {
    const backupName = `${path.parse(fileName).name}_permanent.json`;
    const backupPath = path.join(DATA_DIR, backupName);
    fs.writeFileSync(backupPath, JSON.stringify(data, null, 2), 'utf8');
  } catch (_) {}

  // 2. Sync to Primary and Secondary Cloud Stores in parallel
  const targets = [
    { id: cfg.primaryId, label: 'Primary Cloud' },
    { id: cfg.secondaryId, label: 'Secondary Mirror' }
  ];

  await Promise.allSettled(targets.map(async t => {
    if (!t.id) return;
    try {
      await fetch(`https://api.restful-api.dev/objects/${t.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: cfg.name, data: { [cfg.key]: data } }),
        signal: AbortSignal.timeout(7000)
      });
      console.log(`[Cloud Vault] Persisted ${fileName} (${data.length} items) to ${t.label}.`);
    } catch (err) {
      console.warn(`[Cloud Vault] Notice syncing ${fileName} to ${t.label}:`, err.message);
    }
  }));

  // 3. Sync to AWS S3 if configured
  if (s3 && PutObjectCommand && AWS_S3_BUCKET) {
    try {
      await s3.send(new PutObjectCommand({
        Bucket: AWS_S3_BUCKET,
        Key: `vault/${fileName}`,
        Body: JSON.stringify(data, null, 2),
        ContentType: 'application/json'
      }));
      console.log(`[Cloud Vault] Persisted ${fileName} to AWS S3 bucket: ${AWS_S3_BUCKET}`);
    } catch (err) {
      console.warn(`[Cloud Vault] AWS S3 sync notice:`, err.message);
    }
  }
}

async function fetchRemoteVault(id, key) {
  if (!id) return null;
  try {
    const res = await fetch(`https://api.restful-api.dev/objects/${id}`, {
      signal: AbortSignal.timeout(6000)
    });
    if (!res.ok) return null;
    const json = await res.json();
    const items = json?.data?.[key];
    return Array.isArray(items) ? items : null;
  } catch (_) {
    return null;
  }
}

async function syncFromCloud(fileName) {
  const cfg = CLOUD_SYNC_MAP[fileName];
  if (!cfg) return;

  try {
    // Read local files (current + permanent backup)
    const localData = readJson(fileName, []);
    const backupName = `${path.parse(fileName).name}_permanent.json`;
    const backupData = readJson(backupName, []);

    // Fetch from Primary and Secondary in parallel
    const [primaryData, secondaryData] = await Promise.all([
      fetchRemoteVault(cfg.primaryId, cfg.key),
      fetchRemoteVault(cfg.secondaryId, cfg.key)
    ]);

    // Gather candidate lists
    const candidateSources = [localData, backupData];
    if (primaryData && primaryData.length > 0) candidateSources.push(primaryData);
    if (secondaryData && secondaryData.length > 0) candidateSources.push(secondaryData);

    let merged;
    if (fileName === 'users.json') {
      const userMap = new Map();
      const OWNER_EMAIL = 'abhisheknaidus093@gmail.com';

      candidateSources.forEach(sourceList => {
        if (!Array.isArray(sourceList)) return;
        sourceList.forEach(u => {
          if (!u || !u.email) return;
          const key = u.email.trim().toLowerCase();
          const existing = userMap.get(key);
          if (!existing) {
            userMap.set(key, { ...u, email: key, hasPaid: Boolean(u.hasPaid) });
          } else {
            userMap.set(key, {
              ...existing,
              ...u,
              email: key,
              // ONCE PAID, NEVER UNPAID: hasPaid is permanently protected
              hasPaid: Boolean(existing.hasPaid || u.hasPaid),
              paidAt: existing.paidAt || u.paidAt,
              paymentId: existing.paymentId || u.paymentId,
              password: u.password || existing.password,
              role: (existing.role === 'admin' || u.role === 'admin' || key === OWNER_EMAIL) ? 'admin' : (existing.role || u.role || 'member'),
              name: u.name || existing.name
            });
          }
        });
      });

      // Blacklist / Revocation enforcement
      if (typeof REVOKED_EMAILS !== 'undefined') {
        REVOKED_EMAILS.forEach(revoked => {
          const revKey = revoked.trim().toLowerCase();
          if (userMap.has(revKey)) {
            const u = userMap.get(revKey);
            u.hasPaid = false;
            u.paymentId = null;
            u.paidAt = null;
            userMap.set(revKey, u);
          }
        });
      }

      // Always guarantee Owner Admin is preserved
      if (!userMap.has(OWNER_EMAIL)) {
        userMap.set(OWNER_EMAIL, {
          id: 'admin-1',
          email: OWNER_EMAIL,
          password: process.env.ADMIN_PASSWORD || '22NE1A04E1',
          name: 'Abhishek Naidu (Owner)',
          role: 'admin',
          hasPaid: true,
          paidAt: '2026-09-01T00:00:00.000Z',
          paymentId: 'ADMIN_PROVISIONED'
        });
      } else {
        const ownerUser = userMap.get(OWNER_EMAIL);
        ownerUser.role = 'admin';
        ownerUser.hasPaid = true;
      }

      merged = Array.from(userMap.values());
    } else {
      const itemMap = new Map();
      candidateSources.forEach(sourceList => {
        if (!Array.isArray(sourceList)) return;
        sourceList.forEach(item => {
          if (item?.id) itemMap.set(item.id, { ...(itemMap.get(item.id) || {}), ...item });
        });
      });
      merged = Array.from(itemMap.values());
    }

    // Write merged data to local files
    const filePath = path.join(DATA_DIR, fileName);
    fs.writeFileSync(filePath, JSON.stringify(merged, null, 2), 'utf8');

    const backupPath = path.join(DATA_DIR, backupName);
    fs.writeFileSync(backupPath, JSON.stringify(merged, null, 2), 'utf8');

    console.log(`[Cloud Vault] Fully Restored & Unified ${fileName}: ${merged.length} items active.`);

    // Push merged complete data back to both cloud vaults to ensure neither falls behind
    syncToCloud(fileName, merged);
  } catch (err) {
    console.warn(`[Cloud Vault] Notice restoring ${fileName}:`, err.message);
  }
}

async function initCloudDataPersistence() {
  console.log('[Cloud Vault] Checking and restoring registered users and data from dual cloud stores...');
  await syncFromCloud('users.json');
  await syncFromCloud('chart_gallery.json');
  await syncFromCloud('comments.json');
}

function writeJson(fileName, data) {
  const filePath = path.join(DATA_DIR, fileName);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  if (CLOUD_SYNC_MAP[fileName]) {
    syncToCloud(fileName, data);
  }
}

// HTTP 206 Partial Content Video Stream Handler
function streamVideoFile(req, res, filePath) {
  if (!fs.existsSync(filePath)) {
    return res.status(404).send('Video file not found');
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    let start = parseInt(parts[0], 10);
    let end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

    if (isNaN(start)) {
      start = fileSize - end;
      end = fileSize - 1;
    }
    if (isNaN(end) || end >= fileSize) {
      end = fileSize - 1;
    }
    if (start >= fileSize || start > end) {
      res.status(416).setHeader('Content-Range', `bytes */${fileSize}`);
      return res.end();
    }

    const chunksize = (end - start) + 1;
    const file = fs.createReadStream(filePath, { start, end });
    const head = {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': 'video/mp4',
    };
    res.writeHead(206, head);
    file.pipe(res);
  } else {
    const head = {
      'Content-Length': fileSize,
      'Content-Type': 'video/mp4',
      'Accept-Ranges': 'bytes'
    };
    res.writeHead(200, head);
    fs.createReadStream(filePath).pipe(res);
  }
}

// ==================== STATIC & MEDIA ROUTES ====================

// Root Route with aggressive no-cache to force browser to load latest HTML
app.get('/', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// Dedicated routes for All Videos and All Charts
app.get(['/all-videos', '/all-videos.html', '/videos-library'], (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.sendFile(path.join(PUBLIC_DIR, 'all-videos.html'));
});

app.get(['/all-charts', '/all-charts.html', '/charts-vault'], (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.sendFile(path.join(PUBLIC_DIR, 'all-charts.html'));
});

// Static Web App with strict no-cache headers
app.use(express.static(PUBLIC_DIR, {
  etag: false,
  lastModified: false,
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
}));

// Static Logo
app.use('/logo', express.static(LOGO_DIR));

// Static Uploads
app.use('/uploads', express.static(UPLOADS_DIR));

// Video Streaming Endpoints
app.get('/videos/telugu/:filename', (req, res) => {
  const filePath = path.join(TELUGU_VIDEO_DIR, req.params.filename);
  streamVideoFile(req, res, filePath);
});

app.get('/videos/english/:filename', (req, res) => {
  const filePath = path.join(ENGLISH_VIDEO_DIR, req.params.filename);
  streamVideoFile(req, res, filePath);
});

app.get('/videos/intro/:filename', (req, res) => {
  const filePath = path.join(INTRO_DIR, req.params.filename);
  streamVideoFile(req, res, filePath);
});

// Default intro video direct stream
app.get('/intro-video', (req, res) => {
  const introFile = path.join(INTRO_DIR, 'lv_0_20260901105849.mp4');
  streamVideoFile(req, res, introFile);
});

// Default logo direct endpoint
app.get('/brand-logo', (req, res) => {
  const logoFile = path.join(LOGO_DIR, 'general-profile-picture.png');
  res.sendFile(logoFile);
});

// ==================== AWS STATUS & CLOUD API ====================

// Keep-Alive Health Endpoint
app.get('/api/keepalive', (req, res) => {
  const elapsed = Date.now() - lastVisitorTimestamp;
  const remainingMs = Math.max(0, KEEP_ALIVE_DURATION_MS - elapsed);
  const remainingHours = (remainingMs / (1000 * 60 * 60)).toFixed(2);
  const isWithinActiveWindow = elapsed < KEEP_ALIVE_DURATION_MS;

  res.json({
    status: 'ACTIVE',
    awake: isWithinActiveWindow,
    remainingHoursInActiveWindow: remainingHours,
    serverUptimeSeconds: Math.floor(process.uptime()),
    publicUrl: APP_PUBLIC_URL
  });
});

app.get('/api/aws/status', (req, res) => {
  const isConfigured = Boolean(s3 && AWS_S3_BUCKET);
  res.json({
    status: isConfigured ? 'CONNECTED' : 'STANDBY_LOCAL_MODE',
    region: AWS_REGION,
    bucket: AWS_S3_BUCKET || 'Not specified (using local storage)',
    storageBackend: isConfigured ? 'Amazon Web Services S3' : 'Node.js Express / Local Hybrid Storage',
    message: isConfigured 
      ? `AWS S3 Bucket ${AWS_S3_BUCKET} active in ${AWS_REGION}`
      : 'Running in ready-mode. Can be deployed directly to AWS EC2, Elastic Beanstalk, or AWS App Runner.'
  });
});

// ==================== LIVE SITE TEXT CMS API ====================
// "MOST OVER THE ADMIN PAGE I WANT ADMIN LIKE I CAN EDIT TEXT OF WEBSITE FOR THE ADMIN PAGE ONLY NOT TO COME HERE AGAIN"

// Get Live Site Configuration
app.get('/api/site-config', (req, res) => {
  const config = readJson('site-config.json', {});
  res.json(config);
});

// Update Site Configuration (Admin Live Text Editor)
app.post('/api/site-config', (req, res) => {
  try {
    const currentConfig = readJson('site-config.json', {});
    const updatedConfig = {
      ...currentConfig,
      ...req.body,
      lastUpdated: new Date().toISOString()
    };
    writeJson('site-config.json', updatedConfig);
    res.json({ success: true, message: 'Website text & configuration updated instantly!', config: updatedConfig });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==================== CHARTS & VIDEOS API ====================

// Get all charts
app.get('/api/charts', (req, res) => {
  const charts = readJson('charts.json', []);
  res.json(charts);
});

// Get single chart
app.get('/api/charts/:id', (req, res) => {
  const charts = readJson('charts.json', []);
  const chart = charts.find(c => c.id === req.params.id);
  if (!chart) return res.status(404).json({ error: 'Chart not found' });
  res.json(chart);
});

// Add new chart (With Plus Icon in Admin)
app.post('/api/charts', upload.fields([
  { name: 'chartImage', maxCount: 1 },
  { name: 'teluguVideo', maxCount: 1 },
  { name: 'englishVideo', maxCount: 1 }
]), (req, res) => {
  try {
    const charts = readJson('charts.json', []);
    const { title, category, summary, keyTakeaway, tags, customChartUrl, customTeluguUrl, customEnglishUrl } = req.body;

    let chartImage = customChartUrl || '/assets/charts/chart-1.svg';
    if (req.files && req.files['chartImage'] && req.files['chartImage'][0]) {
      chartImage = `/uploads/${req.files['chartImage'][0].filename}`;
    }

    let teluguVideo = customTeluguUrl || '';
    if (req.files && req.files['teluguVideo'] && req.files['teluguVideo'][0]) {
      teluguVideo = `/uploads/${req.files['teluguVideo'][0].filename}`;
    }

    let englishVideo = customEnglishUrl || '';
    if (req.files && req.files['englishVideo'] && req.files['englishVideo'][0]) {
      englishVideo = `/uploads/${req.files['englishVideo'][0].filename}`;
    }

    const newId = `chart-${Date.now().toString().slice(-6)}`;
    const newChart = {
      id: newId,
      reelNumber: charts.length + 1,
      title: title || `Trading Setup #${charts.length + 1}`,
      category: category || 'SMC & Liquidity',
      summary: summary || 'Detailed institutional price action chart analysis.',
      keyTakeaway: keyTakeaway || 'Follow strict stop-loss rules and confirm liquidity sweeps.',
      teluguVideo: teluguVideo || '/videos/telugu/reel-1(volume secret).mp4',
      englishVideo: englishVideo || '/videos/english/reel-1(volume secret).mp4',
      chartImage: chartImage,
      dateAdded: new Date().toISOString().split('T')[0],
      views: 1
    };

    charts.unshift(newChart); // Put newest first
    writeJson('charts.json', charts);

    res.status(201).json({ success: true, message: 'New chart & videos uploaded successfully!', chart: newChart });
  } catch (err) {
    console.error('Error adding chart:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Edit / Rename a chart
app.put('/api/charts/:id', (req, res) => {
  try {
    const charts = readJson('charts.json', []);
    const index = charts.findIndex(c => c.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Chart not found' });

    charts[index] = {
      ...charts[index],
      ...req.body,
      id: req.params.id // Prevent overriding ID
    };

    writeJson('charts.json', charts);
    res.json({ success: true, message: 'Chart updated successfully!', chart: charts[index] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Delete a single chart
app.delete('/api/charts/:id', (req, res) => {
  try {
    let charts = readJson('charts.json', []);
    const initialLen = charts.length;
    charts = charts.filter(c => c.id !== req.params.id);
    if (charts.length === initialLen) return res.status(404).json({ error: 'Chart not found' });

    writeJson('charts.json', charts);
    res.json({ success: true, message: 'Chart deleted successfully!' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Bulk Delete Multiple Charts ("delete one or multiple at the same time")
app.post('/api/charts/bulk-delete', (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Array of chart IDs is required for bulk delete' });
    }

    let charts = readJson('charts.json', []);
    const beforeCount = charts.length;
    charts = charts.filter(c => !ids.includes(c.id));
    const deletedCount = beforeCount - charts.length;

    writeJson('charts.json', charts);
    res.json({ success: true, message: `Successfully deleted ${deletedCount} charts!`, deletedCount });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// List available video assets from the local repository for easy linking in Admin
app.get('/api/media-inventory', (req, res) => {
  try {
    const teluguFiles = fs.existsSync(TELUGU_VIDEO_DIR) ? fs.readdirSync(TELUGU_VIDEO_DIR) : [];
    const englishFiles = fs.existsSync(ENGLISH_VIDEO_DIR) ? fs.readdirSync(ENGLISH_VIDEO_DIR) : [];
    const uploadedFiles = fs.existsSync(UPLOADS_DIR) ? fs.readdirSync(UPLOADS_DIR) : [];

    res.json({
      teluguVideos: teluguFiles.map(f => ({ name: f, url: `/videos/telugu/${encodeURIComponent(f)}` })),
      englishVideos: englishFiles.map(f => ({ name: f, url: `/videos/english/${encodeURIComponent(f)}` })),
      uploadedMedia: uploadedFiles.map(f => ({ name: f, url: `/uploads/${encodeURIComponent(f)}` }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== IMAGE-ONLY CHART GALLERY API ====================

// Get all image-only charts
app.get('/api/chart-gallery', (req, res) => {
  const gallery = readJson('chart_gallery.json', []);
  res.json(gallery);
});

// Upload new chart image (Drag-and-Drop or File Picker)
app.post('/api/chart-gallery', upload.single('chartImage'), (req, res) => {
  try {
    const gallery = readJson('chart_gallery.json', []);
    const title = req.body.title?.trim() || 'Institutional Chart Setup';

    let imageUrl = '';
    if (req.file) {
      imageUrl = `/uploads/${req.file.filename}`;
    } else if (req.body.customImageUrl) {
      imageUrl = req.body.customImageUrl;
    } else {
      return res.status(400).json({ error: 'No image file uploaded' });
    }

    const newItem = {
      id: `gallery-${Date.now()}`,
      title,
      imageUrl,
      dateAdded: new Date().toISOString().split('T')[0]
    };

    gallery.unshift(newItem);
    writeJson('chart_gallery.json', gallery);
    res.json({ success: true, message: 'Chart image uploaded successfully!', chart: newItem });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Rename / Edit title of a chart image
app.put('/api/chart-gallery/:id', (req, res) => {
  try {
    const gallery = readJson('chart_gallery.json', []);
    const idx = gallery.findIndex(g => g.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Chart image not found' });

    const newTitle = req.body.title?.trim();
    if (!newTitle) return res.status(400).json({ error: 'Title cannot be empty' });

    gallery[idx].title = newTitle;
    writeJson('chart_gallery.json', gallery);
    res.json({ success: true, message: 'Chart renamed successfully!', chart: gallery[idx] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Delete chart image
app.delete('/api/chart-gallery/:id', (req, res) => {
  try {
    let gallery = readJson('chart_gallery.json', []);
    const initialLen = gallery.length;
    const item = gallery.find(g => g.id === req.params.id);
    gallery = gallery.filter(g => g.id !== req.params.id);
    if (gallery.length === initialLen) return res.status(404).json({ error: 'Chart image not found' });

    // Remove local file if under uploads
    if (item && item.imageUrl && item.imageUrl.startsWith('/uploads/')) {
      const fileName = item.imageUrl.replace('/uploads/', '');
      const filePath = path.join(UPLOADS_DIR, decodeURIComponent(fileName));
      if (fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch (_) {}
      }
    }

    writeJson('chart_gallery.json', gallery);
    res.json({ success: true, message: 'Chart deleted successfully!' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==================== COMMUNITY COMMENTS & MESSAGE BOARD API ====================

// Get all comments
app.get('/api/comments', (req, res) => {
  const comments = readJson('comments.json', []);
  res.json(comments);
});

// Post a new comment
app.post('/api/comments', (req, res) => {
  try {
    const { name, text, email, role } = req.body;
    if (!name?.trim() || !text?.trim()) {
      return res.status(400).json({ error: 'Name and message are required' });
    }

    const comments = readJson('comments.json', []);
    const newComment = {
      id: `comment-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      name: name.trim().slice(0, 50),
      role: role || 'trader',
      text: text.trim().slice(0, 500),
      email: email ? email.trim() : null,
      timestamp: new Date().toISOString()
    };

    comments.unshift(newComment);
    writeJson('comments.json', comments);
    res.json({ success: true, message: 'Comment posted successfully!', comment: newComment });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin Delete Comment
app.delete('/api/comments/:id', (req, res) => {
  try {
    let comments = readJson('comments.json', []);
    const initialLen = comments.length;
    comments = comments.filter(c => c.id !== req.params.id);
    if (comments.length === initialLen) return res.status(404).json({ error: 'Comment not found' });

    writeJson('comments.json', comments);
    res.json({ success: true, message: 'Comment deleted successfully by Admin!' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==================== AUTH & PAYMENT UNLOCK API ====================

// User Sign Up
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const OWNER_EMAIL = 'abhisheknaidus093@gmail.com';
    if (cleanEmail === OWNER_EMAIL) {
      return res.status(400).json({ error: 'This is the reserved owner account. Please sign in.' });
    }

    let users = readJson('users.json', []);
    let existing = users.find(u => u.email.toLowerCase() === cleanEmail);
    if (!existing) {
      // In case server just restarted, check cloud vaults before creating duplicate
      await syncFromCloud('users.json');
      users = readJson('users.json', []);
      existing = users.find(u => u.email.toLowerCase() === cleanEmail);
    }

    if (existing) {
      return res.status(400).json({ error: 'An account with this email already exists. Please log in.' });
    }

    const sessionToken = crypto.randomBytes(16).toString('hex');
    const newUser = {
      id: `user-${Date.now()}`,
      email: cleanEmail,
      password: password,
      name: name ? name.trim() : email.split('@')[0],
      role: 'member',
      hasPaid: false,
      activeSessionToken: sessionToken,
      createdAt: new Date().toISOString()
    };

    users.push(newUser);
    writeJson('users.json', users);

    // Don't return password in response
    const { password: _, ...userSafe } = newUser;
    res.status(201).json({ success: true, message: 'Account created successfully!', user: userSafe, sessionToken });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// User or Admin Login (Enforces Single Active Device Session)
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const OWNER_EMAIL = 'abhisheknaidus093@gmail.com';
    let users = readJson('users.json', []);

    // Generate fresh session token for this device (supersedes any other device)
    const sessionToken = crypto.randomBytes(16).toString('hex');

    // Exclusive Owner / Admin Check
    if (cleanEmail === OWNER_EMAIL) {
      let adminIndex = users.findIndex(u => u.email.toLowerCase() === OWNER_EMAIL && u.role === 'admin');
      if (adminIndex === -1) {
        await syncFromCloud('users.json');
        users = readJson('users.json', []);
        adminIndex = users.findIndex(u => u.email.toLowerCase() === OWNER_EMAIL && u.role === 'admin');
      }
      if (adminIndex !== -1 && users[adminIndex].password === password) {
        users[adminIndex].activeSessionToken = sessionToken;
        writeJson('users.json', users);
        const { password: _, ...userSafe } = users[adminIndex];
        return res.json({ success: true, message: 'Owner authenticated successfully!', user: userSafe, sessionToken });
      }
      return res.status(401).json({ error: 'Invalid owner credentials' });
    }

    // Standard Member Login - Check local list first
    let userIndex = users.findIndex(u => u.email.toLowerCase() === cleanEmail && u.password === password);

    // Fail-Safe: If not found locally, do a live cloud pull before failing!
    if (userIndex === -1) {
      console.log(`[AUTH] User ${cleanEmail} not found locally during login. Querying permanent cloud store...`);
      await syncFromCloud('users.json');
      users = readJson('users.json', []);
      userIndex = users.findIndex(u => u.email.toLowerCase() === cleanEmail && u.password === password);
    }

    if (userIndex === -1) {
      const emailExists = users.some(u => u.email.toLowerCase() === cleanEmail);
      if (emailExists) {
        return res.status(401).json({ error: 'Incorrect password. Use Forgot Password to reset it.' });
      }
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Multi-device login: Allow multiple devices (phone, laptop, PC) at the same time
    const user = users[userIndex];
    const userSafe = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: 'member',
      hasPaid: !!user.hasPaid,
      paidAt: user.paidAt,
      paymentId: user.paymentId
    };
    res.json({ success: true, message: 'Logged in successfully!', user: userSafe, sessionToken });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Validate Active Session (Multi-Device Supported: Allows Mobile, Laptop & PC Simultaneously)
app.post('/api/auth/validate-session', (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.json({ valid: false, reason: 'missing_credentials' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const users = readJson('users.json', []);
    const user = users.find(u => u.email.toLowerCase() === cleanEmail);

    if (!user) {
      return res.json({ valid: false, reason: 'user_not_found' });
    }

    // Allow multiple devices to access simultaneously without logout or playback blocking
    res.json({ valid: true, hasPaid: Boolean(user.hasPaid), role: user.role });
  } catch (err) {
    res.status(500).json({ valid: false, error: err.message });
  }
});

// Helper for sending 100% Free Password Reset Email via Gmail SMTP
async function sendPasswordResetEmail(email, resetUrl, userName = 'Trader') {
  const GMAIL_USER = process.env.GMAIL_USER || process.env.EMAIL_USER;
  const GMAIL_PASS = process.env.GMAIL_APP_PASS || process.env.GMAIL_PASS || process.env.EMAIL_PASS;

  if (nodemailer && GMAIL_USER && GMAIL_PASS) {
    try {
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: GMAIL_USER,
          pass: GMAIL_PASS
        }
      });

      const mailOptions = {
        from: `"Trading Hub" <${GMAIL_USER}>`,
        to: email,
        subject: '🔒 Reset Your Trading Hub Password',
        html: `
          <div style="font-family: Arial, sans-serif; background-color: #080c14; color: #f0f4fc; padding: 30px 20px; border-radius: 12px; max-width: 540px; margin: 0 auto; border: 1px solid rgba(0, 242, 152, 0.2);">
            <div style="text-align: center; margin-bottom: 24px;">
              <h2 style="color: #00f298; margin: 0; font-size: 24px; letter-spacing: 1px;">TRADING HUB</h2>
              <p style="color: #94a3b8; font-size: 13px; margin: 4px 0 0;">Telugu & English Educational Community</p>
            </div>
            <div style="background: rgba(14, 20, 34, 0.95); padding: 24px; border-radius: 8px; border: 1px solid #1e293b;">
              <h3 style="color: #fff; margin-top: 0; font-size: 18px;">Password Reset Request</h3>
              <p style="color: #cbd5e1; font-size: 15px; line-height: 1.6;">Hello <strong>${userName}</strong>,</p>
              <p style="color: #cbd5e1; font-size: 14px; line-height: 1.6;">
                We received a request to reset the password for your Trading Hub account. Click the button below to choose a new password:
              </p>
              <div style="text-align: center; margin: 28px 0;">
                <a href="${resetUrl}" style="background: linear-gradient(135deg, #00f298, #00d2ff); color: #050811; font-weight: 800; text-decoration: none; padding: 13px 30px; border-radius: 30px; display: inline-block; font-size: 15px; box-shadow: 0 4px 15px rgba(0,242,152,0.3);">
                  Reset My Password
                </a>
              </div>
              <p style="color: #64748b; font-size: 12px; line-height: 1.5;">
                This link will expire in <strong>1 hour</strong>. If you did not request this password reset, please ignore this email and your password will remain completely safe.
              </p>
              <hr style="border: none; border-top: 1px solid #1e293b; margin: 20px 0;" />
              <p style="color: #64748b; font-size: 11px; word-break: break-all;">
                Button not working? Copy and paste this link into your browser:<br />
                <a href="${resetUrl}" style="color: #00d2ff;">${resetUrl}</a>
              </p>
            </div>
          </div>
        `
      };

      await transporter.sendMail(mailOptions);
      console.log(`[AUTH] Password reset email sent to ${email}`);
      return true;
    } catch (err) {
      console.warn('[AUTH] Gmail SMTP delivery failed or not configured:', err.message);
      return false;
    }
  }
  return false;
}

// Request Password Reset Link (Registered Users Only)
app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Please enter your registered Gmail / Email address.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    let users = readJson('users.json', []);
    let userIndex = users.findIndex(u => u.email.toLowerCase() === cleanEmail);

    // Fail-Safe: If not found in local users.json, check permanent cloud store before failing!
    if (userIndex === -1) {
      console.log(`[AUTH] Forgot password email ${cleanEmail} not found locally. Querying permanent cloud store...`);
      await syncFromCloud('users.json');
      users = readJson('users.json', []);
      userIndex = users.findIndex(u => u.email.toLowerCase() === cleanEmail);
    }

    // Strictly for already registered users only
    if (userIndex === -1) {
      return res.status(404).json({
        error: 'No registered account found with this email. Please sign up first.'
      });
    }

    const user = users[userIndex];
    // Generate secure 32-byte token and 1-hour expiration
    const token = crypto.randomBytes(32).toString('hex');
    const expires = Date.now() + 3600000; // 1 hour

    users[userIndex].resetToken = token;
    users[userIndex].resetExpires = expires;
    writeJson('users.json', users);

    // Construct full reset URL dynamically from host
    const host = req.get('host');
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const resetUrl = `${protocol}://${host}/?reset_token=${token}`;

    // Attempt to send email for free via Gmail SMTP if credentials provided
    const emailSent = await sendPasswordResetEmail(cleanEmail, resetUrl, user.name || 'Member');

    res.json({
      success: true,
      emailSent,
      resetUrl,
      message: emailSent 
        ? `A password reset link has been sent to ${cleanEmail}. Please check your inbox or spam folder.`
        : `Reset link created for ${cleanEmail}! Click below to choose your new password.`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Complete Password Reset
app.post('/api/auth/reset-password', (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Token and new password are required.' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
    }

    const users = readJson('users.json', []);
    const userIndex = users.findIndex(u => u.resetToken === token);

    if (userIndex === -1) {
      return res.status(400).json({ error: 'Invalid or already used password reset link. Please request a new one.' });
    }

    const user = users[userIndex];
    if (Date.now() > user.resetExpires) {
      return res.status(400).json({ error: 'This password reset link has expired (valid for 1 hour). Please request a new one.' });
    }

    // Update password and clear reset token
    users[userIndex].password = newPassword;
    delete users[userIndex].resetToken;
    delete users[userIndex].resetExpires;
    writeJson('users.json', users);

    console.log(`[AUTH] Password successfully reset for user: ${user.email}`);
    res.json({
      success: true,
      message: 'Password reset successful! You can now login with your new password.'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update Admin Credentials
app.post('/api/admin/credentials', (req, res) => {
  try {
    const { password } = req.body;
    const OWNER_EMAIL = 'abhisheknaidus093@gmail.com';
    const users = readJson('users.json', []);
    const adminIndex = users.findIndex(u => u.email.toLowerCase() === OWNER_EMAIL && u.role === 'admin');

    if (adminIndex !== -1) {
      if (password) users[adminIndex].password = password;
      writeJson('users.json', users);
      return res.json({ success: true, message: 'Admin security password updated successfully!' });
    }
    res.status(404).json({ error: 'Owner admin user not found' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== REAL-TIME PAYMENT STATUS CHECKER ====================
// Immediately checks if a captured payment was received in live transactions
app.get('/api/auth/check-payment-status', async (req, res) => {
  try {
    const email = (req.query.email || '').trim().toLowerCase();
    if (!email) {
      return res.json({ paid: false });
    }

    // 1. Check if user is already unlocked in local database
    const users = readJson('users.json', []);
    const existing = users.find(u => u.email && u.email.toLowerCase() === email);
    if (existing && existing.hasPaid) {
      const { password: _, ...safe } = existing;
      return res.json({ paid: true, user: safe });
    }

    // 2. Check live transactions on payment gateway
    const keyId = (process.env.RAZORPAY_KEY_ID || '').trim();
    const keySecret = (process.env.RAZORPAY_KEY_SECRET || '').trim();

    if (!keyId || !keySecret) {
      return res.json({ paid: false });
    }

    const authHeader = 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64');
    const response = await fetch('https://api.razorpay.com/v1/payments?count=20', {
      headers: { Authorization: authHeader }
    });

    if (!response.ok) {
      return res.json({ paid: false });
    }

    const data = await response.json();
    const items = data.items || [];

    // Find any captured payment for ₹399 created recently (within last 45 minutes)
    const fortyFiveMinAgo = Math.floor(Date.now() / 1000) - (45 * 60);

    const match = items.find(p => {
      if (p.status !== 'captured' || p.amount < 39900) return false;
      if (p.created_at < fortyFiveMinAgo) return false;

      // Check email match or notes match
      const pEmail = (p.email || '').trim().toLowerCase();
      if (pEmail && pEmail === email) return true;

      const notesEmail = (p.notes?.email || '').trim().toLowerCase();
      if (notesEmail && notesEmail === email) return true;

      return false;
    });

    if (match) {
      // Record payment into payments.json
      const payments = readJson('payments.json', []);
      const utr = match.acquirer_data?.rrn || match.acquirer_data?.upi_transaction_id || match.id;
      
      const alreadyLogged = payments.some(p => p.razorpayPaymentId === match.id);
      if (!alreadyLogged) {
        payments.push({
          id: `pay_rec_${Date.now()}`,
          email: email,
          utrId: utr,
          screenshotUrl: null,
          verified: true,
          verifiedAt: new Date().toISOString(),
          razorpayPaymentId: match.id,
          amount: match.amount / 100,
          submittedAt: new Date().toISOString()
        });
        writeJson('payments.json', payments);
      }

      // Unlock user in users.json
      let safeUser;
      const userIdx = users.findIndex(u => u.email.toLowerCase() === email);
      if (userIdx === -1) {
        const newUser = {
          id: `user-${Date.now()}`,
          email: email,
          password: 'ChangeMe@123',
          name: email.split('@')[0],
          role: 'member',
          hasPaid: true,
          paidAt: new Date().toISOString(),
          paymentId: match.id
        };
        users.push(newUser);
        writeJson('users.json', users);
        const { password: _, ...safe } = newUser;
        safeUser = safe;
      } else {
        users[userIdx].hasPaid = true;
        users[userIdx].paidAt = new Date().toISOString();
        users[userIdx].paymentId = match.id;
        writeJson('users.json', users);
        const { password: _, ...safe } = users[userIdx];
        safeUser = safe;
      }

      return res.json({ paid: true, user: safeUser });
    }

    return res.json({ paid: false });
  } catch (err) {
    console.error('Error in check-payment-status:', err.message);
    res.json({ paid: false });
  }
});

// ==================== RAZORPAY UTR & PAYMENT VERIFICATION API ====================

/**
 * Cross-verify UTR or Razorpay Payment ID with Razorpay API
 * @param {string} utrOrPaymentId - 12-digit UTR/RRN or pay_xxx
 * @returns {Promise<{ verified: boolean, payment?: any, error?: string }>}
 */
async function verifyWithRazorpay(utrOrPaymentId) {
  const keyId = (process.env.RAZORPAY_KEY_ID || '').trim();
  const keySecret = (process.env.RAZORPAY_KEY_SECRET || '').trim();
  const cleanId = (utrOrPaymentId || '').trim();

  // If Razorpay API credentials are not yet configured in .env
  if (!keyId || !keySecret) {
    return {
      verified: false,
      error: 'Razorpay API credentials (RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET) are not configured in .env on the server. Please contact administrator to activate automated verification.'
    };
  }

  const authHeader = 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64');

  try {
    // Case A: Direct Razorpay Payment ID (e.g. pay_OhXyZ123)
    if (cleanId.startsWith('pay_')) {
      const response = await fetch(`https://api.razorpay.com/v1/payments/${cleanId}`, {
        headers: { Authorization: authHeader }
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        return {
          verified: false,
          error: 'Payment verification failed. Please try again.'
        };
      }

      const payment = await response.json();
      if (payment.status !== 'captured') {
        return {
          verified: false,
          error: `Payment status is '${payment.status}'. Payment must be fully captured.`
        };
      }

      if (payment.amount < 39900) {
        return {
          verified: false,
          error: `Payment amount ₹${payment.amount / 100} is less than required ₹399.`
        };
      }

      return { verified: true, payment };
    }

    // Case B: 12-digit UPI UTR / RRN (Search recent captured payments on Razorpay)
    const listRes = await fetch(`https://api.razorpay.com/v1/payments?count=100`, {
      headers: { Authorization: authHeader }
    });

    if (!listRes.ok) {
      const errData = await listRes.json().catch(() => ({}));
      return {
        verified: false,
        error: 'Payment verification failed. Please try again.'
      };
    }

    const listData = await listRes.json();
    const items = listData.items || [];

    const matched = items.find(p => {
      if (p.status !== 'captured') return false;
      const acq = p.acquirer_data || {};
      const rrn = (acq.rrn || '').trim();
      const upiId = (acq.upi_transaction_id || '').trim();
      const bankTrx = (acq.bank_transaction_id || '').trim();
      return rrn === cleanId || upiId === cleanId || bankTrx === cleanId || p.id === cleanId;
    });

    if (matched) {
      if (matched.amount < 39900) {
        return {
          verified: false,
          error: `Payment amount ₹${matched.amount / 100} is less than required ₹399.`
        };
      }
      return { verified: true, payment: matched };
    }

    return {
      verified: false,
      error: 'Payment verification failed. Please try again.'
    };
  } catch (err) {
    return {
      verified: false,
      error: 'Payment verification failed. Please try again.'
    };
  }
}

// Payment Verification & Lifetime Access Unlock with UTR & Screenshot
app.post('/api/auth/verify-payment', uploadPaymentProof.single('screenshot'), async (req, res) => {
  try {
    const { email, utrId } = req.body;
    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanUtr = (utrId || '').trim();

    if (!cleanEmail) {
      return res.status(400).json({ success: false, error: 'Email address is required.' });
    }

    // Revoked / blacklisted accounts check
    if (REVOKED_EMAILS.includes(cleanEmail)) {
      return res.status(403).json({
        success: false,
        error: 'Payment verification failed. Please try again.'
      });
    }

    if (!cleanUtr) {
      return res.status(400).json({ success: false, error: 'UTR ID : is mandatory. Please enter the 12-digit UTR number from your payment app.' });
    }

    // Validate format: 10-18 digits OR pay_xxx
    const isNumericUtr = /^\d{10,18}$/.test(cleanUtr);
    const isPayId = /^pay_[a-zA-Z0-9]+$/.test(cleanUtr);
    if (!isNumericUtr && !isPayId) {
      return res.status(400).json({
        success: false,
        error: 'Invalid UTR format. Please enter the valid 12-digit numeric UTR ID from your payment receipt.'
      });
    }

    // Screenshot file verification
    const screenshotFile = req.file ? `/uploads/payments/${req.file.filename}` : null;
    if (!screenshotFile) {
      return res.status(400).json({
        success: false,
        error: 'Payment screenshot is required. Please upload or drag & drop your payment receipt.'
      });
    }

    // Duplicate UTR check across all previous payments
    const payments = readJson('payments.json', []);
    const isDuplicate = payments.some(p => (p.utrId || '').trim().toLowerCase() === cleanUtr.toLowerCase() && p.verified);
    if (isDuplicate) {
      return res.status(400).json({
        success: false,
        error: 'This UTR ID has already been verified and claimed. Each transaction can only be used once.'
      });
    }

    // Cross-verify with Razorpay API
    const verification = await verifyWithRazorpay(cleanUtr);

    // Save payment attempt to payments.json
    const paymentRecord = {
      id: `pay_rec_${Date.now()}`,
      email: cleanEmail,
      utrId: cleanUtr,
      screenshotUrl: screenshotFile,
      verified: Boolean(verification.verified),
      verifiedAt: verification.verified ? new Date().toISOString() : null,
      error: verification.error || null,
      razorpayPaymentId: verification.payment?.id || null,
      amount: verification.payment ? verification.payment.amount / 100 : 399,
      submittedAt: new Date().toISOString()
    };

    payments.push(paymentRecord);
    writeJson('payments.json', payments);

    if (!verification.verified) {
      return res.status(400).json({
        success: false,
        error: 'Payment verification failed. Please try again.'
      });
    }

    // On Success: Unlock lifetime access in users.json
    const users = readJson('users.json', []);
    const userIndex = users.findIndex(u => u.email.toLowerCase() === cleanEmail);

    let userSafe;
    if (userIndex === -1) {
      const newUser = {
        id: `user-${Date.now()}`,
        email: cleanEmail,
        password: 'ChangeMe@123',
        name: cleanEmail.split('@')[0],
        role: 'member',
        hasPaid: true,
        paidAt: new Date().toISOString(),
        paymentId: verification.payment?.id || cleanUtr
      };
      users.push(newUser);
      writeJson('users.json', users);
      const { password: _, ...safe } = newUser;
      userSafe = safe;
    } else {
      users[userIndex].hasPaid = true;
      users[userIndex].paidAt = new Date().toISOString();
      users[userIndex].paymentId = verification.payment?.id || cleanUtr;
      writeJson('users.json', users);
      const { password: _, ...safe } = users[userIndex];
      userSafe = safe;
    }

    return res.json({
      success: true,
      message: 'Payment Confirmed! Lifetime Access Unlocked!',
      user: userSafe,
      utrId: cleanUtr
    });
  } catch (err) {
    console.error('Error in /api/auth/verify-payment:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Client-Side Account Sync (STRICT: Never trust client-claimed hasPaid!)
app.post('/api/auth/sync-client-account', (req, res) => {
  try {
    const { email, password, name, paymentId } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });

    const cleanEmail = email.trim().toLowerCase();

    // Revoked email check
    if (REVOKED_EMAILS.includes(cleanEmail)) {
      const users = readJson('users.json', []);
      const idx = users.findIndex(u => u.email.toLowerCase() === cleanEmail);
      if (idx !== -1) {
        users[idx].hasPaid = false;
        users[idx].paymentId = null;
        users[idx].paidAt = null;
        writeJson('users.json', users);
      }
      return res.json({ success: true, restored: false, user: { email: cleanEmail, role: 'member', hasPaid: false } });
    }

    const users = readJson('users.json', []);
    const idx = users.findIndex(u => u.email.toLowerCase() === cleanEmail);

    // hasPaid can ONLY be true if verified in payments.json or already verified on server
    const payments = readJson('payments.json', []);
    const isVerifiedPaid = payments.some(p => p.email.toLowerCase() === cleanEmail && p.verified);

    if (idx === -1) {
      const newUser = {
        id: `user-${Date.now()}`,
        email: cleanEmail,
        password: password || 'TradingHub@2026',
        name: name || cleanEmail.split('@')[0],
        role: 'member',
        hasPaid: Boolean(isVerifiedPaid),
        paymentId: isVerifiedPaid ? paymentId : null,
        createdAt: new Date().toISOString()
      };
      users.push(newUser);
      writeJson('users.json', users);
      return res.json({ success: true, restored: true, user: newUser });
    } else {
      // If server does not have verified payment and not admin, keep hasPaid false
      if (!isVerifiedPaid && users[idx].role !== 'admin') {
        users[idx].hasPaid = false;
        writeJson('users.json', users);
      }
      return res.json({ success: true, restored: false, user: users[idx] });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ==================== ADMIN USER MANAGEMENT & PRO REVOCATION ENDPOINTS ====================

// 1. Get All Registered Users with PRO and Payment Info
app.get('/api/admin/users', (req, res) => {
  try {
    const users = readJson('users.json', []);
    const payments = readJson('payments.json', []);

    // Sanitize user list and attach payment reference if exists
    const sanitized = users.map(u => {
      const userPayment = payments.find(p => p.email && p.email.toLowerCase() === u.email.toLowerCase() && p.verified);
      return {
        id: u.id,
        email: u.email,
        name: u.name || u.email.split('@')[0],
        role: u.role || 'member',
        hasPaid: Boolean(u.hasPaid),
        createdAt: u.createdAt || null,
        paidAt: u.paidAt || (userPayment ? userPayment.submittedAt : null),
        paymentId: u.paymentId || (userPayment ? userPayment.utrId : null),
        revokedAt: u.revokedAt || null
      };
    });

    res.json(sanitized.slice().reverse());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 2. Toggle PRO Status for a User (Revoke PRO or Grant PRO)
app.post('/api/admin/users/:id/toggle-pro', (req, res) => {
  try {
    const { id } = req.params;
    const { hasPaid } = req.body;
    let users = readJson('users.json', []);
    const payments = readJson('payments.json', []);

    const uIdx = users.findIndex(u => u.id === id || u.email.toLowerCase() === id.toLowerCase());
    if (uIdx === -1) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const shouldHavePro = Boolean(hasPaid);
    users[uIdx].hasPaid = shouldHavePro;

    if (shouldHavePro) {
      users[uIdx].paidAt = new Date().toISOString();
      users[uIdx].paymentId = users[uIdx].paymentId || 'PRO_ADMIN_GRANTED';
      delete users[uIdx].revokedAt;
    } else {
      // Revoking PRO access:
      users[uIdx].hasPaid = false;
      users[uIdx].paymentId = null;
      users[uIdx].revokedAt = new Date().toISOString();
      // Invalidate active session so user immediately loses unlocked access on their device
      users[uIdx].activeSessionToken = null;

      // Also mark any payment records as revoked/unverified
      payments.forEach(p => {
        if (p.email && p.email.toLowerCase() === users[uIdx].email.toLowerCase()) {
          p.verified = false;
          p.error = 'PRO access revoked by Admin';
        }
      });
      writeJson('payments.json', payments);
    }

    writeJson('users.json', users);
    syncToCloud('users.json');

    const actionText = shouldHavePro ? 'Lifetime PRO Access Granted' : 'PRO Access Revoked Successfully';
    res.json({
      success: true,
      message: `${actionText} for ${users[uIdx].email}!`,
      user: {
        id: users[uIdx].id,
        email: users[uIdx].email,
        hasPaid: users[uIdx].hasPaid
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 3. Delete / Remove User Account (Remove Gmail)
app.delete('/api/admin/users/:id', (req, res) => {
  try {
    const { id } = req.params;
    let users = readJson('users.json', []);
    let payments = readJson('payments.json', []);

    const uIdx = users.findIndex(u => u.id === id || u.email.toLowerCase() === id.toLowerCase());
    if (uIdx === -1) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const targetUser = users[uIdx];
    const OWNER_EMAIL = 'abhisheknaidus093@gmail.com';
    if (targetUser.email.toLowerCase() === OWNER_EMAIL) {
      return res.status(403).json({ error: 'Cannot delete the Chief Mentor / Owner account.' });
    }

    // Remove user
    users.splice(uIdx, 1);
    writeJson('users.json', users);
    syncToCloud('users.json');

    // Remove any payment records for this user
    payments = payments.filter(p => !p.email || p.email.toLowerCase() !== targetUser.email.toLowerCase());
    writeJson('payments.json', payments);

    res.json({
      success: true,
      message: `Account ${targetUser.email} has been permanently deleted.`
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 4. Reset User Password
app.post('/api/admin/users/:id/reset-password', (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;
    if (!newPassword || newPassword.trim().length < 4) {
      return res.status(400).json({ error: 'New password must be at least 4 characters.' });
    }

    let users = readJson('users.json', []);
    const uIdx = users.findIndex(u => u.id === id || u.email.toLowerCase() === id.toLowerCase());
    if (uIdx === -1) {
      return res.status(404).json({ error: 'User not found.' });
    }

    users[uIdx].password = newPassword.trim();
    users[uIdx].activeSessionToken = null; // Forces re-login with new password
    writeJson('users.json', users);
    syncToCloud('users.json');

    res.json({
      success: true,
      message: `Password updated successfully for ${users[uIdx].email}.`
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 5. Admin Manually Create Member / PRO User
app.post('/api/admin/users/create', (req, res) => {
  try {
    const { email, password, name, isPro } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    let users = readJson('users.json', []);
    if (users.some(u => u.email.toLowerCase() === cleanEmail)) {
      return res.status(400).json({ error: 'A user with this email already exists.' });
    }

    const shouldBePro = Boolean(isPro);
    const newUser = {
      id: `user-${Date.now()}`,
      email: cleanEmail,
      password: password.trim(),
      name: name ? name.trim() : cleanEmail.split('@')[0],
      role: 'member',
      hasPaid: shouldBePro,
      paidAt: shouldBePro ? new Date().toISOString() : null,
      paymentId: shouldBePro ? 'PRO_ADMIN_GRANTED' : null,
      activeSessionToken: null,
      createdAt: new Date().toISOString()
    };

    users.push(newUser);
    writeJson('users.json', users);
    syncToCloud('users.json');

    const { password: _, ...userSafe } = newUser;
    res.status(201).json({
      success: true,
      message: `User ${cleanEmail} created successfully!`,
      user: userSafe
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 6. Platform Overview & Realtime Stats
app.get('/api/admin/stats', (req, res) => {
  try {
    const users = readJson('users.json', []);
    const charts = readJson('charts.json', []);
    const comments = readJson('comments.json', []);
    const payments = readJson('payments.json', []);

    const proCount = users.filter(u => u.hasPaid).length;
    const freeCount = users.length - proCount;
    const verifiedPayments = payments.filter(p => p.verified).length;

    res.json({
      totalUsers: users.length,
      proUsers: proCount,
      freeUsers: freeCount,
      totalCharts: charts.length,
      totalComments: comments.length,
      verifiedPayments: verifiedPayments,
      estimatedRevenue: proCount * 399
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Admin Payment Management Endpoints
app.get('/api/admin/payments', (req, res) => {
  try {
    const payments = readJson('payments.json', []);
    res.json(payments.slice().reverse());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/admin/payments/:id/action', (req, res) => {
  try {
    const { id } = req.params;
    const { action } = req.body;
    const payments = readJson('payments.json', []);
    const pIdx = payments.findIndex(p => p.id === id || p.utrId === id);

    if (pIdx === -1) {
      return res.status(404).json({ error: 'Payment submission not found.' });
    }

    if (action === 'approve') {
      payments[pIdx].verified = true;
      payments[pIdx].verifiedBy = 'admin_manual';
      payments[pIdx].verifiedAt = new Date().toISOString();
      writeJson('payments.json', payments);

      // Unlock user
      const users = readJson('users.json', []);
      const uIdx = users.findIndex(u => u.email.toLowerCase() === payments[pIdx].email.toLowerCase());
      if (uIdx !== -1) {
        users[uIdx].hasPaid = true;
        users[uIdx].paidAt = new Date().toISOString();
        users[uIdx].paymentId = payments[pIdx].utrId;
        writeJson('users.json', users);
      }
      return res.json({ success: true, message: 'Payment approved and lifetime access unlocked!' });
    } else {
      payments[pIdx].verified = false;
      payments[pIdx].error = 'Rejected by Admin';
      writeJson('payments.json', payments);
      return res.json({ success: true, message: 'Payment submission rejected.' });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Fallback SPA routing
app.get('*', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// Start Server & Initialize Cloud Data Persistence
app.listen(PORT, async () => {
  console.log(`====================================================`);
  console.log(`🚀 TRADING HUB AWS BACKEND RUNNING ON PORT ${PORT}`);
  console.log(`📡 URL: http://localhost:${PORT}`);
  console.log(`⚡ AWS Storage Mode: ${s3 ? 'S3 ACTIVE' : 'HYBRID LOCAL (AWS READY)'}`);
  console.log(`⏱️ Smart Keep-Alive: ACTIVE (8 Hours active window per visitor)`);
  console.log(`🛡️ Permanent Cloud Vault: ACTIVE (Auto-healing users & data across deploys)`);
  console.log(`====================================================`);

  // Initialize and restore cross-deploy data from permanent cloud store
  try {
    await initCloudDataPersistence();
  } catch (e) {
    console.warn('[Cloud Vault] Startup restore notice:', e.message);
  }
});

// Self-Ping Timer: Resets Render's 15-minute inactivity counter for 8 hours
setInterval(async () => {
  const elapsed = Date.now() - lastVisitorTimestamp;
  if (elapsed < KEEP_ALIVE_DURATION_MS) {
    try {
      const pingEndpoint = `${APP_PUBLIC_URL}/api/keepalive`;
      const response = await fetch(pingEndpoint, {
        headers: { 'x-keep-alive': 'internal-ping' }
      });
      const remainingMinutes = Math.round((KEEP_ALIVE_DURATION_MS - elapsed) / (1000 * 60));
      console.log(`[Keep-Alive] Self-ping successful (Status: ${response.status}). Server staying active for ~${remainingMinutes} more minutes.`);
    } catch (err) {
      console.log(`[Keep-Alive] Ping notice: ${err.message}`);
    }
  } else {
    console.log('[Keep-Alive] 8 hours elapsed without new visitors. Server allowing idle sleep to conserve quota.');
  }
}, SELF_PING_INTERVAL_MS);
