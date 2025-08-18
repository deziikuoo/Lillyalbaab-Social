# Snapchat Polling System Implementation Guide

## Overview
This guide provides a step-by-step implementation plan for creating an automatic and manual polling system for Snapchat, directly adapted from the Instagram service architecture. The system will monitor Snapchat accounts for new stories, process them through multiple download methods, and send content to Telegram.

## Phase 1: Core Infrastructure Setup

### 1.1 Global State Management
Add to `main.py`:

```python
# Snapchat polling configuration
TARGET_USERNAME = None  # Will be set via console prompt or API
POLLING_ENABLED = True
current_polling_timeout = None  # Track current polling timeout for restart
polling_started = False  # Track if polling has been started

# Database setup for tracking stories
db = sqlite3.connect('./snapchat_tracker.db', check_same_thread=False)
db.execute('''CREATE TABLE IF NOT EXISTS processed_stories (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    story_url TEXT NOT NULL,
    story_type TEXT NOT NULL,
    story_id TEXT,
    processed_at DATETIME DEFAULT CURRENT_TIMESTAMP
)''')

db.execute('''CREATE TABLE IF NOT EXISTS recent_stories_cache (
    username TEXT,
    story_url TEXT,
    story_id TEXT,
    story_type TEXT,
    cached_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (username, story_id)
)''')
db.commit()
```

### 1.2 Activity Tracker Implementation
```python
class ActivityTracker:
    def __init__(self):
        self.recent_stories = 0
        self.last_activity = None
        self.last_reset = datetime.now()
        self.is_first_run = True
    
    def update_activity(self, new_stories_count):
        # Skip first run to avoid counting old stories
        if self.is_first_run:
            print("📊 First run detected - skipping activity tracking for old stories")
            self.is_first_run = False
            return
        
        self.recent_stories += new_stories_count
        self.last_activity = datetime.now()
        print(f"📊 Activity updated: +{new_stories_count} stories (total: {self.recent_stories} in 24h)")
    
    def get_activity_level(self):
        # Reset daily counter
        now = datetime.now()
        hours_since_reset = (now - self.last_reset).total_seconds() / 3600
        if hours_since_reset >= 24:
            self.recent_stories = 0
            self.last_reset = now
            print("🔄 Daily activity reset")
        
        # Activity levels (adjusted for Snapchat's faster content cycle)
        if self.recent_stories >= 5: return 'high'
        if self.recent_stories >= 2: return 'medium'
        return 'low'
    
    def get_polling_interval(self):
        base_interval = 10  # minutes (faster than Instagram due to story expiration)
        activity_level = self.get_activity_level()
        
        interval = base_interval
        if activity_level == 'high':
            interval = 5  # 5 minutes for active users
        elif activity_level == 'low':
            interval = 20  # 20 minutes for inactive users
        # medium stays at 10 minutes
        
        print(f"🔄 Smart polling: {interval} minutes ({activity_level} activity level)")
        return interval

activity_tracker = ActivityTracker()
```

