# Render Inactivity Timeout Fix

## Problem

Service kept receiving SIGTERM every 10-20 minutes with:

- Clean shutdowns ✅ (our previous fixes working)
- Disk usage consistently 80%+ ⚠️
- Service restarting but NOT resuming polling ❌

### Logs Pattern:

```
16:05:16 - Service running, disk 80.6%
16:11:46 - SIGTERM received
16:31:21 - Service restart
16:47:32 - SIGTERM received (16 min later)
17:07:49 - Disk 80.1%
17:13:58 - SIGTERM received (16 min later)
```

## Root Cause

**Render Free Tier Behavior:**

- Spins down services after **15 minutes of HTTP inactivity**
- Background polling = no HTTP traffic = "inactive" to Render
- Sends SIGTERM to stop "idle" service
- Also: Persistent 80%+ disk usage flagged as unstable

## Solution

### 1. Keep-Alive Job ⏰

Added scheduled task that pings self every 10 minutes:

```python
async def keep_alive():
    """Prevent Render from killing service due to inactivity"""
    service_url = os.getenv('SNAPCHAT_SERVICE_URL', 'http://localhost:8000')
    async with aiohttp.ClientSession() as session:
        await session.get(f"{service_url}/ping")

scheduler.add_job(
    keep_alive,
    trigger=IntervalTrigger(minutes=10),
    id="keep_alive_ping"
)
```

**Result:** Service generates HTTP activity every 10 minutes → Render sees it as "active"

### 2. More Aggressive Disk Cleanup 🧹

**Before:**

- Cleanup at 80% (too late)
- Remove files >7 days old (not aggressive enough)
- Disk stayed 80%+

**After:**

- Cleanup at **75%** (earlier intervention)
- Aggressive cleanup at **85%** removes files >3 days old
- Removes empty directories
- Logs freed space

```python
# Normal cleanup at 75%
if disk.percent > 75:
    cleanup_downloads()  # Files >7 days old

# Aggressive cleanup at 85%
if disk.percent > 85:
    aggressive_disk_cleanup()  # Files >3 days old
```

## Expected Behavior After Fix

### Normal Operation:

```
00:00 - Service starts
00:10 - Keep-alive ping ✅
00:20 - Keep-alive ping ✅
00:30 - Keep-alive ping ✅
[... continues indefinitely, no SIGTERM ...]
```

### Disk Management:

```
Disk 74% - No action
Disk 76% - Normal cleanup (7+ days)
Disk 82% - Normal cleanup (7+ days)
Disk 86% - Aggressive cleanup (3+ days)
Disk 72% - Back to normal ✅
```

## Why This Matters

### Render Free Tier Limitations:

| Limitation                  | Impact                | Our Fix                       |
| --------------------------- | --------------------- | ----------------------------- |
| 15 min inactivity timeout   | Service killed        | Keep-alive ping every 10 min  |
| Limited disk space (~500MB) | 80%+ usage = unstable | Aggressive cleanup at 75%/85% |
| No background job support   | Polling = "inactive"  | Self-ping = HTTP activity     |

## Alternative: Upgrade to Paid Plan

If SIGTERM persists after this fix, consider:

**Render Paid Plan ($7/month):**

- ✅ No inactivity timeout
- ✅ More disk space (1GB+)
- ✅ Better for background services
- ✅ Faster deployment
- ✅ More reliable

**Free Tier:**

- ❌ 15 min inactivity = shutdown
- ❌ Limited disk (~500MB)
- ❌ Slower cold starts
- ⚠️ Needs workarounds (keep-alive)

## Monitoring

Watch for:

1. **Keep-alive logs** - Should see ping every 10 minutes
2. **No SIGTERM** - Service should run continuously
3. **Disk usage** - Should stay below 75% most of the time
4. **Cleanup logs** - Should see periodic cleanups freeing space

## Testing

After deployment:

```bash
# Watch logs for keep-alive
# Should see every 10 minutes:
"⏰ Keep-alive job added (pings self every 10 minutes)"

# Check disk cleanup
# Should see when disk > 75%:
"🧹 Cleaned up X old files"

# Verify no SIGTERM
# Should NOT see frequently:
"📡 Received signal 15"
```

## If SIGTERM Still Happens

If service still gets SIGTERM after these fixes:

1. **Check Render Dashboard**

   - Look for deploy/restart events
   - Check resource usage graphs

2. **Check Logs**

   - Memory usage warnings?
   - Disk still 80%+?
   - Keep-alive working?

3. **Consider Upgrading**
   - Free tier may not support your workload
   - Paid plan = more reliable for polling

---

**Deployed:** Commit 38c7341  
**Status:** Monitor for 24-48 hours
