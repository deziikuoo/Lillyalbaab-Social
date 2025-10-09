# Snapchat Service Deployment Guide

## 🎯 What You Need To Do

Your code is now ready for deployment! Both services (Instagram + Snapchat) are configured to work together on Vercel. You just need to deploy the Python Snapchat backend and connect them.

---

## 📦 Deploy Python Snapchat Service to Render

### Option 1: Deploy via Render Dashboard (Easiest)

1. **Go to [Render.com](https://dashboard.render.com/)** and sign in (free tier available)

2. **Click "New +" → "Web Service"**

3. **Connect your GitHub repository:**
   - Repository: `deziikuoo/Tyla-Social`
   - Click "Connect"

4. **Configure the service:**
   ```
   Name:              tyla-snapchat-service
   Region:            Pick closest to you
   Branch:            main
   Root Directory:    Snapchat-Service/server
   Runtime:           Python 3
   Build Command:     pip install -r requirements.txt
   Start Command:     uvicorn main:app --host 0.0.0.0 --port $PORT
   Instance Type:     Free
   ```

5. **Add Environment Variables** (if you have any):
   - Click "Advanced" → "Add Environment Variable"
   - Add your Telegram bot tokens, Supabase keys, etc.

6. **Click "Create Web Service"**

7. **Wait for deployment** (usually 2-5 minutes)

8. **Copy your service URL:** `https://tyla-snapchat-service.onrender.com`

---

## 🔗 Connect Services on Vercel

### Set Environment Variable on Vercel:

1. **Go to [Vercel Dashboard](https://vercel.com/dashboard)**

2. **Open your project:** `tyla-social`

3. **Go to Settings → Environment Variables**

4. **Add new variable:**
   ```
   Name:  SNAPCHAT_SERVICE_URL
   Value: https://tyla-snapchat-service.onrender.com
   ```
   *(Replace with your actual Render URL from step 8 above)*

5. **Select environments:** Production, Preview, Development

6. **Click "Save"**

7. **Redeploy your Vercel project:**
   - Go to "Deployments" tab
   - Click "..." on latest deployment → "Redeploy"

---

## ✅ Verify It's Working

After deployment, test these endpoints:

### 1. Check Python Service Health:
```bash
curl https://tyla-snapchat-service.onrender.com/health
```
Expected: `{"status": "healthy"}`

### 2. Check Vercel Proxy:
```bash
curl https://tyla-social.vercel.app/snapchat-status
```
Expected: Snapchat service status (should proxy to Python service)

### 3. Test in Browser:
- Open: `https://tyla-social.vercel.app`
- Go to Snapchat tab
- Try downloading stories
- Check browser console - no more 404 errors!

---

## 🐛 Troubleshooting

### If you get "Snapchat service unavailable":

1. **Check Render service is running:**
   - Go to Render dashboard
   - Your service should show "Live" status
   - Check logs for errors

2. **Verify environment variable on Vercel:**
   - Should be: `https://your-service.onrender.com` (no trailing slash)
   - Make sure you redeployed after adding the variable

3. **Check Render logs:**
   - Render Dashboard → Your Service → Logs
   - Look for startup errors

### If Render service keeps crashing:

1. **Check build logs** - might be missing dependencies
2. **Verify requirements.txt** has all packages
3. **Check environment variables** are set correctly

---

## 🚀 Alternative: Deploy to Railway.app

If Render doesn't work, try Railway:

1. Go to [Railway.app](https://railway.app/)
2. New Project → Deploy from GitHub
3. Select `deziikuoo/Tyla-Social`
4. Configure:
   - Root: `Snapchat-Service/server`
   - Start: `uvicorn main:app --host 0.0.0.0 --port $PORT`
5. Copy domain and use as `SNAPCHAT_SERVICE_URL` on Vercel

---

## 📊 What Happens Now

```
User Browser (tyla-social.vercel.app)
    ↓ Frontend calls /gallery/stories
Vercel (Node.js backend - index.js)
    ↓ Proxies to ${SNAPCHAT_SERVICE_URL}/gallery/stories
Render (Python FastAPI service)
    ↓ Returns Snapchat data
Vercel → User Browser ✅
```

Both services work together in one unified application!

---

## 💡 Local Development Still Works

Nothing changes for local development:
```bash
# Terminal 1: Start Python service
cd Snapchat-Service
venv/Scripts/python.exe -m uvicorn server.main:app --reload --port 8000

# Terminal 2: Start Node.js backend
cd Instagram
node index.js

# Terminal 3: Start frontend
cd Instagram/client
npm run dev
```

All services auto-connect on localhost ports.

---

## 🎉 That's It!

Once you deploy the Python service and set the environment variable, your entire application (Instagram + Snapchat) will work seamlessly on Vercel!

