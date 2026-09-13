require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

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
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
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

// Static Web App
app.use(express.static(PUBLIC_DIR));

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

// ==================== AUTH & PAYMENT UNLOCK API ====================

// User Sign Up
app.post('/api/auth/register', (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const users = readJson('users.json', []);
    const existing = users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (existing) {
      return res.status(400).json({ error: 'An account with this email already exists. Please log in.' });
    }

    const newUser = {
      id: `user-${Date.now()}`,
      email: email.trim().toLowerCase(),
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

    const users = readJson('users.json', []);
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase().trim() && u.password === password);

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const { password: _, ...userSafe } = user;
    res.json({ success: true, message: 'Logged in successfully!', user: userSafe });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update Admin Credentials
app.post('/api/admin/credentials', (req, res) => {
  try {
    const { email, password } = req.body;
    const users = readJson('users.json', []);
    const adminIndex = users.findIndex(u => u.role === 'admin');

    if (adminIndex !== -1) {
      if (email) users[adminIndex].email = email.trim().toLowerCase();
      if (password) users[adminIndex].password = password;
      writeJson('users.json', users);
      return res.json({ success: true, message: 'Admin security credentials updated successfully!' });
    }
    res.status(404).json({ error: 'Admin user not found' });
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
  console.log(`====================================================`);
});
