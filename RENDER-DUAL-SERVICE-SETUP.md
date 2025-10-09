# Deploy Both Services to Render (Same Repo)

## ✅ You Already Have:
- `tyla-social.onrender.com` - Node.js Instagram backend

## 🎯 What You Need to Add:
- Second Render service for Python Snapchat backend

---

## Step-by-Step Setup

### 1. Create Second Web Service on Render

1. Go to [Render Dashboard](https://dashboard.render.com/)
2. Click "New +" → "Web Service"
3. **Select the SAME repository:** `deziikuoo/Tyla-Social`
4. Configure:

```
Name:              tyla-snapchat-python
Region:            Same as your Node.js service
Branch:            main
Root Directory:    Snapchat-Service/server
Runtime:           Python 3
Build Command:     pip install -r requirements.txt
Start Command:     uvicorn main:app --host 0.0.0.0 --port $PORT
Instance Type:     Free
```

5. **Add Environment Variables** (copy from your Node.js service):
   - Telegram bot tokens
   - Supabase credentials
   - Any other secrets

6. Deploy!

7. **Copy the URL:** `https://tyla-snapchat-python.onrender.com`

---

### 2. Update Your Existing Node.js Service

1. Go to your **existing** Node.js service: `tyla-social`
2. Go to "Environment" tab
3. Add new variable:

```
Key:   SNAPCHAT_SERVICE_URL
Value: https://tyla-snapchat-python.onrender.com
```

4. Save → Service will auto-redeploy

---

### 3. Update Frontend to Use Render

Since both backends are now on Render, update your frontend:

**In `Instagram/client/src/App.tsx`:**

```javascript
// Snapchat API base URL - use Node.js backend (which proxies to Python)
const SNAPCHAT_API_BASE = import.meta.env.PROD
  ? "https://tyla-social.onrender.com" // Same as Instagram backend
  : "http://localhost:8000"; // Local Python service for development
```

---

## Architecture (Both on Render):

```
┌─────────────────────────────────────────┐
│  Render Deployment (Same Repo)          │
├─────────────────────────────────────────┤
│                                          │
│  ┌──────────────────────────────────┐   │
│  │ tyla-social.onrender.com         │   │
│  │ (Node.js - Instagram backend)    │   │
│  │ - Instagram endpoints            │   │
│  │ - Snapchat proxy endpoints ──────┼───┼─┐
│  └──────────────────────────────────┘   │ │
│                                          │ │
│  ┌──────────────────────────────────┐   │ │
│  │ tyla-snapchat-python.onrender.com│◄──┼─┘
│  │ (Python - Snapchat service)      │   │
│  │ - Download logic                 │   │
│  │ - Gallery, Progress, etc.        │   │
│  └──────────────────────────────────┘   │
│                                          │
└─────────────────────────────────────────┘

Frontend (Vercel/Render)
   ↓ calls
Node.js Backend (tyla-social.onrender.com)
   ↓ proxies Snapchat requests to
Python Backend (tyla-snapchat-python.onrender.com)
```

---

## Benefits of This Approach:

✅ **Single repository** - both services deploy from same repo
✅ **Free tier** - Render free tier supports multiple services
✅ **No Vercel needed** - Can host frontend on Render too if you want
✅ **Simple configuration** - Just set one environment variable
✅ **Easy updates** - Push to repo, both services can auto-deploy

---

## Alternative: All Three on Render

If you want to move the frontend from Vercel to Render too:

```
Service 1: tyla-frontend (Static Site)
  - Build: cd Instagram/client && npm install && npm run build
  - Publish: Instagram/client/dist

Service 2: tyla-instagram-api (Node.js)
  - Root: Instagram
  - Start: node index.js

Service 3: tyla-snapchat-api (Python)
  - Root: Snapchat-Service/server
  - Start: uvicorn main:app --host 0.0.0.0 --port $PORT
```

---

## Testing:

```bash
# Test Python service directly
curl https://tyla-snapchat-python.onrender.com/health

# Test Node.js proxy
curl https://tyla-social.onrender.com/snapchat-status

# Should return data from Python service ✅
```

---

## Summary:

**You don't need separate repos!** Render supports multiple services from one repo. You just need:
1. One more web service deployment (Python)
2. One environment variable on your existing Node.js service
3. Done!

