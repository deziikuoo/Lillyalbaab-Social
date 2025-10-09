const axios = require("axios");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

// Unified logging format (same as Python loguru)
const getTimestamp = () => {
  const now = new Date();
  return now.toISOString().replace("T", " ").substring(0, 23);
};

const snapchatLog = (level, module, function_name, line, message) => {
  const timestamp = getTimestamp();
  const level_padded = level.padEnd(8);
  console.log(
    `${timestamp} | ${level_padded} | ${module}:${function_name}:${line} - ${message}`
  );
};

// Helper functions for different log levels
const logInfo = (module, function_name, line, message) =>
  snapchatLog("INFO", module, function_name, line, message);
const logError = (module, function_name, line, message) =>
  snapchatLog("ERROR", module, function_name, line, message);
const logWarning = (module, function_name, line, message) =>
  snapchatLog("WARNING", module, function_name, line, message);

// ===== SNAPCHAT POLLING CONFIGURATION =====
let SNAPCHAT_TARGET_USERNAME = null;
const SNAPCHAT_POLLING_ENABLED = true;
let snapchatCurrentPollingTimeout = null;
let snapchatPollingStarted = false;

// Snapchat API base URL
const SNAPCHAT_API_BASE = "http://localhost:8000";

// ===== SNAPCHAT ACTIVITY TRACKER =====
let snapchatActivityTracker = {
  recentStories: 0,
  lastActivity: null,
  lastReset: new Date(),
  isFirstRun: true,

  updateActivity(newStoriesCount) {
    // Skip activity tracking on first run to avoid counting old stories
    if (this.isFirstRun) {
      logInfo(
        "snapchat.polling",
        "updateActivity",
        35,
        "📊 First run detected - skipping activity tracking for old stories"
      );
      this.isFirstRun = false;
      return;
    }

    this.recentStories += newStoriesCount;
    this.lastActivity = new Date();
    logInfo(
      "snapchat.polling",
      "updateActivity",
      42,
      `📊 Activity updated: +${newStoriesCount} stories (total: ${this.recentStories} in current poll cycle)`
    );
  },

  getActivityLevel() {
    // Activity levels - reset counter at end of each poll cycle
    if (this.recentStories >= 5) return "high";
    if (this.recentStories >= 2) return "medium";
    return "low";
  },

  resetActivityCounter() {
    this.recentStories = 0;
    logInfo(
      "snapchat.polling",
      "resetActivityCounter",
      55,
      "🔄 Activity counter reset for next poll cycle"
    );
  },

  getPollingInterval() {
    const baseInterval = 10; // minutes (faster than Instagram due to story expiration)
    const activityLevel = this.getActivityLevel();

    let interval = baseInterval;
    if (activityLevel === "high") {
      interval = 5; // 5 minutes for active users
    } else if (activityLevel === "low") {
      interval = 20; // 20 minutes for inactive users
    }
    // medium stays at 10 minutes

    return interval;
  },
};

