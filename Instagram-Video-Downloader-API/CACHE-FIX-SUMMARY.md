# Enhanced Cache System & Cleanup Management

## Problem Identified

The server was experiencing cache loss on restart, specifically on Render deployment. After server reboot, the system would:

1. Show "Cache is up to date" message
2. But then report "0 cached, 8 new" when polling
3. Process all posts as new, causing duplicate Telegram messages

## Root Cause Analysis

### The Issue

- **Cache System**: The application uses a database-based cache system (`recent_posts_cache` table)
- **Missing Loading**: On startup, `checkCacheOnBoot()` only checked cleanup dates but didn't load existing cache data
- **Memory vs Database**: The system relied on database queries for each cache check, but had no in-memory cache loading
- **Performance**: Each cache check required a database query, making it slower
- **Aggressive Cleanup**: 7-day cleanup was deleting all cache data, causing duplicates

### Why It Worked Locally

- Local development likely had faster database access
- Less concurrent load
- Different timing patterns

### Why It Failed on Render

- Render's persistent storage might have different access patterns
- Server restarts on Render might have different timing
- Database connection timing issues

## Solution Implemented

### 1. Enhanced Cache Loading on Boot

```javascript
// New function: loadExistingCache()
async function loadExistingCache() {
  // Load all cached users from database
  // Store in global.postCache for fast access
  // Log cache loading progress
}
```

### 2. Hybrid Cache System (Memory + Database)

```javascript
// Updated getCachedRecentPosts()
function getCachedRecentPosts(username) {
  // First check in-memory cache (fast)
  if (global.postCache && global.postCache[username]) {
    return global.postCache[username];
  }

  // Fallback to database (slower but reliable)
  // Update in-memory cache for future use
}
```

### 3. Cache Update Synchronization

```javascript
// Updated updateRecentPostsCache()
// Now updates both database AND memory cache
// Ensures consistency between both storage methods
```

### 4. Cache Management Endpoints

- `/cache-status` - Check cache state for any user
- `/cache-reload` - Manually reload cache from database
- `/cache-validate` - Validate and fix cache integrity issues
- Enhanced logging for cache operations

### 5. Cache Testing Tools

- `test-cache.js` - Standalone cache verification script
- `npm run test-cache` - Test cache functionality

### 6. Automatic Cache Recovery

- **Automatic Reload**: If initial cache load results in 0 posts, automatically retries
- **Cache Validation**: Periodic integrity checks every 2 hours
- **Orphaned Cache Cleanup**: Removes users in memory but not in database
- **Missing Cache Recovery**: Loads users from database that are missing from memory

### 7. Enhanced Cleanup System

- **Automatic 4-Week Cleanup**: Scheduled every 4 weeks (1344 cleanup cycles) via memoryManager
- **Partial Deletion**: Keep last 8 posts for each user (instead of deleting all)
- **Storage-Based Cleanup**: Trigger when database exceeds 500MB
- **Database Transactions**: All cleanup operations wrapped in transactions
- **Atomic Memory Updates**: Memory cache updated atomically with database changes
- **Batch Processing**: Cleanup operations processed in smaller batches
- **Operation Delays**: 2-second delays between cleanup operations
- **Cleanup Queue**: Operations queued and processed sequentially
- **Polling Blocking**: Polling waits for cleanup operations to complete
- **Post-Cleanup Validation**: Cache integrity checks after each cleanup

## Key Improvements

### Performance

- **Faster Cache Access**: In-memory cache provides instant access
- **Reduced Database Load**: Fewer database queries for cache checks
- **Better Startup**: Cache loaded once on startup, not on each check
- **Optimized Cleanup**: Batch processing and delays prevent system overload

### Reliability

- **Persistent Storage**: Database remains the source of truth
- **Fallback System**: Memory cache failure falls back to database
- **Consistency**: Both memory and database stay synchronized
- **Transaction Safety**: All cleanup operations are atomic
- **Queue Management**: Prevents concurrent cleanup conflicts

### Debugging

- **Cache Status Endpoint**: Real-time cache state monitoring
- **Detailed Logging**: Cache operations are logged for debugging
- **Test Script**: Standalone cache verification
- **Cleanup Logging**: All cleanup operations are logged with details

## Usage

### Check Cache Status

```bash
curl https://tyla-social.onrender.com/cache-status?username=wolftyla
```

### Reload Cache

```bash
curl -X POST https://tyla-social.onrender.com/cache-reload
```

### Validate Cache Integrity

```bash
curl -X POST https://tyla-social.onrender.com/cache-validate
```

### Test Cache Locally

```bash
npm run test-cache
```

## Expected Behavior After Fix

### On Server Restart