### 1.3 Request Tracking System
```python
class RequestTracker:
    def __init__(self):
        self.stats = {
            'snapchat': {
                'total': 0,
                'successful': 0,
                'failed': 0,
                'rate_limited': 0,
                'last24h': 0,
                'last_hour': 0
            },
            'telegram': {
                'total': 0,
                'successful': 0,
                'failed': 0,
                'photos': 0,
                'videos': 0,
                'last24h': 0,
                'last_hour': 0
            },
            'start_time': datetime.now(),
            'last_reset': datetime.now()
        }
    
    def track_snapchat(self, url, success, error=None):
        self.stats['snapchat']['total'] += 1
        self.stats['snapchat']['last24h'] += 1
        self.stats['snapchat']['last_hour'] += 1
        
        if success:
            self.stats['snapchat']['successful'] += 1
        else:
            self.stats['snapchat']['failed'] += 1
            if error and ('429' in str(error) or 'rate limit' in str(error).lower()):
                self.stats['snapchat']['rate_limited'] += 1
        
        self.log_request('Snapchat', url, success, error)
    
    def track_telegram(self, media_type, success, error=None):
        self.stats['telegram']['total'] += 1
        self.stats['telegram']['last24h'] += 1
        self.stats['telegram']['last_hour'] += 1
        
        if success:
            self.stats['telegram']['successful'] += 1
            if media_type == 'photo':
                self.stats['telegram']['photos'] += 1
            if media_type == 'video':
                self.stats['telegram']['videos'] += 1
        else:
            self.stats['telegram']['failed'] += 1
        
        self.log_request('Telegram', media_type, success, error)
    
    def log_request(self, service, details, success, error):
        timestamp = datetime.now().isoformat()
        status = "✅" if success else "❌"
        log_entry = f"{timestamp} {status} {service}: {details}"
        if error:
            log_entry += f" | Error: {error}"
        
        print(log_entry)
        
        # Save to log file
        with open('request-logs.txt', 'a') as f:
            f.write(log_entry + '\n')
    
    def get_stats(self):
        now = datetime.now()
        uptime = now - self.stats['start_time']
        hours_since_reset = (now - self.stats['last_reset']).total_seconds() / 3600
        
        # Reset hourly counters
        if hours_since_reset >= 1:
            self.stats['snapchat']['last_hour'] = 0
            self.stats['telegram']['last_hour'] = 0
            self.stats['last_reset'] = now
        
        # Reset daily counters
        if hours_since_reset >= 24:
            self.stats['snapchat']['last24h'] = 0
            self.stats['telegram']['last24h'] = 0
        
        return {
            **self.stats,
            'uptime': {
                'seconds': int(uptime.total_seconds()),
                'minutes': int(uptime.total_seconds() / 60),
                'hours': int(uptime.total_seconds() / 3600),
                'days': int(uptime.total_seconds() / 86400)
            },
            'rates': {
                'snapchat_per_hour': self.stats['snapchat']['last_hour'],
                'telegram_per_hour': self.stats['telegram']['last_hour'],
                'snapchat_per_day': self.stats['snapchat']['last24h'],
                'telegram_per_day': self.stats['telegram']['last24h']
            }
        }
    
    def print_stats(self):
        stats = self.get_stats()
        print('\n📊 REQUEST STATISTICS')
        print('====================')
        print(f"⏱️  Uptime: {stats['uptime']['days']}d {stats['uptime']['hours']}h {stats['uptime']['minutes']}m")
        print('\n📱 Snapchat Requests:')
        print(f"   Total: {stats['snapchat']['total']}")
        print(f"   Successful: {stats['snapchat']['successful']}")
        print(f"   Failed: {stats['snapchat']['failed']}")
        print(f"   Rate Limited: {stats['snapchat']['rate_limited']}")
        print(f"   Last Hour: {stats['rates']['snapchat_per_hour']}")
        print(f"   Last 24h: {stats['rates']['snapchat_per_day']}")
        
        print('\n📤 Telegram Requests:')
        print(f"   Total: {stats['telegram']['total']}")
        print(f"   Successful: {stats['telegram']['successful']}")
        print(f"   Failed: {stats['telegram']['failed']}")
        print(f"   Photos: {stats['telegram']['photos']}")
        print(f"   Videos: {stats['telegram']['videos']}")
        print(f"   Last Hour: {stats['rates']['telegram_per_hour']}")
        print(f"   Last 24h: {stats['rates']['telegram_per_day']}")

request_tracker = RequestTracker()
```

## Phase 2: Polling System Implementation

### 2.1 Polling State Management Functions
```python
def start_polling(username):
    global TARGET_USERNAME, polling_started
    
    if polling_started:
        print('⚠️ Polling already started')
        return
    
    TARGET_USERNAME = username
    polling_started = True
    
    print(f"🚀 Snapchat polling started for @{TARGET_USERNAME}")
    print('📍 Manual poll: GET /poll-now')
    print(f'🌐 Frontend available: http://localhost:{PORT}')
    
    # Start health check system
    health_check.start()
    
    # Start memory management system
    memory_manager.start()
    
    # Start first poll after 10 seconds
    threading.Timer(10.0, lambda: execute_poll_cycle()).start()

def stop_polling():
    global current_polling_timeout, polling_started
    
    if current_polling_timeout:
        current_polling_timeout.cancel()
        current_polling_timeout = None
        print('🛑 Polling stopped')
    
    polling_started = False

def restart_polling():
    stop_polling()
    print(f"🔄 Restarting polling for @{TARGET_USERNAME}")
    
    # Start new poll after 5 seconds
    threading.Timer(5.0, lambda: execute_poll_cycle()).start()
```