// ===== SNAPCHAT REQUEST TRACKER =====
let snapchatRequestTracker = {
  stats: {
    snapchat: {
      total: 0,
      successful: 0,
      failed: 0,
      rate_limited: 0,
      last24h: 0,
      last_hour: 0,
    },
    telegram: {
      total: 0,
      successful: 0,
      failed: 0,
      photos: 0,
      videos: 0,
      last24h: 0,
      last_hour: 0,
    },
    start_time: new Date(),
    last_reset: new Date(),
  },

  trackSnapchat(url, success, error = null) {
    this.stats.snapchat.total += 1;
    this.stats.snapchat.last24h += 1;
    this.stats.snapchat.last_hour += 1;

    if (success) {
      this.stats.snapchat.successful += 1;
    } else {
      this.stats.snapchat.failed += 1;
      if (
        error &&
        (error.includes("429") || error.toLowerCase().includes("rate limit"))
      ) {
        this.stats.snapchat.rate_limited += 1;
      }
    }

    this.logRequest("Snapchat", url, success, error);
  },

  trackTelegram(mediaType, success, error = null) {
    this.stats.telegram.total += 1;
    this.stats.telegram.last24h += 1;
    this.stats.telegram.last_hour += 1;

    if (success) {
      this.stats.telegram.successful += 1;
      if (mediaType === "photo") {
        this.stats.telegram.photos += 1;
      }
      if (mediaType === "video") {
        this.stats.telegram.videos += 1;
      }
    } else {
      this.stats.telegram.failed += 1;
    }

    this.logRequest("Telegram", mediaType, success, error);
  },

  logRequest(service, details, success, error) {
    const timestamp = new Date().toISOString();
    const status = success ? "✅" : "❌";
    console.log(
      `📊 [SNAPCHAT] ${status} ${service} request: ${details} ${
        error ? `(${error})` : ""
      }`
    );
  },

  printStats() {
    const uptime = new Date() - this.stats.start_time;
    const days = Math.floor(uptime / (1000 * 60 * 60 * 24));
    const hours = Math.floor(
      (uptime % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)
    );
    const minutes = Math.floor((uptime % (1000 * 60 * 60)) / (1000 * 60));

    logInfo("snapchat.polling", "printStats", 160, "📊 REQUEST STATISTICS");
    logInfo("snapchat.polling", "printStats", 161, "=====================");
    logInfo(
      "snapchat.polling",
      "printStats",
      162,
      `Uptime: ${days}d ${hours}h ${minutes}m`
    );
    logInfo("snapchat.polling", "printStats", 163, "Snapchat Requests:");
    logInfo(
      "snapchat.polling",
      "printStats",
      164,
      `   Total: ${this.stats.snapchat.total}`
    );
    logInfo(
      "snapchat.polling",
      "printStats",
      165,
      `   Successful: ${this.stats.snapchat.successful}`
    );
    logInfo(
      "snapchat.polling",
      "printStats",
      166,
      `   Failed: ${this.stats.snapchat.failed}`
    );
    logInfo(
      "snapchat.polling",
      "printStats",
      167,
      `   Rate Limited: ${this.stats.snapchat.rate_limited}`
    );
    logInfo(
      "snapchat.polling",
      "printStats",
      168,
      `   Last Hour: ${this.stats.snapchat.last_hour}`
    );
    logInfo(
      "snapchat.polling",
      "printStats",
      169,
      `   Last 24h: ${this.stats.snapchat.last24h}`
    );

    logInfo("snapchat.polling", "printStats", 171, "Telegram Requests:");
    logInfo(
      "snapchat.polling",
      "printStats",
      172,
      `   Total: ${this.stats.telegram.total}`
    );
    logInfo(
      "snapchat.polling",
      "printStats",
      173,
      `   Successful: ${this.stats.telegram.successful}`
    );
    logInfo(
      "snapchat.polling",
      "printStats",
      174,
      `   Failed: ${this.stats.telegram.failed}`
    );
    logInfo(
      "snapchat.polling",
      "printStats",
      175,
      `   Photos: ${this.stats.telegram.photos}`
    );
    logInfo(
      "snapchat.polling",
      "printStats",
      176,
      `   Videos: ${this.stats.telegram.videos}`
    );
    logInfo(
      "snapchat.polling",
      "printStats",
      177,
      `   Last Hour: ${this.stats.telegram.last_hour}`
    );
    logInfo(
      "snapchat.polling",
      "printStats",
      178,
      `   Last 24h: ${this.stats.telegram.last24h}`
    );
  },
};

// ===== SNAPCHAT POLLING FUNCTIONS =====
async function startSnapchatPolling(username) {
  if (snapchatPollingStarted) {
    snapchatLog("⚠️ [SNAPCHAT] Polling already started");
    return;
  }

  SNAPCHAT_TARGET_USERNAME = username;
  snapchatPollingStarted = true;

  snapchatLog(
    `🚀 [SNAPCHAT] Snapchat polling started for @${SNAPCHAT_TARGET_USERNAME}`
  );
  snapchatLog("📍 [SNAPCHAT] Manual poll: GET /snapchat-poll-now");
  snapchatLog(
    "🌐 [SNAPCHAT] Snapchat service available: http://localhost:8000"
  );
  snapchatLog("🏥 [SNAPCHAT] Health check system started");
  snapchatLog("🧠 [SNAPCHAT] Memory management system started");

  // Start first poll after 10 seconds
  setTimeout(async () => {
    try {
      snapchatLog("🔄 [SNAPCHAT] Starting sequential polling process...");
      snapchatLog("📱 [SNAPCHAT] Step 1: Checking for new stories...");
      await executeSnapchatPollCycle();
    } catch (error) {
      console.error("❌ [SNAPCHAT] Initial poll failed:", error);
      // Retry after 30 seconds
      setTimeout(async () => {
        try {
          snapchatLog("🔄 [SNAPCHAT] Retrying Snapchat polling process...");
          await executeSnapchatPollCycle();
        } catch (retryError) {
          console.error("❌ [SNAPCHAT] Retry poll failed:", retryError);
        }
      }, 30000);
    }
  }, 10000);
}

