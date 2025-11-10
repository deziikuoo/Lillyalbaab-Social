# Missing Snap - REAL Investigation
**UPDATED**: November 10, 2025  
**Status**: 🚨 **CRITICAL FINDING**

---

## 🔥 NEW INFORMATION FROM USER

**User reports**:
- Snap was posted **2 hours ago** (currently active)
- Service restarted **10 minutes ago**  
- Fresh poll ran immediately after restart
- **All other snaps** showed as "cached" (correct - already processed)
- **This specific snap** was NOT found at all

**This changes everything!**

---

## 🔍 Code Analysis

### How Polling Works (from `main.py:2517-2588`):

```python
async def check_for_new_stories():
    # Step 1: Fetch stories from Snapchat API
    async for story, user_info in snapchat_dl._web_fetch_story(TARGET_USERNAME):
        stories.append(story_data)
    
    # Step 2: Filter NEW vs CACHED
    new_stories = await find_new_stories(TARGET_USERNAME, stories)
    
    # Step 3: Download and send only NEW stories
    await download_filtered_stories(TARGET_USERNAME, new_stories)
```

### The Filtering Logic (`main.py:876-906`):

```python
async def find_new_stories(username, fetched_stories):
    # Get cached stories
    cached_stories = await get_cached_recent_stories(username)
    cached_snap_ids = {story['snap_id'] for story in cached_stories}
    
    # Filter out cached ones
    new_stories = []
    for story in fetched_stories:
        if story['snap_id'] not in cached_snap_ids:
            new_stories.append(story)
    
    return new_stories
```

---

## 🎯 THE REAL PROBLEM

**Your snap NEVER makes it to the filtering step!**

```
Flow for your missing snap:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Snapchat API call → snapList: [snap1, snap2, snap3, ❌ YOUR SNAP MISSING]
2. Loop through stories → Only processes snap1, snap2, snap3
3. Filter cached → snap1, snap2, snap3 all marked as "cached"
4. Send new ones → Nothing to send
```

**Your snap is NOT in Snapchat's API response at all!**

Other snaps showed as "cached" because:
- They WERE in the API response
- They WERE in your database
- System correctly identified them as already processed

Your snap didn't show as anything because:
- **It's not in the API response**
- Never reached the filtering code
- Never got logged as "cached" or "new"

---

## ❓ Why Is Snapchat's API Excluding This Snap?

### Possible Reasons:

#### 1. **Story Visibility Settings** 🎯 Most Likely
The snap may have visibility restrictions:
- Set to "Close Friends" only
- Custom story (not public story)
- Geo-filtered story
- Age-restricted content

**Snapchat's web API only returns PUBLIC stories.**

#### 2. **Story Location in Snapchat**
The snap might be in a different section:
- Highlighted story (not regular story)
- Spotlight (different endpoint)
- Private/My Story vs Public Story
- Part of a custom story list

#### 3. **Story Format/Type Issue**
- Uses a newer Snapchat feature not in the API yet
- AR Lens story
- Music story
- Special format the web API doesn't expose

#### 4. **API Pagination**
- Snapchat's API might paginate results
- Your code only fetches first page
- This snap might be on page 2+

#### 5. **API Timing/Cache**
- Snapchat's CDN hasn't propagated yet
- API response is cached on Snapchat's side
- Need to wait for cache refresh

---

## 🔬 How to Investigate

### Step 1: Capture Raw API Response

Run this debug script on your server:

```bash
cd Snapchat-Service
python debug-snapchat-api.py wolftyla
```

This will:
- Show you the EXACT `snapList` Snapchat returns
- Save full JSON response to file
- List all snap IDs currently in the API

**Look for**:
- Total number of snaps in `snapList`
- Whether your missing snap ID appears anywhere
- Any pagination indicators
- Alternative story sections (highlights, etc.)

### Step 2: Compare Snap IDs

Your missing snap ID:
```
pWHqAhPcRT6rrYfCQJc_zwAAgcGt5bHZ5eXFqAZpswUnaAZpsfLRyAAAAAA
```

**Check**:
- Does this exact ID appear in the debug output?
- Are there similar IDs (different suffix)?
- Is the snap in `curatedHighlights` or `spotHighlights` instead?

### Step 3: Manual Verification

Open the snap URL in a browser (incognito mode):
```
https://www.snapchat.com/@wolftyla/pWHqAhPcRT6rrYfCQJc_zwAAgcGt5bHZ5eXFqAZpswUnaAZpsfLRyAAAAAA
```

**Check**:
- Does it load in a browser?
- Does it show "This story is no longer available"?
- Does it require login?
- Does it show "This story is private"?

### Step 4: Check Snapchat App

**In the actual Snapchat mobile app**:
- Go to @wolftyla's profile
- View their stories
- Count how many stories you see
- Check if the timestamps match what the API returns

---

## 🛠️ Possible Solutions

### Solution 1: Check Story Type in Snapchat App

**If the snap is visible in the app but not the API**:
- It's likely a visibility/privacy issue
- The web API doesn't have access
- You may need Snapchat's private/authenticated API

### Solution 2: Implement Highlights/Spotlight Fetching

Your code already extracts these but doesn't process them:

```python
# From snapchat_dl.py line 161-162
curated_highlights = util_web_extract(response_json, "curatedHighlights")
spot_highlights = util_web_extract(response_json, "spotHighlights")
```

**Add polling for these sections too!**

### Solution 3: Add API Response Logging

Add this to `check_for_new_stories()` at line 2550:

```python
logger.info(f"📊 [POLL] Found {len(stories)} total stories from Snapchat")

# ADD THIS:
logger.info(f"🔍 [DEBUG] Snap IDs from API:")
for story in stories:
    logger.info(f"   - {story['snap_id'][:50]}... ({story['type']})")
```

This will log every snap ID returned by the API.

### Solution 4: Add Pagination Support

Snapchat might paginate results. Check if there's a "next page" indicator in the API response.

---

## 🎯 IMMEDIATE ACTION

**Run this RIGHT NOW on your Render service**:

```bash
# SSH or use Render shell
cd /opt/render/project/src/Snapchat-Service
python debug-snapchat-api.py wolftyla > api_debug_$(date +%Y%m%d_%H%M%S).txt

# Then download and examine the file
```

This will show you:
1. Exactly what snaps Snapchat's API returns
2. Whether your missing snap is there
3. What other data structures exist

---

## 📋 Checklist

- [ ] Run debug script and capture API response
- [ ] Verify snap URL loads in browser (incognito)
- [ ] Check if snap is visible in Snapchat mobile app
- [ ] Compare snap count: App vs API vs Database
- [ ] Check if snap is in highlights/spotlight instead
- [ ] Look for pagination indicators in API response
- [ ] Check if snap has privacy/visibility restrictions

---

## 💡 Most Likely Conclusion

Based on the evidence:

**The snap is NOT in Snapchat's public web API response.**

This could be because:
1. **Privacy/Visibility settings** (most likely)
2. **Different story section** (highlights, not stories)
3. **Not yet propagated** to web API (CDN delay)
4. **Pagination** (on page 2+)

**Your code is working correctly.** The issue is with what Snapchat's API is providing.

---

## 🔧 Render Storage Note

**You asked about Render storage** - that's NOT the issue here.

Storage would only affect:
- Downloaded files (after fetching)
- Metadata files
- Cache files

Storage would NOT affect:
- Whether the API returns a snap
- Whether a snap appears in the `snapList`
- The filtering/deduplication logic

The snap never gets downloaded because **it's never in the API response to begin with**.

---

*Investigation updated: November 10, 2025*  
*Next step: Run debug script and examine raw API response*

