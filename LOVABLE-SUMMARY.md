# Social Media Downloader Suite - Project Summary for Lovable.com

## 🎯 Project Overview

A comprehensive social media content downloader suite that automates monitoring and downloading of Instagram and Snapchat content with intelligent polling, Telegram integration, and real-time progress tracking.

---

## 📱 Core Services

### **Service 1: Instagram Downloader**

Automated Instagram content monitoring and download service with Telegram integration.

### **Service 2: Snapchat Downloader**

Automated Snapchat story monitoring and download service with Telegram integration.

### **Service 3: Unified Web Interface**

Single-page React application that manages both Instagram and Snapchat services.

---

## 🎨 Instagram Service Features

### **1. Manual Download System**

- **Input**: Paste any public Instagram URL (posts, reels, stories, TV)
- **URL Validation**: Real-time validation with regex pattern matching
- **URL Cleaning**: Automatically removes unnecessary parameters (img_index, etc.)
- **Supported Content**: Posts, reels, TV videos, stories, carousels
- **Output**: High-quality media files with download links

### **2. Carousel Processing**

- **Multi-item Detection**: Identifies carousel posts automatically
- **Individual Item Extraction**: Extracts each carousel item separately
- **Sequential Indexing**: Numbers each item (1/5, 2/5, etc.)
- **Quality Selection**: Chooses highest available quality per item
- **Deduplication**: Removes duplicate quality variants
- **Thumbnail Generation**: Creates preview thumbnails for each item

### **3. Automatic Polling System**

- **Target Management**: Set any Instagram username as monitoring target
- **Smart Intervals**: Activity-based polling (15-45 minutes)
  - High activity: 15-30 minutes
  - Medium activity: 25-35 minutes
  - Low activity: 35-45 minutes
- **Activity Tracking**: Monitors post frequency to adjust intervals
- **Random Variation**: ±2 minutes randomization to avoid detection
- **First-run Skip**: Ignores existing posts on first poll
- **Continuous Monitoring**: Runs indefinitely until stopped

### **4. Post Discovery & Processing**

- **Multi-method Approach**:
  - Primary: Instagram GraphQL API
  - Secondary: Web Profile Info API
  - Fallback: Snapsave API
- **Batch Processing**: Processes multiple new posts efficiently
- **Pinned Post Handling**: Tracks and manages pinned posts
- **Post Order Tracking**: Maintains post sequence
- **Error Recovery**: Individual fallback for failed batch items

### **5. Story Monitoring**

- **Integrated Polling**: Stories checked before posts in each cycle
- **Story-specific API**: Uses dedicated story endpoints
- **Expiration Aware**: Prioritizes stories due to 24-hour expiration
- **Story Deduplication**: Prevents duplicate story downloads
- **Story Types**: Supports photos and videos

### **6. Telegram Integration**

- **Automatic Sending**: New content sent automatically when detected
- **Manual Sending**: UI buttons to send individual items
- **Dynamic Captions**: HTML-formatted with username links
  - Photos: "✨ New photo from @username! 📱 View Original Post"
  - Videos: "✨ New video from @username! 📱 View Original Post"
- **Rate Limiting**: 1-second delays between sends
- **Status Tracking**: Per-item sending status (idle/sending/success/error)
- **Error Handling**: Continues processing on Telegram failures
- **Retry Logic**: Automatic retries on network failures

### **7. Database & Caching**

- **Processed Posts Table**: Tracks all processed posts
  - Stores: ID, username, URL, type, pinned status, timestamp
- **Recent Posts Cache**: Speeds up new post detection
  - Stores: Username, URL, shortcode, order, cached time
- **Story Tracking Table**: Prevents duplicate story processing
  - Stores: Story ID, username, URL, type, timestamp
- **Cache Comparison**: Efficient new-content detection
- **Cache Cleanup**: Automatic cleanup of old entries (7 days)

### **8. Target Management**

- **Change Target**: Switch monitored accounts anytime
- **Username/URL Input**: Accepts both formats
- **Validation**: Real-time input validation
- **Current Status Display**: Shows active target and polling state
- **Multiple Targets**: Can track different accounts (one at a time)

### **9. Storage Management**

- **Clear Processed Posts**: Reset processed post history
- **Clear Cache**: Remove recent posts cache
- **Clear All**: Complete data reset for target
- **Confirmation Dialogs**: Prevent accidental deletions
- **Count Display**: Shows number of items deleted

### **10. Quality & Media Handling**

- **Quality Detection**: Identifies HD, SD, and other quality variants
- **Automatic Selection**: Chooses highest quality automatically
- **Progress API Support**: Handles Snapsave progress URLs
- **Video/Photo Detection**: Automatic media type identification
- **Thumbnail Extraction**: Generates/extracts preview images

