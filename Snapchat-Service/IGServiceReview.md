# Instagram Service Polling System Review

## Overview
The Instagram service implements a sophisticated polling system that automatically monitors Instagram accounts for new posts and stories, processes them through multiple download methods, and sends content to Telegram. This document provides a detailed analysis of the system architecture for implementing a similar system for Snapchat.

## Core Architecture Components

### 1. Polling State Management
```javascript
// Global state variables
let TARGET_USERNAME = null;           // Current target account
const POLLING_ENABLED = true;        // Master switch for polling
let currentPollingTimeout = null;    // Current polling timeout reference
let pollingStarted = false;          // Polling status flag
```

### 2. Smart Polling Algorithm
The system uses an activity-based polling interval that adapts based on user activity:

```javascript
// Activity tracker with smart intervals
let activityTracker = {
  recentPosts: 0,
  lastActivity: null,
  lastReset: new Date(),
  isFirstRun: true,
  
  updateActivity(newPostsCount) {
    // Skip first run to avoid counting old posts
    if (this.isFirstRun) {
      this.isFirstRun = false;
      return;
    }
    this.recentPosts += newPostsCount;
    this.lastActivity = new Date();
  },
  
  getActivityLevel() {
    // Reset daily counter
    const now = new Date();
    const hoursSinceReset = (now - this.lastReset) / (1000 * 60 * 60);
    if (hoursSinceReset >= 24) {
      this.recentPosts = 0;
      this.lastReset = now;
    }
    
    // Activity levels
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
    return interval;
  }
};
```

### 3. Polling Scheduling System
```javascript
function scheduleNextPoll() {
  // Get smart polling interval based on activity
  const baseMinutes = activityTracker.getPollingInterval();
  const variationMinutes = 2; // ±2 minutes for randomization
  
  // Add/subtract variation (±2 minutes)
  const variation = Math.floor(Math.random() * (variationMinutes * 2 + 1)) - variationMinutes;
  const finalMinutes = Math.max(1, baseMinutes + variation); // Ensure minimum 1 minute
  
  const nextPollMs = finalMinutes * 60 * 1000;
  
  currentPollingTimeout = setTimeout(async () => {
    if (POLLING_ENABLED) {
      try {
        // Check for new stories first, then posts
        await checkForNewStories();
        await checkForNewPosts();
        scheduleNextPoll(); // Schedule the next poll
      } catch (error) {
        console.error('❌ Polling cycle failed:', error);
        // Retry after 5 minutes instead of the full interval
        setTimeout(async () => {
          if (POLLING_ENABLED) {
            try {
              await checkForNewStories();
              await checkForNewPosts();
              scheduleNextPoll();
            } catch (retryError) {
              console.error('❌ Polling retry failed:', retryError);
              scheduleNextPoll();
            }
          }
        }, 5 * 60 * 1000);
      }
    }
  }, nextPollMs);
}
```

### 4. Content Processing Pipeline

#### Post Processing
```javascript
async function checkForNewPosts(force = false) {
  try {
    // Select random user agent for this poll cycle
    const pollUserAgent = getRandomUserAgent();
    
    // Fetch posts using Instagram Web API
    const posts = await scrapeInstagramPosts(TARGET_USERNAME, pollUserAgent);
    
    // Use cache to find only new posts
    const newPosts = await findNewPosts(TARGET_USERNAME, posts);
    
    // Update cache with current posts
    await updateRecentPostsCache(TARGET_USERNAME, posts);
    
    // Process new posts with batch processing
    const batchResults = await batchGraphQLCall(newPosts, pollUserAgent);
    
    // Process each result and send to Telegram
    for (const result of batchResults) {
      // Process carousel items
      for (const item of result.data) {
        // Send to Telegram automatically
        if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHANNEL_ID) {
          const caption = `✨ New ${item.isVideo ? 'video' : 'photo'} from @${TARGET_USERNAME}! 📱 <a href="${result.url}">View Original Post</a>`;
          
          if (item.isVideo) {
            await sendVideoToTelegram(item.url, caption);
          } else {
            await sendPhotoToTelegram(item.url, caption);
          }
          
          // Add delay between sends
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      // Mark as processed
      await markPostAsProcessed(result.shortcode, TARGET_USERNAME, result.url, postType, isPinned);
    }
    
    // Update activity tracker
    if (newPosts.length > 0) {
      activityTracker.updateActivity(newPosts.length);
    }
    
  } catch (error) {
    console.error('Polling error:', error.message);
  }
}
```

#### Story Processing
```javascript
async function checkForNewStories() {
  try {
    const userAgent = getRandomUserAgent();
    
    // Process stories using multi-layered approach
    const stories = await processInstagramStories(TARGET_USERNAME, userAgent);
    
    // Process each story
    for (const story of stories.data) {
      // Check if already processed
      const isProcessed = await checkStoryProcessed(TARGET_USERNAME, story.storyId);
      
      if (!isProcessed) {
        // Send to Telegram
        if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHANNEL_ID) {
          const storyCaption = `✨New stories from @${TARGET_USERNAME}`;
          
          if (story.isVideo) {
            await sendVideoToTelegram(story.url, storyCaption);
          } else {
            await sendPhotoToTelegram(story.url, storyCaption);
          }
        }
        
        // Mark as processed
        await markStoryProcessed(TARGET_USERNAME, story.url, story.storyType, story.storyId);
      }
    }
    
  } catch (error) {
    console.error('Story polling error:', error.message);
  }
}
```