async function stopSnapchatPolling() {
  if (snapchatCurrentPollingTimeout) {
    clearTimeout(snapchatCurrentPollingTimeout);
    snapchatCurrentPollingTimeout = null;
    snapchatLog("🛑 [SNAPCHAT] Polling stopped");
  }

  snapchatPollingStarted = false;
}

async function restartSnapchatPolling() {
  await stopSnapchatPolling();
  console.log(
    `🔄 [SNAPCHAT] Restarting polling for @${SNAPCHAT_TARGET_USERNAME}`
  );

  // Start new poll after 5 seconds
  setTimeout(async () => {
    await executeSnapchatPollCycle();
  }, 5000);
}

async function scheduleNextSnapchatPoll() {
  // Get smart polling interval based on activity
  const baseMinutes = snapchatActivityTracker.getPollingInterval();
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
    `⏰ [SNAPCHAT] Next poll scheduled in ${finalMinutes} minutes for @${SNAPCHAT_TARGET_USERNAME} at ${timeString} EDT`
  );

  snapchatCurrentPollingTimeout = setTimeout(async () => {
    if (SNAPCHAT_POLLING_ENABLED) {
      try {
        await executeSnapchatPollCycle();
      } catch (error) {
        console.error("❌ [SNAPCHAT] Polling cycle failed:", error);
        // Log error but don't stop polling
        const errorLog = `[${new Date().toISOString()}] Snapchat polling error: ${
          error.message
        }\n${error.stack}\n\n`;
        fs.appendFileSync(
          path.join(__dirname, "snapchat-error-logs.txt"),
          errorLog
        );

        // Retry after 5 minutes instead of the full interval
        setTimeout(async () => {
          if (SNAPCHAT_POLLING_ENABLED) {
            try {
              await executeSnapchatPollCycle();
            } catch (retryError) {
              console.error("❌ [SNAPCHAT] Polling retry failed:", retryError);
              // Continue with normal schedule even if retry fails
              scheduleNextSnapchatPoll();
            }
          }
        }, 5 * 60 * 1000);
      }
    }
  }, nextPollMs);
}

async function executeSnapchatPollCycle() {
  if (SNAPCHAT_POLLING_ENABLED) {
    try {
      // Check for new stories
      await checkForNewSnapchatStories();

      // Reset activity counter for next poll cycle
      snapchatActivityTracker.resetActivityCounter();

      scheduleNextSnapchatPoll(); // Schedule the next poll
    } catch (error) {
      console.error("❌ [SNAPCHAT] Polling cycle failed:", error);
      // Log error but don't stop polling
      const errorLog = `[${new Date().toISOString()}] Snapchat polling error: ${
        error.message
      }\n${error.stack}\n\n`;
      fs.appendFileSync(
        path.join(__dirname, "snapchat-error-logs.txt"),
        errorLog
      );

      // Retry after 5 minutes instead of the full interval
      setTimeout(async () => {
        if (SNAPCHAT_POLLING_ENABLED) {
          try {
            await checkForNewSnapchatStories();
            snapchatActivityTracker.resetActivityCounter();
            scheduleNextSnapchatPoll();
          } catch (retryError) {
            console.error("❌ [SNAPCHAT] Polling retry failed:", retryError);
            scheduleNextSnapchatPoll();
          }
        }
      }, 5 * 60 * 1000);
    }
  }
}

