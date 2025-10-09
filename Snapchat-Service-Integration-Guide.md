# Snapchat-Service Integration Guide

## Overview

The Snapchat-Service has been separated from the Instagram service and is now a standalone service. This guide explains how to use and integrate it.

## Service Architecture

### Standalone Snapchat-Service

- **Location**: `Snapchat-Service/`
- **Technology**: Python/FastAPI
- **Port**: 8000
- **Features**: Complete Snapchat scraping, downloading, polling, and Telegram integration

### Snapchat Frontend (Standalone)

- **Location**: `Instagram/client/src/snapchat-frontend/`
- **Technology**: React + Vite
- **Port**: 5174
- **Features**: Complete UI for Snapchat management

### Instagram Service

- **Location**: `Instagram/`
- **Technology**: Node.js/Express + React
- **Port**: 3000 (backend) + 5173 (frontend)
- **Features**: Instagram scraping and downloading only

## ✅ **Integration Status: COMPLETE**

### **Backend Endpoints Implemented:**

1. **Core Download**: `/download` - Download Snapchat content
2. **Gallery**: `/gallery/{username}/{media_type}` - Get user's media
3. **Gallery All Users**: `/gallery/{media_type}` - Get all users' media
4. **Progress Tracking**: `/progress/{username}/{media_type}` - Real-time progress
5. **WebSocket**: `/ws/progress/{username}/{media_type}` - Live updates
6. **Polling Control**: `/start-polling`, `/stop-polling`, `/poll-now`
7. **Target Management**: `/set-target`, `/status`
8. **Statistics**: `/stats` - Service statistics
9. **Telegram Integration**: `/send-to-telegram` - Send media to Telegram
10. **Cache Management**: `/clear-cache` - Clear all cached data
11. **File Serving**: `/downloads/{username}/{media_type}/{filename}` - Serve media files
12. **Health Check**: `/health` - Service health status

### **Frontend Features Connected:**

1. **Download Interface** - Complete download form with progress tracking
2. **Gallery View** - Browse all downloaded media with thumbnails
3. **Target Management** - Set and manage Snapchat usernames
4. **Polling Controls** - Start/stop automatic polling
5. **Statistics Dashboard** - View service performance metrics
6. **Telegram Integration** - Auto-send and manual send to Telegram
7. **Cache Management** - Clear cache functionality
8. **Real-time Progress** - WebSocket-based live progress updates

## Running the Services

### 🚀 **Quick Start - All Services Together**

**Run everything with one command:**

```bash
cd Instagram
npm run start:all
```

This will start:

- ✅ **Instagram Backend** (Port 3000)
- ✅ **Snapchat Backend** (Port 8000)
- ✅ **Snapchat Frontend** (Port 5174)
- ✅ **Instagram Frontend** (Port 5173)

**Alternative Commands:**

```bash
# Install Snapchat frontend dependencies (first time only)
npm run install:snap-frontend

# Start Snapchat services only
npm run start:both

# Start with monitoring
npm run start:monitored

# Start individual services
npm run start:ig          # Instagram backend only
npm run start:snap        # Snapchat backend only
npm run start:snap-frontend # Snapchat frontend only
npm run start:frontend    # Instagram frontend only
```

### 📋 **Service Ports & URLs**

| Service            | Port | URL                   | Description   |
| ------------------ | ---- | --------------------- | ------------- |
| Instagram Backend  | 3000 | http://localhost:3000 | Instagram API |
| Snapchat Backend   | 8000 | http://localhost:8000 | Snapchat API  |
| Snapchat Frontend  | 5174 | http://localhost:5174 | Snapchat UI   |
| Instagram Frontend | 5173 | http://localhost:5173 | Instagram UI  |

### 🔧 **Individual Service Setup**

#### 1. Start Snapchat-Service (Backend)

```bash
cd Snapchat-Service

# Activate virtual environment
venv/Scripts/python.exe -m uvicorn server.main:app --reload --port 8000

# Or use the batch file
start-server.bat
```

**Backend Features:**

- ✅ Smart polling with activity-based intervals (10-45 minutes)
- ✅ Web scraping via Snapchat's public web interface
- ✅ Real-time progress tracking via WebSocket
- ✅ Telegram integration with automatic sending
- ✅ Database caching and metadata management
- ✅ Health monitoring and statistics
- ✅ Static file serving for downloaded media

#### 2. Start Snapchat Frontend

```bash
cd Instagram/client/src/snapchat-frontend

# Install dependencies (if not already done)
npm install

# Start development server
npm run dev
```

**Frontend Features:**

- ✅ Complete React UI with modern design
- ✅ Real-time progress bars and status updates
- ✅ Gallery with thumbnail previews
- ✅ Target management interface
- ✅ Polling control panel
- ✅ Statistics dashboard
- ✅ Telegram integration controls
- ✅ Responsive design for all devices

#### 3. Start Instagram Service (Optional)

```bash
cd Instagram
npm start
```

### 🛠️ **PM2 Production Management**

**Start all services with PM2:**

