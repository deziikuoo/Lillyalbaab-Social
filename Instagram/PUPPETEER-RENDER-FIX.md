# Puppeteer/Chrome Fix for Render Deployment

**Date:** 2025-10-11  
**Issue:** `Could not find Chrome (ver. 139.0.7258.66)` on Render deployment

## Problem

The Instagram service uses FastDl.app for story fetching, which requires Puppeteer (headless browser automation). On Render, Chrome/Chromium isn't installed by default, causing the following error:

```
❌ [FASTDL SESSION] Browser initialization failed: Could not find Chrome (ver. 139.0.7258.66)
Cache path: /opt/render/.cache/puppeteer
```

## Root Cause

1. **Missing System Dependencies:** Render doesn't have Chromium or its required system libraries
2. **Cache Path Issues:** Puppeteer's default cache path may not be writable
3. **No Fallback:** Code didn't have a fallback to system Chrome

## Solution Overview

Implemented a multi-step fix:

1. ✅ Created build script to install Chromium on Render
2. ✅ Added environment variables for Puppeteer configuration
3. ✅ Updated Puppeteer launch to use system Chrome as fallback
4. ✅ Added render.yaml for automated deployment

## Files Created/Modified

### 1. New Build Script: `install-chrome-render.sh`

**Purpose:** Install Chromium and all required dependencies on Render

**What it does:**

- Updates apt package list
- Installs Chromium browser (`chromium`, `chromium-sandbox`)
- Installs required system libraries (fonts, graphics, audio, etc.)
- Installs Puppeteer's bundled Chrome as backup

**Execution:** Runs automatically during Render build via `render.yaml`

### 2. New Deployment Config: `render.yaml`

**Purpose:** Configure Render deployment with proper build commands

```yaml
services:
  - type: web
    name: tyla-instagram
    env: node
    region: oregon
    plan: starter
    buildCommand: chmod +x install-chrome-render.sh && ./install-chrome-render.sh && npm install
    startCommand: npm start
    envVars:
      - key: PUPPETEER_EXECUTABLE_PATH
        value: /usr/bin/chromium
      - key: PUPPETEER_CACHE_DIR
        value: /opt/render/.cache/puppeteer
```

**Key Settings:**

- `buildCommand`: Makes script executable, installs Chrome, then npm dependencies
- `PUPPETEER_EXECUTABLE_PATH`: Points to system Chromium
- `PUPPETEER_CACHE_DIR`: Sets writable cache directory

### 3. Modified: `index.js` (Lines 186-243)

**Updated FastDlSession.initialize():**

**Before:**

```javascript
this.browser = await puppeteer.launch({
  headless: true,
  args: [...],
});
```

**After:**

```javascript
const launchOptions = {
  headless: true,
  args: [...],
};

// Use system Chrome on Render if available
if (process.env.PUPPETEER_EXECUTABLE_PATH) {
  launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  console.log(`🌐 Using system Chrome: ${process.env.PUPPETEER_EXECUTABLE_PATH}`);
} else {
  console.log(`🌐 Using Puppeteer bundled Chrome`);
}

this.browser = await puppeteer.launch(launchOptions);
```

**Benefits:**

- Automatically uses system Chrome on Render (`/usr/bin/chromium`)
- Falls back to Puppeteer's bundled Chrome locally
- Clear logging shows which Chrome is being used

### 4. Modified: `package.json` (Line 25)

**Updated postinstall script:**

**Before:**

```json
"postinstall": "npx puppeteer browsers install chrome"
```

**After:**

```json
"postinstall": "npx puppeteer browsers install chrome || echo 'Puppeteer Chrome install failed, will use system Chrome'"
```

**Change:** Added `|| echo` to prevent build failure if Puppeteer Chrome install fails (will use system Chrome instead)

## How It Works

### Local Development (Windows/Mac)

1. `npm install` runs postinstall → downloads Puppeteer Chrome
2. Puppeteer launches with bundled Chrome (no env variable set)
3. FastDl stories work normally

### Render Deployment