### 2.2 Smart Polling Scheduling
```python
def schedule_next_poll():
    global current_polling_timeout
    
    # Get smart polling interval based on activity
    base_minutes = activity_tracker.get_polling_interval()
    variation_minutes = 1  # ±1 minute for randomization (faster than Instagram)
    
    # Add/subtract variation (±1 minute)
    variation = random.randint(-variation_minutes, variation_minutes)
    final_minutes = max(1, base_minutes + variation)  # Ensure minimum 1 minute
    
    next_poll_seconds = final_minutes * 60
    
    next_poll_time = datetime.now() + timedelta(minutes=final_minutes)
    time_string = next_poll_time.strftime('%I:%M %p')
    print(f"⏰ Next poll scheduled in {final_minutes} minutes (smart: {base_minutes} ± {abs(variation)}) for @{TARGET_USERNAME} at {time_string}")
    
    current_polling_timeout = threading.Timer(next_poll_seconds, execute_poll_cycle)
    current_polling_timeout.start()

def execute_poll_cycle():
    if POLLING_ENABLED:
        try:
            # Check for new stories
            check_for_new_stories()
            schedule_next_poll()  # Schedule the next poll
        except Exception as error:
            print(f'❌ Polling cycle failed: {error}')
            # Log error but don't stop polling
            with open('error-logs.txt', 'a') as f:
                f.write(f"[{datetime.now().isoformat()}] Polling error: {error}\n")
            
            # Retry after 3 minutes instead of the full interval (faster than Instagram)
            threading.Timer(3 * 60, execute_poll_cycle).start()
```

### 2.3 Story Processing Pipeline
```python
def check_for_new_stories(force=False):
    try:
        print(f"\n🔍 Checking for new stories from @{TARGET_USERNAME} {force and '(force send enabled)' or ''}")
        
        # Use existing Snapchat downloader to get stories
        from snapchat_dl.downloader import download_stories
        
        stories = download_stories(TARGET_USERNAME)
        
        print(f"Found {len(stories)} total stories")
        
        # Use cache to find only new stories
        new_stories = find_new_stories(TARGET_USERNAME, stories)
        
        # Update cache with current stories
        update_stories_cache(TARGET_USERNAME, stories)
        
        if len(new_stories) == 0 and not force:
            print("✅ No new stories found, skipping story processing...")
            return
        
        print(f"📱 Processing {len(new_stories)} new stories out of {len(stories)} total")
        
        # Process each new story
        for story in new_stories:
            try:
                # Send to Telegram automatically
                if TELEGRAM_BOT_TOKEN and TELEGRAM_CHANNEL_ID:
                    try:
                        print(f"📤 [AUTO] Sending story to Telegram...")
                        story_caption = f"✨ New story from <a href='https://snapchat.com/add/{TARGET_USERNAME}'>@{TARGET_USERNAME}</a>! 📱"
                        
                        if story.get('is_video', False):
                            await send_video_to_telegram(story['url'], story_caption)
                        else:
                            await send_photo_to_telegram(story['url'], story_caption)
                        
                        print(f"✅ [AUTO] Story sent to Telegram successfully")
                        
                        # Add delay between Telegram sends
                        time.sleep(1)
                        
                    except Exception as telegram_error:
                        print(f"⚠️ [AUTO] Failed to send story to Telegram: {telegram_error}")
                
                # Mark as processed
                story_id = generate_story_id(story)
                mark_story_processed(story_id, TARGET_USERNAME, story['url'], story.get('type', 'photo'))
                print(f"✅ Story marked as processed: {story_id}")
                
            except Exception as error:
                print(f"⚠️ Error processing story: {error}")
        
        # Update activity tracker with new stories found
        if len(new_stories) > 0:
            activity_tracker.update_activity(len(new_stories))
            print(f"📊 Activity updated: +{len(new_stories)} new stories processed")
        
        print('✅ Polling check completed')
        # Always print request statistics after each polling run
        request_tracker.print_stats()
        print('')
        
    except Exception as error:
        print(f'Polling error: {error}')
```