1. Server starts up
2. `checkCacheOnBoot()` runs
3. `loadExistingCache()` loads all cached data into memory
4. Log shows: "📊 Loading cache for X users..."
5. Log shows: "✅ Cache loaded successfully (X users)"

### On Polling

1. `findNewPosts()` checks cache
2. Uses in-memory cache first (fast)
3. Log shows: "📊 Using in-memory cache for @username (X posts)"
4. Correctly identifies new vs cached posts
5. Log shows: "📊 Cache comparison: 8 fetched, 8 cached, 0 new"

### Cache Updates

1. New posts are cached in both database and memory
2. Log shows: "✅ Updated cache with X posts for @username (memory + database)"

### Cleanup Operations

1. **Time-Based Cleanup**: Every 4 weeks (automatic), keeps last 8 posts per user
2. **Storage-Based Cleanup**: When database exceeds 500MB, keeps last 8 posts per user
3. **Queue Processing**: Cleanup operations queued and processed sequentially
4. **Polling Blocking**: If polling scheduled during cleanup, waits for completion
5. **Post-Cleanup Validation**: Cache integrity checked after each cleanup

## Monitoring

### Health Check Integration

The health endpoint now includes cache information:

```json
{
  "status": "healthy",
  "browserPool": { "total": 2, "inUse": 0 },
  "circuitBreaker": { "state": "CLOSED" },
  "cache": {
    "memory_users": ["wolftyla", "other_user"],
    "database_connected": true
  }
}
```

### Log Patterns to Watch

- ✅ `📊 Loading cache for X users...`
- ✅ `📊 Using in-memory cache for @username (X posts)`
- ✅ `📊 Cache comparison: X fetched, Y cached, Z new`
- ✅ `🔄 Automatic cache reload successful (X users, Y posts)`
- ✅ `🔍 Cache integrity validation completed`
- ✅ `📋 Added cleanup operation to queue (X pending)`
- ✅ `🔄 Starting cleanup queue processing (X operations)`
- ✅ `⏳ Polling blocked - waiting for cleanup operations to complete...`
- ✅ `✅ Cleanup completed - polling can proceed`
- ⚠️ `❌ Failed to load existing cache: error_message`
- ⚠️ `⚠️ Cache loading resulted in 0 posts - attempting automatic reload...`
- ⚠️ `⚠️ Database size (XXX.XXMB) exceeds 500MB limit`

## Deployment Notes

### Render-Specific Considerations

- Persistent storage path: `/opt/render/project/src/data/`
- Database file: `instagram_tracker.db`
- Cache tables: `recent_posts_cache`, `cache_cleanup_log`
- Storage limit: 500MB database size trigger

### Environment Variables

- `NODE_ENV=production` - Uses Render persistent storage
- `HEALTH_URL` - For health monitoring

### Startup Commands

```bash
# Standard startup
npm start

# With health monitoring
npm run start:monitored

# With keep-alive
npm run keep-alive:render
```

## Troubleshooting

### If Cache Still Not Working

1. Check `/cache-status` endpoint
2. Run `npm run test-cache` locally
3. Check database file exists in persistent storage
4. Verify cache tables exist in database
5. Check logs for cache loading messages
6. Monitor cleanup queue status

### Manual Cache Reset

```bash
# Clear cache for specific user
curl -X POST https://tyla-social.onrender.com/clear-cache?username=wolftyla

# Reload cache from database
curl -X POST https://tyla-social.onrender.com/cache-reload

# Validate cache integrity
curl -X POST https://tyla-social.onrender.com/cache-validate
```

## Cleanup System Details

### Time-Based Cleanup (4 weeks)

- **Trigger**: Every 4 weeks (automatic scheduling)
- **Action**: Keep last 8 posts per user
- **Method**: Delete older posts, preserve recent ones
- **Safety**: Database transactions ensure atomicity

### Storage-Based Cleanup (500MB limit)

- **Trigger**: Database size exceeds 500MB
- **Action**: Keep last 8 posts per user
- **Method**: Aggressive cleanup to reduce storage
- **Safety**: Same transaction-based approach

### Queue Management

- **Sequential Processing**: One cleanup operation at a time
- **Polling Blocking**: Polling waits for cleanup completion
- **Operation Delays**: 2-second delays between operations
- **Error Handling**: Failed operations logged, queue continues

### Memory Cache Synchronization

- **Atomic Updates**: Memory cache updated after database changes
- **Integrity Checks**: Post-cleanup validation ensures consistency
- **Recovery**: Automatic reload if cache becomes inconsistent

This enhanced system ensures that the cache is both fast (in-memory) and reliable (database-backed), preventing the duplicate post issue on server restarts while maintaining optimal storage usage and system performance.
