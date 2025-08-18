const express = require("express");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const FormData = require("form-data");
const cheerio = require("cheerio");
const cron = require("node-cron");
const sqlite3 = require("sqlite3").verbose();
const puppeteer = require("puppeteer");
const readline = require("readline");
const InstagramCarouselDownloader = require("./instagram-carousel-downloader");

// Add fetch for internal API calls
const fetch = require('node-fetch');

// ===== GLOBAL ERROR HANDLING =====
process.on('uncaughtException', (error) => {
  console.error('🚨 UNCAUGHT EXCEPTION:', error);
  console.error('Stack trace:', error.stack);
  
  // Log to file for debugging
  const errorLog = `[${new Date().toISOString()}] UNCAUGHT EXCEPTION: ${error.message}\n${error.stack}\n\n`;
  fs.appendFileSync(path.join(__dirname, 'error-logs.txt'), errorLog);
  
  // Don't exit immediately - try to recover
  console.log('🔄 Attempting to recover from uncaught exception...');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('🚨 UNHANDLED REJECTION at:', promise, 'reason:', reason);
  
  // Log to file for debugging
  const errorLog = `[${new Date().toISOString()}] UNHANDLED REJECTION: ${reason}\nPromise: ${promise}\n\n`;
  fs.appendFileSync(path.join(__dirname, 'error-logs.txt'), errorLog);
});

// Graceful shutdown handler
process.on('SIGTERM', () => {
  console.log('🛑 Received SIGTERM, shutting down gracefully...');
  cleanupAndExit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 Received SIGINT, shutting down gracefully...');
  cleanupAndExit(0);
});

function cleanupAndExit(code) {
  console.log('🧹 Cleaning up resources...');
  
  // Stop polling
  if (currentPollingTimeout) {
    clearTimeout(currentPollingTimeout);
    currentPollingTimeout = null;
  }
  

  
  // Close database connections
  if (db) {
    db.close((err) => {
      if (err) console.error('Error closing database:', err);
      else console.log('✅ Database connection closed');
      process.exit(code);
    });
  } else {
    process.exit(code);
  }
}

// ===== MEMORY MANAGEMENT =====
const memoryManager = {
  lastCleanup: Date.now(),
  cleanupInterval: 30 * 60 * 1000, // 30 minutes
  
  performCleanup() {
    try {
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
        console.log('🗑️ Garbage collection performed');
      }
      
      // Clear any accumulated caches
      if (global.postCache) {
        const cacheSize = Object.keys(global.postCache).length;
        if (cacheSize > 1000) {
          console.log(`🧹 Clearing large post cache (${cacheSize} entries)`);
          global.postCache = {};
        }
      }
      
      this.lastCleanup = Date.now();
      console.log('✅ Memory cleanup completed');
    } catch (error) {
      console.error('❌ Memory cleanup failed:', error);
    }
  },
  
  start() {
    setInterval(() => {
      this.performCleanup();
    }, this.cleanupInterval);
    console.log('🧠 Memory management system started');
  }
};