## Phase 3: Database Operations

### 3.1 Story Cache Management
```python
def find_new_stories(username, fetched_stories):
    """Find stories that are not in the cache"""
    try:
        # Get cached stories for this user
        cursor = db.cursor()
        cursor.execute('''
            SELECT story_id FROM recent_stories_cache 
            WHERE username = ?
        ''', (username,))
        cached_story_ids = {row[0] for row in cursor.fetchall()}
        
        new_stories = []
        for story in fetched_stories:
            story_id = generate_story_id(story)
            if story_id not in cached_story_ids:
                new_stories.append(story)
        
        print(f"📊 Stories summary: {len(fetched_stories)} fetched, {len(cached_story_ids)} cached, {len(new_stories)} new")
        return new_stories
        
    except Exception as error:
        print(f"Error finding new stories: {error}")
        return fetched_stories  # Return all stories if cache lookup fails

def update_stories_cache(username, stories):
    """Update the stories cache with current stories"""
    try:
        cursor = db.cursor()
        
        # Clear old cache entries for this user
        cursor.execute('DELETE FROM recent_stories_cache WHERE username = ?', (username,))
        
        # Insert new cache entries
        for story in stories:
            story_id = generate_story_id(story)
            cursor.execute('''
                INSERT OR REPLACE INTO recent_stories_cache 
                (username, story_url, story_id, story_type, cached_at)
                VALUES (?, ?, ?, ?, ?)
            ''', (username, story['url'], story_id, story.get('type', 'photo'), datetime.now()))
        
        db.commit()
        print(f"✅ Stories cache updated for @{username}")
        
    except Exception as error:
        print(f"Error updating stories cache: {error}")

def generate_story_id(story):
    """Generate a unique story ID from the URL or timestamp"""
    if story.get('url'):
        return hashlib.md5(story['url'].encode()).hexdigest()[:20]
    else:
        return f"story_{int(time.time())}_{random.randint(1000, 9999)}"
```

### 3.2 Story Processing Tracking
```python
def check_story_processed(username, story_id):
    """Check if a story has already been processed"""
    try:
        cursor = db.cursor()
        cursor.execute('''
            SELECT id FROM processed_stories 
            WHERE username = ? AND story_id = ?
        ''', (username, story_id))
        
        return cursor.fetchone() is not None
        
    except Exception as error:
        print(f"Error checking story processed: {error}")
        return False

def mark_story_processed(story_id, username, story_url, story_type):
    """Mark a story as processed"""
    try:
        cursor = db.cursor()
        cursor.execute('''
            INSERT OR REPLACE INTO processed_stories 
            (id, username, story_url, story_type, story_id, processed_at)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (story_id, username, story_url, story_type, story_id, datetime.now()))
        
        db.commit()
        
    except Exception as error:
        print(f"Error marking story processed: {error}")
```

## Phase 4: Error Handling & Monitoring