### **11. Real-time Status Updates**

- **Polling Status Indicator**: Visual active/inactive status
- **3-Second Refresh**: Regular status updates
- **Next Poll Time**: Shows countdown to next poll
- **Activity Level Display**: Shows high/medium/low activity
- **Last Poll Time**: Displays most recent poll timestamp

### **12. Request Tracking & Statistics**

- **Instagram API Tracking**: Total, successful, failed, rate-limited
- **Telegram API Tracking**: Photos, videos, success/failure counts
- **Time-based Stats**: Last hour, last 24 hours, total
- **Request Logging**: Detailed log file with timestamps
- **Statistics Endpoint**: View stats via API call
- **Stats Reset**: Clear statistics on demand

### **13. Error Handling**

- **Rate Limit Detection**: Identifies 429 responses
- **Exponential Backoff**: Smart retry delays on failures
- **User-friendly Messages**: Clear error communication
- **Graceful Degradation**: Continues on non-critical failures
- **Health Checks**: Service health monitoring every 5 minutes
- **Auto-recovery**: Automatic service restart on critical failures

### **14. Anti-detection Measures**

- **User Agent Rotation**: Multiple user agents per poll cycle
- **Random Delays**: Human-like timing between requests
- **Smart Polling**: Randomized intervals
- **Limited Scope**: Fetches only recent posts (5-10)
- **Respectful Rate Limiting**: Avoids excessive requests

---

## 🔥 Snapchat Service Features

### **1. Manual Download System**

- **Input**: Enter Snapchat username
- **Content Type Selection**: Dropdown for stories/highlights/spotlights
- **Username Validation**: Real-time format validation
- **Auto-suggestions**: Suggests previously targeted usernames
- **Debounced Input**: Smooth typing experience with suggestions

### **2. Content Type Support**

- **Stories**: Recent 24-hour stories
- **Highlights**: Saved story highlights
- **Spotlights**: Public Snapchat content
- **Multi-format**: Photos and videos for all types
- **Quality Variants**: Multiple quality options

### **3. Real-time Progress Tracking**

- **WebSocket Integration**: Live progress updates
- **Overall Progress**: Total download progress percentage
- **Per-file Progress**: Individual file download status
- **Status Indicators**: Fetching, downloading, completed states
- **File Count Display**: Shows X of Y files downloaded
- **Download Speed**: Real-time speed indicators

### **4. WebSocket Features**

- **Auto-reconnection**: Exponential backoff reconnection
- **Heartbeat System**: Keep-alive pings every 30 seconds
- **Connection Status**: Visual connected/disconnected indicator
- **Fallback Polling**: HTTP polling when WebSocket unavailable
- **Progress Synchronization**: Syncs with backend state

### **5. Automatic Polling System**

- **Target Management**: Set Snapchat username as target
- **Smart Intervals**: Activity-based polling (10-45 minutes)
  - High activity: 15 minutes
  - Medium activity: 25 minutes
  - Low activity: 45 minutes
- **Faster Polling**: Shorter intervals than Instagram (stories expire)
- **Activity Tracking**: Monitors story frequency
- **Multi-content Polling**: Checks stories, highlights, spotlights

### **6. Gallery System**

- **Visual Grid**: Card-based media gallery
- **Thumbnail Previews**: Image/video thumbnails
- **Media Type Badges**: Photo/video indicators
- **Download Status**: Visual download state per item
- **Download Links**: Direct download buttons
- **Telegram Buttons**: Send to Telegram per item

### **7. Telegram Integration**

- **Automatic Sending**: New content sent when detected
- **Manual Sending**: Per-item send buttons
- **Status Tracking**: Real-time sending status
- **Caption Generation**: Dynamic username captions
  - Format: "✨ New {type} from @username! 📱 Snapchat: @username"
- **Bulk Sending**: Send multiple items at once
- **Error Display**: Clear error messages on failures

### **8. Progress API**

- **Progress Endpoint**: `/progress/{username}/{type}`
- **Real-time Updates**: Live progress data
- **File-level Details**: Individual file progress
- **Overall Statistics**: Total progress, speed, ETA
- **Status Changes**: Automatic status transitions

### **9. Database & Caching**

- **Processed Media Table**: Tracks all processed content
  - Stores: Media ID, username, URL, type, telegram status
- **Recent Media Cache**: Speeds up new content detection
- **Memory Cache**: In-memory cache for faster access
- **Supabase Integration**: Cloud database for persistence
- **Cache Initialization**: Loads cache on service startup

### **10. Storage Management**