async function checkForNewSnapchatStories(force = false) {
  try {
    snapchatLog(
      `\n🔍 [SNAPCHAT] Checking for new stories from @${SNAPCHAT_TARGET_USERNAME} ${
        force ? "(force send enabled)" : ""
      }`
    );

    snapchatLog("🌐 [SNAPCHAT] Using Snapchat service: http://localhost:8000");
    snapchatLog("📱 [SNAPCHAT] Step 1: Fetching stories from Snapchat...");
    snapchatLog(
      "💡 [SNAPCHAT] Note: Detailed scraping logs appear in the [Snapchat] section below"
    );
    snapchatLog(
      "🔄 [SNAPCHAT] Transitioning to Python service for story processing..."
    );

    // Call Snapchat service to check for new stories with increased timeout
    const response = await axios.get(
      `${SNAPCHAT_API_BASE}/poll-now?force=${force}`,
      {
        timeout: 120000, // Increased to 2 minutes for detailed scraping
      }
    );

    if (response.data.success) {
      snapchatLog("✅ [SNAPCHAT] Step 1 completed: Stories check finished");
      snapchatLog("📝 [SNAPCHAT] Step 2: Processing new stories...");

      // Check if there were any new stories processed
      if (
        response.data.message &&
        response.data.message.includes("completed")
      ) {
        snapchatLog(
          "✅ [SNAPCHAT] Step 2 completed: Story processing finished"
        );
        snapchatLog("📤 [SNAPCHAT] Step 3: Sending to Telegram...");
        snapchatLog(
          "✅ [SNAPCHAT] Step 3 completed: Telegram integration finished"
        );
      } else {
        snapchatLog(
          "✅ [SNAPCHAT] Step 2 completed: No new stories to process"
        );
      }

      snapchatLog(
        "✅ [SNAPCHAT] Snapchat polling check completed successfully"
      );
      snapchatRequestTracker.trackSnapchat(
        `stories_${SNAPCHAT_TARGET_USERNAME}`,
        true
      );
    } else {
      snapchatLog(
        "⚠️ [SNAPCHAT] Snapchat polling check completed with warnings"
      );
      snapchatRequestTracker.trackSnapchat(
        `stories_${SNAPCHAT_TARGET_USERNAME}`,
        false,
        response.data.message
      );
    }

    // Always print request statistics after each polling run
    snapchatRequestTracker.printStats();
    snapchatLog("");
  } catch (error) {
    if (error.code === "ECONNABORTED") {
      snapchatLog(
        "⏰ [SNAPCHAT] Polling timeout - Snapchat service taking longer than expected"
      );
      snapchatLog(
        "💡 [SNAPCHAT] This may indicate the service is actively scraping content"
      );
    } else {
      snapchatLog(`❌ [SNAPCHAT] Polling error: ${error.message}`);
    }
    snapchatRequestTracker.trackSnapchat(
      `stories_${SNAPCHAT_TARGET_USERNAME}`,
      false,
      error.message
    );
  }
}