### 4.1 Health Check System
```python
class HealthCheck:
    def __init__(self):
        self.last_check = datetime.now()
        self.consecutive_failures = 0
        self.max_failures = 3
        self.check_interval = 5 * 60  # 5 minutes
    
    def perform_check(self):
        try:
            # Check if polling is still active
            if polling_started and not current_polling_timeout:
                print('⚠️ Health check: Polling timeout missing, restarting...')
                self.consecutive_failures += 1
                self.restart_polling()
                return
            
            # Check database connectivity
            cursor = db.cursor()
            cursor.execute('SELECT 1')
            cursor.fetchone()
            
            # Reset failure counter on success
            self.consecutive_failures = 0
            self.last_check = datetime.now()
            print('✅ Health check passed')
            
        except Exception as error:
            print(f'❌ Health check failed: {error}')
            self.consecutive_failures += 1
            
            if self.consecutive_failures >= self.max_failures:
                print('🚨 Too many consecutive health check failures, restarting service...')
                self.restart_service()
    
    def restart_polling(self):
        try:
            print('🔄 Restarting polling due to health check failure...')
            stop_polling()
            time.sleep(5)
            start_polling(TARGET_USERNAME)
        except Exception as error:
            print(f'Failed to restart polling: {error}')
    
    def restart_service(self):
        print('🔄 Restarting service due to health check failures...')
        self.restart_polling()
    
    def start(self):
        def health_check_loop():
            while True:
                self.perform_check()
                time.sleep(self.check_interval)
        
        health_thread = threading.Thread(target=health_check_loop, daemon=True)
        health_thread.start()
        print('🏥 Health check system started')

health_check = HealthCheck()
```

### 4.2 Memory Management
```python
class MemoryManager:
    def __init__(self):
        self.last_cleanup = datetime.now()
        self.cleanup_interval = 30 * 60  # 30 minutes
    
    def perform_cleanup(self):
        try:
            # Clear any accumulated caches
            if hasattr(globals(), 'story_cache'):
                cache_size = len(globals()['story_cache'])
                if cache_size > 1000:
                    print(f"🧹 Clearing large story cache ({cache_size} entries)")
                    globals()['story_cache'] = {}
            
            self.last_cleanup = datetime.now()
            print('✅ Memory cleanup completed')
            
        except Exception as error:
            print(f'❌ Memory cleanup failed: {error}')
    
    def start(self):
        def cleanup_loop():
            while True:
                time.sleep(self.cleanup_interval)
                self.perform_cleanup()
        
        cleanup_thread = threading.Thread(target=cleanup_loop, daemon=True)
        cleanup_thread.start()
        print('🧠 Memory management system started')

memory_manager = MemoryManager()
```

## Phase 5: API Endpoints

### 5.1 Polling Control Endpoints
```python
@app.route('/start-polling', methods=['POST'])
def start_polling_endpoint():
    try:
        if not TARGET_USERNAME:
            return jsonify({'error': 'No target set. Please set a target first.'}), 400
        
        if polling_started:
            return jsonify({
                'success': True,
                'message': 'Polling already started',
                'target': TARGET_USERNAME,
                'polling_active': True
            })
        
        print(f"🚀 Starting polling for @{TARGET_USERNAME}")
        start_polling(TARGET_USERNAME)
        
        return jsonify({
            'success': True,
            'message': f'Polling started for @{TARGET_USERNAME}',
            'target': TARGET_USERNAME,
            'polling_active': True
        })
        
    except Exception as error:
        return jsonify({'error': str(error)}), 500

@app.route('/stop-polling', methods=['POST'])
def stop_polling_endpoint():
    try:
        if not polling_started:
            return jsonify({
                'success': True,
                'message': 'Polling not active',
                'polling_active': False
            })
        
        print(f"🛑 Stopping polling for @{TARGET_USERNAME}")
        stop_polling()
        
        return jsonify({
            'success': True,
            'message': 'Polling stopped',
            'polling_active': False
        })
        
    except Exception as error:
        return jsonify({'error': str(error)}), 500

@app.route('/poll-now')
def manual_poll_endpoint():
    try:
        force = request.args.get('force', 'false').lower() == 'true'
        print(f"Manual polling triggered via API (force={force})")
        check_for_new_stories(force)
        return jsonify({
            'success': True,
            'message': 'Polling completed',
            'target': TARGET_USERNAME,
            'force': force
        })
        
    except Exception as error:
        return jsonify({'error': str(error)}), 500
```

