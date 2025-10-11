const express = require("express");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const FormData = require("form-data");
const cheerio = require("cheerio");
const cron = require("node-cron");
const sqlite3 = require("sqlite3").verbose();
const SupabaseManager = require("./supabase-manager");
const puppeteer = require("puppeteer");
const readline = require("readline");
const InstagramCarouselDownloader = require("./instagram-carousel-downloader");

// Add fetch for internal API calls
const fetch = require("node-fetch");

// FFmpeg for video re-encoding
let ffmpeg = null;
let ffmpegAvailable = false;
try {
  ffmpeg = require("fluent-ffmpeg");
  const ffmpegStatic = require("ffmpeg-static");
  ffmpeg.setFfmpegPath(ffmpegStatic);
  ffmpegAvailable = true;
  console.log("✅ FFmpeg available for video re-encoding");
} catch (error) {
  console.log(
    "⚠️ FFmpeg not available - videos may appear stretched in Telegram"
  );
  console.log("💡 Install with: npm install fluent-ffmpeg ffmpeg-static");
}

// Snapchat polling module removed - using unified Python service only
// const snapchatPolling = require("./snapchat-polling");

// Color coding for logs
const colors = {
  instagram: "\x1b[35m", // Pink/Magenta
  reset: "\x1b[0m",
};

const instagramLog = (message) => {
  console.log(`${colors.instagram}${message}${colors.reset}`);
};

// ===== INSTAGRAM SESSION MANAGEMENT ===== - COMMENTED OUT DUE TO PUPPETEER ISSUES
/*
class InstagramSession {
  constructor(username) {
    this.username = username;
    this.userAgent = getRandomUserAgent();
    this.browser = null;
    this.page = null;
    this.cookies = [];
    this.headers = {
      "Accept-Language": "en-US,en;q=0.9",
      "Accept-Encoding": "gzip, deflate, br",
      DNT: "1",
      Connection: "keep-alive",
      "Upgrade-Insecure-Requests": "1",
    };
    this.delays = {
      human: () => Math.floor(Math.random() * (2000 - 500 + 1)) + 500,
      smart: () => Math.floor(Math.random() * (3000 - 1000 + 1)) + 1000,
      rateLimit: () => Math.floor(Math.random() * (45000 - 30000 + 1)) + 30000,
      storyTransition: () => Math.floor(Math.random() * (1500 - 800 + 1)) + 800,
    };
    this.rateLimitState = {
      consecutiveFailures: 0,
      lastRequestTime: 0,
      errorMultiplier: 1,
    };
    this.sessionId = `session_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;
  }

  async initialize() {
    console.log(`🎬 Creating Instagram session for @${this.username}`);
    console.log(`🌐 Using user agent: ${this.userAgent}`);

    try {
      this.browser = await puppeteer.launch({
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-accelerated-2d-canvas",
          "--no-first-run",
          "--no-zygote",
          "--disable-gpu",
        ],
      });

      this.page = await this.browser.newPage();
      await this.page.setUserAgent(this.userAgent);
      await this.page.setExtraHTTPHeaders(this.headers);

      console.log(`✅ [SESSION] Browser initialized successfully`);
      return true;
    } catch (error) {
      console.log(
        `❌ [SESSION] Browser initialization failed: ${error.message}`
      );
      return false;
    }
  }

  async cleanup() {
    if (this.browser) {
      try {
        await this.browser.close();
        console.log(`✅ [SESSION] Browser closed successfully`);
      } catch (error) {
        console.log(`⚠️ [SESSION] Error closing browser: ${error.message}`);
      }
    }
  }

  async applyDelay(type = "human") {
    const delay = this.delays[type]();
    console.log(`⏳ [SESSION] Applying ${type} delay: ${delay}ms`);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  async handleRateLimit() {
    this.rateLimitState.consecutiveFailures++;
    this.rateLimitState.errorMultiplier = Math.min(
      this.rateLimitState.errorMultiplier * 1.5,
      5
    );
    const backoffTime = 5000 * this.rateLimitState.errorMultiplier;

    console.log(`🚫 [SESSION] Rate limited, backing off for ${backoffTime}ms`);
    console.log(`⚠️ [SESSION] Rate limit exceeded, increasing delays`);

    await new Promise((resolve) => setTimeout(resolve, backoffTime));
  }

  resetRateLimit() {
    this.rateLimitState.consecutiveFailures = 0;
    this.rateLimitState.errorMultiplier = 1;
    console.log(`✅ [SESSION] Rate limit reset after successful operation`);
  }
}
*/

// ===== FASTDL SESSION MANAGEMENT =====
class FastDlSession {
  constructor(username) {
    this.username = username;
    this.userAgent = getRandomUserAgent();
    this.browser = null;
    this.page = null;
    this.cookies = [];
    this.headers = {
      "Accept-Language": "en-US,en;q=0.9",
      "Accept-Encoding": "gzip, deflate, br",
      DNT: "1",
      Connection: "keep-alive",
      "Upgrade-Insecure-Requests": "1",
    };
    this.delays = {
      human: () => Math.floor(Math.random() * (2000 - 500 + 1)) + 500,
      smart: () => Math.floor(Math.random() * (3000 - 1000 + 1)) + 1000,
      rateLimit: () => Math.floor(Math.random() * (45000 - 30000 + 1)) + 30000,
      storyTransition: () => Math.floor(Math.random() * (1500 - 800 + 1)) + 800,
      typing: () => Math.floor(Math.random() * (200 - 50 + 1)) + 50,
      navigation: () => Math.floor(Math.random() * (4000 - 2000 + 1)) + 2000,
    };
    this.rateLimitState = {
      consecutiveFailures: 0,
      lastRequestTime: 0,
      errorMultiplier: 1,
    };
    this.sessionId = `fastdl_session_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;
  }

  async initialize() {
    console.log(`🎬 Creating FastDl session for @${this.username}`);
    console.log(`🌐 Using user agent: ${this.userAgent}`);

    try {
      this.browser = await puppeteer.launch({
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-accelerated-2d-canvas",
          "--no-first-run",
          "--no-zygote",
          "--disable-gpu",
          "--disable-web-security",
          "--disable-features=VizDisplayCompositor",
          // "--single-process", // Removed - can cause issues with browser loading
          "--disable-extensions",
          "--disable-plugins",
          // "--disable-images", // REMOVED - FastDl needs images
          // "--disable-javascript", // REMOVED - FastDl requires JavaScript
          "--disable-background-timer-throttling",
          "--disable-backgrounding-occluded-windows",
          "--disable-renderer-backgrounding",
          "--disable-field-trial-config",
          "--disable-ipc-flooding-protection",
          "--disable-hang-monitor",
          "--disable-prompt-on-repost",
          "--disable-domain-reliability",
          "--disable-component-extensions-with-background-pages",
          "--disable-default-apps",
          "--disable-sync",
          "--disable-translate",
          "--hide-scrollbars",
          "--mute-audio",
          "--no-default-browser-check",
          "--no-pings",
          "--disable-background-networking",
          "--disable-client-side-phishing-detection",
          "--disable-component-update",
          "--disable-features=TranslateUI",
          "--force-color-profile=srgb",
          "--metrics-recording-only",
          "--password-store=basic",
          "--use-mock-keychain",
          "--disable-blink-features=AutomationControlled",
        ],
        ignoreDefaultArgs: ["--disable-extensions"],
        timeout: 30000,
      });

      this.page = await this.browser.newPage();
      await this.page.setUserAgent(this.userAgent);
      await this.page.setExtraHTTPHeaders(this.headers);

      console.log(`✅ [FASTDL SESSION] Browser initialized successfully`);
      return true;
    } catch (error) {
      console.log(
        `❌ [FASTDL SESSION] Browser initialization failed: ${error.message}`
      );
      return false;
    }
  }

  async cleanup() {
    if (this.browser) {
      try {
        await this.browser.close();
        console.log(`✅ [FASTDL SESSION] Browser closed successfully`);
      } catch (error) {
        console.log(
          `⚠️ [FASTDL SESSION] Error closing browser: ${error.message}`
        );
      }
    }
  }

  async applyDelay(type = "human") {
    const delay = this.delays[type]();
    console.log(`⏳ [FASTDL SESSION] Applying ${type} delay: ${delay}ms`);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  async handleRateLimit() {
    this.rateLimitState.consecutiveFailures++;
    this.rateLimitState.errorMultiplier = Math.min(
      this.rateLimitState.errorMultiplier * 1.5,
      5
    );
    const backoffTime = 5000 * this.rateLimitState.errorMultiplier;

    console.log(
      `🚫 [FASTDL SESSION] Rate limited, backing off for ${backoffTime}ms`
    );
    console.log(`⚠️ [FASTDL SESSION] Rate limit exceeded, increasing delays`);

    await new Promise((resolve) => setTimeout(resolve, backoffTime));
  }

  resetRateLimit() {
    this.rateLimitState.consecutiveFailures = 0;
    this.rateLimitState.errorMultiplier = 1;
    console.log(
      `✅ [FASTDL SESSION] Rate limit reset after successful operation`
    );
  }

  async humanType(element, text) {
    console.log(`⌨️ [FASTDL SESSION] Typing: ${text.substring(0, 30)}...`);

    let totalDelay = 0;
    for (let i = 0; i < text.length; i++) {
      await element.type(text[i]);
      const delay = this.delays.typing();
      totalDelay += delay;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    console.log(`⏳ [FASTDL SESSION] Total typing delay: ${totalDelay}ms`);
  }

  async humanClick(element) {
    console.log(`🖱️ [FASTDL SESSION] Human-like click`);

    // Hover first
    await element.hover();
    await this.applyDelay("human");

    // Click with delay
    await element.click({ delay: Math.random() * 100 + 50 });
  }
}

// ===== GLOBAL ERROR HANDLING =====
process.on("uncaughtException", (error) => {
  console.error("🚨 UNCAUGHT EXCEPTION:", error);
  console.error("Stack trace:", error.stack);

  // Log to file for debugging
  const errorLog = `[${new Date().toISOString()}] UNCAUGHT EXCEPTION: ${
    error.message
  }\n${error.stack}\n\n`;
  fs.appendFileSync(path.join(__dirname, "error-logs.txt"), errorLog);

  // Don't exit immediately - try to recover
  console.log("🔄 Attempting to recover from uncaught exception...");
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("🚨 UNHANDLED REJECTION at:", promise, "reason:", reason);

  // Log to file for debugging
  const errorLog = `[${new Date().toISOString()}] UNHANDLED REJECTION: ${reason}\nPromise: ${promise}\n\n`;
  fs.appendFileSync(path.join(__dirname, "error-logs.txt"), errorLog);
});

// Graceful shutdown handler
process.on("SIGTERM", () => {
  console.log("🛑 Received SIGTERM, shutting down gracefully...");
  cleanupAndExit(0);
});

process.on("SIGINT", () => {
  console.log("🛑 Received SIGINT, shutting down gracefully...");
  cleanupAndExit(0);
});
// ===== MEMORY MANAGEMENT =====
const memoryManager = {
  lastCleanup: Date.now(),
  cleanupInterval: 30 * 60 * 1000, // 30 minutes

  async performCleanup() {
    try {
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
        console.log("🗑️ Garbage collection performed");
      }

      // Clear any accumulated caches
      if (global.postCache) {
        const cacheSize = Object.keys(global.postCache).length;
        if (cacheSize > 1000) {
          console.log(`🧹 Clearing large post cache (${cacheSize} entries)`);
          global.postCache = {};
        }
      }

      // Schedule 4-week cache cleanup (every 1344 cleanup cycles = 4 weeks)
      // 30 min * 1344 = 40320 min = 672 hours = 28 days = 4 weeks
      const weeklyCleanupCount = Math.floor(
        (Date.now() - this.lastCleanup) / this.cleanupInterval
      );
      if (weeklyCleanupCount % 1344 === 0 && weeklyCleanupCount > 0) {
        console.log("📋 Scheduling 4-week cache cleanup operation...");

        // Perform 4-week cleanup operations
        try {
          // Clean up Supabase cache (keep last 8 posts per user)
          if (supabaseManager) {
            const cleanupResult = await supabaseManager.cleanExpiredCache();
            console.log(
              `🧹 Supabase cache cleanup: ${cleanupResult.stories_removed} stories, ${cleanupResult.posts_removed} posts removed`
            );
          }

          // Clean up downloads folder (remove files older than 4 weeks)
          const fourWeeksAgo = Date.now() - 4 * 7 * 24 * 60 * 60 * 1000; // 4 weeks in milliseconds
          let downloadsRemoved = 0;

          if (fs.existsSync(DOWNLOADS_DIR)) {
            const cleanupDownloads = (dirPath) => {
              const items = fs.readdirSync(dirPath);
              items.forEach((item) => {
                const itemPath = path.join(dirPath, item);
                const stats = fs.statSync(itemPath);

                if (stats.isDirectory()) {
                  cleanupDownloads(itemPath);
                  // Remove empty directories
                  if (fs.readdirSync(itemPath).length === 0) {
                    fs.rmdirSync(itemPath);
                  }
                } else if (
                  stats.isFile() &&
                  stats.mtime.getTime() < fourWeeksAgo
                ) {
                  fs.unlinkSync(itemPath);
                  downloadsRemoved++;
                }
              });
            };

            cleanupDownloads(DOWNLOADS_DIR);
            console.log(
              `🧹 Downloads cleanup: ${downloadsRemoved} files removed`
            );
          }

          console.log("✅ 4-week cleanup completed");
        } catch (error) {
          console.error("❌ 4-week cleanup failed:", error);
        }
      }

      try {
        this.lastCleanup = Date.now();
        console.log("✅ Memory cleanup completed");
      } catch (error) {
        console.error("❌ Memory cleanup failed:", error);
      }
    } catch (error) {
      console.error("❌ Memory cleanup failed:", error);
    }
  },

  start() {
    setInterval(() => {
      this.performCleanup(); // Ensure 'this' context is preserved
    }, this.cleanupInterval);
    console.log("🧠 Memory management system started");
  },
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
        console.log("⚠️ Health check: Polling timeout missing, restarting...");
        this.consecutiveFailures++;
        await this.restartPolling();
        return;
      }

      // Check database connectivity
      if (db) {
        await new Promise((resolve, reject) => {
          db.get("SELECT 1", (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      }

      // Reset failure counter on success
      this.consecutiveFailures = 0;
      this.lastCheck = Date.now();
      console.log("✅ Health check passed");
    } catch (error) {
      console.error("❌ Health check failed:", error.message);
      this.consecutiveFailures++;

      if (this.consecutiveFailures >= this.maxFailures) {
        console.error(
          "🚨 Too many consecutive health check failures, restarting service..."
        );
        await this.restartService();
      }
    }
  },

  async restartPolling() {
    try {
      console.log("🔄 Restarting polling due to health check failure...");
      stopPolling();
      await new Promise((resolve) => setTimeout(resolve, 5000));
      startPolling(TARGET_USERNAME);
    } catch (error) {
      console.error("Failed to restart polling:", error);
    }
  },

  async restartService() {
    console.log("🔄 Restarting service due to health check failures...");
    // In a production environment, you might want to use PM2 or similar
    // For now, we'll just restart the polling
    await this.restartPolling();
  },

  start() {
    setInterval(() => {
      this.performCheck();
    }, this.checkInterval);
    console.log("🏥 Health check system started");
  },
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
      lastHour: 0,
    },
    telegram: {
      total: 0,
      successful: 0,
      failed: 0,
      photos: 0,
      videos: 0,
      last24h: 0,
      lastHour: 0,
    },
    startTime: new Date(),
    lastReset: new Date(),
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
      if (error && (error.includes("429") || error.includes("rate limit"))) {
        this.stats.instagram.rateLimited++;
      }
    }

    this.logRequest("Instagram", url, success, error);
  },

  // Track Telegram request
  trackTelegram(type, success, error = null) {
    this.stats.telegram.total++;
    this.stats.telegram.last24h++;
    this.stats.telegram.lastHour++;

    if (success) {
      this.stats.telegram.successful++;
      if (type === "photo") this.stats.telegram.photos++;
      if (type === "video") this.stats.telegram.videos++;
    } else {
      this.stats.telegram.failed++;
    }

    this.logRequest("Telegram", type, success, error);
  },

  // Log individual request
  logRequest(service, details, success, error) {
    const timestamp = new Date().toISOString();
    const status = success ? "✅" : "❌";
    const logEntry = `${timestamp} ${status} ${service}: ${details}${
      error ? ` | Error: ${error}` : ""
    }`;

    console.log(logEntry);

    // Save to log file
    const logFile = path.join(__dirname, "request-logs.txt");
    fs.appendFileSync(logFile, logEntry + "\n");
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
        days: Math.floor(uptime / (1000 * 60 * 60 * 24)),
      },
      rates: {
        instagramPerHour: this.stats.instagram.lastHour,
        telegramPerHour: this.stats.telegram.lastHour,
        instagramPerDay: this.stats.instagram.last24h,
        telegramPerDay: this.stats.telegram.last24h,
      },
    };
  },

  // Print detailed stats
  printStats() {
    const stats = this.getStats();
    console.log("\n📊 REQUEST STATISTICS");
    console.log("====================");
    console.log(
      `⏱️  Uptime: ${stats.uptime.days}d ${stats.uptime.hours}h ${stats.uptime.minutes}m`
    );
    console.log("\n📱 Instagram Requests:");
    console.log(`   Total: ${stats.instagram.total}`);
    console.log(`   Successful: ${stats.instagram.successful}`);
    console.log(`   Failed: ${stats.instagram.failed}`);
    console.log(`   Rate Limited: ${stats.instagram.rateLimited}`);
    console.log(`   Last Hour: ${stats.rates.instagramPerHour}`);
    console.log(`   Last 24h: ${stats.rates.instagramPerDay}`);

    console.log("\n📤 Telegram Requests:");
    console.log(`   Total: ${stats.telegram.total}`);
    console.log(`   Successful: ${stats.telegram.successful}`);
    console.log(`   Failed: ${stats.telegram.failed}`);
    console.log(`   Photos: ${stats.telegram.photos}`);
    console.log(`   Videos: ${stats.telegram.videos}`);
    console.log(`   Last Hour: ${stats.rates.telegramPerHour}`);
    console.log(`   Last 24h: ${stats.rates.telegramPerDay}`);
    console.log("====================\n");
  },

  // Reset all stats
  resetStats() {
    this.stats = {
      instagram: {
        total: 0,
        successful: 0,
        failed: 0,
        rateLimited: 0,
        last24h: 0,
        lastHour: 0,
      },
      telegram: {
        total: 0,
        successful: 0,
        failed: 0,
        photos: 0,
        videos: 0,
        last24h: 0,
        lastHour: 0,
      },
      startTime: new Date(),
      lastReset: new Date(),
    };
    console.log("🔄 Request statistics reset");
  },
};

// Create axios interceptor to automatically track requests
const originalAxiosGet = axios.get;
const originalAxiosPost = axios.post;

// Intercept Instagram requests
axios.get = function (...args) {
  const url = args[0];
  if (
    typeof url === "string" &&
    (url.includes("instagram.com") || url.includes("cdninstagram.com"))
  ) {
    return originalAxiosGet
      .apply(this, args)
      .then((response) => {
        requestTracker.trackInstagram(url, true);
        return response;
      })
      .catch((error) => {
        const errorMsg = error.response?.status?.toString() || error.message;
        requestTracker.trackInstagram(url, false, errorMsg);
        throw error;
      });
  }
  return originalAxiosGet.apply(this, args);
};

axios.post = function (...args) {
  const url = args[0];
  if (typeof url === "string") {
    if (url.includes("instagram.com")) {
      return originalAxiosPost
        .apply(this, args)
        .then((response) => {
          requestTracker.trackInstagram(url, true);
          return response;
        })
        .catch((error) => {
          const errorMsg = error.response?.status?.toString() || error.message;
          requestTracker.trackInstagram(url, false, errorMsg);
          throw error;
        });
    } else if (url.includes("api.telegram.org")) {
      const type = url.includes("sendPhoto")
        ? "photo"
        : url.includes("sendVideo")
        ? "video"
        : "message";
      return originalAxiosPost
        .apply(this, args)
        .then((response) => {
          requestTracker.trackTelegram(type, true);
          return response;
        })
        .catch((error) => {
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
  const candidates = [".env.local", ".env"];
  for (const name of candidates) {
    const candidatePath = path.resolve(__dirname, name);
    if (fs.existsSync(candidatePath)) {
      try {
        const buf = fs.readFileSync(candidatePath);
        const isBinary = buf.includes(0);
        if (isBinary) {
          console.log(
            `⚠️ Skipping ${name}: appears to be binary/corrupted. Please recreate it as UTF-8 text.`
          );
          continue;
        }
        require("dotenv").config({ path: candidatePath, override: true });
        console.log(`✅ Loaded environment from ${name}`);
        return;
      } catch (err) {
        console.log(`⚠️ Could not load ${name}: ${err.message}`);
      }
    }
  }
  // Fallback to default loading if needed
  require("dotenv").config();
})();

const app = express();
const snapsave = require("./snapsave-downloader/src/index");
// Enhanced downloader logic is now integrated directly into getInstagramStoriesViaWeb
const port = process.env.PORT || 3000;

// Middleware to parse JSON bodies
app.use(express.json());

// CORS configuration - allow Vercel frontend and all origins
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    "https://tyla-social.vercel.app",
    "https://tyla-social.onrender.com",
    "http://localhost:5173",
    "http://localhost:3000",
  ];

  if (allowedOrigins.includes(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
  } else {
    res.header("Access-Control-Allow-Origin", "*");
  }

  res.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.header("Access-Control-Allow-Credentials", "true");

  if (req.method === "OPTIONS") {
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
const dbPath =
  process.env.NODE_ENV === "production"
    ? "/opt/render/project/src/data/instagram_tracker.db" // Render persistent storage
    : "./instagram_tracker.db"; // Local development

// Downloads directory configuration for different environments
const DOWNLOADS_DIR = (() => {
  if (process.env.VERCEL) {
    // Vercel: Use /tmp for temporary files (read-write)
    return "/tmp/downloads";
  } else if (process.env.NODE_ENV === "production") {
    // Render: Use persistent storage
    return "/opt/render/project/src/data/downloads";
  } else {
    // Local development
    return "./downloads";
  }
})();

// Ensure directories exist for persistent storage
// Create data directory if it doesn't exist (skip for Vercel)
if (process.env.NODE_ENV === "production" && !process.env.VERCEL) {
  const dataDir = "/opt/render/project/src/data";
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    console.log(`📁 Created persistent data directory: ${dataDir}`);
  }
}

// Ensure downloads directory exists (works for Vercel /tmp)
try {
  if (!fs.existsSync(DOWNLOADS_DIR)) {
    fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
    console.log(`📁 Created downloads directory: ${DOWNLOADS_DIR}`);
  }
} catch (error) {
  console.log(`⚠️ Could not create downloads directory: ${error.message}`);
}

// Initialize Supabase database
let supabaseManager;
let db; // Declare db variable at top level

// Initialize databases (Supabase with SQLite fallback)
async function initializeDatabases() {
  try {
    supabaseManager = new SupabaseManager();
    const connected = await supabaseManager.connect();
    if (connected) {
      console.log(`✅ Supabase database connected successfully`);
      // Always initialize SQLite as fallback
      db = new sqlite3.Database(dbPath);
      console.log(`✅ SQLite fallback database initialized`);
      initializeSQLiteTables();
    } else {
      console.log(`⚠️ Supabase connection failed, falling back to SQLite`);
      // Fallback to SQLite if Supabase fails
      db = new sqlite3.Database(dbPath);
      console.log(`✅ SQLite fallback database initialized`);
      initializeSQLiteTables();
    }
  } catch (error) {
    console.error(`❌ Supabase initialization failed: ${error.message}`);
    console.log(`🔄 Falling back to SQLite database...`);
    db = new sqlite3.Database(dbPath);
    console.log(`✅ SQLite fallback database initialized`);
    initializeSQLiteTables();
  }
}

// Initialize SQLite tables
function initializeSQLiteTables() {
  if (db) {
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
      db.run(
        `ALTER TABLE processed_posts ADD COLUMN is_pinned BOOLEAN DEFAULT FALSE`,
        function (err) {
          if (err && !err.message.includes("duplicate column name")) {
            console.log(`⚠️ Schema update warning: ${err.message}`);
          }
        }
      );
      db.run(
        `ALTER TABLE processed_posts ADD COLUMN pinned_at DATETIME`,
        function (err) {
          if (err && !err.message.includes("duplicate column name")) {
            console.log(`⚠️ Schema update warning: ${err.message}`);
          }
        }
      );

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

      // REMOVED: Stories tracking tables - Stories use Supabase only
      // db.run(`CREATE TABLE IF NOT EXISTS processed_stories (...)`);
      // db.run(`CREATE TABLE IF NOT EXISTS recent_stories_cache (...)`);
    });
  }
}

// User-Agent rotation for bot evasion
const userAgents = [
  // Chrome (Desktop)
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",

  // Firefox (Desktop)
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0",
  "Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0",

  // Edge (Desktop)
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0",

  // Safari (Desktop)
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
];

// Get random User-Agent
function getRandomUserAgent() {
  return userAgents[Math.floor(Math.random() * userAgents.length)];
}

// Enhanced smart delay function with comprehensive logging and GraphQL API protection
let errorMultiplier = 1; // Global error multiplier for adaptive delays
let graphqlCallCount = 0; // Track GraphQL API calls for enhanced protection
let currentPollingUserAgent = null; // Consistent user agent per polling cycle

function smartDelay(
  min = 1000,
  max = 4000,
  multiplier = 1,
  context = "general"
) {
  const adjustedMin = Math.floor(min * multiplier * errorMultiplier);
  const adjustedMax = Math.floor(max * multiplier * errorMultiplier);
  const delay =
    Math.floor(Math.random() * (adjustedMax - adjustedMin + 1)) + adjustedMin;

  // Enhanced logging for all delays, especially GraphQL API calls
  const timestamp = new Date().toISOString().split("T")[1].split(".")[0];
  console.log(
    `⏱️ [${timestamp}] ${context} delay: ${delay}ms (base: ${min}-${max}ms, multiplier: ${multiplier}, errorMultiplier: ${errorMultiplier.toFixed(
      1
    )})`
  );

  return new Promise((resolve) => {
    setTimeout(() => {
      console.log(`✅ [${timestamp}] ${context} delay completed`);
      resolve();
    }, delay);
  });
}

// Enhanced random delay with error adaptation
function randomDelay(min = 2000, max = 8000) {
  return smartDelay(min, max, 1, "random");
}

// Specialized GraphQL API delay function with enhanced protection
function graphqlDelay(postType = "standard", carouselSize = 0) {
  graphqlCallCount++;

  let minDelay, maxDelay;

  if (carouselSize > 5) {
    // Large carousel - highest protection
    minDelay = 4000;
    maxDelay = 8000;
    console.log(
      `🛡️ GraphQL API call #${graphqlCallCount}: Large carousel (${carouselSize} items) - applying maximum protection delay`
    );
  } else if (carouselSize > 1) {
    // Small carousel - medium protection
    minDelay = 3000;
    maxDelay = 6000;
    console.log(
      `🛡️ GraphQL API call #${graphqlCallCount}: Small carousel (${carouselSize} items) - applying medium protection delay`
    );
  } else {
    // Single post - standard protection
    minDelay = 2500;
    maxDelay = 5000;
    console.log(
      `🛡️ GraphQL API call #${graphqlCallCount}: Single post - applying standard protection delay`
    );
  }

  // Add progressive delay based on call count
  const progressiveMultiplier = Math.min(1 + graphqlCallCount * 0.1, 2);

  return smartDelay(
    minDelay,
    maxDelay,
    progressiveMultiplier,
    `graphql-${postType}`
  );
}