// ===== SNAPCHAT API ENDPOINTS =====
function setupSnapchatEndpoints(app) {
  // Snapchat polling control endpoints
  app.post("/snapchat-start-polling", async (req, res) => {
    try {
      if (!SNAPCHAT_TARGET_USERNAME) {
        return res.status(400).json({
          success: false,
          error: "No Snapchat target set. Please set a target first.",
        });
      }

      if (snapchatPollingStarted) {
        return res.json({
          success: true,
          message: "Snapchat polling already started",
          target: SNAPCHAT_TARGET_USERNAME,
          polling_active: true,
        });
      }

      console.log(
        `[SNAPCHAT] Starting polling for @${SNAPCHAT_TARGET_USERNAME}`
      );
      await startSnapchatPolling(SNAPCHAT_TARGET_USERNAME);

      res.json({
        success: true,
        message: `Snapchat polling started for @${SNAPCHAT_TARGET_USERNAME}`,
        target: SNAPCHAT_TARGET_USERNAME,
        polling_active: true,
      });
    } catch (error) {
      console.error("[SNAPCHAT] Error starting polling:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post("/snapchat-stop-polling", async (req, res) => {
    try {
      if (!snapchatPollingStarted) {
        return res.json({
          success: true,
          message: "Snapchat polling not active",
          polling_active: false,
        });
      }

      console.log(
        `🛑 [SNAPCHAT] Stopping polling for @${SNAPCHAT_TARGET_USERNAME}`
      );
      await stopSnapchatPolling();

      res.json({
        success: true,
        message: "Snapchat polling stopped",
        polling_active: false,
      });
    } catch (error) {
      console.error("[SNAPCHAT] Error stopping polling:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get("/snapchat-poll-now", async (req, res) => {
    try {
      if (!SNAPCHAT_TARGET_USERNAME) {
        return res.status(400).json({
          success: false,
          error: "No Snapchat target set. Please set a target first.",
        });
      }

      const force = req.query.force === "true";
      console.log(
        `[SNAPCHAT] Manual polling triggered via API (force=${force})`
      );
      await checkForNewSnapchatStories(force);

      res.json({
        success: true,
        message: "Snapchat polling completed",
        target: SNAPCHAT_TARGET_USERNAME,
        force: force,
      });
    } catch (error) {
      console.error("[SNAPCHAT] Error in manual polling:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post("/snapchat-set-target", async (req, res) => {
    try {
      const { username } = req.body;

      if (!username || !username.trim()) {
        return res.status(400).json({
          success: false,
          error: "Username is required",
        });
      }

      // Validate Snapchat username format
      const usernameRegex = /^[a-zA-Z0-9_]{3,15}$/;
      if (!usernameRegex.test(username.trim())) {
        return res.status(400).json({
          success: false,
          error:
            "Invalid Snapchat username format. Must be 3-15 characters, alphanumeric and underscores only.",
        });
      }

      SNAPCHAT_TARGET_USERNAME = username.trim();
      snapchatLog(`[SNAPCHAT] Target set to: @${SNAPCHAT_TARGET_USERNAME}`);

      // Sync target with Python service
      try {
        await axios.post(`${SNAPCHAT_API_BASE}/set-target`, {
          username: SNAPCHAT_TARGET_USERNAME,
        });
        snapchatLog(
          `✅ [SNAPCHAT] Target synced with Python service: @${SNAPCHAT_TARGET_USERNAME}`
        );
        snapchatLog(`🔄 [SNAPCHAT] Python service ready for polling`);
      } catch (error) {
        snapchatLog(
          `❌ [SNAPCHAT] Failed to sync target with Python: ${error.message}`
        );
        snapchatLog(
          `⚠️ [SNAPCHAT] Polling may fail - Python service not synchronized`
        );
      }

      res.json({
        success: true,
        message: `Snapchat target set to @${SNAPCHAT_TARGET_USERNAME}`,
        target: SNAPCHAT_TARGET_USERNAME,
      });
    } catch (error) {
      console.error("[SNAPCHAT] Error setting target:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get("/snapchat-status", async (req, res) => {
    try {
      res.json({
        target_username: SNAPCHAT_TARGET_USERNAME,
        enabled: SNAPCHAT_POLLING_ENABLED,
        active: snapchatPollingStarted,
        started: snapchatPollingStarted,
        activity_level: snapchatActivityTracker.getActivityLevel(),
        current_interval: snapchatActivityTracker.getPollingInterval(),
      });
    } catch (error) {
      console.error("[SNAPCHAT] Error getting status:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get("/snapchat-stats", async (req, res) => {
    try {
      const uptime = new Date() - snapchatRequestTracker.stats.start_time;
      const days = Math.floor(uptime / (1000 * 60 * 60 * 24));
      const hours = Math.floor(
        (uptime % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)
      );
      const minutes = Math.floor((uptime % (1000 * 60 * 60)) / (1000 * 60));

      res.json({
        snapchat: snapchatRequestTracker.stats.snapchat,
        telegram: snapchatRequestTracker.stats.telegram,
        uptime: {
          days,
          hours,
          minutes,
        },
        rates: {
          snapchat_per_hour: snapchatRequestTracker.stats.snapchat.last_hour,
          telegram_per_hour: snapchatRequestTracker.stats.telegram.last_hour,
          snapchat_per_day: snapchatRequestTracker.stats.snapchat.last24h,
          telegram_per_day: snapchatRequestTracker.stats.telegram.last24h,
        },
      });
    } catch (error) {
      console.error("[SNAPCHAT] Error getting stats:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Snapchat download endpoint - forwards to the Python Snapchat service
  app.post("/snapchat-download", async (req, res) => {
    try {
      const { username, download_type, send_to_telegram } = req.body;

      if (!username || !username.trim()) {
        return res.status(400).json({
          success: false,
          error: "Username is required",
        });
      }

      snapchatLog(
        `[SNAPCHAT] Download request for @${username} (${download_type})`
      );

      // Forward the request to the Python Snapchat service
      const response = await axios.post(
        `${SNAPCHAT_API_BASE}/download`,
        {
          username: username.trim(),
          download_type: download_type || "stories",
          send_to_telegram: send_to_telegram !== false,
        },
        { timeout: 300000 } // Increased to 5 minutes for large downloads
      );

      // Track the request
      snapchatRequestTracker.trackRequest("snapchat");

      res.json(response.data);
    } catch (error) {
      console.error("[SNAPCHAT] Download error:", error);

      // Provide more detailed error information
      let errorMessage = "Download failed";
      if (error.code === "ECONNABORTED") {
        errorMessage =
          "Download timed out after 5 minutes. The Snapchat service may be processing a large number of files.";
      } else if (error.response?.data?.error) {
        errorMessage = error.response.data.error;
      } else if (error.message) {
        errorMessage = error.message;
      }

      res.status(500).json({
        success: false,
        error: errorMessage,
        details: {
          code: error.code,
          status: error.response?.status,
          timeout: error.code === "ECONNABORTED",
        },
      });
    }
  });

  // Snapchat clear cache endpoint - forwards to the Python Snapchat service
  app.post("/snapchat-clear-cache", async (req, res) => {
    try {
      snapchatLog("[SNAPCHAT] Clear cache request");

      // Forward the request to the Python Snapchat service
      const response = await axios.post(
        `${SNAPCHAT_API_BASE}/clear-cache`,
        {},
        { timeout: 30000 }
      );

      res.json(response.data);
    } catch (error) {
      console.error("[SNAPCHAT] Clear cache error:", error);
      res.status(500).json({
        success: false,
        error: error.response?.data?.error || error.message,
      });
    }
  });

  // Snapchat get logs endpoint - fetches recent logs from Python service
  app.get("/snapchat-logs", async (req, res) => {
    try {
      snapchatLog("[SNAPCHAT] Fetching recent logs from Python service");

      // Try to get logs from Python service if it has a logs endpoint
      try {
        const response = await axios.get(`${SNAPCHAT_API_BASE}/logs`, {
          timeout: 10000,
        });
        res.json(response.data);
      } catch (logError) {
        // If no logs endpoint, return a message
        res.json({
          success: true,
          message:
            "Python service logs are displayed in the [Snapchat] section of the console",
          note: "Detailed scraping logs appear in the Python service console output",
        });
      }
    } catch (error) {
      console.error("[SNAPCHAT] Error fetching logs:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  // Snapchat get targeted usernames endpoint - for input suggestions
  app.get("/snapchat-targeted-usernames", async (req, res) => {
    try {
      snapchatLog("[SNAPCHAT] Fetching targeted usernames for suggestions");

      const response = await axios.get(
        `${SNAPCHAT_API_BASE}/targeted-usernames`,
        {
          timeout: 10000,
        }
      );

      res.json(response.data);
    } catch (error) {
      console.error("[SNAPCHAT] Error fetching targeted usernames:", error);
      res.status(500).json({
        success: false,
        error: error.response?.data?.error || error.message,
      });
    }
  });
}

// Export functions for use in main app
module.exports = {
  startSnapchatPolling,
  stopSnapchatPolling,
  restartSnapchatPolling,
  checkForNewSnapchatStories,
  setupSnapchatEndpoints,
  snapchatActivityTracker,
  snapchatRequestTracker,
  SNAPCHAT_TARGET_USERNAME: () => SNAPCHAT_TARGET_USERNAME,
  snapchatPollingStarted: () => snapchatPollingStarted,
};