### 5.2 Status and Statistics Endpoints
```python
@app.route('/status')
def get_status():
    try:
        stats = request_tracker.get_stats()
        return jsonify({
            'status': 'running',
            'target_username': TARGET_USERNAME,
            'polling_enabled': POLLING_ENABLED,
            'polling_active': current_polling_timeout is not None,
            'polling_started': polling_started,
            'uptime': stats['uptime'],
            'statistics': {
                'snapchat': stats['snapchat'],
                'telegram': stats['telegram'],
                'rates': stats['rates']
            }
        })
        
    except Exception as error:
        return jsonify({'error': str(error)}), 500

@app.route('/stats')
def get_stats():
    try:
        stats = request_tracker.get_stats()
        return jsonify(stats)
        
    except Exception as error:
        return jsonify({'error': str(error)}), 500
```

## Phase 6: Telegram Integration

### 6.1 Telegram Sending Functions
```python
async def send_photo_to_telegram(photo_url, caption=''):
    try:
        if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHANNEL_ID:
            raise Exception('Telegram configuration missing')
        
        print('📸 Sending photo to Telegram...')
        print(f'📸 Photo URL: {photo_url}')
        
        # Try direct URL first
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(f'https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendPhoto', 
                    json={
                        'chat_id': TELEGRAM_CHANNEL_ID,
                        'photo': photo_url,
                        'caption': caption or 'New Snapchat story',
                        'parse_mode': 'HTML'
                    }, timeout=aiohttp.ClientTimeout(total=30)) as resp:
                    
                    if resp.status == 200:
                        data = await resp.json()
                        if data.get('ok'):
                            print('✅ Photo sent to Telegram via direct URL')
                            request_tracker.track_telegram('photo', True)
                            return {'success': True, 'message_id': data['result']['message_id'], 'method': 'direct_url'}
        except Exception as direct_err:
            print(f'⚠️ Direct URL send failed: {direct_err}')
            request_tracker.track_telegram('photo', False, str(direct_err))
        
        # Fallback to download/upload
        temp_file = None
        try:
            # Download the photo
            async with aiohttp.ClientSession() as session:
                async with session.get(photo_url) as resp:
                    if resp.status == 200:
                        temp_file = f'temp_photo_{int(time.time())}.jpg'
                        with open(temp_file, 'wb') as f:
                            f.write(await resp.read())
                        
                        # Send via file upload
                        with open(temp_file, 'rb') as f:
                            files = {'photo': f}
                            data = {
                                'chat_id': TELEGRAM_CHANNEL_ID,
                                'caption': caption or 'New Snapchat story',
                                'parse_mode': 'HTML'
                            }
                            
                            async with aiohttp.ClientSession() as session:
                                async with session.post(f'https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendPhoto',
                                    data=data, files=files, timeout=aiohttp.ClientTimeout(total=30)) as resp:
                                    
                                    if resp.status == 200:
                                        result = await resp.json()
                                        if result.get('ok'):
                                            print('✅ Photo sent to Telegram via file upload')
                                            request_tracker.track_telegram('photo', True)
                                            return {'success': True, 'message_id': result['result']['message_id'], 'method': 'file_upload'}
        
        finally:
            # Clean up temp file
            if temp_file and os.path.exists(temp_file):
                os.remove(temp_file)
        
        raise Exception('Failed to send photo to Telegram')
        
    except Exception as error:
        print(f'❌ Error sending photo to Telegram: {error}')
        request_tracker.track_telegram('photo', False, str(error))
        return {'success': False, 'error': str(error)}

async def send_video_to_telegram(video_url, caption=''):
    try:
        if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHANNEL_ID:
            raise Exception('Telegram configuration missing')
        
        print('🎥 Sending video to Telegram...')
        print(f'🎥 Video URL: {video_url}')
        
        # Try direct URL first
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(f'https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendVideo',
                    json={
                        'chat_id': TELEGRAM_CHANNEL_ID,
                        'video': video_url,
                        'caption': caption or 'New Snapchat story',
                        'parse_mode': 'HTML'
                    }, timeout=aiohttp.ClientTimeout(total=30)) as resp:
                    
                    if resp.status == 200:
                        data = await resp.json()
                        if data.get('ok'):
                            print('✅ Video sent to Telegram via direct URL')
                            request_tracker.track_telegram('video', True)
                            return {'success': True, 'message_id': data['result']['message_id'], 'method': 'direct_url'}
        except Exception as direct_err:
            print(f'⚠️ Direct URL send failed: {direct_err}')
            request_tracker.track_telegram('video', False, str(direct_err))
        
        # Fallback to download/upload
        temp_file = None
        try:
            # Download the video
            async with aiohttp.ClientSession() as session:
                async with session.get(video_url) as resp:
                    if resp.status == 200:
                        temp_file = f'temp_video_{int(time.time())}.mp4'
                        with open(temp_file, 'wb') as f:
                            f.write(await resp.read())
                        
                        # Send via file upload
                        with open(temp_file, 'rb') as f:
                            files = {'video': f}
                            data = {
                                'chat_id': TELEGRAM_CHANNEL_ID,
                                'caption': caption or 'New Snapchat story',
                                'parse_mode': 'HTML'
                            }
                            
                            async with aiohttp.ClientSession() as session:
                                async with session.post(f'https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendVideo',
                                    data=data, files=files, timeout=aiohttp.ClientTimeout(total=30)) as resp:
                                    
                                    if resp.status == 200:
                                        result = await resp.json()
                                        if result.get('ok'):
                                            print('✅ Video sent to Telegram via file upload')
                                            request_tracker.track_telegram('video', True)
                                            return {'success': True, 'message_id': result['result']['message_id'], 'method': 'file_upload'}
        
        finally:
            # Clean up temp file
            if temp_file and os.path.exists(temp_file):
                os.remove(temp_file)
        
        raise Exception('Failed to send video to Telegram')
        
    except Exception as error:
        print(f'❌ Error sending video to Telegram: {error}')
        request_tracker.track_telegram('video', False, str(error))
        return {'success': False, 'error': str(error)}
```

