# Disk Monitoring Fix for Cloud Hosting

## Problem

The Snapchat service was showing false disk usage warnings:

```
⚠️ High disk usage: 82.1% - cleaning old files
⚠️ High disk usage: 83.9% - cleaning old files
⚠️ High disk usage: 84.5% - cleaning old files
🚨 Critical disk usage: 85.5% - aggressive cleanup
```

But when cleanup ran, it found:

- Downloads folder: 0 files, 0.0 MB
- Removed: 0 files, 0MB freed
- System drive: 85.5% (330.4GB used of 386.4GB)

## Root Cause

The code was using `psutil.disk_usage(DOWNLOADS_DIR)` which checks the **entire disk partition** that the directory is on, not just the directory itself.

On Render (cloud hosting), the application shares disk space with:

- System files
- Build artifacts and caches
- Python/Node dependencies
- Docker layers
- Other containers/services
- Operating system

The cleanup was only removing files from the application's download folder, which was already empty. The 85.5% disk usage was from Render's system files that the application cannot control.

## Solution

Changed from monitoring **system disk usage** to monitoring **application directory size**:

### Before

```python
# Check system disk (entire partition)
disk = psutil.disk_usage(DOWNLOADS_DIR)
if disk.percent > 75:
    logger.warning(f"⚠️ High disk usage: {disk.percent}%")
```

### After

```python
# Check only application's downloads directory
downloads_size_mb = await self.get_directory_size(DOWNLOADS_DIR)
downloads_size_threshold_mb = 500  # Cleanup at 500MB
downloads_critical_threshold_mb = 1000  # Aggressive at 1GB

if downloads_size_mb > downloads_size_threshold_mb:
    logger.warning(f"⚠️ Downloads directory size: {downloads_size_mb:.1f}MB")
```

## Changes Made

### 1. Updated Status Endpoint (`/snapchat-status`)

Changed from reporting system disk to downloads directory:

```python
# Before: System disk usage (misleading)
stats["disk_usage"] = psutil.disk_usage(DOWNLOADS_DIR)._asdict()

# After: Downloads directory metrics (accurate)
stats["downloads_directory"] = {
    "size_bytes": total_size,
    "size_mb": 123.45,
    "file_count": 456,
    "path": "/path/to/downloads"
}
```

### 2. Updated Health Check Logic

- **Old**: Triggered cleanup at 75%/85% **system disk usage**
- **New**: Triggers cleanup at 500MB/1GB **application directory size**

### 3. Added `get_directory_size()` Method

```python
async def get_directory_size(self, directory: str) -> float:
    """Get directory size in MB"""
    total_size = 0
    for root, dirs, files in os.walk(directory):
        for file in files:
            try:
                total_size += os.path.getsize(file_path)
            except (OSError, FileNotFoundError):
                pass
    return total_size / (1024 * 1024)  # MB
```

### 4. Improved Diagnostic Logging

- Removed misleading system disk percentage
- Shows only application-controlled storage
- Added note explaining cloud hosting context
- Shows compressed log archives size

## Benefits

1. **No More False Alarms**: Only monitors what the app can control
2. **Meaningful Metrics**: 500MB/1GB thresholds make sense for the application
3. **Better Diagnostics**: Shows actual application storage usage
4. **Cloud-Friendly**: Appropriate for shared hosting environments
5. **Reduced Log Spam**: Won't constantly warn about system disk usage

## New Log Output

When cleanup is triggered, you'll see:

```
⚠️ Downloads directory size: 523.4MB - cleaning old files
📊 [DISK] Analyzing application disk usage...
📊 [DISK] Downloads folder: 1,234 files, 523.4 MB
📊 [DISK] server.log: 8.2 MB
📊 [DISK] Compressed logs: 3 files, 12.5 MB
📊 [DISK] Total application usage: 544.1 MB
📊 [DISK] Note: System disk usage (on cloud hosting) is not monitored
🧹 Aggressive cleanup: 892 files removed, 412.3MB freed. Downloads folder now at 111.8MB
```

## Deployment

Simply push this change to Render. The service will automatically use the new monitoring on next restart.

No configuration changes needed - the thresholds are set appropriately for typical usage.