- **File-based Metadata**: JSON metadata files per user
- **Download Organization**: username/content-type/files structure
- **Metadata Tracking**: Download status, URLs, thumbnails
- **Clear Cache**: Reset cache for target user
- **Clear Storage**: Delete downloaded files and metadata

### **11. Download Management**

- **Concurrent Downloads**: ThreadPoolExecutor for parallel downloads
- **Resume Support**: Can resume interrupted downloads
- **Error Recovery**: Retries failed downloads
- **Validation**: Verifies file integrity
- **Cleanup**: Removes failed/partial downloads

### **12. Request Tracking**

- **Snapchat API Tracking**: Total, successful, failed requests
- **Telegram Tracking**: Photos, videos sent
- **Time-based Stats**: Hourly and daily counters
- **Request Logging**: Detailed log file
- **Statistics Endpoint**: View stats via API

### **13. Username Management**

- **Targeted Users Endpoint**: List of previously targeted users
- **Auto-suggestions**: Dropdown suggestions from history
- **Debounced Search**: Smooth search experience
- **Minimum Characters**: 2-character minimum for suggestions
- **Case-insensitive**: Flexible username matching

### **14. Health & Monitoring**

- **Health Check Endpoint**: Service status verification
- **Memory Monitoring**: Tracks memory usage
- **Scheduled Cleanup**: Automatic old file cleanup (4 weeks)
- **Log Rotation**: Automatic log file rotation
- **Service Status**: Real-time service state

---

## 🎨 Unified Frontend Features

### **1. Navigation & Layout**

- **Multi-page SPA**: React Router for navigation
- **Instagram Page**: `/` - Instagram downloader interface
- **Snapchat Page**: `/snapchat` - Snapchat downloader interface
- **Responsive Design**: Mobile, tablet, desktop support
- **Dark Theme**: Modern dark UI with gradients
- **Glass Morphism**: Semi-transparent components

### **2. Instagram Interface**

#### **Main Download Section**

- URL input with validation indicator
- Submit button with loading state
- Error display area
- Results grid with media cards

#### **Media Cards**

- Thumbnail preview
- Quality indicator (HD/SD)
- Carousel index (if applicable)
- Video/photo indicator
- Download button/link
- Telegram send button
- Status indicators (sending/success/error)

#### **Target Management Panel**

- Current target display: Shows @username or "No target set"
- Change target button: Opens target manager modal
- Polling button: Opens polling manager modal
- Real-time status indicator: Active/inactive polling

#### **Target Manager Modal**

- Username/URL input field
- Update button
- Cancel button
- Error display
- Input examples

#### **Polling Manager Modal**

- Start/Stop polling button
- Manual poll button
- Current status display
- Next poll time countdown
- Activity level indicator

#### **Storage Management**

- Clear storage button
- Confirmation dialog
- Deletion count display
- Success/error feedback

### **3. Snapchat Interface**

#### **Download Section**

- Username input with auto-suggestions
- Content type dropdown (stories/highlights/spotlights)
- Telegram toggle switch
- Submit button with loading state
- Error display

#### **Progress Display**

- Overall progress bar
- Current status (fetching/downloading/completed)
- File count (X of Y)
- Per-file progress list
- Download speed indicators
- Estimated time remaining

#### **Gallery Section**

- Grid layout of media cards
- Thumbnail previews
- Media type badges
- Download status per item
- Download buttons
- Telegram send buttons
- Status indicators

#### **Target Management**

- Similar to Instagram interface
- Current target display
- Change target button
- Polling controls
- Storage management

### **4. Common UI Components**

#### **Loading States**

- Skeleton screens
- Loading spinners
- Progress bars
- Button loading states

#### **Status Indicators**

- Success: Green checkmarks
- Error: Red X with message
- Sending: Blue spinner
- Idle: Default state

#### **Buttons & Controls**

- Primary action buttons
- Secondary action buttons
- Icon buttons
- Toggle switches
- Dropdowns

#### **Forms & Inputs**

- Text inputs with validation
- Dropdowns with search
- Toggle switches
- Radio buttons
- Checkboxes

#### **Feedback Systems**

- Success messages (green, auto-dismiss)
- Error messages (red, persistent)
- Warning messages (yellow)
- Info messages (blue)
- Confirmation dialogs

### **5. Responsive Breakpoints**

- **Mobile**: < 768px (single column, stacked layout)
- **Tablet**: 768px - 1024px (2-column grid)
- **Desktop**: > 1024px (3+ column grid)
- **Touch-friendly**: Larger hit areas on mobile
- **Adaptive Navigation**: Hamburger menu on mobile

### **6. Styling System**