## Phase 7: Integration with Existing Snapchat Service

### 7.1 Main Application Integration
Add to the main Flask application:

```python
# Add these imports at the top
import threading
import time
import random
import hashlib
import os
import aiohttp
from datetime import datetime, timedelta

# Add polling configuration
TARGET_USERNAME = os.getenv('SNAPCHAT_TARGET_USERNAME')
TELEGRAM_BOT_TOKEN = os.getenv('TELEGRAM_BOT_TOKEN')
TELEGRAM_CHANNEL_ID = os.getenv('TELEGRAM_CHANNEL_ID')

# Initialize systems
activity_tracker = ActivityTracker()
request_tracker = RequestTracker()
health_check = HealthCheck()
memory_manager = MemoryManager()

# Add polling endpoints to existing Flask app
@app.route('/start-polling', methods=['POST'])
def start_polling_endpoint():
    # Implementation from Phase 5.1

@app.route('/stop-polling', methods=['POST'])
def stop_polling_endpoint():
    # Implementation from Phase 5.1

@app.route('/poll-now')
def manual_poll_endpoint():
    # Implementation from Phase 5.1

@app.route('/status')
def get_status():
    # Implementation from Phase 5.2

@app.route('/stats')
def get_stats():
    # Implementation from Phase 5.2

# Add graceful shutdown
def cleanup_and_exit(code=0):
    print('🧹 Cleaning up resources...')
    
    # Stop polling
    if current_polling_timeout:
        current_polling_timeout.cancel()
        current_polling_timeout = None
    
    # Close database connections
    if db:
        db.close()
        print('✅ Database connection closed')
    
    print('🛑 Service shutdown complete')
    exit(code)

# Register shutdown handlers
import signal
signal.signal(signal.SIGTERM, lambda signum, frame: cleanup_and_exit(0))
signal.signal(signal.SIGINT, lambda signum, frame: cleanup_and_exit(0))
```

## Phase 8: Testing and Validation

### 8.1 Test Scripts
Create `test_polling.py`:

```python
import requests
import time
import json

BASE_URL = 'http://localhost:5000'

def test_polling_system():
    print("🧪 Testing Snapchat Polling System")
    print("=" * 40)
    
    # Test 1: Check status
    print("\n1. Checking service status...")
    response = requests.get(f'{BASE_URL}/status')
    print(f"Status: {response.status_code}")
    print(f"Response: {json.dumps(response.json(), indent=2)}")
    
    # Test 2: Start polling
    print("\n2. Starting polling...")
    response = requests.post(f'{BASE_URL}/start-polling')
    print(f"Start polling: {response.status_code}")
    print(f"Response: {json.dumps(response.json(), indent=2)}")
    
    # Test 3: Manual poll
    print("\n3. Triggering manual poll...")
    response = requests.get(f'{BASE_URL}/poll-now?force=true')
    print(f"Manual poll: {response.status_code}")
    print(f"Response: {json.dumps(response.json(), indent=2)}")
    
    # Test 4: Check stats
    print("\n4. Checking statistics...")
    response = requests.get(f'{BASE_URL}/stats')
    print(f"Stats: {response.status_code}")
    print(f"Response: {json.dumps(response.json(), indent=2)}")
    
    # Test 5: Stop polling
    print("\n5. Stopping polling...")
    response = requests.post(f'{BASE_URL}/stop-polling')
    print(f"Stop polling: {response.status_code}")
    print(f"Response: {json.dumps(response.json(), indent=2)}")

if __name__ == '__main__':
    test_polling_system()
```

## Phase 9: Deployment and Configuration

### 9.1 Environment Variables
Create `.env` file:

```env
# Snapchat Configuration
SNAPCHAT_TARGET_USERNAME=your_target_username

# Telegram Configuration
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHANNEL_ID=your_channel_id

# Server Configuration
PORT=5000
DEBUG=False

# Database Configuration
DATABASE_PATH=./snapchat_tracker.db
```

### 9.2 Startup Script
Create `start_polling_service.py`:

```python
#!/usr/bin/env python3
import os
import sys
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Add the current directory to Python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from main import app, start_polling

if __name__ == '__main__':
    # Start polling if target is configured
    target_username = os.getenv('SNAPCHAT_TARGET_USERNAME')
    if target_username:
        print(f"🚀 Auto-starting polling for @{target_username}")
        start_polling(target_username)
    
    # Start Flask app
    port = int(os.getenv('PORT', 5000))
    debug = os.getenv('DEBUG', 'False').lower() == 'true'
    
    print(f"🌐 Starting Snapchat Polling Service on port {port}")
    app.run(host='0.0.0.0', port=port, debug=debug)
```

## Implementation Checklist

- [ ] **Phase 1**: Core Infrastructure Setup
  - [ ] Global state management variables
  - [ ] Activity tracker implementation
  - [ ] Request tracking system
  - [ ] Database schema creation

- [ ] **Phase 2**: Polling System Implementation
  - [ ] Polling state management functions
  - [ ] Smart polling scheduling
  - [ ] Story processing pipeline

- [ ] **Phase 3**: Database Operations
  - [ ] Story cache management
  - [ ] Story processing tracking

- [ ] **Phase 4**: Error Handling & Monitoring
  - [ ] Health check system
  - [ ] Memory management

- [ ] **Phase 5**: API Endpoints
  - [ ] Polling control endpoints
  - [ ] Status and statistics endpoints

- [ ] **Phase 6**: Telegram Integration
  - [ ] Photo sending functions
  - [ ] Video sending functions

- [ ] **Phase 7**: Integration with Existing Service
  - [ ] Main application integration
  - [ ] Graceful shutdown handlers

- [ ] **Phase 8**: Testing and Validation
  - [ ] Test scripts creation
  - [ ] System validation

- [ ] **Phase 9**: Deployment and Configuration
  - [ ] Environment variables setup
  - [ ] Startup script creation

## Key Differences from Instagram Service

1. **Faster Polling Intervals**: 5-20 minutes vs 15-45 minutes (due to story expiration)
2. **Story-Only Focus**: No posts, only stories
3. **Snapchat API Integration**: Uses existing Snapchat downloader
4. **Simplified Content Types**: Primarily photos and videos
5. **Python Implementation**: Adapted from Node.js to Python/Flask

This implementation provides a complete polling system for Snapchat that mirrors the sophistication and reliability of the Instagram service while being optimized for Snapchat's unique characteristics.
