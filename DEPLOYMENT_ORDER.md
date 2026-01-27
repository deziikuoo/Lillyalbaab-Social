# Lillyalbaab Social - Deployment Order

**Date**: January 26, 2026  
**Project**: Lillyalbaab Social  
**Status**: Ready for Deployment

## 🎯 Deployment Order (Priority Sequence)

Follow these steps in order for the smoothest deployment experience.

---

## Phase 1: Database Setup (Foundation) ⚠️ **DO THIS FIRST**

### Step 1.1: Run Supabase Migration
**Priority**: 🔴 **CRITICAL - Must be done first**

1. **Open Supabase Dashboard**
   - Go to: https://supabase.com/dashboard
   - Select your project
   - Navigate to **SQL Editor**

2. **Run Migration Script**
   - Open `SUPABASE_NAMESPACE_MIGRATION.sql`
   - Copy entire contents
   - Paste into SQL Editor
   - Click **Run** (or press Ctrl+Enter)
   - Wait for completion

3. **Verify Migration**
   - Check for success message
   - Verify no errors
   - (Optional) Run verification query:
     ```sql
     SELECT column_name, data_type, column_default 
     FROM information_schema.columns 
     WHERE table_name = 'processed_posts' AND column_name = 'project_namespace';
     ```

**Why First**: All code expects the `project_namespace` column to exist. Without it, queries will fail.

**Time**: ~2-3 minutes

---

## Phase 2: Telegram Setup (Required for Functionality)

### Step 2.1: Create Telegram Bot
**Priority**: 🟠 **HIGH - Required before deployment**

1. **Open Telegram** → Search `@BotFather`
2. **Start conversation** → Click "Start"
3. **Create bot**: Send `/newbot`
4. **Choose name**: "Lillyalbaab Social Bot"
5. **Choose username**: `lillyalbaab_social_bot` (must end with `bot`)
6. **Save token**: Copy the token (looks like `123456789:ABCdef...`)
   - ⚠️ **Save securely** - you'll need it for environment variables

**Time**: ~2 minutes

### Step 2.2: Create Telegram Channel
**Priority**: 🟠 **HIGH - Required before deployment**

1. **Open Telegram** → Menu (☰) → **New Channel**
2. **Name**: "Lillyalbaab Social"
3. **Type**: Public or Private (your choice)
4. **Create channel**

**Time**: ~1 minute

### Step 2.3: Add Bot as Administrator
**Priority**: 🟠 **HIGH - Required before deployment**

1. **Open your channel**
2. **Click channel name** → **Administrators** (or "Manage Channel")
3. **Add Administrator** → Search for `@lillyalbaab_social_bot`
4. **Grant permissions**:
   - ✅ **Post Messages** (required)
   - ✅ **Edit Messages** (recommended)
   - ❌ Others optional
5. **Done**

**Time**: ~1 minute

### Step 2.4: Get Channel ID
**Priority**: 🟠 **HIGH - Required before deployment**

**Method 1: Using Bot** (Easiest)
1. Send any message to your channel
2. Forward that message to `@userinfobot` or `@getidsbot`
3. Bot will reply with channel ID (negative number like `-1001234567890`)

**Method 2: Using API**
1. Send a test message from your bot to the channel
2. Visit: `https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates`
3. Look for `"chat":{"id":-1001234567890}` in the response

**Time**: ~2 minutes

**Save these values**:
- Bot Token: `_________________`
- Channel ID: `_________________`

---

## Phase 3: Render Deployment (Backend)

### Step 3.1: Create Render Service
**Priority**: 🟡 **MEDIUM - After Telegram setup**

1. **Go to Render Dashboard**: https://dashboard.render.com
2. **New** → **Web Service**
3. **Connect Repository**: Link your GitHub repo
4. **Configure Service**:
   - **Name**: `lillyalbaab-social`
   - **Region**: `Oregon` (or your preference)
   - **Branch**: `master` (or your main branch)
   - **Root Directory**: Leave empty (or `Lillyalbaab Social` if nested)
   - **Environment**: `Node`
   - **Build Command**: `cd Instagram && chmod +x install-chrome-render.sh && ./install-chrome-render.sh && npm install`
   - **Start Command**: `cd Instagram && npm start`

