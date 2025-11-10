# How to Debug Snapchat API on Render.com

Since Render doesn't provide SSH access, I've added a **debug API endpoint** you can call from your browser.

---

## 🎯 Step-by-Step Instructions

### 1. Wait for Deployment (2-3 minutes)

Render is automatically deploying the new endpoint now.

Check deployment status:
- Go to https://dashboard.render.com
- Click on your Snapchat Python service
- Wait for "Deploy succeeded" message

### 2. Call the Debug Endpoint

Once deployed, open this URL in your browser:

```
https://tyla-social-snapchat-python.onrender.com/debug-api/wolftyla
```

**Or use curl**:
```bash
curl https://tyla-social-snapchat-python.onrender.com/debug-api/wolftyla
```

### 3. Analyze the Response

The endpoint returns JSON with:
```json
{
  "success": true,
  "username": "wolftyla",
  "stories": {
    "snap_count": 9,
    "snaps": [
      {
        "snap_id": "pWHqAhPcRT6rrYfCQJc_zwAAgc2xhY252aWJr...",
        "media_type": 1,
        "timestamp": 1731233847
      },
      ...
    ]
  },
  "highlights": {
    "curated_count": 0,
    "spot_count": 0
  }
}
```

### 4. Look for Your Missing Snap

**Your missing snap ID**:
```
pWHqAhPcRT6rrYfCQJc_zwAAgcGt5bHZ5eXFqAZpswUnaAZpsfLRyAAAAAA
```

**Check**:
- ✅ Is this snap ID in the `snaps` array?
- ✅ How many snaps total does the API return?
- ✅ Are there any highlights or spotlight stories?

---

## 📊 What to Look For

### If Your Snap IS in the Response:
**Problem**: Filtering/processing logic  
**Solution**: Check database query logic

### If Your Snap is NOT in the Response:
**Problem**: Snapchat API limitation  
**Possible Causes**:
1. Snap is private/restricted
2. Snap is in highlights (different section)
3. Snap requires authentication
4. API pagination (snap on page 2+)

---

## 🔍 Compare Results

Run the debug endpoint and compare:

| Source | Count |
|--------|-------|
| Snapchat Mobile App | ? (count stories in app) |
| Debug API Response | ? (from JSON) |
| Database | 9 (from recent scan) |

If counts don't match → API is missing some snaps

---

## 💡 Alternative Methods

### Option 2: Check Render Logs

1. Go to https://dashboard.render.com
2. Click your Snapchat service
3. Click "Logs" tab
4. Trigger a manual poll: `GET /poll-now`
5. Search logs for snap IDs

### Option 3: Run Locally

Since you have the code locally:

```bash
cd Snapchat-Service
python debug-snapchat-api.py wolftyla > debug-output.txt
```

Then compare the output.

---

## 🚨 What to Send Me

After running the debug endpoint, send me:

1. **Total snap count** from the API
2. **Whether your missing snap ID appears**
3. **All snap IDs** (first 50 chars of each)
4. **How many snaps you see in the actual Snapchat app**

Example:
```
API returned: 9 snaps
Missing snap: NOT FOUND
IDs in API:
  - pWHqAhPcRT6rrYfCQJc_zwAAgc2xhY252aWJr...
  - pWHqAhPcRT6rrYfCQJc_zwAAgcnJ1dWd0em1w...
  - ...
Snapchat app shows: 10 snaps
```

This will tell us exactly what Snapchat's API is returning!

---

## 📝 Quick Reference

**Debug Endpoint URL**:
```
https://tyla-social-snapchat-python.onrender.com/debug-api/wolftyla
```

**Missing Snap ID** (search for this):
```
pWHqAhPcRT6rrYfCQJc_zwAAgcGt5bHZ5eXFqAZpswUnaAZpsfLRyAAAAAA
```

**Service URL**:
```
https://tyla-social-snapchat-python.onrender.com
```

---

*Created: November 10, 2025*

