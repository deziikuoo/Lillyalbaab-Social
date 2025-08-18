# Startup Guide for Instagram & Snapchat Services

## 🚀 Quick Start

### Option 1: Start All Services (Recommended)
```bash
cd "C:\Users\dawan\OneDrive\Documents\Coding Files\Tyla IG Kapturez\Instagram-Video-Downloader-API"
npm run start:all
```

This will start:
- **Instagram Backend** (Port 3000) - Cyan color
- **Snapchat Backend** (Port 8000) - Magenta color  
- **Frontend Dev Server** (Port 5173) - Green color

### Option 2: Start Backend Services Only
```bash
cd "C:\Users\dawan\OneDrive\Documents\Coding Files\Tyla IG Kapturez\Instagram-Video-Downloader-API"
npm run start:both
```

This will start:
- **Instagram Backend** (Port 3000)
- **Snapchat Backend** (Port 8000)

Then manually start the frontend in a separate terminal:
```bash
cd "C:\Users\dawan\OneDrive\Documents\Coding Files\Tyla IG Kapturez\Instagram-Video-Downloader-API\client"
npm run dev
```

## 🌐 Access Points

Once all services are running:

- **Frontend Application**: http://localhost:5173
- **Instagram Backend API**: http://localhost:3000
- **Snapchat Backend API**: http://localhost:8000
- **Snapchat API (via proxy)**: http://localhost:5173/snapchat-api

## 🔧 Troubleshooting

### If you get 404 errors for Snapchat endpoints:

1. **Check if Snapchat backend is running:**
   ```bash
   curl http://localhost:8000/health
   ```

2. **Check if frontend dev server is running:**
   ```bash
   curl http://localhost:5173
   ```

3. **Verify proxy configuration in `client/vite.config.ts`:**
   ```javascript
   proxy: {
     '/snapchat-api': { 
       target: 'http://localhost:8000',
       rewrite: (p) => p.replace(/^\/snapchat-api/, ''),
       ws: true
     }
   }
   ```

### If Snapchat backend fails to start:

1. **Check if virtual environment exists:**
   ```bash
   dir "C:\Users\dawan\OneDrive\Documents\Coding Files\Tyla IG Kapturez\Snapchat-Service\venv\Scripts\python.exe"
   ```

2. **Recreate virtual environment if needed:**
   ```bash
   cd "C:\Users\dawan\OneDrive\Documents\Coding Files\Tyla IG Kapturez\Snapchat-Service"
   python -m venv venv
   venv\Scripts\activate
   pip install -r requirements.txt
   ```

## 📋 Service Status Check

You can verify all services are running by checking these endpoints:

- ✅ **Frontend**: http://localhost:5173 (should show the app)
- ✅ **Instagram Health**: http://localhost:3000/health
- ✅ **Snapchat Health**: http://localhost:8000/health
- ✅ **Snapchat via Proxy**: http://localhost:5173/snapchat-api/status

## 🎯 Expected Behavior

When you navigate to http://localhost:5173 and click on the Snapchat tab, you should see:
- No 404 errors in the browser console
- The Snapchat interface loads properly
- Target management, polling controls, and statistics work
- Download and gallery features function correctly
