# Tyla IG Kapturez - Social Media Downloader Suite

A comprehensive social media downloader suite that includes Instagram video/photo downloader, Snapchat story downloader, and automated monitoring services with Telegram integration.

## 🏗️ Project Overview

This project consists of three main components:

1. **Instagram Video Downloader API** - Node.js/Express backend with React frontend
2. **Snapchat Service** - Python FastAPI backend for Snapchat story downloads
3. **Monitoring Service** - Node.js service monitor for health checks and auto-restart

## 📋 Prerequisites

### System Requirements
- **Node.js** v16+ (v18+ recommended)
- **Python** 3.8+ 
- **npm** (comes with Node.js)
- **Git** (for cloning the repository)

### Optional Requirements
- **Telegram Bot Token** and **Channel ID** (for auto-posting features)
- **Twilio Account** (for SMS notifications in Snapchat service)

## 🚀 Quick Start Guide

### 1. Clone and Setup

```bash
# Clone the repository
git clone <repository-url>
cd "Tyla IG Kapturez"

# Install Instagram API dependencies
cd Instagram-Video-Downloader-API
npm install

# Install frontend dependencies
cd client
npm install
cd ..

# Setup Python environment for Snapchat service
cd ../Snapchat-Service
python -m venv venv

# Activate virtual environment
# On Windows:
venv\Scripts\activate
# On macOS/Linux:
source venv/bin/activate

# Install Python dependencies
pip install -r requirements.txt
cd ..
```

### 2. Configuration

#### Instagram Service Configuration
Create a `.env` file in `Instagram-Video-Downloader-API/`:

```env
# Server Configuration
PORT=3000

# Telegram Configuration (Optional)
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
TELEGRAM_CHANNEL_ID=your_channel_id
```

#### Snapchat Service Configuration
Create a `.env` file in `Snapchat-Service/server/`:

```env
# Server Configuration
PORT=8000

# Telegram Configuration (Optional)
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
TELEGRAM_CHANNEL_ID=your_channel_id

# Twilio Configuration (Optional - for SMS notifications)
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE_NUMBER=your_twilio_phone_number
```

### 3. Running the Services

#### Option A: Run Services Individually

**Instagram Service:**
```bash
cd Instagram-Video-Downloader-API
npm start
# Backend runs on http://localhost:3000
```

**Instagram Frontend:**
```bash
cd Instagram-Video-Downloader-API/client
npm run dev
# Frontend runs on http://localhost:5173
```

**Snapchat Service:**
```bash
cd Snapchat-Service
# Activate virtual environment first
venv\Scripts\activate  # Windows
# source venv/bin/activate  # macOS/Linux

# Start the service
python -m uvicorn server.main:app --reload --port 8000
# Service runs on http://localhost:8000
```

#### Option B: Run Services with Convenience Scripts

**Run Instagram and Snapchat together:**
```bash
cd Instagram-Video-Downloader-API
npm run start:both
```

**Run with monitoring (recommended for production):**
```bash
cd Instagram-Video-Downloader-API
npm run start:monitored
```

**Run with PM2 (production deployment):**
```bash
cd Instagram-Video-Downloader-API
npm run pm2:start
```

### 4. Accessing the Services

- **Instagram Frontend**: http://localhost:5173
- **Instagram API**: http://localhost:3000
- **Snapchat API**: http://localhost:8000
- **Snapchat Frontend**: http://localhost:8000 (built-in)

## 📱 Using the Applications

### Instagram Downloader

1. **Manual Downloads:**
   - Open http://localhost:5173
   - Paste any public Instagram URL
   - Click "Download" to get the media

2. **Story Downloads:**
   - Use `GET /stories?username=<username>` to download stories for any user
   - Use `GET /stories/target` to download stories for the current target user
   - Stories are automatically deduplicated and tracked in the database

3. **Automated Post Monitoring:**
   - Click "Change Target" to set a target account
   - Enable "Polling" and click "Start Polling"
   - The service will automatically check for new posts every 15-45 minutes

4. **Automated Story Monitoring:**
   - Stories are automatically checked as part of the main polling system
   - Stories are checked first, then posts in each polling cycle
   - Uses the same smart scheduling (15-45 minutes based on activity)
   - New stories are automatically sent to Telegram if configured

5. **Telegram Integration:**
   - If configured, use "Send to Telegram" on downloaded items
   - Automated posting of new posts and stories to your Telegram channel

### Snapchat Downloader

1. **Manual Downloads:**
   - Open http://localhost:8000
   - Enter a Snapchat username
   - Click "Download Stories" to fetch available stories