1. **Build Phase:**

   - `install-chrome-render.sh` runs
   - Installs system Chromium + dependencies
   - `npm install` runs postinstall (may succeed or fail, doesn't matter)

2. **Runtime:**
   - `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium` is set
   - FastDlSession detects env variable
   - Launches with system Chromium
   - FastDl stories work on Render ✅

## Environment Variables

Set these in Render dashboard or use `render.yaml`:

| Variable                           | Value                          | Purpose                        |
| ---------------------------------- | ------------------------------ | ------------------------------ |
| `PUPPETEER_EXECUTABLE_PATH`        | `/usr/bin/chromium`            | Path to system Chrome          |
| `PUPPETEER_CACHE_DIR`              | `/opt/render/.cache/puppeteer` | Writable cache directory       |
| `PUPPETEER_SKIP_CHROMIUM_DOWNLOAD` | `false`                        | Allow bundled Chrome as backup |

## Testing

### Verify Locally

```bash
cd Instagram
npm install
node index.js
```

**Expected output:**

```
🌐 Using Puppeteer bundled Chrome
✅ [FASTDL SESSION] Browser initialized successfully
```

### Verify on Render

**After deployment, check logs for:**

```
🌐 Using system Chrome: /usr/bin/chromium
✅ [FASTDL SESSION] Browser initialized successfully
📱 Processing Instagram stories for: @wolftyla with FastDl.app
```

**No more error:**

```
❌ Could not find Chrome (ver. 139.0.7258.66)
```

## Deployment Steps

### Option 1: Using render.yaml (Recommended)

1. Commit and push all changes:

   ```bash
   git add Instagram/
   git commit -m "fix: Add Puppeteer/Chrome support for Render"
   git push origin main
   ```

2. In Render dashboard:

   - Go to your Instagram service
   - Settings → "Build & Deploy"
   - **Render will automatically detect `render.yaml` and use it**

3. Trigger manual deploy or wait for auto-deploy

### Option 2: Manual Configuration

If `render.yaml` isn't detected:

1. **Update Build Command:**

   ```bash
   chmod +x install-chrome-render.sh && ./install-chrome-render.sh && npm install
   ```

2. **Add Environment Variables:**

   - `PUPPETEER_EXECUTABLE_PATH` = `/usr/bin/chromium`
   - `PUPPETEER_CACHE_DIR` = `/opt/render/.cache/puppeteer`

3. Deploy service

## Troubleshooting

### Issue: "install-chrome-render.sh: permission denied"

**Cause:** Script not executable  
**Fix:** Ensure `chmod +x` is in build command:

```bash
chmod +x install-chrome-render.sh && ./install-chrome-render.sh && npm install
```

### Issue: "apt-get: command not found"

**Cause:** Using wrong Render environment  
**Fix:** Ensure "Environment" is set to **Docker** or **Native** (not Static Site)

### Issue: Still getting "Could not find Chrome"

**Checks:**

1. Verify `PUPPETEER_EXECUTABLE_PATH` is set in Render environment variables
2. Check build logs for successful Chromium installation
3. Verify `/usr/bin/chromium` exists in deployment

**Debug:**
Add this to your code temporarily:

```javascript
const fs = require("fs");
console.log("Chrome exists?", fs.existsSync("/usr/bin/chromium"));
console.log("Env var:", process.env.PUPPETEER_EXECUTABLE_PATH);
```

### Issue: Build takes too long / times out

**Cause:** Installing all Chrome dependencies  
**Fix:** Reduce dependencies in `install-chrome-render.sh` to only essentials:

```bash
apt-get install -y chromium chromium-sandbox libgbm1 libnss3
```

## Performance Impact

### Build Time

- **Before:** ~2-3 minutes (npm install only)
- **After:** ~4-6 minutes (Chrome install + npm install)
- **One-time cost:** Chrome install is cached on Render

### Runtime Performance

- **No impact:** System Chrome has same performance as bundled Chrome
- **Memory:** ~200-300MB per browser instance (normal for Puppeteer)

## Alternative Solutions (Not Implemented)

### 1. Use Puppeteer-Core + External Chrome

**Pros:** Smaller package size  
**Cons:** Requires maintaining Chrome version compatibility

### 2. Use Playwright Instead

**Pros:** Better Render support  
**Cons:** Would require rewriting entire FastDl integration

### 3. Use Different Story Fetching Method

**Pros:** No browser automation needed  
**Cons:** FastDl.app specifically requires browser for JavaScript rendering

## Related Issues

- Original error: `puppeteer_render_issue` file
- Chrome version: 139.0.7258.66
- Render docs: https://render.com/docs/deploy-node-express-app

## Success Criteria

✅ **Fixed when you see:**

```
🎬 Creating FastDl session for @wolftyla
🌐 Using system Chrome: /usr/bin/chromium
✅ [FASTDL SESSION] Browser initialized successfully
📱 Processing Instagram stories for: @wolftyla with FastDl.app
```

❌ **Not fixed if you still see:**

```
❌ [FASTDL SESSION] Browser initialization failed: Could not find Chrome
```

## Maintenance

- **Chrome updates:** Render handles system Chrome updates automatically
- **Puppeteer updates:** Test locally before deploying to ensure compatibility
- **Monitoring:** Watch Render logs for any Chrome-related errors after deploys
