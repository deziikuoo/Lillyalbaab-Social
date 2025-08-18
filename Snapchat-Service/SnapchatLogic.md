# Snapchat Telegram Integration Implementation Plan
## Comprehensive System Design Based on Instagram Logic

---

## 📋 Table of Contents
1. [System Overview](#system-overview)
2. [Architecture Comparison](#architecture-comparison)
3. [Implementation Strategy](#implementation-strategy)
4. [Backend Implementation](#backend-implementation)
5. [Frontend Integration](#frontend-integration)
6. [Database Schema](#database-schema)
7. [API Endpoints](#api-endpoints)
8. [Telegram Integration](#telegram-integration)
9. [Polling System](#polling-system)
10. [Progress Tracking](#progress-tracking)
11. [Error Handling](#error-handling)
12. [Configuration](#configuration)
13. [Testing Strategy](#testing-strategy)
14. [Deployment Plan](#deployment-plan)

---

## 🏗️ System Overview

### **Architecture Type**: Client-Server (React Frontend + FastAPI Backend)
### **Primary Purpose**: Snapchat content downloading with automated polling and Telegram integration
### **Technology Stack**:
- **Frontend**: React 18 + TypeScript + Vite
- **Backend**: FastAPI (Python) + SQLite
- **External APIs**: Snapchat Web API, Telegram Bot API
- **Database**: SQLite (file-based) + File-based metadata
- **Real-time Updates**: WebSocket-based + Polling-based

### **Current Snapchat Service State**
- **Framework**: FastAPI (Python) vs Instagram's Express.js (Node.js)
- **Database**: File-based metadata vs Instagram's SQLite
- **Real-time**: WebSocket vs Instagram's polling-based updates
- **Media Types**: Stories, Highlights, Spotlights vs Instagram's Posts, Reels, Stories
- **Distribution**: SMS, Email, Discord vs Instagram's Telegram-only

### **Target Integration Goals**
- **Telegram Integration**: Add Telegram sending capabilities similar to Instagram
- **Manual Sending**: Individual media item sending via UI buttons
- **Automatic Sending**: Scheduled/triggered sending for new content
- **Progress Tracking**: Real-time status updates for Telegram operations
- **Status Management**: Success/error state tracking per media item

---

## 🎨 Frontend Architecture

### **Core Components**

#### **1. Main Application Component (`App.tsx`)**
**Purpose**: Central orchestrator for all user interactions and state management

**State Management**:
```typescript
// Core download state
const [username, setUsername] = useState('')
const [mediaType, setMediaType] = useState<'stories' | 'highlights' | 'spotlights'>('stories')
const [loading, setLoading] = useState(false)
const [error, setError] = useState<string | null>(null)
const [items, setItems] = useState<DownloadItem[]>([])

// Telegram functionality
const [autoSendToTelegram, setAutoSendToTelegram] = useState(true)
const [sendingStatus, setSendingStatus] = useState<{ [key: number]: 'idle' | 'sending' | 'success' | 'error' }>({})
const [telegramErrors, setTelegramErrors] = useState<{ [key: number]: string }>({})

// Target management
const [currentTarget, setCurrentTarget] = useState<string>('')
const [newTarget, setNewTarget] = useState<string>('')
const [targetLoading, setTargetLoading] = useState(false)
const [targetError, setTargetError] = useState<string | null>(null)

// Polling management
const [pollingStatus, setPollingStatus] = useState<{
  enabled: boolean
  active: boolean
  started: boolean
}>({ enabled: false, active: false, started: false })
```

#### **2. Username Processing & Validation**
**Function**: `cleanSnapchatUsername(inputUsername: string)`
- **Purpose**: Validates and cleans Snapchat usernames
- **Logic**: Removes @ symbols and validates format
- **Fallback**: Returns original input if validation fails

**Function**: `isValidSnapchatUsername` (useMemo)
- **Purpose**: Real-time username validation
- **Regex Pattern**: `/^[a-zA-Z0-9._-]{3,15}$/`
- **Triggers**: Re-evaluates when username state changes

#### **3. Target Management System**
**Function**: `fetchCurrentTarget()`
- **Endpoint**: `GET /target`
- **Purpose**: Retrieves current tracking target and polling status
- **Real-time Updates**: Called every 3 seconds via `useEffect`
- **Response Mapping**:
  ```typescript
  setCurrentTarget(data.current_target || '')
  setPollingStatus({
    enabled: data.polling_enabled || false,
    active: data.polling_active || false,
    started: data.polling_started || false
  })
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
- **Purpose**: Clears both processed media and cache for current target
- **Confirmation**: User confirmation dialog with target username
- **Response Handling**: Shows detailed deletion counts
- **Error States**: Network errors and backend failures

#### **5. Polling Control System**
**Function**: `startPolling()`
- **Endpoint**: `POST /start-polling`
- **Purpose**: Initiates automatic polling for new content
- **Success Flow**: Shows success message and refreshes status
- **Error Handling**: Displays backend error messages

**Function**: `stopPolling()`
- **Endpoint**: `POST /stop-polling`
- **Purpose**: Stops automatic polling
- **Success Flow**: Shows success message and refreshes status

**Function**: `triggerManualPoll()`
- **Endpoint**: `POST /targets/{username}/poll-now`
- **Purpose**: Triggers immediate manual poll
- **Force Parameter**: Bypasses normal polling intervals

#### **6. Download Processing System**
**Function**: `fetchDownloads(username: string, mediaType: string)`
- **Endpoint**: `POST /download`
- **Purpose**: Processes Snapchat usernames and retrieves downloadable content
- **Response Processing**:
  - **Stories**: Direct mapping of story items
  - **Highlights**: Deduplication of highlight variants
  - **Spotlights**: Direct mapping of spotlight items
- **Quality Selection Logic**:
  ```typescript
  // Sort by quality preference (if multiple variants exist)
  if (qualityA.includes('HD') && !qualityB.includes('HD')) return -1
  if (qualityB.includes('HD') && !qualityA.includes('HD')) return 1
  if (qualityA.includes('SD') && !qualityB.includes('SD')) return -1
  if (qualityB.includes('SD') && !qualityA.includes('SD')) return 1
  ```

#### **7. Telegram Integration (Frontend)**
**Function**: `sendToTelegram(itemIndex: number, mediaUrl: string, username?: string)`
- **Endpoint**: `POST /send-to-telegram`
- **Purpose**: Manual sending of individual items to Telegram
- **Dynamic Caption Generation**:
  ```typescript
  caption: `✨ New ${mediaType} from @${username || currentTarget || 'User not found'}! 📱\n\n📱 Snapchat: @${username || currentTarget || 'User not found'}`
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
- **Input Field**: Accepts username format
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
- **Username Input**: Validates and cleans Snapchat usernames
- **Media Type Selector**: Dropdown for stories/highlights/spotlights
- **Submit Button**: Triggers download processing
- **Loading States**: Shows processing status
- **Error Display**: Shows validation and processing errors

#### **5. Results Grid**
- **Card Layout**: Individual cards for each download item
- **Thumbnail Display**: Shows media previews
- **Media Type Information**: Displays content type
- **Download Link**: Direct download or progress API link
- **Telegram Button**: Manual send to Telegram with status feedback

---

## 🔄 Architecture Comparison

### **Instagram vs Snapchat Architecture**

| Feature | Instagram Service | Snapchat Service | Adaptation Required |
|---------|------------------|------------------|-------------------|
| **Framework** | Express.js (Node.js) | FastAPI (Python) | ✅ Direct mapping |
| **Database** | SQLite | File-based JSON | 🔄 Add SQLite support |
| **Real-time** | Polling (3s intervals) | WebSocket | ✅ Keep WebSocket |
| **Media Types** | Posts, Reels, Stories | Stories, Highlights, Spotlights | ✅ Direct mapping |
| **Telegram** | ✅ Implemented | ❌ Missing | 🎯 Primary goal |
| **Polling** | ✅ Automatic | ❌ Missing | 🎯 Add polling system |
| **Status Tracking** | ✅ Per-item | ✅ Per-item | ✅ Direct mapping |

### **Key Differences to Address**
1. **Database**: Snapchat uses file-based metadata, need SQLite for consistency
2. **Polling**: Snapchat lacks automatic polling system
3. **Telegram**: Snapchat has no Telegram integration
4. **Target Management**: Snapchat lacks user targeting system

---

## 🎯 Implementation Strategy

### **Phase 1: Core Infrastructure**
1. **Database Migration**: Add SQLite support alongside file-based metadata
2. **Target Management**: Implement user targeting system
3. **Telegram Core**: Add Telegram bot integration

### **Phase 2: Manual Operations**
1. **Manual Send Endpoint**: Individual media sending
2. **Frontend Integration**: Send buttons and status tracking
3. **Progress Tracking**: Real-time status updates

### **Phase 3: Automatic Operations**
1. **Polling System**: Automatic content monitoring
2. **Scheduled Sending**: Automatic Telegram distribution
3. **Activity Tracking**: Smart polling intervals

### **Phase 4: Advanced Features**
1. **Bulk Operations**: Multiple media sending
2. **Advanced Filtering**: Content type filtering
3. **Analytics**: Sending statistics and monitoring

---

## ⚙️ Backend Architecture

### **Core Server Setup**

#### **1. FastAPI Application**
- **Framework**: FastAPI with async/await support
- **Middleware**: CORS, JSON parsing, static file serving
- **Port Configuration**: Environment variable `PORT` (default: 8000)
- **Error Handling**: Global exception handlers and request logging
- **WebSocket Support**: Built-in WebSocket management for real-time updates

#### **2. Database Layer (SQLite)**
**Database File**: `snapchat_telegram.db`

**Tables**:
```sql
-- Processed media tracking
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

-- Recent media cache
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

-- Target users management
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

### **Core Processing Functions**

#### **1. Snapchat Media Processing (`processSnapchatMedia`)**
**Purpose**: Main function for processing Snapchat content and sending to Telegram

**Parameters**:
- `username`: Snapchat username
- `media_type`: 'stories', 'highlights', 'spotlights'
- `send_to_telegram`: Boolean flag for Telegram integration
- `progress_callback`: Optional callback for progress updates

**Processing Flow**:
1. **Username Validation**: Validates Snapchat username format
2. **Content Fetching**: Fetches media from Snapchat Web API
3. **Media Download**: Downloads media files to local storage
4. **Telegram Integration**: Sends to Telegram if enabled
5. **Metadata Update**: Updates database with processing results

---

## ⚙️ Backend Implementation

### **1. Database Schema (SQLite)**

#### **Processed Media Table**
```sql
CREATE TABLE processed_media (
  id TEXT PRIMARY KEY,                    -- Media ID (snap_id)
  username TEXT NOT NULL,                 -- Snapchat username
  media_url TEXT NOT NULL,                -- Original media URL
  media_type TEXT NOT NULL,               -- 'stories', 'highlights', 'spotlights'
  file_path TEXT NOT NULL,                -- Local file path
  is_sent_to_telegram BOOLEAN DEFAULT FALSE, -- Telegram sending status
  telegram_sent_at DATETIME,              -- When sent to Telegram
  telegram_message_id TEXT,               -- Telegram message ID
  processed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### **Target Users Table**
```sql
CREATE TABLE target_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,          -- Snapchat username
  is_active BOOLEAN DEFAULT TRUE,         -- Active monitoring
  polling_enabled BOOLEAN DEFAULT FALSE,  -- Automatic polling
  polling_interval INTEGER DEFAULT 30,    -- Polling interval (minutes)
  last_polled DATETIME,                   -- Last poll timestamp
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### **Telegram Sending Log**
```sql
CREATE TABLE telegram_sending_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  media_id TEXT NOT NULL,                 -- Reference to processed_media
  username TEXT NOT NULL,                 -- Snapchat username
  media_type TEXT NOT NULL,               -- Media type
  telegram_chat_id TEXT NOT NULL,         -- Telegram chat ID
  telegram_message_id TEXT,               -- Telegram message ID
  caption TEXT,                           -- Sent caption
  status TEXT NOT NULL,                   -- 'success', 'error', 'pending'
  error_message TEXT,                     -- Error details if failed
  sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (media_id) REFERENCES processed_media(id)
);
```

### **2. Core Telegram Integration Class**

#### **TelegramManager Class**
```python
class TelegramManager:
    def __init__(self, bot_token: str, channel_id: str):
        self.bot_token = bot_token
        self.channel_id = channel_id
        self.base_url = f"https://api.telegram.org/bot{bot_token}"
        self.session = aiohttp.ClientSession()
    
    async def send_photo(self, photo_path: str, caption: str) -> dict:
        """Send photo to Telegram channel"""
        # Implementation similar to Instagram's sendPhotoToTelegram
    
    async def send_video(self, video_path: str, caption: str) -> dict:
        """Send video to Telegram channel"""
        # Implementation similar to Instagram's sendVideoToTelegram
    
    async def validate_connection(self) -> bool:
        """Validate bot token and channel access"""
        # Implementation for connection testing
```

### **3. Enhanced SnapchatDL Class**

#### **Telegram Integration Methods**
```python
class SnapchatDL:
    def __init__(self, telegram_manager: TelegramManager = None):
        # Existing initialization
        self.telegram_manager = telegram_manager
    
    async def download_with_telegram(
        self, 
        username: str, 
        media_type: str, 
        send_to_telegram: bool = False,
        progress_callback: Optional[Callable] = None
    ):
        """Download media with optional Telegram sending"""
        # Enhanced download method with Telegram integration
    
    async def send_media_to_telegram(
        self, 
        username: str, 
        media_type: str, 
        media_files: List[str],
        caption_template: str = None
    ):
        """Send specific media files to Telegram"""
        # Manual sending method
```

### **4. Target Management System**

#### **TargetManager Class**
```python
class TargetManager:
    def __init__(self, db_path: str):
        self.db_path = db_path
        self.db = DatabaseManager(db_path)
    
    async def add_target(self, username: str) -> bool:
        """Add new target user"""
    
    async def remove_target(self, username: str) -> bool:
        """Remove target user"""
    
    async def get_targets(self) -> List[dict]:
        """Get all target users"""
    
    async def update_polling_status(self, username: str, enabled: bool) -> bool:
        """Update polling status for target"""
```

---

## 🎨 Frontend Integration

### **1. Enhanced Gallery Component**

#### **Telegram Send Button**
```typescript
interface GalleryMediaItem {
  filename: string;
  type: string;
  thumbnail_url: string;
  download_status: string;
  progress: number;
  download_url: string;
  telegram_status: 'not_sent' | 'sending' | 'sent' | 'error';
  telegram_error?: string;
}

// Telegram send button component
const TelegramSendButton: React.FC<{
  mediaItem: GalleryMediaItem;
  username: string;
  mediaType: string;
  onStatusChange: (status: string) => void;
}> = ({ mediaItem, username, mediaType, onStatusChange }) => {
  const [sending, setSending] = useState(false);
  
  const handleSendToTelegram = async () => {
    setSending(true);
    try {
      const response = await fetch('/send-to-telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          mediaType,
          mediaFiles: [mediaItem.filename],
          caption: `✨ New ${mediaItem.type} from @${username}! 📱`
        })
      });
      
      if (response.ok) {
        onStatusChange('sent');
      } else {
        onStatusChange('error');
      }
    } catch (error) {
      onStatusChange('error');
    } finally {
      setSending(false);
    }
  };
  
  return (
    <button 
      onClick={handleSendToTelegram}
      disabled={sending || mediaItem.telegram_status === 'sent'}
      className={`telegram-button ${mediaItem.telegram_status}`}
    >
      {sending ? '📤 Sending...' : 
       mediaItem.telegram_status === 'sent' ? '✅ Sent!' :
       mediaItem.telegram_status === 'error' ? '❌ Failed' :
       '📤 Send to Telegram'}
    </button>
  );
};
```

### **2. Target Management UI**

#### **Target Management Component**
```typescript
const TargetManagement: React.FC = () => {
  const [targets, setTargets] = useState<TargetUser[]>([]);
  const [newTarget, setNewTarget] = useState('');
  const [showAddTarget, setShowAddTarget] = useState(false);
  
  const addTarget = async (username: string) => {
    const response = await fetch('/targets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username })
    });
    
    if (response.ok) {
      await fetchTargets();
      setShowAddTarget(false);
    }
  };
  
  const togglePolling = async (username: string, enabled: boolean) => {
    await fetch(`/targets/${username}/polling`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled })
    });
    await fetchTargets();
  };
  
  return (
    <div className="target-management">
      <h3>Target Users</h3>
      <button onClick={() => setShowAddTarget(true)}>Add Target</button>
      
      {targets.map(target => (
        <div key={target.username} className="target-item">
          <span>@{target.username}</span>
          <label>
            <input
              type="checkbox"
              checked={target.polling_enabled}
              onChange={(e) => togglePolling(target.username, e.target.checked)}
            />
            Auto Polling
          </label>
          <button onClick={() => triggerManualPoll(target.username)}>
            Manual Poll
          </button>
        </div>
      ))}
      
      {showAddTarget && (
        <AddTargetModal
          onAdd={addTarget}
          onClose={() => setShowAddTarget(false)}
        />
      )}
    </div>
  );
};
```

### **3. Real-time Status Updates**

#### **WebSocket Integration**
```typescript
const useTelegramStatus = (username: string, mediaType: string) => {
  const [telegramStatus, setTelegramStatus] = useState<Record<string, string>>({});
  
  useEffect(() => {
    const ws = new WebSocket(`ws://localhost:8000/ws/telegram/${username}/${mediaType}`);
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'telegram_status_update') {
        setTelegramStatus(prev => ({
          ...prev,
          [data.filename]: data.status
        }));
      }
    };
    
    return () => ws.close();
  }, [username, mediaType]);
  
  return telegramStatus;
};
```

---

## 🔄 Data Flow & Processing

### **Manual Download Flow**

#### **1. User Input Processing**
```
Username Input → Validation → API Request → Content Fetching → Download → Telegram (Optional)
```

**Steps**:
1. User enters Snapchat username and selects media type
2. Frontend validates username format
3. Backend receives request and validates input
4. SnapchatDL fetches content from Snapchat Web API
5. Media files are downloaded to local storage
6. Optional: Content is sent to Telegram
7. Response is returned to frontend with download links

#### **2. Content Processing Pipeline**
```
Snapchat API → Media Extraction → Quality Selection → Download → Metadata Update
```

**Steps**:
1. Backend calls Snapchat Web API for user content
2. Extracts media URLs and metadata
3. Selects optimal quality variants
4. Downloads files using ThreadPoolExecutor
5. Updates metadata with download results
6. Returns processed data to frontend

### **Automatic Polling Flow**

#### **1. Polling Trigger**
```
Scheduler → Target Check → Content Comparison → New Media Detection
```

**Steps**:
1. APScheduler triggers poll based on interval
2. System checks target user's content
3. Compares with cached media metadata
4. Identifies new content for processing

#### **2. Batch Processing**
```
New Media → Snapchat API → Media Items → Telegram (Auto) → Cache Update
```

**Steps**:
1. Backend processes new media via Snapchat API
2. Extracts individual media items
3. Sends each item to Telegram automatically
4. Updates cache with processed media

#### **3. Activity Tracking**
```
Processed Media → Activity Update → Interval Adjustment → Next Poll
```

**Steps**:
1. Backend updates activity tracker with new media count
2. Adjusts polling interval based on activity
3. Schedules next poll with smart timing
4. Continues polling cycle

---

## 🔌 API Endpoints

### **1. Telegram Integration Endpoints**

#### **Manual Send Endpoint**
```python
@app.post("/send-to-telegram", response_model=SendTelegramResponse)
async def send_to_telegram(request: SendTelegramRequest):
    """
    Send media files to Telegram channel
    
    Parameters:
    - username: Snapchat username
    - media_type: 'stories', 'highlights', 'spotlights'
    - media_files: List of filenames to send
    - caption: Optional custom caption
    """
    try:
        # Validate inputs
        if request.media_type not in ["stories", "highlights", "spotlights"]:
            raise HTTPException(status_code=400, detail="Invalid media type")
        
        # Get media directory
        media_dir = os.path.join(DOWNLOADS_DIR, request.username, request.media_type)
        if not os.path.exists(media_dir):
            raise HTTPException(status_code=404, detail="Media directory not found")
        
        sent_files = []
        failed_files = []
        
        # Send each file to Telegram
        for filename in request.media_files:
            file_path = os.path.join(media_dir, filename)
            if not os.path.exists(file_path):
                failed_files.append(filename)
                continue
            
            try:
                # Generate caption
                caption = request.caption or f"✨ New media from @{request.username}! 📱"
                
                # Send to Telegram
                if filename.lower().endswith(('.mp4', '.mov', '.avi')):
                    result = await telegram_manager.send_video(file_path, caption)
                else:
                    result = await telegram_manager.send_photo(file_path, caption)
                
                # Log success
                await log_telegram_send(
                    username=request.username,
                    media_type=request.media_type,
                    filename=filename,
                    telegram_message_id=result.get('message_id'),
                    status='success'
                )
                
                sent_files.append(filename)
                
            except Exception as e:
                logger.error(f"Failed to send {filename} to Telegram: {e}")
                await log_telegram_send(
                    username=request.username,
                    media_type=request.media_type,
                    filename=filename,
                    status='error',
                    error_message=str(e)
                )
                failed_files.append(filename)
        
        # Return response
        if sent_files and not failed_files:
            return SendTelegramResponse(
                status="success",
                message=f"Successfully sent {len(sent_files)} files to Telegram",
                sent_files=sent_files
            )
        elif sent_files and failed_files:
            return SendTelegramResponse(
                status="partial",
                message=f"Sent {len(sent_files)} files, failed to send {len(failed_files)} files",
                sent_files=sent_files,
                failed_files=failed_files
            )
        else:
            return SendTelegramResponse(
                status="error",
                message="Failed to send any files",
                failed_files=failed_files
            )
            
    except Exception as e:
        logger.error(f"Error in send_to_telegram: {e}")
        raise HTTPException(status_code=500, detail=str(e))
```

#### **Target Management Endpoints**
```python
@app.get("/targets", response_model=List[TargetUser])
async def get_targets():
    """Get all target users"""
    return await target_manager.get_targets()

@app.post("/targets", response_model=TargetUser)
async def add_target(request: AddTargetRequest):
    """Add new target user"""
    success = await target_manager.add_target(request.username)
    if not success:
        raise HTTPException(status_code=400, detail="Failed to add target")
    return await target_manager.get_target(request.username)

@app.put("/targets/{username}/polling")
async def update_polling_status(username: str, request: UpdatePollingRequest):
    """Update polling status for target"""
    success = await target_manager.update_polling_status(username, request.enabled)
    if not success:
        raise HTTPException(status_code=400, detail="Failed to update polling status")
    return {"status": "success"}

@app.post("/targets/{username}/poll-now")
async def trigger_manual_poll(username: str):
    """Trigger immediate manual poll for target"""
    # Implementation for manual polling
```

### **2. Enhanced Download Endpoints**

#### **Download with Telegram Option**
```python
@app.post("/download", response_model=DownloadResponse)
async def download_content(request: DownloadRequest, background_tasks: BackgroundTasks):
    """
    Enhanced download endpoint with Telegram integration
    """
    try:
        snapchat = SnapchatDL(
            directory_prefix=DOWNLOADS_DIR,
            telegram_manager=telegram_manager if request.send_to_telegram else None
        )
        
        key = f"{request.username}:{request.download_type}"
        
        # Initialize progress data
        with progress_lock:
            progress_data[key] = {
                "status": "fetching",
                "progress": 0,
                "total": 0,
                "downloaded": 0,
                "telegram_sent": 0,
                "message": f"Starting download for {request.username}"
            }
            file_progress[key] = {}

        async def progress_callback(ws_message):
            try:
                with progress_lock:
                    # Update progress data
                    if "overall" in ws_message:
                        progress_data[key].update(ws_message["overall"])
                    
                    if "files" in ws_message:
                        file_progress[key].update(ws_message["files"])
                    
                    # Broadcast via WebSocket
                    await websocket_manager.broadcast(key, {
                        "overall": progress_data[key],
                        "files": file_progress[key]
                    })
            except Exception as e:
                logger.error(f"Error in progress callback: {e}")

        # Start download with Telegram integration
        if request.download_type == "stories":
            background_tasks.add_task(
                snapchat.download_with_telegram,
                request.username,
                "stories",
                request.send_to_telegram,
                progress_callback
            )
        elif request.download_type == "highlights":
            background_tasks.add_task(
                snapchat.download_with_telegram,
                request.username,
                "highlights",
                request.send_to_telegram,
                progress_callback
            )
        elif request.download_type == "spotlights":
            background_tasks.add_task(
                snapchat.download_with_telegram,
                request.username,
                "spotlights",
                request.send_to_telegram,
                progress_callback
            )
        
        return DownloadResponse(
            status="success",
            message=f"Download started for {request.username} ({request.download_type})"
        )
        
    except Exception as e:
        logger.error(f"Error in download_content: {e}")
        raise HTTPException(status_code=500, detail=str(e))
```

---

## 📱 Telegram Integration Details

### **1. Telegram API Functions**

#### **Photo Sending**
```python
async def send_photo_to_telegram(self, photo_path: str, caption: str) -> dict:
    """Send photo to Telegram channel"""
    try:
        # Prepare form data
        data = aiohttp.FormData()
        data.add_field('chat_id', self.channel_id)
        data.add_field('caption', caption)
        data.add_field('parse_mode', 'HTML')
        
        # Add photo file
        with open(photo_path, 'rb') as f:
            data.add_field('photo', f.read(), filename=os.path.basename(photo_path))
        
        # Send request
        async with self.session.post(f"{self.base_url}/sendPhoto", data=data) as response:
            if response.status == 200:
                result = await response.json()
                logger.info(f"✅ Photo sent to Telegram: {os.path.basename(photo_path)}")
                return result
            else:
                error_text = await response.text()
                logger.error(f"❌ Failed to send photo: {response.status} - {error_text}")
                raise Exception(f"Telegram API error: {error_text}")
                
    except Exception as e:
        logger.error(f"Error sending photo to Telegram: {e}")
        raise
```

#### **Video Sending**
```python
async def send_video_to_telegram(self, video_path: str, caption: str) -> dict:
    """Send video to Telegram channel"""
    try:
        # Check file size (Telegram limit: 50MB)
        file_size = os.path.getsize(video_path)
        if file_size > 50 * 1024 * 1024:  # 50MB
            raise Exception(f"Video file too large: {file_size} bytes")
        
        # Prepare form data
        data = aiohttp.FormData()
        data.add_field('chat_id', self.channel_id)
        data.add_field('caption', caption)
        data.add_field('parse_mode', 'HTML')
        
        # Add video file
        with open(video_path, 'rb') as f:
            data.add_field('video', f.read(), filename=os.path.basename(video_path))
        
        # Send request
        async with self.session.post(f"{self.base_url}/sendVideo", data=data) as response:
            if response.status == 200:
                result = await response.json()
                logger.info(f"✅ Video sent to Telegram: {os.path.basename(video_path)}")
                return result
            else:
                error_text = await response.text()
                logger.error(f"❌ Failed to send video: {response.status} - {error_text}")
                raise Exception(f"Telegram API error: {error_text}")
                
    except Exception as e:
        logger.error(f"Error sending video to Telegram: {e}")
        raise
```

### **2. Caption Generation**

#### **Dynamic Caption Templates**
```python
def generate_telegram_caption(
    username: str,
    media_type: str,
    custom_caption: str = None,
    include_link: bool = True
) -> str:
    """Generate Telegram caption for Snapchat media"""
    
    base_caption = custom_caption or f"✨ New {media_type} from @{username}! 📱"
    
    if include_link:
        # Note: Snapchat doesn't have direct profile links like Instagram
        # Could link to Snapchat web profile or use different approach
        base_caption += f"\n\n📱 Snapchat: @{username}"
    
    return base_caption

def generate_bulk_caption(
    username: str,
    media_type: str,
    file_count: int
) -> str:
    """Generate caption for bulk media sending"""
    return f"📸 {file_count} new {media_type} from @{username}! 📱\n\n✨ Snapchat: @{username}"
```

### **3. Rate Limiting and Error Handling**

#### **Rate Limiting Implementation**
```python
class TelegramRateLimiter:
    def __init__(self, max_requests_per_second: int = 1):
        self.max_requests = max_requests_per_second
        self.last_request_time = 0
        self.lock = asyncio.Lock()
    
    async def wait_if_needed(self):
        """Wait if rate limit would be exceeded"""
        async with self.lock:
            current_time = time.time()
            time_since_last = current_time - self.last_request_time
            min_interval = 1.0 / self.max_requests
            
            if time_since_last < min_interval:
                wait_time = min_interval - time_since_last
                await asyncio.sleep(wait_time)
            
            self.last_request_time = time.time()

# Usage in TelegramManager
async def send_photo_to_telegram(self, photo_path: str, caption: str) -> dict:
    await self.rate_limiter.wait_if_needed()
    # ... rest of implementation
```

---

## 🔄 Polling System

### **1. Automatic Polling Implementation**

#### **Polling Manager Class**
```python
class SnapchatPollingManager:
    def __init__(self, target_manager: TargetManager, snapchat_dl: SnapchatDL):
        self.target_manager = target_manager
        self.snapchat_dl = snapchat_dl
        self.scheduler = AsyncIOScheduler()
        self.active_polls = {}
    
    async def start_polling_for_user(self, username: str, interval_minutes: int = 30):
        """Start automatic polling for a user"""
        job_id = f"snapchat_poll_{username}"
        
        async def poll_job():
            try:
                logger.info(f"🔄 [AUTO] Starting poll for @{username}")
                
                # Check for new stories
                await self.check_for_new_content(username, "stories")
                
                # Check for new highlights
                await self.check_for_new_content(username, "highlights")
                
                # Check for new spotlights
                await self.check_for_new_content(username, "spotlights")
                
                logger.info(f"✅ [AUTO] Completed poll for @{username}")
                
            except Exception as e:
                logger.error(f"❌ [AUTO] Error polling @{username}: {e}")
        
        # Schedule the job
        self.scheduler.add_job(
            poll_job,
            trigger=IntervalTrigger(minutes=interval_minutes),
            id=job_id,
            replace_existing=True
        )
        
        self.active_polls[username] = {
            "job_id": job_id,
            "interval": interval_minutes,
            "last_poll": None
        }
        
        # Update database
        await self.target_manager.update_polling_status(username, True)
        
        logger.info(f"🚀 [AUTO] Started polling for @{username} every {interval_minutes} minutes")
    
    async def stop_polling_for_user(self, username: str):
        """Stop automatic polling for a user"""
        if username in self.active_polls:
            job_id = self.active_polls[username]["job_id"]
            self.scheduler.remove_job(job_id)
            del self.active_polls[username]
            
            # Update database
            await self.target_manager.update_polling_status(username, False)
            
            logger.info(f"🛑 [AUTO] Stopped polling for @{username}")
    
    async def check_for_new_content(self, username: str, media_type: str):
        """Check for new content and send to Telegram if enabled"""
        try:
            # Get existing media metadata
            existing_media = self.snapchat_dl._load_media_metadata(username, media_type)
            existing_ids = {item.get("snap_id") for item in existing_media}
            
            # Fetch new content
            if media_type == "stories":
                new_content = []
                async for story, user_info in self.snapchat_dl._web_fetch_story(username):
                    snap_id = story["snapId"]["value"]
                    if snap_id not in existing_ids:
                        new_content.append((story, user_info))
            elif media_type == "highlights":
                # Implementation for highlights
                pass
            elif media_type == "spotlights":
                # Implementation for spotlights
                pass
            
            # Process new content
            if new_content:
                logger.info(f"📱 [AUTO] Found {len(new_content)} new {media_type} for @{username}")
                
                # Download and send to Telegram
                await self.process_new_content(username, media_type, new_content)
            else:
                logger.info(f"📱 [AUTO] No new {media_type} found for @{username}")
                
        except Exception as e:
            logger.error(f"❌ [AUTO] Error checking {media_type} for @{username}: {e}")
    
    async def process_new_content(self, username: str, media_type: str, new_content: List):
        """Process new content and send to Telegram"""
        try:
            # Download new content
            downloaded_files = []
            
            for content_item in new_content:
                # Download logic here
                # Similar to existing download methods but with Telegram integration
                pass
            
            # Send to Telegram if files were downloaded
            if downloaded_files:
                await self.send_new_content_to_telegram(username, media_type, downloaded_files)
                
        except Exception as e:
            logger.error(f"❌ [AUTO] Error processing new content for @{username}: {e}")
    
    async def send_new_content_to_telegram(self, username: str, media_type: str, files: List[str]):
        """Send new content to Telegram automatically"""
        try:
            caption = f"✨ New {media_type} from @{username}! 📱\n\n📱 Snapchat: @{username}"
            
            for filename in files:
                try:
                    file_path = os.path.join(DOWNLOADS_DIR, username, media_type, filename)
                    
                    if filename.lower().endswith(('.mp4', '.mov', '.avi')):
                        await self.telegram_manager.send_video(file_path, caption)
                    else:
                        await self.telegram_manager.send_photo(file_path, caption)
                    
                    # Log success
                    await log_telegram_send(
                        username=username,
                        media_type=media_type,
                        filename=filename,
                        status='success',
                        is_automatic=True
                    )
                    
                    logger.info(f"📤 [AUTO] Sent {filename} to Telegram")
                    
                    # Rate limiting
                    await asyncio.sleep(1)
                    
                except Exception as e:
                    logger.error(f"❌ [AUTO] Failed to send {filename} to Telegram: {e}")
                    await log_telegram_send(
                        username=username,
                        media_type=media_type,
                        filename=filename,
                        status='error',
                        error_message=str(e),
                        is_automatic=True
                    )
                    
        except Exception as e:
            logger.error(f"❌ [AUTO] Error sending new content to Telegram: {e}")
```

### **2. Manual Polling Endpoint**

#### **Manual Poll Implementation**
```python
@app.post("/targets/{username}/poll-now")
async def trigger_manual_poll(username: str, background_tasks: BackgroundTasks):
    """Trigger immediate manual poll for target"""
    try:
        # Check if user exists
        target = await target_manager.get_target(username)
        if not target:
            raise HTTPException(status_code=404, detail="Target user not found")
        
        async def manual_poll_job():
            try:
                logger.info(f"🔄 [MANUAL] Starting manual poll for @{username}")
                
                # Check for new content
                await polling_manager.check_for_new_content(username, "stories")
                await polling_manager.check_for_new_content(username, "highlights")
                await polling_manager.check_for_new_content(username, "spotlights")
                
                logger.info(f"✅ [MANUAL] Completed manual poll for @{username}")
                
            except Exception as e:
                logger.error(f"❌ [MANUAL] Error in manual poll for @{username}: {e}")
        
        # Start manual poll in background
        background_tasks.add_task(manual_poll_job)
        
        return {
            "status": "success",
            "message": f"Manual poll triggered for @{username}"
        }
        
    except Exception as e:
        logger.error(f"Error triggering manual poll: {e}")
        raise HTTPException(status_code=500, detail=str(e))
```

---

## 📊 Progress Tracking

### **1. Enhanced Progress Callback**

#### **Telegram Progress Integration**
```python
def _create_telegram_progress_callback(self, username: str, media_type: str, filename: str, progress_callback):
    """Create progress callback with Telegram status tracking"""
    
    async def callback(progress=None, telegram_status=None):
        try:
            # Update file progress
            if progress is not None:
                self._update_media_metadata(username, media_type, filename, "in_progress", progress)
            
            # Update Telegram status if provided
            if telegram_status:
                self._update_telegram_status(username, media_type, filename, telegram_status)
            
            # Prepare WebSocket message
            ws_message = {
                "files": {
                    filename: {
                        "status": "in_progress",
                        "progress": progress or 0,
                        "telegram_status": telegram_status or "not_sent"
                    }
                }
            }
            
            # Send progress update
            if progress_callback:
                await progress_callback(ws_message)
                
        except Exception as e:
            logger.error(f"Error in telegram progress callback: {e}")
    
    return callback
```

### **2. Real-time Status Updates**

#### **WebSocket Telegram Status**
```python
@app.websocket("/ws/telegram/{username}/{media_type}")
async def telegram_status_websocket(websocket: WebSocket, username: str, media_type: str):
    """WebSocket for real-time Telegram sending status"""
    key = f"telegram_{username}_{media_type}"
    
    try:
        await websocket_manager.connect(websocket, key)
        
        while True:
            try:
                # Keep connection alive
                data = await websocket.receive_text()
                
            except WebSocketDisconnect:
                await websocket_manager.disconnect(websocket, key)
                break
            except Exception as e:
                logger.error(f"Error in Telegram WebSocket: {e}")
                break
                
    except Exception as e:
        logger.error(f"Error setting up Telegram WebSocket: {e}")
        try:
            await websocket.close()
        except:
            pass
```

---

## 🛡️ Error Handling

### **1. Telegram Error Handling**

#### **Comprehensive Error Management**
```python
class TelegramErrorHandler:
    @staticmethod
    async def handle_telegram_error(error: Exception, context: dict) -> dict:
        """Handle Telegram API errors with appropriate responses"""
        
        error_message = str(error)
        
        # Categorize errors
        if "bot was blocked" in error_message.lower():
            return {
                "status": "error",
                "type": "bot_blocked",
                "message": "Bot was blocked by the user",
                "retry": False
            }
        elif "chat not found" in error_message.lower():
            return {
                "status": "error",
                "type": "chat_not_found",
                "message": "Telegram chat not found",
                "retry": False
            }
        elif "file too large" in error_message.lower():
            return {
                "status": "error",
                "type": "file_too_large",
                "message": "File exceeds Telegram size limit (50MB)",
                "retry": False
            }
        elif "rate limit" in error_message.lower():
            return {
                "status": "error",
                "type": "rate_limit",
                "message": "Rate limit exceeded, will retry",
                "retry": True,
                "retry_delay": 60
            }
        else:
            return {
                "status": "error",
                "type": "unknown",
                "message": f"Unknown error: {error_message}",
                "retry": True,
                "retry_delay": 30
            }
```

### **2. Retry Logic**

#### **Exponential Backoff Retry**
```python
async def send_with_retry(self, send_func, *args, max_retries: int = 3):
    """Send to Telegram with exponential backoff retry"""
    
    for attempt in range(max_retries):
        try:
            return await send_func(*args)
            
        except Exception as e:
            error_info = await TelegramErrorHandler.handle_telegram_error(e, {
                "attempt": attempt + 1,
                "max_retries": max_retries
            })
            
            if not error_info["retry"] or attempt == max_retries - 1:
                raise Exception(error_info["message"])
            
            # Wait before retry
            wait_time = error_info.get("retry_delay", 2 ** attempt)
            logger.warning(f"Retrying in {wait_time} seconds (attempt {attempt + 1}/{max_retries})")
            await asyncio.sleep(wait_time)
```

---

## ⚙️ Configuration

### **1. Environment Variables**

#### **Required Configuration**
```bash
# Telegram Configuration
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_CHANNEL_ID=-1001234567890

# Database Configuration
SNAPCHAT_DB_PATH=snapchat_telegram.db

# Polling Configuration
DEFAULT_POLLING_INTERVAL=30
MAX_POLLING_INTERVAL=120
MIN_POLLING_INTERVAL=15

# Rate Limiting
TELEGRAM_RATE_LIMIT=1
TELEGRAM_RETRY_ATTEMPTS=3

# File Size Limits
MAX_VIDEO_SIZE=52428800  # 50MB in bytes
MAX_PHOTO_SIZE=10485760  # 10MB in bytes
```

### **2. Configuration Validation**

#### **Startup Validation**
```python
async def validate_telegram_config():
    """Validate Telegram configuration on startup"""
    
    # Check required environment variables
    bot_token = os.getenv("TELEGRAM_BOT_TOKEN")
    channel_id = os.getenv("TELEGRAM_CHANNEL_ID")
    
    if not bot_token:
        logger.error("❌ TELEGRAM_BOT_TOKEN not configured")
        return False
    
    if not channel_id:
        logger.error("❌ TELEGRAM_CHANNEL_ID not configured")
        return False
    
    # Validate channel ID format
    if not channel_id.startswith('-100'):
        logger.error("❌ TELEGRAM_CHANNEL_ID must start with -100 for channels")
        return False
    
    # Test Telegram connection
    try:
        telegram_manager = TelegramManager(bot_token, channel_id)
        await telegram_manager.validate_connection()
        logger.info("✅ Telegram configuration validated successfully")
        return True
        
    except Exception as e:
        logger.error(f"❌ Telegram configuration validation failed: {e}")
        return False
```

---

## 🧪 Testing Strategy

### **1. Unit Tests**

#### **Telegram Integration Tests**
```python
import pytest
from unittest.mock import Mock, patch

class TestTelegramManager:
    @pytest.fixture
    def telegram_manager(self):
        return TelegramManager("test_token", "-1001234567890")
    
    @pytest.mark.asyncio
    async def test_send_photo_success(self, telegram_manager):
        with patch('aiohttp.ClientSession.post') as mock_post:
            mock_response = Mock()
            mock_response.status = 200
            mock_response.json.return_value = {"message_id": 123}
            mock_post.return_value.__aenter__.return_value = mock_response
            
            result = await telegram_manager.send_photo("test.jpg", "Test caption")
            
            assert result["message_id"] == 123
    
    @pytest.mark.asyncio
    async def test_send_photo_error(self, telegram_manager):
        with patch('aiohttp.ClientSession.post') as mock_post:
            mock_response = Mock()
            mock_response.status = 400
            mock_response.text.return_value = "Bad Request"
            mock_post.return_value.__aenter__.return_value = mock_response
            
            with pytest.raises(Exception, match="Telegram API error"):
                await telegram_manager.send_photo("test.jpg", "Test caption")
```

### **2. Integration Tests**

#### **End-to-End Testing**
```python
class TestTelegramIntegration:
    @pytest.mark.asyncio
    async def test_download_with_telegram(self):
        """Test complete download with Telegram sending"""
        
        # Mock Snapchat API responses
        # Mock Telegram API responses
        # Verify database updates
        # Verify WebSocket messages
        pass
    
    @pytest.mark.asyncio
    async def test_manual_send_to_telegram(self):
        """Test manual sending to Telegram"""
        
        # Create test media files
        # Send via API endpoint
        # Verify Telegram API calls
        # Verify response format
        pass
```

---

## 🚀 Deployment Plan

### **1. Database Migration**

#### **Migration Script**
```python
async def migrate_to_sqlite():
    """Migrate from file-based metadata to SQLite"""
    
    # Create database tables
    await create_database_tables()
    
    # Migrate existing metadata
    for username_dir in os.listdir(DOWNLOADS_DIR):
        username_path = os.path.join(DOWNLOADS_DIR, username_dir)
        if os.path.isdir(username_path):
            for media_type in ["stories", "highlights", "spotlights"]:
                media_dir = os.path.join(username_path, media_type)
                if os.path.exists(media_dir):
                    metadata_file = os.path.join(media_dir, ".media_metadata.json")
                    if os.path.exists(metadata_file):
                        await migrate_user_metadata(username_dir, media_type, metadata_file)
    
    logger.info("✅ Database migration completed")

async def migrate_user_metadata(username: str, media_type: str, metadata_file: str):
    """Migrate single user's metadata to SQLite"""
    
    with open(metadata_file, 'r') as f:
        metadata = json.load(f)
    
    for item in metadata:
        await insert_processed_media(
            media_id=item.get("snap_id", f"{username}_{item['filename']}"),
            username=username,
            media_type=media_type,
            media_url=item.get("thumbnail_url", ""),
            file_path=os.path.join(username, media_type, item["filename"]),
            is_sent_to_telegram=item.get("telegram_status") == "sent"
        )
```

### **2. Configuration Updates**

#### **Environment Setup**
```bash
# Add to existing .env file
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_CHANNEL_ID=-1001234567890
SNAPCHAT_DB_PATH=snapchat_telegram.db
DEFAULT_POLLING_INTERVAL=30
TELEGRAM_RATE_LIMIT=1
```

### **3. Service Updates**

#### **Updated Requirements**
```txt
# Add to requirements.txt
aiohttp==3.10.5
sqlite3  # Built-in
apscheduler==3.10.4
```

### **4. Frontend Updates**

#### **New Components**
- Telegram send buttons for each media item
- Target management interface
- Real-time Telegram status updates
- Polling controls

### **5. Testing & Validation**

#### **Deployment Checklist**
- [ ] Database migration completed
- [ ] Environment variables configured
- [ ] Telegram bot token validated
- [ ] Channel access confirmed
- [ ] API endpoints tested
- [ ] Frontend integration verified
- [ ] WebSocket connections working
- [ ] Error handling tested
- [ ] Rate limiting verified
- [ ] Documentation updated

---

## 📈 Success Metrics

### **1. Functional Metrics**
- ✅ Telegram sending success rate > 95%
- ✅ Real-time status updates working
- ✅ Manual and automatic sending operational
- ✅ Error handling and retry logic functional

### **2. Performance Metrics**
- ⏱️ Telegram API response time < 2 seconds
- 📊 WebSocket message delivery < 100ms
- 🔄 Polling system reliability > 99%
- 💾 Database query performance < 50ms

### **3. User Experience Metrics**
- 🎯 UI responsiveness and feedback
- 📱 Mobile-friendly interface
- 🔄 Real-time progress updates
- 🛡️ Error message clarity

---

*This implementation plan provides a comprehensive roadmap for adding Telegram integration to the Snapchat service, closely mirroring the Instagram system's functionality while adapting to Snapchat's unique architecture and requirements.*
