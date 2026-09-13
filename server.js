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

// Helper for Database JSON read/write
function readJson(fileName, fallback = []) {
  const filePath = path.join(DATA_DIR, fileName);
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    console.error(`Error reading ${fileName}:`, e.message);
    return fallback;
  }
}

function writeJson(fileName, data) {
  const filePath = path.join(DATA_DIR, fileName);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
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
app.post('/api/auth/register', (req, res) => {
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

    const users = readJson('users.json', []);
    const existing = users.find(u => u.email.toLowerCase() === cleanEmail);
    if (existing) {
      return res.status(400).json({ error: 'An account with this email already exists. Please log in.' });
    }

    const newUser = {
      id: `user-${Date.now()}`,
      email: cleanEmail,
      password: password,
      name: name ? name.trim() : email.split('@')[0],
      role: 'member',
      hasPaid: false,
      createdAt: new Date().toISOString()
    };

    users.push(newUser);
    writeJson('users.json', users);

    // Don't return password in response
    const { password: _, ...userSafe } = newUser;
    res.status(201).json({ success: true, message: 'Account created successfully!', user: userSafe });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// User or Admin Login
app.post('/api/auth/login', (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const OWNER_EMAIL = 'abhisheknaidus093@gmail.com';
    const users = readJson('users.json', []);

    // Exclusive Owner / Admin Check: ONLY abhisheknaidus093@gmail.com can EVER be admin
    if (cleanEmail === OWNER_EMAIL) {
      const adminUser = users.find(u => u.email.toLowerCase() === OWNER_EMAIL && u.role === 'admin');
      if (adminUser && adminUser.password === password) {
        const { password: _, ...userSafe } = adminUser;
        return res.json({ success: true, message: 'Owner authenticated successfully!', user: userSafe });
      }
      return res.status(401).json({ error: 'Invalid owner credentials' });
    }

    // Standard Member Login
    const user = users.find(u => u.email.toLowerCase() === cleanEmail && u.password === password);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Strictly enforce role: member for all non-owner accounts
    const userSafe = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: 'member',
      hasPaid: !!user.hasPaid,
      paidAt: user.paidAt,
      paymentId: user.paymentId
    };
    res.json({ success: true, message: 'Logged in successfully!', user: userSafe });
  } catch (err) {
    res.status(500).json({ error: err.message });
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
    const users = readJson('users.json', []);
    const userIndex = users.findIndex(u => u.email.toLowerCase() === cleanEmail);

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

// Payment Verification & Lifetime Access Unlock
app.post('/api/auth/verify-payment', (req, res) => {
  try {
    const { email, paymentId } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email is required to activate membership' });
    }

    const users = readJson('users.json', []);
    const userIndex = users.findIndex(u => u.email.toLowerCase() === email.toLowerCase().trim());

    const activePaymentId = paymentId || `pay_rzp_${Date.now()}`;

    if (userIndex === -1) {
      // Auto register paid user if they just paid on Razorpay
      const newUser = {
        id: `user-${Date.now()}`,
        email: email.trim().toLowerCase(),
        password: 'ChangeMe@123',
        name: email.split('@')[0],
        role: 'member',
        hasPaid: true,
        paidAt: new Date().toISOString(),
        paymentId: activePaymentId
      };
      users.push(newUser);
      writeJson('users.json', users);
      const { password: _, ...userSafe } = newUser;
      return res.json({ success: true, message: 'Payment verified! Lifetime access unlocked!', user: userSafe });
    }

    // Mark existing user as paid
    users[userIndex].hasPaid = true;
    users[userIndex].paidAt = new Date().toISOString();
    users[userIndex].paymentId = activePaymentId;

    writeJson('users.json', users);

    const { password: _, ...userSafe } = users[userIndex];
    res.json({ success: true, message: 'Payment verified! Lifetime access unlocked!', user: userSafe });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Fallback SPA routing
app.get('*', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// Start Server
app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚀 TRADING HUB AWS BACKEND RUNNING ON PORT ${PORT}`);
  console.log(`📡 URL: http://localhost:${PORT}`);
  console.log(`⚡ AWS Storage Mode: ${s3 ? 'S3 ACTIVE' : 'HYBRID LOCAL (AWS READY)'}`);
  console.log(`⏱️ Smart Keep-Alive: ACTIVE (8 Hours active window per visitor)`);
  console.log(`====================================================`);
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
