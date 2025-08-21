# System Logic Documentation

## Instagram Video Downloader API - Complete System Analysis

---

## 📋 Table of Contents

1. [System Overview](#system-overview)
2. [Frontend Architecture](#frontend-architecture)
3. [Backend Architecture](#backend-architecture)
4. [Data Flow & Processing](#data-flow--processing)
5. [Polling Systems](#polling-systems)
6. [Telegram Integration](#telegram-integration)
7. [Storage & Caching](#storage--caching)
8. [Error Handling & Monitoring](#error-handling--monitoring)
9. [API Endpoints](#api-endpoints)
10. [Security & Configuration](#security--configuration)

---

## 🏗️ System Overview

### **Architecture Type**: Client-Server (React Frontend + Node.js Backend)

### **Primary Purpose**: Instagram content downloading with automated polling and Telegram integration

### **Technology Stack**:

- **Frontend**: React 18 + TypeScript + Vite
- **Backend**: Node.js + Express.js + SQLite
- **External APIs**: Instagram GraphQL API, Snapsave API, Telegram Bot API
- **Database**: SQLite (file-based)
- **Real-time Updates**: Polling-based (3-second intervals)

---

## 🎨 Frontend Architecture

### **Core Components**

#### **1. Main Application Component (`App.tsx`)**

**Purpose**: Central orchestrator for all user interactions and state management

**State Management**:

```typescript
// Core download state
const [url, setUrl] = useState("");
const [loading, setLoading] = useState(false);
const [error, setError] = useState<string | null>(null);
const [items, setItems] = useState<DownloadItem[]>([]);

// Telegram functionality
const [autoSendToTelegram, setAutoSendToTelegram] = useState(true);
const [sendingStatus, setSendingStatus] = useState<{
  [key: number]: "idle" | "sending" | "success" | "error";
}>({});
const [telegramErrors, setTelegramErrors] = useState<{ [key: number]: string }>(
  {}
);

// Target management
const [currentTarget, setCurrentTarget] = useState<string>("");
const [newTarget, setNewTarget] = useState<string>("");
const [targetLoading, setTargetLoading] = useState(false);
const [targetError, setTargetError] = useState<string | null>(null);

// Polling management
const [pollingStatus, setPollingStatus] = useState<{
  enabled: boolean;
  active: boolean;
  started: boolean;
}>({ enabled: false, active: false, started: false });
```

#### **2. URL Processing & Validation**

**Function**: `cleanInstagramUrl(inputUrl: string)`

- **Purpose**: Removes `img_index` parameters from Instagram URLs
- **Logic**: Uses URL constructor to parse and clean parameters
- **Fallback**: Returns original input if URL parsing fails

**Function**: `isValidIgUrl` (useMemo)

- **Purpose**: Real-time URL validation
- **Regex Pattern**: `/(https?:\/\/)?(www\.)?instagram\.com\/(p|reel|tv|stories)\//i`
- **Triggers**: Re-evaluates when URL state changes

#### **3. Target Management System**

**Function**: `fetchCurrentTarget()`

- **Endpoint**: `GET /target`
- **Purpose**: Retrieves current tracking target and polling status
- **Real-time Updates**: Called every 3 seconds via `useEffect`
- **Response Mapping**:
  ```typescript
  setCurrentTarget(data.current_target || "");
  setPollingStatus({
    enabled: data.polling_enabled || false,
    active: data.polling_active || false,
    started: data.polling_started || false,
  });
  ```

**Function**: `changeTarget()`

- **Endpoint**: `POST /target`
- **Purpose**: Updates the target username for polling
- **Validation**: Ensures non-empty input
- **Error Handling**: Network errors and backend validation errors
- **Success Flow**: Updates local state and refreshes polling status

#### **4. Storage Management**

**Function**: `clearStorage()`

- **Endpoint**: `POST /reset-processed`
- **Purpose**: Clears both processed posts and cache for current target
- **Confirmation**: User confirmation dialog with target username
- **Response Handling**: Shows detailed deletion counts
- **Error States**: Network errors and backend failures

#### **5. Polling Control System**

**Function**: `startPolling()`

- **Endpoint**: `POST /start-polling`
- **Purpose**: Initiates automatic polling for new posts
- **Success Flow**: Shows success message and refreshes status
- **Error Handling**: Displays backend error messages

**Function**: `stopPolling()`

- **Endpoint**: `POST /stop-polling`
- **Purpose**: Stops automatic polling
- **Success Flow**: Shows success message and refreshes status

**Function**: `triggerManualPoll()`

- **Endpoint**: `GET /poll-now?force=true`
- **Purpose**: Triggers immediate manual poll
- **Force Parameter**: Bypasses normal polling intervals

#### **6. Download Processing System**

**Function**: `fetchDownloads(url: string)`

- **Endpoint**: `GET /igdl?url=${encodeURIComponent(url)}`
- **Purpose**: Processes Instagram URLs and retrieves downloadable content
- **Response Processing**:
  - **GraphQL Results**: Direct mapping (unique items)
  - **Snapsave Results**: Deduplication of quality variants
- **Quality Selection Logic**:
  ```typescript
  // Sort by quality preference
  if (qualityA.includes("HD") && !qualityB.includes("HD")) return -1;
  if (qualityB.includes("HD") && !qualityA.includes("HD")) return 1;
  if (qualityA.includes("SD") && !qualityB.includes("SD")) return -1;
  if (qualityB.includes("SD") && !qualityA.includes("SD")) return 1;
  ```

#### **7. Telegram Integration (Frontend)**

**Function**: `sendToTelegram(itemIndex: number, videoUrl: string, originalInstagramUrl?: string)`

- **Endpoint**: `POST /send-to-telegram`
- **Purpose**: Manual sending of individual items to Telegram
- **Dynamic Caption Generation**:
  ```typescript
  caption: items[itemIndex]?.carouselIndex
    ? `✨ New photo from <a href="https://www.instagram.com/${
        currentTarget || "User not found"
      }/">@${
        currentTarget || "User not found"
      }</a>! 📱 <a href="${originalInstagramUrl}">View Original Post</a>`
    : `✨ New video from <a href="https://www.instagram.com/${
        currentTarget || "User not found"
      }/">@${
        currentTarget || "User not found"
      }</a>! 📱 <a href="${originalInstagramUrl}">View Original Post</a>`;
  ```
- **Status Management**: Tracks sending, success, and error states per item
- **Auto-clear**: Success status clears after 3 seconds

### **UI Components & Layout**

#### **1. Target Management Section**

- **Current Target Display**: Shows `@username` or "No target set"
- **Change Target Button**: Toggles target manager visibility
- **Polling Button**: Toggles polling manager visibility
- **Real-time Status**: Shows polling active/inactive status

#### **2. Target Manager Modal**

- **Input Field**: Accepts username or URL format
- **Validation**: Real-time input validation
- **Update Button**: Submits target change
- **Error Display**: Shows validation and network errors
- **Examples**: Provides input format guidance

#### **3. Polling Manager Modal**

- **Start/Stop Button**: Toggles polling state
- **Manual Poll Button**: Triggers immediate poll
- **Status Information**: Shows current polling state
- **Disabled States**: Prevents actions when loading

#### **4. Main Download Interface**

- **URL Input**: Validates and cleans Instagram URLs
- **Submit Button**: Triggers download processing
- **Loading States**: Shows processing status
- **Error Display**: Shows validation and processing errors

#### **5. Results Grid**

- **Card Layout**: Individual cards for each download item
- **Thumbnail Display**: Shows media previews
- **Quality Information**: Displays media quality
- **Carousel Index**: Shows item position in carousel
- **Download Link**: Direct download or progress API link
- **Telegram Button**: Manual send to Telegram with status feedback

---

## ⚙️ Backend Architecture

### **Core Server Setup**

#### **1. Express.js Application**

- **Framework**: Express.js with async/await support
- **Middleware**: JSON parsing, CORS, static file serving
- **Port Configuration**: Environment variable `PORT` (default: 3000)
- **Error Handling**: Global error handlers and request logging

#### **2. Database Layer (SQLite)**

**Database File**: `instagram_posts.db`

**Tables**:

```sql
-- Processed posts tracking
CREATE TABLE processed_posts (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  post_url TEXT NOT NULL,
  post_type TEXT NOT NULL,
  is_pinned BOOLEAN DEFAULT FALSE,
  pinned_at DATETIME,
  processed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Recent posts cache
CREATE TABLE recent_posts_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL,
  post_url TEXT NOT NULL,
  shortcode TEXT,
  is_pinned BOOLEAN DEFAULT FALSE,
  post_order INTEGER,
  cached_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### **Core Processing Functions**

#### **1. Instagram URL Processing (`processInstagramURL`)**

**Purpose**: Main function for processing Instagram URLs and sending to Telegram

**Parameters**:

- `url`: Instagram post URL
- `userAgent`: Optional custom user agent
- `username`: Uses `TARGET_USERNAME` from polling context

**Processing Flow**:

1. **URL Cleaning**: Removes `img_index` parameters
2. **Username Extraction**: Uses `TARGET_USERNAME` from polling context
3. **Primary Method**: Instagram GraphQL Downloader
4. **Fallback Method**: Snapsave API
5. **Telegram Sending**: Automatic sending for manual processing

**Telegram Integration**:

- **GraphQL Method**: Sends each carousel item individually
- **Snapsave Method**: Sends preview for carousels, single item for posts
- **Caption Format**: Dynamic username from polling context
- **Rate Limiting**: 1-second delays between sends

#### **2. Instagram Carousel Downloader (`InstagramCarouselDownloader`)**

**Class Purpose**: Handles GraphQL API interactions for Instagram content

**Key Methods**:

- `extractShortcode(url)`: Extracts shortcode from Instagram URLs
- `getInstagramData(shortcode)`: Fetches data from Instagram GraphQL API
- `extractCarouselItems(graphqlData)`: Processes GraphQL response into downloadable items
- `downloadCarousel(url)`: Main method for downloading carousel content

**GraphQL API Details**:

- **Endpoint**: `https://www.instagram.com/api/graphql`
- **Document ID**: `10015901848480474`
- **Headers**: User-Agent, X-IG-App-ID, X-FB-LSD
- **Response Processing**: Handles both carousel and single media items

#### **3. Snapsave Integration**

**Purpose**: Fallback download method when GraphQL fails

**Processing Logic**:

- **Carousel Detection**: Groups items by thumbnail to identify carousel items
- **Deduplication**: Removes duplicate quality variants
- **Quality Selection**: Prioritizes HD over SD quality
- **Telegram Integration**: Sends preview for carousels

### **Polling System Architecture**

#### **1. Polling State Management**

**Global Variables**:

```javascript
let TARGET_USERNAME = null;
let POLLING_ENABLED = false;
let pollingStarted = false;
let currentPollingTimeout = null;
```

**State Functions**:

- `startPolling(username)`: Initiates polling for specific user
- `stopPolling()`: Stops current polling
- `restartPolling()`: Restarts polling after manual stop

#### **2. Smart Polling Algorithm**

**Function**: `scheduleNextPoll()`

- **Base Interval**: Determined by activity tracker
- **Variation**: ±2 minutes randomization
- **Minimum Interval**: 1 minute
- **Scheduling**: Uses `setTimeout` for next poll

**Activity-Based Intervals**:

- **High Activity**: Shorter intervals (15-30 minutes)
- **Low Activity**: Longer intervals (45-60 minutes)
- **No Activity**: Maximum intervals (60+ minutes)

#### **3. Post Discovery & Processing**

**Function**: `checkForNewPosts(force = false)`

- **User Agent**: Rotates between multiple user agents
- **Post Fetching**: Uses Web Profile Info API
- **Cache Comparison**: Identifies new posts not in cache
- **Batch Processing**: Processes multiple posts efficiently
- **Fallback Processing**: Individual processing for failed batch items

#### **4. Cache Management**

**Function**: `updateRecentPostsCache(username, posts)`

- **Cache Clearing**: Removes old entries for user
- **New Entries**: Inserts current posts with metadata
- **Ordering**: Maintains post order and pinning status

**Function**: `findNewPosts(username, fetchedPosts)`

- **Cache Lookup**: Retrieves cached posts for user
- **Comparison**: Identifies posts not in cache
- **Statistics**: Logs fetch/cache/new post counts

#### **5. Post Processing Pipeline**

**Batch Processing**:

1. **GraphQL API**: Primary method for all posts
2. **Success Handling**: Processes each carousel item
3. **Failure Handling**: Individual fallback processing
4. **Telegram Sending**: Automatic sending for each item
5. **Status Tracking**: Marks posts as processed

**Telegram Integration (Automatic)**:

- **Main Processing**: `[AUTO]` prefix in logs
- **Fallback Processing**: `[AUTO-FALLBACK]` prefix
- **Rate Limiting**: 1-second delays between sends
- **Error Handling**: Continues processing on Telegram failures

---

## 🔄 Data Flow & Processing

### **Manual Download Flow**

#### **1. User Input Processing**

```
User Input → URL Validation → URL Cleaning → Backend Request
```

**Steps**:

1. User pastes Instagram URL
2. Frontend validates URL format
3. Frontend removes `img_index` parameters
4. Frontend sends `GET /igdl?url=...` request

#### **2. Backend Processing**

```
URL → GraphQL API → Carousel Items → Telegram (Manual) → Response
```

**Steps**:

1. Backend receives URL
2. Extracts shortcode from URL
3. Calls Instagram GraphQL API
4. Processes response into carousel items
5. Sends to Telegram (if configured)
6. Returns processed items to frontend

#### **3. Frontend Display**

```
Response → Item Processing → Quality Selection → UI Rendering
```

**Steps**:

1. Frontend receives processed items
2. Determines if GraphQL or Snapsave result
3. Applies quality selection logic
4. Renders download cards with thumbnails

### **Automatic Polling Flow**

#### **1. Polling Initiation**

```
Start Command → Target Validation → Polling Setup → First Poll
```

**Steps**:

1. User clicks "Start Polling"
2. Backend validates target username
3. Sets up polling state and intervals
4. Executes first poll immediately

#### **2. Post Discovery**

```
Target Username → Web Profile API → Post URLs → Cache Comparison
```

**Steps**:

1. Backend fetches user profile via Web Profile Info API
2. Extracts post URLs from profile data
3. Compares with cached posts
4. Identifies new posts for processing

#### **3. Batch Processing**

```
New Posts → GraphQL API → Carousel Items → Telegram (Auto) → Cache Update
```

**Steps**:

1. Backend processes new posts via GraphQL API
2. Extracts carousel items for each post
3. Sends each item to Telegram automatically
4. Updates cache with processed posts

#### **4. Activity Tracking**

```
Processed Posts → Activity Update → Interval Adjustment → Next Poll
```

**Steps**:

1. Backend updates activity tracker with new post count
2. Adjusts polling interval based on activity
3. Schedules next poll with smart timing
4. Continues polling cycle

---

## 🔍 Polling Systems

### **Automatic Polling System**

#### **1. Polling State Machine**

**States**:

- **Inactive**: No polling running
- **Active**: Polling is running and scheduled
- **Paused**: Polling stopped but can be restarted

**Transitions**:

```
Inactive → Active (startPolling)
Active → Inactive (stopPolling)
Active → Paused (manual stop)
Paused → Active (restartPolling)
```

#### **2. Smart Interval Algorithm**

**Function**: `activityTracker.getPollingInterval()`

- **High Activity**: 15-30 minutes
- **Medium Activity**: 30-45 minutes
- **Low Activity**: 45-60 minutes
- **No Activity**: 60+ minutes

**Activity Calculation**:

- **Recent Posts**: Counts posts processed in current poll cycle
- **Activity Reset**: Counter resets at end of each poll cycle
- **Interval Adjustment**: Shorter intervals for higher activity
- **Activity Levels**:
  - High: ≥2 posts in current cycle
  - Medium: 1 post in current cycle
  - Low: 0 posts in current cycle

#### **3. Post Processing Pipeline**

**Batch Processing**:

1. **GraphQL API Call**: Fetches post data
2. **Item Extraction**: Extracts carousel items
3. **Telegram Sending**: Sends each item automatically
4. **Status Tracking**: Marks post as processed
5. **Cache Update**: Updates recent posts cache

**Fallback Processing**:

1. **Individual API Call**: Retries failed posts individually
2. **Snapsave Fallback**: Uses Snapsave if GraphQL fails
3. **Telegram Sending**: Sends fallback results
4. **Error Handling**: Logs failures and continues

### **Manual Polling System**

#### **1. Manual Poll Trigger**

**Endpoint**: `GET /poll-now?force=true`

- **Force Parameter**: Bypasses normal polling intervals
- **Immediate Execution**: Runs poll immediately
- **Same Processing**: Uses same pipeline as automatic polling

#### **2. Manual Processing**

**Function**: `processIndividualPost(post, userAgent)`

- **Individual Processing**: Processes single post
- **GraphQL Method**: Primary processing method
- **Snapsave Fallback**: Fallback for failed posts
- **Telegram Integration**: Sends to Telegram automatically

---

## 📱 Telegram Integration

### **Automatic Polling Telegram System**

#### **1. Main Processing Sending**

**Location**: Automatic polling batch processing
**Prefix**: `[AUTO]` in logs
**Logic**:

```javascript
if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHANNEL_ID) {
  for (const item of result.data) {
    const photoCaption = `✨ New photo from <a href="https://www.instagram.com/${TARGET_USERNAME}/">@${TARGET_USERNAME}</a>! 📱 <a href="${result.url}">View Original Post</a>`;
    const videoCaption = `✨ New video from <a href="https://www.instagram.com/${TARGET_USERNAME}/">@${TARGET_USERNAME}</a>! 📱 <a href="${result.url}">View Original Post</a>`;

    if (item.isVideo) {
      await sendVideoToTelegram(item.url, videoCaption);
    } else {
      await sendPhotoToTelegram(item.url, photoCaption);
    }
  }
}
```

#### **2. Fallback Processing Sending**

**Location**: Automatic polling fallback processing
**Prefix**: `[AUTO-FALLBACK]` in logs
**Logic**: Same as main processing but for fallback results

### **Manual Processing Telegram System**

#### **1. GraphQL Method Sending**

**Location**: `processInstagramURL` function
**Prefix**: `[MANUAL]` in logs
**Logic**: Sends each carousel item individually

#### **2. Snapsave Method Sending**

**Location**: `processInstagramURL` function
**Prefix**: `[MANUAL]` in logs
**Logic**: Sends preview for carousels, single item for posts

### **Manual Send Endpoint**

#### **1. Endpoint Details**

**Route**: `POST /send-to-telegram`
**Purpose**: Manual sending of individual items
**Parameters**:

- `videoUrl`: Legacy video URL parameter
- `mediaUrl`: Preferred media URL parameter
- `photoUrl`: Legacy photo URL parameter
- `caption`: Optional caption text
- `originalInstagramUrl`: Original Instagram URL
- `source`: Source type ('instagram' | 'snapchat')
- `type`: Media type ('video' | 'photo')

#### **2. URL Normalization**

**Function**: Normalizes Snapchat proxy URLs to server-to-server base
**Logic**: Converts frontend URLs to backend URLs for Snapchat integration

#### **3. Caption Generation**

**Logic**: Combines provided caption with original URL and default text
**Format**: `[caption]\n\n📱 Original: [url]`

### **Telegram API Functions**

#### **1. Photo Sending**

**Function**: `sendPhotoToTelegram(photoUrl, caption)`
**API**: `POST https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`
**Parameters**:

- `chat_id`: Channel ID
- `photo`: Photo URL
- `caption`: HTML-formatted caption
- `parse_mode`: 'HTML'

#### **2. Video Sending**

**Function**: `sendVideoToTelegram(videoUrl, caption)`
**API**: `POST https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendVideo`
**Parameters**:

- `chat_id`: Channel ID
- `video`: Video URL
- `caption`: HTML-formatted caption
- `parse_mode`: 'HTML'

#### **3. Error Handling**

**Configuration Validation**: Checks for bot token and channel ID
**Rate Limiting**: 1-second delays between sends
**Error Logging**: Logs failures but continues processing
**Fallback**: Continues processing even if Telegram fails

---

## 💾 Storage & Caching

### **Database Schema**

#### **1. Processed Posts Table**

**Purpose**: Tracks which posts have been processed
**Schema**:

```sql
CREATE TABLE processed_posts (
  id TEXT PRIMARY KEY,           -- Post shortcode
  username TEXT NOT NULL,        -- Target username
  post_url TEXT NOT NULL,        -- Original post URL
  post_type TEXT NOT NULL,       -- 'photo', 'video', 'carousel'
  is_pinned BOOLEAN DEFAULT FALSE, -- Pinned post flag
  pinned_at DATETIME,            -- When post was pinned
  processed_at DATETIME DEFAULT CURRENT_TIMESTAMP -- Processing timestamp
);
```

#### **2. Recent Posts Cache Table**

**Purpose**: Caches recent posts for comparison
**Schema**:

```sql
CREATE TABLE recent_posts_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL,        -- Target username
  post_url TEXT NOT NULL,        -- Post URL
  shortcode TEXT,                -- Post shortcode
  is_pinned BOOLEAN DEFAULT FALSE, -- Pinned post flag
  post_order INTEGER,            -- Post order in profile
  cached_at DATETIME DEFAULT CURRENT_TIMESTAMP -- Cache timestamp
);
```

### **Cache Management Functions**

#### **1. Cache Update**

**Function**: `updateRecentPostsCache(username, posts)`
**Process**:

1. Deletes old cache entries for user
2. Inserts new posts with metadata
3. Maintains post order and pinning status
4. Logs cache update statistics

#### **2. Cache Comparison**

**Function**: `findNewPosts(username, fetchedPosts)`
**Process**:

1. Retrieves cached posts for user
2. Compares fetched posts with cache
3. Identifies new posts not in cache
4. Returns only new posts for processing

#### **3. Cache Cleanup**

**Function**: `cleanExpiredCache()`
**Process**:

1. Removes cache entries older than 7 days
2. Removes processed posts older than 7 days (non-pinned)
3. Logs cleanup statistics

### **Storage Management Functions**

#### **1. Post Processing Tracking**

**Function**: `isPostProcessed(postId, username)`
**Logic**:

- Checks if post exists in processed_posts table
- For pinned posts: allows re-processing if pinned within 24 hours
- For regular posts: always treats as processed once processed

**Function**: `markPostAsProcessed(postId, username, postUrl, postType, isPinned)`
**Logic**:

- Inserts or updates processed post record
- Sets appropriate timestamps
- Handles pinned post special cases

#### **2. Storage Clearing**

**Function**: `clearUserCache(username)`
**Process**: Deletes all cache entries for specific user

**Function**: `clearUserData(username)`
**Process**: Deletes both processed posts and cache for user

**Endpoint**: `POST /reset-processed`
**Process**: Clears both processed posts and cache for current target

---

## 🛡️ Error Handling & Monitoring

### **Request Tracking System**

#### **1. Request Tracker Class**

**Purpose**: Monitors API request success/failure rates
**Metrics**:

- Total requests (Instagram, Telegram)
- Success/failure counts
- Rate limiting detection
- Hourly and daily statistics

**Functions**:

- `trackInstagram(url, success, error)`: Tracks Instagram API requests
- `trackTelegram(type, success, error)`: Tracks Telegram API requests
- `getStats()`: Returns current statistics
- `printStats()`: Logs statistics to console

#### **2. Activity Tracker Class**

**Purpose**: Monitors user activity and adjusts polling intervals
**Metrics**:

- Recent post activity
- Activity level calculation
- Polling interval adjustment

**Functions**:

- `updateActivity(postCount)`: Updates activity level
- `getPollingInterval()`: Returns smart polling interval
- `getActivityLevel()`: Returns current activity level

### **Error Handling Patterns**

#### **1. API Error Handling**

**Instagram API Errors**:

- **Rate Limiting**: Detects 429 status codes
- **Network Errors**: Retries with exponential backoff
- **Invalid Responses**: Falls back to alternative methods

**Telegram API Errors**:

- **Configuration Errors**: Validates bot token and channel ID
- **Network Errors**: Logs but continues processing
- **Rate Limiting**: Implements delays between sends

#### **2. Database Error Handling**

**Connection Errors**: Logs and continues with degraded functionality
**Query Errors**: Logs specific error details
**Transaction Errors**: Rolls back and retries

#### **3. Frontend Error Handling**

**Network Errors**: Shows user-friendly error messages
**Validation Errors**: Real-time input validation
**State Errors**: Graceful degradation of functionality

### **Monitoring & Logging**

#### **1. Console Logging**

**Log Levels**:

- `✅`: Success operations
- `❌`: Error conditions
- `⚠️`: Warning conditions
- `🔄`: Processing operations
- `📤`: Telegram operations
- `📱`: Instagram operations

**Log Categories**:

- `[AUTO]`: Automatic polling operations
- `[MANUAL]`: Manual processing operations
- `[AUTO-FALLBACK]`: Automatic polling fallback operations

#### **2. Statistics Endpoints**

**Endpoint**: `GET /stats`
**Purpose**: Returns current request statistics
**Response**: JSON with Instagram and Telegram metrics

**Endpoint**: `POST /stats/print`
**Purpose**: Prints statistics to console
**Response**: Console output with formatted statistics

**Endpoint**: `POST /stats/reset`
**Purpose**: Resets all statistics
**Response**: Confirmation of reset

---

## 🔌 API Endpoints

### **Core Download Endpoints**

#### **1. Main Download Endpoint**

**Route**: `GET /igdl`
**Purpose**: Processes Instagram URLs and returns downloadable content
**Parameters**:

- `url` (query): Instagram post URL
  **Response**: JSON with processed download items
  **Processing**: Uses GraphQL API with Snapsave fallback

#### **2. Telegram Send Endpoint**

**Route**: `POST /send-to-telegram`
**Purpose**: Sends media to Telegram channel
**Parameters**:

- `videoUrl` (body): Legacy video URL
- `mediaUrl` (body): Preferred media URL
- `photoUrl` (body): Legacy photo URL
- `caption` (body): Optional caption
- `originalInstagramUrl` (body): Original Instagram URL
- `source` (body): Source type
- `type` (body): Media type
  **Response**: JSON with send status

### **Target Management Endpoints**

#### **1. Get Current Target**

**Route**: `GET /target`
**Purpose**: Returns current tracking target and polling status
**Response**: JSON with target and polling information

#### **2. Set Target**

**Route**: `POST /target`
**Purpose**: Updates the tracking target
**Parameters**:

- `username` (body): New target username
  **Response**: JSON with success status and new target

### **Polling Control Endpoints**

#### **1. Start Polling**

**Route**: `POST /start-polling`
**Purpose**: Starts automatic polling for current target
**Response**: JSON with success status and polling information

#### **2. Stop Polling**

**Route**: `POST /stop-polling`
**Purpose**: Stops automatic polling
**Response**: JSON with success status

#### **3. Manual Poll**

**Route**: `GET /poll-now`
**Purpose**: Triggers immediate manual poll
**Parameters**:

- `force` (query): Force poll regardless of state
  **Response**: JSON with poll results

### **Storage Management Endpoints**

#### **1. Reset Processed Posts**

**Route**: `POST /reset-processed`
**Purpose**: Clears processed posts and cache for current target
**Response**: JSON with deletion counts

#### **2. Clear Cache**

**Route**: `POST /clear-cache`
**Purpose**: Clears cache for current target
**Response**: JSON with deletion count

#### **3. Clear All Data**

**Route**: `POST /clear-all`
**Purpose**: Clears all data for current target
**Response**: JSON with deletion counts

### **Monitoring Endpoints**

#### **1. Get Statistics**

**Route**: `GET /stats`
**Purpose**: Returns current request statistics
**Response**: JSON with Instagram and Telegram metrics

#### **2. Print Statistics**

**Route**: `POST /stats/print`
**Purpose**: Prints statistics to console
**Response**: Console output

#### **3. Reset Statistics**

**Route**: `POST /stats/reset`
**Purpose**: Resets all statistics
**Response**: JSON confirmation

#### **4. Get Logs**

**Route**: `GET /logs`
**Purpose**: Returns recent log entries
**Response**: JSON with log data

---

## 🔐 Security & Configuration

### **Environment Configuration**

#### **1. Required Environment Variables**

```bash
# Server Configuration
PORT=3000

# Telegram Configuration
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHANNEL_ID=-1001234567890

# Instagram Configuration
USER_AGENT=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36
X_IG_APP_ID=936619743392459

# Snapchat Integration (Optional)
SNAPCHAT_API_INTERNAL=http://localhost:8000
```

#### **2. Frontend Configuration**

```typescript
// API Base URL Configuration
const API_BASE_URL =
  (import.meta as any).env?.VITE_IG_API_URL ||
  (import.meta as any).env?.VITE_IG_URL ||
  "http://localhost:3000";
```

### **Security Considerations**

#### **1. API Token Security**

- **Telegram Bot Token**: Stored in environment variables
- **Channel ID Validation**: Ensures negative format for channels
- **Token Exposure**: Never logged or exposed in responses

#### **2. Rate Limiting**

- **Instagram API**: Implements delays and exponential backoff
- **Telegram API**: 1-second delays between sends
- **Request Tracking**: Monitors rate limit responses

#### **3. Input Validation**

- **URL Validation**: Regex validation for Instagram URLs
- **Username Validation**: Sanitizes target usernames
- **Parameter Validation**: Validates all API parameters

#### **4. Error Handling**

- **Sensitive Data**: Never exposes tokens in error messages
- **Graceful Degradation**: Continues operation on non-critical failures
- **Logging**: Logs errors without exposing sensitive information

### **Configuration Validation**

#### **1. Startup Validation**

**Function**: Validates all required environment variables
**Checks**:

- Telegram bot token presence
- Channel ID format (negative for channels)
- Instagram app ID presence
- User agent configuration

#### **2. Runtime Validation**

**Function**: Validates configuration before API calls
**Checks**:

- Bot token validity via Telegram API
- Channel access via Telegram API
- Instagram API accessibility

---

## 📊 System Performance & Optimization

### **Performance Optimizations**

#### **1. Batch Processing**

- **GraphQL API**: Processes multiple posts in single requests
- **Database Operations**: Batches cache updates
- **Telegram Sending**: Processes items sequentially with delays

#### **2. Caching Strategy**

- **Recent Posts Cache**: Reduces API calls for known posts
- **Processed Posts Tracking**: Prevents duplicate processing
- **Smart Polling**: Adjusts intervals based on activity

#### **3. Memory Management**

- **Stream Processing**: Processes large responses in chunks
- **Garbage Collection**: Clears old cache entries automatically
- **Connection Pooling**: Efficient database connections

### **Scalability Considerations**

#### **1. Horizontal Scaling**

- **Stateless Design**: Most operations are stateless
- **Database Sharing**: SQLite can be replaced with shared database
- **Load Balancing**: Multiple instances can share polling load

#### **2. Vertical Scaling**

- **Memory Usage**: Monitors memory consumption
- **CPU Usage**: Optimizes processing algorithms
- **Disk Usage**: Manages database and log file sizes

#### **3. Rate Limiting**

- **Instagram API**: Respects rate limits with backoff
- **Telegram API**: Implements delays between sends
- **Request Queuing**: Queues requests during rate limiting

---

## 🔄 Integration Points

### **External API Integrations**

#### **1. Instagram GraphQL API**

- **Endpoint**: `https://www.instagram.com/api/graphql`
- **Authentication**: Uses app ID and user agent
- **Rate Limiting**: Implements exponential backoff
- **Fallback**: Snapsave API for failed requests

#### **2. Snapsave API**

- **Purpose**: Fallback download method
- **Processing**: Deduplicates quality variants
- **Integration**: Seamless fallback from GraphQL

#### **3. Telegram Bot API**

- **Endpoints**: Send photo and video endpoints
- **Authentication**: Bot token authentication
- **Rate Limiting**: 1-second delays between sends
- **Error Handling**: Continues on failures

### **Internal Service Integration**

#### **1. Snapchat Service**

- **URL Normalization**: Converts frontend URLs to backend URLs
- **Media Sending**: Integrates with Telegram sending
- **Error Handling**: Handles service unavailability

#### **2. Database Integration**

- **SQLite**: File-based database for persistence
- **Connection Management**: Efficient connection handling
- **Transaction Support**: ACID compliance for data integrity

---

## 📈 Monitoring & Analytics

### **Real-time Monitoring**

#### **1. Request Statistics**

- **Success Rates**: Tracks API success/failure rates
- **Response Times**: Monitors API response times
- **Error Rates**: Tracks error frequencies

#### **2. Activity Monitoring**

- **Post Discovery**: Tracks new post discovery rates
- **Processing Times**: Monitors processing performance
- **Telegram Sending**: Tracks send success rates

#### **3. System Health**

- **Memory Usage**: Monitors memory consumption
- **Database Size**: Tracks database growth
- **Error Logs**: Monitors error frequencies

### **Analytics & Reporting**

#### **1. Usage Analytics**

- **Download Counts**: Tracks download requests
- **User Activity**: Monitors user interaction patterns
- **Feature Usage**: Tracks feature adoption

#### **2. Performance Analytics**

- **Processing Times**: Measures processing performance
- **API Response Times**: Monitors external API performance
- **Error Patterns**: Analyzes error patterns

#### **3. Business Intelligence**

- **Popular Content**: Identifies popular content types
- **User Behavior**: Analyzes user interaction patterns
- **System Efficiency**: Measures system efficiency metrics

---

## 🚀 Deployment & Operations

### **Deployment Considerations**

#### **1. Environment Setup**

- **Node.js**: Version 16+ required
- **Dependencies**: npm install for all packages
- **Environment Variables**: Configure all required variables
- **Database**: SQLite file permissions

#### **2. Process Management**

- **PM2**: Recommended for production deployment
- **Log Rotation**: Configure log file rotation
- **Memory Limits**: Set appropriate memory limits
- **Restart Policies**: Configure automatic restart policies

#### **3. Monitoring Setup**

- **Health Checks**: Implement health check endpoints
- **Log Aggregation**: Set up log aggregation
- **Alerting**: Configure error alerting
- **Metrics Collection**: Set up metrics collection

### **Operational Procedures**

#### **1. Backup Procedures**

- **Database Backup**: Regular SQLite database backups
- **Configuration Backup**: Backup environment configuration
- **Log Backup**: Archive old log files

#### **2. Maintenance Procedures**

- **Cache Cleanup**: Regular cache cleanup
- **Database Maintenance**: Regular database optimization
- **Log Rotation**: Regular log file rotation

#### **3. Troubleshooting Procedures**

- **Error Diagnosis**: Systematic error diagnosis process
- **Performance Analysis**: Performance bottleneck identification
- **Recovery Procedures**: System recovery procedures

---

_This documentation provides a comprehensive overview of the Instagram Video Downloader API system, covering all aspects from frontend user interactions to backend processing, polling systems, and external integrations. The system is designed for scalability, reliability, and ease of maintenance while providing robust error handling and monitoring capabilities._
