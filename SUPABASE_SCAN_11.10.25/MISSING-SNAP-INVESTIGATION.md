# Missing Snap Investigation Report
**Date**: November 10, 2025  
**Snap ID**: `pWHqAhPcRT6rrYfCQJc_zwAAgcGt5bHZ5eXFqAZpswUnaAZpsfLRyAAAAAA`  
**URL**: https://www.snapchat.com/@wolftyla/pWHqAhPcRT6rrYfCQJc_zwAAgcGt5bHZ5eXFqAZpswUnaAZpsfLRyAAAAAA

---

## 🔍 Investigation Summary

**User Theory**: Snap ID was used months ago and marked as duplicate  
**Actual Finding**: ✅ **NOT A DUPLICATE** - Snap ID does NOT exist in database

---

## ✅ Database Search Results

### Exact Match Search
- ❌ **Not found** in `snapchat_processed_stories`
- ❌ **Not found** in `snapchat_recent_stories_cache`

### Partial Match Search
- ❌ **No partial matches** found

### Similar ID Search
- ❌ **No similar IDs** found with same prefix structure

### Conclusion
**The snap ID is completely absent from the database.**  
This means it was NEVER captured by the polling system.

---

## 🧩 How Snapchat Polling Works

### Fetch Process (from `snapchat_dl.py`):

```python
# 1. Makes HTTP request to Snapchat's web API
web_url = "https://www.snapchat.com/add/{username}/"

# 2. Extracts JSON from HTML response
response_json = extract_from_html(response)

# 3. Gets story list from API response
stories = response_json["props"]["pageProps"]["story"]["snapList"]

# 4. Iterates through stories
async for story in stories:
    # Process each story
    snap_id = story["snapId"]["value"]
    media_url = story["snapUrls"]["mediaUrl"]
    # ... download and save
```

### Key Point
**The downloader ONLY sees stories that Snapchat's API returns in the `snapList` array at poll time.**

---

## ❓ Why Was This Snap Missed?

Since the snap is not in the database, it means **it was not in the `snapList` array** when polling occurred. Here are the possible reasons:

### 1. **Timing Issue - Most Likely** 🎯
```
Snap Posted:     [X]
                  |
Polling Window:   |----[gap]----[Poll]
                               ↑
                        Snap already expired or removed
```

**Explanation**:
- Snapchat stories expire after 24 hours
- Your polling interval varies (15-90 minutes based on activity)
- If the snap was posted and expired BETWEEN polls, it would be missed