```bash
# Start all services
npm run pm2:start

# Check status
npm run pm2:status

# View logs
npm run pm2:logs

# Restart services
npm run pm2:restart

# Stop services
npm run pm2:stop
```

**PM2 Services:**

- `instagram-service` - Instagram backend (Port 3000)
- `snapchat-service` - Snapchat backend (Port 8000)
- `snapchat-frontend` - Snapchat frontend (Port 5174)

## API Endpoints Reference

### Core Download

```http
POST /snapchat-api/download
{
  "username": "target_username",
  "download_type": "stories|highlights|spotlights",
  "send_to_telegram": true
}
```

### Gallery

```http
GET /snapchat-api/gallery/{username}/{media_type}
GET /snapchat-api/gallery/{media_type}  # All users
```

### Polling Control

```http
POST /snapchat-api/start-polling
POST /snapchat-api/stop-polling
GET /snapchat-api/poll-now?force=true
```

### Target Management

```http
POST /snapchat-api/set-target
{
  "username": "target_username"
}
GET /snapchat-api/status
```

### Telegram Integration

```http
POST /snapchat-api/send-to-telegram
{
  "mediaUrl": "file_url",
  "caption": "Custom caption",
  "source": "snapchat"
}
```

### Cache Management

```http
POST /snapchat-api/clear-cache
```

## Configuration

### Environment Variables (Snapchat-Service)

Create `.env` file in `Snapchat-Service/`:

```env
# Telegram Configuration
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id

# Database Configuration
DATABASE_PATH=./snapchat_service.db

# Download Settings
DOWNLOADS_DIR=./downloads
MAX_CONCURRENT_DOWNLOADS=3

# Polling Configuration
DEFAULT_POLLING_INTERVAL=10
MAX_POLLING_INTERVAL=45
```

### Frontend Configuration

The frontend automatically connects to the backend via proxy configuration in `vite.config.ts`.

## Features Comparison

| Feature                  | Snapchat-Service                  | Instagram Service            |
| ------------------------ | --------------------------------- | ---------------------------- |
| **Architecture**         | Python/FastAPI                    | Node.js/Express + React      |
| **Scraping Method**      | Web scraping via public interface | Instagram API + web scraping |
| **Real-time Updates**    | WebSocket + polling               | Polling only                 |
| **Database**             | SQLite with metadata              | File-based storage           |
| **Telegram Integration** | ✅ Complete                       | ✅ Complete                  |
| **Polling System**       | ✅ Smart activity-based           | ✅ Basic interval-based      |
| **Progress Tracking**    | ✅ Real-time WebSocket            | ✅ Basic polling             |
| **Gallery Management**   | ✅ Complete with thumbnails       | ✅ Basic file listing        |
| **Health Monitoring**    | ✅ Advanced                       | ✅ Basic                     |
| **Cache Management**     | ✅ Complete                       | ❌ Limited                   |

## Troubleshooting

### Common Issues

1. **Frontend can't connect to backend**

   - Ensure Snapchat-Service is running on port 8000
   - Check proxy configuration in `vite.config.ts`
   - Verify no firewall blocking connections

2. **Downloads not working**

   - Check Snapchat username validity
   - Verify Telegram configuration (if using auto-send)
   - Check logs for specific error messages

3. **Gallery not showing files**

   - Ensure downloads directory exists
   - Check file permissions
   - Verify static file serving is working

4. **WebSocket connection issues**
   - Check if WebSocket proxy is configured
   - Verify backend WebSocket endpoint is accessible
   - Check browser console for connection errors

### Logs and Debugging

**Backend Logs:**

```bash
# Check backend logs
tail -f Snapchat-Service/logs/app.log
```

**Frontend Debug:**

- Open browser developer tools
- Check Network tab for API calls
- Check Console for JavaScript errors

## Performance Optimization

### Backend

- Smart polling intervals based on user activity
- Database caching for metadata
- Concurrent download management
- Resource monitoring and health checks

### Frontend

- Real-time progress updates via WebSocket
- Efficient gallery rendering with thumbnails
- Responsive design for all screen sizes
- Error handling and user feedback

## Security Considerations

1. **API Security**: All endpoints require proper validation
2. **File Access**: Static file serving with proper path validation
3. **Telegram Integration**: Secure token management
4. **Database**: SQLite with proper error handling
5. **WebSocket**: Connection validation and cleanup

## Future Enhancements

1. **Authentication**: Add user authentication system
2. **Multi-user Support**: Support multiple Snapchat accounts
3. **Advanced Analytics**: Enhanced statistics and reporting
4. **Mobile App**: React Native mobile application
5. **Cloud Storage**: Integration with cloud storage services
6. **API Rate Limiting**: Implement proper rate limiting
7. **Webhook Support**: Real-time notifications via webhooks

---

**Status**: ✅ **FULLY INTEGRATED AND FUNCTIONAL**

Both the Snapchat-Service backend and frontend are now properly connected with all features implemented and tested. The system provides a complete Snapchat content management solution with real-time updates, Telegram integration, and comprehensive monitoring capabilities.