**Time**: ~5 minutes

### Step 3.2: Set Environment Variables (Render)
**Priority**: 🟡 **MEDIUM - Critical configuration**

Add these environment variables in Render dashboard:

**Required Variables**:
```env
NODE_ENV=production
PORT=3000
PROJECT_NAMESPACE=lillyalbaab
TARGET_USERNAMES=lillyalbaab
TELEGRAM_BOT_TOKEN=<your_bot_token_from_step_2.1>
TELEGRAM_CHANNEL_ID=<your_channel_id_from_step_2.4>
TELEGRAM_AUTH=true
SUPABASE_URL=<your_supabase_url>
SUPABASE_KEY=<your_supabase_key>
SNAPCHAT_SERVICE_URL=https://lillyalbaab-social-snapchat.onrender.com
USER_AGENT=Mozilla/5.0 (Windows NT 10.0; Win64; x64)
X_IG_APP_ID=936619743392459
TZ=America/Chicago
PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=false
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
PUPPETEER_CACHE_DIR=/opt/render/project/src/data/chrome
```

**Where to add**: Render service → Environment → Add each variable

**Time**: ~5 minutes

### Step 3.3: Deploy to Render
**Priority**: 🟡 **MEDIUM**

1. **Save environment variables**
2. **Click "Create Web Service"** (or "Save Changes" if editing)
3. **Wait for deployment** (~5-10 minutes)
4. **Check logs** for:
   - ✅ `📁 Using project namespace: lillyalbaab`
   - ✅ `✅ Supabase connected successfully`
   - ✅ `🚀 Instagram Backend running at http://localhost:3000`

**Time**: ~10 minutes

### Step 3.4: Verify Render Deployment
**Priority**: 🟡 **MEDIUM**

1. **Check health endpoint**:
   - Visit: `https://lillyalbaab-social.onrender.com/health`
   - Should return: `{"status":"ok",...}`

2. **Check logs**:
   - Render dashboard → Logs
   - Verify no errors
   - Verify namespace is correct

**Time**: ~2 minutes

---

## Phase 4: Vercel Deployment (Frontend)

### Step 4.1: Create Vercel Project
**Priority**: 🟢 **LOW - Can be done after backend**

1. **Go to Vercel Dashboard**: https://vercel.com/dashboard
2. **Add New Project**
3. **Import Git Repository**: Select your repo
4. **Configure Project**:
   - **Project Name**: `lillyalbaab-social`
   - **Framework Preset**: Vite (or auto-detect)
   - **Root Directory**: `Instagram/client`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`

**Time**: ~3 minutes

### Step 4.2: Set Environment Variables (Vercel)
**Priority**: 🟢 **LOW**

Add these in Vercel project settings:

```env
VITE_INSTAGRAM_API_BASE=https://lillyalbaab-social.onrender.com
VITE_SNAPCHAT_API_BASE=https://lillyalbaab-social.onrender.com
```

**Where to add**: Vercel project → Settings → Environment Variables

**Time**: ~2 minutes

### Step 4.3: Deploy to Vercel
**Priority**: 🟢 **LOW**

1. **Click "Deploy"**
2. **Wait for build** (~3-5 minutes)
3. **Verify deployment**:
   - Visit: `https://lillyalbaab-social.vercel.app`
   - Should show the React frontend

**Time**: ~5 minutes

---

## Phase 5: Testing & Verification

### Step 5.1: Verify Health Endpoints
**Priority**: 🟡 **MEDIUM**

1. **Backend Health**:
   - `https://lillyalbaab-social.onrender.com/health`
   - Should return: `{"status":"ok"}`

2. **Frontend**:
   - `https://lillyalbaab-social.vercel.app`
   - Should load React app

**Time**: ~2 minutes

### Step 5.2: Test Instagram Functionality
**Priority**: 🟡 **MEDIUM**