// ===== HEALTH CHECK SYSTEM =====
const healthCheck = {
  lastCheck: Date.now(),
  consecutiveFailures: 0,
  maxFailures: 3,
  checkInterval: 5 * 60 * 1000, // 5 minutes
  
  async performCheck() {
    try {
      // Check if polling is still active
      if (pollingStarted && !currentPollingTimeout) {
        console.log('⚠️ Health check: Polling timeout missing, restarting...');
        this.consecutiveFailures++;
        await this.restartPolling();
        return;
      }
      
      // Check database connectivity
      if (db) {
        await new Promise((resolve, reject) => {
          db.get('SELECT 1', (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      }
      
      // Reset failure counter on success
      this.consecutiveFailures = 0;
      this.lastCheck = Date.now();
      console.log('✅ Health check passed');
      
    } catch (error) {
      console.error('❌ Health check failed:', error.message);
      this.consecutiveFailures++;
      
      if (this.consecutiveFailures >= this.maxFailures) {
        console.error('🚨 Too many consecutive health check failures, restarting service...');
        await this.restartService();
      }
    }
  },
  
  async restartPolling() {
    try {
      console.log('🔄 Restarting polling due to health check failure...');
      stopPolling();
      await new Promise(resolve => setTimeout(resolve, 5000));
      startPolling(TARGET_USERNAME);
    } catch (error) {
      console.error('Failed to restart polling:', error);
    }
  },
  
  async restartService() {
    console.log('🔄 Restarting service due to health check failures...');
    // In a production environment, you might want to use PM2 or similar
    // For now, we'll just restart the polling
    await this.restartPolling();
  },
  
  start() {
    setInterval(() => {
      this.performCheck();
    }, this.checkInterval);
    console.log('🏥 Health check system started');
  }
};

// ===== REQUEST TRACKING SYSTEM =====
const requestTracker = {
  stats: {
    instagram: {
      total: 0,
      successful: 0,
      failed: 0,
      rateLimited: 0,
      last24h: 0,
      lastHour: 0
    },
    telegram: {
      total: 0,
      successful: 0,
      failed: 0,
      photos: 0,
      videos: 0,
      last24h: 0,
      lastHour: 0
    },
    startTime: new Date(),
    lastReset: new Date()
  },
  
  // Track Instagram request
  trackInstagram(url, success, error = null) {
    this.stats.instagram.total++;
    this.stats.instagram.last24h++;
    this.stats.instagram.lastHour++;
    
    if (success) {
      this.stats.instagram.successful++;
    } else {
      this.stats.instagram.failed++;
      if (error && (error.includes('429') || error.includes('rate limit'))) {
        this.stats.instagram.rateLimited++;
      }
    }
    
    this.logRequest('Instagram', url, success, error);
  },
  
  // Track Telegram request
  trackTelegram(type, success, error = null) {
    this.stats.telegram.total++;
    this.stats.telegram.last24h++;
    this.stats.telegram.lastHour++;
    
    if (success) {
      this.stats.telegram.successful++;
      if (type === 'photo') this.stats.telegram.photos++;
      if (type === 'video') this.stats.telegram.videos++;
    } else {
      this.stats.telegram.failed++;
    }
    
    this.logRequest('Telegram', type, success, error);
  },
  
  // Log individual request
  logRequest(service, details, success, error) {
    const timestamp = new Date().toISOString();
    const status = success ? '✅' : '❌';
    const logEntry = `${timestamp} ${status} ${service}: ${details}${error ? ` | Error: ${error}` : ''}`;
    
    console.log(logEntry);
    
    // Save to log file
    const logFile = path.join(__dirname, 'request-logs.txt');
    fs.appendFileSync(logFile, logEntry + '\n');
  },
  
  // Get current stats
  getStats() {
    const now = new Date();
    const uptime = now - this.stats.startTime;
    const hoursSinceReset = (now - this.stats.lastReset) / (1000 * 60 * 60);
    
    // Reset hourly counters
    if (hoursSinceReset >= 1) {
      this.stats.instagram.lastHour = 0;
      this.stats.telegram.lastHour = 0;
      this.stats.lastReset = now;
    }
    
    // Reset daily counters
    if (hoursSinceReset >= 24) {
      this.stats.instagram.last24h = 0;
      this.stats.telegram.last24h = 0;
    }
    
    return {
      ...this.stats,
      uptime: {
        seconds: Math.floor(uptime / 1000),
        minutes: Math.floor(uptime / (1000 * 60)),
        hours: Math.floor(uptime / (1000 * 60 * 60)),
        days: Math.floor(uptime / (1000 * 60 * 60 * 24))
      },
      rates: {
        instagramPerHour: this.stats.instagram.lastHour,
        telegramPerHour: this.stats.telegram.lastHour,
        instagramPerDay: this.stats.instagram.last24h,
        telegramPerDay: this.stats.telegram.last24h
      }
    };
  },
  
  // Print detailed stats
  printStats() {
    const stats = this.getStats();
    console.log('\n📊 REQUEST STATISTICS');
    console.log('====================');
    console.log(`⏱️  Uptime: ${stats.uptime.days}d ${stats.uptime.hours}h ${stats.uptime.minutes}m`);
    console.log('\n📱 Instagram Requests:');
    console.log(`   Total: ${stats.instagram.total}`);
    console.log(`   Successful: ${stats.instagram.successful}`);
    console.log(`   Failed: ${stats.instagram.failed}`);
    console.log(`   Rate Limited: ${stats.instagram.rateLimited}`);
    console.log(`   Last Hour: ${stats.rates.instagramPerHour}`);
    console.log(`   Last 24h: ${stats.rates.instagramPerDay}`);
    
    console.log('\n📤 Telegram Requests:');
    console.log(`   Total: ${stats.telegram.total}`);
    console.log(`   Successful: ${stats.telegram.successful}`);
    console.log(`   Failed: ${stats.telegram.failed}`);
    console.log(`   Photos: ${stats.telegram.photos}`);
    console.log(`   Videos: ${stats.telegram.videos}`);
    console.log(`   Last Hour: ${stats.rates.telegramPerHour}`);
    console.log(`   Last 24h: ${stats.rates.telegramPerDay}`);
    console.log('====================\n');
  },
  
  // Reset all stats
  resetStats() {
    this.stats = {
      instagram: { total: 0, successful: 0, failed: 0, rateLimited: 0, last24h: 0, lastHour: 0 },
      telegram: { total: 0, successful: 0, failed: 0, photos: 0, videos: 0, last24h: 0, lastHour: 0 },
      startTime: new Date(),
      lastReset: new Date()
    };
    console.log('🔄 Request statistics reset');
  }
};

// Create axios interceptor to automatically track requests
const originalAxiosGet = axios.get;
const originalAxiosPost = axios.post;

// Intercept Instagram requests
axios.get = function(...args) {
  const url = args[0];
  if (typeof url === 'string' && (url.includes('instagram.com') || url.includes('cdninstagram.com'))) {
    return originalAxiosGet.apply(this, args)
      .then(response => {
        requestTracker.trackInstagram(url, true);
        return response;
      })
      .catch(error => {
        const errorMsg = error.response?.status?.toString() || error.message;
        requestTracker.trackInstagram(url, false, errorMsg);
        throw error;
      });
  }
  return originalAxiosGet.apply(this, args);
};

axios.post = function(...args) {
  const url = args[0];
  if (typeof url === 'string') {
    if (url.includes('instagram.com')) {
      return originalAxiosPost.apply(this, args)
        .then(response => {
          requestTracker.trackInstagram(url, true);
          return response;
        })
        .catch(error => {
          const errorMsg = error.response?.status?.toString() || error.message;
          requestTracker.trackInstagram(url, false, errorMsg);
          throw error;
        });
    } else if (url.includes('api.telegram.org')) {
      const type = url.includes('sendPhoto') ? 'photo' : url.includes('sendVideo') ? 'video' : 'message';
      return originalAxiosPost.apply(this, args)
        .then(response => {
          requestTracker.trackTelegram(type, true);
          return response;
        })
        .catch(error => {
          const errorMsg = error.response?.status?.toString() || error.message;
          requestTracker.trackTelegram(type, false, errorMsg);
          throw error;
        });
    }
  }
  return originalAxiosPost.apply(this, args);
};

// Load environment variables (robust: prefer .env.local, detect corrupted .env)
(function loadEnv() {
  const candidates = ['.env.local', '.env'];
  for (const name of candidates) {
    const candidatePath = path.resolve(__dirname, name);
    if (fs.existsSync(candidatePath)) {
      try {
        const buf = fs.readFileSync(candidatePath);
        const isBinary = buf.includes(0);
        if (isBinary) {
          console.log(`⚠️ Skipping ${name}: appears to be binary/corrupted. Please recreate it as UTF-8 text.`);
          continue;
        }
        require('dotenv').config({ path: candidatePath, override: true });
        console.log(`✅ Loaded environment from ${name}`);
        return;
      } catch (err) {
        console.log(`⚠️ Could not load ${name}: ${err.message}`);
      }
    }
  }
  // Fallback to default loading if needed
  require('dotenv').config();
})();

const app = express();
const snapsave = require("./snapsave-downloader/src/index");
// Enhanced downloader logic is now integrated directly into getInstagramStoriesViaWeb
const port = process.env.PORT || 3000;

// Middleware to parse JSON bodies
app.use(express.json());

// CORS configuration - allow all origins for now
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Telegram configuration
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID;

// Instagram polling configuration
let TARGET_USERNAME = null; // Will be set via console prompt or API
const POLLING_ENABLED = true;
let currentPollingTimeout = null; // Track current polling timeout for restart
let pollingStarted = false; // Track if polling has been started

// Database setup for tracking posts
const db = new sqlite3.Database('./instagram_tracker.db');

// Initialize database
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS processed_posts (
    id TEXT PRIMARY KEY,
    username TEXT,
    post_url TEXT,
    post_type TEXT,
    is_pinned BOOLEAN DEFAULT FALSE,
    pinned_at DATETIME,
    processed_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  
  // Add is_pinned column if it doesn't exist (for existing databases)
  db.run(`ALTER TABLE processed_posts ADD COLUMN is_pinned BOOLEAN DEFAULT FALSE`, function(err) {
    if (err && !err.message.includes('duplicate column name')) {
      console.log(`⚠️ Schema update warning: ${err.message}`);
    }
  });
  db.run(`ALTER TABLE processed_posts ADD COLUMN pinned_at DATETIME`, function(err) {
    if (err && !err.message.includes('duplicate column name')) {
      console.log(`⚠️ Schema update warning: ${err.message}`);
    }
  });
  
  // Cache for recent posts (pinned + recent, max 8 per user)
  db.run(`CREATE TABLE IF NOT EXISTS recent_posts_cache (
    username TEXT,
    post_url TEXT,
    shortcode TEXT,
    is_pinned BOOLEAN DEFAULT FALSE,
    post_order INTEGER,
    cached_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (username, shortcode)
  )`);
  
  // Cache cleanup tracking
  db.run(`CREATE TABLE IF NOT EXISTS cache_cleanup_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cleaned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    posts_removed INTEGER,
    username TEXT
  )`);
  
  // Stories tracking tables
  db.run(`CREATE TABLE IF NOT EXISTS processed_stories (
    id TEXT PRIMARY KEY,
    username TEXT,
    story_url TEXT,
    story_type TEXT,
    story_id TEXT,
    processed_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS recent_stories_cache (
    username TEXT,
    story_url TEXT,
    story_id TEXT,
    story_type TEXT,
    cached_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (username, story_id)
  )`);
});

// User-Agent rotation for bot evasion
const userAgents = [
  // Chrome (Desktop)
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  
  // Firefox (Desktop)
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0',
  
  // Edge (Desktop)
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
  
  // Safari (Desktop)
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'
];

// Get random User-Agent
function getRandomUserAgent() {
  return userAgents[Math.floor(Math.random() * userAgents.length)];
}

// Smart delay function with exponential backoff support
let errorMultiplier = 1; // Global error multiplier for adaptive delays

function smartDelay(min = 1000, max = 4000, multiplier = 1) {
  const adjustedMin = Math.floor(min * multiplier * errorMultiplier);
  const adjustedMax = Math.floor(max * multiplier * errorMultiplier);
  const delay = Math.floor(Math.random() * (adjustedMax - adjustedMin + 1)) + adjustedMin;
  
  // Log delay for debugging (only if significantly different from base)
  if (multiplier > 1 || errorMultiplier > 1) {
    console.log(`⏱️ Smart delay: ${delay}ms (base: ${min}-${max}ms, multiplier: ${multiplier}, errorMultiplier: ${errorMultiplier.toFixed(1)})`);
  }
  
  return new Promise(resolve => setTimeout(resolve, delay));
}

// Enhanced random delay with error adaptation
function randomDelay(min = 2000, max = 8000) {
  return smartDelay(min, max, 1);
}

// Rate limit delay (long delay for rate limit errors)
function rateLimitDelay() {
  const delay = Math.floor(Math.random() * (45000 - 30000 + 1)) + 30000; // 30-45 seconds
  console.log(`🚫 Rate limit detected, waiting ${delay}ms before retry`);
  errorMultiplier = Math.min(errorMultiplier * 2, 10); // Aggressive backoff
  return new Promise(resolve => setTimeout(resolve, delay));
}

// Error-based delay increase
function increaseErrorMultiplier() {
  errorMultiplier = Math.min(errorMultiplier * 1.5, 5); // Cap at 5x
  console.log(`⚠️ Error detected, increasing delay multiplier to ${errorMultiplier.toFixed(1)}`);
}

// Success-based delay decrease
function decreaseErrorMultiplier() {
  errorMultiplier = Math.max(errorMultiplier * 0.9, 1); // Gradually return to normal
  if (errorMultiplier < 1.1) {
    errorMultiplier = 1; // Reset to normal
  }
}



// Exponential backoff for rate limiting
function getBackoffDelay(attempt = 1, baseDelay = 60000) {
  const maxDelay = 300000; // 5 minutes max
  const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
  return delay + Math.random() * 30000; // Add up to 30 seconds randomness
}

// Parse and validate Instagram username/URL
function parseInstagramTarget(input) {
  if (!input || typeof input !== 'string') {
    throw new Error('Invalid input: username or URL required');
  }
  
  const trimmedInput = input.trim();
  
  // Remove @ if present
  let username = trimmedInput.replace(/^@/, '');
  
  // If it's a URL, extract username
  const urlPatterns = [
    /^https?:\/\/(www\.)?instagram\.com\/([^\/\?#]+)/i,
    /^instagram\.com\/([^\/\?#]+)/i,
    /^www\.instagram\.com\/([^\/\?#]+)/i
  ];
  
  for (const pattern of urlPatterns) {
    const match = username.match(pattern);
    if (match) {
      username = match[2]; // Extract username from URL
      break;
    }
  }
  
  // Remove trailing slashes and query parameters
  username = username.replace(/[\/\?#].*$/, '');
  
  // Validate username format (Instagram usernames: 1-30 chars, alphanumeric + underscores/periods)
  const usernamePattern = /^[a-zA-Z0-9._]{1,30}$/;
  if (!usernamePattern.test(username)) {
    throw new Error('Invalid Instagram username format');
  }
  
  // Remove leading/trailing periods (not allowed in Instagram usernames)
  if (username.startsWith('.') || username.endsWith('.')) {
    throw new Error('Instagram usernames cannot start or end with periods');
  }
  
  return username.toLowerCase();
}

// Interactive target selection
async function promptForTarget() {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    console.log('\n🎯 Instagram Auto-Tracker Setup');
    console.log('=====================================');
    
    rl.question('Enter Instagram username to track (e.g., instagram): ', (input) => {
      rl.close();
      
      if (!input.trim()) {
        console.log('❌ No username provided. Exiting...');
        process.exit(1);
      }
      
      try {
        const username = parseInstagramTarget(input.trim());
        resolve(username);
      } catch (error) {
        console.log(`❌ Invalid username: ${error.message}`);
        console.log('Please restart and try again.');
        process.exit(1);
      }
    });
  });
}

// Start polling for the selected target
function startPolling(username) {
  if (pollingStarted) {
    console.log('⚠️ Polling already started');
    return;
  }
  
  TARGET_USERNAME = username;
  pollingStarted = true;
  
  console.log(`🚀 Instagram polling started for @${TARGET_USERNAME}`);
  console.log('📍 Manual poll: GET /poll-now');
  console.log('🌐 Frontend available: http://localhost:' + port);
  
  // Start health check system
  healthCheck.start();
  
  // Start memory management system
  memoryManager.start();
  
  // Start first poll after 10 seconds
  setTimeout(async () => {
    try {
      // Check for new stories first, then posts
      await checkForNewStories();
      await checkForNewPosts();
      
      scheduleNextPoll();
    } catch (error) {
      console.error('❌ Initial poll failed:', error);
      // Retry after 30 seconds
      setTimeout(async () => {
        try {
          await checkForNewStories();
          await checkForNewPosts();
          scheduleNextPoll();
        } catch (retryError) {
          console.error('❌ Retry poll failed:', retryError);
          // Don't exit, just log and continue
        }
      }, 30000);
    }
  }, 10000);
}

// Debug: Log configuration on startup
const DEBUG_LOG = false;

// Function to send photo to Telegram (prefer direct URL; fallback to download/upload)
async function sendPhotoToTelegram(photoUrl, caption = '') {
  let tempFilePath = null;
  
  try {
    // Ensure Telegram configuration is present before attempting any API calls
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHANNEL_ID) {
      throw new Error('Telegram configuration missing');
    }

    // Validate Telegram configuration
    console.log('🔧 Telegram Config Check:');
    console.log(`   Bot Token: ${TELEGRAM_BOT_TOKEN ? '✅ Set' : '❌ Missing'}`);
    console.log(`   Channel ID: ${TELEGRAM_CHANNEL_ID} (${typeof TELEGRAM_CHANNEL_ID})`);
    
    // Validate channel ID format
    if (typeof TELEGRAM_CHANNEL_ID === 'string' && !TELEGRAM_CHANNEL_ID.startsWith('-')) {
      console.log('⚠️ Warning: Channel ID should be negative for channels/groups');
    }

    // Validate photo URL
    if (!photoUrl || !photoUrl.startsWith('http')) {
      throw new Error(`Invalid photo URL: ${photoUrl}`);
    }
    
    console.log('📸 Downloading and sending photo to Telegram...');
    console.log('📸 Photo URL:', photoUrl);
    
    // Fast path: if this is a public CDN (instagram) URL, send it directly to Telegram
    try {
      if (photoUrl.includes('cdninstagram.com') || photoUrl.includes('scontent-')) {
        const directResp = await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`, {
          chat_id: TELEGRAM_CHANNEL_ID,
          photo: photoUrl,
          caption: caption || 'New Instagram photo',
          parse_mode: 'HTML'
        }, { timeout: 30000 });
        if (directResp.data?.ok) {
          console.log('✅ Photo sent to Telegram via direct URL');
          requestTracker.trackTelegram('photo', true);
          return { success: true, messageId: directResp.data.result.message_id, method: 'direct_url' };
        }
      }
    } catch (directErr) {
      console.log('⚠️ Direct URL send failed, falling back to download/upload:', directErr.response?.data?.description || directErr.message);
      requestTracker.trackTelegram('photo', false, directErr.message);
    }
    
    // Create temp filename
    const timestamp = Date.now();
    tempFilePath = path.join(__dirname, `temp_photo_${timestamp}.jpg`);
    
    // Download the photo
    const response = await axios({
      method: 'get',
      url: photoUrl,
      responseType: 'stream',
      headers: {
        'User-Agent': getRandomUserAgent(),
        'Accept': 'image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Sec-Fetch-Dest': 'image',
        'Sec-Fetch-Mode': 'no-cors',
        'Sec-Fetch-Site': 'cross-site'
      }
    });
    
    // Save to temp file
    const writer = fs.createWriteStream(tempFilePath);
    response.data.pipe(writer);
    
    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });
    
    console.log('📁 Photo downloaded to temp file');
    
    // Upload to Telegram (fallback)
    const form = new FormData();
    form.append('chat_id', TELEGRAM_CHANNEL_ID);
    form.append('photo', fs.createReadStream(tempFilePath), 'photo.jpg');
    form.append('caption', caption || 'New Instagram photo');
    form.append('parse_mode', 'HTML');
    
    const telegramResponse = await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`, form, {
      headers: { ...form.getHeaders() },
      timeout: 30000
    });
    
    if (telegramResponse.data.ok) {
      console.log('✅ Photo sent successfully to Telegram');
      requestTracker.trackTelegram('photo', true);
      return { success: true, messageId: telegramResponse.data.result.message_id };
    } else {
      const error = `Telegram API error: ${telegramResponse.data.description}`;
      requestTracker.trackTelegram('photo', false, error);
      throw new Error(error);
    }

  } catch (error) {
    console.error('❌ Failed to send photo to Telegram:');
    console.error('Error message:', error.message);
    console.error('Error response:', error.response?.data);
    console.error('Error status:', error.response?.status);
    console.error('Photo URL attempted:', photoUrl);
    
    // Enhanced error diagnostics
    if (error.response?.data?.description === 'Bad Request: chat not found') {
      console.error('🔧 Troubleshooting:');
      console.error('   - Check if TELEGRAM_CHANNEL_ID is correct');
      console.error('   - Verify the bot is added to the channel/chat');
      console.error('   - Channel IDs should be negative (e.g., -1001234567890)');
      console.error('   - Run: node test-telegram.js to verify connection');
    }
    
    requestTracker.trackTelegram('photo', false, error.message);
    throw error;
  } finally {
    // Clean up temp file
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
        console.log('🗑️ Temp photo file cleaned up');
      } catch (cleanupError) {
        console.log('⚠️ Could not delete temp photo file:', cleanupError.message);
      }
    }
  }
}

// Function to send media group (carousel) to Telegram
async function sendMediaGroupToTelegram(mediaItems, caption = '') {
  try {
    // Ensure Telegram configuration is present before attempting any API calls
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHANNEL_ID) {
      throw new Error('Telegram configuration missing');
    }

    const totalItems = mediaItems.length;
    console.log(`🎠 Sending media group to Telegram (${totalItems} items)`);
    
    const telegramUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMediaGroup`;
    const results = [];
    
    // Split into chunks of 10 (Telegram's limit)
    const chunks = [];
    for (let i = 0; i < mediaItems.length; i += 10) {
      chunks.push(mediaItems.slice(i, i + 10));
    }
    
    console.log(`📦 Splitting into ${chunks.length} media group(s)`);
    
    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
      const chunk = chunks[chunkIndex];
      const isFirstChunk = chunkIndex === 0;
      const isLastChunk = chunkIndex === chunks.length - 1;
      
      // Prepare media array for this chunk
      const media = chunk.map((item, index) => {
        const mediaObject = {
          type: item.is_video ? 'video' : 'photo',
          media: item.url
        };
        
        // Add caption to first item of first chunk
        if (isFirstChunk && index === 0 && caption) {
          if (chunks.length > 1) {
            // Multiple groups - indicate continuation
            mediaObject.caption = `${caption}\n\n📸 Part 1 of ${chunks.length}`;
          } else {
            // Single group - normal caption
            mediaObject.caption = caption;
          }
          mediaObject.parse_mode = 'HTML';
        }
        
        // Add continuation caption to first item of subsequent chunks
        if (!isFirstChunk && index === 0) {
          mediaObject.caption = `📸 Part ${chunkIndex + 1} of ${chunks.length}`;
          mediaObject.parse_mode = 'HTML';
        }
        
        return mediaObject;
      });

      console.log(`📤 Sending part ${chunkIndex + 1}/${chunks.length} (${chunk.length} items)`);

      const response = await axios.post(telegramUrl, {
        chat_id: TELEGRAM_CHANNEL_ID,
        media: media
      });

      if (response.data.ok) {
        const messageIds = response.data.result.map(msg => msg.message_id);
        results.push(...messageIds);
        console.log(`✅ Part ${chunkIndex + 1} sent successfully`);
        
        // Add delay between chunks to avoid rate limiting
        if (!isLastChunk) {
          await randomDelay(1000, 3000);
        }
      } else {
        throw new Error(`Telegram API error for chunk ${chunkIndex + 1}: ${response.data.description}`);
      }
    }

    console.log(`✅ All ${chunks.length} media group(s) sent successfully (${totalItems} total items)`);
    return { success: true, messageIds: results, totalChunks: chunks.length };

  } catch (error) {
    console.error('❌ Failed to send media group to Telegram:', error.message);
    throw error;
  }
}

// Function to send video to Telegram (supports both direct URLs and file uploads)
async function sendVideoToTelegram(videoUrl, caption = '') {
  let tempFilePath = null;
  
  try {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHANNEL_ID) {
      throw new Error('Telegram configuration missing');
    }

    // Check if this is a direct Instagram CDN URL (GraphQL) or needs download (snapsave)
    const isDirectInstagramUrl = videoUrl.includes('scontent-') && videoUrl.includes('cdninstagram.com');
    
    if (isDirectInstagramUrl) {
      // Direct Instagram CDN URL - send directly to Telegram
      console.log('📤 Sending direct Instagram CDN URL to Telegram...');
      
      const telegramApiUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendVideo`;
      
      const response = await axios.post(telegramApiUrl, {
        chat_id: TELEGRAM_CHANNEL_ID,
        video: videoUrl,
        caption: caption || `🎬 Instagram Video\n\nDownloaded via Tyla IG Kapturez`,
        parse_mode: 'HTML',
        supports_streaming: true
      }, {
        timeout: 30000
      });
      
      if (response.data.ok) {
        console.log('✅ Video sent to Telegram successfully via direct URL!');
        requestTracker.trackTelegram('video', true);
        return {
          success: true,
          message_id: response.data.result.message_id,
          chat_id: response.data.result.chat.id,
          method: 'direct_url'
        };
      } else {
        const error = response.data.description || 'Failed to send to Telegram';
        requestTracker.trackTelegram('video', false, error);
        throw new Error(error);
      }
      
    } else {
      // Snapsave or other URL - download and upload file
      console.log('📥 Downloading video from URL for Telegram upload...');
      
      // Step 1: Download the video
      const videoResponse = await axios({
        method: 'GET',
        url: videoUrl,
        responseType: 'stream',
        timeout: 60000, // 60 second timeout for download
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });

      // Create temp directory if it doesn't exist
      const tempDir = path.join(__dirname, 'temp');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      // Step 2: Save video to temporary file
      const fileName = `video_${Date.now()}.mp4`;
      tempFilePath = path.join(tempDir, fileName);
      
      const writer = fs.createWriteStream(tempFilePath);
      videoResponse.data.pipe(writer);

      // Wait for download to complete
      await new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
      });

      console.log(`📁 Video downloaded to: ${tempFilePath}`);
      
      // Check file size (Telegram limit is 50MB)
      const stats = fs.statSync(tempFilePath);
      const fileSizeInMB = stats.size / (1024 * 1024);
      
      console.log(`📊 File size: ${fileSizeInMB.toFixed(2)} MB`);
      
      if (fileSizeInMB > 50) {
        throw new Error(`Video file too large: ${fileSizeInMB.toFixed(2)}MB (max 50MB)`);
      }

      // Step 3: Upload to Telegram
      console.log('📤 Uploading video file to Telegram...');
      
      const telegramApiUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendVideo`;
      
      const form = new FormData();
      form.append('chat_id', TELEGRAM_CHANNEL_ID);
      form.append('video', fs.createReadStream(tempFilePath), {
        filename: fileName,
        contentType: 'video/mp4'
      });
      form.append('caption', caption || `🎬 New Instagram Video\n\nDownloaded via Tyla IG Kapturez`);
      form.append('parse_mode', 'HTML');
      form.append('supports_streaming', 'true');

      const response = await axios.post(telegramApiUrl, form, {
        headers: {
          ...form.getHeaders()
        },
        timeout: 120000, // 2 minute timeout for upload
        maxContentLength: Infinity,
        maxBodyLength: Infinity
      });
      
      if (response.data.ok) {
        console.log('✅ Video uploaded to Telegram successfully via file upload!');
        requestTracker.trackTelegram('video', true);
        return {
          success: true,
          message_id: response.data.result.message_id,
          chat_id: response.data.result.chat.id,
          file_size_mb: fileSizeInMB.toFixed(2),
          method: 'file_upload'
        };
      } else {
        const error = response.data.description || 'Failed to send to Telegram';
        requestTracker.trackTelegram('video', false, error);
        throw new Error(error);
      }
    }

  } catch (error) {
    console.error('❌ Video upload error:', {
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      message: error.message
    });
    requestTracker.trackTelegram('video', false, error.message);
    throw error;
  } finally {
    // Clean up: delete temporary file
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
        console.log('Temporary file cleaned up');
      } catch (cleanupError) {
        console.error('Failed to cleanup temp file:', cleanupError.message);
      }
    }
  }
}













// Human-like browser automation with carousel interaction
async function scrapeInstagramBrowser(username) {
  let browser = null;
  
  try {
    console.log(`🤖 Starting human-like browser automation for @${username}`);
    
    browser = await puppeteer.launch({
      headless: "new",
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ]
    });
    
    const page = await browser.newPage();
    
    // Set random user agent for human-like behavior
    const userAgent = getRandomUserAgent();
    await page.setUserAgent(userAgent);
    console.log(`🤖 Using user agent: ${userAgent.substring(0, 50)}...`);
    
    // Set viewport to realistic size
    await page.setViewport({ width: 1200, height: 800 });
    
    // Human-like delay before navigation
    await humanDelay();
    
    console.log(`📱 Navigating to Instagram profile...`);
    
    // Navigate to profile with retries
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await page.goto(`https://www.instagram.com/${username}/`, {
          waitUntil: 'domcontentloaded',
          timeout: 10000
        });
        break;
      } catch (e) {
        if (attempt === 3) throw e;
        console.log(`Retrying profile load (${attempt}/3)...`);
        await humanDelay(800, 1500);
      }
    }
    
    // Wait for page to fully load
    await humanDelay(1000, 3000); // Wider range for unpredictability
    
    // Collect post URLs using GraphQL API (simplified approach)
    const postUrls = await (async () => {
      try {
        console.log(`🔍 Using GraphQL API to collect posts for @${username}`);
        
        // Use GraphQL API to get recent posts
        const graphqlUrl = new URL("https://www.instagram.com/api/graphql");
        graphqlUrl.searchParams.set("variables", JSON.stringify({ 
          username: username,
          first: 10 // Get last 10 posts
        }));
        graphqlUrl.searchParams.set("doc_id", "10015901848480474");
        graphqlUrl.searchParams.set("lsd", "AVqbxe3J_YA");
        
        // Add additional headers for better compatibility
        const additionalHeaders = {
          'Accept': 'application/json',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
          'Sec-Fetch-Dest': 'empty',
          'Sec-Fetch-Mode': 'cors',
          'Sec-Fetch-Site': 'same-origin'
        };

        const response = await page.evaluate(async (url, agent, headers) => {
          try {
            const resp = await fetch(url, {
              headers: {
                'User-Agent': agent,
                'X-IG-App-ID': '936619743392459',
                'X-FB-LSD': 'AVqbxe3J_YA',
                'X-ASBD-ID': '129477',
                ...headers
              }
            });
            
            // Check for rate limit
            if (resp.status === 429) {
              console.log('🚫 Rate limit detected in GraphQL API');
              return { error: 'rate_limit', status: 429 };
            }
            
            return await resp.json();
          } catch (error) {
            console.log(`GraphQL API failed: ${error.message}`);
            return null;
          }
        }, graphqlUrl.toString(), userAgent, additionalHeaders);

        if (response && response.error === 'rate_limit') {
          console.log('🚫 Rate limit detected, waiting before retry...');
          await rateLimitDelay();
          increaseErrorMultiplier();
          return []; // Return empty array to trigger fallback
        } else if (response && response.data?.user?.edge_owner_to_timeline_media?.edges) {
          const edges = response.data.user.edge_owner_to_timeline_media.edges;
          const urls = edges.map(edge => {
            const shortcode = edge?.node?.shortcode;
            return shortcode ? `https://www.instagram.com/p/${shortcode}/` : null;
          }).filter(Boolean);
          
          console.log(`✅ GraphQL API collected ${urls.length} posts`);
          decreaseErrorMultiplier(); // Success - decrease error multiplier
          return urls.slice(0, 5); // Limit to last 5 posts
        } else {
          // Debug: Log the response structure to understand what we're getting
          console.log(`⚠️ GraphQL API returned no posts, response structure:`, {
            hasResponse: !!response,
            hasData: !!response?.data,
            hasUser: !!response?.data?.user,
            hasEdges: !!response?.data?.user?.edge_owner_to_timeline_media?.edges,
            responseKeys: response ? Object.keys(response) : 'no response',
            dataKeys: response?.data ? Object.keys(response.data) : 'no data',
            userKeys: response?.data?.user ? Object.keys(response.data.user) : 'no user'
          });
          console.log(`⚠️ GraphQL API returned no posts, using browser fallback`);
          return [];
        }
      } catch (error) {
        console.log(`❌ GraphQL collection failed: ${error.message}`);
        return [];
      }
    })();
    console.log(`📱 Found ${postUrls.length} posts to analyze`);
    
    const posts = [];
    
    // Process each post (limit to last 5 posts for efficiency)
    for (let i = 0; i < Math.min(postUrls.length, 5); i++) {
      try {
        // Progress update for each post since we're only processing 5
        console.log(`🔍 Processing post ${i + 1}/${Math.min(postUrls.length, 5)} (${Math.round(((i + 1) / Math.min(postUrls.length, 5)) * 100)}% complete)`);
        
        // Get the post URL
        const postUrl = postUrls[i];
        const shortcodeMatch = postUrl.match(/\/(p|reel|tv)\/([^\/]+)\//);
        
        if (!shortcodeMatch) continue;
        
        const shortcode = shortcodeMatch[2];
        
        // Open post in a fresh tab to avoid stale handles and page state
        const postPage = await browser.newPage();
        // Use a mobile user agent for post pages to get simpler markup/meta tags
        await postPage.setUserAgent(
          'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15A372 Safari/604.1'
        );
        await postPage.setViewport({ width: 1200, height: 800 });
        await humanDelay(300, 600);
        await postPage.setExtraHTTPHeaders({
          'Referer': 'https://www.instagram.com/',
          'Accept-Language': 'en-US,en;q=0.9'
        });
        await postPage.goto(postUrl, { waitUntil: 'networkidle2', timeout: 5000 });
        await humanDelay(500, 2000); // Wider range for unpredictability
        
        // Extract content from the post page
        const postData = await extractPostFromPostPage(postPage, shortcode, postUrl);
        
        if (postData) {
          posts.push(postData);
          console.log(`✅ Extracted ${postData.is_carousel ? 'carousel' : postData.is_video ? 'video' : 'photo'}: ${shortcode}`);
        } else {
          console.log(`⚠️ Could not extract content from post: ${shortcode}`);
        }
        
        // Close the post tab and return
        await humanDelay(200, 400);
        await postPage.close();
        await humanDelay(300, 600);
        
      } catch (error) {
        console.log(`⚠️ Error processing post ${i + 1}: ${error.message}`);
        // Try to close any open modals
        await page.keyboard.press('Escape');
        await humanDelay(500, 1000);
      }
    }
    
    console.log(`🤖 Human-like automation found ${posts.length} posts`);
    
    // Close browser
    await browser.close();
    
    return posts;
    
  } catch (error) {
    console.error(`🤖 Browser automation error: ${error.message}`);
    
    if (browser) {
      try {
        await browser.close();
      } catch (closeError) {
        console.error(`Browser close error: ${closeError.message}`);
      }
    }
    
    throw error;
  }
}

// Human-like delay function with smart adaptation
async function humanDelay(min = 200, max = 1500) {
  await smartDelay(min, max, 0.5); // Shorter delays for human-like interactions
}

// Extract content from an opened post modal
async function extractPostContent(page, shortcode, postUrl) {
  try {
    // Wait for modal content to load with multiple possible selectors
    await Promise.race([
      page.waitForSelector('[role="dialog"]', { timeout: 8000 }),
      page.waitForSelector('article', { timeout: 8000 }),
      page.waitForSelector('img[style*="object-fit"]', { timeout: 8000 })
    ]);
    
    const carouselItems = [];
    let isCarousel = false;
    let isVideo = false;
    let mainDisplayUrl = '';
    let caption = '';
    
    // Check if this is a carousel by looking for navigation arrows
    const nextButton = await page.$('[aria-label*="Next"], [aria-label="Next"], button[aria-label*="next" i]');
    isCarousel = !!nextButton;
    
    if (isCarousel) {
      console.log(`🎠 Detected carousel, extracting all items...`);
      
      let currentSlide = 0;
      let hasMore = true;
      
      while (hasMore && currentSlide < 20) { // Safety limit
        // Debug: List all available elements in modal
        const debugInfo = await page.evaluate(() => {
          const modal = document.querySelector('[role="dialog"]');
          if (!modal) return 'No modal found';
          
          const videos = modal.querySelectorAll('video');
          const images = modal.querySelectorAll('img');
          
          return {
            videos: videos.length,
            images: images.length,
            imageUrls: Array.from(images).map(img => ({
              src: img.src,
              width: img.naturalWidth,
              height: img.naturalHeight,
              size: `${img.naturalWidth}x${img.naturalHeight}`
            })).slice(0, 5) // First 5 for brevity
          };
        });
        
        if (currentSlide === 0) {
          console.log(`🔍 Modal debug info:`, debugInfo);
        }
        
        // Extract current slide content
        const slideContent = await page.evaluate(() => {
          const modal = document.querySelector('[role="dialog"]');
          if (!modal) return null;
          
          // Look for video first
          const video = modal.querySelector('video');
          if (video && video.src) {
            return {
              url: video.src,
              is_video: true,
              video_url: video.src
            };
          }
          
          // Look for the main post image (exclude profile pics and small images)
          const images = modal.querySelectorAll('img');
          let bestImg = null;
          
          for (const img of images) {
            // Skip profile pictures and small images
            if (img.src && 
                img.src.includes('scontent') && 
                !img.src.includes('s150x150') && 
                !img.src.includes('s320x320') &&
                !img.src.includes('profile_pic') &&
                img.naturalWidth > 300 &&
                img.naturalHeight > 300) {
              bestImg = img;
              break;
            }
          }
          
          if (bestImg) {
            return {
              url: bestImg.src,
              is_video: false,
              video_url: null
            };
          }
          
          return null;
        });
        
        if (slideContent && slideContent.url) {
          carouselItems.push(slideContent);
          console.log(`  📸 Slide ${currentSlide + 1}: ${slideContent.is_video ? 'Video' : 'Photo'}`);
        }
        
        // Try to click next arrow
        const nextBtn = await page.$('[aria-label*="Next"], [aria-label="Next"], button[aria-label*="next" i]');
        if (nextBtn) {
          await humanDelay(800, 1500);
          await nextBtn.click();
          await humanDelay(800, 2500); // Wait for slide transition - wider range
        } else {
          hasMore = false;
        }
        
        currentSlide++;
      }
      
      // Set main display from first item
      if (carouselItems.length > 0) {
        mainDisplayUrl = carouselItems[0].url;
        isVideo = carouselItems[0].is_video;
      }
      
    } else {
      // Single post - extract the main content with comprehensive debugging
      const content = await page.evaluate(() => {
        const modal = document.querySelector('[role="dialog"]');
        if (!modal) return { debug: 'No modal found', content: null };
        
        // Debug: List ALL content in modal
        const videos = modal.querySelectorAll('video');
        const images = modal.querySelectorAll('img');
        
        const debugInfo = {
          videos: Array.from(videos).map(v => ({
            src: v.src,
            poster: v.getAttribute('poster'),
            hasSource: !!v.src
          })),
          images: Array.from(images).map(img => ({
            src: img.src,
            width: img.naturalWidth,
            height: img.naturalHeight,
            classes: img.className,
            alt: img.alt
          }))
        };
        
        // Look for video first
        const video = modal.querySelector('video');
        if (video && video.src) {
          return {
            debug: debugInfo,
            content: {
              url: video.src,
              is_video: true,
              video_url: video.src
            }
          };
        }
        
        // Try to find ANY reasonable image
        const images_all = modal.querySelectorAll('img');
        let bestImg = null;
        
        // Try different strategies to find the main image
        for (const img of images_all) {
          if (img.src && img.src.includes('scontent')) {
            // Skip obvious profile pics but be less strict
            if (!img.src.includes('s150x150') && 
                img.naturalWidth > 200 && 
                img.naturalHeight > 200) {
              bestImg = img;
              break;
            }
          }
        }
        
        // If still no image, try even broader search
        if (!bestImg) {
          for (const img of images_all) {
            if (img.src && img.src.startsWith('http') && 
                img.naturalWidth > 100 && img.naturalHeight > 100) {
              bestImg = img;
              break;
            }
          }
        }
        
        return {
          debug: debugInfo,
          content: bestImg ? {
            url: bestImg.src,
            is_video: false,
            video_url: null
          } : null
        };
      });
      
      // Log debug info for single posts
      console.log(`📋 Single post debug for ${shortcode}:`, JSON.stringify(content.debug, null, 2));
      
      if (content && content.content) {
        mainDisplayUrl = content.content.url;
        isVideo = content.content.is_video;
      }
    }
    
    // Extract caption
    try {
      caption = await page.evaluate(() => {
        const modal = document.querySelector('[role="dialog"]');
        if (!modal) return '';
        
        // Look for caption text in various possible locations
        const captionSelectors = [
          'span[dir="auto"]',
          '[data-testid="post-caption"]',
          'article span',
          'div[style*="word-wrap"] span'
        ];
        
        for (const selector of captionSelectors) {
          const element = modal.querySelector(selector);
          if (element && element.textContent && element.textContent.length > 10) {
            return element.textContent.trim();
          }
        }
        return '';
      });
    } catch (captionError) {
      console.log('Could not extract caption');
    }
    
    console.log(`🔍 Post extraction complete: ${shortcode}`);
    console.log(`  - Type: ${isCarousel ? 'carousel' : isVideo ? 'video' : 'photo'}`);
    console.log(`  - Display URL: ${mainDisplayUrl || 'NONE'}`);
    console.log(`  - Carousel items: ${carouselItems.length}`);
    
    return {
      id: shortcode,
      shortcode: shortcode,
      url: postUrl,
      is_video: isVideo,
      is_carousel: isCarousel,
      display_url: mainDisplayUrl,
      video_url: isVideo ? mainDisplayUrl : null,
      carousel_items: carouselItems,
      timestamp: Date.now() / 1000,
      caption: caption
    };
    
  } catch (error) {
    console.error(`Error extracting post content: ${error.message}`);
    return null;
  }
}

// Extract content by navigating to an individual post page (more reliable than modal)
async function extractPostFromPostPage(page, shortcode, postUrl) {
  try {
    if (DEBUG_LOG) console.log(`🧭 Extracting post ${shortcode} via post page`);
    // Dismiss cookie or login dialogs if present
    try {
      const selectors = [
        'button:has-text("Only allow essential cookies")',
        'button:has-text("Allow all cookies")',
        'div[role="dialog"] button',
        'button[aria-label*="close" i]'
      ];
      for (const sel of selectors) {
        const btn = await page.$(sel);
        if (btn) {
          await humanDelay(500, 900);
          await btn.click().catch(() => {});
          await humanDelay(500, 900);
        }
      }
    } catch (_) {}

    // Ensure the post content is loaded (or at least meta tags)
    let articleReady = false;
    let usedMetaTags = false;
    let usedMobileFallback = false;
    try {
      await Promise.race([
        page.waitForSelector('article', { timeout: 12000 }),
        page.waitForSelector('meta[property="og:image"], meta[property="og:video"]', { timeout: 12000 })
      ]);
      articleReady = await page.$('article').then(Boolean).catch(() => false);
    } catch (_) {
      articleReady = false;
    }
    if (DEBUG_LOG) console.log(`🧭 ${shortcode}: Article present: ${articleReady ? 'yes' : 'no'}`);

    const nextButtonSelector = '[aria-label*="Next"], [aria-label="Next"], button[aria-label*="next" i]';
    const maxSlides = 20;

    const carouselItems = [];
    let isCarousel = false;
    let isVideo = false;
    let mainDisplayUrl = '';
    let caption = '';

    // Helper: extract via meta tags when DOM is restricted or login wall
    const extractFromMetaTags = async () => {
      return await page.evaluate(() => {
        const ogVideo = document.querySelector('meta[property="og:video"]')?.getAttribute('content') || '';
        const ogImage = document.querySelector('meta[property="og:image"]')?.getAttribute('content') || '';
        if (ogVideo) {
          return { url: ogVideo, is_video: true, video_url: ogVideo };
        }
        if (ogImage) {
          return { url: ogImage, is_video: false, video_url: null };
        }
        return null;
      });
    };

    // Helper: extract current visible media on the post page
    const extractCurrentSlide = async () => {
      return await page.evaluate(() => {
        const root = document.querySelector('article') || document.body;

        // Prefer video if present
        const videoEl = root.querySelector('video');
        const videoSrc = videoEl?.src || videoEl?.querySelector('source')?.src || '';
        if (videoSrc) {
          return {
            url: videoSrc,
            is_video: true,
            video_url: videoSrc
          };
        }

        // Choose the best image candidate on the page
        const images = Array.from(root.querySelectorAll('img'));

        // Score images by size and likelihood of being content
        const scored = images
          .filter(img => img.src && img.src.startsWith('http'))
          .map(img => {
            const isProfilePic = (img.alt || '').toLowerCase().includes('profile picture');
            const tooSmall = img.naturalWidth < 300 || img.naturalHeight < 300;

            // Prefer highest resolution from srcset when available
            let bestSrc = img.src;
            if (img.srcset) {
              const parts = img.srcset.split(',').map(s => s.trim());
              const last = parts[parts.length - 1];
              const urlPart = last?.split(' ')[0];
              if (urlPart) bestSrc = urlPart;
            }

            let score = (img.naturalWidth * img.naturalHeight);
            if (isProfilePic) score = score / 10; // de-prioritize avatars
            if (tooSmall) score = score / 20;     // de-prioritize tiny images

            return { img, bestSrc, score, isProfilePic, tooSmall };
          })
          .sort((a, b) => b.score - a.score);

        const top = scored[0];
        if (top && top.bestSrc) {
          return {
            url: top.bestSrc,
            is_video: false,
            video_url: null
          };
        }

        return null;
      });
    };

    // If article isn't available, attempt meta tags immediately
    if (!articleReady) {
      const metaContent = await extractFromMetaTags();
      if (metaContent) {
        usedMetaTags = true;
        if (DEBUG_LOG) console.log(`🧭 ${shortcode}: Using meta tags (${metaContent.is_video ? 'video' : 'image'})`);
        mainDisplayUrl = metaContent.url;
        isVideo = metaContent.is_video;
        return {
          id: shortcode,
          shortcode,
          url: postUrl,
          is_video: isVideo,
          is_carousel: false,
          display_url: mainDisplayUrl,
          video_url: isVideo ? mainDisplayUrl : null,
          carousel_items: [],
          timestamp: Date.now() / 1000,
          caption: ''
        };
      }
      // Try loading the mobile version as a last resort
      try {
        const mobileUrl = postUrl.replace('https://www.instagram.com', 'https://m.instagram.com');
        if (DEBUG_LOG) console.log(`🧭 ${shortcode}: Falling back to mobile page`);
        await page.goto(mobileUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await humanDelay(1000, 2000);
        usedMobileFallback = true;
        // After mobile load, try meta tags again immediately
        const mobileMeta = await extractFromMetaTags();
        if (mobileMeta) {
          usedMetaTags = true;
          if (DEBUG_LOG) console.log(`🧭 ${shortcode}: Using meta tags on mobile (${mobileMeta.is_video ? 'video' : 'image'})`);
          mainDisplayUrl = mobileMeta.url;
          isVideo = mobileMeta.is_video;
          return {
            id: shortcode,
            shortcode,
            url: postUrl,
            is_video: isVideo,
            is_carousel: false,
            display_url: mainDisplayUrl,
            video_url: isVideo ? mainDisplayUrl : null,
            carousel_items: [],
            timestamp: Date.now() / 1000,
            caption: ''
          };
        }
      } catch (_) {}
    }

    // Detect if carousel by presence of next button or multiple indicators
    isCarousel = !!(await page.$(nextButtonSelector));
    if (DEBUG_LOG) console.log(`🧭 ${shortcode}: Carousel detected: ${isCarousel ? 'yes' : 'no'} | Method: ${usedMetaTags ? (usedMobileFallback ? 'meta-mobile' : 'meta') : (usedMobileFallback ? 'mobile-article' : 'article')}`);

    if (isCarousel) {
      // Collect all carousel items by clicking through
      let slideIndex = 0;
      const seenUrls = new Set();
      let consecutiveFailures = 0;

             while (slideIndex < maxSlides && consecutiveFailures < 3) {
         // Extract current slide with improved logic
         const content = await page.evaluate(() => {
           const root = document.querySelector('article') || document.body;
           
           // Check for video first - try multiple approaches
           const videoEl = root.querySelector('video');
           if (videoEl) {
             // Try multiple sources for video URL
             const source = videoEl.querySelector('source');
             const srcUrl = source?.src || videoEl.src || videoEl.currentSrc || '';
             
             // If it's a blob URL, try to find the actual URL
             if (srcUrl.startsWith('blob:')) {
               // Look for meta tag with video URL
               const metaVideo = document.querySelector('meta[property="og:video"]');
               if (metaVideo?.content && metaVideo.content.startsWith('http')) {
                 return { url: metaVideo.content, is_video: true, video_url: metaVideo.content };
               }
               
               // Try to find video URL in data attributes
               const dataUrl = videoEl.getAttribute('data-url') || videoEl.getAttribute('data-src');
               if (dataUrl && dataUrl.startsWith('http')) {
                 return { url: dataUrl, is_video: true, video_url: dataUrl };
               }
               
               // Skip blob URLs as they won't work for Telegram
               return null;
             }
             
             if (srcUrl && srcUrl.startsWith('http')) {
               return { url: srcUrl, is_video: true, video_url: srcUrl };
             }
           }
           
                                   // Look for image with more comprehensive selection
            const images = Array.from(root.querySelectorAll('img'));
            let bestImage = null;
            let bestScore = 0;

            for (const img of images) {
              const imgSrc = img.src || img.getAttribute('data-src') || ''; // Also check data-src
              if (!imgSrc) continue;

              // Skip obvious profile pictures and tiny images based on URL patterns
              const isProfilePicUrl = imgSrc.includes('s150x150') || imgSrc.includes('s320x320') ||
                                      imgSrc.includes('profile_pic') || imgSrc.includes('/_a/img/profile_pic');
              if (isProfilePicUrl) continue;

              // Prioritize scontent images
              if (imgSrc.includes('scontent')) {
                let currentWidth = img.naturalWidth || img.clientWidth;
                let currentHeight = img.naturalHeight || img.clientHeight;

                // Filter out very small images that are not profile pics but might be UI elements
                if (currentWidth < 200 || currentHeight < 200) continue;

                let bestSrc = imgSrc;
                if (img.srcset) {
                  const parts = img.srcset.split(',').map(s => s.trim());
                  const highest = parts[parts.length - 1];
                  const urlPart = highest?.split(' ')[0];
                  if (urlPart) bestSrc = urlPart;
                }

                const score = currentWidth * currentHeight;
                if (score > bestScore) {
                  bestScore = score;
                  bestImage = { url: bestSrc, is_video: false, video_url: null };
                }
              }
            }

            // Fallback: If no scontent images found, try any reasonable image that looks like a post
            if (!bestImage) {
              for (const img of images) {
                const imgSrc = img.src || img.getAttribute('data-src') || '';
                if (!imgSrc || !imgSrc.startsWith('http')) continue;

                const isProfilePicUrl = imgSrc.includes('s150x150') || imgSrc.includes('s320x320') ||
                                        imgSrc.includes('profile_pic') || imgSrc.includes('/_a/img/profile_pic');
                if (isProfilePicUrl) continue;

                let currentWidth = img.naturalWidth || img.clientWidth;
                let currentHeight = img.naturalHeight || img.clientHeight;

                // Accept images that are reasonably large and not obvious UI elements
                if (currentWidth > 300 && currentHeight > 300) { // Increased minimum size for fallback
                  bestImage = { url: imgSrc, is_video: false, video_url: null };
                  break;
                }
              }
            }

            return bestImage;
         });
         
         if (content && content.url && !content.url.startsWith('blob:') && !seenUrls.has(content.url)) {
           carouselItems.push(content);
           seenUrls.add(content.url);
           console.log(`  📸 Slide ${carouselItems.length}: ${content.is_video ? 'Video' : 'Photo'}`);
           consecutiveFailures = 0;
         } else {
           consecutiveFailures++;
           console.log(`  ⚠️ Slide ${slideIndex + 1}: No valid content found or duplicate URL (consecutive failures: ${consecutiveFailures})`);
           
           // If we've seen the same content multiple times, we've likely reached the end
           if (consecutiveFailures >= 2) {
             console.log(`  🛑 Too many consecutive failures, likely reached end of carousel`);
             break;
           }
         }

                   // Try to click next with better error handling and multiple selectors
          let nextBtn = await page.$(nextButtonSelector);
          
          // Try alternative selectors if the main one fails
          if (!nextBtn) {
            const alternativeSelectors = [
              '[aria-label*="next" i]',
              '[aria-label*="Next" i]',
              'button[aria-label*="next" i]',
              'svg[aria-label*="next" i]',
              '[data-testid*="next" i]',
              'button:has(svg[aria-label*="next" i])',
              'button:has([aria-label*="next" i])'
            ];
            
            for (const selector of alternativeSelectors) {
              nextBtn = await page.$(selector);
              if (nextBtn) {
                console.log(`  🔍 Found next button with selector: ${selector}`);
                break;
              }
            }
          }
          
          if (!nextBtn) {
            console.log(`  🛑 No next button found, stopping at slide ${slideIndex + 1}`);
            break;
          }

          await humanDelay(400, 800);
          try {
            // Try clicking with different methods
            await nextBtn.click({ delay: 50 }).catch(async () => {
              // If regular click fails, try programmatic click
              await page.evaluate(btn => btn.click(), nextBtn);
            });
            
            await humanDelay(1500, 2500); // Longer wait for slide transition
            
            // Verify the slide actually changed by checking if content is different
            const newContent = await page.evaluate(() => {
              const root = document.querySelector('article') || document.body;
              const currentImg = root.querySelector('img[src*="scontent"]');
              const currentVideo = root.querySelector('video');
              return {
                imgSrc: currentImg?.src || '',
                videoSrc: currentVideo?.src || currentVideo?.currentSrc || ''
              };
            });
            
            // Check if we've reached the end of the carousel
            // Look for indicators that we're back at the first slide or no more content
            const isAtEnd = await page.evaluate(() => {
              // Check if we're back at the first slide (no "Previous" button visible)
              const prevButton = document.querySelector('[aria-label*="Previous"], [aria-label*="previous" i]');
              if (prevButton && prevButton.style.display === 'none') {
                return true; // We're at the first slide again
              }
              
              // Check if there's no more content
              const hasContent = document.querySelector('img[src*="scontent"], video[src]');
              return !hasContent;
            });
            
            if (isAtEnd) {
              console.log(`  🛑 Reached end of carousel, stopping`);
              break;
            }
            
          } catch (error) {
            console.log(`  ⚠️ Error clicking next: ${error.message}`);
            break;
          }
         
         slideIndex++;
       }

      if (carouselItems.length > 0) {
        mainDisplayUrl = carouselItems[0].url;
        isVideo = carouselItems[0].is_video;
      }
    } else {
      const content = await extractCurrentSlide();
      if (content) {
        mainDisplayUrl = content.url;
        isVideo = content.is_video;
        if (DEBUG_LOG) console.log(`🧭 ${shortcode}: single ${isVideo ? 'video' : 'image'} extracted`);
      }
    }

    // Extract caption text where possible
    try {
      caption = await page.evaluate(() => {
        const root = document.querySelector('article') || document.body;
        const candidates = [
          '[data-testid="post-container"] h1',
          'span[dir="auto"]',
          'h1',
          'article span'
        ];
        for (const sel of candidates) {
          const el = root.querySelector(sel);
          if (el && el.textContent && el.textContent.trim().length > 0) {
            return el.textContent.trim();
          }
        }
        return '';
      });
    } catch (_) {
      caption = '';
    }

    const method = usedMetaTags ? (usedMobileFallback ? 'meta-mobile' : 'meta') : (usedMobileFallback ? 'mobile-article' : 'article');
            const result = {
          id: shortcode,
          shortcode,
          url: postUrl,
          is_video: isVideo,
          is_carousel: isCarousel,
          display_url: mainDisplayUrl,
          video_url: isVideo ? mainDisplayUrl : null,
          carousel_items: carouselItems,
          timestamp: Date.now() / 1000,
          caption,
          method,
          is_pinned: false // Will be updated by GraphQL processing
        };
    console.log(`✅ ${shortcode}: extraction complete → ${result.is_carousel ? `carousel ${carouselItems.length} items` : (result.is_video ? 'video' : 'image')} | method=${method}`);
    return result;
  } catch (error) {
    console.error(`Error extracting post page content: ${error.message}`);
    return null;
  }
}

// Instagram scraping function with Web Profile Info API (URLs only)
async function scrapeInstagramPosts(username, userAgent) {
  try {
    console.log(`🔍 Checking for new posts from @${username}`);
    
    // Try Web Profile Info API first (URLs only)
    const postUrls = await scrapeWithWebProfileInfo(username, userAgent);
    if (postUrls.length > 0) {
      console.log(`✅ Web Profile Info API found ${postUrls.length} post URLs`);
      
      // Warn about large profiles and suggest limits
      if (postUrls.length >= 8) {
        console.log(`⚠️ Large profile detected (${postUrls.length} posts). Consider limiting to avoid overwhelming servers.`);
        console.log(`💡 Processing will continue with current limits (max 8 posts).`);
      }
      
      return postUrls; // Return URLs only, let main processing handle GraphQL
    }
    
    // Fallback to browser automation
    console.log(`🔄 Web Profile Info API failed, trying browser automation...`);
    const browserPosts = await scrapeInstagramBrowser(username);
    if (browserPosts.length > 0) {
      console.log(`✅ Browser automation found ${browserPosts.length} posts`);
      return browserPosts;
    }
    
    console.log(`❌ No posts found for @${username}`);
    return [];

  } catch (error) {
    console.error('Instagram scraping error:', error.message);
    return [];
  }
}

// Web Profile Info API scraping (URLs only)
async function scrapeWithWebProfileInfo(username, userAgent) {
  try {
    console.log(`🌐 Using Web Profile Info API for @${username}`);
    
    const profileUrl = `https://www.instagram.com/api/v1/users/web_profile_info/?username=${username}`;
    
    const response = await axios.get(profileUrl, {
      headers: {
        'User-Agent': userAgent,
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
        'X-IG-App-ID': '936619743392459',
        'X-ASBD-ID': '129477',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin'
      },
      timeout: 15000
    });
    
    if (response.data && response.data.data && response.data.data.user) {
      const user = response.data.data.user;
      const postUrls = [];
      
      // Extract only post URLs from the profile data
      if (user.edge_owner_to_timeline_media && user.edge_owner_to_timeline_media.edges) {
        const edges = user.edge_owner_to_timeline_media.edges;
        
        edges.forEach((edge) => {
          if (edge && edge.node && edge.node.shortcode) {
            const url = `https://www.instagram.com/p/${edge.node.shortcode}/`;
            postUrls.push({
              url,
              shortcode: edge.node.shortcode,
              is_pinned: false // Will be updated by GraphQL processing
            });
          }
        });
        
        console.log(`📱 Web Profile Info API collected ${postUrls.length} post URLs`);
        return postUrls.slice(0, 8); // Limit to 8 posts (3 pinned + 5 recent)
      }
    }
    
    console.log(`⚠️ Web Profile Info API returned no posts`);
    return [];
    
  } catch (error) {
    console.log(`❌ Web Profile Info API failed: ${error.message}`);
    requestTracker.trackInstagram(profileUrl, false, error.message);
    if (error.response?.status === 429) {
      console.log(`🚫 Rate limit detected in Web Profile Info API`);
      await rateLimitDelay();
      increaseErrorMultiplier();
    }
    return [];
  }
}



// Check if post was already processed (excluding pinned posts from recent checks)
function isPostProcessed(postId, username) {
  return new Promise((resolve, reject) => {
    // Check if post exists
    db.get(`
      SELECT id, is_pinned, pinned_at, processed_at 
      FROM processed_posts 
      WHERE id = ? AND username = ?
    `, [postId, username], (err, row) => {
      if (err) reject(err);
      else {
        if (!row) {
          resolve(false); // Not processed - allow processing
        } else if (row.is_pinned) {
          // For pinned posts, check if they were pinned recently (within last 24 hours)
          const pinnedTime = new Date(row.pinned_at);
          const now = new Date();
          const hoursSincePinned = (now - pinnedTime) / (1000 * 60 * 60);
          
          if (hoursSincePinned < 24) {
            // Recently pinned - allow re-processing to capture any updates
            console.log(`📌 Pinned post ${postId} was pinned ${hoursSincePinned.toFixed(1)} hours ago - allowing re-processing`);
            resolve(false);
          } else {
            // Old pinned post - treat as processed to avoid spam
            console.log(`📌 Old pinned post ${postId} was pinned ${hoursSincePinned.toFixed(1)} hours ago - treating as processed`);
            resolve(true);
          }
        } else {
          // Regular post - always treat as processed once processed
          resolve(true);
        }
      }
    });
  });
}

// Mark post as processed
function markPostAsProcessed(postId, username, postUrl, postType, isPinned = false) {
  return new Promise((resolve, reject) => {
    const now = new Date().toISOString();
    
    if (isPinned) {
      // For pinned posts, update existing record or insert new one
      db.run(`
        INSERT OR REPLACE INTO processed_posts 
        (id, username, post_url, post_type, is_pinned, pinned_at, processed_at) 
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [postId, username, postUrl, postType, true, now, now], function(err) {
        if (err) reject(err);
        else {
          console.log(`📌 Marked pinned post ${postId} as processed`);
          resolve(this.lastID);
        }
      });
    } else {
      // For regular posts, insert new record
      db.run(
        'INSERT INTO processed_posts (id, username, post_url, post_type, is_pinned) VALUES (?, ?, ?, ?, ?)',
        [postId, username, postUrl, postType, false],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    }
  });
}

// Cache functions for recent posts
// Get cached recent posts for a username
function getCachedRecentPosts(username) {
  return new Promise((resolve, reject) => {
    db.all(`
      SELECT post_url, shortcode, is_pinned, post_order, cached_at 
      FROM recent_posts_cache 
      WHERE username = ? 
      ORDER BY is_pinned DESC, post_order ASC
    `, [username], (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

// Update cache with new recent posts
function updateRecentPostsCache(username, posts) {
  return new Promise((resolve, reject) => {
    // First, remove old cache entries for this user
    db.run('DELETE FROM recent_posts_cache WHERE username = ?', [username], function(err) {
      if (err) {
        reject(err);
        return;
      }
      
      // Then insert new posts
      const stmt = db.prepare(`
        INSERT INTO recent_posts_cache 
        (username, post_url, shortcode, is_pinned, post_order, cached_at) 
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      
      let completed = 0;
      const total = posts.length;
      
      if (total === 0) {
        resolve();
        return;
      }
      
      posts.forEach((post, index) => {
        const shortcode = post.shortcode || post.url.match(/\/(p|reel|tv)\/([^\/]+)\//)?.[2];
        const isPinned = post.is_pinned || false;
        const postOrder = index + 1;
        const now = new Date().toISOString();
        
        stmt.run([username, post.url, shortcode, isPinned, postOrder, now], function(err) {
          if (err) {
            console.log(`❌ Cache update error for ${shortcode}: ${err.message}`);
          }
          completed++;
          if (completed === total) {
            stmt.finalize();
            console.log(`✅ Updated cache with ${total} posts for @${username}`);
            resolve();
          }
        });
      });
    });
  });
}

// Find new posts not in cache
function findNewPosts(username, fetchedPosts) {
  return new Promise(async (resolve, reject) => {
    try {
      const cachedPosts = await getCachedRecentPosts(username);
      const cachedShortcodes = new Set(cachedPosts.map(p => p.shortcode));
      
      const newPosts = fetchedPosts.filter(post => {
        const shortcode = post.shortcode || post.url.match(/\/(p|reel|tv)\/([^\/]+)\//)?.[2];
        return shortcode && !cachedShortcodes.has(shortcode);
      });
      
      console.log(`📊 Cache comparison: ${fetchedPosts.length} fetched, ${cachedPosts.length} cached, ${newPosts.length} new`);
      resolve(newPosts);
    } catch (error) {
      reject(error);
    }
  });
}

// Clean expired cache entries (7 days old)
function cleanExpiredCache() {
  return new Promise((resolve, reject) => {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    
    // Clean both cache and old processed posts
    const cleanCache = new Promise((resolveCache, rejectCache) => {
      db.run(`
        DELETE FROM recent_posts_cache 
        WHERE cached_at < ?
      `, [weekAgo.toISOString()], function(err) {
        if (err) rejectCache(err);
        else resolveCache(this.changes);
      });
    });
    
    const cleanProcessed = new Promise((resolveProcessed, rejectProcessed) => {
      db.run(`
        DELETE FROM processed_posts 
        WHERE processed_at < ? AND is_pinned = FALSE
      `, [weekAgo.toISOString()], function(err) {
        if (err) rejectProcessed(err);
        else resolveProcessed(this.changes);
      });
    });
    
    Promise.all([cleanCache, cleanProcessed])
      .then(([cacheRemoved, processedRemoved]) => {
        console.log(`🧹 Cleaned ${cacheRemoved} expired cache entries and ${processedRemoved} old processed posts`);
        resolve(cacheRemoved + processedRemoved);
      })
      .catch(reject);
  });
}

// Get last cleanup date
function getLastCleanupDate() {
  return new Promise((resolve, reject) => {
    db.get(`
      SELECT cleaned_at FROM cache_cleanup_log 
      ORDER BY cleaned_at DESC LIMIT 1
    `, (err, row) => {
      if (err) reject(err);
      else resolve(row ? new Date(row.cleaned_at) : new Date(0));
    });
  });
}

// Update last cleanup date
function updateLastCleanupDate(postsRemoved = 0, username = null) {
  return new Promise((resolve, reject) => {
    db.run(`
      INSERT INTO cache_cleanup_log (posts_removed, username) 
      VALUES (?, ?)
    `, [postsRemoved, username], function(err) {
      if (err) reject(err);
      else resolve(this.lastID);
    });
  });
}

// Check cache on app boot
async function checkCacheOnBoot() {
  try {
    const lastCleanup = await getLastCleanupDate();
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    
    if (lastCleanup < weekAgo) {
      console.log('🧹 Cache cleanup overdue, cleaning now...');
      const removed = await cleanExpiredCache();
      await updateLastCleanupDate(removed, 'system');
      console.log(`✅ Cache cleanup completed, removed ${removed} entries`);
    } else {
      console.log('✅ Cache is up to date');
    }
  } catch (error) {
    console.log(`⚠️ Cache cleanup check failed: ${error.message}`);
  }
}

// Clear cache for specific user (manual reset)
function clearUserCache(username) {
  return new Promise(async (resolve, reject) => {
    try {
      const result = await new Promise((resolveInner, rejectInner) => {
        db.run('DELETE FROM recent_posts_cache WHERE username = ?', [username], function(err) {
          if (err) rejectInner(err);
          else {
            console.log(`🗑️ Cleared cache for @${username} (${this.changes} entries)`);
            resolveInner(this.changes);
          }
        });
      });
      
      // Update cleanup log to prevent immediate re-cleanup
      await updateLastCleanupDate(result, username);
      
      resolve(result);
    } catch (error) {
      reject(error);
    }
  });
}

// Clear both processed posts and cache for a user
function clearUserData(username) {
  return new Promise(async (resolve, reject) => {
    try {
      const clearProcessed = new Promise((resolveProcessed, rejectProcessed) => {
        db.run('DELETE FROM processed_posts WHERE username = ?', [username], function(err) {
          if (err) rejectProcessed(err);
          else resolveProcessed(this.changes);
        });
      });
      
      const clearCache = clearUserCache(username);
      
      const [processedDeleted, cacheDeleted] = await Promise.all([clearProcessed, clearCache]);
      
      console.log(`🧹 Cleared all data for @${username} (processed: ${processedDeleted}, cache: ${cacheDeleted})`);
      resolve({ processedDeleted, cacheDeleted });
    } catch (error) {
      reject(error);
    }
  });
}

// Fallback to individual processing if batch fails
async function processIndividualPost(post, userAgent) {
  try {
    console.log(`🔄 Fallback: Processing individual post ${post.url}`);
    
    // Call the /igdl endpoint with axios
    const igdlResponse = await axios.get(`http://localhost:${port}/igdl`, {
      params: { url: post.url },
      timeout: 60000
    });
    
    if (igdlResponse.status >= 200 && igdlResponse.status < 300) {
      const result = igdlResponse.data;
      console.log(`✅ Individual processing completed for ${post.url}`);
      return { success: true, data: result };
    } else if (igdlResponse.status === 429) {
      console.log(`🚫 Rate limit detected for ${post.url}: ${igdlResponse.status}`);
      await rateLimitDelay();
      return { error: 'rate_limit' };
    } else {
      console.log(`❌ Individual processing failed for ${post.url}: ${igdlResponse.status}`);
      return { error: 'processing_failed' };
    }
  } catch (error) {
    console.log(`❌ Individual processing error for ${post.url}: ${error.message}`);
    return { error: error.message };
  }
}

// Batch GraphQL processing for multiple posts
async function batchGraphQLCall(posts, userAgent) {
  try {
    console.log(`🔄 Processing batch of ${posts.length} posts with GraphQL API`);
    
    const results = [];
    const maxBatchSize = 8; // Max 8 posts (3 pinned + 5 recent)
    const batchPosts = posts.slice(0, maxBatchSize);
    
    // Process each post in batch (but with individual GraphQL calls for reliability)
    for (const post of batchPosts) {
      try {
        const shortcode = post.shortcode || post.url.match(/\/(p|reel|tv)\/([^\/]+)\//)?.[2];
        if (!shortcode) {
          console.log(`⚠️ Could not extract shortcode from ${post.url}`);
          results.push({ error: 'invalid_shortcode', url: post.url });
          continue;
        }
        
        // Use InstagramCarouselDownloader for individual post processing
        const carouselDownloader = new InstagramCarouselDownloader(userAgent);
        const result = await carouselDownloader.downloadCarousel(post.url);
        
        if (result && result.status && result.data && result.data.length > 0) {
          results.push({
            success: true,
            shortcode,
            url: post.url,
            data: result.data,
            isPinned: post.is_pinned || false
          });
          console.log(`✅ Batch processed: ${shortcode}`);
        } else {
          console.log(`⚠️ Batch processing failed for ${shortcode}, will use snapsave fallback`);
          results.push({ error: 'graphql_failed', url: post.url, shortcode });
        }
        
        // Adaptive delay based on carousel size to avoid overwhelming API
        if (result && result.data && result.data.length > 5) {
          console.log(`📊 Large carousel detected (${result.data.length} items), using longer delay`);
          await smartDelay(1000, 2000); // Longer delay for large carousels
        } else {
          await smartDelay(200, 500); // Normal delay for small posts
        }
        
      } catch (error) {
        console.log(`❌ Batch processing error for ${post.url}: ${error.message}`);
        results.push({ error: error.message, url: post.url });
      }
    }
    
    console.log(`✅ Batch processing completed: ${results.filter(r => r.success).length}/${batchPosts.length} successful`);
    return results;
    
  } catch (error) {
    console.log(`❌ Batch GraphQL processing failed: ${error.message}`);
    return posts.map(post => ({ error: 'batch_failed', url: post.url }));
  }
}



app.get("/", (req, res) => {
  res.json({ message: "Hello World!" });
});

// Extract the processing logic from /igdl endpoint into a reusable function
async function processInstagramURL(url, userAgent = null) {
  try {
    if (!url) {
      return { success: false, error: "URL parameter is missing" };
    }

    // Use TARGET_USERNAME from polling context or fallback to default
    let username = TARGET_USERNAME || 'User Not Found';
    
    console.log(`📱 Using username from polling context: @${username}`);

    // Remove any img_index parameters from the URL to ensure we process the main carousel
    const urlObj = new URL(url);
    const imgIndex = urlObj.searchParams.get('img_index');
    
    if (imgIndex) {
      // Remove img_index parameter and process the main carousel URL
      urlObj.searchParams.delete('img_index');
      const cleanUrl = urlObj.toString();
      console.log(`Removed img_index=${imgIndex}, processing main carousel URL: ${cleanUrl}`);
      
      // Update the URL to the clean version
      url = cleanUrl;
    }

    // Process the main URL to get all carousel items
    const processedUrl = url; // Use the potentially cleaned URL
    let downloadedURL = await snapsave(processedUrl);
    
    // Always try Instagram GraphQL Downloader first for better carousel detection
    console.log(`Trying Instagram GraphQL Downloader for: ${processedUrl}`);
    
    const carouselDownloader = new InstagramCarouselDownloader(userAgent);
    let carouselResult;
    
    try {
      carouselResult = await carouselDownloader.downloadCarousel(processedUrl);
    } catch (error) {
      console.log(`❌ GraphQL method error: ${error.message}`);
      carouselResult = null;
    }
    
    if (carouselResult && carouselResult.status && carouselResult.data && carouselResult.data.length > 0) {
      console.log(`✅ Instagram GraphQL Downloader found ${carouselResult.data.length} carousel items`);
      
      // Replace the snapsave result with the carousel downloader result
      downloadedURL = carouselResult;
      
      // Optional: Send to Telegram if configured (MANUAL processing)
      if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHANNEL_ID) {
        for (const item of carouselResult.data) {
          try {
            console.log(`📤 [MANUAL] Sending carousel item ${item.carouselIndex} (${item.isVideo ? 'video' : 'photo'}) to Telegram...`);
            const photoCaption = `✨ New photo from <a href="https://www.instagram.com/${username}/">@${username}</a>! 📱 <a href="${processedUrl}">View Original Post</a>`;
            const videoCaption = `✨ New video from <a href="https://www.instagram.com/${username}/">@${username}</a>! 📱 <a href="${processedUrl}">View Original Post</a>`;
            
            if (item.isVideo) {
              await sendVideoToTelegram(item.url, videoCaption);
            } else {
              await sendPhotoToTelegram(item.url, photoCaption);
            }
            console.log(`✅ [MANUAL] Carousel item ${item.carouselIndex} sent to Telegram successfully`);
            
            // Add delay between Telegram sends
            await new Promise(resolve => setTimeout(resolve, 1000));
          } catch (telegramError) {
            console.log(`⚠️ [MANUAL] Failed to send carousel item ${item.carouselIndex} to Telegram: ${telegramError.message}`);
          }
        }
      }
      
    } else {
      console.log(`⚠️ Instagram GraphQL Downloader failed, using snapsave fallback`);
      
      // Check if snapsave detected a carousel with multiple items
      if (downloadedURL && downloadedURL.status && downloadedURL.data && downloadedURL.data.length > 1) {
        console.log(`Snapsave detected carousel with ${downloadedURL.data.length} items`);
        
        // Get the number of carousel items from the deduplicated snapsave result
        const rawItems = downloadedURL.data;
        const groupedItems = new Map();
        
        for (const item of rawItems) {
          const thumb = item.thumb || item.thumbnail || '';
          if (!groupedItems.has(thumb)) {
            groupedItems.set(thumb, []);
          }
          groupedItems.get(thumb).push(item);
        }
        
        const numCarouselItems = groupedItems.size;
        console.log(`Detected ${numCarouselItems} carousel items from snapsave`);
        
        // Create individual carousel items using the actual thumbnails from snapsave
        const carouselItems = [];
        const thumbnailUrls = Array.from(groupedItems.keys()).filter(thumb => thumb); // Get unique thumbnails
        
        thumbnailUrls.forEach((thumb, index) => {
          carouselItems.push({
            quality: 'Image',
            thumb: thumb, // Use the actual thumbnail URL from snapsave
            url: rawItems[0].url, // Use the same download URL (since snapsave limitation)
            isProgress: false,
            carouselIndex: index + 1
          });
        });
        
        // Replace the snapsave result with our carousel items
        downloadedURL.data = carouselItems;
        console.log(`Created ${carouselItems.length} carousel items with individual display URLs`);
        
        // Optional: Send to Telegram if configured (MANUAL processing - send only one image for snapsave carousels)
        if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHANNEL_ID && carouselItems.length > 0) {
          try {
            console.log(`📤 [MANUAL] Sending snapsave carousel preview to Telegram (1 of ${carouselItems.length} items)...`);
            const photoCaption = `✨ New photo from <a href="https://www.instagram.com/${username}/">@${username}</a>! 📱 <a href="${processedUrl}">View Original Post</a>\n\n<i>💡 <a href="${processedUrl}">View all ${carouselItems.length} images</a> in the original post (only limited preview available)</i>`;
            
            // Send only the first item as a preview
            await sendPhotoToTelegram(carouselItems[0].url, photoCaption);
            console.log(`✅ [MANUAL] Snapsave carousel preview sent to Telegram successfully`);
          } catch (telegramError) {
            console.log(`⚠️ [MANUAL] Failed to send snapsave carousel preview to Telegram: ${telegramError.message}`);
          }
        }
      } else {
        // Single post - apply deduplication as before
        if (downloadedURL && downloadedURL.status && downloadedURL.data && downloadedURL.data.length > 0) {
          const rawItems = downloadedURL.data;
          const deduplicatedItems = [];
          
          // Group items by thumbnail to identify duplicates
          const groupedItems = new Map();
          
          for (const item of rawItems) {
            const thumb = item.thumb || item.thumbnail || '';
            if (!groupedItems.has(thumb)) {
              groupedItems.set(thumb, []);
            }
            groupedItems.get(thumb).push(item);
          }
          
          // For each group, select the highest quality item
          for (const [thumb, items] of groupedItems) {
            if (items.length === 0) continue;
            
            // Sort by quality (prefer higher quality)
            const sortedItems = items.sort((a, b) => {
              const qualityA = a.quality || '';
              const qualityB = b.quality || '';
              
              // Prefer higher quality (HD > SD, etc.)
              if (qualityA.includes('HD') && !qualityB.includes('HD')) return -1;
              if (qualityB.includes('HD') && !qualityA.includes('HD')) return 1;
              if (qualityA.includes('SD') && !qualityB.includes('SD')) return -1;
              if (qualityB.includes('SD') && !qualityA.includes('SD')) return 1;
              
              // If same quality, prefer the first one
              return 0;
            });
            
            const bestItem = sortedItems[0];
            deduplicatedItems.push({
              quality: bestItem.quality || undefined,
              thumb: bestItem.thumb || bestItem.thumbnail || undefined,
              url: bestItem.url,
              isProgress: bestItem.isProgresser || bestItem.isProgress || false
            });
          }
          
          // Return deduplicated results
          downloadedURL.data = deduplicatedItems;
          console.log(`Deduplicated ${rawItems.length} items to ${deduplicatedItems.length} unique items`);
          
          // Optional: Send to Telegram if configured (MANUAL processing - for single posts using snapsave)
          if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHANNEL_ID && deduplicatedItems.length > 0) {
            try {
              console.log(`📤 [MANUAL] Sending snapsave single post to Telegram...`);
              const photoCaption = `✨ New photo from <a href="https://www.instagram.com/${username}/">@${username}</a>! 📱 <a href="${processedUrl}">View Original Post</a>\n\n<i>💡 <a href="${processedUrl}">View all images</a> in the original post (only limited preview available)</i>`;
              const videoCaption = `✨ New video from <a href="https://www.instagram.com/${username}/">@${username}</a>! 📱 <a href="${processedUrl}">View Original Post</a>\n\n<i>💡 <a href="${processedUrl}">View all images</a> in the original post (only limited preview available)</i>`;
              
              // For snapsave single posts, we'll treat as photo since we can't easily determine type
              await sendPhotoToTelegram(deduplicatedItems[0].url, photoCaption);
              console.log(`✅ [MANUAL] Snapsave single post sent to Telegram successfully`);
            } catch (telegramError) {
              console.log(`⚠️ [MANUAL] Failed to send snapsave single post to Telegram: ${telegramError.message}`);
            }
          }
        }
      }
    }
    
    return { success: true, data: downloadedURL };
  } catch (err) {
    console.error("Error:", err.message);
    return { success: false, error: err.message };
  }
}

// The /igdl endpoint - direct access to processing function
app.get("/igdl", async (req, res) => {
  try {
    const url = req.query.url;
    if (!url) {
      return res.status(400).json({ error: "URL parameter is missing" });
    }
    
    const result = await processInstagramURL(url, getRandomUserAgent());
    
    if (result.success) {
      res.json(result.data);
    } else {
      res.status(500).json({ error: result.error || "Internal Server Error" });
    }
  } catch (err) {
    console.error("Error:", err.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// New endpoint to send video to Telegram
app.post("/send-to-telegram", async (req, res) => {
  try {
    const {
      videoUrl,          // legacy client param for videos
      mediaUrl,          // preferred param for any media
      photoUrl,          // optional legacy param for photos
      caption,           // optional caption text
      originalInstagramUrl, // optional original IG URL
      source = 'instagram',  // 'instagram' | 'snapchat'
      type               // 'video' | 'photo' | undefined (try to infer)
    } = req.body || {};

    // Resolve media URL from provided fields
    let providedUrl = mediaUrl || videoUrl || photoUrl;
    if (!providedUrl) {
      return res.status(400).json({ error: "mediaUrl (or videoUrl/photoUrl) is required" });
    }

    // Normalize Snapchat proxy URLs to server-to-server base
    const SNAP_INTERNAL = process.env.SNAPCHAT_API_INTERNAL || 'http://localhost:8000';
    const normalizeUrl = (url) => {
      try {
        if (url.startsWith('/snapchat-api/')) {
          return `${SNAP_INTERNAL}${url.replace('/snapchat-api', '')}`;
        }
        if (url.includes('://localhost:5173/snapchat-api/')) {
          return url.replace('://localhost:5173/snapchat-api/', '://localhost:8000/');
        }
        return url;
      } catch (_) {
        return url;
      }
    };

    const finalUrl = normalizeUrl(providedUrl);

    // Compose caption with emoji prefix based on source
    let fullCaption = caption || '';
    if (originalInstagramUrl) {
      fullCaption += `\n\n📱 Original: ${originalInstagramUrl}`;
    }
    if (!fullCaption) {
      fullCaption = `New media\n\nDownloaded via Tyla IG Kapturez`;
    }
    const emoji = source === 'snapchat' ? '👻' : '📷';
    if (!fullCaption.trim().startsWith(emoji)) {
      fullCaption = `${emoji} ${fullCaption}`;
    }

    console.log('Telegram request received:', {
      source,
      type,
      mediaUrlPreview: finalUrl?.substring(0, 100) + '...',
      captionPreview: fullCaption?.substring(0, 100) + '...'
    });

    // Decide media type
    const lower = (finalUrl || '').toLowerCase();
    let resolvedType = type;
    if (!resolvedType) {
      if (/(\.mp4|\.mov|\.webm)(\?|$)/.test(lower)) resolvedType = 'video';
      else if (/(\.jpg|\.jpeg|\.png|\.webp)(\?|$)/.test(lower)) resolvedType = 'photo';
    }
    // Default to video if unknown for backward compatibility
    if (!resolvedType) resolvedType = 'video';

    let result;
    if (resolvedType === 'photo') {
      result = await sendPhotoToTelegram(finalUrl, fullCaption);
    } else {
      result = await sendVideoToTelegram(finalUrl, fullCaption);
    }

    res.json({
      success: true,
      message: `${resolvedType} sent to Telegram successfully!`,
      telegram_message_id: result?.message_id,
      channel_id: result?.chat_id
    });

  } catch (err) {
    console.error("Telegram send error details:", {
      message: err.message,
      response: err.response?.data,
      status: err.response?.status
    });
    res.status(500).json({ 
      error: "Failed to send to Telegram",
      details: err.response?.data?.description || err.message 
    });
  }
});

// Main polling function
async function checkForNewPosts(force = false) {
  try {
    // Select random user agent for this poll cycle
    const pollUserAgent = getRandomUserAgent();
    console.log(`\n🔍 Checking for new posts from @${TARGET_USERNAME} ${force ? '(force send enabled)' : ''}`);
    console.log(`🌐 Using user agent: ${pollUserAgent.substring(0, 50)}...`);
    
    const posts = await scrapeInstagramPosts(TARGET_USERNAME, pollUserAgent);
    
    console.log(`Found ${posts.length} total posts`);
    
    // Use cache to find only new posts
    const newPosts = await findNewPosts(TARGET_USERNAME, posts);
    
    // Update cache with current posts
    await updateRecentPostsCache(TARGET_USERNAME, posts);
    
    if (newPosts.length === 0 && !force) {
      console.log(`✅ No new posts found, skipping post processing...`);
      // Continue to check stories even if no new posts
    }
    
    console.log(`📱 Processing ${newPosts.length} new posts out of ${posts.length} total`);
    
    // Use batch processing for efficiency
    const batchResults = await batchGraphQLCall(newPosts, pollUserAgent);
    
    // Process batch results with fallback
    for (const result of batchResults) {
      try {
        if (result.error) {
          console.log(`⚠️ Batch result error for ${result.url}: ${result.error}`);
          
          // Try individual processing as fallback
          const originalPost = newPosts.find(p => p.url === result.url);
          if (originalPost) {
            console.log(`🔄 Attempting individual processing fallback for ${result.url}`);
            const fallbackResult = await processIndividualPost(originalPost, pollUserAgent);
            
            if (fallbackResult.success) {
              // Process fallback result
              const postType = fallbackResult.data.length > 1 ? 'carousel' : (fallbackResult.data[0]?.isVideo ? 'video' : 'photo');
              const isPinned = originalPost.is_pinned || false;
              
              // Send to Telegram for automatic polling fallback
              if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHANNEL_ID) {
                try {
                  console.log(`📤 [AUTO-FALLBACK] Sending fallback result to Telegram...`);
                  
                  for (const item of fallbackResult.data) {
                    const photoCaption = `✨ New photo from <a href="https://www.instagram.com/${TARGET_USERNAME}/">@${TARGET_USERNAME}</a>! 📱 <a href="${originalPost.url}">View Original Post</a>`;
                    const videoCaption = `✨ New video from <a href="https://www.instagram.com/${TARGET_USERNAME}/">@${TARGET_USERNAME}</a>! 📱 <a href="${originalPost.url}">View Original Post</a>`;
                    
                    if (item.isVideo) {
                      await sendVideoToTelegram(item.url, videoCaption);
                    } else {
                      await sendPhotoToTelegram(item.url, photoCaption);
                    }
                    console.log(`✅ [AUTO-FALLBACK] Item sent to Telegram successfully`);
                    
                    // Add delay between Telegram sends
                    await new Promise(resolve => setTimeout(resolve, 1000));
                  }
                } catch (telegramError) {
                  console.log(`⚠️ [AUTO-FALLBACK] Failed to send to Telegram: ${telegramError.message}`);
                }
              }
              
              // Mark as processed
              await markPostAsProcessed(originalPost.id, TARGET_USERNAME, originalPost.url, postType, isPinned);
              console.log(`✅ Fallback processing completed for ${originalPost.url}`);
            } else {
              console.log(`❌ Fallback processing also failed for ${result.url}`);
            }
          }
          continue;
        }
        
        // Check if post was already processed
        let alreadyProcessed = await isPostProcessed(result.shortcode, TARGET_USERNAME);
        if (force) {
          alreadyProcessed = false;
        }
        
        if (!alreadyProcessed) {
          const postType = result.data.length > 1 ? 'carousel' : (result.data[0]?.isVideo ? 'video' : 'photo');
          const isPinned = result.isPinned || false;
          const pinnedIndicator = isPinned ? ' (PINNED)' : '';
          
          console.log(`📱 Processing batch result: ${result.shortcode}${pinnedIndicator} | type=${postType}`);
          
          // Process each item in the result (carousel items or single item)
          for (const item of result.data) {
            try {
              console.log(`🔄 Processing item: ${item.carouselIndex || 1} of ${result.data.length}`);
              
              // Send to Telegram for automatic polling (separate from manual processing)
              if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHANNEL_ID) {
                try {
                  console.log(`📤 [AUTO] Sending item ${item.carouselIndex || 1} to Telegram...`);
                  const photoCaption = `✨ New photo from <a href="https://www.instagram.com/${TARGET_USERNAME}/">@${TARGET_USERNAME}</a>! 📱 <a href="${result.url}">View Original Post</a>`;
                  const videoCaption = `✨ New video from <a href="https://www.instagram.com/${TARGET_USERNAME}/">@${TARGET_USERNAME}</a>! 📱 <a href="${result.url}">View Original Post</a>`;
                  
                  if (item.isVideo) {
                    await sendVideoToTelegram(item.url, videoCaption);
                  } else {
                    await sendPhotoToTelegram(item.url, photoCaption);
                  }
                  console.log(`✅ [AUTO] Item ${item.carouselIndex || 1} sent to Telegram successfully`);
                  
                  // Add delay between Telegram sends to avoid rate limiting
                  await new Promise(resolve => setTimeout(resolve, 1000));
                } catch (telegramError) {
                  console.log(`⚠️ [AUTO] Failed to send item ${item.carouselIndex || 1} to Telegram: ${telegramError.message}`);
                }
              }
              
            } catch (error) {
              console.log(`⚠️ Error processing item: ${error.message}`);
            }
          }
          
          // Mark post as processed
          await markPostAsProcessed(result.shortcode, TARGET_USERNAME, result.url, postType, isPinned);
          console.log(`✅ Post marked as processed: ${result.shortcode}${isPinned ? ' (PINNED)' : ''}`);
          
          // Success - decrease error multiplier
          decreaseErrorMultiplier();
          
        } else {
          console.log(`⏭️ Post already processed: ${result.shortcode}`);
        }
        
      } catch (error) {
        console.error(`Error processing batch result ${result.shortcode}:`, error.message);
        increaseErrorMultiplier();
      }
    }
    
    // Update activity tracker with new posts found
    if (newPosts.length > 0) {
      // Count all new posts as activity (since they're new to our system)
      activityTracker.updateActivity(newPosts.length);
      console.log(`📊 Activity updated: +${newPosts.length} new posts processed`);
    }
    
    console.log('✅ Polling check completed');
    // Always print request statistics after each polling run
    requestTracker.printStats();
    console.log('');
    
  } catch (error) {
    console.error('Polling error:', error.message);
  }
}

// Schedule polling with smart intervals based on activity level
function scheduleNextPoll() {
  // Get smart polling interval based on activity
  const baseMinutes = activityTracker.getPollingInterval();
  const variationMinutes = 2; // ±2 minutes for randomization
  
  // Add/subtract variation (±2 minutes)
  const variation = Math.floor(Math.random() * (variationMinutes * 2 + 1)) - variationMinutes;
  const finalMinutes = Math.max(1, baseMinutes + variation); // Ensure minimum 1 minute
  
  const nextPollMs = finalMinutes * 60 * 1000;
  
  const nextPollTime = new Date(Date.now() + nextPollMs);
  const timeString = nextPollTime.toLocaleTimeString('en-US', { 
    hour: 'numeric', 
    minute: '2-digit', 
    hour12: true 
  });
  console.log(`⏰ Next poll scheduled in ${finalMinutes} minutes (smart: ${baseMinutes} ± ${Math.abs(variation)}) for @${TARGET_USERNAME} at ${timeString}`);
  
  currentPollingTimeout = setTimeout(async () => {
    if (POLLING_ENABLED) {
      try {
        // Check for new stories first, then posts
        await checkForNewStories();
        await checkForNewPosts();
        scheduleNextPoll(); // Schedule the next poll
      } catch (error) {
        console.error('❌ Polling cycle failed:', error);
        // Log error but don't stop polling
        const errorLog = `[${new Date().toISOString()}] Polling error: ${error.message}\n${error.stack}\n\n`;
        fs.appendFileSync(path.join(__dirname, 'error-logs.txt'), errorLog);
        
        // Retry after 5 minutes instead of the full interval
        setTimeout(async () => {
          if (POLLING_ENABLED) {
            try {
              await checkForNewStories();
              await checkForNewPosts();
              scheduleNextPoll();
            } catch (retryError) {
              console.error('❌ Polling retry failed:', retryError);
              // Continue with normal schedule even if retry fails
              scheduleNextPoll();
            }
          }
        }, 5 * 60 * 1000);
      }
    }
  }, nextPollMs);
}

// Stop current polling
function stopPolling() {
  if (currentPollingTimeout) {
    clearTimeout(currentPollingTimeout);
    currentPollingTimeout = null;
    console.log('🛑 Polling stopped');
  }
  // Allow restarting after a manual stop
  pollingStarted = false;
}

// Restart polling immediately
function restartPolling() {
  stopPolling();
  console.log(`🔄 Restarting polling for @${TARGET_USERNAME}`);
  
  // Start new poll after 5 seconds
  setTimeout(async () => {
    try {
      await checkForNewStories();
      await checkForNewPosts();
      scheduleNextPoll();
    } catch (error) {
      console.error('❌ Restart polling failed:', error);
      scheduleNextPoll();
    }
  }, 5000);
}

// Get current target status
app.get("/target", (req, res) => {
  res.json({
    current_target: TARGET_USERNAME || '',
    polling_enabled: POLLING_ENABLED,
    polling_active: currentPollingTimeout !== null,
    polling_started: pollingStarted
  });
});

// Get request statistics
app.get("/stats", (req, res) => {
  res.json(requestTracker.getStats());
});

// Print request statistics to console
app.post("/stats/print", (req, res) => {
  requestTracker.printStats();
  res.json({ success: true, message: "Statistics printed to console" });
});

// Reset request statistics
app.post("/stats/reset", (req, res) => {
  requestTracker.resetStats();
  res.json({ success: true, message: "Statistics reset" });
});

// Health check endpoint
app.get("/health", (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    polling: {
      enabled: POLLING_ENABLED,
      active: currentPollingTimeout !== null,
      started: pollingStarted,
      target: TARGET_USERNAME
    },
    database: db ? 'connected' : 'disconnected',
    consecutiveFailures: healthCheck.consecutiveFailures
  };
  
  // Check if service is healthy
  if (healthCheck.consecutiveFailures >= healthCheck.maxFailures) {
    health.status = 'unhealthy';
    res.status(503);
  }
  
  res.json(health);
});

// Get request logs (last 100 entries)
app.get("/logs", (req, res) => {
  try {
    const logFile = path.join(__dirname, 'request-logs.txt');
    if (fs.existsSync(logFile)) {
      const content = fs.readFileSync(logFile, 'utf8');
      const lines = content.trim().split('\n').reverse().slice(0, 100);
      res.json({ 
        success: true, 
        logs: lines,
        total: content.trim().split('\n').length
      });
    } else {
      res.json({ success: true, logs: [], total: 0 });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Change target username
app.post("/target", async (req, res) => {
  try {
    const { username, url } = req.body;
    const input = username || url;
    
    if (!input) {
      return res.status(400).json({ 
        error: "Username or URL required",
        examples: [
          "instagram",
          "@instagram", 
          "https://instagram.com/instagram",
          "instagram.com/instagram"
        ]
      });
    }
    
    // Parse and validate the new target
    const newTarget = parseInstagramTarget(input);
    const oldTarget = TARGET_USERNAME;
    
    if (newTarget === oldTarget) {
      return res.json({
        success: true,
        message: `Target is already set to @${newTarget}`,
        target: newTarget,
        changed: false
      });
    }
    
    // Update target
    TARGET_USERNAME = newTarget;
    console.log(`🎯 Target changed from @${oldTarget || 'none'} to @${newTarget}`);
    
    res.json({
      success: true,
      message: `Target changed to @${newTarget}`,
      old_target: oldTarget,
      new_target: newTarget,
      changed: true,
      polling_restarted: false
    });
    
  } catch (error) {
    console.error('Error changing target:', error.message);
    res.status(400).json({ 
      error: error.message,
      examples: [
        "instagram",
        "@instagram", 
        "https://instagram.com/instagram",
        "instagram.com/instagram"
      ]
    });
  }
});

// Reset processed posts for current username (dangerous)
app.post('/reset-processed', async (req, res) => {
  try {
    const username = TARGET_USERNAME;
    if (!username) return res.status(400).json({ error: 'No target set' });
    
    // Clear both processed posts and cache
    const clearProcessed = new Promise((resolve, reject) => {
      db.run('DELETE FROM processed_posts WHERE username = ?', [username], function(err) {
        if (err) reject(err);
        else resolve(this.changes);
      });
    });
    
    const clearCache = clearUserCache(username);
    
    const [processedDeleted, cacheDeleted] = await Promise.all([clearProcessed, clearCache]);
    
    console.log(`🧹 Cleared processed posts for @${username} (deleted=${processedDeleted})`);
    console.log(`🗑️ Cleared cache for @${username} (deleted=${cacheDeleted})`);
    
    res.json({ 
      success: true, 
      processed_deleted: processedDeleted, 
      cache_deleted: cacheDeleted,
      username 
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Clear cache for current username
app.post('/clear-cache', async (req, res) => {
  try {
    const username = TARGET_USERNAME;
    if (!username) return res.status(400).json({ error: 'No target set' });
    
    const deleted = await clearUserCache(username);
    res.json({ success: true, deleted, username });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Clear all data for current username (processed posts + cache)
app.post('/clear-all', async (req, res) => {
  try {
    const username = TARGET_USERNAME;
    if (!username) return res.status(400).json({ error: 'No target set' });
    
    const result = await clearUserData(username);
    res.json({ 
      success: true, 
      processed_deleted: result.processedDeleted, 
      cache_deleted: result.cacheDeleted,
      username 
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Clear stories data for current username (processed stories + stories cache)
app.post('/clear-stories-cache', async (req, res) => {
  try {
    const username = TARGET_USERNAME;
    if (!username) return res.status(400).json({ error: 'No target set' });
    
    // Clear processed stories
    const clearProcessedStories = new Promise((resolve) => {
      db.run('DELETE FROM processed_stories WHERE username = ?', [username], function(err) {
        if (err) {
          console.error('Database error clearing processed stories:', err);
          resolve(0);
        } else {
          console.log(`🗑️ Cleared processed stories for @${username} (${this.changes} entries)`);
          resolve(this.changes);
        }
      });
    });

    // Clear stories cache
    const clearStoriesCache = new Promise((resolve) => {
      db.run('DELETE FROM recent_stories_cache WHERE username = ?', [username], function(err) {
        if (err) {
          console.error('Database error clearing stories cache:', err);
          resolve(0);
        } else {
          console.log(`🗑️ Cleared stories cache for @${username} (${this.changes} entries)`);
          resolve(this.changes);
        }
      });
    });

    const [processedStoriesDeleted, storiesCacheDeleted] = await Promise.all([clearProcessedStories, clearStoriesCache]);
    
    res.json({
      success: true,
      username: username,
      processed_stories_deleted: processedStoriesDeleted,
      stories_cache_deleted: storiesCacheDeleted,
      message: `Cleared stories data for @${username}`
    });
  } catch (error) {
    console.error('Error clearing stories data:', error);
    res.status(500).json({ error: 'Failed to clear stories data' });
  }
});

// Start polling endpoint
app.post("/start-polling", async (req, res) => {
  try {
    if (!TARGET_USERNAME) {
      return res.status(400).json({ error: "No target set. Please set a target first." });
    }
    
    if (pollingStarted) {
      return res.json({ 
        success: true, 
        message: "Polling already started", 
        target: TARGET_USERNAME,
        polling_active: true 
      });
    }
    
    console.log(`🚀 Starting polling for @${TARGET_USERNAME}`);
    startPolling(TARGET_USERNAME);
    
    res.json({ 
      success: true, 
      message: `Polling started for @${TARGET_USERNAME}`,
      target: TARGET_USERNAME,
      polling_active: true
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Stop polling endpoint
app.post("/stop-polling", async (req, res) => {
  try {
    if (!pollingStarted) {
      return res.json({ 
        success: true, 
        message: "Polling not active", 
        polling_active: false 
      });
    }
    
    console.log(`🛑 Stopping polling for @${TARGET_USERNAME}`);
    stopPolling();
    
    res.json({ 
      success: true, 
      message: "Polling stopped",
      polling_active: false
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Manual polling endpoint for testing
app.get("/poll-now", async (req, res) => {
  try {
    const force = String(req.query.force || 'false').toLowerCase() === 'true';
    console.log(`Manual polling triggered via API (force=${force})`);
    await checkForNewPosts(force);
    res.json({ success: true, message: "Polling completed", target: TARGET_USERNAME, force });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(port, async () => {
  console.log(`Server is running at http://localhost:${port}`);
  console.log('🌐 Frontend available: http://localhost:5173');
  console.log('📡 API server ready for manual requests');
  console.log('📊 Request tracking enabled - use /stats endpoint to view statistics');
  
  // Check cache on app boot
  await checkCacheOnBoot();
  
  // Print initial stats
  requestTracker.printStats();
});

// Smart Polling Frequency - Step 5
let activityTracker = {
  recentPosts: 0,
  lastActivity: null,
  lastReset: new Date(),
  isFirstRun: true,
  
  updateActivity(newPostsCount) {
    // Skip activity tracking on first run to avoid counting old posts
    if (this.isFirstRun) {
      console.log(`📊 First run detected - skipping activity tracking for old posts`);
      this.isFirstRun = false;
      return;
    }
    
    this.recentPosts += newPostsCount;
    this.lastActivity = new Date();
    console.log(`📊 Activity updated: +${newPostsCount} posts (total: ${this.recentPosts} in 24h)`);
  },
  
  getActivityLevel() {
    // Reset daily counter
    const now = new Date();
    const hoursSinceReset = (now - this.lastReset) / (1000 * 60 * 60);
    if (hoursSinceReset >= 24) {
      this.recentPosts = 0;
      this.lastReset = now;
      console.log(`🔄 Daily activity reset`);
    }
    
    // More conservative activity levels
    if (this.recentPosts >= 3) return 'high';
    if (this.recentPosts >= 1) return 'medium';
    return 'low';
  },
  
  getPollingInterval() {
    const baseInterval = 25; // minutes
    const activityLevel = this.getActivityLevel();
    
    let interval = baseInterval;
    if (activityLevel === 'high') {
      interval = 15; // 15 minutes for active users
    } else if (activityLevel === 'low') {
      interval = 45; // 45 minutes for inactive users
    }
    // medium stays at 25 minutes
    
    console.log(`🔄 Smart polling: ${interval} minutes (${activityLevel} activity level)`);
    return interval;
  }
};

// ===== INSTAGRAM STORIES IMPLEMENTATION =====

// Process Instagram stories using the same multi-layered approach as posts
async function processInstagramStories(username, userAgent = null) {
  try {
    if (!username) {
      return { success: false, error: "Username parameter is missing" };
    }

    console.log(`📱 Processing Instagram stories for: @${username}`);

    // Construct story URL
    const storyUrl = `https://www.instagram.com/stories/${username}/`;
    
    // Try Instagram GraphQL/Web API first for better story detection
    console.log(`Trying Instagram GraphQL/Web API for stories: ${storyUrl}`);
    
    let downloadedStories = null;
    let method = 'snapsave';
    
    try {
      // Try to get stories using Instagram's web API (similar to posts)
      const webStories = await getInstagramStoriesViaWeb(username, userAgent);
      if (webStories && webStories.length > 0) {
        console.log(`✅ Instagram Web API found ${webStories.length} stories`);
        downloadedStories = {
          status: true,
          data: webStories,
          method: 'web_api'
        };
        method = 'web_api';
      }
    } catch (webError) {
      console.log(`❌ Web API method error: ${webError.message}`);
    }
    
    // Use integrated enhanced logic (no more fallbacks needed)
    if (!downloadedStories || !downloadedStories.data || downloadedStories.data.length === 0) {
      console.log(`⚠️ Web API failed, using integrated enhanced logic...`);
      
      // The integrated logic is already in getInstagramStoriesViaWeb
      // No additional fallbacks needed
      method = 'integrated_enhanced';
    }
    
    if (!downloadedStories || !downloadedStories.status || !downloadedStories.data || downloadedStories.data.length === 0) {
      console.log(`⚠️ No stories found for @${username}`);
      return { 
        success: true, 
        data: { 
          status: true, 
          data: [], 
          message: "No stories found",
          summary: {
            total: 0,
            new: 0,
            existing: 0
          }
        } 
      };
    }

    console.log(`✅ Found ${downloadedStories.data.length} stories for @${username} using ${method}`);

    // Process each story and track in database
    const processedStories = [];
    const storyIds = [];

    for (const story of downloadedStories.data) {
      try {
        // Generate a unique story ID from the URL or timestamp
        const storyId = story.url ? Buffer.from(story.url).toString('base64').substring(0, 20) : `story_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Check if story was already processed
        const isProcessed = await checkStoryProcessed(username, storyId);
        
        if (!isProcessed) {
          // Unified story type detection - trust enhanced downloader data
          let storyType = story.storyType || 'photo'; // Use enhanced downloader's storyType
          let isVideo = story.isVideo !== undefined ? story.isVideo : (story.storyType === 'video');
          
          // Log the unified detection result
          console.log(`🎯 Unified detection result:`);
          console.log(`  - Enhanced storyType: ${story.storyType}`);
          console.log(`  - Enhanced isVideo: ${story.isVideo}`);
          console.log(`  - Enhanced contentType: ${story.contentType}`);
          console.log(`  - Final storyType: ${storyType}`);
          console.log(`  - Final isVideo: ${isVideo}`);
          
          // Add to processed stories
          console.log(`🎯 Final story data before processing:`);
          console.log(`  - storyType: ${storyType}`);
          console.log(`  - isVideo: ${isVideo}`);
          console.log(`  - story.isVideo: ${story.isVideo}`);
          console.log(`  - story.contentType: ${story.contentType}`);
          
          processedStories.push({
            ...story,
            storyId,
            storyType,
            isVideo: isVideo, // Ensure isVideo is preserved
            isNew: true,
            method: method
          });
          
          storyIds.push(storyId);
          
          // Track in database
          await markStoryProcessed(username, storyUrl, storyType, storyId);
          
          // Send to Telegram if configured
          if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHANNEL_ID) {
            try {
              console.log(`📤 [STORY] Sending new story to Telegram...`);
              
              const storyCaption = `💫 View Story: <a href="https://www.instagram.com/${username}/">@${username}</a>`;
              
              console.log(`📤 [STORY] Telegram sending decision:`);
              console.log(`  - storyType: ${storyType}`);
              console.log(`  - story.isVideo: ${story.isVideo}`);
              console.log(`  - story.contentType: ${story.contentType}`);
              console.log(`  - Will send as: ${storyType === 'video' ? 'VIDEO' : 'PHOTO'}`);
              
              // Use enhanced detection data for Telegram sending decision
              const shouldSendAsVideo = story.isVideo === true || 
                                       story.contentType === 'video' || 
                                       storyType === 'video';
              
              console.log(`📤 [STORY] Final Telegram sending decision:`);
              console.log(`  - storyType: ${storyType}`);
              console.log(`  - story.isVideo: ${story.isVideo}`);
              console.log(`  - story.contentType: ${story.contentType}`);
              console.log(`  - shouldSendAsVideo: ${shouldSendAsVideo}`);
              console.log(`  - Will send as: ${shouldSendAsVideo ? 'VIDEO' : 'PHOTO'}`);
              
              if (shouldSendAsVideo) {
                await sendVideoToTelegram(story.url, storyCaption);
              } else {
                await sendPhotoToTelegram(story.url, storyCaption);
              }
              console.log(`✅ [STORY] Story sent to Telegram successfully`);
              
              // Add delay between Telegram sends
              await new Promise(resolve => setTimeout(resolve, 1000));
            } catch (telegramError) {
              console.log(`⚠️ [STORY] Failed to send story to Telegram: ${telegramError.message}`);
            }
          }
        } else {
          // Story already processed, add without Telegram sending
          // Use unified detection logic for consistency
          let storyType = story.storyType || 'photo'; // Use enhanced downloader's storyType
          let isVideo = story.isVideo !== undefined ? story.isVideo : (story.storyType === 'video');
          
          processedStories.push({
            ...story,
            storyId,
            storyType,
            isNew: false,
            method: method
          });
        }
      } catch (storyError) {
        console.log(`⚠️ Error processing individual story: ${storyError.message}`);
      }
    }

    // Update cache
    await updateStoriesCache(username, processedStories);

    console.log(`📊 Stories summary: ${processedStories.filter(s => s.isNew).length} new, ${processedStories.filter(s => !s.isNew).length} existing`);

    return { 
      success: true, 
      data: {
        status: true,
        data: processedStories,
        method: method,
        summary: {
          total: processedStories.length,
          new: processedStories.filter(s => s.isNew).length,
          existing: processedStories.filter(s => !s.isNew).length
        }
      }
    };

  } catch (err) {
    console.error("Error processing stories:", err.message);
    return { success: false, error: err.message };
  }
}

// Get Instagram stories using web API (similar to posts approach)
async function getInstagramStoriesViaWeb(username, userAgent = null) {
  try {
    console.log(`🎬 Processing stories for @${username} with integrated enhanced logic...`);
    
    const headers = {
      'User-Agent': userAgent || getRandomUserAgent(),
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Accept-Encoding': 'gzip, deflate, br',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1'
    };

    const stories = [];
    const storyUrl = `https://www.instagram.com/stories/${username}/`;

    // Integrated Method: Analyze current Snapsave results to detect videos
    console.log('🔍 Analyzing Snapsave results for video detection...');
    try {
      // Use the original snapsave to get results, then analyze them
      const originalSnapsave = require("./snapsave-downloader/src/index");
      const snapsaveResult = await originalSnapsave(storyUrl);
      
      if (snapsaveResult && snapsaveResult.data && snapsaveResult.data.length > 0) {
        for (const item of snapsaveResult.data) {
          // Analyze the URL to determine if it's actually a video
          const url = item.url; // Only analyze the main URL, not thumbnails
          
          if (url) {
            console.log(`  🔍 Analyzing Snapsave URL: ${url.substring(0, 100)}...`);
            
            // Check if the URL contains video indicators - COMPREHENSIVE CHECK
            const videoUrlPatterns = [
              '.mp4', '.m4v', '.mov', '.avi', '.webm', '.mkv', '.flv', '.wmv', '.asf',
              '.3gp', '.3g2', '.ogv', '.ts', '.mts', '.m2ts', '.vob', '.ogm', '.rm',
              '.rmvb', '.divx', '.xvid', '.h264', '.h265', '.hevc', '.vp8', '.vp9',
              'video', 'v2', 'v3', 'stream', 'media', 'content', 'download', 'file',
              'asset', 'resource', 'cdn', 'cache', 'proxy', 'mirror', 'backup'
            ];
            const isVideo = videoUrlPatterns.some(pattern => 
              url.toLowerCase().includes(pattern.toLowerCase())
            ) || (item.quality && item.quality.toLowerCase().includes('video'));
            
            // Additional check: try to detect video by checking content type
            let confirmedVideo = isVideo;
            let actualVideoUrl = url;
            
            if (url.startsWith('http')) {
              try {
                // Follow redirects to get the actual content
                const response = await axios.get(url, { 
                  headers, 
                  timeout: 10000,
                  maxRedirects: 5,
                  validateStatus: function (status) {
                    return status >= 200 && status < 400; // Accept redirects
                  }
                });
                
                // Check if we got redirected to a different URL
                if (response.request && response.request.res && response.request.res.responseUrl) {
                  actualVideoUrl = response.request.res.responseUrl;
                  console.log(`  🔄 Followed redirect to: ${actualVideoUrl.substring(0, 100)}...`);
                }
                
                // Enhanced content type and response header analysis
                const contentType = response.headers['content-type'] || '';
                const contentLength = response.headers['content-length'] || '0';
                const contentRange = response.headers['content-range'] || '';
                const acceptRanges = response.headers['accept-ranges'] || '';
                const contentDisposition = response.headers['content-disposition'] || '';
                
                console.log(`  📊 Content-Type: ${contentType}, Size: ${contentLength} bytes`);
                console.log(`  📊 Content-Range: ${contentRange}, Accept-Ranges: ${acceptRanges}`);
                
                // Enhanced video detection with multiple criteria - COMPREHENSIVE LIST
                const videoMimeTypes = [
                  'video/mp4', 'video/mpeg', 'video/quicktime', 'video/x-msvideo', 'video/x-ms-wmv',
                  'video/avi', 'video/webm', 'video/ogg', 'video/x-matroska', 'video/x-flv',
                  'video/3gpp', 'video/3gpp2', 'video/x-ms-asf', 'video/x-m4v', 'video/mp2t',
                  'video/x-ms-wmx', 'video/x-ms-wvx', 'video/x-ms-wm', 'video/x-ms-wma',
                  'application/x-mpegURL', 'application/vnd.apple.mpegurl'
                ];
                const videoExtensions = [
                  '.mp4', '.m4v', '.mov', '.avi', '.webm', '.mkv', '.flv', '.wmv', '.asf',
                  '.3gp', '.3g2', '.ogv', '.ts', '.mts', '.m2ts', '.vob', '.ogm', '.rm',
                  '.rmvb', '.divx', '.xvid', '.h264', '.h265', '.hevc', '.vp8', '.vp9'
                ];
                const videoUrlPatterns = [
                  'video', 'v2', 'v3', 'mp4', 'mov', 'avi', 'webm', 'mkv', 'flv', 'wmv',
                  'stream', 'media', 'content', 'download', 'file', 'asset', 'resource',
                  'cdn', 'cache', 'proxy', 'mirror', 'backup', 'archive', 'storage'
                ];
                const qualityIndicators = [
                  'hd', '4k', 'uhd', '1080p', '720p', '480p', '360p', '240p', '144p',
                  'high', 'medium', 'low', 'best', 'worst', 'original', 'compressed',
                  'quality', 'resolution', 'bitrate', 'fps', 'frame'
                ];
                
                // Primary: Enhanced content-type and file size analysis
                const hasVideoMimeType = videoMimeTypes.some(type => contentType.toLowerCase().includes(type));
                const hasVideoExtension = videoExtensions.some(ext => actualVideoUrl.toLowerCase().includes(ext));
                const hasVideoUrlPattern = videoUrlPatterns.some(pattern => actualVideoUrl.toLowerCase().includes(pattern));
                const hasQualityIndicator = qualityIndicators.some(quality => actualVideoUrl.toLowerCase().includes(quality));
                const isLargeFile = parseInt(contentLength) > 500000; // Lowered threshold to 500KB
                const hasVideoHeaders = contentRange.includes('bytes') || acceptRanges === 'bytes';
                
                // Secondary: Enhanced URL pattern matching and Instagram CDN detection
                const isInstagramCDN = actualVideoUrl.includes('scontent.cdninstagram.com') || 
                                     actualVideoUrl.includes('cdninstagram.com') ||
                                     actualVideoUrl.includes('fbcdn.net');
                const isSnapsaveVideo = actualVideoUrl.includes('rapidcdn.app/v2') || 
                                       actualVideoUrl.includes('snapsave.app/video');
                
                // Calculate confidence score
                let confidenceScore = 0;
                if (hasVideoMimeType) confidenceScore += 3;
                if (hasVideoExtension) confidenceScore += 2;
                if (hasVideoUrlPattern) confidenceScore += 1;
                if (hasQualityIndicator) confidenceScore += 1;
                if (isLargeFile) confidenceScore += 2;
                if (hasVideoHeaders) confidenceScore += 1;
                if (isInstagramCDN) confidenceScore += 1;
                if (isSnapsaveVideo) confidenceScore += 1;
                
                console.log(`  🎯 Video Detection Score: ${confidenceScore}/12`);
                console.log(`  📊 Criteria: MIME(${hasVideoMimeType}) Ext(${hasVideoExtension}) Pattern(${hasVideoUrlPattern}) Quality(${hasQualityIndicator}) Size(${isLargeFile}) Headers(${hasVideoHeaders}) CDN(${isInstagramCDN}) Snapsave(${isSnapsaveVideo})`);
                
                // Determine if this is video based on confidence score
                confirmedVideo = confidenceScore >= 3; // Require at least 3 points for video detection
                
                // Tertiary: File header analysis and magic number detection
                if (response.data && response.data.length > 0) {
                  try {
                    // Get first few bytes for magic number detection
                    const firstBytes = response.data.slice(0, 12);
                    const hexSignature = firstBytes.toString('hex').toLowerCase();
                    
                    console.log(`  🔍 File Header Analysis: ${hexSignature.substring(0, 24)}...`);
                    
                    // Video file magic numbers - COMPREHENSIVE LIST
                    const videoMagicNumbers = {
                      'mp4': ['66747970', '00000020', '0000001c', '00000018', '00000014'], // 'ftyp' and variations
                      'mov': ['66747970', '6d6f6f76', '6d646174', '6d657461', '75647461'], // 'ftyp', 'moov', 'mdat', 'meta', 'udta'
                      'avi': ['52494646', '41564920', '4156494c', '41564958'], // 'RIFF' + 'AVI ', 'AVIL', 'AVIX'
                      'webm': ['1a45dfa3', '1549a966', '1654ae6b'], // WebM/Matroska signatures
                      'mkv': ['1a45dfa3', '1549a966', '1654ae6b'], // Matroska signatures
                      'flv': ['464c5601', '464c5604', '464c5605'], // 'FLV' + versions
                      'wmv': ['3026b275', '8e8e8e8e'], // WMV signatures
                      'asf': ['3026b275', '8e8e8e8e'], // ASF signatures
                      '3gp': ['66747970', '33677020', '33677034', '33677035', '33677036'], // 'ftyp' + 3GP variations
                      'm4v': ['66747970', '4d345620', '4d345634'], // 'ftyp' + M4V variations
                      'ts': ['47400000', '47400001', '47400002'], // MPEG-TS signatures
                      'ogv': ['4f676753', '4f676753'], // Ogg signatures
                      'rm': ['2e524d46', '2e7261fd'], // RealMedia signatures
                      'rmvb': ['2e524d46', '2e7261fd'], // RealMedia signatures
                      'divx': ['52494646', '44495658'], // 'RIFF' + 'DIVX'
                      'xvid': ['52494646', '58564944'] // 'RIFF' + 'XVID'
                    };
                    
                    // Check for video magic numbers
                    let hasVideoMagicNumber = false;
                    for (const [format, signatures] of Object.entries(videoMagicNumbers)) {
                      if (signatures.some(sig => hexSignature.includes(sig))) {
                        console.log(`  ✅ Detected ${format.toUpperCase()} magic number`);
                        hasVideoMagicNumber = true;
                        confidenceScore += 2; // Bonus points for magic number match
                        break;
                      }
                    }
                    
                    // Check for image magic numbers (to confirm it's NOT a video) - COMPREHENSIVE LIST
                    const imageMagicNumbers = {
                      'jpeg': ['ffd8ff', 'ffd8fe', 'ffd8db'], // JPEG signatures
                      'jpg': ['ffd8ff', 'ffd8fe', 'ffd8db'], // JPG signatures
                      'png': ['89504e47', '89504e470d0a1a0a'], // PNG signatures
                      'gif': ['47494638', '474946383761', '474946383961'], // GIF87a, GIF89a
                      'webp': ['52494646', '57454250'], // 'RIFF' + 'WEBP'
                      'bmp': ['424d', '424d0000'], // 'BM' signatures
                      'tiff': ['49492a00', '4d4d002a', '4d4d002b'], // TIFF signatures
                      'ico': ['00000100', '00000200'], // ICO signatures
                      'cur': ['00000200'], // CUR signatures
                      'svg': ['3c737667', '3c3f786d6c'], // SVG signatures
                      'pdf': ['25504446'], // PDF signature
                      'eps': ['c5d0d3c6', '25215053'], // EPS signatures
                      'raw': ['49492a00', '4d4d002a', '4d4d002b'] // RAW signatures (TIFF-based)
                    };
                    
                    let hasImageMagicNumber = false;
                    for (const [format, signatures] of Object.entries(imageMagicNumbers)) {
                      if (signatures.some(sig => hexSignature.includes(sig))) {
                        console.log(`  🖼️ Detected ${format.toUpperCase()} magic number (likely image)`);
                        hasImageMagicNumber = true;
                        confidenceScore -= 2; // Penalty for image magic number
                        break;
                      }
                    }
                    
                    // Update confidence score
                    console.log(`  🎯 Updated Video Detection Score: ${confidenceScore}/14`);
                    confirmedVideo = confidenceScore >= 3; // Re-evaluate with magic number data
                    
                  } catch (headerError) {
                    console.log(`  ⚠️ File header analysis failed: ${headerError.message}`);
                  }
                }
                
                // Additional check: if it's a rapidcdn URL, try to extract the original Instagram URL
                if (actualVideoUrl.includes('rapidcdn.app') && actualVideoUrl.includes('token=')) {
                  try {
                    // Extract the token and decode it to find the original Instagram URL
                    const tokenMatch = actualVideoUrl.match(/token=([^&]+)/);
                    if (tokenMatch) {
                      const token = tokenMatch[1];
                      
                      // Try multiple decoding approaches
                      let tokenData = null;
                      let decodedToken = '';
                      
                      try {
                        // Method 1: Standard base64 decode
                        decodedToken = Buffer.from(token, 'base64').toString('utf-8');
                        tokenData = JSON.parse(decodedToken);
                      } catch (decodeError1) {
                        try {
                          // Method 2: URL-safe base64 decode
                          const urlSafeToken = token.replace(/-/g, '+').replace(/_/g, '/');
                          decodedToken = Buffer.from(urlSafeToken, 'base64').toString('utf-8');
                          tokenData = JSON.parse(decodedToken);
                        } catch (decodeError2) {
                          try {
                            // Method 3: Try to extract URL directly from token string
                            const urlMatch = token.match(/https?:\/\/[^\s"']+/);
                            if (urlMatch) {
                              tokenData = { url: urlMatch[0] };
                            }
                          } catch (decodeError3) {
                            console.log(`  ⚠️ All token decoding methods failed`);
                          }
                        }
                      }
                      
                      if (tokenData && tokenData.url) {
                        console.log(`  🔗 Found original Instagram URL: ${tokenData.url.substring(0, 100)}...`);
                        
                        // Check if the original URL is a video - COMPREHENSIVE CHECK
                        const originalVideoPatterns = [
                          '.mp4', '.m4v', '.mov', '.avi', '.webm', '.mkv', '.flv', '.wmv', '.asf',
                          '.3gp', '.3g2', '.ogv', '.ts', '.mts', '.m2ts', '.vob', '.ogm', '.rm',
                          '.rmvb', '.divx', '.xvid', '.h264', '.h265', '.hevc', '.vp8', '.vp9',
                          'video', 'v2', 'v3', 'stream', 'media', 'content', 'download',
                          'v/t51.2885-15', 'v/t51.2885-16', 'v/t51.2885-17', 'v/t51.2885-18',
                          'cdninstagram.com/v/', 'fbcdn.net/v/', 'scontent.cdninstagram.com/v/'
                        ];
                        const originalIsVideo = originalVideoPatterns.some(pattern => 
                          tokenData.url.toLowerCase().includes(pattern.toLowerCase())
                        );
                        
                        if (originalIsVideo) {
                          confirmedVideo = true;
                          actualVideoUrl = tokenData.url;
                          console.log(`  ✅ Confirmed as video from original URL`);
                        }
                      }
                    }
                  } catch (tokenError) {
                    console.log(`  ⚠️ Token extraction failed: ${tokenError.message}`);
                  }
                }
                
              } catch (headError) {
                console.log(`  ⚠️ Could not analyze URL: ${headError.message}`);
                // Keep original detection if analysis fails
              }
            }
            
            console.log(`  🎯 Final enhanced detection result:`);
            console.log(`  - confirmedVideo: ${confirmedVideo}`);
            console.log(`  - storyType: ${confirmedVideo ? 'video' : 'photo'}`);
            console.log(`  - isVideo: ${confirmedVideo}`);
            console.log(`  - contentType: ${confirmedVideo ? 'video' : 'image'}`);
            
            stories.push({
              thumbnail: item.thumbnail || url,
              url: actualVideoUrl,
              storyId: `analyzed_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              storyType: confirmedVideo ? 'video' : 'photo',
              quality: item.quality || 'HD',
              isVideo: confirmedVideo,
              method: 'integrated_enhanced',
              originalUrl: url,
              contentType: confirmedVideo ? 'video' : 'image'
            });
            
            console.log(`  ✅ Analyzed ${confirmedVideo ? 'video' : 'photo'}: ${actualVideoUrl.substring(0, 50)}...`);
          }
        }
      }
    } catch (analysisError) {
      console.log(`  ❌ Analysis failed: ${analysisError.message}`);
    }
    
    console.log(`📊 Integrated enhanced logic found ${stories.length} stories`);
    
    if (stories.length > 0) {
      console.log(`✅ Integrated enhanced logic found ${stories.length} stories`);
      return stories;
    } else {
      console.log(`⚠️ No stories found via integrated enhanced logic`);
      return [];
    }
    
  } catch (error) {
    console.log(`❌ Enhanced downloader failed: ${error.message}`);
    throw error;
  }
}

// Extract stories from Instagram stories page content
function extractStoriesFromPage(pageContent, username) {
  const stories = [];
  
  try {
    console.log('🔍 Parsing stories page content...');
    
    // Look for various patterns that might contain story data
    const patterns = [
      // Pattern 1: Look for story media URLs in JSON data
      /"media_url":"([^"]+)"/g,
      // Pattern 2: Look for video URLs
      /"video_url":"([^"]+)"/g,
      // Pattern 3: Look for display URLs
      /"display_url":"([^"]+)"/g,
      // Pattern 4: Look for story items in JSON
      /"items":\[(.*?)\]/g,
      // Pattern 5: Look for reel data
      /"reel":\{(.*?)\}/g
    ];
    
    let foundUrls = new Set();
    
    for (const pattern of patterns) {
      const matches = pageContent.matchAll(pattern);
      for (const match of matches) {
        if (match[1] && match[1].includes('instagram')) {
          foundUrls.add(match[1]);
          console.log(`  📱 Found potential story URL: ${match[1].substring(0, 50)}...`);
        }
      }
    }
    
    // Convert URLs to story objects
    for (const url of foundUrls) {
      const isVideo = url.includes('.mp4') || url.includes('video');
      const mediaType = isVideo ? 'video' : 'photo';
      
      stories.push({
        url: url,
        thumb: url, // Use same URL as thumbnail for now
        quality: 'HD',
        isVideo: isVideo,
        storyType: mediaType,
        timestamp: Math.floor(Date.now() / 1000),
        shortcode: `direct_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      });
    }
    
    console.log(`📊 Extracted ${stories.length} potential stories from page content`);
    
    // Also try to find JSON data blocks that might contain story info
    const jsonMatches = pageContent.match(/<script[^>]*>window\._sharedData\s*=\s*({.*?});<\/script>/g);
    if (jsonMatches) {
      console.log('🔍 Found _sharedData script, attempting to parse...');
      for (const match of jsonMatches) {
        try {
          const jsonStart = match.indexOf('{');
          const jsonEnd = match.lastIndexOf('}') + 1;
          const jsonStr = match.substring(jsonStart, jsonEnd);
          const jsonData = JSON.parse(jsonStr);
          
          // Navigate through the JSON structure to find stories
          if (jsonData.entry_data && jsonData.entry_data.StoriesPage) {
            console.log('✅ Found StoriesPage data in _sharedData');
            // Parse stories from the JSON structure
            const pageStories = parseStoriesFromJson(jsonData, username);
            stories.push(...pageStories);
          }
        } catch (jsonError) {
          console.log(`⚠️ Failed to parse JSON data: ${jsonError.message}`);
        }
      }
    }
    
  } catch (error) {
    console.error('❌ Error parsing stories page:', error.message);
  }
  
  return stories;
}

// Parse stories from Instagram JSON data
function parseStoriesFromJson(jsonData, username) {
  const stories = [];
  
  try {
    // Navigate through the JSON structure to find story data
    const storiesPage = jsonData.entry_data?.StoriesPage?.[0]?.user?.reel;
    
    if (storiesPage && storiesPage.items) {
      console.log(`📱 Found ${storiesPage.items.length} story items in JSON data`);
      
      for (const item of storiesPage.items) {
        let mediaUrl = null;
        let mediaType = 'photo';
        
        if (item.media_type === 'VIDEO') {
          mediaUrl = item.video_versions?.[0]?.url;
          mediaType = 'video';
        } else if (item.media_type === 'IMAGE') {
          mediaUrl = item.image_versions2?.candidates?.[0]?.url;
          mediaType = 'photo';
        }
        
        if (mediaUrl) {
          stories.push({
            url: mediaUrl,
            thumb: item.image_versions2?.candidates?.[0]?.url || mediaUrl,
            quality: 'HD',
            isVideo: item.media_type === 'VIDEO',
            storyType: mediaType,
            timestamp: item.taken_at_timestamp,
            shortcode: item.code
          });
          console.log(`  ✅ Added story: ${mediaType} - ${mediaUrl.substring(0, 50)}...`);
        }
      }
    }
    
  } catch (error) {
    console.error('❌ Error parsing JSON stories:', error.message);
  }
  
  return stories;
}

// Check if a story was already processed
function checkStoryProcessed(username, storyId) {
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT id FROM processed_stories WHERE username = ? AND story_id = ?',
      [username, storyId],
      (err, row) => {
        if (err) {
          console.error('Database error checking story:', err);
          reject(err);
        } else {
          resolve(!!row);
        }
      }
    );
  });
}

// Mark a story as processed
function markStoryProcessed(username, storyUrl, storyType, storyId) {
  return new Promise((resolve, reject) => {
    const id = `${username}_${storyId}`;
    db.run(
      'INSERT OR REPLACE INTO processed_stories (id, username, story_url, story_type, story_id) VALUES (?, ?, ?, ?, ?)',
      [id, username, storyUrl, storyType, storyId],
      function(err) {
        if (err) {
          console.error('Database error marking story processed:', err);
          reject(err);
        } else {
          console.log(`✅ Story ${storyId} marked as processed for @${username}`);
          resolve();
        }
      }
    );
  });
}

// Update stories cache
function updateStoriesCache(username, stories) {
  return new Promise((resolve, reject) => {
    // Clear old cache for this user
    db.run('DELETE FROM recent_stories_cache WHERE username = ?', [username], function(err) {
      if (err) {
        console.error('Database error clearing stories cache:', err);
        reject(err);
        return;
      }

      // Insert new cache entries
      const stmt = db.prepare('INSERT INTO recent_stories_cache (username, story_url, story_id, story_type) VALUES (?, ?, ?, ?)');
      
      stories.forEach((story, index) => {
        stmt.run([username, story.url, story.storyId, story.storyType], function(err) {
          if (err) {
            console.error('Database error inserting story cache:', err);
          }
        });
      });
      
      stmt.finalize((err) => {
        if (err) {
          console.error('Database error finalizing story cache:', err);
          reject(err);
        } else {
          console.log(`✅ Stories cache updated for @${username}`);
          resolve();
        }
      });
    });
  });
}

// Check for new stories (integrated with main polling)
async function checkForNewStories(force = false) {
  try {
    if (!TARGET_USERNAME) {
      console.log('❌ No target username set for story checking');
      return;
    }

    const pollUserAgent = getRandomUserAgent();
    console.log(`\n📱 Checking for new stories from @${TARGET_USERNAME} ${force ? '(force send enabled)' : ''}`);
    console.log(`🌐 Using user agent: ${pollUserAgent.substring(0, 50)}...`);
    
    const result = await processInstagramStories(TARGET_USERNAME, pollUserAgent);
    
    if (result.success) {
      const { summary } = result.data;
      console.log(`📊 Stories summary: ${summary.total} total, ${summary.new} new, ${summary.existing} existing`);
      
      if (summary.new > 0) {
        console.log(`✅ Found ${summary.new} new stories from @${TARGET_USERNAME}`);
      } else {
        console.log(`ℹ️ No new stories found from @${TARGET_USERNAME}`);
      }
    } else {
      console.error(`❌ Story processing failed: ${result.error}`);
    }
    
  } catch (error) {
    console.error('❌ Story checking error:', error);
    increaseErrorMultiplier();
  }
}

// ===== STORIES API ENDPOINTS =====

// Instagram Stories endpoints
app.get("/stories", async (req, res) => {
  try {
    const username = req.query.username;
    if (!username) {
      return res.status(400).json({ error: "Username parameter is required" });
    }
    
    const result = await processInstagramStories(username, getRandomUserAgent());
    
    if (result.success) {
      res.json(result.data);
    } else {
      res.status(500).json({ error: result.error || "Internal Server Error" });
    }
  } catch (err) {
    console.error("Stories error:", err.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Get stories for target user (uses TARGET_USERNAME from polling context)
app.get("/stories/target", async (req, res) => {
  try {
    if (!TARGET_USERNAME) {
      return res.status(400).json({ error: "No target username set. Use /target endpoint first." });
    }
    
    const result = await processInstagramStories(TARGET_USERNAME, getRandomUserAgent());
    
    if (result.success) {
      res.json(result.data);
    } else {
      res.status(500).json({ error: result.error || "Internal Server Error" });
    }
  } catch (err) {
    console.error("Target stories error:", err.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Note: Story polling is now integrated with the main polling system
// Use /start-polling and /stop-polling for both posts and stories

// Get processed stories for a username
app.get("/stories/processed/:username", async (req, res) => {
  try {
    const { username } = req.params;
    
    db.all(
      'SELECT * FROM processed_stories WHERE username = ? ORDER BY processed_at DESC LIMIT 50',
      [username],
      (err, rows) => {
        if (err) {
          console.error('Database error getting processed stories:', err);
          res.status(500).json({ error: "Database error" });
        } else {
          res.json({
            success: true,
            data: rows,
            count: rows.length
          });
        }
      }
    );
  } catch (err) {
    console.error("Get processed stories error:", err.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
});
