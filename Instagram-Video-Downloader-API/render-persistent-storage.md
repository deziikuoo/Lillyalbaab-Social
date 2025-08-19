# Render Persistent Storage Configuration

## Problem
Render's ephemeral filesystem means that:
- ✅ **SQLite Database**: Already persists (good!)
- ❌ **Local Downloads**: Lost on container restart
- ❌ **Memory Cache**: Lost on container restart

## Solution: Render Persistent Disk Storage

### 1. Environment Variables for Render

Add these to your Render environment variables:

```bash
# Production environment flag
NODE_ENV=production

# Persistent storage paths
PERSISTENT_DATA_DIR=/opt/render/project/src/data
DATABASE_PATH=/opt/render/project/src/data/instagram_tracker.db
DOWNLOADS_DIR=/opt/render/project/src/data/downloads
```

### 2. Render Service Configuration

In your Render dashboard:

1. **Go to your service settings**
2. **Add a Disk**:
   - **Name**: `persistent-data`
   - **Mount Path**: `/opt/render/project/src/data`
   - **Size**: 10GB (adjust based on your needs)

### 3. Code Changes Made

#### Database Path Configuration
```javascript
const dbPath = process.env.NODE_ENV === 'production' 
  ? '/opt/render/project/src/data/instagram_tracker.db'  // Render persistent storage
  : './instagram_tracker.db';  // Local development

const db = new sqlite3.Database(dbPath);
```

#### Downloads Directory Configuration
```javascript
const DOWNLOADS_DIR = process.env.NODE_ENV === 'production'
  ? '/opt/render/project/src/data/downloads'  // Render persistent storage
  : './downloads';  // Local development

// Ensure downloads directory exists
if (!fs.existsSync(DOWNLOADS_DIR)) {
  fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
  console.log(`📁 Created downloads directory: ${DOWNLOADS_DIR}`);
}
```

### 4. Current Caching System Status

#### ✅ **Persistent (Survives Restarts)**
- **SQLite Database**: `instagram_tracker.db`
  - `processed_posts` table
  - `processed_stories` table
  - `recent_posts_cache` table
  - `recent_stories_cache` table
  - `cache_cleanup_log` table

#### ❌ **Ephemeral (Lost on Restarts)**
- **Memory Cache**: Recent posts/stories in memory
- **Local Downloads**: Any downloaded files (if implemented)

### 5. Benefits of Current Architecture

The current implementation is actually **Render-friendly** because:

1. **No Local File Downloads**: The service extracts URLs and sends directly to Telegram
2. **Database Persistence**: All tracking data survives restarts
3. **URL-based Processing**: No need to store large media files locally

### 6. Memory Cache Recovery

When the service restarts, the memory cache is rebuilt from:
- Recent posts fetched from Instagram
- Database records of processed content
- This happens automatically during the first polling cycle

### 7. Deployment Checklist

- [ ] Add persistent disk in Render dashboard
- [ ] Set `NODE_ENV=production` environment variable
- [ ] Deploy updated code with persistent storage paths
- [ ] Verify database file is created in persistent storage
- [ ] Test that processed posts/stories persist across restarts

### 8. Monitoring Persistent Storage

Add this endpoint to monitor storage usage:

```javascript
app.get('/storage-status', (req, res) => {
  const fs = require('fs');
  const path = require('path');
  
  try {
    const dbStats = fs.statSync(dbPath);
    const downloadsStats = fs.statSync(DOWNLOADS_DIR);
    
    res.json({
      database: {
        path: dbPath,
        size: dbStats.size,
        exists: true
      },
      downloads: {
        path: DOWNLOADS_DIR,
        exists: fs.existsSync(DOWNLOADS_DIR),
        files: fs.readdirSync(DOWNLOADS_DIR).length
      },
      environment: process.env.NODE_ENV
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

## Summary

Your current caching system is already well-designed for Render:
- **Database persistence** ✅ (handles duplicate detection)
- **URL-based processing** ✅ (no large file storage needed)
- **Memory cache recovery** ✅ (rebuilds on restart)

The main improvement is ensuring the database uses persistent storage, which we've now implemented.