1. **Open frontend**: `https://lillyalbaab-social.vercel.app`
2. **Test manual download**:
   - Paste Instagram post URL
   - Verify download links appear
3. **Set target**:
   - Click "Change Target"
   - Enter: `lillyalbaab`
   - Verify target is set
4. **Start polling**:
   - Click "Start Polling"
   - Verify polling status shows active
5. **Check logs** (Render):
   - Verify polling started
   - Verify namespace is `lillyalbaab`

**Time**: ~5 minutes

### Step 5.3: Test Telegram Integration
**Priority**: 🟡 **MEDIUM**

1. **Trigger test**:
   - Manual download with "Auto-send to Telegram" enabled
   - OR wait for polling to find new content
2. **Check Telegram channel**:
   - Verify message appears
   - Verify media (photo/video) is sent
   - Verify caption shows "Lillyalbaab Social"
3. **Verify isolation**:
   - Check that Tyla Social data is NOT appearing

**Time**: ~3 minutes

### Step 5.4: Verify Namespace Isolation
**Priority**: 🟡 **MEDIUM**

1. **Check Supabase** (optional):
   - Query: `SELECT * FROM processed_posts WHERE project_namespace = 'lillyalbaab'`
   - Should only see Lillyalbaab data
   - Should NOT see Tyla data (`project_namespace = 'tyla'`)

2. **Check logs**:
   - Verify: `📁 Using project namespace: lillyalbaab`
   - Verify queries filter correctly

**Time**: ~3 minutes

---

## 📋 Quick Checklist

### Pre-Deployment
- [ ] ✅ Database migration run (Phase 1)
- [ ] ✅ Telegram bot created (Phase 2.1)
- [ ] ✅ Telegram channel created (Phase 2.2)
- [ ] ✅ Bot added as admin (Phase 2.3)
- [ ] ✅ Channel ID obtained (Phase 2.4)

### Deployment
- [ ] ✅ Render service created (Phase 3.1)
- [ ] ✅ Environment variables set (Phase 3.2)
- [ ] ✅ Render deployment successful (Phase 3.3)
- [ ] ✅ Render health check passes (Phase 3.4)
- [ ] ✅ Vercel project created (Phase 4.1)
- [ ] ✅ Vercel environment variables set (Phase 4.2)
- [ ] ✅ Vercel deployment successful (Phase 4.3)

### Post-Deployment
- [ ] ✅ Health endpoints working (Phase 5.1)
- [ ] ✅ Instagram functionality tested (Phase 5.2)
- [ ] ✅ Telegram integration tested (Phase 5.3)
- [ ] ✅ Namespace isolation verified (Phase 5.4)

---

## ⏱️ Estimated Total Time

- **Phase 1 (Database)**: ~5 minutes
- **Phase 2 (Telegram)**: ~10 minutes
- **Phase 3 (Render)**: ~25 minutes
- **Phase 4 (Vercel)**: ~10 minutes
- **Phase 5 (Testing)**: ~15 minutes

**Total**: ~65 minutes (1 hour)

---

## 🚨 Critical Path

**Must be done in this order**:
1. Database migration (blocks everything)
2. Telegram setup (required for functionality)
3. Render deployment (backend must be up)
4. Vercel deployment (frontend depends on backend)
5. Testing (verify everything works)

---

## 📝 Notes

- **Snapchat**: Service is ready but disabled (no username). Will not poll without `SNAPCHAT_TARGET_USERNAME` set.
- **Tyla Social**: Can be updated later (see `TYLA_SOCIAL_NAMESPACE_UPDATE.md`)
- **Database**: Shared with Tyla Social, but data is isolated by namespace
- **Rollback**: Each phase can be tested independently

---

## 🆘 Troubleshooting

If something fails:

1. **Check logs** (Render/Vercel dashboards)
2. **Verify environment variables** are set correctly
3. **Check database migration** was run successfully
4. **Verify Telegram** bot token and channel ID are correct
5. **Test endpoints** individually
6. **Review** `DEPLOYMENT_CHECKLIST.md` for detailed troubleshooting

---

**Last Updated**: January 26, 2026  
**Status**: Ready to Deploy