// Rate limit delay (long delay for rate limit errors)
function rateLimitDelay() {
  const delay = Math.floor(Math.random() * (45000 - 30000 + 1)) + 30000; // 30-45 seconds
  console.log(`🚫 Rate limit detected, waiting ${delay}ms before retry`);
  errorMultiplier = Math.min(errorMultiplier * 2, 10); // Aggressive backoff
  return new Promise((resolve) => setTimeout(resolve, delay));
}

// Error-based delay increase
function increaseErrorMultiplier() {
  errorMultiplier = Math.min(errorMultiplier * 1.5, 5); // Cap at 5x
  console.log(
    `⚠️ Error detected, increasing delay multiplier to ${errorMultiplier.toFixed(
      1
    )}`
  );
}

// Success-based delay decrease
function decreaseErrorMultiplier() {
  errorMultiplier = Math.max(errorMultiplier * 0.9, 1); // Gradually return to normal
  if (errorMultiplier < 1.1) {
    errorMultiplier = 1; // Reset to normal
  }
}

// Reset GraphQL call counter for new polling cycle
function resetGraphQLCallCounter() {
  const previousCount = graphqlCallCount;
  graphqlCallCount = 0;
  console.log(
    `🔄 GraphQL API call counter reset: ${previousCount} calls in previous cycle`
  );
}

// Set consistent user agent for polling cycle
function setPollingUserAgent(userAgent) {
  currentPollingUserAgent = userAgent;
  console.log(
    `🔒 Polling cycle user agent set: ${userAgent.substring(0, 50)}...`
  );
}

// Get consistent user agent for polling cycle
function getPollingUserAgent() {
  if (!currentPollingUserAgent) {
    currentPollingUserAgent = getRandomUserAgent();
    console.log(
      `🔄 Generated new polling cycle user agent: ${currentPollingUserAgent.substring(
        0,
        50
      )}...`
    );
  }
  return currentPollingUserAgent;
}

// Exponential backoff for rate limiting
function getBackoffDelay(attempt = 1, baseDelay = 60000) {
  const maxDelay = 300000; // 5 minutes max
  const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
  return delay + Math.random() * 30000; // Add up to 30 seconds randomness
}

// Graceful shutdown function (defined after database initialization)
async function cleanupAndExit(code) {
  console.log("🧹 Cleaning up resources...");

  // Stop polling
  if (currentPollingTimeout) {
    clearTimeout(currentPollingTimeout);
    currentPollingTimeout = null;
  }

  // Clean up browser pool - COMMENTED OUT DUE TO PUPPETEER ISSUES
  /*
  try {
    await browserPool.cleanup();
    console.log("✅ Browser pool cleaned up");
  } catch (error) {
    console.error("Error cleaning up browser pool:", error);
  }
  */

  // Close database connections
  if (db) {
    db.close((err) => {
      if (err) console.error("Error closing database:", err);
      else console.log("✅ Database connection closed");
      process.exit(code);
    });
  } else {
    process.exit(code);
  }
}