- **Color Scheme**:

  - Background: Dark gradients (#0f172a to #0b1222)
  - Primary: Blue/cyan accents (#3b82f6)
  - Success: Green (#10b981)
  - Error: Red (#ef4444)
  - Warning: Yellow (#f59e0b)

- **Typography**:

  - Headings: Sans-serif, bold
  - Body: Sans-serif, regular
  - Code: Monospace

- **Spacing**:

  - Small: 8px
  - Medium: 16px
  - Large: 24px
  - XLarge: 32px

- **Border Radius**:
  - Small: 4px
  - Medium: 8px
  - Large: 12px

### **7. Animations & Transitions**

- Smooth hover effects (0.2s ease)
- Button scale on press
- Loading spinners
- Progress bar animations
- Fade in/out transitions
- Slide in modals

---

## 🔄 Common System Features

### **1. API Architecture**

- RESTful endpoints for both services
- JSON request/response format
- CORS enabled for frontend
- Error responses with status codes
- Request validation middleware

### **2. Configuration Management**

- Environment variables for sensitive data
- Telegram bot token configuration
- Telegram channel ID configuration
- Service port configuration
- Database path configuration
- API base URL configuration

### **3. Error Handling Strategy**

- Try-catch blocks throughout
- Detailed error logging
- User-friendly error messages
- Graceful degradation
- Automatic retries where appropriate
- Circuit breaker pattern for external APIs

### **4. Logging System**

- Structured logging format
- Log levels (INFO, WARNING, ERROR)
- Timestamp on all logs
- Request/response logging
- Error stack traces
- Log rotation (size-based, time-based)
- Separate log files per service

### **5. Rate Limiting**

- Instagram API: Exponential backoff on 429
- Telegram API: 1-second delays between sends
- Snapchat API: Intelligent request spacing
- Request queue management
- Rate limit detection and handling

### **6. Memory Management**

- Automatic garbage collection
- Cache size limits
- Old entry cleanup (7 days for Instagram, 4 weeks for Snapchat)
- Memory usage monitoring
- Scheduled cleanup jobs

### **7. Health Monitoring**

- Service health check endpoints
- Database connectivity checks
- API availability checks
- Memory usage monitoring
- Disk space monitoring
- Uptime tracking

### **8. Data Persistence**

- SQLite databases for both services
- File-based metadata for Snapchat
- JSON configuration files
- Log file persistence
- Download file storage

### **9. Security Considerations**

- Environment variable for secrets
- No credentials in code
- Input validation and sanitization
- CORS configuration
- Rate limiting protection
- SQL injection prevention

### **10. Development Features**

- Hot reload for frontend (Vite)
- Auto-restart for backend changes
- Development proxy configuration
- Console debugging tools
- Request logging in development

---

## 📊 Data Flow Diagrams

### **Instagram Manual Download Flow**

```
User Input → URL Validation → URL Cleaning → Backend Request
→ GraphQL API Call → Carousel Item Extraction → Response to Frontend
→ UI Display → User Clicks "Send to Telegram"
→ Telegram API Call → Success/Error Feedback
```

### **Instagram Automatic Polling Flow**

```
Scheduler Trigger → Fetch User Posts (Web API) → Compare with Cache
→ Identify New Posts → Batch GraphQL Processing → Extract Carousel Items
→ Auto-send to Telegram (per item) → Update Database → Update Cache
→ Update Activity Tracker → Schedule Next Poll (smart interval)
```

### **Snapchat Manual Download Flow**

```
User Input → Username Validation → Backend Request → WebSocket Connection
→ Snapchat Web API Call → Story Extraction → Concurrent Downloads
→ Progress Updates (WebSocket) → Metadata Storage → Gallery Display
→ User Clicks "Send to Telegram" → Telegram API Call → Status Update
```

### **Snapchat Automatic Polling Flow**

```
Scheduler Trigger → Fetch Stories (Snapchat API) → Compare with Cache
→ Identify New Stories → Download New Content → Auto-send to Telegram
→ Update Database → Update Cache → Update Activity Tracker
→ Schedule Next Poll (smart interval, faster than Instagram)
```

---

## 🎯 Key Functional Requirements for Lovable

### **1. Instagram Service Must Have**

- URL input field with real-time validation
- "Download" button that fetches Instagram content
- Display downloaded media in a grid with thumbnails
- "Change Target" button that opens a modal to set username
- "Polling" button that opens a modal with Start/Stop controls
- Visual indicator showing if polling is active/inactive
- "Send to Telegram" button on each media item
- Show sending status (sending/success/error) per item
- Store processed posts in database to avoid duplicates
- Cache recent posts for efficient new post detection
- Smart polling intervals that adjust based on activity
- Support for posts, reels, stories, and carousels

### **2. Snapchat Service Must Have**

- Username input field with auto-suggestions
- Dropdown to select stories/highlights/spotlights
- "Download" button that starts the download process
- Real-time progress bar showing download progress
- WebSocket connection for live progress updates
- Gallery grid displaying downloaded media with thumbnails
- "Send to Telegram" button on each media item
- Show sending status per item
- Store processed stories in database to avoid duplicates
- Target management similar to Instagram
- Polling controls similar to Instagram
- Smart polling intervals adjusted for faster Snapchat cycle

### **3. Telegram Integration Must Have**

- Configuration for bot token and channel ID
- Function to send photos to Telegram channel
- Function to send videos to Telegram channel
- HTML-formatted captions with clickable links
- 1-second delay between consecutive sends
- Error handling and retry logic
- Success/failure status tracking
- Continue processing even if Telegram fails

### **4. Database Must Have**

- Table for processed posts/stories (prevent duplicates)
- Table for recent posts/stories cache (efficient new detection)
- Store: ID, username, URL, type, timestamp
- Queries to check if content is already processed
- Queries to find new content not in cache
- Automatic cleanup of old entries (7 days)
- Transaction support for data integrity

### **5. UI/UX Must Have**

- Dark theme with gradient backgrounds
- Responsive design (mobile, tablet, desktop)
- Loading states for all async operations
- Error messages for all failures
- Success feedback for completed actions
- Confirmation dialogs for destructive actions
- Real-time status updates (3-second polling)
- Smooth animations and transitions
- Clear visual hierarchy
- Accessibility considerations

### **6. Backend Must Have**

- REST API endpoints for all features
- CORS enabled for frontend communication
- Request validation middleware
- Error handling middleware
- Logging for all requests and errors
- Health check endpoint
- Statistics endpoint for monitoring
- Environment-based configuration
- Graceful shutdown handling

---

## 🚀 Implementation Priority for Lovable

### **Phase 1: Core Download Functionality**

1. Instagram URL input and validation
2. Instagram download endpoint (GraphQL API method)
3. Display downloaded media in grid
4. Basic error handling

### **Phase 2: Database & Deduplication**

1. SQLite database setup
2. Processed posts table
3. Check for duplicates before processing
4. Store new posts after processing

### **Phase 3: Telegram Integration**

1. Telegram bot configuration
2. Send photo/video functions
3. Manual "Send to Telegram" buttons
4. Status tracking per item

### **Phase 4: Automatic Polling**

1. Target management (set/change target)
2. Polling control (start/stop)
3. Scheduled polling with smart intervals
4. Automatic Telegram sending on new content

### **Phase 5: Snapchat Service**

1. Snapchat username input
2. Download endpoint with WebSocket progress
3. Display in gallery
4. Telegram integration

### **Phase 6: Polish & Advanced Features**

1. Real-time status updates
2. Activity-based intervals
3. Request statistics
4. Storage management
5. Enhanced error handling
6. UI polish and animations

---

## 📝 API Endpoint Specifications

### **Instagram Service Endpoints**

#### `GET /igdl?url=<instagram_url>`

- **Purpose**: Download Instagram media from URL
- **Input**: Instagram URL (post/reel/story)
- **Output**: JSON array of media items with URLs, thumbnails, quality
- **Process**: GraphQL API → Extract items → Return JSON

#### `POST /target`

- **Purpose**: Set target username for polling
- **Input**: `{ "username": "instagram_username" }`
- **Output**: `{ "success": true, "current_target": "username" }`

#### `GET /target`

- **Purpose**: Get current target and polling status
- **Output**: `{ "current_target": "username", "polling_enabled": true, "polling_active": true }`

#### `POST /start-polling`

- **Purpose**: Start automatic polling
- **Output**: `{ "success": true, "message": "Polling started" }`

#### `POST /stop-polling`

- **Purpose**: Stop automatic polling
- **Output**: `{ "success": true, "message": "Polling stopped" }`

#### `GET /poll-now?force=true`

- **Purpose**: Trigger immediate manual poll
- **Output**: `{ "success": true, "new_posts_found": 5 }`

#### `POST /send-to-telegram`

- **Purpose**: Send media to Telegram
- **Input**: `{ "videoUrl": "url", "caption": "text", "originalInstagramUrl": "url" }`
- **Output**: `{ "success": true, "message": "Sent to Telegram" }`

#### `POST /reset-processed`

- **Purpose**: Clear processed posts and cache
- **Output**: `{ "posts_removed": 10, "cache_removed": 15 }`

#### `GET /stats`

- **Purpose**: Get request statistics
- **Output**: `{ "instagram": {...}, "telegram": {...}, "start_time": "..." }`

### **Snapchat Service Endpoints**

#### `POST /download`

- **Purpose**: Download Snapchat content
- **Input**: `{ "username": "snap_user", "download_type": "stories", "send_to_telegram": false }`
- **Output**: `{ "status": "success", "message": "Download started" }`

#### `GET /gallery/{username}/{media_type}`

- **Purpose**: Get downloaded media gallery
- **Output**: JSON array of media items with thumbnails, download URLs

#### `GET /progress/{username}/{media_type}`

- **Purpose**: Get download progress
- **Output**: `{ "status": "downloading", "progress": 45, "total": 10, "downloaded": 4 }`

#### `WebSocket /ws/{username}/{media_type}`

- **Purpose**: Real-time progress updates
- **Messages**: `{ "status": "downloading", "progress": 50, "files": {...} }`

#### `POST /send-to-telegram`

- **Purpose**: Send media to Telegram
- **Input**: `{ "mediaUrl": "url", "type": "photo", "caption": "text", "source": "snapchat" }`
- **Output**: `{ "status": "success" }`

#### `POST /targets`

- **Purpose**: Add target user
- **Input**: `{ "username": "snap_user" }`
- **Output**: `{ "success": true }`

#### `GET /targets`

- **Purpose**: Get all target users
- **Output**: Array of target users with polling status

#### `POST /targets/{username}/poll-now`

- **Purpose**: Trigger manual poll for user
- **Output**: `{ "success": true, "new_stories": 3 }`

#### `POST /targets/{username}/polling`

- **Purpose**: Update polling status
- **Input**: `{ "enabled": true }`
- **Output**: `{ "success": true }`

#### `GET /targeted-usernames?prefix=<text>`

- **Purpose**: Get username suggestions
- **Output**: Array of usernames matching prefix

---

## 🎨 UI Component Specifications

### **Download Button**

- **States**: Default, Loading, Success, Error
- **Colors**: Blue (default), Gray (loading), Green (success), Red (error)
- **Animation**: Scale on hover, spinner when loading

### **Telegram Send Button**

- **States**: Idle, Sending, Sent, Error
- **Icons**: 📤 (idle), ⏳ (sending), ✅ (sent), ❌ (error)
- **Colors**: Blue (idle), Gray (sending), Green (sent), Red (error)
- **Auto-clear**: Success state clears after 3 seconds

### **Media Card**

- **Layout**: Vertical card with thumbnail, info, actions
- **Thumbnail**: Aspect ratio 1:1 or 16:9, cover fit
- **Info Section**: Quality, index, type badges
- **Actions**: Download button, Telegram button
- **Hover**: Scale up slightly, show actions

### **Progress Bar**

- **Type**: Animated linear progress
- **Colors**: Blue fill, gray background
- **Percentage**: Display current percentage
- **Animation**: Smooth transition on progress change

### **Modal**

- **Backdrop**: Semi-transparent dark overlay
- **Content**: Centered white/gray box with rounded corners
- **Animation**: Fade in backdrop, slide in content
- **Close**: X button, click outside, ESC key

### **Status Indicator**

- **Polling Active**: Green pulsing dot + "Active" text
- **Polling Inactive**: Gray dot + "Inactive" text
- **Animation**: Pulsing animation for active state

### **Input Field**

- **Style**: Dark background, light border, white text
- **Focus**: Blue border highlight
- **Error**: Red border, red error text below
- **Valid**: Green border (optional)

### **Dropdown**

- **Style**: Dark background, light border
- **Options**: Hover highlight
- **Search**: Type to filter (for suggestions)
- **Animation**: Slide down on open

---

## 🔧 Configuration Specifications

### **Environment Variables**

```env
PORT=3000
TELEGRAM_BOT_TOKEN=8033935478:AAFCuh5q0gdzp9nr31mgK515Y_HwHY_z3eo
TELEGRAM_CHANNEL_ID=-1002885871132

SNAPCHAT_API_INTERNAL=http://localhost:8000



# Supabase (optional, for cloud caching)
SUPABASE_URL='https://tuvyckzfwdtaieajlszb.supabase.co'
SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR1dnlja3pmd2R0YWllYWpsc3piIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU4MTk3MjIsImV4cCI6MjA3MTM5NTcyMn0.-BNhNk3iO8WguyU6liZfJ4Vxuat5YG7wTHuDRumkbG8
SUPABASE_PASSWORD=2GpbGwpmcmXZJj44
```

### **Database Schema**

#### **Instagram - processed_posts**

```sql
CREATE TABLE processed_posts (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  post_url TEXT NOT NULL,
  post_type TEXT NOT NULL,
  is_pinned BOOLEAN DEFAULT FALSE,
  pinned_at DATETIME,
  processed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### **Instagram - recent_posts_cache**

```sql
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

#### **Instagram - processed_stories**

```sql
CREATE TABLE processed_stories (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  story_url TEXT NOT NULL,
  story_type TEXT NOT NULL,
  story_id TEXT,
  processed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### **Snapchat - processed_media**

```sql
CREATE TABLE processed_media (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  media_url TEXT NOT NULL,
  media_type TEXT NOT NULL,
  is_sent_to_telegram BOOLEAN DEFAULT FALSE,
  telegram_sent_at DATETIME,
  telegram_message_id TEXT,
  processed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### **Snapchat - recent_media_cache**

```sql
CREATE TABLE recent_media_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL,
  media_url TEXT NOT NULL,
  snap_id TEXT,
  media_type TEXT NOT NULL,
  is_sent_to_telegram BOOLEAN DEFAULT FALSE,
  media_order INTEGER,
  cached_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### **Snapchat - target_users**

```sql
CREATE TABLE target_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  polling_enabled BOOLEAN DEFAULT FALSE,
  polling_interval INTEGER DEFAULT 30,
  last_polled DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## 🎬 User Interaction Flows

### **Instagram: First-time Setup**

1. User opens application
2. Sees empty state with URL input
3. Clicks "Change Target" button
4. Modal opens with username input
5. User enters "spiderman"
6. Clicks "Update Target"
7. Modal closes, shows "Current Target: @spiderman"
8. User clicks "Polling" button
9. Modal opens with polling controls
10. User clicks "Start Polling"
11. Status indicator shows "Active"
12. System begins monitoring @spiderman

### **Instagram: Manual Download**

1. User opens application
2. Pastes Instagram URL in input field
3. URL validates (green border appears)
4. User clicks "Download" button
5. Button shows loading spinner
6. System fetches content from Instagram
7. Grid populates with media cards
8. Each card shows thumbnail, quality, download button
9. User clicks "Send to Telegram" on a card
10. Button shows "Sending..." state
11. Media sent to Telegram channel
12. Button shows "✅ Sent!" (green)
13. After 3 seconds, returns to idle state

### **Snapchat: First-time Setup**

1. User navigates to Snapchat page
2. Sees username input and type dropdown
3. Types "wolftyla" in username field
4. Auto-suggestions appear showing previous users
5. User selects from suggestions or continues typing
6. Selects "Stories" from dropdown
7. Toggles "Send to Telegram" on
8. Clicks "Download Stories" button
9. Progress bar appears
10. WebSocket connection established
11. Real-time progress updates shown
12. Files download with live status
13. Gallery populates with thumbnails
14. Download complete notification

### **Snapchat: Setting up Polling**

1. User clicks "Change Target" button
2. Modal opens
3. User enters "wolftyla"
4. Clicks "Update Target"
5. Target set successfully
6. User clicks "Polling" button
7. Polling controls modal opens
8. User clicks "Start Polling"
9. System begins monitoring wolftyla
10. New stories automatically downloaded
11. Automatically sent to Telegram
12. Gallery updates with new content

### **Common: Viewing Statistics**

1. User clicks "Statistics" button (optional feature)
2. Modal/panel shows:
   - Total downloads
   - Successful/failed requests
   - Telegram sends (photos/videos)
   - Rate limit hits
   - Uptime
3. User can reset statistics if needed

### **Common: Storage Management**

1. User clicks "Clear Storage" button
2. Confirmation dialog appears
3. "Are you sure? This will clear all processed posts/stories for @username"
4. User confirms
5. System clears database entries
6. Shows "Deleted 45 posts, 12 stories"
7. Status indicator updates

---

## 🧩 Technical Implementation Notes for Lovable

### **1. State Management**

- Use React hooks (useState, useEffect, useMemo) for component state
- Use Context API or simple prop drilling (no complex state library needed)
- Store polling status in component state with 3-second refresh
- Cache media items in component state after download

### **2. API Communication**

- Use fetch() or axios for HTTP requests
- Use native WebSocket API for real-time progress
- Implement exponential backoff for retries
- Handle CORS properly with backend configuration

### **3. Polling Logic**

- Use setTimeout() for scheduling (not setInterval())
- Calculate next poll time based on activity tracker
- Clear timeout on manual stop
- Re-schedule after each poll completes
- Handle errors with retry logic

### **4. Database Operations**

- Use SQLite with async/await patterns
- Prepare statements for performance
- Use transactions for multi-step operations
- Index username and timestamp columns
- Implement connection pooling

### **5. Error Handling Patterns**

```javascript
try {
  const result = await riskyOperation();
  // Handle success
  setState({ status: "success", data: result });
} catch (error) {
  // Handle error
  console.error("Operation failed:", error);
  setState({ status: "error", error: error.message });
  // Log to file
  logger.error("Operation failed", { error, context });
}
```

### **6. Progress Updates**

```javascript
// WebSocket progress
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  setProgress({
    overall: data.progress,
    current: data.current_file,
    total: data.total_files,
    status: data.status,
  });
};
```

### **7. Telegram Integration**

```javascript
async function sendToTelegram(mediaUrl, caption, type) {
  const formData = new FormData();
  formData.append("chat_id", TELEGRAM_CHANNEL_ID);
  formData.append(type, mediaUrl); // 'photo' or 'video'
  formData.append("caption", caption);
  formData.append("parse_mode", "HTML");

  const response = await fetch(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/send${
      type === "photo" ? "Photo" : "Video"
    }`,
    { method: "POST", body: formData }
  );

  return response.json();
}
```

### **8. Activity-based Intervals**

```javascript
class ActivityTracker {
  constructor() {
    this.recentPosts = 0;
    this.isFirstRun = true;
  }

  updateActivity(newPostsCount) {
    if (this.isFirstRun) {
      this.isFirstRun = false;
      return; // Skip first run
    }
    this.recentPosts += newPostsCount;
  }

  getPollingInterval() {
    const baseInterval = 25; // minutes
    if (this.recentPosts >= 3) return 15; // high activity
    if (this.recentPosts >= 1) return 25; // medium activity
    return 45; // low activity
  }
}
```

### **9. Cache Comparison**

```javascript
async function findNewPosts(username, fetchedPosts) {
  // Get cached posts
  const cachedPosts = await db.getCachedPosts(username);
  const cachedUrls = new Set(cachedPosts.map((p) => p.url));

  // Find new posts not in cache
  const newPosts = fetchedPosts.filter((p) => !cachedUrls.has(p.url));

  console.log(
    `Fetched: ${fetchedPosts.length}, Cached: ${cachedPosts.length}, New: ${newPosts.length}`
  );

  return newPosts;
}
```

### **10. Smart Scheduling**

```javascript
function scheduleNextPoll(activityTracker) {
  const baseMinutes = activityTracker.getPollingInterval();
  const variation = Math.floor(Math.random() * 5) - 2; // ±2 minutes
  const finalMinutes = Math.max(1, baseMinutes + variation);
  const nextPollMs = finalMinutes * 60 * 1000;

  console.log(`Next poll in ${finalMinutes} minutes`);

  currentPollingTimeout = setTimeout(async () => {
    await checkForNewContent();
    scheduleNextPoll(activityTracker);
  }, nextPollMs);
}
```

---

## ✨ Key Success Criteria

### **The implementation is successful if:**

1. ✅ User can paste any Instagram URL and see downloaded media in < 5 seconds
2. ✅ User can set a target Instagram account and start polling in 3 clicks
3. ✅ System automatically detects new posts within 15-45 minutes
4. ✅ New Instagram posts are automatically sent to Telegram channel
5. ✅ User can enter Snapchat username and see stories with real-time progress
6. ✅ Snapchat stories are monitored and auto-sent to Telegram
7. ✅ No duplicate posts/stories are downloaded or sent
8. ✅ UI is responsive and works on mobile devices
9. ✅ System handles API failures gracefully without crashing
10. ✅ Polling continues running even after page refresh (backend persistence)
11. ✅ All Telegram messages have correct captions with usernames
12. ✅ Progress bars show accurate real-time progress
13. ✅ Storage management buttons actually clear data
14. ✅ Service can run continuously for days without issues

---

## 🎓 Summary for Lovable

**Build a dual social media downloader:**

- **Instagram**: Paste URL → Download → Auto-monitor for new posts → Send to Telegram
- **Snapchat**: Enter username → Download stories → Auto-monitor → Send to Telegram

**Key features:**

- Smart polling that adjusts speed based on activity
- Database to prevent duplicates
- Telegram integration with HTML captions
- Real-time progress for Snapchat
- Target management (set who to monitor)
- Storage management (clear history)
- Responsive dark-themed UI

**Architecture:**

- React frontend with two pages (Instagram, Snapchat)
- Node.js backend for Instagram
- Python FastAPI backend for Snapchat
- SQLite databases for both
- WebSocket for Snapchat progress
- REST APIs for everything else

**The magic:**

- Polls Instagram every 15-45 mins based on activity
- Polls Snapchat every 10-45 mins (faster due to story expiration)
- First run ignores old content
- Cache system finds only NEW content efficiently
- Automatic Telegram sending with 1-second delays
- Continues running indefinitely once started

This is a production-ready system that has been refined through real-world use!