2. **Automated Monitoring:**
   - Use the API endpoints to set up automated story monitoring
   - Stories are automatically downloaded and can be sent to Telegram

## 🔧 API Endpoints

### Instagram API (Port 3000)

**Core Endpoints:**
- `GET /igdl?url=<instagram_url>` - Download media from Instagram URL
- `POST /send-to-telegram` - Send media to Telegram
- `GET /target` - Get current target and polling status
- `POST /target` - Set target account

**Story Endpoints:**
- `GET /stories?username=<username>` - Download stories for a specific username
- `GET /stories/target` - Download stories for the current target user
- `GET /stories/processed/:username` - Get processed stories for a username
- *Note: Story polling is integrated with main polling system*

**Automation Endpoints:**
- `POST /start-polling` - Start automated post monitoring
- `POST /stop-polling` - Stop automated post monitoring
- `GET /poll-now?force=true` - Force immediate post poll
- `GET /stats` - View request statistics
- `GET /logs` - View recent request logs

### Snapchat API (Port 8000)

**Core Endpoints:**
- `GET /` - Main interface
- `POST /download-stories` - Download stories for a username
- `GET /health` - Health check endpoint
- `GET /downloads/{username}` - Get downloads for a user

## 📊 Monitoring and Health Checks

The project includes a monitoring service that:
- Checks service health every 2 minutes
- Automatically restarts failed services
- Logs all activities to `monitor-logs.txt`

**Manual Health Checks:**
```bash
# Check Instagram service
curl http://localhost:3000/health

# Check Snapchat service  
curl http://localhost:8000/health

# View monitoring logs
tail -f monitor-logs.txt
```

## 🗂️ File Structure

```
Tyla IG Kapturez/
├── Instagram-Video-Downloader-API/     # Instagram downloader service
│   ├── client/                         # React frontend
│   ├── index.js                        # Express server
│   ├── package.json
│   └── README.md
├── Snapchat-Service/                   # Snapchat downloader service
│   ├── server/                         # FastAPI backend
│   ├── snapchat_dl/                    # Snapchat downloader library
│   ├── requirements.txt
│   └── venv/                          # Python virtual environment
├── monitor-services.js                 # Service monitoring script
└── README.md                          # This file
```

## 🛠️ Development

### Building for Production

**Instagram Frontend:**
```bash
cd Instagram-Video-Downloader-API/client
npm run build
```

**Running Tests:**
```bash
# Instagram service tests
cd Instagram-Video-Downloader-API
node test-tracking.js
node monitor-stats.js

# Snapchat service tests
cd Snapchat-Service
python -m pytest  # if tests are available
```

### Logs and Debugging

**Log Files:**
- `Instagram-Video-Downloader-API/request-logs.txt` - Instagram API requests
- `Snapchat-Service/server/server.log` - Snapchat service logs
- `monitor-logs.txt` - Service monitoring logs

**Database Files:**
- `Instagram-Video-Downloader-API/instagram_tracker.db` - Instagram tracking data
- `Snapchat-Service/snapchat_telegram.db` - Snapchat tracking data

## 🚨 Troubleshooting

### Common Issues

1. **Port Already in Use:**
   ```bash
   # Kill process on port 3000
   netstat -ano | findstr :3000
   taskkill /PID <PID> /F
   
   # Kill process on port 8000
   netstat -ano | findstr :8000
   taskkill /PID <PID> /F
   ```

2. **Python Virtual Environment Issues:**
   ```bash
   # Recreate virtual environment
   cd Snapchat-Service
   rmdir /s venv
   python -m venv venv
   venv\Scripts\activate
   pip install -r requirements.txt
   ```

3. **Node.js Dependencies Issues:**
   ```bash
   # Clear npm cache and reinstall
   cd Instagram-Video-Downloader-API
   npm cache clean --force
   rm -rf node_modules package-lock.json
   npm install
   ```

### Service Status Commands

```bash
# Check if services are running
netstat -ano | findstr :3000
netstat -ano | findstr :8000

# View PM2 status (if using PM2)
cd Instagram-Video-Downloader-API
npm run pm2:status
```

## 📄 License & Disclaimer

This project is for educational and personal use. Users are responsible for:
- Respecting platform Terms of Service
- Obtaining proper permissions for downloaded content
- Complying with local laws and regulations

## 🤝 Support

For issues and questions:
1. Check the troubleshooting section above
2. Review the individual service README files
3. Check the log files for error details
4. Ensure all prerequisites are properly installed

---

**Happy downloading! 🎉**