// Parse and validate Instagram username/URL
function parseInstagramTarget(input) {
  if (!input || typeof input !== "string") {
    throw new Error("Invalid input: username or URL required");
  }

  const trimmedInput = input.trim();

  // Remove @ if present
  let username = trimmedInput.replace(/^@/, "");

  // If it's a URL, extract username
  const urlPatterns = [
    /^https?:\/\/(www\.)?instagram\.com\/([^\/\?#]+)/i,
    /^instagram\.com\/([^\/\?#]+)/i,
    /^www\.instagram\.com\/([^\/\?#]+)/i,
  ];

  for (const pattern of urlPatterns) {
    const match = username.match(pattern);
    if (match) {
      username = match[2]; // Extract username from URL
      break;
    }
  }

  // Remove trailing slashes and query parameters
  username = username.replace(/[\/\?#].*$/, "");

  // Validate username format (Instagram usernames: 1-30 chars, alphanumeric + underscores/periods)
  const usernamePattern = /^[a-zA-Z0-9._]{1,30}$/;
  if (!usernamePattern.test(username)) {
    throw new Error("Invalid Instagram username format");
  }

  // Remove leading/trailing periods (not allowed in Instagram usernames)
  if (username.startsWith(".") || username.endsWith(".")) {
    throw new Error("Instagram usernames cannot start or end with periods");
  }

  return username.toLowerCase();
}

// Interactive target selection
async function promptForTarget() {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    console.log("\n🎯 Instagram Auto-Tracker Setup");
    console.log("=====================================");

    rl.question(
      "Enter Instagram username to track (e.g., instagram): ",
      (input) => {
        rl.close();

        if (!input.trim()) {
          console.log("❌ No username provided. Exiting...");
          process.exit(1);
        }

        try {
          const username = parseInstagramTarget(input.trim());
          resolve(username);
        } catch (error) {
          console.log(`❌ Invalid username: ${error.message}`);
          console.log("Please restart and try again.");
          process.exit(1);
        }
      }
    );
  });
}

// Start polling for the selected target
function startPolling(username) {
  if (pollingStarted) {
    console.log("⚠️ Polling already started");
    return;
  }

  TARGET_USERNAME = username;
  pollingStarted = true;

  console.log(`🚀 Instagram polling started for @${TARGET_USERNAME}`);
  console.log("📍 Manual poll: GET /poll-now");
  console.log("🌐 Frontend available: http://localhost:" + port);

  // Start health check system
  healthCheck.start();

  // Start memory management system
  memoryManager.start();

  // Start first poll after 10 seconds
  setTimeout(async () => {
    try {
      console.log("🔄 Starting sequential polling process...");

      // Check for new stories first, then posts - sequential processing
      console.log("📱 Step 1: Checking for new stories...");
      await checkForNewStories();
      console.log("✅ Step 1 completed: Stories check finished");

      console.log("📝 Step 2: Checking for new posts...");
      await checkForNewPosts();
      console.log("✅ Step 2 completed: Posts check finished");

      console.log("📅 Scheduling next poll...");
      scheduleNextPoll();
    } catch (error) {
      console.error("❌ Initial poll failed:", error);
      // Retry after 30 seconds
      setTimeout(async () => {
        try {
          console.log("🔄 Retrying sequential polling process...");

          console.log("📱 Step 1: Checking for new stories (retry)...");
          await checkForNewStories();
          console.log("✅ Step 1 completed: Stories check finished (retry)");

          console.log("📝 Step 2: Checking for new posts (retry)...");
          await checkForNewPosts();
          console.log("✅ Step 2 completed: Posts check finished (retry)");

          console.log("📅 Scheduling next poll (retry)...");
          scheduleNextPoll();
        } catch (retryError) {
          console.error("❌ Retry poll failed:", retryError);
          // Don't exit, just log and continue
        }
      }, 30000);
    }
  }, 10000);
}

// Debug: Log configuration on startup
const DEBUG_LOG = false;

// Function to send photo to Telegram (prefer direct URL; fallback to download/upload)
async function sendPhotoToTelegram(photoUrl, caption = "") {
  let tempFilePath = null;
  let shouldCleanup = false;

  try {
    // Ensure Telegram configuration is present before attempting any API calls
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHANNEL_ID) {
      throw new Error("Telegram configuration missing");
    }

    // Validate Telegram configuration
    console.log("🔧 Telegram Config Check:");
    console.log(
      `   Bot Token: ${TELEGRAM_BOT_TOKEN ? "✅ Set" : "❌ Missing"}`
    );
    console.log(
      `   Channel ID: ${TELEGRAM_CHANNEL_ID} (${typeof TELEGRAM_CHANNEL_ID})`
    );

    // Validate channel ID format
    if (
      typeof TELEGRAM_CHANNEL_ID === "string" &&
      !TELEGRAM_CHANNEL_ID.startsWith("-")
    ) {
      console.log(
        "⚠️ Warning: Channel ID should be negative for channels/groups"
      );
    }

    // Check if photoUrl is a local file path (already downloaded)
    const isLocalFile = fs.existsSync(photoUrl);

    if (isLocalFile) {
      // Local file - use it directly for upload
      console.log("📤 Uploading local photo file to Telegram...");
      tempFilePath = photoUrl;
      shouldCleanup = false; // Don't cleanup - caller will handle it
    } else if (!photoUrl || !photoUrl.startsWith("http")) {
      throw new Error(`Invalid photo URL: ${photoUrl}`);
    } else {
      // Remote URL processing continues below
    }

    if (!isLocalFile) {
      console.log("📸 Downloading and sending photo to Telegram...");
      console.log("📸 Photo URL:", photoUrl);

      // Fast path: if this is a public CDN (instagram) URL, send it directly to Telegram
      try {
        if (
          photoUrl.includes("cdninstagram.com") ||
          photoUrl.includes("scontent-")
        ) {
          const directResp = await axios.post(
            `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`,
            {
              chat_id: TELEGRAM_CHANNEL_ID,
              photo: photoUrl,
              caption: caption || "New Instagram photo",
              parse_mode: "HTML",
            },
            { timeout: 30000 }
          );
          if (directResp.data?.ok) {
            console.log("✅ Photo sent to Telegram via direct URL");
            requestTracker.trackTelegram("photo", true);
            return {
              success: true,
              messageId: directResp.data.result.message_id,
              method: "direct_url",
            };
          }
        }
      } catch (directErr) {
        console.log(
          "⚠️ Direct URL send failed, falling back to download/upload:",
          directErr.response?.data?.description || directErr.message
        );
        requestTracker.trackTelegram("photo", false, directErr.message);
      }

      // Create temp filename
      const timestamp = Date.now();
      tempFilePath = path.join(__dirname, `temp_photo_${timestamp}.jpg`);
      shouldCleanup = true; // We created a temp file, cleanup after

      // Download the photo
      const response = await axios({
        method: "get",
        url: photoUrl,
        responseType: "stream",
        headers: {
          "User-Agent": getPollingUserAgent(),
          Accept: "image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
          "Sec-Fetch-Dest": "image",
          "Sec-Fetch-Mode": "no-cors",
          "Sec-Fetch-Site": "cross-site",
        },
      });

      // Save to temp file
      const writer = fs.createWriteStream(tempFilePath);
      response.data.pipe(writer);

      await new Promise((resolve, reject) => {
        writer.on("finish", resolve);
        writer.on("error", reject);
      });

      console.log("📁 Photo downloaded to temp file");
    }

    // At this point, tempFilePath is set (either local file or downloaded file)
    if (!tempFilePath) {
      throw new Error("No photo file available for upload");
    }

    // Upload to Telegram
    const form = new FormData();
    form.append("chat_id", TELEGRAM_CHANNEL_ID);
    form.append("photo", fs.createReadStream(tempFilePath), "photo.jpg");
    form.append("caption", caption || "New Instagram photo");
    form.append("parse_mode", "HTML");

    const telegramResponse = await axios.post(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`,
      form,
      {
        headers: { ...form.getHeaders() },
        timeout: 30000,
      }
    );

    if (telegramResponse.data.ok) {
      console.log("✅ Photo sent successfully to Telegram");
      requestTracker.trackTelegram("photo", true);
      return {
        success: true,
        messageId: telegramResponse.data.result.message_id,
      };
    } else {
      const error = `Telegram API error: ${telegramResponse.data.description}`;
      requestTracker.trackTelegram("photo", false, error);
      throw new Error(error);
    }
  } catch (error) {
    console.error("❌ Failed to send photo to Telegram:");
    console.error("Error message:", error.message);
    console.error("Error response:", error.response?.data);
    console.error("Error status:", error.response?.status);
    console.error("Photo URL attempted:", photoUrl);

    // Enhanced error diagnostics
    if (error.response?.data?.description === "Bad Request: chat not found") {
      console.error("🔧 Troubleshooting:");
      console.error("   - Check if TELEGRAM_CHANNEL_ID is correct");
      console.error("   - Verify the bot is added to the channel/chat");
      console.error(
        "   - Channel IDs should be negative (e.g., -1001234567890)"
      );
      console.error("   - Run: node test-telegram.js to verify connection");
    }

    requestTracker.trackTelegram("photo", false, error.message);
    throw error;
  } finally {
    // Clean up temp file only if we created it
    if (shouldCleanup && tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
        console.log("🗑️ Temp photo file cleaned up");
      } catch (cleanupError) {
        console.log(
          "⚠️ Could not delete temp photo file:",
          cleanupError.message
        );
      }
    }
  }
}

// Function to send media group (carousel) to Telegram
async function sendMediaGroupToTelegram(mediaItems, caption = "") {
  try {
    // Ensure Telegram configuration is present before attempting any API calls
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHANNEL_ID) {
      throw new Error("Telegram configuration missing");
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
          type: item.is_video || item.isVideo ? "video" : "photo",
          media: item.url,
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
          mediaObject.parse_mode = "HTML";
        }

        // Add continuation caption to first item of subsequent chunks
        if (!isFirstChunk && index === 0) {
          mediaObject.caption = `📸 Part ${chunkIndex + 1} of ${chunks.length}`;
          mediaObject.parse_mode = "HTML";
        }

        return mediaObject;
      });

      console.log(
        `📤 Sending part ${chunkIndex + 1}/${chunks.length} (${
          chunk.length
        } items)`
      );

      const response = await axios.post(telegramUrl, {
        chat_id: TELEGRAM_CHANNEL_ID,
        media: media,
      });

      if (response.data.ok) {
        const messageIds = response.data.result.map((msg) => msg.message_id);
        results.push(...messageIds);
        console.log(`✅ Part ${chunkIndex + 1} sent successfully`);

        // Add delay between chunks to avoid rate limiting
        if (!isLastChunk) {
          await randomDelay(1000, 3000);
        }
      } else {
        throw new Error(
          `Telegram API error for chunk ${chunkIndex + 1}: ${
            response.data.description
          }`
        );
      }
    }

    console.log(
      `✅ All ${chunks.length} media group(s) sent successfully (${totalItems} total items)`
    );
    return { success: true, messageIds: results, totalChunks: chunks.length };
  } catch (error) {
    console.error("❌ Failed to send media group to Telegram:", error.message);
    throw error;
  }
}

// Function to send video to Telegram (supports both direct URLs and file uploads)
async function sendVideoToTelegram(videoUrl, caption = "") {
  let tempFilePath = null;
  let shouldCleanup = false;

  try {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHANNEL_ID) {
      throw new Error("Telegram configuration missing");
    }

    // Check if this is a direct Instagram CDN URL (GraphQL) or needs download (snapsave)
    const isDirectInstagramUrl =
      videoUrl.includes("scontent-") && videoUrl.includes("cdninstagram.com");

    // Check if videoUrl is a local file path (already downloaded)
    const isLocalFile = fs.existsSync(videoUrl);

    if (isLocalFile) {
      // Local file - use it directly for upload
      console.log("📤 Uploading local video file to Telegram...");
      tempFilePath = videoUrl;
      shouldCleanup = false; // Don't cleanup - caller will handle it
    } else if (isDirectInstagramUrl) {
      // Direct Instagram CDN URL - send directly to Telegram
      console.log("📤 Sending direct Instagram CDN URL to Telegram...");

      const telegramApiUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendVideo`;

      const response = await axios.post(
        telegramApiUrl,
        {
          chat_id: TELEGRAM_CHANNEL_ID,
          video: videoUrl,
          caption:
            caption || `🎬 Instagram Video\n\nDownloaded via Tyla IG Kapturez`,
          parse_mode: "HTML",
          supports_streaming: true,
        },
        {
          timeout: 30000,
        }
      );

      if (response.data.ok) {
        console.log("✅ Video sent to Telegram successfully via direct URL!");
        requestTracker.trackTelegram("video", true);
        return {
          success: true,
          message_id: response.data.result.message_id,
          chat_id: response.data.result.chat.id,
          method: "direct_url",
        };
      } else {
        const error = response.data.description || "Failed to send to Telegram";
        requestTracker.trackTelegram("video", false, error);
        throw new Error(error);
      }
    } else {
      // Remote URL - download and upload file
      console.log("📥 Downloading video from URL for Telegram upload...");
      shouldCleanup = true; // We'll create a temp file, so cleanup after

      // Step 1: Download the video
      const videoResponse = await axios({
        method: "GET",
        url: videoUrl,
        responseType: "stream",
        timeout: 60000, // 60 second timeout for download
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        },
      });

      // Create temp directory if it doesn't exist (Vercel-compatible)
      const tempDir = process.env.VERCEL
        ? "/tmp"
        : path.join(__dirname, "temp");
      try {
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }
      } catch (error) {
        console.log(`⚠️ Could not create temp directory: ${error.message}`);
      }

      // Step 2: Save video to temporary file
      const fileName = `video_${Date.now()}.mp4`;
      tempFilePath = path.join(tempDir, fileName);

      const writer = fs.createWriteStream(tempFilePath);
      videoResponse.data.pipe(writer);

      // Wait for download to complete
      await new Promise((resolve, reject) => {
        writer.on("finish", resolve);
        writer.on("error", reject);
      });

      console.log(`📁 Video downloaded to: ${tempFilePath}`);
    }

    // At this point, tempFilePath is set (either local file or downloaded file)
    if (!tempFilePath) {
      throw new Error("No video file available for upload");
    }

    // Check file size (Telegram limit is 50MB)
    const stats = fs.statSync(tempFilePath);
    const fileSizeInMB = stats.size / (1024 * 1024);

    console.log(`📊 File size: ${fileSizeInMB.toFixed(2)} MB`);

    if (fileSizeInMB > 50) {
      throw new Error(
        `Video file too large: ${fileSizeInMB.toFixed(2)}MB (max 50MB)`
      );
    }

    // Upload the video to Telegram
    console.log("📤 Uploading video to Telegram...");

    const form = new FormData();
    form.append("chat_id", TELEGRAM_CHANNEL_ID);
    form.append("video", fs.createReadStream(tempFilePath), {
      filename: path.basename(tempFilePath),
      contentType: "video/mp4",
    });
    form.append(
      "caption",
      caption || `🎬 New Instagram Video\n\nDownloaded via Tyla IG Kapturez`
    );
    form.append("parse_mode", "HTML");
    form.append("supports_streaming", "true");

    const response = await axios.post(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendVideo`,
      form,
      {
        headers: {
          ...form.getHeaders(),
        },
        timeout: 120000, // 2 minute timeout for upload
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      }
    );

    if (response.data.ok) {
      console.log(
        "✅ Video uploaded to Telegram successfully via file upload!"
      );
      requestTracker.trackTelegram("video", true);
      return {
        success: true,
        message_id: response.data.result.message_id,
        chat_id: response.data.result.chat.id,
        file_size_mb: fileSizeInMB.toFixed(2),
        method: "file_upload",
      };
    } else {
      const error = response.data.description || "Failed to send to Telegram";
      requestTracker.trackTelegram("video", false, error);
      throw new Error(error);
    }
  } catch (error) {
    console.error("❌ Video upload error:", {
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      message: error.message,
    });
    requestTracker.trackTelegram("video", false, error.message);
    throw error;
  } finally {
    // Clean up: delete temporary file only if we created it
    if (shouldCleanup && tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
        console.log("Temporary file cleaned up");
      } catch (cleanupError) {
        console.error("Failed to cleanup temp file:", cleanupError.message);
      }
    }
  }
}

// Human-like browser automation with carousel interaction - COMMENTED OUT DUE TO PUPPETEER ISSUES
/*
async function scrapeInstagramBrowser(username) {
  let browser = null;

  try {
    console.log(`🤖 Starting human-like browser automation for @${username}`);

    // Try multiple launch configurations for Render compatibility
    const launchConfigs = [
      {
        headless: "new",
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-accelerated-2d-canvas",
          "--no-first-run",
          "--no-zygote",
          "--disable-gpu",
          "--disable-web-security",
          "--disable-features=VizDisplayCompositor",
          // "--single-process", // Removed - can cause issues with browser loading
          "--disable-extensions",
          "--disable-plugins",
          // "--disable-images", // REMOVED - FastDl needs images
          // "--disable-javascript", // REMOVED - FastDl requires JavaScript
          "--disable-background-timer-throttling",
          "--disable-backgrounding-occluded-windows",
          "--disable-renderer-backgrounding",
          "--disable-field-trial-config",
          "--disable-ipc-flooding-protection",
          "--disable-hang-monitor",
          "--disable-prompt-on-repost",
          "--disable-domain-reliability",
          "--disable-component-extensions-with-background-pages",
          "--disable-default-apps",
          "--disable-sync",
          "--disable-translate",
          "--hide-scrollbars",
          "--mute-audio",
          "--no-default-browser-check",
          "--no-pings",
          "--disable-background-networking",
          "--disable-client-side-phishing-detection",
          "--disable-component-update",
          "--disable-features=TranslateUI",
          "--force-color-profile=srgb",
          "--metrics-recording-only",
          "--password-store=basic",
          "--use-mock-keychain",
          "--disable-blink-features=AutomationControlled",
        ],
        ignoreDefaultArgs: ["--disable-extensions"],
        timeout: 30000,
      },
      {
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--single-process",
        ],
        timeout: 30000,
      },
      {
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
        timeout: 30000,
      },
    ];

    let launchSuccess = false;
    for (let i = 0; i < launchConfigs.length; i++) {
      try {
        console.log(
          `🤖 Attempting browser launch with config ${i + 1}/${
            launchConfigs.length
          }`
        );
        browser = await puppeteer.launch(launchConfigs[i]);
        launchSuccess = true;
        console.log(`✅ Browser launched successfully with config ${i + 1}`);
        break;
      } catch (launchError) {
        console.log(
          `❌ Browser launch config ${i + 1} failed: ${launchError.message}`
        );
        if (i === launchConfigs.length - 1) {
          throw new Error(
            `All browser launch configurations failed. Last error: ${launchError.message}`
          );
        }
      }
    }

    if (!launchSuccess) {
      throw new Error("Failed to launch browser with any configuration");
    }

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
          waitUntil: "domcontentloaded",
          timeout: 10000,
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
        graphqlUrl.searchParams.set(
          "variables",
          JSON.stringify({
            username: username,
            first: 10, // Get last 10 posts
          })
        );
        graphqlUrl.searchParams.set("doc_id", "10015901848480474");
        graphqlUrl.searchParams.set("lsd", "AVqbxe3J_YA");

        // Add additional headers for better compatibility
        const additionalHeaders = {
          Accept: "application/json",
          "Accept-Language": "en-US,en;q=0.9",
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
          "Sec-Fetch-Dest": "empty",
          "Sec-Fetch-Mode": "cors",
          "Sec-Fetch-Site": "same-origin",
        };

        const response = await page.evaluate(
          async (url, agent, headers) => {
            try {
              const resp = await fetch(url, {
                headers: {
                  "User-Agent": agent,
                  "X-IG-App-ID": "936619743392459",
                  "X-FB-LSD": "AVqbxe3J_YA",
                  "X-ASBD-ID": "129477",
                  ...headers,
                },
              });

              // Check for rate limit
              if (resp.status === 429) {
                console.log("🚫 Rate limit detected in GraphQL API");
                return { error: "rate_limit", status: 429 };
              }

              return await resp.json();
            } catch (error) {
              console.log(`GraphQL API failed: ${error.message}`);
              return null;
            }
          },
          graphqlUrl.toString(),
          userAgent,
          additionalHeaders
        );

        if (response && response.error === "rate_limit") {
          console.log("🚫 Rate limit detected, waiting before retry...");
          await rateLimitDelay();
          increaseErrorMultiplier();
          return []; // Return empty array to trigger fallback
        } else if (
          response &&
          response.data?.user?.edge_owner_to_timeline_media?.edges
        ) {
          const edges = response.data.user.edge_owner_to_timeline_media.edges;
          const urls = edges
            .map((edge) => {
              const shortcode = edge?.node?.shortcode;
              return shortcode
                ? `https://www.instagram.com/p/${shortcode}/`
                : null;
            })
            .filter(Boolean);

          console.log(`✅ GraphQL API collected ${urls.length} posts`);
          decreaseErrorMultiplier(); // Success - decrease error multiplier
          return urls.slice(0, 5); // Limit to last 5 posts
        } else {
          // Debug: Log the response structure to understand what we're getting
          console.log(`⚠️ GraphQL API returned no posts, response structure:`, {
            hasResponse: !!response,
            hasData: !!response?.data,
            hasUser: !!response?.data?.user,
            hasEdges:
              !!response?.data?.user?.edge_owner_to_timeline_media?.edges,
            responseKeys: response ? Object.keys(response) : "no response",
            dataKeys: response?.data ? Object.keys(response.data) : "no data",
            userKeys: response?.data?.user
              ? Object.keys(response.data.user)
              : "no user",
          });
          console.log(
            `⚠️ GraphQL API returned no posts, using browser fallback`
          );
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
        console.log(
          `🔍 Processing post ${i + 1}/${Math.min(
            postUrls.length,
            5
          )} (${Math.round(
            ((i + 1) / Math.min(postUrls.length, 5)) * 100
          )}% complete)`
        );

        // Get the post URL
        const postUrl = postUrls[i];
        const shortcodeMatch = postUrl.match(/\/(p|reel|tv)\/([^\/]+)\//);

        if (!shortcodeMatch) continue;

        const shortcode = shortcodeMatch[2];

        // Open post in a fresh tab to avoid stale handles and page state
        const postPage = await browser.newPage();
        // Use a mobile user agent for post pages to get simpler markup/meta tags
        await postPage.setUserAgent(
          "Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15A372 Safari/604.1"
        );
        await postPage.setViewport({ width: 1200, height: 800 });
        await humanDelay(300, 600);
        await postPage.setExtraHTTPHeaders({
          Referer: "https://www.instagram.com/",
          "Accept-Language": "en-US,en;q=0.9",
        });
        await postPage.goto(postUrl, {
          waitUntil: "networkidle2",
          timeout: 5000,
        });
        await humanDelay(500, 2000); // Wider range for unpredictability

        // Extract content from the post page
        const postData = await extractPostFromPostPage(
          postPage,
          shortcode,
          postUrl
        );

        if (postData) {
          posts.push(postData);
          console.log(
            `✅ Extracted ${
              postData.is_carousel
                ? "carousel"
                : postData.is_video
                ? "video"
                : "photo"
            }: ${shortcode}`
          );
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
        await page.keyboard.press("Escape");
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
*/

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
      page.waitForSelector("article", { timeout: 8000 }),
      page.waitForSelector('img[style*="object-fit"]', { timeout: 8000 }),
    ]);

    const carouselItems = [];
    let isCarousel = false;
    let isVideo = false;
    let mainDisplayUrl = "";
    let caption = "";

    // Check if this is a carousel by looking for navigation arrows
    const nextButton = await page.$(
      '[aria-label*="Next"], [aria-label="Next"], button[aria-label*="next" i]'
    );
    isCarousel = !!nextButton;

    if (isCarousel) {
      console.log(`🎠 Detected carousel, extracting all items...`);

      let currentSlide = 0;
      let hasMore = true;

      while (hasMore && currentSlide < 20) {
        // Safety limit
        // Debug: List all available elements in modal
        const debugInfo = await page.evaluate(() => {
          const modal = document.querySelector('[role="dialog"]');
          if (!modal) return "No modal found";

          const videos = modal.querySelectorAll("video");
          const images = modal.querySelectorAll("img");

          return {
            videos: videos.length,
            images: images.length,
            imageUrls: Array.from(images)
              .map((img) => ({
                src: img.src,
                width: img.naturalWidth,
                height: img.naturalHeight,
                size: `${img.naturalWidth}x${img.naturalHeight}`,
              }))
              .slice(0, 5), // First 5 for brevity
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
          const video = modal.querySelector("video");
          if (video && video.src) {
            return {
              url: video.src,
              is_video: true,
              video_url: video.src,
            };
          }

          // Look for the main post image (exclude profile pics and small images)
          const images = modal.querySelectorAll("img");
          let bestImg = null;

          for (const img of images) {
            // Skip profile pictures and small images
            if (
              img.src &&
              img.src.includes("scontent") &&
              !img.src.includes("s150x150") &&
              !img.src.includes("s320x320") &&
              !img.src.includes("profile_pic") &&
              img.naturalWidth > 300 &&
              img.naturalHeight > 300
            ) {
              bestImg = img;
              break;
            }
          }

          if (bestImg) {
            return {
              url: bestImg.src,
              is_video: false,
              video_url: null,
            };
          }

          return null;
        });

        if (slideContent && slideContent.url) {
          carouselItems.push(slideContent);
          console.log(
            `  📸 Slide ${currentSlide + 1}: ${
              slideContent.is_video ? "Video" : "Photo"
            }`
          );
        }

        // Try to click next arrow
        const nextBtn = await page.$(
          '[aria-label*="Next"], [aria-label="Next"], button[aria-label*="next" i]'
        );
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
        if (!modal) return { debug: "No modal found", content: null };

        // Debug: List ALL content in modal
        const videos = modal.querySelectorAll("video");
        const images = modal.querySelectorAll("img");

        const debugInfo = {
          videos: Array.from(videos).map((v) => ({
            src: v.src,
            poster: v.getAttribute("poster"),
            hasSource: !!v.src,
          })),
          images: Array.from(images).map((img) => ({
            src: img.src,
            width: img.naturalWidth,
            height: img.naturalHeight,
            classes: img.className,
            alt: img.alt,
          })),
        };

        // Look for video first
        const video = modal.querySelector("video");
        if (video && video.src) {
          return {
            debug: debugInfo,
            content: {
              url: video.src,
              is_video: true,
              video_url: video.src,
            },
          };
        }

        // Try to find ANY reasonable image
        const images_all = modal.querySelectorAll("img");
        let bestImg = null;

        // Try different strategies to find the main image
        for (const img of images_all) {
          if (img.src && img.src.includes("scontent")) {
            // Skip obvious profile pics but be less strict
            if (
              !img.src.includes("s150x150") &&
              img.naturalWidth > 200 &&
              img.naturalHeight > 200
            ) {
              bestImg = img;
              break;
            }
          }
        }

        // If still no image, try even broader search
        if (!bestImg) {
          for (const img of images_all) {
            if (
              img.src &&
              img.src.startsWith("http") &&
              img.naturalWidth > 100 &&
              img.naturalHeight > 100
            ) {
              bestImg = img;
              break;
            }
          }
        }

        return {
          debug: debugInfo,
          content: bestImg
            ? {
                url: bestImg.src,
                is_video: false,
                video_url: null,
              }
            : null,
        };
      });

      // Log debug info for single posts
      console.log(
        `📋 Single post debug for ${shortcode}:`,
        JSON.stringify(content.debug, null, 2)
      );

      if (content && content.content) {
        mainDisplayUrl = content.content.url;
        isVideo = content.content.is_video;
      }
    }

    // Extract caption
    try {
      caption = await page.evaluate(() => {
        const modal = document.querySelector('[role="dialog"]');
        if (!modal) return "";

        // Look for caption text in various possible locations
        const captionSelectors = [
          'span[dir="auto"]',
          '[data-testid="post-caption"]',
          "article span",
          'div[style*="word-wrap"] span',
        ];

        for (const selector of captionSelectors) {
          const element = modal.querySelector(selector);
          if (
            element &&
            element.textContent &&
            element.textContent.length > 10
          ) {
            return element.textContent.trim();
          }
        }
        return "";
      });
    } catch (captionError) {
      console.log("Could not extract caption");
    }

    console.log(`🔍 Post extraction complete: ${shortcode}`);
    console.log(
      `  - Type: ${isCarousel ? "carousel" : isVideo ? "video" : "photo"}`
    );
    console.log(`  - Display URL: ${mainDisplayUrl || "NONE"}`);
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
      caption: caption,
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
        'button[aria-label*="close" i]',
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
        page.waitForSelector("article", { timeout: 12000 }),
        page.waitForSelector(
          'meta[property="og:image"], meta[property="og:video"]',
          { timeout: 12000 }
        ),
      ]);
      articleReady = await page
        .$("article")
        .then(Boolean)
        .catch(() => false);
    } catch (_) {
      articleReady = false;
    }
    if (DEBUG_LOG)
      console.log(
        `🧭 ${shortcode}: Article present: ${articleReady ? "yes" : "no"}`
      );

    const nextButtonSelector =
      '[aria-label*="Next"], [aria-label="Next"], button[aria-label*="next" i]';
    const maxSlides = 20;

    const carouselItems = [];
    let isCarousel = false;
    let isVideo = false;
    let mainDisplayUrl = "";
    let caption = "";

    // Helper: extract via meta tags when DOM is restricted or login wall
    const extractFromMetaTags = async () => {
      return await page.evaluate(() => {
        const ogVideo =
          document
            .querySelector('meta[property="og:video"]')
            ?.getAttribute("content") || "";
        const ogImage =
          document
            .querySelector('meta[property="og:image"]')
            ?.getAttribute("content") || "";
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
        const root = document.querySelector("article") || document.body;

        // Prefer video if present
        const videoEl = root.querySelector("video");
        const videoSrc =
          videoEl?.src || videoEl?.querySelector("source")?.src || "";
        if (videoSrc) {
          return {
            url: videoSrc,
            is_video: true,
            video_url: videoSrc,
          };
        }

        // Choose the best image candidate on the page
        const images = Array.from(root.querySelectorAll("img"));

        // Score images by size and likelihood of being content
        const scored = images
          .filter((img) => img.src && img.src.startsWith("http"))
          .map((img) => {
            const isProfilePic = (img.alt || "")
              .toLowerCase()
              .includes("profile picture");
            const tooSmall = img.naturalWidth < 300 || img.naturalHeight < 300;

            // Prefer highest resolution from srcset when available
            let bestSrc = img.src;
            if (img.srcset) {
              const parts = img.srcset.split(",").map((s) => s.trim());
              const last = parts[parts.length - 1];
              const urlPart = last?.split(" ")[0];
              if (urlPart) bestSrc = urlPart;
            }

            let score = img.naturalWidth * img.naturalHeight;
            if (isProfilePic) score = score / 10; // de-prioritize avatars
            if (tooSmall) score = score / 20; // de-prioritize tiny images

            return { img, bestSrc, score, isProfilePic, tooSmall };
          })
          .sort((a, b) => b.score - a.score);

        const top = scored[0];
        if (top && top.bestSrc) {
          return {
            url: top.bestSrc,
            is_video: false,
            video_url: null,
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
        if (DEBUG_LOG)
          console.log(
            `🧭 ${shortcode}: Using meta tags (${
              metaContent.is_video ? "video" : "image"
            })`
          );
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
          caption: "",
        };
      }
      // Try loading the mobile version as a last resort
      try {
        const mobileUrl = postUrl.replace(
          "https://www.instagram.com",
          "https://m.instagram.com"
        );
        if (DEBUG_LOG)
          console.log(`🧭 ${shortcode}: Falling back to mobile page`);
        await page.goto(mobileUrl, {
          waitUntil: "domcontentloaded",
          timeout: 20000,
        });
        await humanDelay(1000, 2000);
        usedMobileFallback = true;
        // After mobile load, try meta tags again immediately
        const mobileMeta = await extractFromMetaTags();
        if (mobileMeta) {
          usedMetaTags = true;
          if (DEBUG_LOG)
            console.log(
              `🧭 ${shortcode}: Using meta tags on mobile (${
                mobileMeta.is_video ? "video" : "image"
              })`
            );
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
            caption: "",
          };
        }
      } catch (_) {}
    }

    // Detect if carousel by presence of next button or multiple indicators
    isCarousel = !!(await page.$(nextButtonSelector));
    if (DEBUG_LOG)
      console.log(
        `🧭 ${shortcode}: Carousel detected: ${
          isCarousel ? "yes" : "no"
        } | Method: ${
          usedMetaTags
            ? usedMobileFallback
              ? "meta-mobile"
              : "meta"
            : usedMobileFallback
            ? "mobile-article"
            : "article"
        }`
      );

    if (isCarousel) {
      // Collect all carousel items by clicking through
      let slideIndex = 0;
      const seenUrls = new Set();
      let consecutiveFailures = 0;

      while (slideIndex < maxSlides && consecutiveFailures < 3) {
        // Extract current slide with improved logic
        const content = await page.evaluate(() => {
          const root = document.querySelector("article") || document.body;

          // Check for video first - try multiple approaches
          const videoEl = root.querySelector("video");
          if (videoEl) {
            // Try multiple sources for video URL
            const source = videoEl.querySelector("source");
            const srcUrl =
              source?.src || videoEl.src || videoEl.currentSrc || "";

            // If it's a blob URL, try to find the actual URL
            if (srcUrl.startsWith("blob:")) {
              // Look for meta tag with video URL
              const metaVideo = document.querySelector(
                'meta[property="og:video"]'
              );
              if (metaVideo?.content && metaVideo.content.startsWith("http")) {
                return {
                  url: metaVideo.content,
                  is_video: true,
                  video_url: metaVideo.content,
                };
              }

              // Try to find video URL in data attributes
              const dataUrl =
                videoEl.getAttribute("data-url") ||
                videoEl.getAttribute("data-src");
              if (dataUrl && dataUrl.startsWith("http")) {
                return { url: dataUrl, is_video: true, video_url: dataUrl };
              }

              // Skip blob URLs as they won't work for Telegram
              return null;
            }

            if (srcUrl && srcUrl.startsWith("http")) {
              return { url: srcUrl, is_video: true, video_url: srcUrl };
            }
          }

          // Look for image with more comprehensive selection
          const images = Array.from(root.querySelectorAll("img"));
          let bestImage = null;
          let bestScore = 0;

          for (const img of images) {
            const imgSrc = img.src || img.getAttribute("data-src") || ""; // Also check data-src
            if (!imgSrc) continue;

            // Skip obvious profile pictures and tiny images based on URL patterns
            const isProfilePicUrl =
              imgSrc.includes("s150x150") ||
              imgSrc.includes("s320x320") ||
              imgSrc.includes("profile_pic") ||
              imgSrc.includes("/_a/img/profile_pic");
            if (isProfilePicUrl) continue;

            // Prioritize scontent images
            if (imgSrc.includes("scontent")) {
              let currentWidth = img.naturalWidth || img.clientWidth;
              let currentHeight = img.naturalHeight || img.clientHeight;

              // Filter out very small images that are not profile pics but might be UI elements
              if (currentWidth < 200 || currentHeight < 200) continue;

              let bestSrc = imgSrc;
              if (img.srcset) {
                const parts = img.srcset.split(",").map((s) => s.trim());
                const highest = parts[parts.length - 1];
                const urlPart = highest?.split(" ")[0];
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
              const imgSrc = img.src || img.getAttribute("data-src") || "";
              if (!imgSrc || !imgSrc.startsWith("http")) continue;

              const isProfilePicUrl =
                imgSrc.includes("s150x150") ||
                imgSrc.includes("s320x320") ||
                imgSrc.includes("profile_pic") ||
                imgSrc.includes("/_a/img/profile_pic");
              if (isProfilePicUrl) continue;

              let currentWidth = img.naturalWidth || img.clientWidth;
              let currentHeight = img.naturalHeight || img.clientHeight;

              // Accept images that are reasonably large and not obvious UI elements
              if (currentWidth > 300 && currentHeight > 300) {
                // Increased minimum size for fallback
                bestImage = { url: imgSrc, is_video: false, video_url: null };
                break;
              }
            }
          }

          return bestImage;
        });

        if (
          content &&
          content.url &&
          !content.url.startsWith("blob:") &&
          !seenUrls.has(content.url)
        ) {
          carouselItems.push(content);
          seenUrls.add(content.url);
          console.log(
            `  📸 Slide ${carouselItems.length}: ${
              content.is_video ? "Video" : "Photo"
            }`
          );
          consecutiveFailures = 0;
        } else {
          consecutiveFailures++;
          console.log(
            `  ⚠️ Slide ${
              slideIndex + 1
            }: No valid content found or duplicate URL (consecutive failures: ${consecutiveFailures})`
          );

          // If we've seen the same content multiple times, we've likely reached the end
          if (consecutiveFailures >= 2) {
            console.log(
              `  🛑 Too many consecutive failures, likely reached end of carousel`
            );
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
            'button:has([aria-label*="next" i])',
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
          console.log(
            `  🛑 No next button found, stopping at slide ${slideIndex + 1}`
          );
          break;
        }

        await humanDelay(400, 800);
        try {
          // Try clicking with different methods
          await nextBtn.click({ delay: 50 }).catch(async () => {
            // If regular click fails, try programmatic click
            await page.evaluate((btn) => btn.click(), nextBtn);
          });

          await humanDelay(1500, 2500); // Longer wait for slide transition

          // Verify the slide actually changed by checking if content is different
          const newContent = await page.evaluate(() => {
            const root = document.querySelector("article") || document.body;
            const currentImg = root.querySelector('img[src*="scontent"]');
            const currentVideo = root.querySelector("video");
            return {
              imgSrc: currentImg?.src || "",
              videoSrc: currentVideo?.src || currentVideo?.currentSrc || "",
            };
          });

          // Check if we've reached the end of the carousel
          // Look for indicators that we're back at the first slide or no more content
          const isAtEnd = await page.evaluate(() => {
            // Check if we're back at the first slide (no "Previous" button visible)
            const prevButton = document.querySelector(
              '[aria-label*="Previous"], [aria-label*="previous" i]'
            );
            if (prevButton && prevButton.style.display === "none") {
              return true; // We're at the first slide again
            }

            // Check if there's no more content
            const hasContent = document.querySelector(
              'img[src*="scontent"], video[src]'
            );
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
        if (DEBUG_LOG)
          console.log(
            `🧭 ${shortcode}: single ${isVideo ? "video" : "image"} extracted`
          );
      }
    }

    // Extract caption text where possible
    try {
      caption = await page.evaluate(() => {
        const root = document.querySelector("article") || document.body;
        const candidates = [
          '[data-testid="post-container"] h1',
          'span[dir="auto"]',
          "h1",
          "article span",
        ];
        for (const sel of candidates) {
          const el = root.querySelector(sel);
          if (el && el.textContent && el.textContent.trim().length > 0) {
            return el.textContent.trim();
          }
        }
        return "";
      });
    } catch (_) {
      caption = "";
    }

    const method = usedMetaTags
      ? usedMobileFallback
        ? "meta-mobile"
        : "meta"
      : usedMobileFallback
      ? "mobile-article"
      : "article";
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
      is_pinned: false, // Will be updated by GraphQL processing
    };
    console.log(
      `✅ ${shortcode}: extraction complete → ${
        result.is_carousel
          ? `carousel ${carouselItems.length} items`
          : result.is_video
          ? "video"
          : "image"
      } | method=${method}`
    );
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
    const { pinnedPosts, regularPosts } = await scrapeWithWebProfileInfo(
      username,
      userAgent
    );

    if (pinnedPosts.length > 0 || regularPosts.length > 0) {
      console.log(
        `✅ Web Profile Info API found ${pinnedPosts.length} pinned posts and ${regularPosts.length} regular posts`
      );

      // Warn about large profiles and suggest limits
      const totalPosts = pinnedPosts.length + regularPosts.length;
      if (totalPosts >= 6) {
        console.log(
          `⚠️ Large profile detected (${totalPosts} posts). Consider limiting to avoid overwhelming servers.`
        );
        console.log(
          `💡 Processing will continue with current limits (max 3 pinned + 3 regular posts).`
        );
      }

      return { pinnedPosts, regularPosts }; // Return separated posts
    }

    // Fallback to browser automation - COMMENTED OUT DUE TO PUPPETEER ISSUES
    /*
    console.log(`🔄 Web Profile Info API failed, trying browser automation...`);
    let browserFailed = false;
    try {
      const browserPosts = await scrapeInstagramBrowser(username);
      if (browserPosts.length > 0) {
        console.log(`✅ Browser automation found ${browserPosts.length} posts`);
        return browserPosts;
      }
    } catch (browserError) {
      browserFailed = true;
      console.log(`❌ Browser automation also failed: ${browserError.message}`);
    }
    */

    // API failed - browser automation is currently disabled due to Puppeteer issues
    console.log(`🚨 CRITICAL: Instagram API failed for @${username}`);
    console.log(
      `🚨 This indicates a serious issue that needs immediate evaluation:`
    );
    console.log(`   - Instagram may have blocked automated access`);
    console.log(
      `   - Browser automation is currently disabled due to Puppeteer issues`
    );
    console.log(`   - Network connectivity issues may be present`);
    console.log(
      `🚨 PROCESS EVALUATION REQUIRED - Check logs and system status`
    );

    // Final fallback: return cached data if available
    console.log(
      `🔄 Attempting cache fallback due to API failure (browser automation disabled)...`
    );
    try {
      const cachedPosts = await getCachedRecentPosts(username);
      if (cachedPosts && cachedPosts.length > 0) {
        console.log(
          `📋 Using cached data for @${username} (${cachedPosts.length} posts)`
        );
        console.log(
          `⚠️ WARNING: This is an emergency fallback - no new posts will be processed`
        );
        console.log(
          `⚠️ System is operating in degraded mode - manual intervention may be required`
        );

        // Separate cached posts into pinned and regular
        const pinnedCached = cachedPosts.filter((post) => post.is_pinned);
        const regularCached = cachedPosts.filter((post) => !post.is_pinned);

        return {
          pinnedPosts: pinnedCached, // No limit - return all cached pinned posts
          regularPosts: regularCached, // No limit - return all cached regular posts
        };
      }
    } catch (cacheError) {
      console.log(`❌ Cache fallback also failed: ${cacheError.message}`);
    }

    console.log(
      `❌ COMPLETE FAILURE: No posts found for @${username} - API failed and browser automation disabled`
    );
    console.log(
      `🚨 SYSTEM STATUS: Instagram API scraping is non-functional, browser automation disabled`
    );
    console.log(
      `🚨 IMMEDIATE ACTION REQUIRED: Check Instagram API access and consider re-enabling browser automation`
    );
    return { pinnedPosts: [], regularPosts: [] };
  } catch (error) {
    console.error("Instagram scraping error:", error.message);
    return { pinnedPosts: [], regularPosts: [] };
  }
}

// Web Profile Info API scraping (URLs only)
async function scrapeWithWebProfileInfo(username, userAgent) {
  const profileUrl = `https://www.instagram.com/api/v1/users/web_profile_info/?username=${username}`;

  try {
    console.log(
      `🌐 Using Web Profile Info API for @${username} with consistent user agent`
    );

    const response = await axios.get(profileUrl, {
      headers: {
        "User-Agent": userAgent,
        Accept: "application/json",
        "Accept-Language": "en-US,en;q=0.9",
        "X-IG-App-ID": "936619743392459",
        "X-ASBD-ID": "129477",
        "X-IG-WWW-Claim": "0",
        "X-Requested-With": "XMLHttpRequest",
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-origin",
        Referer: "https://www.instagram.com/",
        Origin: "https://www.instagram.com",
      },
      timeout: 15000,
    });

    if (response.data && response.data.data && response.data.data.user) {
      const user = response.data.data.user;
      const allPostUrls = [];

      // Extract all post URLs from the profile data
      if (
        user.edge_owner_to_timeline_media &&
        user.edge_owner_to_timeline_media.edges
      ) {
        const edges = user.edge_owner_to_timeline_media.edges;

        // Limit to 6 posts maximum per poll cycle
        const maxPosts = 6;
        let postCount = 0;

        edges.forEach((edge) => {
          if (
            edge &&
            edge.node &&
            edge.node.shortcode &&
            postCount < maxPosts
          ) {
            const url = `https://www.instagram.com/p/${edge.node.shortcode}/`;
            allPostUrls.push({
              url,
              shortcode: edge.node.shortcode,
              is_pinned: false, // Will be updated by pinned detection
            });
            postCount++;
          }
        });

        console.log(
          `📱 Web Profile Info API collected ${allPostUrls.length} post URLs (limited to ${maxPosts} max)`
        );

        // Now process posts with optimized pinned detection and full data fetching
        const { pinnedPosts, regularPosts } =
          await processPostsWithPinnedDetection(allPostUrls, userAgent);

        return {
          pinnedPosts,
          regularPosts, // No limit - cache all posts
        };
      }
    }

    console.log(`⚠️ Web Profile Info API returned no posts`);
    return { pinnedPosts: [], regularPosts: [] };
  } catch (error) {
    console.log(`❌ Web Profile Info API failed: ${error.message}`);
    requestTracker.trackInstagram(profileUrl, false, error.message);

    if (error.response?.status === 429) {
      console.log(`🚫 Rate limit detected in Web Profile Info API`);
      await rateLimitDelay();
      increaseErrorMultiplier();
    } else if (error.response?.status === 401) {
      console.log(
        `🔐 Authentication failed (401) - Instagram may have detected automated requests`
      );
    }

    // Return empty results on failure
    return { pinnedPosts: [], regularPosts: [] };
  }
}

// Optimized post processing that combines pinned detection with full data fetching
async function processPostsWithPinnedDetection(allPosts, userAgent) {
  console.log(
    `🔍 Starting optimized post processing for ${allPosts.length} posts`
  );

  const pinnedPosts = [];
  const regularPosts = [];
  let pinnedCount = 0;
  let pinnedScanningStopped = false;
  let processedCount = 0;

  for (let i = 0; i < allPosts.length; i++) {
    const post = allPosts[i];

    // Stop processing if we've hit our limits (6 posts max per poll)
    if (processedCount >= 6) {
      console.log(
        `📊 Processing limit reached (${processedCount} posts), stopping`
      );
      break;
    }

    // Process all posts to determine pinned status, but prioritize pinned posts
    if (!pinnedScanningStopped) {
      try {
        console.log(
          `📌 Processing post ${i + 1} with pinned detection: ${post.shortcode}`
        );

        // Use InstagramCarouselDownloader to get both pinned status AND full data in one call
        const carouselDownloader = new InstagramCarouselDownloader(userAgent);
        const result = await carouselDownloader.downloadCarousel(post.url);

        if (result && result.status && result.data && result.data.length > 0) {
          // Extract pinned status from the full data
          const isPinned = result.isPinned || result.data[0]?.isPinned || false;
          post.is_pinned = isPinned;
          post.fullData = result.data; // Store the full data for later use

          console.log(
            `🔍 Pinned status for ${post.shortcode}: ${
              isPinned ? "PINNED" : "NOT PINNED"
            } (from result.isPinned: ${
              result.isPinned
            }, from result.data[0].isPinned: ${result.data[0]?.isPinned})`
          );

          if (isPinned) {
            console.log(`📌 Post ${post.shortcode} is PINNED`);
            pinnedPosts.push(post);
            pinnedCount++;
            processedCount++;

            // Stop scanning for pinned posts if we've found 3
            if (pinnedCount >= 3) {
              console.log(`📌 Found 3 pinned posts, stopping pinned scanning`);
              pinnedScanningStopped = true;
            }
          } else {
            console.log(`📌 Post ${post.shortcode} is NOT pinned`);
            regularPosts.push(post);
            processedCount++;

            // Continue scanning for pinned posts even after finding a non-pinned post
            // This ensures we don't miss pinned posts that might be mixed in the feed
            console.log(
              `📌 Found non-pinned post, continuing to scan for pinned posts`
            );
          }

          // Apply GraphQL delay for the combined call
          const carouselSize = result.data.length;
          await graphqlDelay(isPinned ? "pinned" : "regular", carouselSize);
        } else {
          console.log(
            `⚠️ Failed to get data for ${post.shortcode}, treating as regular post`
          );
          post.is_pinned = false;
          regularPosts.push(post);
          processedCount++;
          pinnedScanningStopped = true;
        }
      } catch (error) {
        console.log(`⚠️ Error processing ${post.shortcode}: ${error.message}`);
        // If we can't determine pinned status, treat as regular post
        post.is_pinned = false;
        regularPosts.push(post);
        processedCount++;
        pinnedScanningStopped = true;
      }
    } else {
      // Pinned scanning stopped, add remaining posts as regular (up to limit)
      if (processedCount < 6) {
        post.is_pinned = false;
        regularPosts.push(post);
        processedCount++;
      }
    }
  }

  console.log(
    `📌 Optimized processing complete: ${pinnedPosts.length} pinned, ${regularPosts.length} regular (${processedCount} total processed)`
  );
  return { pinnedPosts, regularPosts };
}

// Check if post was already processed (excluding pinned posts from recent checks)
async function isPostProcessed(postId, username) {
  // Use Supabase if available, otherwise fallback to SQLite
  if (supabaseManager && supabaseManager.isConnected) {
    try {
      return await supabaseManager.isPostProcessed(postId, username);
    } catch (error) {
      console.error(
        `❌ Supabase post processing check failed: ${error.message}`
      );
      // Fallback to SQLite
    }
  }

  // Fallback to SQLite
  if (db) {
    return new Promise((resolve, reject) => {
      // Check if post exists
      db.get(
        `
        SELECT id, is_pinned, pinned_at, processed_at 
        FROM processed_posts 
        WHERE id = ? AND username = ?
      `,
        [postId, username],
        (err, row) => {
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
                console.log(
                  `📌 Pinned post ${postId} was pinned ${hoursSincePinned.toFixed(
                    1
                  )} hours ago - allowing re-processing`
                );
                resolve(false);
              } else {
                // Old pinned post - treat as processed to avoid spam
                console.log(
                  `📌 Old pinned post ${postId} was pinned ${hoursSincePinned.toFixed(
                    1
                  )} hours ago - treating as processed`
                );
                resolve(true);
              }
            } else {
              // Regular post - always treat as processed once processed
              resolve(true);
            }
          }
        }
      );
    });
  }

  return false; // Default to not processed if no database available
}

// Mark post as processed
async function markPostAsProcessed(
  postId,
  username,
  postUrl,
  postType,
  isPinned = false
) {
  // Use Supabase if available, otherwise fallback to SQLite
  if (supabaseManager && supabaseManager.isConnected) {
    try {
      await supabaseManager.markPostAsProcessed(
        postId,
        username,
        postUrl,
        postType,
        isPinned
      );
      return true;
    } catch (error) {
      console.error(`❌ Supabase post marking failed: ${error.message}`);
      // Fallback to SQLite
    }
  }

  // Fallback to SQLite
  if (db) {
    return new Promise((resolve, reject) => {
      const now = new Date().toISOString();

      if (isPinned) {
        // For pinned posts, update existing record or insert new one
        db.run(
          `
          INSERT OR REPLACE INTO processed_posts 
          (id, username, post_url, post_type, is_pinned, pinned_at, processed_at) 
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
          [postId, username, postUrl, postType, true, now, now],
          function (err) {
            if (err) reject(err);
            else {
              console.log(
                `📌 Marked pinned post ${postId} as processed (SQLite)`
              );
              resolve(this.lastID);
            }
          }
        );
      } else {
        // For regular posts, insert new record
        db.run(
          "INSERT INTO processed_posts (id, username, post_url, post_type, is_pinned) VALUES (?, ?, ?, ?, ?)",
          [postId, username, postUrl, postType, false],
          function (err) {
            if (err) reject(err);
            else resolve(this.lastID);
          }
        );
      }
    });
  }

  return false;
}

// Cache functions for recent posts
// Get cached recent posts for a username (with in-memory cache)
async function getCachedRecentPosts(username) {
  // First check in-memory cache for faster access
  if (global.postCache && global.postCache[username]) {
    console.log(
      `📊 Using in-memory cache for @${username} (${global.postCache[username].length} posts)`
    );
    return global.postCache[username];
  }

  // Use Supabase if available, otherwise fallback to SQLite
  if (supabaseManager && supabaseManager.isConnected) {
    try {
      const cachedPosts = await supabaseManager.getCachedRecentPosts(username);

      // Update in-memory cache
      if (!global.postCache) {
        global.postCache = {};
      }
      global.postCache[username] = cachedPosts;

      return cachedPosts;
    } catch (error) {
      console.error(`❌ Supabase cache retrieval failed: ${error.message}`);
      // Fallback to SQLite
    }
  }

  // Fallback to SQLite
  if (db) {
    return new Promise((resolve, reject) => {
      db.all(
        `
        SELECT post_url, shortcode, is_pinned, post_order, cached_at 
        FROM recent_posts_cache 
        WHERE username = ? 
        ORDER BY is_pinned DESC, post_order ASC
      `,
        [username],
        (err, rows) => {
          if (err) reject(err);
          else {
            const cachedPosts = rows || [];

            // Update in-memory cache
            if (!global.postCache) {
              global.postCache = {};
            }
            global.postCache[username] = cachedPosts;

            resolve(cachedPosts);
          }
        }
      );
    });
  }

  return [];
}

// Update cache with new recent posts
async function updateRecentPostsCache(username, posts) {
  // Use Supabase if available, otherwise fallback to SQLite
  if (supabaseManager && supabaseManager.isConnected) {
    try {
      await supabaseManager.updateRecentPostsCache(username, posts);

      // Update in-memory cache
      if (!global.postCache) {
        global.postCache = {};
      }
      global.postCache[username] = posts.map((post, idx) => ({
        post_url: post.url,
        shortcode:
          post.shortcode || post.url.match(/\/(p|reel|tv)\/([^\/]+)\//)?.[2],
        is_pinned: post.is_pinned || false,
        post_order: idx + 1,
        cached_at: new Date().toISOString(),
      }));

      console.log(
        `✅ Updated Supabase cache with ${posts.length} posts for @${username} (memory + database)`
      );
      return;
    } catch (error) {
      console.error(`❌ Supabase cache update failed: ${error.message}`);
      // Fallback to SQLite
    }
  }

  // Fallback to SQLite
  if (db) {
    return new Promise((resolve, reject) => {
      // First, remove old cache entries for this user
      db.run(
        "DELETE FROM recent_posts_cache WHERE username = ?",
        [username],
        function (err) {
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
            const shortcode =
              post.shortcode ||
              post.url.match(/\/(p|reel|tv)\/([^\/]+)\//)?.[2];
            const isPinned = post.is_pinned || false;
            const postOrder = index + 1;
            const now = new Date().toISOString();

            stmt.run(
              [username, post.url, shortcode, isPinned, postOrder, now],
              function (err) {
                if (err) {
                  console.log(
                    `❌ Cache update error for ${shortcode}: ${err.message}`
                  );
                }
                completed++;
                if (completed === total) {
                  stmt.finalize();

                  // Update in-memory cache
                  if (!global.postCache) {
                    global.postCache = {};
                  }
                  global.postCache[username] = posts.map((post, idx) => ({
                    post_url: post.url,
                    shortcode:
                      post.shortcode ||
                      post.url.match(/\/(p|reel|tv)\/([^\/]+)\//)?.[2],
                    is_pinned: post.is_pinned || false,
                    post_order: idx + 1,
                    cached_at: now,
                  }));

                  console.log(
                    `✅ Updated SQLite cache with ${total} posts for @${username} (memory + database)`
                  );
                  resolve();
                }
              }
            );
          });
        }
      );
    });
  }
}

// Find new posts not in cache
async function findNewPosts(username, fetchedPosts) {
  try {
    const cachedPosts = await getCachedRecentPosts(username);
    const cachedShortcodes = new Set(cachedPosts.map((p) => p.shortcode));

    // Debug: Log cache details
    console.log(`🔍 Cache debug for @${username}:`);
    console.log(`   - Fetched posts: ${fetchedPosts.length}`);
    console.log(`   - Cached posts: ${cachedPosts.length}`);
    console.log(
      `   - Cached shortcodes: ${Array.from(cachedShortcodes).join(", ")}`
    );

    const newPosts = fetchedPosts.filter((post) => {
      const shortcode =
        post.shortcode || post.url.match(/\/(p|reel|tv)\/([^\/]+)\//)?.[2];
      return shortcode && !cachedShortcodes.has(shortcode);
    });

    console.log(
      `📊 Cache comparison: ${fetchedPosts.length} fetched, ${cachedPosts.length} cached, ${newPosts.length} new`
    );
    return newPosts;
  } catch (error) {
    console.error(`❌ Error finding new posts: ${error.message}`);
    return [];
  }
}

// Cleanup queue management
const cleanupQueue = {
  isRunning: false,
  queue: [],
  pollingBlocked: false,

  async addToQueue(operation) {
    this.queue.push(operation);
    console.log(
      `📋 Added cleanup operation to queue (${this.queue.length} pending)`
    );

    if (!this.isRunning) {
      await this.processQueue();
    }
  },

  async processQueue() {
    if (this.isRunning || this.queue.length === 0) {
      return;
    }

    this.isRunning = true;
    console.log(
      `🔄 Starting cleanup queue processing (${this.queue.length} operations)`
    );

    while (this.queue.length > 0) {
      const operation = this.queue.shift();
      try {
        console.log(`🔄 Executing cleanup operation: ${operation.name}`);
        await operation.execute();
        console.log(`✅ Cleanup operation completed: ${operation.name}`);

        // Add delay between operations
        if (this.queue.length > 0) {
          console.log(`⏳ Waiting 2 seconds before next cleanup operation...`);
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      } catch (error) {
        console.error(
          `❌ Cleanup operation failed: ${operation.name} - ${error.message}`
        );
      }
    }

    this.isRunning = false;
    console.log(`✅ Cleanup queue processing completed`);
  },

  async waitForCompletion() {
    if (this.isRunning) {
      console.log(
        `⏳ Polling blocked - waiting for cleanup operations to complete...`
      );
      this.pollingBlocked = true;

      while (this.isRunning) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      console.log(`✅ Cleanup completed - polling can proceed`);
      this.pollingBlocked = false;
    }
  },
};

// Enhanced cache cleanup with transactions and batching
async function cleanExpiredCache() {
  try {
    console.log("🧹 Starting enhanced cache cleanup...");

    // Use Supabase if available, otherwise fallback to SQLite
    if (supabaseManager && supabaseManager.isConnected) {
      try {
        console.log("🧹 Using Supabase for cache cleanup...");
        await supabaseManager.cleanExpiredCache();

        // Update memory cache atomically
        await updateMemoryCacheAfterCleanup();

        // Run cache integrity check
        console.log("🔍 Running post-cleanup cache integrity check...");
        await validateCacheIntegrity();

        return { cacheRemoved: 0, processedRemoved: 0 }; // Supabase manager handles the counts
      } catch (error) {
        console.error(`❌ Supabase cache cleanup failed: ${error.message}`);
        console.log("🔄 Falling back to SQLite...");
        // Continue to SQLite fallback
      }
    }

    // Fallback to SQLite
    if (db) {
      console.log("🧹 Using SQLite for cache cleanup...");

      return new Promise(async (resolve, reject) => {
        try {
          // Use database transaction
          await new Promise((resolveTransaction, rejectTransaction) => {
            db.serialize(() => {
              db.run("BEGIN TRANSACTION");

              const weekAgo = new Date();
              weekAgo.setDate(weekAgo.getDate() - 28); // 4 weeks instead of 7 days

              console.log(
                `📅 Cleaning cache entries older than: ${weekAgo.toLocaleDateString()}`
              );

              // Get all users with cache data
              db.all(
                "SELECT DISTINCT username FROM recent_posts_cache",
                (err, users) => {
                  if (err) {
                    db.run("ROLLBACK");
                    rejectTransaction(err);
                    return;
                  }

                  let totalCacheRemoved = 0;
                  let totalProcessedRemoved = 0;
                  let completedUsers = 0;

                  if (users.length === 0) {
                    db.run("COMMIT");
                    resolveTransaction({
                      cacheRemoved: 0,
                      processedRemoved: 0,
                    });
                    return;
                  }

                  users.forEach((user, index) => {
                    // Clean cache for each user (keep last 8 posts)
                    db.all(
                      `SELECT shortcode FROM recent_posts_cache 
                     WHERE username = ? 
                     ORDER BY cached_at ASC`,
                      [user.username],
                      (err, posts) => {
                        if (err) {
                          db.run("ROLLBACK");
                          rejectTransaction(err);
                          return;
                        }

                        if (posts.length > 8) {
                          const postsToDelete = posts.slice(
                            0,
                            posts.length - 8
                          );
                          const shortcodesToDelete = postsToDelete.map(
                            (p) => p.shortcode
                          );

                          if (shortcodesToDelete.length > 0) {
                            const placeholders = shortcodesToDelete
                              .map(() => "?")
                              .join(",");
                            db.run(
                              `DELETE FROM recent_posts_cache 
                             WHERE username = ? AND shortcode IN (${placeholders})`,
                              [user.username, ...shortcodesToDelete],
                              function (err) {
                                if (err) {
                                  db.run("ROLLBACK");
                                  rejectTransaction(err);
                                  return;
                                }
                                totalCacheRemoved += this.changes;
                                console.log(
                                  `   🗑️ @${user.username}: Removed ${this.changes} old cache entries (SQLite)`
                                );
                              }
                            );
                          }
                        }

                        // Clean old processed posts (keep last 8)
                        db.all(
                          `SELECT id FROM processed_posts 
                         WHERE username = ? AND is_pinned = FALSE
                         ORDER BY processed_at ASC`,
                          [user.username],
                          (err, processedPosts) => {
                            if (err) {
                              db.run("ROLLBACK");
                              rejectTransaction(err);
                              return;
                            }

                            if (processedPosts.length > 8) {
                              const postsToDelete = processedPosts.slice(
                                0,
                                processedPosts.length - 8
                              );
                              const idsToDelete = postsToDelete.map(
                                (p) => p.id
                              );

                              if (idsToDelete.length > 0) {
                                const placeholders = idsToDelete
                                  .map(() => "?")
                                  .join(",");
                                db.run(
                                  `DELETE FROM processed_posts 
                                 WHERE username = ? AND id IN (${placeholders})`,
                                  [user.username, ...idsToDelete],
                                  function (err) {
                                    if (err) {
                                      db.run("ROLLBACK");
                                      rejectTransaction(err);
                                      return;
                                    }
                                    totalProcessedRemoved += this.changes;
                                    console.log(
                                      `   🗑️ @${user.username}: Removed ${this.changes} old processed posts (SQLite)`
                                    );
                                  }
                                );
                              }
                            }

                            completedUsers++;
                            if (completedUsers === users.length) {
                              db.run("COMMIT");
                              resolveTransaction({
                                cacheRemoved: totalCacheRemoved,
                                processedRemoved: totalProcessedRemoved,
                              });
                            }
                          }
                        );
                      }
                    );
                  });
                }
              );
            });
          });

          console.log(
            `✅ Enhanced SQLite cache cleanup completed: ${totalCacheRemoved} cache entries, ${totalProcessedRemoved} processed posts removed`
          );

          // Update memory cache atomically
          await updateMemoryCacheAfterCleanup();

          // Run cache integrity check
          console.log("🔍 Running post-cleanup cache integrity check...");
          await validateCacheIntegrity();

          resolve({
            cacheRemoved: totalCacheRemoved,
            processedRemoved: totalProcessedRemoved,
          });
        } catch (error) {
          console.error(
            `❌ Enhanced SQLite cache cleanup failed: ${error.message}`
          );
          reject(error);
        }
      });
    }

    return { cacheRemoved: 0, processedRemoved: 0 };
  } catch (error) {
    console.error(`❌ Enhanced cache cleanup failed: ${error.message}`);
    throw error;
  }
}

// Update memory cache after database cleanup
async function updateMemoryCacheAfterCleanup() {
  try {
    console.log("🔄 Updating memory cache after database cleanup...");

    // Clear existing memory cache
    if (global.postCache) {
      global.postCache = {};
    }

    // Reload cache from database
    await loadExistingCache();

    console.log("✅ Memory cache updated after cleanup");
  } catch (error) {
    console.error(
      `❌ Failed to update memory cache after cleanup: ${error.message}`
    );
  }
}

// Storage-based cleanup when database size exceeds limit
async function checkStorageLimitAndCleanup() {
  try {
    const dbPath =
      process.env.NODE_ENV === "production"
        ? "/opt/render/project/src/data/instagram_tracker.db"
        : "./instagram_tracker.db";

    const fs = require("fs");
    const stats = fs.statSync(dbPath);
    const dbSizeMB = stats.size / (1024 * 1024);

    // Trigger cleanup if database exceeds 500MB
    if (dbSizeMB > 500) {
      console.log(
        `⚠️ Database size (${dbSizeMB.toFixed(2)}MB) exceeds 500MB limit`
      );
      console.log("📋 Scheduling storage-based cleanup...");

      await cleanupQueue.addToQueue({
        name: "Storage Cleanup",
        execute: async () => {
          await performStorageCleanup();
        },
      });
    }
  } catch (error) {
    console.error(`❌ Storage limit check failed: ${error.message}`);
  }
}

// Perform storage-based cleanup (delete all except last 8 posts)
async function performStorageCleanup() {
  return new Promise(async (resolve, reject) => {
    try {
      console.log("🧹 Starting storage-based cleanup...");

      await new Promise((resolveTransaction, rejectTransaction) => {
        db.serialize(() => {
          db.run("BEGIN TRANSACTION");

          // Get all users
          db.all(
            "SELECT DISTINCT username FROM recent_posts_cache",
            (err, users) => {
              if (err) {
                db.run("ROLLBACK");
                rejectTransaction(err);
                return;
              }

              let totalCacheRemoved = 0;
              let totalProcessedRemoved = 0;
              let completedUsers = 0;

              if (users.length === 0) {
                db.run("COMMIT");
                resolveTransaction({ cacheRemoved: 0, processedRemoved: 0 });
                return;
              }

              users.forEach((user) => {
                // Keep only last 8 posts for each user
                db.all(
                  `SELECT shortcode FROM recent_posts_cache 
                 WHERE username = ? 
                 ORDER BY cached_at DESC LIMIT 8`,
                  [user.username],
                  (err, keepPosts) => {
                    if (err) {
                      db.run("ROLLBACK");
                      rejectTransaction(err);
                      return;
                    }

                    const keepShortcodes = keepPosts.map((p) => p.shortcode);

                    if (keepShortcodes.length > 0) {
                      const placeholders = keepShortcodes
                        .map(() => "?")
                        .join(",");
                      db.run(
                        `DELETE FROM recent_posts_cache 
                       WHERE username = ? AND shortcode NOT IN (${placeholders})`,
                        [user.username, ...keepShortcodes],
                        function (err) {
                          if (err) {
                            db.run("ROLLBACK");
                            rejectTransaction(err);
                            return;
                          }
                          totalCacheRemoved += this.changes;
                          console.log(
                            `   🗑️ @${user.username}: Removed ${this.changes} old cache entries (storage cleanup)`
                          );
                        }
                      );
                    }

                    // Keep only last 8 processed posts for each user
                    db.all(
                      `SELECT id FROM processed_posts 
                     WHERE username = ? AND is_pinned = FALSE
                     ORDER BY processed_at DESC LIMIT 8`,
                      [user.username],
                      (err, keepProcessedPosts) => {
                        if (err) {
                          db.run("ROLLBACK");
                          rejectTransaction(err);
                          return;
                        }

                        const keepIds = keepProcessedPosts.map((p) => p.id);

                        if (keepIds.length > 0) {
                          const placeholders = keepIds.map(() => "?").join(",");
                          db.run(
                            `DELETE FROM processed_posts 
                           WHERE username = ? AND is_pinned = FALSE AND id NOT IN (${placeholders})`,
                            [user.username, ...keepIds],
                            function (err) {
                              if (err) {
                                db.run("ROLLBACK");
                                rejectTransaction(err);
                                return;
                              }
                              totalProcessedRemoved += this.changes;
                              console.log(
                                `   🗑️ @${user.username}: Removed ${this.changes} old processed posts (storage cleanup)`
                              );
                            }
                          );
                        }

                        completedUsers++;
                        if (completedUsers === users.length) {
                          db.run("COMMIT");
                          resolveTransaction({
                            cacheRemoved: totalCacheRemoved,
                            processedRemoved: totalProcessedRemoved,
                          });
                        }
                      }
                    );
                  }
                );
              });
            }
          );
        });
      });

      console.log(
        `✅ Storage-based cleanup completed: ${totalCacheRemoved} cache entries, ${totalProcessedRemoved} processed posts removed`
      );

      // Update memory cache atomically
      await updateMemoryCacheAfterCleanup();

      // Run cache integrity check
      console.log("🔍 Running post-storage-cleanup cache integrity check...");
      await validateCacheIntegrity();

      resolve({
        cacheRemoved: totalCacheRemoved,
        processedRemoved: totalProcessedRemoved,
      });
    } catch (error) {
      console.error(`❌ Storage-based cleanup failed: ${error.message}`);
      reject(error);
    }
  });
}

// Get last cleanup date
async function getLastCleanupDate() {
  // Use Supabase if available, otherwise fallback to SQLite
  if (supabaseManager && supabaseManager.isConnected) {
    try {
      return await supabaseManager.getLastCleanupDate();
    } catch (error) {
      console.error(`❌ Supabase cleanup date check failed: ${error.message}`);
      // Fallback to SQLite
    }
  }

  // Fallback to SQLite
  if (db) {
    return new Promise((resolve, reject) => {
      db.get(
        `
        SELECT cleaned_at FROM cache_cleanup_log 
        ORDER BY cleaned_at DESC LIMIT 1
      `,
        (err, row) => {
          if (err) reject(err);
          else {
            // If no cleanup record exists, return current date (no cleanup needed yet)
            const defaultDate = new Date();
            defaultDate.setDate(defaultDate.getDate() - 1); // Set to yesterday as default
            resolve(row ? new Date(row.cleaned_at) : defaultDate);
          }
        }
      );
    });
  }

  // Default fallback
  const defaultDate = new Date();
  defaultDate.setDate(defaultDate.getDate() - 8); // Set to 8 days ago to trigger cleanup
  return defaultDate;
}

// Update last cleanup date
async function updateLastCleanupDate(postsRemoved = 0, username = null) {
  // Use Supabase if available, otherwise fallback to SQLite
  if (supabaseManager && supabaseManager.isConnected) {
    try {
      await supabaseManager.updateLastCleanupDate(postsRemoved, username);
      return true;
    } catch (error) {
      console.error(`❌ Supabase cleanup date update failed: ${error.message}`);
      // Fallback to SQLite
    }
  }

  // Fallback to SQLite
  if (db) {
    return new Promise((resolve, reject) => {
      db.run(
        `
        INSERT INTO cache_cleanup_log (posts_removed, username) 
        VALUES (?, ?)
      `,
        [postsRemoved, username],
        function (err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  }

  return false;
}

// Check cache on app boot and load existing cache data
async function checkCacheOnBoot() {
  try {
    const lastCleanup = await getLastCleanupDate();
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    if (lastCleanup < weekAgo) {
      console.log("📊 Cache cleanup would be due (7+ days since last cleanup)");
      console.log(`   Last cleanup: ${lastCleanup.toLocaleDateString()}`);
      console.log(
        `   Days since: ${Math.floor(
          (new Date() - lastCleanup) / (1000 * 60 * 60 * 24)
        )}`
      );
    } else {
      console.log("✅ Cache is up to date");
      console.log(`   Last cleanup: ${lastCleanup.toLocaleDateString()}`);
    }

    // Load existing cache data into memory for faster access
    await loadExistingCache();
  } catch (error) {
    console.log(`⚠️ Cache cleanup check failed: ${error.message}`);
    console.log("✅ Cache system initialized (first run)");
  }
}

// Load existing cache data into memory
async function loadExistingCache() {
  try {
    // Use Supabase if available, otherwise fallback to SQLite
    if (supabaseManager && supabaseManager.isConnected) {
      console.log("📊 Loading cache from Supabase...");

      try {
        // Get Supabase stats to check cache status
        const stats = await supabaseManager.getStats();
        console.log(`📊 Supabase collections:`, stats.collections);

        // Get all cached usernames from Supabase
        const { data: cachedUsers, error } = await supabaseManager.client
          .from("recent_posts_cache")
          .select("username")
          .order("username");

        if (error) {
          console.error(
            `❌ Failed to get cached users from Supabase: ${error.message}`
          );
          return;
        }

        const uniqueUsernames = [
          ...new Set(cachedUsers.map((u) => u.username)),
        ];
        console.log(
          `📊 Found ${uniqueUsernames.length} cached users in Supabase`
        );

        if (uniqueUsernames.length === 0) {
          console.log("📊 No existing cache data found in Supabase");
          return;
        }

        console.log(
          `📊 Loading cache for ${uniqueUsernames.length} users from Supabase...`
        );

        let loadedUsers = 0;
        let totalPosts = 0;

        // Load cache for each user
        for (const username of uniqueUsernames) {
          const cachedPosts = await getCachedRecentPosts(username);
          if (cachedPosts.length > 0) {
            console.log(
              `   📱 @${username}: ${cachedPosts.length} posts cached (Supabase)`
            );

            // Store in global cache for faster access
            if (!global.postCache) {
              global.postCache = {};
            }
            global.postCache[username] = cachedPosts;
            loadedUsers++;
            totalPosts += cachedPosts.length;
          } else {
            console.log(`   ⚠️ @${username}: 0 posts cached (empty cache)`);
          }
        }

        console.log(
          `✅ Supabase cache loaded successfully (${loadedUsers} users, ${totalPosts} total posts)`
        );

        // Check if cache loading was successful
        if (loadedUsers === 0 && uniqueUsernames.length > 0) {
          console.log(
            "⚠️ Supabase cache loading resulted in 0 posts - attempting automatic reload..."
          );
          await retryCacheLoad();
        }

        return; // Successfully loaded from Supabase
      } catch (error) {
        console.error(`❌ Supabase cache loading failed: ${error.message}`);
        console.log("🔄 Falling back to SQLite...");
        // Continue to SQLite fallback
      }
    }

    // Fallback to SQLite
    if (db) {
      console.log("📊 Loading cache from SQLite...");

      // Debug: Check if database file exists and has data
      const fs = require("fs");
      const path = require("path");

      if (fs.existsSync(dbPath)) {
        const stats = fs.statSync(dbPath);
        console.log(`📊 Database file exists: ${dbPath} (${stats.size} bytes)`);
      } else {
        console.log(`⚠️ Database file does not exist: ${dbPath}`);
      }

      // Debug: Check database schema and tables
      console.log(`🔍 Checking database schema...`);
      const tables = await new Promise((resolve, reject) => {
        db.all(
          "SELECT name FROM sqlite_master WHERE type='table'",
          (err, rows) => {
            if (err) {
              console.error(`❌ Schema query error: ${err.message}`);
              reject(err);
            } else {
              console.log(
                `📊 Database tables: ${
                  rows ? rows.map((r) => r.name).join(", ") : "none"
                }`
              );
              resolve(rows || []);
            }
          }
        );
      });

      // Debug: Check if recent_posts_cache table exists and has data
      const tableExists = tables.some((t) => t.name === "recent_posts_cache");
      console.log(`📊 recent_posts_cache table exists: ${tableExists}`);

      if (tableExists) {
        const tableCount = await new Promise((resolve, reject) => {
          db.get(
            "SELECT COUNT(*) as count FROM recent_posts_cache",
            (err, row) => {
              if (err) {
                console.error(`❌ Table count error: ${err.message}`);
                reject(err);
              } else {
                console.log(
                  `📊 recent_posts_cache table has ${row ? row.count : 0} rows`
                );
                resolve(row ? row.count : 0);
              }
            }
          );
        });

        if (tableCount > 0) {
          // Show sample data
          const sampleData = await new Promise((resolve, reject) => {
            db.all(
              "SELECT username, shortcode, cached_at FROM recent_posts_cache LIMIT 5",
              (err, rows) => {
                if (err) {
                  console.error(`❌ Sample data error: ${err.message}`);
                  reject(err);
                } else {
                  console.log(`📊 Sample cache data:`, rows);
                  resolve(rows || []);
                }
              }
            );
          });
        }
      }

      // Get all cached usernames
      const cachedUsers = await new Promise((resolve, reject) => {
        db.all(
          "SELECT DISTINCT username FROM recent_posts_cache",
          (err, rows) => {
            if (err) {
              console.error(`❌ Database query error: ${err.message}`);
              reject(err);
            } else {
              console.log(
                `📊 Found ${rows ? rows.length : 0} cached users in database`
              );
              resolve(rows || []);
            }
          }
        );
      });

      if (cachedUsers.length === 0) {
        console.log("📊 No existing cache data found in SQLite");
        return;
      }

      console.log(
        `📊 Loading cache for ${cachedUsers.length} users from SQLite...`
      );

      let loadedUsers = 0;
      let totalPosts = 0;

      // Load cache for each user
      for (const user of cachedUsers) {
        const cachedPosts = await getCachedRecentPosts(user.username);
        if (cachedPosts.length > 0) {
          console.log(
            `   📱 @${user.username}: ${cachedPosts.length} posts cached (SQLite)`
          );

          // Store in global cache for faster access
          if (!global.postCache) {
            global.postCache = {};
          }
          global.postCache[user.username] = cachedPosts;
          loadedUsers++;
          totalPosts += cachedPosts.length;
        } else {
          console.log(`   ⚠️ @${user.username}: 0 posts cached (empty cache)`);
        }
      }

      console.log(
        `✅ SQLite cache loaded successfully (${loadedUsers} users, ${totalPosts} total posts)`
      );

      // Check if cache loading was successful
      if (loadedUsers === 0 && cachedUsers.length > 0) {
        console.log(
          "⚠️ SQLite cache loading resulted in 0 posts - attempting automatic reload..."
        );
        await retryCacheLoad();
      }
    }
  } catch (error) {
    console.error(`❌ Failed to load existing cache: ${error.message}`);
    console.log("🔄 Attempting automatic cache reload...");
    await retryCacheLoad();
  }
}

// Automatic cache reload with retry logic
async function retryCacheLoad() {
  try {
    console.log("🔄 Automatic cache reload attempt...");

    // Clear any existing memory cache
    if (global.postCache) {
      global.postCache = {};
      console.log("🧹 Cleared existing memory cache");
    }

    // Wait a moment for database to stabilize
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Use Supabase if available, otherwise fallback to SQLite
    if (supabaseManager && supabaseManager.isConnected) {
      try {
        console.log("🔄 Attempting Supabase cache reload...");

        // Force reload from Supabase
        const { data: cachedUsers, error } = await supabaseManager.client
          .from("recent_posts_cache")
          .select("username")
          .order("username");

        if (cachedUsers.length === 0) {
          console.log("📊 No cached users found in Supabase during reload");
          return;
        }

        console.log(
          `🔄 Reloading cache for ${cachedUsers.length} users from Supabase...`
        );

        let loadedUsers = 0;
        let totalPosts = 0;

        for (const username of cachedUsers) {
          try {
            // Force Supabase query (bypass memory cache)
            const cachedPosts = await collection
              .find({ username })
              .sort({ is_pinned: -1, post_order: 1 })
              .toArray();

            if (cachedPosts.length > 0) {
              console.log(
                `   ✅ @${username}: ${cachedPosts.length} posts reloaded (Supabase)`
              );

              if (!global.postCache) {
                global.postCache = {};
              }
              global.postCache[username] = cachedPosts.map((post) => ({
                post_url: post.post_url,
                shortcode: post.shortcode,
                is_pinned: post.is_pinned,
                post_order: post.post_order,
                cached_at: post.cached_at,
              }));
              loadedUsers++;
              totalPosts += cachedPosts.length;
            } else {
              console.log(`   ⚠️ @${username}: Still 0 posts after reload`);
            }
          } catch (userError) {
            console.error(
              `   ❌ Failed to reload cache for @${username}: ${userError.message}`
            );
          }
        }

        if (loadedUsers > 0) {
          console.log(
            `✅ Automatic Supabase cache reload successful (${loadedUsers} users, ${totalPosts} posts)`
          );
        } else {
          console.log(
            "❌ Automatic Supabase cache reload failed - no posts loaded"
          );
        }

        return; // Successfully reloaded from Supabase
      } catch (error) {
        console.error(`❌ Supabase cache reload failed: ${error.message}`);
        console.log("🔄 Falling back to SQLite...");
        // Continue to SQLite fallback
      }
    }

    // Fallback to SQLite
    if (db) {
      console.log("🔄 Attempting SQLite cache reload...");

      // Force reload from database
      const cachedUsers = await new Promise((resolve, reject) => {
        db.all(
          "SELECT DISTINCT username FROM recent_posts_cache",
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
          }
        );
      });

      if (cachedUsers.length === 0) {
        console.log("📊 No cached users found in SQLite during reload");
        return;
      }

      console.log(
        `🔄 Reloading cache for ${cachedUsers.length} users from SQLite...`
      );

      let loadedUsers = 0;
      let totalPosts = 0;

      for (const user of cachedUsers) {
        try {
          // Force database query (bypass memory cache)
          const cachedPosts = await new Promise((resolve, reject) => {
            db.all(
              "SELECT post_url, shortcode, is_pinned, post_order, cached_at FROM recent_posts_cache WHERE username = ? ORDER BY is_pinned DESC, post_order ASC",
              [user.username],
              (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
              }
            );
          });

          if (cachedPosts.length > 0) {
            console.log(
              `   ✅ @${user.username}: ${cachedPosts.length} posts reloaded (SQLite)`
            );

            if (!global.postCache) {
              global.postCache = {};
            }
            global.postCache[user.username] = cachedPosts;
            loadedUsers++;
            totalPosts += cachedPosts.length;
          } else {
            console.log(`   ⚠️ @${user.username}: Still 0 posts after reload`);
          }
        } catch (userError) {
          console.error(
            `   ❌ Failed to reload cache for @${user.username}: ${userError.message}`
          );
        }
      }

      if (loadedUsers > 0) {
        console.log(
          `✅ Automatic SQLite cache reload successful (${loadedUsers} users, ${totalPosts} posts)`
        );
      } else {
        console.log(
          "❌ Automatic SQLite cache reload failed - no posts loaded"
        );
      }
    }
  } catch (error) {
    console.error(`❌ Automatic cache reload failed: ${error.message}`);
  }
}

// Validate cache integrity and fix inconsistencies
async function validateCacheIntegrity() {
  try {
    console.log("🔍 Validating cache integrity...");

    // Get all cached users from database
    const dbUsers = await new Promise((resolve, reject) => {
      db.all(
        "SELECT DISTINCT username FROM recent_posts_cache",
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });

    const memoryUsers = global.postCache ? Object.keys(global.postCache) : [];

    console.log(
      `📊 Database users: ${dbUsers.length}, Memory users: ${memoryUsers.length}`
    );

    // Check for users in database but not in memory
    const missingInMemory = dbUsers.filter(
      (dbUser) => !memoryUsers.includes(dbUser.username)
    );

    if (missingInMemory.length > 0) {
      console.log(
        `⚠️ Found ${missingInMemory.length} users missing from memory cache`
      );
      for (const user of missingInMemory) {
        console.log(`   🔄 Loading @${user.username} into memory cache...`);
        const cachedPosts = await getCachedRecentPosts(user.username);
        if (cachedPosts.length > 0) {
          console.log(
            `   ✅ @${user.username}: ${cachedPosts.length} posts loaded`
          );
        }
      }
    }

    // Check for users in memory but not in database (orphaned cache)
    const orphanedInMemory = memoryUsers.filter(
      (memUser) => !dbUsers.some((dbUser) => dbUser.username === memUser)
    );

    if (orphanedInMemory.length > 0) {
      console.log(
        `🧹 Found ${orphanedInMemory.length} orphaned users in memory cache`
      );
      for (const user of orphanedInMemory) {
        console.log(`   🗑️ Removing @${user} from memory cache`);
        delete global.postCache[user];
      }
    }

    console.log("✅ Cache integrity validation completed");
  } catch (error) {
    console.error(`❌ Cache integrity validation failed: ${error.message}`);
  }
}

// Clear cache for specific user (manual reset)
function clearUserCache(username) {
  return new Promise(async (resolve, reject) => {
    try {
      let result = 0;

      // Use Supabase if available, otherwise fallback to SQLite
      if (supabaseManager && supabaseManager.isConnected) {
        try {
          console.log(`🗑️ Clearing cache for @${username} using Supabase...`);
          result = await supabaseManager.clearUserCache(username);
        } catch (error) {
          console.error(`❌ Supabase cache clear failed: ${error.message}`);
          console.log("🔄 Falling back to SQLite...");
          // Continue to SQLite fallback
        }
      }

      // Fallback to SQLite if Supabase failed or not connected
      if (result === 0 && db) {
        result = await new Promise((resolveInner, rejectInner) => {
          db.run(
            "DELETE FROM recent_posts_cache WHERE username = ?",
            [username],
            function (err) {
              if (err) rejectInner(err);
              else {
                console.log(
                  `🗑️ Cleared cache for @${username} (${this.changes} entries) (SQLite)`
                );
                resolveInner(this.changes);
              }
            }
          );
        });
      }

      // Clear in-memory cache
      if (global.postCache && global.postCache[username]) {
        delete global.postCache[username];
        console.log(`🗑️ Cleared in-memory cache for @${username}`);
      }

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
      let processedDeleted = 0;
      let cacheDeleted = 0;

      // Use Supabase if available, otherwise fallback to SQLite
      if (supabaseManager && supabaseManager.isConnected) {
        try {
          console.log(
            `🧹 Clearing all data for @${username} using Supabase...`
          );
          const result = await supabaseManager.clearUserData(username);
          processedDeleted = result.processedDeleted;
          cacheDeleted = result.cacheDeleted;
        } catch (error) {
          console.error(`❌ Supabase data clear failed: ${error.message}`);
          console.log("🔄 Falling back to SQLite...");
          // Continue to SQLite fallback
        }
      }

      // Fallback to SQLite if Supabase failed or not connected
      if (processedDeleted === 0 && cacheDeleted === 0 && db) {
        const clearProcessed = new Promise(
          (resolveProcessed, rejectProcessed) => {
            db.run(
              "DELETE FROM processed_posts WHERE username = ?",
              [username],
              function (err) {
                if (err) rejectProcessed(err);
                else resolveProcessed(this.changes);
              }
            );
          }
        );

        const clearCache = clearUserCache(username);

        [processedDeleted, cacheDeleted] = await Promise.all([
          clearProcessed,
          clearCache,
        ]);
      }

      console.log(
        `🧹 Cleared all data for @${username} (processed: ${processedDeleted}, cache: ${cacheDeleted})`
      );
      resolve({ processedDeleted, cacheDeleted });
    } catch (error) {
      reject(error);
    }
  });
}

// Scrape Instagram stories using FastDl.app (Grok-optimized implementation)
async function scrapeInstagramStoriesWithFastDl(session) {
  try {
    console.log(
      `🎬 Processing stories for @${session.username} with FastDl.app...`
    );

    if (!session.page) {
      console.log(`❌ [FASTDL] No active page in session`);
      return [];
    }

    const stories = [];
    const storyUrl = `https://www.instagram.com/stories/${session.username}/`;
    const fastDlUrl = `https://fastdl.app/story-saver`;

    console.log(`🔍 Navigating to FastDl.app: ${fastDlUrl}`);

    try {
      // Step 1: Navigate to FastDl.app story-saver page
      await session.page.goto(fastDlUrl, {
        waitUntil: "networkidle2",
        timeout: 30000,
      });

      console.log(`⏳ [FASTDL] Waiting 4 seconds after page load...`);
      await new Promise((resolve) => setTimeout(resolve, 4000));

      // Step 2: Find and fill the input field
      console.log(`🔍 [FASTDL] Looking for search input field...`);
      await session.page.waitForSelector("#search-form-input", {
        timeout: 10000,
      });

      console.log(`📝 [FASTDL] Typing story URL: ${storyUrl}`);
      await session.page.type("#search-form-input", storyUrl);

      console.log(`⏳ [FASTDL] Waiting 4 seconds after typing...`);
      await new Promise((resolve) => setTimeout(resolve, 4000));

      // Step 3: Click Download button to trigger content generation
      console.log(`🖱️ [FASTDL] Clicking Download button...`);
      await session.page.waitForSelector("button.search-form__button", {
        timeout: 10000,
      });
      await session.page.click("button.search-form__button");

      console.log(`⏳ [FASTDL] Waiting 4 seconds for stories to load...`);
      await new Promise((resolve) => setTimeout(resolve, 4000));

      // Step 4: Extract download URLs directly (no stories tab click needed)
      console.log(`🔍 [FASTDL] Extracting download URLs...`);
      const downloadUrls = await session.page.$$eval(
        "a.button.button--filled.button__download",
        (anchors) => anchors.map((a) => a.href)
      );

      console.log(`📱 [FASTDL] Found ${downloadUrls.length} download URLs`);

      if (downloadUrls.length === 0) {
        console.log(`⚠️ [FASTDL] No download links found`);
        return [];
      }

      // Step 6: Process each download URL
      for (let i = 0; i < downloadUrls.length; i++) {
        const url = downloadUrls[i];
        console.log(
          `📥 [FASTDL] Processing download ${i + 1}/${
            downloadUrls.length
          }: ${url}`
        );

        // Extract Instagram URL and filename from FastDl proxy URL
        let instagramUrl = null;
        let instagramFilename = null;

        try {
          const urlObj = new URL(url);
          const uri = urlObj.searchParams.get("uri");
          if (uri) {
            instagramUrl = decodeURIComponent(uri);
            console.log(
              `📌 [FASTDL] Instagram URL: ${instagramUrl.substring(0, 100)}...`
            );

            // Extract filename from Instagram URL (most stable identifier)
            // Format: https://.../563364741_1845820536021966_5877384275860222806_n.jpg?params...
            const urlMatch = instagramUrl.match(
              /\/([^\/\?]+\.(jpg|mp4|png|webp))/i
            );
            if (urlMatch) {
              instagramFilename = urlMatch[1];
              console.log(
                `📌 [FASTDL] Instagram Filename: ${instagramFilename}`
              );
            } else {
              console.log(
                `⚠️ [FASTDL] Could not extract filename from Instagram URL`
              );
            }
          } else {
            console.log(`⚠️ [FASTDL] No uri parameter found in FastDl URL`);
          }
        } catch (parseError) {
          console.log(`⚠️ [FASTDL] Could not parse URL: ${parseError.message}`);
        }

        // Generate story ID from Instagram filename (most stable)
        let storyId;
        let idSource;
        if (instagramFilename) {
          storyId = require("crypto")
            .createHash("md5")
            .update(instagramFilename)
            .digest("hex")
            .substring(0, 16);
          idSource = `filename: ${instagramFilename}`;
          console.log(`🔑 [FASTDL] Using Instagram filename for ID (STABLE)`);
        } else if (instagramUrl) {
          storyId = require("crypto")
            .createHash("md5")
            .update(instagramUrl)
            .digest("hex")
            .substring(0, 16);
          idSource = `full Instagram URL`;
          console.log(`🔑 [FASTDL] Using full Instagram URL for ID`);
        } else {
          storyId = require("crypto")
            .createHash("md5")
            .update(url)
            .digest("hex")
            .substring(0, 16);
          idSource = `FastDl URL`;
          console.log(`🔑 [FASTDL] Using FastDl URL for ID (fallback)`);
        }

        console.log(`🔑 [FASTDL] Story ID: ${storyId} (from ${idSource})`);

        // Determine file type from URL
        const isVideo = url.includes(".mp4") || url.includes("video");
        const storyType = isVideo ? "video" : "image";

        // Create story object
        const story = {
          url: url, // FastDl download URL (for downloading)
          instagramUrl: instagramUrl, // Instagram CDN URL
          instagramFilename: instagramFilename, // Filename for stable ID
          storyId: storyId,
          idSource: idSource,
          storyType: storyType,
          isVideo: isVideo,
          index: i + 1,
          method: "fastdl-filename",
        };

        stories.push(story);
        console.log(
          `✅ [FASTDL] Added story ${i + 1}: ${storyType} (ID: ${storyId})`
        );
      }

      console.log(
        `🎉 [FASTDL] Successfully processed ${stories.length} stories`
      );
      return stories;
    } catch (error) {
      console.error(
        `❌ [FASTDL] Error during FastDl processing: ${error.message}`
      );
      throw error;
    }
  } catch (error) {
    console.error(`❌ [FASTDL] Session error: ${error.message}`);
    return [];
  }
}

// Scrape Instagram stories using Puppeteer - COMMENTED OUT DUE TO PUPPETEER ISSUES
/*
async function scrapeInstagramStoriesWithPuppeteer(session) {
  try {
    console.log(
      `🎬 Processing stories for @${session.username} with Puppeteer...`
    );

    if (!session.page) {
      console.log(`❌ [PUPPETEER] No active page in session`);
      return [];
    }

    const stories = [];
    const storyUrl = `https://www.instagram.com/stories/${session.username}/`;

    console.log(`🔍 Navigating to stories page: ${storyUrl}`);

    try {
      // Navigate with more robust loading strategy
      await session.page.goto(storyUrl, {
        waitUntil: "networkidle2",
        timeout: 30000,
      });

      await session.applyDelay("human");

      // Wait for page to load and check for stories - longer wait for JavaScript
      await new Promise((resolve) => setTimeout(resolve, 5000));

      // Try to trigger any lazy-loaded content
      await session.page.evaluate(() => {
        // Scroll and interact to trigger content loading
        window.scrollTo(0, document.body.scrollHeight);
        window.scrollTo(0, 0);

        // Trigger any mouse events that might load content
        const event = new Event("mouseover", { bubbles: true });
        document.body.dispatchEvent(event);
      });

      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Check if stories are available - try multiple approaches
      const hasStories = await session.page.evaluate(() => {
        // Method 1: Look for story viewer elements
        const storyViewer = document.querySelector('[role="dialog"]');
        const storyItems = document.querySelectorAll(
          'img[src*="instagram"], video[src*="instagram"]'
        );

        // Method 2: Look for story-specific elements
        const storyCircles = document.querySelectorAll(
          '[data-testid="story-circle"]'
        );
        const storyButtons = document.querySelectorAll(
          'button[aria-label*="story"], button[aria-label*="Story"]'
        );

        // Method 3: Look for any media elements that might be stories
        const mediaElements = document.querySelectorAll(
          'img[src*="scontent"], video[src*="scontent"]'
        );

        console.log("Story detection debug:", {
          storyViewer: !!storyViewer,
          storyItems: storyItems.length,
          storyCircles: storyCircles.length,
          storyButtons: storyButtons.length,
          mediaElements: mediaElements.length,
        });

        return (
          storyViewer ||
          storyItems.length > 0 ||
          storyCircles.length > 0 ||
          storyButtons.length > 0 ||
          mediaElements.length > 0
        );
      });

      if (!hasStories) {
        console.log(
          `⚠️ [PUPPETEER] No stories found initially, trying to click story elements...`
        );

        // Try to click on story elements to make them visible
        try {
          // Look for and click on story circles or buttons
          const storyClickResult = await session.page.evaluate(() => {
            const storyCircles = document.querySelectorAll(
              '[data-testid="story-circle"], [aria-label*="story"], [aria-label*="Story"]'
            );
            const storyButtons = document.querySelectorAll(
              'button[aria-label*="story"], button[aria-label*="Story"]'
            );

            console.log("Attempting to click story elements:", {
              storyCircles: storyCircles.length,
              storyButtons: storyButtons.length,
            });

            // Try clicking the first story circle or button
            const clickableElement = storyCircles[0] || storyButtons[0];
            if (clickableElement) {
              clickableElement.click();
              return true;
            }
            return false;
          });

          if (storyClickResult) {
            console.log(
              `✅ [PUPPETEER] Clicked on story element, waiting for content to load...`
            );
            await new Promise((resolve) => setTimeout(resolve, 2000));

            // Check again for stories after clicking
            const hasStoriesAfterClick = await session.page.evaluate(() => {
              const mediaElements = document.querySelectorAll(
                'img[src*="scontent"], video[src*="scontent"]'
              );
              return mediaElements.length > 0;
            });

            if (!hasStoriesAfterClick) {
              console.log(
                `⚠️ [PUPPETEER] Still no stories found after clicking`
              );

              // Try to get page content for debugging
              const pageContent = await session.page.content();
              console.log(
                `🔍 [PUPPETEER] Page content preview: ${pageContent.substring(
                  0,
                  500
                )}...`
              );

              return [];
            }
          } else {
            console.log(`⚠️ [PUPPETEER] No clickable story elements found`);

            // Try to get page content for debugging
            const pageContent = await session.page.content();
            console.log(
              `🔍 [PUPPETEER] Page content preview: ${pageContent.substring(
                0,
                500
              )}...`
            );

            return [];
          }
        } catch (clickError) {
          console.log(
            `⚠️ [PUPPETEER] Error clicking story elements: ${clickError.message}`
          );

          // Try to get page content for debugging
          const pageContent = await session.page.content();
          console.log(
            `🔍 [PUPPETEER] Page content preview: ${pageContent.substring(
              0,
              500
            )}...`
          );

          return [];
        }
      }

      console.log(`✅ [PUPPETEER] Stories viewer detected`);

      // Extract story URLs with improved detection
      const storyData = await session.page.evaluate(() => {
        const stories = [];

        // Method 1: Look for direct media elements
        const mediaElements = document.querySelectorAll(
          'img[src*="scontent"], video[src*="scontent"]'
        );

        mediaElements.forEach((element, index) => {
          const url = element.src || element.currentSrc;
          const isVideo = element.tagName.toLowerCase() === "video";
          const type = isVideo ? "video" : "photo";

          if (url && url.includes("scontent")) {
            stories.push({
              url: url,
              type: type,
              index: index + 1,
              isVideo: isVideo,
              storyType: type,
              contentType: isVideo ? "video" : "image",
            });
          }
        });

        // Method 2: Look for story-specific data attributes
        const storyElements = document.querySelectorAll(
          '[data-testid*="story"], [aria-label*="story"]'
        );

        storyElements.forEach((element, index) => {
          const img = element.querySelector('img[src*="scontent"]');
          const video = element.querySelector('video[src*="scontent"]');

          if (img || video) {
            const mediaElement = img || video;
            const url = mediaElement.src || mediaElement.currentSrc;
            const isVideo = mediaElement.tagName.toLowerCase() === "video";
            const type = isVideo ? "video" : "photo";

            if (url && url.includes("scontent")) {
              stories.push({
                url: url,
                type: type,
                index: stories.length + 1,
                isVideo: isVideo,
                storyType: type,
                contentType: isVideo ? "video" : "image",
              });
            }
          }
        });

        // Method 3: Look for any Instagram CDN URLs in the page
        const allImages = document.querySelectorAll("img");
        const allVideos = document.querySelectorAll("video");

        [...allImages, ...allVideos].forEach((element, index) => {
          const url = element.src || element.currentSrc;
          const isVideo = element.tagName.toLowerCase() === "video";

          if (
            url &&
            (url.includes("scontent.cdninstagram.com") ||
              url.includes("cdninstagram.com"))
          ) {
            // Check if this URL is already in our stories array
            const alreadyExists = stories.some((story) => story.url === url);

            if (!alreadyExists) {
              stories.push({
                url: url,
                type: isVideo ? "video" : "photo",
                index: stories.length + 1,
                isVideo: isVideo,
                storyType: isVideo ? "video" : "photo",
                contentType: isVideo ? "video" : "image",
              });
            }
          }
        });

        console.log("Story extraction debug:", {
          totalStories: stories.length,
          stories: stories.map((s) => ({
            url: s.url.substring(0, 50) + "...",
            type: s.type,
          })),
        });

        return stories;
      });

      console.log(`📱 Found ${storyData.length} stories via Puppeteer`);

      // Process each story
      for (let i = 0; i < storyData.length; i++) {
        const story = storyData[i];

        console.log(
          `  🔍 [PUPPETEER] Analyzing story ${i + 1}/${storyData.length}...`
        );
        console.log(
          `  📄 Story type: ${story.type}, URL: ${story.url.substring(
            0,
            50
          )}...`
        );

        // Generate unique story ID
        const storyId = require("crypto")
          .createHash("md5")
          .update(story.url)
          .digest("hex")
          .substring(0, 16);

        const processedStory = {
          url: story.url,
          storyId: `puppeteer_${storyId}`,
          storyType: story.type,
          isVideo: story.isVideo,
          contentType: story.contentType,
          method: "puppeteer",
          index: story.index,
        };

        stories.push(processedStory);
        console.log(`  ✅ Story ${i + 1} extracted successfully`);

        // Apply delay between story processing
        if (i < storyData.length - 1) {
          await session.applyDelay("storyTransition");
        }
      }

      console.log(`📊 [PUPPETEER] Stories processing complete!`);
      console.log(`  📊 Summary:`);
      console.log(`    - Stories found: ${stories.length}`);
      console.log(`    - Videos: ${stories.filter((s) => s.isVideo).length}`);
      console.log(`    - Images: ${stories.filter((s) => !s.isVideo).length}`);

      return stories;
    } catch (navigationError) {
      console.log(
        `❌ [PUPPETEER] Failed to navigate to stories page: ${navigationError.message}`
      );

      // Check for rate limiting
      if (
        navigationError.message.includes("429") ||
        navigationError.message.includes("rate limit")
      ) {
        await session.handleRateLimit();
      }

      return [];
    }
  } catch (error) {
    console.log(`❌ [PUPPETEER] Stories scraping failed: ${error.message}`);
    return [];
  }
}
*/

// Fallback to individual processing if batch fails
async function processIndividualPost(post, userAgent) {
  try {
    console.log(`🔄 Fallback: Processing individual post ${post.url}`);

    // Call the /igdl endpoint with axios
    const igdlResponse = await axios.get(`http://localhost:${port}/igdl`, {
      params: { url: post.url },
      timeout: 60000,
    });

    if (igdlResponse.status >= 200 && igdlResponse.status < 300) {
      const result = igdlResponse.data;
      console.log(`✅ Individual processing completed for ${post.url}`);
      return { success: true, data: result };
    } else if (igdlResponse.status === 429) {
      console.log(
        `🚫 Rate limit detected for ${post.url}: ${igdlResponse.status}`
      );
      await rateLimitDelay();
      return { error: "rate_limit" };
    } else {
      console.log(
        `❌ Individual processing failed for ${post.url}: ${igdlResponse.status}`
      );
      return { error: "processing_failed" };
    }
  } catch (error) {
    console.log(
      `❌ Individual processing error for ${post.url}: ${error.message}`
    );
    return { error: error.message };
  }
}

// Optimized batch processing with fallback mechanisms
async function batchGraphQLCall(posts, userAgent) {
  try {
    console.log(
      `🔄 Processing optimized batch of ${posts.length} posts with GraphQL API`
    );

    const results = [];
    const maxBatchSize = 8; // Max 8 posts (3 pinned + 5 recent)
    const batchPosts = posts.slice(0, maxBatchSize);

    // Process each post in batch with fallback mechanisms
    for (const post of batchPosts) {
      try {
        const shortcode =
          post.shortcode || post.url.match(/\/(p|reel|tv)\/([^\/]+)\//)?.[2];
        if (!shortcode) {
          console.log(`⚠️ Could not extract shortcode from ${post.url}`);
          results.push({ error: "invalid_shortcode", url: post.url });
          continue;
        }

        // Check if we already have full data from optimized processing
        if (post.fullData) {
          console.log(`✅ Using pre-fetched data for ${shortcode}`);
          results.push({
            success: true,
            shortcode,
            url: post.url,
            data: post.fullData,
            isPinned: post.is_pinned || false,
            source: "pre-fetched",
          });
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
            isPinned: post.is_pinned || false,
            source: "graphql",
          });
          console.log(`✅ Batch processed: ${shortcode}`);
        } else {
          console.log(
            `⚠️ GraphQL processing failed for ${shortcode}, trying Web Profile Info API fallback`
          );

          // Fallback to Web Profile Info API data
          const fallbackResult = await tryWebProfileInfoFallback(
            post,
            userAgent
          );
          if (fallbackResult.success) {
            results.push({
              success: true,
              shortcode,
              url: post.url,
              data: fallbackResult.data,
              isPinned: post.is_pinned || false,
              source: "web-profile-fallback",
            });
            console.log(
              `✅ Web Profile Info fallback successful for ${shortcode}`
            );
          } else {
            console.log(
              `⚠️ All processing failed for ${shortcode}, will use snapsave fallback`
            );
            results.push({
              error: "all_apis_failed",
              url: post.url,
              shortcode,
            });
          }
        }

        // Enhanced GraphQL API protection with specialized delay function
        if (result && result.data && result.data.length > 0) {
          const carouselSize = result.data.length;
          const postType = post.is_pinned ? "pinned" : "regular";
          await graphqlDelay(postType, carouselSize);
        } else {
          // Fallback delay if no result data
          console.log(`⏱️ Applying fallback delay for GraphQL API call`);
          await smartDelay(2000, 4000, 1, "graphql-fallback");
        }
      } catch (error) {
        console.log(
          `❌ Batch processing error for ${post.url}: ${error.message}`
        );
        results.push({ error: error.message, url: post.url });
      }
    }

    console.log(
      `✅ Optimized batch processing completed: ${
        results.filter((r) => r.success).length
      }/${batchPosts.length} successful`
    );
    return results;
  } catch (error) {
    console.log(`❌ Optimized batch processing failed: ${error.message}`);
    return posts.map((post) => ({ error: "batch_failed", url: post.url }));
  }
}

// Web Profile Info API fallback function
async function tryWebProfileInfoFallback(post, userAgent) {
  try {
    console.log(
      `🔄 Attempting Web Profile Info API fallback for ${post.shortcode}`
    );

    // Use the existing Web Profile Info API logic but for individual post
    const profileUrl = `https://www.instagram.com/api/v1/users/web_profile_info/?username=${TARGET_USERNAME}`;

    const response = await axios.get(profileUrl, {
      headers: {
        "User-Agent": userAgent,
        Accept: "application/json",
        "Accept-Language": "en-US,en;q=0.9",
        "X-IG-App-ID": "936619743392459",
        "X-ASBD-ID": "129477",
        "X-IG-WWW-Claim": "0",
        "X-Requested-With": "XMLHttpRequest",
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-origin",
        Referer: "https://www.instagram.com/",
        Origin: "https://www.instagram.com",
      },
      timeout: 15000,
    });

    if (response.data && response.data.data && response.data.data.user) {
      const user = response.data.data.user;

      // Find the specific post in the profile data
      if (
        user.edge_owner_to_timeline_media &&
        user.edge_owner_to_timeline_media.edges
      ) {
        const edges = user.edge_owner_to_timeline_media.edges;
        const targetPost = edges.find(
          (edge) => edge.node && edge.node.shortcode === post.shortcode
        );

        if (targetPost) {
          const node = targetPost.node;
          // Create basic media data structure from Web Profile Info
          const basicData = [
            {
              url: node.display_url,
              is_video: node.is_video,
              is_pinned: post.is_pinned || false,
              shortcode: node.shortcode,
              // Add other available fields
              dimensions: node.dimensions,
              accessibility_caption: node.accessibility_caption,
            },
          ];

          return { success: true, data: basicData };
        }
      }
    }

    return { success: false, error: "post_not_found_in_profile" };
  } catch (error) {
    console.log(`❌ Web Profile Info fallback failed: ${error.message}`);
    return { success: false, error: error.message };
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
    let username = TARGET_USERNAME || "User Not Found";

    console.log(`📱 Using username from polling context: @${username}`);

    // Extract shortcode for cache checking
    const shortcodeMatch = url.match(/\/(p|reel|tv)\/([^\/]+)\//);
    const shortcode = shortcodeMatch ? shortcodeMatch[2] : null;

    // Check if this post is in cache (for logging only - manual always sends)
    if (shortcode && username !== "User Not Found") {
      try {
        const cachedPosts = await getCachedRecentPosts(username);
        const isInCache = cachedPosts.some((p) => p.shortcode === shortcode);
        if (isInCache) {
          console.log(
            `ℹ️ [MANUAL] Post ${shortcode} found in cache, but sending anyway (manual override)`
          );
        } else {
          console.log(
            `📥 [MANUAL] Post ${shortcode} NOT in cache - will be added after send`
          );
        }
      } catch (cacheError) {
        console.log(`⚠️ [MANUAL] Cache check failed: ${cacheError.message}`);
      }
    }

    // Remove any img_index parameters from the URL to ensure we process the main carousel
    const urlObj = new URL(url);
    const imgIndex = urlObj.searchParams.get("img_index");

    if (imgIndex) {
      // Remove img_index parameter and process the main carousel URL
      urlObj.searchParams.delete("img_index");
      const cleanUrl = urlObj.toString();
      console.log(
        `Removed img_index=${imgIndex}, processing main carousel URL: ${cleanUrl}`
      );

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

    if (
      carouselResult &&
      carouselResult.status &&
      carouselResult.data &&
      carouselResult.data.length > 0
    ) {
      console.log(
        `✅ Instagram GraphQL Downloader found ${carouselResult.data.length} carousel items`
      );

      // Replace the snapsave result with the carousel downloader result
      downloadedURL = carouselResult;

      // Optional: Send to Telegram if configured (MANUAL processing)
      if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHANNEL_ID) {
        try {
          if (carouselResult.data.length > 1) {
            // Carousel with multiple items - send as media group
            console.log(
              `📤 [MANUAL] Sending carousel as media group (${carouselResult.data.length} items)...`
            );
            const caption = `✨ New carousel from <a href="https://www.instagram.com/${username}/">@${username}</a>! 📱 <a href="${processedUrl}">View Original Post</a>`;
            await sendMediaGroupToTelegram(carouselResult.data, caption);
            console.log(
              `✅ [MANUAL] Carousel media group sent to Telegram successfully (${carouselResult.data.length} items)`
            );
          } else {
            // Single item - send normally
            const item = carouselResult.data[0];
            console.log(
              `📤 [MANUAL] Sending single item (${
                item.isVideo ? "video" : "photo"
              }) to Telegram...`
            );
            const photoCaption = `✨ New photo from <a href="https://www.instagram.com/${username}/">@${username}</a>! 📱 <a href="${processedUrl}">View Original Post</a>`;
            const videoCaption = `✨ New video from <a href="https://www.instagram.com/${username}/">@${username}</a>! 📱 <a href="${processedUrl}">View Original Post</a>`;

            if (item.isVideo) {
              await sendVideoToTelegram(item.url, videoCaption);
            } else {
              await sendPhotoToTelegram(item.url, photoCaption);
            }
            console.log(
              `✅ [MANUAL] Single item sent to Telegram successfully`
            );
          }
        } catch (telegramError) {
          console.log(
            `⚠️ [MANUAL] Failed to send to Telegram: ${telegramError.message}`
          );
        }
      }
    } else {
      console.log(
        `⚠️ Instagram GraphQL Downloader failed, using snapsave fallback`
      );

      // Check if snapsave detected a carousel with multiple items
      if (
        downloadedURL &&
        downloadedURL.status &&
        downloadedURL.data &&
        downloadedURL.data.length > 1
      ) {
        console.log(
          `Snapsave detected carousel with ${downloadedURL.data.length} items`
        );

        // Get the number of carousel items from the deduplicated snapsave result
        const rawItems = downloadedURL.data;
        const groupedItems = new Map();

        for (const item of rawItems) {
          const thumb = item.thumb || item.thumbnail || "";
          if (!groupedItems.has(thumb)) {
            groupedItems.set(thumb, []);
          }
          groupedItems.get(thumb).push(item);
        }

        const numCarouselItems = groupedItems.size;
        console.log(
          `Detected ${numCarouselItems} carousel items from snapsave`
        );

        // Create individual carousel items using the actual thumbnails from snapsave
        const carouselItems = [];
        const thumbnailUrls = Array.from(groupedItems.keys()).filter(
          (thumb) => thumb
        ); // Get unique thumbnails

        thumbnailUrls.forEach((thumb, index) => {
          carouselItems.push({
            quality: "Image",
            thumb: thumb, // Use the actual thumbnail URL from snapsave
            url: rawItems[0].url, // Use the same download URL (since snapsave limitation)
            isProgress: false,
            carouselIndex: index + 1,
          });
        });

        // Replace the snapsave result with our carousel items
        downloadedURL.data = carouselItems;
        console.log(
          `Created ${carouselItems.length} carousel items with individual display URLs`
        );

        // Optional: Send to Telegram if configured (MANUAL processing - send only one image for snapsave carousels)
        if (
          TELEGRAM_BOT_TOKEN &&
          TELEGRAM_CHANNEL_ID &&
          carouselItems.length > 0
        ) {
          try {
            console.log(
              `📤 [MANUAL] Sending snapsave carousel preview to Telegram (1 of ${carouselItems.length} items)...`
            );
            const photoCaption = `✨ New photo from <a href="https://www.instagram.com/${username}/">@${username}</a>! 📱 <a href="${processedUrl}">View Original Post</a>\n\n<i>💡 <a href="${processedUrl}">View all ${carouselItems.length} images</a> in the original post (only limited preview available)</i>`;

            // Send only the first item as a preview
            await sendPhotoToTelegram(carouselItems[0].url, photoCaption);
            console.log(
              `✅ [MANUAL] Snapsave carousel preview sent to Telegram successfully`
            );
          } catch (telegramError) {
            console.log(
              `⚠️ [MANUAL] Failed to send snapsave carousel preview to Telegram: ${telegramError.message}`
            );
          }
        }
      } else {
        // Single post - apply deduplication as before
        if (
          downloadedURL &&
          downloadedURL.status &&
          downloadedURL.data &&
          downloadedURL.data.length > 0
        ) {
          const rawItems = downloadedURL.data;
          const deduplicatedItems = [];

          // Group items by thumbnail to identify duplicates
          const groupedItems = new Map();

          for (const item of rawItems) {
            const thumb = item.thumb || item.thumbnail || "";
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
              const qualityA = a.quality || "";
              const qualityB = b.quality || "";

              // Prefer higher quality (HD > SD, etc.)
              if (qualityA.includes("HD") && !qualityB.includes("HD"))
                return -1;
              if (qualityB.includes("HD") && !qualityA.includes("HD")) return 1;
              if (qualityA.includes("SD") && !qualityB.includes("SD"))
                return -1;
              if (qualityB.includes("SD") && !qualityA.includes("SD")) return 1;

              // If same quality, prefer the first one
              return 0;
            });

            const bestItem = sortedItems[0];
            deduplicatedItems.push({
              quality: bestItem.quality || undefined,
              thumb: bestItem.thumb || bestItem.thumbnail || undefined,
              url: bestItem.url,
              isProgress: bestItem.isProgresser || bestItem.isProgress || false,
            });
          }

          // Return deduplicated results
          downloadedURL.data = deduplicatedItems;
          console.log(
            `Deduplicated ${rawItems.length} items to ${deduplicatedItems.length} unique items`
          );

          // Optional: Send to Telegram if configured (MANUAL processing - for single posts using snapsave)
          if (
            TELEGRAM_BOT_TOKEN &&
            TELEGRAM_CHANNEL_ID &&
            deduplicatedItems.length > 0
          ) {
            try {
              console.log(
                `📤 [MANUAL] Sending snapsave single post to Telegram...`
              );
              const photoCaption = `✨ New photo from <a href="https://www.instagram.com/${username}/">@${username}</a>! 📱 <a href="${processedUrl}">View Original Post</a>\n\n<i>💡 <a href="${processedUrl}">View all images</a> in the original post (only limited preview available)</i>`;
              const videoCaption = `✨ New video from <a href="https://www.instagram.com/${username}/">@${username}</a>! 📱 <a href="${processedUrl}">View Original Post</a>\n\n<i>💡 <a href="${processedUrl}">View all images</a> in the original post (only limited preview available)</i>`;

              // For snapsave single posts, we'll treat as photo since we can't easily determine type
              await sendPhotoToTelegram(deduplicatedItems[0].url, photoCaption);
              console.log(
                `✅ [MANUAL] Snapsave single post sent to Telegram successfully`
              );
            } catch (telegramError) {
              console.log(
                `⚠️ [MANUAL] Failed to send snapsave single post to Telegram: ${telegramError.message}`
              );
            }
          }
        }
      }
    }

    // Update cache with this post if it's new (manual always sends, but only caches new items)
    if (
      shortcode &&
      username !== "User Not Found" &&
      TELEGRAM_BOT_TOKEN &&
      TELEGRAM_CHANNEL_ID
    ) {
      try {
        console.log(
          `📊 [MANUAL] Checking if post ${shortcode} should be added to cache...`
        );

        // Check if post is already in cache
        const cachedPosts = await getCachedRecentPosts(username);
        const isInCache = cachedPosts.some((p) => p.shortcode === shortcode);

        if (!isInCache) {
          console.log(
            `📊 [MANUAL] Post ${shortcode} is NEW - adding to cache...`
          );

          // Create post object for cache
          const postForCache = {
            url: url,
            shortcode: shortcode,
            is_pinned: false, // Manual downloads are not pinned
          };

          // Add to cache (merge with existing)
          const updatedCache = [...cachedPosts, postForCache];
          await updateRecentPostsCache(username, updatedCache);

          console.log(
            `✅ [MANUAL] Cache updated: ${cachedPosts.length} existing + 1 new = ${updatedCache.length} total`
          );
        } else {
          console.log(
            `ℹ️ [MANUAL] Post ${shortcode} already in cache - no cache update needed`
          );
        }
      } catch (cacheError) {
        console.log(
          `⚠️ [MANUAL] Failed to update cache: ${cacheError.message}`
        );
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

    const result = await processInstagramURL(url, getPollingUserAgent());

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
      videoUrl, // legacy client param for videos
      mediaUrl, // preferred param for any media
      photoUrl, // optional legacy param for photos
      caption, // optional caption text
      originalInstagramUrl, // optional original IG URL
      source = "instagram", // 'instagram'
      type, // 'video' | 'photo' | undefined (try to infer)
    } = req.body || {};

    // Resolve media URL from provided fields
    let providedUrl = mediaUrl || videoUrl || photoUrl;
    if (!providedUrl) {
      return res
        .status(400)
        .json({ error: "mediaUrl (or videoUrl/photoUrl) is required" });
    }

    const finalUrl = providedUrl;

    // Compose caption with emoji prefix based on source
    let fullCaption = caption || "";
    if (originalInstagramUrl) {
      fullCaption += `\n\n📱 Original: ${originalInstagramUrl}`;
    }
    if (!fullCaption) {
      fullCaption = `New media\n\nDownloaded via Tyla IG Kapturez`;
    }
    const emoji = "📷";
    if (!fullCaption.trim().startsWith(emoji)) {
      fullCaption = `${emoji} ${fullCaption}`;
    }

    console.log("Telegram request received:", {
      source,
      type,
      mediaUrlPreview: finalUrl?.substring(0, 100) + "...",
      captionPreview: fullCaption?.substring(0, 100) + "...",
    });

    // Decide media type
    const lower = (finalUrl || "").toLowerCase();
    let resolvedType = type;
    if (!resolvedType) {
      if (/(\.mp4|\.mov|\.webm)(\?|$)/.test(lower)) resolvedType = "video";
      else if (/(\.jpg|\.jpeg|\.png|\.webp)(\?|$)/.test(lower))
        resolvedType = "photo";
    }
    // Default to video if unknown for backward compatibility
    if (!resolvedType) resolvedType = "video";

    let result;
    if (resolvedType === "photo") {
      result = await sendPhotoToTelegram(finalUrl, fullCaption);
    } else {
      result = await sendVideoToTelegram(finalUrl, fullCaption);
    }

    res.json({
      success: true,
      message: `${resolvedType} sent to Telegram successfully!`,
      telegram_message_id: result?.message_id,
      channel_id: result?.chat_id,
    });

    // Add delay after manual Telegram send to prevent rate limiting
    console.log(
      `⏳ Waiting 2 seconds after manual Telegram send to prevent rate limiting...`
    );
    await new Promise((resolve) => setTimeout(resolve, 2000));
  } catch (err) {
    console.error("Telegram send error details:", {
      message: err.message,
      response: err.response?.data,
      status: err.response?.status,
    });
    res.status(500).json({
      error: "Failed to send to Telegram",
      details: err.response?.data?.description || err.message,
    });
  }
});

// Main polling function
async function checkForNewPosts(force = false) {
  try {
    // Set consistent user agent for this poll cycle - will be used consistently for all API calls
    const pollUserAgent = getRandomUserAgent();
    setPollingUserAgent(pollUserAgent);
    console.log(
      `\n🔍 Checking for new posts from @${TARGET_USERNAME} ${
        force ? "(force send enabled)" : ""
      }`
    );
    console.log(
      `🌐 Polling cycle using consistent user agent: ${pollUserAgent.substring(
        0,
        50
      )}...`
    );
    console.log(
      `🔒 This user agent will be maintained for all API calls in this polling cycle`
    );

    // Reset GraphQL call counter for new polling cycle
    resetGraphQLCallCounter();

    const { pinnedPosts, regularPosts } = await scrapeInstagramPosts(
      TARGET_USERNAME,
      pollUserAgent
    );

    console.log(
      `Found ${pinnedPosts.length} pinned posts and ${regularPosts.length} regular posts`
    );

    // Process pinned posts first
    console.log(`📌 Processing pinned posts first...`);
    const newPinnedPosts = await findNewPosts(TARGET_USERNAME, pinnedPosts);
    console.log(`📌 Found ${newPinnedPosts.length} new pinned posts`);

    // Process regular posts
    console.log(`📱 Processing regular posts...`);
    const newRegularPosts = await findNewPosts(TARGET_USERNAME, regularPosts);
    console.log(`📱 Found ${newRegularPosts.length} new regular posts`);

    // DON'T update cache yet - wait until after successful Telegram sending
    const allPosts = [...pinnedPosts, ...regularPosts];

    const totalNewPosts = newPinnedPosts.length + newRegularPosts.length;
    if (totalNewPosts === 0 && !force) {
      console.log(`✅ No new posts found, skipping post processing...`);
      // Update cache even when no new posts (refreshes timestamps)
      await updateRecentPostsCache(TARGET_USERNAME, allPosts);
      // Continue to check stories even if no new posts
      return;
    }

    console.log(
      `📱 Processing ${totalNewPosts} new posts (${newPinnedPosts.length} pinned + ${newRegularPosts.length} regular)`
    );

    // Process pinned posts first, then regular posts
    let allBatchResults = [];

    if (newPinnedPosts.length > 0) {
      console.log(`📌 Processing ${newPinnedPosts.length} new pinned posts...`);
      const pinnedBatchResults = await batchGraphQLCall(
        newPinnedPosts,
        pollUserAgent
      );
      allBatchResults = [...pinnedBatchResults];
    }

    if (newRegularPosts.length > 0) {
      console.log(
        `📱 Processing ${newRegularPosts.length} new regular posts...`
      );
      const regularBatchResults = await batchGraphQLCall(
        newRegularPosts,
        pollUserAgent
      );
      allBatchResults = [...allBatchResults, ...regularBatchResults];
    }

    // Process batch results with fallback
    for (const result of allBatchResults) {
      try {
        if (result.error) {
          console.log(
            `⚠️ Batch result error for ${result.url}: ${result.error}`
          );

          // Try individual processing as fallback
          const allNewPosts = [...newPinnedPosts, ...newRegularPosts];
          const originalPost = allNewPosts.find((p) => p.url === result.url);
          if (originalPost) {
            console.log(
              `🔄 Attempting individual processing fallback for ${result.url}`
            );
            const fallbackResult = await processIndividualPost(
              originalPost,
              pollUserAgent
            );

            if (fallbackResult.success) {
              // Process fallback result
              const postType =
                fallbackResult.data.length > 1
                  ? "carousel"
                  : fallbackResult.data[0]?.isVideo
                  ? "video"
                  : "photo";
              const isPinned = originalPost.is_pinned || false;

              // Send to Telegram for automatic polling fallback
              if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHANNEL_ID) {
                try {
                  console.log(
                    `📤 [AUTO-FALLBACK] Sending fallback result to Telegram...`
                  );

                  if (fallbackResult.data.length > 1) {
                    // Carousel - send as media group
                    const caption = `✨ New carousel from <a href="https://www.instagram.com/${TARGET_USERNAME}/">@${TARGET_USERNAME}</a>! 📱 <a href="${originalPost.url}">View Original Post</a>`;
                    await sendMediaGroupToTelegram(
                      fallbackResult.data,
                      caption
                    );
                    console.log(
                      `✅ [AUTO-FALLBACK] Carousel media group sent to Telegram successfully (${fallbackResult.data.length} items)`
                    );
                  } else {
                    // Single item - send normally
                    for (const item of fallbackResult.data) {
                      const photoCaption = `✨ New photo from <a href="https://www.instagram.com/${TARGET_USERNAME}/">@${TARGET_USERNAME}</a>! 📱 <a href="${originalPost.url}">View Original Post</a>`;
                      const videoCaption = `✨ New video from <a href="https://www.instagram.com/${TARGET_USERNAME}/">@${TARGET_USERNAME}</a>! 📱 <a href="${originalPost.url}">View Original Post</a>`;

                      if (item.isVideo) {
                        await sendVideoToTelegram(item.url, videoCaption);
                      } else {
                        await sendPhotoToTelegram(item.url, photoCaption);
                      }
                      console.log(
                        `✅ [AUTO-FALLBACK] Item sent to Telegram successfully`
                      );

                      // Add delay between Telegram sends
                      console.log(
                        `⏳ Waiting 3 seconds after Telegram send to prevent rate limiting...`
                      );
                      await new Promise((resolve) => setTimeout(resolve, 3000));
                    }
                  }
                } catch (telegramError) {
                  console.log(
                    `⚠️ [AUTO-FALLBACK] Failed to send to Telegram: ${telegramError.message}`
                  );
                }
              }

              // Mark as processed
              await markPostAsProcessed(
                originalPost.id,
                TARGET_USERNAME,
                originalPost.url,
                postType,
                isPinned
              );
              console.log(
                `✅ Fallback processing completed for ${originalPost.url}`
              );
            } else {
              console.log(
                `❌ Fallback processing also failed for ${result.url}`
              );
            }
          }
          continue;
        }

        // Check if post was already processed
        let alreadyProcessed = await isPostProcessed(
          result.shortcode,
          TARGET_USERNAME
        );
        if (force) {
          alreadyProcessed = false;
        }

        if (!alreadyProcessed) {
          const postType =
            result.data.length > 1
              ? "carousel"
              : result.data[0]?.isVideo
              ? "video"
              : "photo";
          const isPinned = result.isPinned || false;
          const pinnedIndicator = isPinned ? " (PINNED)" : "";

          console.log(
            `📱 Processing batch result: ${result.shortcode}${pinnedIndicator} | type=${postType}`
          );

          // Send to Telegram for automatic polling (separate from manual processing)
          if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHANNEL_ID) {
            try {
              if (result.data.length > 1) {
                // Carousel with multiple items - send as media group
                console.log(
                  `📤 [AUTO] Sending carousel as media group (${result.data.length} items)...`
                );
                const caption = `✨ New carousel from <a href="https://www.instagram.com/${TARGET_USERNAME}/">@${TARGET_USERNAME}</a>! 📱 <a href="${result.url}">View Original Post</a>`;
                await sendMediaGroupToTelegram(result.data, caption);
                console.log(
                  `✅ [AUTO] Carousel media group sent to Telegram successfully (${result.data.length} items)`
                );
              } else {
                // Single item - send individually
                for (const item of result.data) {
                  try {
                    console.log(
                      `🔄 Processing item: ${item.carouselIndex || 1} of ${
                        result.data.length
                      }`
                    );

                    console.log(
                      `📤 [AUTO] Sending item ${
                        item.carouselIndex || 1
                      } to Telegram...`
                    );
                    const photoCaption = `✨ New photo from <a href="https://www.instagram.com/${TARGET_USERNAME}/">@${TARGET_USERNAME}</a>! 📱 <a href="${result.url}">View Original Post</a>`;
                    const videoCaption = `✨ New video from <a href="https://www.instagram.com/${TARGET_USERNAME}/">@${TARGET_USERNAME}</a>! 📱 <a href="${result.url}">View Original Post</a>`;

                    if (item.isVideo) {
                      await sendVideoToTelegram(item.url, videoCaption);
                    } else {
                      await sendPhotoToTelegram(item.url, photoCaption);
                    }
                    console.log(
                      `✅ [AUTO] Item ${
                        item.carouselIndex || 1
                      } sent to Telegram successfully`
                    );

                    // Add delay between Telegram sends to avoid rate limiting
                    console.log(
                      `⏳ Waiting 3 seconds after Telegram send to prevent rate limiting...`
                    );
                    await new Promise((resolve) => setTimeout(resolve, 3000));
                  } catch (telegramError) {
                    console.log(
                      `⚠️ [AUTO] Failed to send item ${
                        item.carouselIndex || 1
                      } to Telegram: ${telegramError.message}`
                    );
                  }
                }
              }
            } catch (telegramError) {
              console.log(
                `⚠️ [AUTO] Failed to send to Telegram: ${telegramError.message}`
              );
            }
          }

          // Mark post as processed
          await markPostAsProcessed(
            result.shortcode,
            TARGET_USERNAME,
            result.url,
            postType,
            isPinned
          );
          console.log(
            `✅ Post marked as processed: ${result.shortcode}${
              isPinned ? " (PINNED)" : ""
            }`
          );

          // Success - decrease error multiplier
          decreaseErrorMultiplier();
        } else {
          console.log(`⏭️ Post already processed: ${result.shortcode}`);
        }
      } catch (error) {
        console.error(
          `Error processing batch result ${result.shortcode}:`,
          error.message
        );
        increaseErrorMultiplier();
      }
    }

    // Update cache AFTER successful Telegram sending (allows retry on failure)
    console.log(
      `📊 [CACHE] Updating cache with ${allPosts.length} posts after successful processing...`
    );
    await updateRecentPostsCache(TARGET_USERNAME, allPosts);
    console.log(`✅ [CACHE] Cache updated successfully`);

    // Update activity tracker with new posts found
    if (totalNewPosts > 0) {
      // Count all new posts as activity (since they're new to our system)
      activityTracker.updateActivity(totalNewPosts);
      console.log(
        `📊 Activity updated: +${totalNewPosts} new posts processed (${newPinnedPosts.length} pinned + ${newRegularPosts.length} regular)`
      );
    }

    console.log("✅ Polling check completed");
    // Always print request statistics after each polling run
    requestTracker.printStats();

    console.log("");
  } catch (error) {
    console.error("Polling error:", error.message);
    console.log(
      "⚠️ [CACHE] Cache NOT updated due to processing error - posts will retry next poll"
    );
  }
}

// Schedule polling with smart intervals based on activity level
function scheduleNextPoll() {
  // Get smart polling interval based on activity
  const baseMinutes = activityTracker.getPollingInterval();
  const variationMinutes = 2; // ±2 minutes for randomization

  // Add/subtract variation (±2 minutes)
  const variation =
    Math.floor(Math.random() * (variationMinutes * 2 + 1)) - variationMinutes;
  const finalMinutes = Math.max(1, baseMinutes + variation); // Ensure minimum 1 minute

  const nextPollMs = finalMinutes * 60 * 1000;

  const nextPollTime = new Date(Date.now() + nextPollMs);
  const timeString = nextPollTime.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "America/New_York",
  });
  console.log(
    `⏰ Next poll scheduled in ${finalMinutes} minutes (smart: ${baseMinutes} ± ${Math.abs(
      variation
    )}) for @${TARGET_USERNAME} at ${timeString} EDT`
  );

  currentPollingTimeout = setTimeout(async () => {
    if (POLLING_ENABLED) {
      try {
        // Check if cleanup operations are running and wait if needed
        await cleanupQueue.waitForCompletion();

        // Check for new stories first, then posts
        await checkForNewStories();
        await checkForNewPosts();

        // Reset activity counter for next poll cycle
        activityTracker.resetActivityCounter();

        scheduleNextPoll(); // Schedule the next poll
      } catch (error) {
        console.error("❌ Polling cycle failed:", error);
        // Log error but don't stop polling
        const errorLog = `[${new Date().toISOString()}] Polling error: ${
          error.message
        }\n${error.stack}\n\n`;
        fs.appendFileSync(path.join(__dirname, "error-logs.txt"), errorLog);

        // Retry after 5 minutes instead of the full interval
        setTimeout(async () => {
          if (POLLING_ENABLED) {
            try {
              await checkForNewStories();
              await checkForNewPosts();

              // Reset activity counter for next poll cycle
              activityTracker.resetActivityCounter();

              scheduleNextPoll();
            } catch (retryError) {
              console.error("❌ Polling retry failed:", retryError);
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
    console.log("🛑 Polling stopped");
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
      console.error("❌ Restart polling failed:", error);
      scheduleNextPoll();
    }
  }, 5000);
}

// Get current target status
app.get("/target", (req, res) => {
  res.json({
    current_target: TARGET_USERNAME || "",
    polling_enabled: POLLING_ENABLED,
    polling_active: currentPollingTimeout !== null,
    polling_started: pollingStarted,
  });
});

// Get cache status
app.get("/cache-status", async (req, res) => {
  try {
    const username = req.query.username || TARGET_USERNAME;

    if (!username) {
      return res.status(400).json({ error: "No username specified" });
    }

    const cachedPosts = await getCachedRecentPosts(username);
    const memoryCache = global.postCache ? global.postCache[username] : null;

    res.json({
      username,
      database_cache: {
        count: cachedPosts.length,
        posts: cachedPosts.slice(0, 5), // First 5 posts for preview
      },
      memory_cache: {
        exists: !!memoryCache,
        count: memoryCache ? memoryCache.length : 0,
      },
      global_cache_users: global.postCache ? Object.keys(global.postCache) : [],
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Reload cache from database
app.post("/cache-reload", async (req, res) => {
  try {
    console.log("🔄 Reloading cache from database...");
    await loadExistingCache();

    const cacheUsers = global.postCache ? Object.keys(global.postCache) : [];
    res.json({
      success: true,
      message: "Cache reloaded successfully",
      loaded_users: cacheUsers,
      user_count: cacheUsers.length,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Validate cache integrity
app.post("/cache-validate", async (req, res) => {
  try {
    console.log("🔍 Manual cache validation requested...");
    await validateCacheIntegrity();

    const cacheUsers = global.postCache ? Object.keys(global.postCache) : [];
    res.json({
      success: true,
      message: "Cache validation completed",
      memory_users: cacheUsers,
      user_count: cacheUsers.length,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
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
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    polling: {
      enabled: POLLING_ENABLED,
      active: currentPollingTimeout !== null,
      started: pollingStarted,
      target: TARGET_USERNAME,
    },
    database: db ? "connected" : "disconnected",
    consecutiveFailures: healthCheck.consecutiveFailures,
    browserPool: { total: 0, inUse: 0, available: 0, maxBrowsers: 0 }, // COMMENTED OUT DUE TO PUPPETEER ISSUES
    circuitBreaker: circuitBreaker.getStatus(),
  };

  // Check if service is healthy
  if (healthCheck.consecutiveFailures >= healthCheck.maxFailures) {
    health.status = "unhealthy";
    return res.status(503).json(health);
  }

  // Check memory usage
  const memUsage = process.memoryUsage();
  if (memUsage.heapUsed > 500 * 1024 * 1024) {
    // 500MB
    health.status = "warning";
    health.memoryWarning = "High memory usage detected";
  }

  // Check circuit breaker
  if (circuitBreaker.state === "OPEN") {
    health.status = "degraded";
    health.circuitBreakerWarning = "Circuit breaker is open";
  }

  res.json(health);
});

// Get request logs (last 100 entries)
app.get("/logs", (req, res) => {
  try {
    const logFile = path.join(__dirname, "request-logs.txt");
    if (fs.existsSync(logFile)) {
      const content = fs.readFileSync(logFile, "utf8");
      const lines = content.trim().split("\n").reverse().slice(0, 100);
      res.json({
        success: true,
        logs: lines,
        total: content.trim().split("\n").length,
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
          "instagram.com/instagram",
        ],
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
        changed: false,
      });
    }

    // Update target
    TARGET_USERNAME = newTarget;
    console.log(
      `🎯 Target changed from @${oldTarget || "none"} to @${newTarget}`
    );

    res.json({
      success: true,
      message: `Target changed to @${newTarget}`,
      old_target: oldTarget,
      new_target: newTarget,
      changed: true,
      polling_restarted: false,
    });
  } catch (error) {
    console.error("Error changing target:", error.message);
    res.status(400).json({
      error: error.message,
      examples: [
        "instagram",
        "@instagram",
        "https://instagram.com/instagram",
        "instagram.com/instagram",
      ],
    });
  }
});

// Reset processed posts for current username (dangerous)
app.post("/reset-processed", async (req, res) => {
  try {
    const username = TARGET_USERNAME;
    if (!username) return res.status(400).json({ error: "No target set" });

    // Clear both processed posts and cache
    const clearProcessed = new Promise((resolve, reject) => {
      db.run(
        "DELETE FROM processed_posts WHERE username = ?",
        [username],
        function (err) {
          if (err) reject(err);
          else resolve(this.changes);
        }
      );
    });

    const clearCache = clearUserCache(username);

    const [processedDeleted, cacheDeleted] = await Promise.all([
      clearProcessed,
      clearCache,
    ]);

    console.log(
      `🧹 Cleared processed posts for @${username} (deleted=${processedDeleted})`
    );
    console.log(`🗑️ Cleared cache for @${username} (deleted=${cacheDeleted})`);

    res.json({
      success: true,
      processed_deleted: processedDeleted,
      cache_deleted: cacheDeleted,
      username,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Clear cache for current username
app.post("/clear-cache", async (req, res) => {
  try {
    const username = TARGET_USERNAME;
    if (!username) return res.status(400).json({ error: "No target set" });

    const deleted = await clearUserCache(username);
    res.json({ success: true, deleted, username });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Clear all data for current username (processed posts + cache)
app.post("/clear-all", async (req, res) => {
  try {
    const username = TARGET_USERNAME;
    if (!username) return res.status(400).json({ error: "No target set" });

    const result = await clearUserData(username);
    res.json({
      success: true,
      processed_deleted: result.processedDeleted,
      cache_deleted: result.cacheDeleted,
      username,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Storage status monitoring endpoint
app.get("/storage-status", (req, res) => {
  const fs = require("fs");
  const path = require("path");

  try {
    const dbStats = fs.statSync(dbPath);
    const downloadsExists = fs.existsSync(DOWNLOADS_DIR);
    const downloadsFiles = downloadsExists
      ? fs.readdirSync(DOWNLOADS_DIR).length
      : 0;

    res.json({
      database: {
        path: dbPath,
        size: dbStats.size,
        exists: true,
        environment: process.env.NODE_ENV,
      },
      downloads: {
        path: DOWNLOADS_DIR,
        exists: downloadsExists,
        files: downloadsFiles,
      },
      environment: process.env.NODE_ENV,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Clear stories data for current username (processed stories + stories cache)
app.post("/clear-stories-cache", async (req, res) => {
  try {
    const username = TARGET_USERNAME;
    if (!username) return res.status(400).json({ error: "No target set" });

    let processedStoriesDeleted = 0;
    let storiesCacheDeleted = 0;

    // Use Supabase if available, otherwise fallback to SQLite
    if (supabaseManager && supabaseManager.isConnected) {
      try {
        console.log(
          `🗑️ Clearing stories data for @${username} using Supabase...`
        );
        const result = await supabaseManager.clearUserStoriesData(username);
        processedStoriesDeleted = result.processedStoriesDeleted;
        storiesCacheDeleted = result.storiesCacheDeleted;
      } catch (error) {
        console.error(`❌ Supabase stories clear failed: ${error.message}`);
        console.log("🔄 Falling back to SQLite...");
        // Continue to SQLite fallback
      }
    }

    // Fallback to SQLite if Supabase failed or not connected
    if (processedStoriesDeleted === 0 && storiesCacheDeleted === 0 && db) {
      // Clear processed stories
      const clearProcessedStories = new Promise((resolve) => {
        db.run(
          "DELETE FROM processed_stories WHERE username = ?",
          [username],
          function (err) {
            if (err) {
              console.error("Database error clearing processed stories:", err);
              resolve(0);
            } else {
              console.log(
                `🗑️ Cleared processed stories for @${username} (${this.changes} entries) (SQLite)`
              );
              resolve(this.changes);
            }
          }
        );
      });

      // Clear stories cache
      const clearStoriesCache = new Promise((resolve) => {
        db.run(
          "DELETE FROM recent_stories_cache WHERE username = ?",
          [username],
          function (err) {
            if (err) {
              console.error("Database error clearing stories cache:", err);
              resolve(0);
            } else {
              console.log(
                `🗑️ Cleared stories cache for @${username} (${this.changes} entries) (SQLite)`
              );
              resolve(this.changes);
            }
          }
        );
      });

      [processedStoriesDeleted, storiesCacheDeleted] = await Promise.all([
        clearProcessedStories,
        clearStoriesCache,
      ]);
    }

    const totalDeleted = processedStoriesDeleted + storiesCacheDeleted;
    res.json({
      success: true,
      username: username,
      processed_stories_deleted: processedStoriesDeleted,
      stories_cache_deleted: storiesCacheDeleted,
      total_deleted: totalDeleted,
      message: `Cleared ${totalDeleted} stories data entries for @${username}`,
    });
  } catch (error) {
    console.error("Error clearing stories data:", error);
    res.status(500).json({ error: "Failed to clear stories data" });
  }
});

// Debug endpoint to check story tables
app.get("/debug-stories", async (req, res) => {
  try {
    const username = req.query.username || TARGET_USERNAME;
    if (!username)
      return res.status(400).json({ error: "No username provided" });

    // Check processed_stories table
    const processedStories = new Promise((resolve) => {
      db.all(
        "SELECT COUNT(*) as count FROM processed_stories WHERE username = ?",
        [username],
        (err, rows) => {
          if (err) {
            console.error("Database error checking processed stories:", err);
            resolve(0);
          } else {
            resolve(rows[0]?.count || 0);
          }
        }
      );
    });

    // Check recent_stories_cache table
    const storiesCache = new Promise((resolve) => {
      db.all(
        "SELECT COUNT(*) as count FROM recent_stories_cache WHERE username = ?",
        [username],
        (err, rows) => {
          if (err) {
            console.error("Database error checking stories cache:", err);
            resolve(0);
          } else {
            resolve(rows[0]?.count || 0);
          }
        }
      );
    });

    const [processedCount, cacheCount] = await Promise.all([
      processedStories,
      storiesCache,
    ]);

    res.json({
      username: username,
      processed_stories_count: processedCount,
      stories_cache_count: cacheCount,
      total_stories: processedCount + cacheCount,
      message: `Database status for @${username}`,
    });
  } catch (error) {
    console.error("Error checking story tables:", error);
    res.status(500).json({ error: "Failed to check story tables" });
  }
});

// Start polling endpoint
app.post("/start-polling", async (req, res) => {
  try {
    if (!TARGET_USERNAME) {
      return res
        .status(400)
        .json({ error: "No target set. Please set a target first." });
    }

    if (pollingStarted) {
      return res.json({
        success: true,
        message: "Polling already started",
        target: TARGET_USERNAME,
        polling_active: true,
      });
    }

    console.log(`🚀 Starting polling for @${TARGET_USERNAME}`);
    startPolling(TARGET_USERNAME);

    res.json({
      success: true,
      message: `Polling started for @${TARGET_USERNAME}`,
      target: TARGET_USERNAME,
      polling_active: true,
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
        polling_active: false,
      });
    }

    console.log(`🛑 Stopping polling for @${TARGET_USERNAME}`);
    stopPolling();

    res.json({
      success: true,
      message: "Polling stopped",
      polling_active: false,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Manual polling endpoint for testing
app.get("/poll-now", async (req, res) => {
  try {
    const force = String(req.query.force || "false").toLowerCase() === "true";
    console.log(`Manual polling triggered via API (force=${force})`);
    await checkForNewPosts(force);
    res.json({
      success: true,
      message: "Polling completed",
      target: TARGET_USERNAME,
      force,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== SNAPCHAT POLLING ENDPOINTS =====
// Snapchat polling endpoints removed - using unified Python service only
// snapchatPolling.setupSnapchatEndpoints(app);

// Snapchat proxy endpoints for Vercel deployment
const SNAPCHAT_SERVICE_URL =
  process.env.SNAPCHAT_SERVICE_URL || "http://localhost:8000";

// Snapchat status endpoint
app.get("/snapchat-status", async (req, res) => {
  try {
    const response = await fetch(`${SNAPCHAT_SERVICE_URL}/status`);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({
      error: "Snapchat service unavailable",
      message: error.message,
      snapchat_url: SNAPCHAT_SERVICE_URL,
    });
  }
});

// Snapchat stats endpoint
app.get("/snapchat-stats", async (req, res) => {
  try {
    const response = await fetch(`${SNAPCHAT_SERVICE_URL}/stats`);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({
      error: "Snapchat service unavailable",
      message: error.message,
    });
  }
});

// Snapchat gallery endpoint
app.get("/gallery/:type", async (req, res) => {
  try {
    const { type } = req.params;
    const response = await fetch(`${SNAPCHAT_SERVICE_URL}/gallery/${type}`);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({
      error: "Snapchat service unavailable",
      message: error.message,
    });
  }
});

// Snapchat download endpoint
app.post("/snapchat-download", async (req, res) => {
  try {
    const response = await fetch(`${SNAPCHAT_SERVICE_URL}/download`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
    });
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({
      error: "Snapchat service unavailable",
      message: error.message,
    });
  }
});

// Snapchat polling endpoints
app.post("/snapchat-start-polling", async (req, res) => {
  try {
    const response = await fetch(`${SNAPCHAT_SERVICE_URL}/start-polling`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
    });
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({
      error: "Snapchat service unavailable",
      message: error.message,
    });
  }
});

app.post("/snapchat-stop-polling", async (req, res) => {
  try {
    const response = await fetch(`${SNAPCHAT_SERVICE_URL}/stop-polling`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
    });
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({
      error: "Snapchat service unavailable",
      message: error.message,
    });
  }
});

app.get("/snapchat-poll-now", async (req, res) => {
  try {
    const response = await fetch(
      `${SNAPCHAT_SERVICE_URL}/poll-now?${new URLSearchParams(req.query)}`
    );
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({
      error: "Snapchat service unavailable",
      message: error.message,
    });
  }
});

app.post("/snapchat-set-target", async (req, res) => {
  try {
    const response = await fetch(`${SNAPCHAT_SERVICE_URL}/set-target`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
    });
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({
      error: "Snapchat service unavailable",
      message: error.message,
    });
  }
});

app.listen(port, async () => {
  instagramLog(`🚀 Instagram Backend running at http://localhost:${port}`);
  instagramLog("🌐 Unified Frontend available: http://localhost:5173");
  instagramLog("📡 API server ready for requests");
  instagramLog(
    "📊 Request tracking enabled - use /stats endpoint to view statistics"
  );

  // Initialize databases first
  await initializeDatabases();

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
      console.log(
        `📊 First run detected - skipping activity tracking for old posts`
      );
      this.isFirstRun = false;
      return;
    }

    this.recentPosts += newPostsCount;
    this.lastActivity = new Date();
    console.log(
      `📊 Activity updated: +${newPostsCount} posts (total: ${this.recentPosts} in current poll cycle)`
    );
  },

  getActivityLevel() {
    // Activity levels - reset counter at end of each poll cycle
    if (this.recentPosts >= 2) return "high";
    if (this.recentPosts >= 1) return "medium";
    return "low";
  },

  resetActivityCounter() {
    this.recentPosts = 0;
    console.log(`🔄 Activity counter reset for next poll cycle`);
  },

  getPollingInterval() {
    const baseInterval = 25; // minutes
    const activityLevel = this.getActivityLevel();

    let interval = baseInterval;
    if (activityLevel === "high") {
      interval = 15; // 15 minutes for active users
    } else if (activityLevel === "low") {
      interval = 45; // 45 minutes for inactive users
    }
    // medium stays at 25 minutes

    console.log(
      `🔄 Smart polling: ${interval} minutes (${activityLevel} activity level)`
    );
    return interval;
  },
};

// ===== INSTAGRAM STORIES IMPLEMENTATION =====

// Process Instagram stories using FastDl.app approach
async function processInstagramStories(username, userAgent = null) {
  let session = null;

  try {
    if (!username) {
      return { success: false, error: "Username parameter is missing" };
    }

    console.log(
      `📱 Processing Instagram stories for: @${username} with FastDl.app`
    );

    // Initialize FastDl session with consistent bot detection
    session = new FastDlSession(username);
    const sessionInitialized = await session.initialize();

    if (!sessionInitialized) {
      console.log(`❌ Failed to initialize FastDl session for @${username}`);
      return { success: false, error: "Session initialization failed" };
    }

    // Use FastDl.app to scrape stories
    const stories = await scrapeInstagramStoriesWithFastDl(session);

    if (!stories || stories.length === 0) {
      console.log(`⚠️ No stories found for @${username} via FastDl.app`);
      return {
        success: true,
        data: {
          status: true,
          data: [],
          message: "No stories found",
          summary: {
            total: 0,
            new: 0,
            existing: 0,
          },
        },
      };
    }

    console.log(
      `✅ Found ${stories.length} stories for @${username} via FastDl.app`
    );

    // Process each story and track in database
    const processedStories = [];
    const storyIds = [];

    for (let i = 0; i < stories.length; i++) {
      const story = stories[i];

      try {
        console.log(`📱 Processing story ${i + 1}/${stories.length}...`);

        // Check if story was already processed (Supabase only)
        const isProcessed = await checkStoryProcessed(username, story.storyId);
        console.log(
          `🔍 Story ${story.storyId} already processed: ${isProcessed}`
        );

        if (!isProcessed) {
          // Download story file to temp directory
          let downloadedFile = null;
          try {
            downloadedFile = await downloadStoryFile(
              story.url,
              story.storyType,
              story.index,
              username
            );
            story.filePath = downloadedFile.filePath;
            story.fileName = downloadedFile.fileName;
          } catch (downloadError) {
            console.log(
              `⚠️ [STORY] Download failed, skipping story: ${downloadError.message}`
            );
            continue; // Skip this story if download fails
          }

          // Add to processed stories
          processedStories.push({
            ...story,
            isNew: true,
            method: "fastdl",
          });

          storyIds.push(story.storyId);

          // Track in database (Supabase only)
          await markStoryProcessed(
            username,
            story.url,
            story.storyType,
            story.storyId
          );

          // Send to Telegram if configured
          if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHANNEL_ID) {
            try {
              console.log(`📤 [STORY] Sending new story to Telegram...`);

              const storyCaption = `💫 View Story: <a href="https://www.instagram.com/${username}/">@${username}</a>`;

              console.log(`📤 [STORY] Telegram sending decision:`);
              console.log(`  - storyType: ${story.storyType}`);
              console.log(`  - isVideo: ${story.isVideo}`);
              console.log(`  - filePath: ${story.filePath}`);
              console.log(
                `  - Will send as: ${story.isVideo ? "VIDEO" : "PHOTO"}`
              );

              // Always use file path (downloaded file required)
              if (story.isVideo) {
                await sendVideoToTelegram(story.filePath, storyCaption);
              } else {
                await sendPhotoToTelegram(story.filePath, storyCaption);
              }
              console.log(`✅ [STORY] Story sent to Telegram successfully`);

              // Clean up downloaded file immediately after sending
              if (story.filePath && fs.existsSync(story.filePath)) {
                try {
                  fs.unlinkSync(story.filePath);
                  console.log(
                    `🗑️ [STORY] Cleaned up downloaded file: ${story.fileName}`
                  );
                } catch (cleanupError) {
                  console.log(
                    `⚠️ [STORY] Failed to cleanup file: ${cleanupError.message}`
                  );
                }
              }

              // Add delay after Telegram send to prevent overwhelming the API
              console.log(
                `⏳ Waiting 3 seconds after Telegram send to prevent rate limiting...`
              );
              await new Promise((resolve) => setTimeout(resolve, 3000));
            } catch (telegramError) {
              console.log(
                `⚠️ [STORY] Failed to send story to Telegram: ${telegramError.message}`
              );
              // Still cleanup file even if Telegram send fails
              if (story.filePath && fs.existsSync(story.filePath)) {
                try {
                  fs.unlinkSync(story.filePath);
                  console.log(`🗑️ [STORY] Cleaned up file after error`);
                } catch (cleanupError) {
                  console.log(
                    `⚠️ [STORY] Failed to cleanup: ${cleanupError.message}`
                  );
                }
              }
            }
          } else {
            // No Telegram configured, cleanup downloaded file
            if (story.filePath && fs.existsSync(story.filePath)) {
              try {
                fs.unlinkSync(story.filePath);
                console.log(
                  `🗑️ [STORY] Cleaned up file (no Telegram configured)`
                );
              } catch (cleanupError) {
                console.log(
                  `⚠️ [STORY] Failed to cleanup: ${cleanupError.message}`
                );
              }
            }
          }
        } else {
          // Story already processed, add without processing
          processedStories.push({
            ...story,
            isNew: false,
            method: "fastdl",
          });
        }
      } catch (storyError) {
        console.log(
          `⚠️ Error processing individual story: ${storyError.message}`
        );
      }

      console.log(`✅ Story ${i + 1}/${stories.length} processing completed`);
    }

    // Update cache
    await updateStoriesCache(username, processedStories);

    console.log(
      `📊 Stories summary: ${
        processedStories.filter((s) => s.isNew).length
      } new, ${processedStories.filter((s) => !s.isNew).length} existing`
    );

    return {
      success: true,
      data: {
        status: true,
        data: processedStories,
        method: "fastdl",
        summary: {
          total: processedStories.length,
          new: processedStories.filter((s) => s.isNew).length,
          existing: processedStories.filter((s) => !s.isNew).length,
        },
      },
    };
  } catch (err) {
    console.log(
      `❌ [FASTDL] Error processing Instagram stories for @${username}: ${err.message}`
    );

    // Provide clear error message and exit gracefully
    if (err.message.includes("FastDl.app service unavailable")) {
      console.log(`🚫 [FASTDL] FastDl.app service is currently unavailable`);
      console.log(
        `💡 [FASTDL] This could be due to rate limiting, service maintenance, or access restrictions`
      );
    } else if (err.message.includes("Could not find input field")) {
      console.log(
        `🚫 [FASTDL] FastDl.app interface has changed - input field not found`
      );
    } else if (err.message.includes("Could not find download button")) {
      console.log(
        `🚫 [FASTDL] FastDl.app interface has changed - download button not found`
      );
    } else if (err.message.includes("Failed to load FastDl.app page")) {
      console.log(
        `🚫 [FASTDL] Unable to access FastDl.app - service may be down`
      );
    } else {
      console.log(
        `🚫 [FASTDL] Unexpected error occurred during story processing`
      );
    }

    console.log(`✅ [FASTDL] Exiting gracefully without fallback methods`);

    return {
      success: false,
      error: `FastDl.app service unavailable: ${err.message}`,
      data: {
        status: false,
        data: [],
        message: "Story download service temporarily unavailable",
        summary: {
          total: 0,
          new: 0,
          existing: 0,
        },
      },
    };
  } finally {
    // Always cleanup the session
    if (session) {
      await session.cleanup();
    }
  }
}

// Re-encode story video with correct aspect ratio for Telegram
async function reencodeStoryVideo(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    if (!ffmpegAvailable) {
      console.log(`⚠️ [FFMPEG] FFmpeg not available, skipping re-encoding`);
      resolve(false);
      return;
    }

    console.log(`🎬 [FFMPEG] Re-encoding video with 9:16 aspect ratio...`);

    ffmpeg(inputPath)
      .outputOptions([
        "-c:v copy", // Copy video stream (fast, no quality loss)
        "-c:a copy", // Copy audio stream
        "-aspect 9:16", // Set display aspect ratio to 9:16 (vertical)
        "-metadata:s:v:0 rotate=0", // Clear rotation metadata
      ])
      .on("start", (commandLine) => {
        console.log(`🎬 [FFMPEG] Command: ${commandLine.substring(0, 100)}...`);
      })
      .on("progress", (progress) => {
        if (progress.percent) {
          console.log(`🎬 [FFMPEG] Progress: ${Math.round(progress.percent)}%`);
        }
      })
      .on("end", () => {
        console.log(`✅ [FFMPEG] Re-encoding complete`);
        resolve(true);
      })
      .on("error", (err) => {
        console.log(`❌ [FFMPEG] Re-encoding failed: ${err.message}`);
        reject(err);
      })
      .save(outputPath);

    // Timeout after 30 seconds
    setTimeout(() => {
      reject(new Error("FFmpeg re-encoding timeout"));
    }, 30000);
  });
}

// Download story file temporarily for Telegram sending
async function downloadStoryFile(url, storyType, index, username) {
  const axios = require("axios");
  const timestamp = Date.now();
  const extension = storyType === "video" ? "mp4" : "jpg";
  const fileName = `story_${username}_${timestamp}_${index}.${extension}`;
  const filePath = path.join(__dirname, "temp", fileName);

  try {
    // Ensure temp directory exists
    if (!fs.existsSync(path.join(__dirname, "temp"))) {
      fs.mkdirSync(path.join(__dirname, "temp"), { recursive: true });
    }

    console.log(`📥 [DOWNLOAD] Downloading ${storyType} to temp: ${fileName}`);

    const response = await axios({
      method: "GET",
      url: url,
      responseType: "stream",
      timeout: 60000,
    });

    const writer = fs.createWriteStream(filePath);
    response.data.pipe(writer);

    await new Promise((resolve, reject) => {
      writer.on("finish", resolve);
      writer.on("error", reject);
    });

    console.log(`✅ [DOWNLOAD] Downloaded: ${fileName}`);

    // Re-encode video if it's a video and ffmpeg is available
    if (storyType === "video" && ffmpegAvailable) {
      const reencodedFileName = `story_${username}_${timestamp}_${index}_fixed.${extension}`;
      const reencodedFilePath = path.join(__dirname, "temp", reencodedFileName);

      try {
        await reencodeStoryVideo(filePath, reencodedFilePath);

        // Delete original file, use re-encoded version
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.log(`🗑️ [FFMPEG] Deleted original file`);
        }

        console.log(`✅ [FFMPEG] Using re-encoded file: ${reencodedFileName}`);
        return { filePath: reencodedFilePath, fileName: reencodedFileName };
      } catch (ffmpegError) {
        console.log(
          `⚠️ [FFMPEG] Re-encoding failed, using original file: ${ffmpegError.message}`
        );
        // Delete re-encoded file if it exists
        if (fs.existsSync(reencodedFilePath)) {
          fs.unlinkSync(reencodedFilePath);
        }
        // Fall back to original file
        return { filePath, fileName };
      }
    }

    // For images or when ffmpeg not available, return original
    return { filePath, fileName };
  } catch (error) {
    console.log(`❌ [DOWNLOAD] Error: ${error.message}`);
    throw error;
  }
}

// Get Instagram stories using web API (similar to posts approach) - COMMENTED OUT
async function getInstagramStoriesViaWeb(username, userAgent = null) {
  // COMMENTED OUT - Using FastDl.app instead
  console.log(
    `🎬 [COMMENTED OUT] Processing stories for @${username} - Using FastDl.app instead`
  );
  return [];
}

// Extract stories from Instagram stories page content
function extractStoriesFromPage(pageContent, username) {
  const stories = [];

  try {
    console.log("🔍 Parsing stories page content...");

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
      /"reel":\{(.*?)\}/g,
    ];

    let foundUrls = new Set();

    for (const pattern of patterns) {
      const matches = pageContent.matchAll(pattern);
      for (const match of matches) {
        if (match[1] && match[1].includes("instagram")) {
          foundUrls.add(match[1]);
          console.log(
            `  📱 Found potential story URL: ${match[1].substring(0, 50)}...`
          );
        }
      }
    }

    // Convert URLs to story objects
    for (const url of foundUrls) {
      const isVideo = url.includes(".mp4") || url.includes("video");
      const mediaType = isVideo ? "video" : "photo";

      stories.push({
        url: url,
        thumb: url, // Use same URL as thumbnail for now
        quality: "HD",
        isVideo: isVideo,
        storyType: mediaType,
        timestamp: Math.floor(Date.now() / 1000),
        shortcode: `direct_${Date.now()}_${Math.random()
          .toString(36)
          .substr(2, 9)}`,
      });
    }

    console.log(
      `📊 Extracted ${stories.length} potential stories from page content`
    );

    // Also try to find JSON data blocks that might contain story info
    const jsonMatches = pageContent.match(
      /<script[^>]*>window\._sharedData\s*=\s*({.*?});<\/script>/g
    );
    if (jsonMatches) {
      console.log("🔍 Found _sharedData script, attempting to parse...");
      for (const match of jsonMatches) {
        try {
          const jsonStart = match.indexOf("{");
          const jsonEnd = match.lastIndexOf("}") + 1;
          const jsonStr = match.substring(jsonStart, jsonEnd);
          const jsonData = JSON.parse(jsonStr);

          // Navigate through the JSON structure to find stories
          if (jsonData.entry_data && jsonData.entry_data.StoriesPage) {
            console.log("✅ Found StoriesPage data in _sharedData");
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
    console.error("❌ Error parsing stories page:", error.message);
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
      console.log(
        `📱 Found ${storiesPage.items.length} story items in JSON data`
      );

      for (const item of storiesPage.items) {
        let mediaUrl = null;
        let mediaType = "photo";

        if (item.media_type === "VIDEO") {
          mediaUrl = item.video_versions?.[0]?.url;
          mediaType = "video";
        } else if (item.media_type === "IMAGE") {
          mediaUrl = item.image_versions2?.candidates?.[0]?.url;
          mediaType = "photo";
        }

        if (mediaUrl) {
          stories.push({
            url: mediaUrl,
            thumb: item.image_versions2?.candidates?.[0]?.url || mediaUrl,
            quality: "HD",
            isVideo: item.media_type === "VIDEO",
            storyType: mediaType,
            timestamp: item.taken_at_timestamp,
            shortcode: item.code,
          });
          console.log(
            `  ✅ Added story: ${mediaType} - ${mediaUrl.substring(0, 50)}...`
          );
        }
      }
    }
  } catch (error) {
    console.error("❌ Error parsing JSON stories:", error.message);
  }

  return stories;
}

// Check if a story was already processed (Supabase only)
async function checkStoryProcessed(username, storyId) {
  console.log(`🔍 [DB] Checking if story ${storyId} exists for @${username}`);

  // Use Supabase only - no SQLite fallback for stories
  if (!supabaseManager || !supabaseManager.isConnected) {
    console.error(
      `❌ [STORY] Supabase not connected - cannot check story status`
    );
    throw new Error("Supabase connection required for story processing");
  }

  try {
    const exists = await supabaseManager.checkStoryProcessed(username, storyId);
    console.log(`🔍 [DB] Story ${storyId} exists: ${exists} (Supabase)`);
    return exists;
  } catch (error) {
    console.error(`❌ Supabase story check failed: ${error.message}`);
    throw error; // Don't fallback, throw error to skip story processing
  }
}

// Mark a story as processed (Supabase only)
async function markStoryProcessed(username, storyUrl, storyType, storyId) {
  // Use Supabase only - no SQLite fallback for stories
  if (!supabaseManager || !supabaseManager.isConnected) {
    console.error(
      `❌ [STORY] Supabase not connected - cannot mark story as processed`
    );
    throw new Error("Supabase connection required for story processing");
  }

  try {
    await supabaseManager.markStoryProcessed(
      username,
      storyUrl,
      storyType,
      storyId
    );
    console.log(
      `✅ Story ${storyId} marked as processed for @${username} (Supabase)`
    );
  } catch (error) {
    console.error(`❌ Supabase story marking failed: ${error.message}`);
    throw error; // Don't fallback, throw error to skip story processing
  }
}

// Update stories cache
function updateStoriesCache(username, stories) {
  return new Promise((resolve, reject) => {
    // Clear old cache for this user
    db.run(
      "DELETE FROM recent_stories_cache WHERE username = ?",
      [username],
      function (err) {
        if (err) {
          console.error("Database error clearing stories cache:", err);
          reject(err);
          return;
        }

        // Insert new cache entries (ignore duplicates)
        const stmt = db.prepare(
          "INSERT OR IGNORE INTO recent_stories_cache (username, story_url, story_id, story_type) VALUES (?, ?, ?, ?)"
        );

        let insertedCount = 0;
        stories.forEach((story, index) => {
          stmt.run(
            [username, story.url, story.storyId, story.storyType],
            function (err) {
              if (err) {
                console.error("Database error inserting story cache:", err);
              } else if (this.changes > 0) {
                insertedCount++;
              }
            }
          );
        });

        stmt.finalize((err) => {
          if (err) {
            console.error("Database error finalizing story cache:", err);
            reject(err);
          } else {
            console.log(
              `✅ Stories cache updated for @${username} (${insertedCount} new entries inserted)`
            );
            resolve();
          }
        });
      }
    );
  });
}

// Check for new stories (integrated with main polling)
async function checkForNewStories(force = false) {
  try {
    if (!TARGET_USERNAME) {
      console.log("❌ No target username set for story checking");
      return;
    }

    // Check Supabase connection first (required for stories)
    if (!supabaseManager || !supabaseManager.isConnected) {
      console.log("⚠️ [STORY] Stories disabled - Supabase not connected");
      console.log(
        "💡 [STORY] Stories require Supabase for deduplication tracking"
      );
      return;
    }

    const pollUserAgent = getRandomUserAgent();
    setPollingUserAgent(pollUserAgent);
    console.log(
      `\n📱 Checking for new stories from @${TARGET_USERNAME} ${
        force ? "(force send enabled)" : ""
      }`
    );
    console.log(
      `🌐 Stories polling cycle using consistent user agent: ${pollUserAgent.substring(
        0,
        50
      )}...`
    );
    console.log(
      `🔒 This user agent will be maintained for all story API calls in this polling cycle`
    );

    // Reset GraphQL call counter for stories polling cycle
    resetGraphQLCallCounter();

    const result = await processInstagramStories(
      TARGET_USERNAME,
      pollUserAgent
    );

    if (result.success) {
      const { summary } = result.data;
      console.log(
        `📊 Stories summary: ${summary.total} total, ${summary.new} new, ${summary.existing} existing`
      );

      if (summary.new > 0) {
        console.log(
          `✅ Found ${summary.new} new stories from @${TARGET_USERNAME}`
        );
      } else {
        console.log(`ℹ️ No new stories found from @${TARGET_USERNAME}`);
      }
    } else {
      console.error(`❌ Story processing failed: ${result.error}`);
    }
  } catch (error) {
    console.error("❌ Story checking error:", error);
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

    const result = await processInstagramStories(
      username,
      getPollingUserAgent()
    );

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
      return res
        .status(400)
        .json({ error: "No target username set. Use /target endpoint first." });
    }

    const result = await processInstagramStories(
      TARGET_USERNAME,
      getPollingUserAgent()
    );

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
      "SELECT * FROM processed_stories WHERE username = ? ORDER BY processed_at DESC LIMIT 50",
      [username],
      (err, rows) => {
        if (err) {
          console.error("Database error getting processed stories:", err);
          res.status(500).json({ error: "Database error" });
        } else {
          res.json({
            success: true,
            data: rows,
            count: rows.length,
          });
        }
      }
    );
  } catch (err) {
    console.error("Get processed stories error:", err.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Test Instagram API connectivity from Render
app.get("/test-instagram-api", async (req, res) => {
  try {
    const { username = "instagram" } = req.query;
    const testResults = {
      timestamp: new Date().toISOString(),
      server_ip: "Testing from Render...",
      target_username: username,
      tests: [],
    };

    console.log(`🔍 Testing Instagram API connectivity for @${username}`);

    // Test 1: Basic HTTP request to Instagram
    try {
      const basicResponse = await axios.get(
        `https://www.instagram.com/${username}/`,
        {
          timeout: 10000,
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          },
        }
      );
      testResults.tests.push({
        name: "Basic Instagram Page Access",
        success: true,
        status: basicResponse.status,
        message: "Successfully accessed Instagram page",
      });
    } catch (error) {
      testResults.tests.push({
        name: "Basic Instagram Page Access",
        success: false,
        status: error.response?.status,
        message: error.message,
      });
    }

    // Test 2: Instagram API endpoint
    try {
      const apiResponse = await axios.get(
        `https://www.instagram.com/api/v1/users/web_profile_info/?username=${username}`,
        {
          timeout: 10000,
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            Accept: "application/json",
            "Accept-Language": "en-US,en;q=0.9",
            "X-IG-App-ID": "936619743392459",
            "X-ASBD-ID": "129477",
            "X-IG-WWW-Claim": "0",
            "X-Requested-With": "XMLHttpRequest",
            "Sec-Fetch-Dest": "empty",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Site": "same-origin",
            Referer: "https://www.instagram.com/",
            Origin: "https://www.instagram.com",
          },
        }
      );
      testResults.tests.push({
        name: "Instagram API Endpoint",
        success: true,
        status: apiResponse.status,
        message: "Successfully accessed Instagram API",
        has_data: !!apiResponse.data?.data?.user,
      });
    } catch (error) {
      testResults.tests.push({
        name: "Instagram API Endpoint",
        success: false,
        status: error.response?.status,
        message: error.message,
        is_401: error.response?.status === 401,
        is_403: error.response?.status === 403,
        is_429: error.response?.status === 429,
      });
    }

    // Test 3: Multiple user agents
    const userAgents = [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    ];

    for (let i = 0; i < userAgents.length; i++) {
      try {
        const uaResponse = await axios.get(
          `https://www.instagram.com/api/v1/users/web_profile_info/?username=${username}`,
          {
            timeout: 10000,
            headers: {
              "User-Agent": userAgents[i],
              Accept: "application/json",
              "Accept-Language": "en-US,en;q=0.9",
              "X-IG-App-ID": "936619743392459",
              "X-ASBD-ID": "129477",
              "X-IG-WWW-Claim": "0",
              "X-Requested-With": "XMLHttpRequest",
              "Sec-Fetch-Dest": "empty",
              "Sec-Fetch-Mode": "cors",
              "Sec-Fetch-Site": "same-origin",
              Referer: "https://www.instagram.com/",
              Origin: "https://www.instagram.com",
            },
          }
        );
        testResults.tests.push({
          name: `User Agent Test ${i + 1} (${userAgents[i].substring(
            0,
            50
          )}...)`,
          success: true,
          status: uaResponse.status,
          message: "Success with this user agent",
        });
        break; // Stop if one works
      } catch (error) {
        testResults.tests.push({
          name: `User Agent Test ${i + 1} (${userAgents[i].substring(
            0,
            50
          )}...)`,
          success: false,
          status: error.response?.status,
          message: error.message,
          is_401: error.response?.status === 401,
        });
      }
    }

    // Test 4: Get server IP (if possible)
    try {
      const ipResponse = await axios.get("https://api.ipify.org?format=json", {
        timeout: 5000,
      });
      testResults.server_ip = ipResponse.data.ip;
    } catch (error) {
      testResults.server_ip = "Could not determine IP";
    }

    // Summary
    const successfulTests = testResults.tests.filter(
      (test) => test.success
    ).length;
    const totalTests = testResults.tests.length;

    testResults.summary = {
      total_tests: totalTests,
      successful_tests: successfulTests,
      failed_tests: totalTests - successfulTests,
      success_rate: `${((successfulTests / totalTests) * 100).toFixed(1)}%`,
      is_blocked: testResults.tests.some((test) => test.is_401 || test.is_403),
      is_rate_limited: testResults.tests.some((test) => test.is_429),
    };

    console.log(
      `📊 Instagram API Test Results: ${successfulTests}/${totalTests} successful`
    );

    res.json({
      success: true,
      data: testResults,
    });
  } catch (error) {
    console.error("Instagram API test error:", error.message);
    res.status(500).json({
      success: false,
      error: "Test failed",
      message: error.message,
    });
  }
});

// ===== BROWSER POOL MANAGEMENT ===== - COMMENTED OUT DUE TO PUPPETEER ISSUES
/*
const browserPool = {
  browsers: [],
  maxBrowsers: 2,
  inUse: new Set(),

  async getBrowser() {
    // Return an available browser or create a new one
    for (let browser of this.browsers) {
      if (!this.inUse.has(browser)) {
        this.inUse.add(browser);
        return browser;
      }
    }

    // Create new browser if under limit
    if (this.browsers.length < this.maxBrowsers) {
      const browser = await puppeteer.launch({
        headless: "new",
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-accelerated-2d-canvas",
          "--no-first-run",
          "--no-zygote",
          "--disable-gpu",
          "--disable-web-security",
          "--disable-features=VizDisplayCompositor",
          // "--single-process", // Removed - can cause issues with browser loading
          "--disable-extensions",
          "--disable-plugins",
          // "--disable-images", // REMOVED - FastDl needs images
          // "--disable-javascript", // REMOVED - FastDl requires JavaScript
          "--disable-background-timer-throttling",
          "--disable-backgrounding-occluded-windows",
          "--disable-renderer-backgrounding",
          "--disable-field-trial-config",
          "--disable-ipc-flooding-protection",
          "--disable-hang-monitor",
          "--disable-prompt-on-repost",
          "--disable-domain-reliability",
          "--disable-component-extensions-with-background-pages",
          "--disable-default-apps",
          "--disable-sync",
          "--disable-translate",
          "--hide-scrollbars",
          "--mute-audio",
          "--no-default-browser-check",
          "--no-pings",
          "--disable-background-networking",
          "--disable-client-side-phishing-detection",
          "--disable-component-update",
          "--disable-features=TranslateUI",
          "--force-color-profile=srgb",
          "--metrics-recording-only",
          "--password-store=basic",
          "--use-mock-keychain",
          "--disable-blink-features=AutomationControlled",
          "--memory-pressure-off",
          "--max_old_space_size=512",
        ],
        ignoreDefaultArgs: ["--disable-extensions"],
        timeout: 30000,
      });

      this.browsers.push(browser);
      this.inUse.add(browser);
      console.log(
        `🔄 Created browser instance (${this.browsers.length}/${this.maxBrowsers})`
      );
      return browser;
    }

    // Wait for a browser to become available
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        for (let browser of this.browsers) {
          if (!this.inUse.has(browser)) {
            this.inUse.add(browser);
            clearInterval(checkInterval);
            resolve(browser);
            return;
          }
        }
      }, 1000);
    });
  },

  releaseBrowser(browser) {
    this.inUse.delete(browser);
  },

  async cleanup() {
    console.log(`🧹 Cleaning up ${this.browsers.length} browser instances...`);
    for (let browser of this.browsers) {
      try {
        await browser.close();
      } catch (error) {
        console.error("Error closing browser:", error.message);
      }
    }
    this.browsers = [];
    this.inUse.clear();
  },

  getStats() {
    return {
      total: this.browsers.length,
      inUse: this.inUse.size,
      available: this.browsers.length - this.inUse.size,
      maxBrowsers: this.maxBrowsers,
    };
  },
};
*/

// ===== MEMORY MANAGEMENT =====

// ===== CIRCUIT BREAKER PATTERN =====
const circuitBreaker = {
  failures: 0,
  lastFailureTime: 0,
  state: "CLOSED", // CLOSED, OPEN, HALF_OPEN
  threshold: 5,
  timeout: 60000, // 1 minute

  async execute(operation) {
    if (this.state === "OPEN") {
      if (Date.now() - this.lastFailureTime > this.timeout) {
        this.state = "HALF_OPEN";
        console.log("🔄 Circuit breaker: Attempting to close...");
      } else {
        throw new Error("Circuit breaker is OPEN");
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  },

  onSuccess() {
    this.failures = 0;
    this.state = "CLOSED";
  },

  onFailure() {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.failures >= this.threshold) {
      this.state = "OPEN";
      console.log("🚨 Circuit breaker: OPEN - too many failures");
    }
  },

  getStatus() {
    return {
      state: this.state,
      failures: this.failures,
      threshold: this.threshold,
      lastFailure: this.lastFailureTime,
    };
  },
};

// ===== BROWSER POOL MANAGEMENT =====

// Add storage status endpoint for debugging persistent storage
app.get("/storage-status", (req, res) => {
  const fs = require("fs");
  const path = require("path");

  try {
    const dbStats = fs.statSync(dbPath);
    const downloadsExists = fs.existsSync(DOWNLOADS_DIR);
    const downloadsFiles = downloadsExists
      ? fs.readdirSync(DOWNLOADS_DIR).length
      : 0;

    // Check if we're in production and if persistent storage is working
    const isProduction = process.env.NODE_ENV === "production";
    const persistentStorageWorking = isProduction && dbStats.size > 0;

    res.json({
      environment: {
        node_env: process.env.NODE_ENV,
        is_production: isProduction,
      },
      database: {
        path: dbPath,
        size: dbStats.size,
        size_mb: (dbStats.size / (1024 * 1024)).toFixed(2),
        exists: true,
        last_modified: dbStats.mtime,
      },
      downloads: {
        path: DOWNLOADS_DIR,
        exists: downloadsExists,
        files: downloadsFiles,
      },
      persistent_storage: {
        configured: isProduction,
        working: persistentStorageWorking,
        mount_path: "/opt/render/project/src/data",
      },
      recommendations: {
        needs_persistent_disk: isProduction && !persistentStorageWorking,
        disk_mount_path: "/opt/render/project/src/data",
        disk_size: "10GB",
      },
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
      environment: process.env.NODE_ENV,
      database_path: dbPath,
      downloads_path: DOWNLOADS_DIR,
    });
  }
});

// Add cache status endpoint for debugging cache issues
app.get("/cache-status", (req, res) => {
  try {
    const memoryCacheUsers = global.postCache
      ? Object.keys(global.postCache)
      : [];
    const memoryCachePosts = global.postCache
      ? Object.values(global.postCache).reduce(
          (total, posts) => total + posts.length,
          0
        )
      : 0;

    res.json({
      memory_cache: {
        users: memoryCacheUsers,
        total_posts: memoryCachePosts,
        exists: !!global.postCache,
      },
      database: {
        path: dbPath,
        exists: require("fs").existsSync(dbPath),
      },
      recommendations: {
        check_persistent_disk: process.env.NODE_ENV === "production",
        persistent_disk_url: "https://render.com/docs/persistent-disk-storage",
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