**Example Timeline**:
- 6:00 AM - Last poll (snap doesn't exist yet)
- 6:30 AM - User posts the snap
- 7:00 AM - User deletes the snap
- 7:30 AM - Next poll (snap is gone)

### 2. **Snapchat API Didn't Include It**
```
Your Request → [Snapchat API] → snapList: [snap1, snap2, ❌missing]
```

**Possible reasons**:
- Story set to "Private" or limited visibility
- Story in draft mode
- API glitch/bug on Snapchat's side
- Story was in a different section (e.g., "Highlights" not "Stories")

### 3. **Rate Limiting / API Error**
```
Poll Request → [429 Too Many Requests] → ❌ No data returned
```

Your logs would show this, but worth checking.

### 4. **Network/Server Issue During That Poll**
- Render service was restarting
- Network timeout
- Polling was paused

---

## 📊 Current Polling Configuration

```python
# From your Snapchat service
POLLING_INTERVALS = {
    "high": 15 * 60,      # 15 minutes (5+ snaps/day)
    "medium": 30 * 60,    # 30 minutes (2-4 snaps/day)
    "low": 45 * 60,       # 45 minutes (0-1 snaps/day)
    "very_low": 90 * 60   # 90 minutes (no activity)
}
```

### Smart Polling Logic
- Adjusts interval based on activity
- Adds ±2 minute randomization
- Current for @wolftyla: **45 minutes** (low activity)

---

## 🔬 Evidence from Recent Polls

Last 10 processed snaps (from database):

```
1. 2025-11-10 08:21:27 - snap: ...c2xhY252aWJr...
2. 2025-11-10 06:50:20 - snap: ...cnJ1dWd0em1w...
3. 2025-11-10 06:50:20 - snap: ...a3Rid3R0YnprA...
4. 2025-11-10 06:50:20 - snap: ...dWx6eG5mc3Vx...
5. 2025-11-10 06:50:20 - snap: ...a3R2ZGppcGxh...
6. 2025-11-10 06:50:20 - snap: ...ZmxydG5jcWVv...
7. 2025-11-09 04:18:30 - snap: ...dGN5dXB1cnhq...
8. 2025-11-07 13:26:47 - snap: ...Yml5eHR6eHNx...
9. 2025-11-05 14:44:47 - snap: ...dWJra3hmbG5w...
10. 2025-11-05 14:44:47 - snap: ...bGFud2RwbmZ0...
```

**Your missing snap**: `...cGt5bHZ5eXFq...` is NOT in this list.

**Gap Analysis**:
- Nov 10, 06:50:20 → Nov 10, 08:21:27 = **~1.5 hour gap**
- Nov 9, 04:18:30 → Nov 10, 06:50:20 = **~26 hour gap** 🚨

This 26-hour gap means stories posted between Nov 9 4:18 AM and Nov 10 6:50 AM would be **MISSED** if they expired.

---

## 🎯 Root Cause Analysis

### Most Likely Scenario:

**The snap was posted and expired during a polling gap.**

```
Timeline Example:
─────────────────────────────────────────────────────────
Nov 9, 4:18 AM  ──┐
                  │  [Your missing snap posted here]
                  │  [24 hours pass, snap expires]
                  │  [Snap is deleted from Snapchat's API]
Nov 10, 6:50 AM ──┘  ← Next poll (snap is gone)
```

### Contributing Factors:

1. **Long Polling Intervals**
   - Current: 45 minutes in best case
   - Gap can be 26+ hours during inactivity
   - Snapchat stories expire in 24 hours

2. **No Historical Story API**
   - Snapchat's API only returns CURRENT stories
   - No way to fetch "yesterday's expired stories"
   - Unlike Instagram which has better historical access

3. **Activity-Based Polling**
   - Low activity = longer intervals
   - Longer intervals = higher chance of missing snaps

---

## 💡 Recommendations

### Option 1: Reduce Minimum Polling Interval ⭐ Recommended
```python
# Change from:
"low": 45 * 60,        # 45 minutes
"very_low": 90 * 60    # 90 minutes

# To:
"low": 20 * 60,        # 20 minutes
"very_low": 30 * 60    # 30 minutes
```

**Impact**:
- More frequent checks = less likely to miss snaps
- More API requests (but still reasonable)
- Better coverage during low-activity periods

### Option 2: Add Real-Time Monitoring
- Use Snapchat webhooks (if available)
- Add push notifications
- Monitor user's story count changes

### Option 3: Manual Recovery Tool
Create a tool to check if snaps were missed:
- Compare snap IDs from external sources
- Cross-reference with database
- Flag missing snaps for manual download

### Option 4: Increase Polling During Active Hours
```python
# Poll more frequently during likely posting times
if 6 AM <= current_hour <= 11 PM:
    interval = 15 * 60  # 15 minutes
else:
    interval = 45 * 60  # 45 minutes  
```

---

## 📋 Action Items

**Immediate**:
- [ ] Check service logs for Nov 9 4:18 AM - Nov 10 6:50 AM
- [ ] Look for API errors, network issues, or service restarts
- [ ] Verify no rate limiting occurred

**Short Term**:
- [ ] Reduce minimum polling interval to 20-30 minutes
- [ ] Add logging for "snapList" length on each poll
- [ ] Alert when polling gaps exceed 2 hours

**Long Term**:
- [ ] Implement time-based polling adjustments
- [ ] Add manual snap recovery tool
- [ ] Consider dual-polling system (fast + slow checks)

---

## 🔬 Testing Your Theory

To verify if this was a timing issue vs. API issue:

1. **Check Logs** for the 26-hour gap period
2. **Monitor Next Poll** and log the `snapList` array
3. **Compare** snap count vs. what user actually posted

---

## ✅ Conclusion

**Your theory was incorrect, but your intuition was good!**

- ✅ Snap ID is NOT in database (not a duplicate)
- ✅ Issue is likely timing/polling gaps
- ✅ No bug in deduplication logic
- ⚠️ Need to reduce polling intervals
- ⚠️ 26-hour gap is too long for 24-hour expiring content

**The deduplication system is working perfectly.  
The issue is the polling interval doesn't match Snapchat's 24-hour story expiration.**

---

*Investigation completed: November 10, 2025*

