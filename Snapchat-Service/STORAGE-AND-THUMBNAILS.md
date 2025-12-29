# Snapchat Service: Storage Mechanism & Video Thumbnails

## 📁 Storage Mechanism

### How Media Files Are Stored

1. **Download Location**:
   - All media files (images and videos) are saved to disk in the `DOWNLOADS_DIR` directory
   - Default path: `downloads/{username}/{media_type}/{filename}`
   - Example: `downloads/tyla/stories/2025-01-15_14-30-00_snap123_tyla.mp4`

2. **Storage Structure**:
   ```
   downloads/
   ├── {username}/
   │   ├── stories/
   │   │   ├── .media_metadata.json  (metadata file)
   │   │   ├── .thumbnails/          (generated video thumbnails)
   │   │   ├── file1.jpg
   │   │   └── file2.mp4
   │   ├── highlights/
   │   └── spotlights/
   ```

3. **Metadata Storage**:
   - Each media type has a `.media_metadata.json` file that stores:
     - Filename
     - Media type (video/image)
     - Thumbnail URL (from Snapchat API or generated)
     - Download status
     - Progress tracking

### Automatic Cleanup (Files ARE Deleted)

**⚠️ IMPORTANT: Files are NOT permanently stored. They are automatically deleted based on age and storage pressure.**

#### Cleanup Mechanisms:

1. **Regular Cleanup (1 day)**:
   - **Trigger**: When downloads directory exceeds 500MB
   - **Action**: Removes files older than **1 day**
   - **Location**: `cleanup_downloads()` in `main.py`
   - **Log**: `🧹 Cleaned up X old files (Y MB freed)`

2. **Aggressive Cleanup (3 days)**:
   - **Trigger**: When downloads directory exceeds 1GB (critical threshold)
   - **Action**: Removes files older than **3 days**
   - **Location**: `aggressive_disk_cleanup()` in `main.py`
   - **Also performs**: Log cleanup, memory cleanup, diagnostics

3. **Scheduled Cleanup (2 weeks)**:
   - **Trigger**: Runs automatically every 2 weeks via scheduler
   - **Action**: Removes ALL files older than **14 days**
   - **Location**: `cleanup_downloads_2week()` in `main.py`
   - **Log**: `🧹 2-week downloads cleanup: X files removed`

4. **Supabase Cache Cleanup (2 weeks)**:
   - **Trigger**: Runs automatically every 2 weeks via scheduler
   - **Action**: Deletes cache entries older than 14 days from Supabase
   - **Tables**: `snapchat_recent_stories_cache`, `snapchat_processed_stories`
   - **Location**: `cleanup_snapchat_cache()` → `supabase_manager.clean_expired_snapchat_cache()`

#### Cleanup Schedule:

```python
# In main.py - scheduled tasks
scheduler.add_job(
    health_check.scheduled_cleanup,
    trigger=IntervalTrigger(weeks=2),  # Every 2 weeks
    id="scheduled_cleanup"
)
```

### Summary:

- ✅ **Files ARE saved** to disk when downloaded
- ❌ **Files ARE automatically deleted** after 1-14 days (depending on storage pressure)
- 🔄 **Storage is temporary** - designed for short-term caching, not permanent archival
- 📊 **Storage limits**: 
  - Warning at 500MB (1-day cleanup)
  - Critical at 1GB (3-day cleanup)
  - Scheduled cleanup: 14 days

---

## 🎬 Video Thumbnail Issue & Fix

### Problem:

Video thumbnails were not displaying in the gallery because:
1. Snapchat API sometimes provides `mediaPreviewUrl` for videos, but often it's missing
2. When `mediaPreviewUrl` is missing, the code falls back to the video URL itself
3. Browsers cannot display video files as images (`<img>` tags can't render `.mp4` files)
4. The gallery endpoint was overwriting the original `thumbnail_url` with the file URL

### Solution Implemented:

#### 1. **Thumbnail Endpoint** (`/thumbnail/{username}/{media_type}/{filename}`):
   - Extracts first frame from video files using OpenCV or imageio
   - Generates JPEG thumbnail stored in `.thumbnails/` directory
   - Serves the thumbnail image instead of the video file
   - Falls back gracefully if video processing libraries aren't available

#### 2. **Gallery Logic Update**:
   - Preserves original `thumbnail_url` from metadata (Snapchat API preview URLs)
   - For videos without preview URLs, uses thumbnail endpoint: `/thumbnail/...`
   - For images, uses the file itself as thumbnail (works fine)
   - Only generates thumbnails when needed (lazy generation)

#### 3. **Frontend Handling**:
   - Updated to handle video thumbnails properly
   - Shows video icon placeholder if thumbnail fails to load
   - Graceful error handling for missing thumbnails

### Code Flow:

```
1. Download Video
   ↓
2. Save to: downloads/{username}/{media_type}/{file.mp4}
   ↓
3. Store metadata with thumbnail_url:
   - If Snapchat API provides mediaPreviewUrl → use it
   - Otherwise → store video URL as placeholder
   ↓
4. Gallery Request:
   - Check if thumbnail_url exists and is valid
   - If video and no valid thumbnail → use /thumbnail/ endpoint
   - Thumbnail endpoint extracts first frame → saves as .jpg
   - Serve thumbnail image to frontend
```

### Dependencies for Video Thumbnails:

The thumbnail generation requires one of these Python libraries:

1. **OpenCV (cv2)** - Recommended:
   ```bash
   pip install opencv-python
   ```

2. **imageio** - Alternative:
   ```bash
   pip install imageio imageio-ffmpeg
   ```

**Note**: If neither library is available, the system will:
- Try to use the Snapchat API preview URL if available
- Fall back to serving the video file directly (browser may handle it)
- Show a video icon placeholder in the frontend

### Testing:

To verify thumbnails are working:
1. Download a video story
2. Check gallery - video should show thumbnail
3. Inspect network tab - should see request to `/thumbnail/...` endpoint
4. Check `.thumbnails/` directory - should contain generated `.jpg` files

---

## 🔍 Key Files Modified:

1. **`Snapchat-Service/server/main.py`**:
   - Added `/thumbnail/` endpoint for video thumbnail generation
   - Updated `/gallery/` endpoints to use proper thumbnail URLs
   - Preserved original Snapchat API preview URLs

2. **`Instagram/client/src/snapchat/SnapchatPage.tsx`**:
   - Updated to handle video thumbnails gracefully
   - Added error handling for missing thumbnails
   - Shows appropriate placeholder icons

---

## 📝 Summary:

### Storage:
- ✅ Files saved temporarily (1-14 days)
- ✅ Automatic cleanup based on age and storage size
- ✅ Not designed for permanent archival

### Video Thumbnails:
- ✅ Backend generates thumbnails from video files
- ✅ Preserves Snapchat API preview URLs when available
- ✅ Graceful fallbacks if libraries unavailable
- ✅ Frontend handles missing thumbnails elegantly