### 5. Database Schema

#### Posts Tracking
```sql
-- Processed posts tracking
CREATE TABLE processed_posts (
  id TEXT PRIMARY KEY,           -- Post shortcode
  username TEXT NOT NULL,        -- Target username
  post_url TEXT NOT NULL,        -- Original post URL
  post_type TEXT NOT NULL,       -- 'photo', 'video', 'carousel'
  is_pinned BOOLEAN DEFAULT FALSE, -- Pinned post flag
  pinned_at DATETIME,            -- When post was pinned
  processed_at DATETIME DEFAULT CURRENT_TIMESTAMP -- Processing timestamp
);

-- Recent posts cache
CREATE TABLE recent_posts_cache (
  username TEXT,
  post_url TEXT,
  shortcode TEXT,
  is_pinned BOOLEAN DEFAULT FALSE,
  post_order INTEGER,
  cached_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (username, shortcode)
);
```

#### Stories Tracking
```sql
-- Processed stories tracking
CREATE TABLE processed_stories (
  id TEXT PRIMARY KEY,           -- Story ID
  username TEXT NOT NULL,        -- Target username
  story_url TEXT NOT NULL,       -- Original story URL
  story_type TEXT NOT NULL,      -- 'photo', 'video'
  story_id TEXT,                 -- Unique story identifier
  processed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Recent stories cache
CREATE TABLE recent_stories_cache (
  username TEXT,
  story_url TEXT,
  story_id TEXT,
  story_type TEXT,
  cached_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (username, story_id)
);
```

### 6. Error Handling & Recovery

#### Health Check System
```javascript
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
      
    } catch (error) {
      console.error('❌ Health check failed:', error.message);
      this.consecutiveFailures++;
      
      if (this.consecutiveFailures >= this.maxFailures) {
        console.error('🚨 Too many consecutive health check failures, restarting service...');
        await this.restartService();
      }
    }
  },
  
  start() {
    setInterval(() => {
      this.performCheck();
    }, this.checkInterval);
  }
};
```

#### Memory Management
```javascript
const memoryManager = {
  lastCleanup: Date.now(),
  cleanupInterval: 30 * 60 * 1000, // 30 minutes
  
  performCleanup() {
    try {
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
      
      // Clear any accumulated caches
      if (global.postCache) {
        const cacheSize = Object.keys(global.postCache).length;
        if (cacheSize > 1000) {
          global.postCache = {};
        }
      }
      
      this.lastCleanup = Date.now();
    } catch (error) {
      console.error('❌ Memory cleanup failed:', error);
    }
  },
  
  start() {
    setInterval(() => {
      this.performCleanup();
    }, this.cleanupInterval);
  }
};
```

### 7. Request Tracking & Statistics
```javascript
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
  },
  
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
  }
};
```

### 8. API Endpoints

#### Polling Control
```javascript
// Start polling
app.post("/start-polling", async (req, res) => {
  if (!TARGET_USERNAME) {
    return res.status(400).json({ error: "No target set. Please set a target first." });
  }
  
  if (pollingStarted) {
    return res.json({ 
      success: true, 
      message: "Polling already started",
      polling_active: true 
    });
  }
  
  startPolling(TARGET_USERNAME);
  
  res.json({ 
    success: true, 
    message: `Polling started for @${TARGET_USERNAME}`,
    polling_active: true
  });
});

// Stop polling
app.post("/stop-polling", async (req, res) => {
  if (!pollingStarted) {
    return res.json({ 
      success: true, 
      message: "Polling not active",
      polling_active: false 
    });
  }
  
  stopPolling();
  
  res.json({ 
    success: true, 
    message: "Polling stopped",
    polling_active: false
  });
});

// Manual polling
app.get("/poll-now", async (req, res) => {
  const force = String(req.query.force || 'false').toLowerCase() === 'true';
  await checkForNewPosts(force);
  res.json({ success: true, message: "Polling completed", force });
});
```

### 9. Key Features for Snapchat Implementation

1. **Multi-layered Download Methods**: Primary method (GraphQL/Web API) with fallback (Snapsave)
2. **Smart Polling Intervals**: Activity-based timing with randomization
3. **Comprehensive Error Handling**: Health checks, memory management, retry logic
4. **Database Caching**: Prevents duplicate processing
5. **Telegram Integration**: Automatic sending with rate limiting
6. **Request Tracking**: Detailed statistics and monitoring
7. **User Agent Rotation**: Bot evasion techniques
8. **Graceful Shutdown**: Proper cleanup on service termination

### 10. Implementation Considerations for Snapchat

1. **Snapchat API Limitations**: May need different approaches for content access
2. **Story vs Post Differences**: Snapchat primarily uses stories, not posts
3. **Content Expiration**: Snapchat stories expire, requiring faster polling
4. **Authentication**: May require different authentication methods
5. **Rate Limiting**: Different rate limiting strategies for Snapchat
6. **Content Types**: Different media types and formats to handle

This architecture provides a robust foundation for implementing a similar polling system for Snapchat, with adaptations for Snapchat's specific requirements and limitations.
