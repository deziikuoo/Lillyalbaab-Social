# Render Dual Account Rotation System - Complete Guide

## Overview

Run 2 backend servers 24/7 using two separate Render accounts, switching between them monthly when free runtime runs out.

**Current Setup:**

- Account 1: Running 2 servers (Instagram + Snapchat)
- Account 2: Standby (to be created)

---

## Phase 1: Initial Setup (One-Time Tasks)

### Step 1.1: Create Second Render Account

1. **Sign up for new Render account:**

   - Go to [render.com](https://render.com)
   - Use a **different email address** (can use same GitHub account)
   - Complete signup process

2. **Verify account:**
   - Check email for verification
   - Log into new Render dashboard

---

### Step 1.2: Connect GitHub Repo to Account 2

1. **In Account 2 dashboard:**

   - Click "New +" → "Web Service"

2. **Select repository:**

   - Connect to same GitHub repo: `deziikuoo/Tyla-Social`
   - Authorize if prompted

3. **Create Instagram Backend Service:**

   ```
   Name: tyla-social-instagram
   Region: Same as Account 1 (e.g., Oregon)
   Branch: main
   Root Directory: Instagram
   Runtime: Node
   Build Command: cd Instagram && chmod +x install-chrome-render.sh && ./install-chrome-render.sh && npm install
   Start Command: cd Instagram && npm start
   Instance Type: Free
   ```

4. **Create Snapchat Backend Service:**

   ```
   Name: tyla-social-snapchat
   Region: Same as Account 1
   Branch: main
   Root Directory: Snapchat-Service/server
   Runtime: Python 3
   Build Command: pip install -r requirements.txt
   Start Command: uvicorn main:app --host 0.0.0.0 --port $PORT
   Instance Type: Free
   ```

5. **Don't deploy yet** - we'll configure everything first

---

### Step 1.3: Mirror Environment Variables (Account 2)

**For Instagram Service (Account 2):**

1. Go to Account 1 → Instagram service → Environment tab
2. Copy ALL environment variables
3. Go to Account 2 → Instagram service → Environment tab
4. Add each variable exactly:

```
NODE_ENV=production
PORT=3000
SUPABASE_URL=https://tuvyckzfwdtaieajl.ezh.supabase.co
SUPABASE_KEY=<your-supabase-key>
TELEGRAM_BOT_TOKEN=<your-telegram-token>
TELEGRAM_CHANNEL_ID=-1002885871132
TELEGRAM_AUTH=true
SNAPCHAT_SERVICE_URL=https://tyla-social-snapchat.onrender.com
USER_AGENT=Mozilla/5.0 (Windows NT 10.0; Win64; x64)
X_IG_APP_ID=936619743392459
TZ=America/New_York
PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=false
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
PUPPETEER_CACHE_DIR=/opt/render/project/src/data/chrome
```

**For Snapchat Service (Account 2):**

1. Go to Account 1 → Snapchat service → Environment tab
2. Copy ALL environment variables
3. Go to Account 2 → Snapchat service → Environment tab
4. Add each variable exactly:

```
API_HOST=127.0.0.1
API_PORT=8000
DOWNLOADS_DIRECTORY=downloads
FRONTEND_URL=https://tyla-social.vercel.app
PORT=8000
SNAPCHAT_SERVICE_URL=https://tyla-social-snapchat.onrender.com
TELEGRAM_AUTH=true
TELEGRAM_BOT_TOKEN=<your-telegram-token>
TELEGRAM_CHANNEL_ID=-1002885871132
SUPABASE_URL=https://tuvyckzfwdtaieajl.ezh.supabase.co
SUPABASE_KEY=<your-supabase-key>
```

**⚠️ CRITICAL:** Double-check all secrets match exactly - especially:

- Supabase URLs and keys
- Telegram tokens
- Any API keys

---

### Step 1.4: Prepare UptimeRobot Monitors

1. **Go to UptimeRobot dashboard**

2. **Create monitors for Account 2 (but keep them DISABLED):**

   - Monitor 1:

     - Name: `Instagram Account 2`
     - URL: `https://tyla-social-instagram.onrender.com/health`
     - Type: HTTP(s)
     - Interval: 5 minutes
     - Status: **DISABLED** ⚠️

   - Monitor 2:
     - Name: `Snapchat Account 2`
     - URL: `https://tyla-social-snapchat.onrender.com/health`
     - Type: HTTP(s)
     - Interval: 5 minutes
     - Status: **DISABLED** ⚠️

3. **Keep Account 1 monitors ENABLED** (for now)

---

### Step 1.5: Document Service URLs

**Create a reference document:**

**Account 1 URLs:**

- Instagram: `https://tyla-social.onrender.com`
- Snapchat: `https://tyla-social-snapchat.onrender.com`

**Account 2 URLs:**

- Instagram: `https://tyla-social-instagram.onrender.com`
- Snapchat: `https://tyla-social-snapchat.onrender.com`

**Save these URLs** - you'll need them for rotation

---

## Phase 2: Monthly Rotation Procedure

### When Account 1 Hits Usage Limit

**You'll know when:**

- Render sends email about usage limit
- Services stop responding
- Dashboard shows "Usage limit reached"

---

### 🔽 Phase 2.1: Shutdown Account 1

#### Step 1: Turn Off UptimeRobot Monitors for Account 1

1. Go to UptimeRobot dashboard
2. Find monitors for Account 1 services
3. **Disable both monitors:**
   - Instagram Account 1 → Edit → Disable
   - Snapchat Account 1 → Edit → Disable

**Why:** Prevents unnecessary pinging of stopped services

---

#### Step 2: Suspend Render Services in Account 1

1. **Go to Account 1 Render dashboard**

2. **Suspend Instagram service:**

   - Click `tyla-social` service
   - Click "Manual Suspend" (or "Suspend" in settings)
   - Confirm suspension

3. **Suspend Snapchat service:**

   - Click `tyla-social-snapchat` service
   - Click "Manual Suspend"
   - Confirm suspension

4. **Verify both are suspended:**
   - Both should show "Suspended" status
   - No polling/background processes running

**⚠️ Important:** Make sure services are fully stopped to avoid duplicate polling

---

### 🔼 Phase 2.2: Activate Account 2

#### Step 3: Deploy Account 2 Services

1. **Go to Account 2 Render dashboard**

2. **Deploy Instagram service:**

   - Click `tyla-social-instagram` service
   - Click "Manual Deploy" → "Deploy latest commit"
   - Wait for deployment to complete (green status)

3. **Deploy Snapchat service:**

   - Click `tyla-social-snapchat` service
   - Click "Manual Deploy" → "Deploy latest commit"
   - Wait for deployment to complete

4. **Verify both are running:**
   - Both should show "Live" status
   - Check logs for any errors

---

#### Step 4: Verify Environment Variables

**Quick health checks:**

1. **Test Instagram service:**

   ```bash
   curl https://tyla-social-instagram.onrender.com/health
   ```

   Should return: `{"status":"ok"}` or similar

2. **Test Snapchat service:**

   ```bash
   curl https://tyla-social-snapchat.onrender.com/health
   ```

   Should return: `{"status":"ok"}` or similar

3. **Check logs for errors:**
   - Instagram service → Logs tab
   - Snapchat service → Logs tab
   - Look for connection errors, missing env vars, etc.

**If errors found:**

- Compare env vars with Account 1
- Fix any mismatches
- Redeploy service

---

#### Step 5: Update UptimeRobot

1. **Disable Account 1 monitors** (if not already done)

2. **Enable Account 2 monitors:**

   - Instagram Account 2 → Edit → Enable
   - Snapchat Account 2 → Edit → Enable

3. **Verify monitors are active:**
   - Both should show green status
   - Check that they're pinging successfully

---

#### Step 6: Update Frontend (Vercel Environment Variables)

1. **Go to Vercel Dashboard**

   - Project → Settings → Environment Variables

2. **Update Instagram API URL:**

   - Find `VITE_INSTAGRAM_API_BASE`
   - Change value to: `https://tyla-social-instagram.onrender.com`
   - Save

3. **Update Snapchat API URL:**

   - Find `VITE_SNAPCHAT_API_BASE`
   - Change value to: `https://tyla-social-snapchat.onrender.com`
   - Save

4. **Redeploy Vercel:**
   - Go to Deployments tab
   - Click "..." on latest deployment
   - Click "Redeploy"
   - Or push a commit to trigger auto-deploy

**Alternative (if using single API URL):**

- Update `VITE_INSTAGRAM_API_BASE` to point to Account 2 Instagram service
- Update `SNAPCHAT_SERVICE_URL` in Instagram service env vars to Account 2 Snapchat URL

---

#### Step 7: Test Everything

**Test checklist:**

- [ ] **Frontend loads:** Open Vercel app, verify it loads
- [ ] **Instagram download:** Test downloading Instagram content
- [ ] **Snapchat download:** Test downloading Snapchat content
- [ ] **Polling active:** Check that automatic polling is working
- [ ] **Database:** Verify data is being written to Supabase
- [ ] **Telegram:** Check that notifications are being sent
- [ ] **UptimeRobot:** Verify monitors show green status

**If everything works:** ✅ Rotation complete!

**If issues:**

- Check service logs
- Verify environment variables
- Test endpoints individually
- Check UptimeRobot monitor status

---

## Phase 3: Reverse Rotation (Account 2 → Account 1)

**When Account 2 runs out of hours, reverse the process:**

1. **Shutdown Account 2:**

   - Disable UptimeRobot monitors for Account 2
   - Suspend both services in Account 2

2. **Activate Account 1:**

   - Unsuspend services in Account 1
   - Deploy latest commits
   - Enable UptimeRobot monitors for Account 1
   - Update Vercel environment variables back to Account 1 URLs
   - Redeploy Vercel

3. **Test everything**

---

## Quick Reference: Service URLs

### Account 1

- Instagram: `https://tyla-social.onrender.com`
- Snapchat: `https://tyla-social-snapchat.onrender.com`

### Account 2

- Instagram: `https://tyla-social-instagram.onrender.com`
- Snapchat: `https://tyla-social-snapchat.onrender.com`

**Note:** Account 2 service names may differ - check your actual service names in Render dashboard

---

## Monthly Rotation Checklist

### Shutdown Account 1

- [ ] Disable UptimeRobot monitors (Account 1)
- [ ] Suspend Instagram service (Account 1)
- [ ] Suspend Snapchat service (Account 1)
- [ ] Verify both services are stopped

### Activate Account 2

- [ ] Deploy Instagram service (Account 2)
- [ ] Deploy Snapchat service (Account 2)
- [ ] Test health endpoints
- [ ] Check service logs for errors
- [ ] Enable UptimeRobot monitors (Account 2)
- [ ] Update Vercel environment variables
- [ ] Redeploy Vercel frontend
- [ ] Test frontend functionality
- [ ] Test Instagram download
- [ ] Test Snapchat download
- [ ] Verify polling is active
- [ ] Check Telegram notifications

---

## Troubleshooting

### Services won't start in Account 2

- **Check environment variables:** Compare with Account 1
- **Check build logs:** Look for dependency errors
- **Verify GitHub connection:** Ensure repo is connected

### Polling not working

- **Check environment variables:** Especially `SUPABASE_URL`, `SUPABASE_KEY`
- **Check service logs:** Look for authentication errors
- **Verify target username is set:** Check service configuration

### Frontend can't connect

- **Check CORS settings:** Ensure Account 2 URLs are allowed
- **Verify environment variables:** Check Vercel env vars are updated
- **Check service status:** Ensure services are "Live" in Render

### Duplicate polling

- **Verify Account 1 services are suspended:** Check status in dashboard
- **Check logs:** Look for duplicate entries
- **Wait a few minutes:** Services may take time to fully stop

---

## Tips

1. **Set calendar reminders:** Mark rotation dates on calendar
2. **Monitor usage:** Check Render usage dashboard regularly
3. **Keep URLs documented:** Save service URLs in a text file
4. **Test rotation during low traffic:** Do first rotation when you can monitor closely
5. **Keep both accounts active:** Don't delete Account 1 - you'll need it next month

---

## Estimated Timeline

- **Initial Setup (Account 2):** 30-60 minutes
- **Monthly Rotation:** 15-30 minutes
- **Testing:** 10-15 minutes

**Total per rotation:** ~30-45 minutes

---

## Next Steps

1. Create Account 2 Render account
2. Set up both services in Account 2
3. Mirror all environment variables
4. Create UptimeRobot monitors (disabled)
5. Wait for Account 1 to hit limit
6. Follow rotation procedure

**You're ready to start!** Begin with Step 1.1 above.
