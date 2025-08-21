from fastapi import FastAPI, HTTPException, BackgroundTasks, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse, FileResponse
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import os
from datetime import datetime, timedelta, timezone
import asyncio
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from threading import Lock
import zipfile
import tempfile
from loguru import logger
# Import snapchat_dl with path adjustment
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from snapchat_dl.snapchat_dl import SnapchatDL, NoStoriesFound
from dotenv import load_dotenv
import json
import logging
import sys
import aiofiles
import traceback
import shutil
from io import BytesIO
import aiohttp
from aiohttp import ClientSession
import re
from urllib.parse import unquote
import concurrent.futures
from pathlib import Path
import time
import signal
import atexit
from twilio.rest import Client
from twilio.base.exceptions import TwilioRestException
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.image import MIMEImage
from email.mime.base import MIMEBase
from email import encoders
import mimetypes
import gc
import psutil
import threading
import random

# Import our new modules
from server.database import db_manager
from server.telegram_manager import TelegramManager, generate_telegram_caption, generate_bulk_caption

# Load environment variables from the server directory
load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))

# ===== SNAPCHAT POLLING CONFIGURATION =====
TARGET_USERNAME = os.getenv('SNAPCHAT_TARGET_USERNAME')
POLLING_ENABLED = True
current_polling_timeout = None  # Track current polling timeout for restart
polling_started = False  # Track if polling has been started

# ===== ACTIVITY TRACKER =====
class ActivityTracker:
    def __init__(self):
        self.recent_stories = 0
        self.last_activity = None
        self.last_reset = datetime.now(timezone(timedelta(hours=-4)))  # EDT timezone
        self.is_first_run = True
    
    def update_activity(self, new_stories_count):
        # Skip first run to avoid counting old stories
        if self.is_first_run:
            logger.info("📊 First run detected - skipping activity tracking for old stories")
            self.is_first_run = False
            return
        
        self.recent_stories += new_stories_count
        self.last_activity = datetime.now(timezone(timedelta(hours=-4)))  # EDT timezone
        logger.info(f"Activity updated: +{new_stories_count} stories (total: {self.recent_stories} in current poll cycle)")
    
    def get_activity_level(self):
        # Activity levels - reset counter at end of each poll cycle
        if self.recent_stories >= 5: return 'high'
        if self.recent_stories >= 2: return 'medium'
        return 'low'
    
    def reset_activity_counter(self):
        self.recent_stories = 0
        logger.info("🔄 Activity counter reset for next poll cycle")
    
    def get_polling_interval(self):
        base_interval = 10  # minutes (faster than Instagram due to story expiration)
        activity_level = self.get_activity_level()
        
        interval = base_interval
        if activity_level == 'high':
            interval = 15  # 5 minutes for active users
        elif activity_level == 'low':
            interval = 45  # 20 minutes for inactive users
        # medium stays at 10 minutes
        
        logger.info(f"Smart polling: {interval} minutes ({activity_level} activity level)")
        return interval

# ===== REQUEST TRACKING SYSTEM =====
class RequestTracker:
    def __init__(self):
        self.stats = {
            'snapchat': {
                'total': 0,
                'successful': 0,
                'failed': 0,
                'rate_limited': 0,
                'last24h': 0,
                'last_hour': 0
            },
            'telegram': {
                'total': 0,
                'successful': 0,
                'failed': 0,
                'photos': 0,
                'videos': 0,
                'last24h': 0,
                'last_hour': 0
            },
            'start_time': datetime.now(),
            'last_reset': datetime.now()
        }
    
    def track_snapchat(self, url, success, error=None):
        self.stats['snapchat']['total'] += 1
        self.stats['snapchat']['last24h'] += 1
        self.stats['snapchat']['last_hour'] += 1
        
        if success:
            self.stats['snapchat']['successful'] += 1
        else:
            self.stats['snapchat']['failed'] += 1
            if error and ('429' in str(error) or 'rate limit' in str(error).lower()):
                self.stats['snapchat']['rate_limited'] += 1
        
        self.log_request('Snapchat', url, success, error)
    
    def track_telegram(self, media_type, success, error=None):
        self.stats['telegram']['total'] += 1
        self.stats['telegram']['last24h'] += 1
        self.stats['telegram']['last_hour'] += 1
        
        if success:
            self.stats['telegram']['successful'] += 1
            if media_type == 'photo':
                self.stats['telegram']['photos'] += 1
            if media_type == 'video':
                self.stats['telegram']['videos'] += 1
        else:
            self.stats['telegram']['failed'] += 1
        
        self.log_request('Telegram', media_type, success, error)
    
    def log_request(self, service, details, success, error):
        timestamp = datetime.now().isoformat()
        status = "SUCCESS" if success else "FAILED"
        log_entry = f"{timestamp} {status} {service}: {details}"
        if error:
            log_entry += f" | Error: {error}"
        
        logger.info(log_entry)
        
        # Save to log file
        log_file_path = os.path.join(os.path.dirname(__file__), 'request-logs.txt')
        with open(log_file_path, 'a', encoding='utf-8') as f:
            f.write(log_entry + '\n')
    
    def get_stats(self):
        now = datetime.now()
        uptime = now - self.stats['start_time']
        hours_since_reset = (now - self.stats['last_reset']).total_seconds() / 3600
        
        # Reset hourly counters
        if hours_since_reset >= 1:
            self.stats['snapchat']['last_hour'] = 0
            self.stats['telegram']['last_hour'] = 0
            self.stats['last_reset'] = now
        
        # Reset daily counters
        if hours_since_reset >= 24:
            self.stats['snapchat']['last24h'] = 0
            self.stats['telegram']['last24h'] = 0
        
        return {
            **self.stats,
            'uptime': {
                'seconds': int(uptime.total_seconds()),
                'minutes': int(uptime.total_seconds() / 60),
                'hours': int(uptime.total_seconds() / 3600),
                'days': int(uptime.total_seconds() / 86400)
            },
            'rates': {
                'snapchat_per_hour': self.stats['snapchat']['last_hour'],
                'telegram_per_hour': self.stats['telegram']['last_hour'],
                'snapchat_per_day': self.stats['snapchat']['last24h'],
                'telegram_per_day': self.stats['telegram']['last24h']
            }
        }
    
    def print_stats(self):
        stats = self.get_stats()
        logger.info('\nREQUEST STATISTICS')
        logger.info('====================')
        logger.info(f"Uptime: {stats['uptime']['days']}d {stats['uptime']['hours']}h {stats['uptime']['minutes']}m")
        logger.info('\nSnapchat Requests:')
        logger.info(f"   Total: {stats['snapchat']['total']}")
        logger.info(f"   Successful: {stats['snapchat']['successful']}")
        logger.info(f"   Failed: {stats['snapchat']['failed']}")
        logger.info(f"   Rate Limited: {stats['snapchat']['rate_limited']}")
        logger.info(f"   Last Hour: {stats['rates']['snapchat_per_hour']}")
        logger.info(f"   Last 24h: {stats['rates']['snapchat_per_day']}")
        
        logger.info('\nTelegram Requests:')
        logger.info(f"   Total: {stats['telegram']['total']}")
        logger.info(f"   Successful: {stats['telegram']['successful']}")
        logger.info(f"   Failed: {stats['telegram']['failed']}")
        logger.info(f"   Photos: {stats['telegram']['photos']}")
        logger.info(f"   Videos: {stats['telegram']['videos']}")
        logger.info(f"   Last Hour: {stats['rates']['telegram_per_hour']}")
        logger.info(f"   Last 24h: {stats['rates']['telegram_per_day']}")

# Initialize systems
activity_tracker = ActivityTracker()
request_tracker = RequestTracker()

app = FastAPI(title="Snapchat Downloader API")

# Configure logging
logging.basicConfig(level=logging.INFO)
logger.remove()
logger.add(sys.stderr, format="<green>{time:YYYY-MM-DD HH:mm:ss.SSS}</green> | <level>{level: <8}</level> | <cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> - <level>{message}</level>")

# Add error logging to file
logger.add("server.log", rotation="10 MB", retention="7 days", level="ERROR")

# ===== GLOBAL ERROR HANDLING =====
def handle_exception(exc_type, exc_value, exc_traceback):
    """Global exception handler"""
    if issubclass(exc_type, KeyboardInterrupt):
        # Handle graceful shutdown
        logger.info("Received KeyboardInterrupt, shutting down gracefully...")
        sys.__excepthook__(exc_type, exc_value, exc_traceback)
        return
    
    # Log all other exceptions
    logger.error("Uncaught exception:", exc_info=(exc_type, exc_value, exc_traceback))
    
    # Write to error log file
    error_log_path = os.path.join(os.path.dirname(__file__), 'error-logs.txt')
    with open(error_log_path, 'a', encoding='utf-8') as f:
        f.write(f"[{datetime.now().isoformat()}] Uncaught exception:\n")
        f.write(f"Type: {exc_type.__name__}\n")
        f.write(f"Value: {exc_value}\n")
        f.write("Traceback:\n")
        traceback.print_tb(exc_traceback, file=f)
        f.write("\n" + "="*50 + "\n")

# Set the exception handler
sys.excepthook = handle_exception

# ===== HEALTH CHECK SYSTEM =====
class HealthCheck:
    def __init__(self):
        self.last_check = time.time()
        self.consecutive_failures = 0
        self.max_failures = 3
        self.check_interval = 5 * 60  # 5 minutes
        self.running = False
        self.lock = threading.Lock()
    
    async def perform_check(self):
        """Perform health check"""
        try:
            with self.lock:
                # Check if polling is still active
                if polling_started and not current_polling_timeout:
                    logger.warning('⚠️ Health check: Polling timeout missing, restarting...')
                    self.consecutive_failures += 1
                    await self.restart_polling()
                    return
                
                # Check database connectivity
                if db_manager:
                    await db_manager.check_connection()
                
                # Check memory usage
                memory = psutil.virtual_memory()
                if memory.percent > 90:
                    logger.warning(f"High memory usage: {memory.percent}%")
                    await self.cleanup_memory()
                
                # Check disk space
                disk = psutil.disk_usage(DOWNLOADS_DIR)
                if disk.percent > 90:
                    logger.warning(f"High disk usage: {disk.percent}%")
                    await self.cleanup_downloads()
                
                # Reset failure counter on success
                self.consecutive_failures = 0
                self.last_check = time.time()
                logger.info("Health check passed")
                
        except Exception as error:
            logger.error(f"❌ Health check failed: {error}")
            self.consecutive_failures += 1
            
            if self.consecutive_failures >= self.max_failures:
                logger.error("🚨 Too many consecutive health check failures")
                await self.restart_service()
    
    async def cleanup_memory(self):
        """Clean up memory"""
        try:
            # Force garbage collection
            gc.collect()
            logger.info("🗑️ Memory cleanup performed")
        except Exception as e:
            logger.error(f"Memory cleanup failed: {e}")
    
    async def cleanup_downloads(self):
        """Clean up old downloads"""
        try:
            # Remove files older than 7 days
            cutoff_time = time.time() - (7 * 24 * 60 * 60)
            removed_count = 0
            
            for root, dirs, files in os.walk(DOWNLOADS_DIR):
                for file in files:
                    file_path = os.path.join(root, file)
                    if os.path.getmtime(file_path) < cutoff_time:
                        os.remove(file_path)
                        removed_count += 1
            
            if removed_count > 0:
                logger.info(f"🧹 Cleaned up {removed_count} old files")
        except Exception as e:
            logger.error(f"Download cleanup failed: {e}")
    
    async def restart_polling(self):
        """Restart polling due to health check failure"""
        try:
            logger.info('🔄 Restarting polling due to health check failure...')
            await stop_polling()
            await asyncio.sleep(5)
            await start_polling(TARGET_USERNAME)
        except Exception as error:
            logger.error(f'Failed to restart polling: {error}')
    
    async def restart_service(self):
        """Restart service components"""
        try:
            logger.info("🔄 Restarting service components...")
            # Reinitialize database connection
            if db_manager:
                await db_manager.reconnect()
            # Restart polling
            await self.restart_polling()
            logger.info("✅ Service restart completed")
        except Exception as e:
            logger.error(f"Service restart failed: {e}")
    
    def start(self):
        """Start health check monitoring"""
        if self.running:
            return
        
        self.running = True
        
        async def health_check_loop():
            while self.running:
                await self.perform_check()
                await asyncio.sleep(self.check_interval)
        
        # Start health check in background
        asyncio.create_task(health_check_loop())
        logger.info("Health check system started")
    
    def stop(self):
        """Stop health check monitoring"""
        self.running = False

# ===== MEMORY MANAGEMENT SYSTEM =====
class MemoryManager:
    def __init__(self):
        self.last_cleanup = datetime.now()
        self.cleanup_interval = 30 * 60  # 30 minutes
        self.running = False
    
    async def perform_cleanup(self):
        """Perform memory cleanup"""
        try:
            # Clear any accumulated caches
            if hasattr(globals(), 'story_cache'):
                cache_size = len(globals()['story_cache'])
                if cache_size > 1000:
                    logger.info(f"🧹 Clearing large story cache ({cache_size} entries)")
                    globals()['story_cache'] = {}
            
            # Force garbage collection
            gc.collect()
            
            self.last_cleanup = datetime.now()
            logger.info('Memory cleanup completed')
            
        except Exception as error:
            logger.error(f'❌ Memory cleanup failed: {error}')
    
    def start(self):
        """Start memory management monitoring"""
        if self.running:
            return
        
        self.running = True
        
        async def cleanup_loop():
            while self.running:
                await asyncio.sleep(self.cleanup_interval)
                await self.perform_cleanup()
        
        # Start memory management in background
        asyncio.create_task(cleanup_loop())
        logger.info('Memory management system started')
    
    def stop(self):
        """Stop memory management monitoring"""
        self.running = False

# Initialize health check system
health_check = HealthCheck()
memory_manager = MemoryManager()

# ===== RESOURCE MANAGEMENT =====
class ResourceManager:
    def __init__(self):
        self.active_downloads = set()
        self.active_websockets = set()
        self.lock = threading.Lock()
    
    def register_download(self, download_id):
        """Register an active download"""
        with self.lock:
            self.active_downloads.add(download_id)
    
    def unregister_download(self, download_id):
        """Unregister a completed download"""
        with self.lock:
            self.active_downloads.discard(download_id)
    
    def register_websocket(self, websocket):
        """Register an active websocket"""
        with self.lock:
            self.active_websockets.add(websocket)
    
    def unregister_websocket(self, websocket):
        """Unregister a closed websocket"""
        with self.lock:
            self.active_websockets.discard(websocket)
    
    def get_stats(self):
        """Get resource usage statistics"""
        with self.lock:
            return {
                "active_downloads": len(self.active_downloads),
                "active_websockets": len(self.active_websockets),
                "memory_usage": psutil.virtual_memory()._asdict(),
                "disk_usage": psutil.disk_usage(DOWNLOADS_DIR)._asdict()
            }

# Initialize resource manager
resource_manager = ResourceManager()

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173","http://localhost:3000"],  # React frontend URL
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=3600,
)

# Add request logging middleware
@app.middleware("http")
async def log_requests(request: Request, call_next):
    logger.info(f"Request: {request.method} {request.url}")
    response = await call_next(request)
    logger.info(f"Response status: {response.status_code}")
    return response

# Set up downloads directory
DOWNLOADS_DIR = os.getenv("DOWNLOADS_DIR", os.path.join(os.path.dirname(os.path.abspath(__file__)), "downloads"))
os.makedirs(DOWNLOADS_DIR, exist_ok=True)
logger.info(f"Using downloads directory: {DOWNLOADS_DIR}")
app.mount("/downloads", StaticFiles(directory=DOWNLOADS_DIR), name="downloads")

# Telegram configuration
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
TELEGRAM_CHANNEL_ID = os.getenv("TELEGRAM_CHANNEL_ID")
telegram_manager = None

async def validate_telegram_config():
    """Validate Telegram configuration on startup"""
    global telegram_manager
    
    if not TELEGRAM_BOT_TOKEN:
        logger.warning("⚠️ TELEGRAM_BOT_TOKEN not configured - Telegram features will be disabled")
        return False
    
    if not TELEGRAM_CHANNEL_ID:
        logger.warning("⚠️ TELEGRAM_CHANNEL_ID not configured - Telegram features will be disabled")
        return False
    
    # Validate channel ID format
    if not TELEGRAM_CHANNEL_ID.startswith('-100'):
        logger.error("❌ TELEGRAM_CHANNEL_ID must start with -100 for channels")
        return False
    
    # Test Telegram connection
    try:
        telegram_manager = TelegramManager(TELEGRAM_BOT_TOKEN, TELEGRAM_CHANNEL_ID)
        is_valid = await telegram_manager.validate_connection()
        if is_valid:
            logger.info("Telegram configuration validated successfully")
            return True
        else:
            logger.error("❌ Telegram configuration validation failed")
            return False
            
    except Exception as e:
        logger.error(f"❌ Telegram configuration validation failed: {e}")
        return False

# Initialize Telegram on startup (replaced by enhanced_startup_event)

scheduler = AsyncIOScheduler()
scheduler.start()

class DownloadRequest(BaseModel):
    username: str
    download_type: str = "all"
    send_to_telegram: bool = False
    telegram_caption: Optional[str] = None

class ScheduleRequest(BaseModel):
    username: str
    interval_minutes: int
    download_type: str = "all"

class DownloadResponse(BaseModel):
    status: str
    message: str
    media_urls: Optional[List[str]] = None
    telegram_sent: Optional[bool] = None
    telegram_message: Optional[str] = None

class GalleryMediaItem(BaseModel):
    filename: str
    type: str
    thumbnail_url: Optional[str]
    download_status: str
    progress: Optional[int]

# Telegram integration models
class SendTelegramRequest(BaseModel):
    username: str
    media_type: str
    media_files: List[str]
    caption: Optional[str] = None

class SendTelegramResponse(BaseModel):
    status: str
    message: str
    sent_files: Optional[List[str]] = None
    failed_files: Optional[List[str]] = None

class TargetUser(BaseModel):
    id: int
    username: str
    is_active: bool
    polling_enabled: bool
    polling_interval: int
    last_polled: Optional[str]
    created_at: str

class AddTargetRequest(BaseModel):
    username: str
    polling_interval: int = 30

class UpdatePollingRequest(BaseModel):
    enabled: bool

class TelegramStatsResponse(BaseModel):
    total_sent: int
    total_failed: int
    recent_sent: int
    success_rate: float
    download_url: Optional[str]

class GalleryResponse(BaseModel):
    status: str
    media: List[GalleryMediaItem]

class BulkDownloadRequest(BaseModel):
    files: List[str]

class SendMediaRequest(BaseModel):
    phone_number: str = Field(pattern=r'^\+?1?\d{10,12}$')  # Validates phone number format
    media_files: List[str]  # List of filenames to send
    username: str
    media_type: str

class SendMediaResponse(BaseModel):
    status: str
    message: str
    sent_files: Optional[List[str]] = None
    failed_files: Optional[List[str]] = None

class SendEmailRequest(BaseModel):
    email: str = Field(pattern=r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$')  # Email validation
    media_files: List[str]  # List of filenames to send
    username: str
    media_type: str

class SendEmailResponse(BaseModel):
    status: str
    message: str
    sent_files: Optional[List[str]] = None
    failed_files: Optional[List[str]] = None

class SendDiscordRequest(BaseModel):
    webhook_url: Optional[str] = None  # Optional, can use env variable
    media_files: List[str]
    username: str
    media_type: str

class SendDiscordResponse(BaseModel):
    status: str
    message: str
    sent_files: Optional[List[str]] = None
    failed_files: Optional[List[str]] = None

# WebSocket Manager
class WebSocketManager:
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {}
        self.connection_metadata: Dict[str, Dict[WebSocket, Dict]] = {}  # Store metadata for each connection

    async def connect(self, websocket: WebSocket, key: str):
        await websocket.accept()
        if key not in self.active_connections:
            self.active_connections[key] = []
            self.connection_metadata[key] = {}
        
        # Initialize metadata for this specific connection
        self.connection_metadata[key][websocket] = {
            "last_activity": time.time(),
            "reconnect_count": 0,
            "error_count": 0
        }
        self.active_connections[key].append(websocket)
        logger.info(f"WebSocket connected for {key}")

    async def disconnect(self, websocket: WebSocket, key: str):
        if key in self.active_connections:
            if websocket in self.active_connections[key]:
                self.active_connections[key].remove(websocket)
                if websocket in self.connection_metadata[key]:
                    del self.connection_metadata[key][websocket]
            
            if not self.active_connections[key]:
                del self.active_connections[key]
                del self.connection_metadata[key]
            logger.info(f"WebSocket disconnected for {key}")

    async def broadcast(self, key: str, message: dict):
        """Broadcast a message to all connections for a given key."""
        if key not in self.active_connections:
            return

        dead_connections = []
        for connection in self.active_connections[key]:
            try:
                await connection.send_json(message)
                # Update last activity timestamp
                if connection in self.connection_metadata[key]:
                    self.connection_metadata[key][connection]["last_activity"] = time.time()
            except Exception as e:
                logger.error(f"Error broadcasting to connection: {e}")
                dead_connections.append(connection)
                # Increment error count
                if connection in self.connection_metadata[key]:
                    self.connection_metadata[key][connection]["error_count"] += 1
                    if self.connection_metadata[key][connection]["error_count"] >= 3:
                        logger.warning(f"Connection has too many errors, will be removed")
                        dead_connections.append(connection)

        # Remove dead connections
        for connection in dead_connections:
            await self.disconnect(connection, key)

    def get_connection_stats(self, key: str) -> Dict:
        if key in self.connection_metadata:
            return {
                "active_connections": len(self.active_connections.get(key, [])),
                "last_activity": max(
                    (meta["last_activity"] for meta in self.connection_metadata[key].values()),
                    default=time.time()
                ),
                "reconnect_count": sum(
                    meta["reconnect_count"] for meta in self.connection_metadata[key].values()
                ),
                "error_count": sum(
                    meta["error_count"] for meta in self.connection_metadata[key].values()
                )
            }
        return {}

websocket_manager = WebSocketManager()
scheduled_downloads = {}
progress_data = {}
file_progress = {}
progress_lock = Lock()

@app.get("/")
async def root():
    return {"message": "Snapchat Downloader API"}

@app.get("/health")
async def health_check_endpoint():
    """Health check endpoint"""
    try:
        # Get resource stats
        stats = resource_manager.get_stats()
        
        # Check database connectivity
        db_status = "connected" if db_manager else "disconnected"
        
        health = {
            "status": "healthy",
            "timestamp": datetime.now().isoformat(),
            "uptime": time.time() - app.startup_time if hasattr(app, 'startup_time') else 0,
            "database": db_status,
            "health_check": {
                "consecutive_failures": health_check.consecutive_failures,
                "last_check": health_check.last_check
            },
            "resources": stats
        }
        
        # Check if service is healthy
        if health_check.consecutive_failures >= health_check.max_failures:
            health["status"] = "unhealthy"
            return JSONResponse(content=health, status_code=503)
        
        return health
    except Exception as e:
        logger.error(f"Health check endpoint error: {e}")
        return JSONResponse(
            content={"status": "error", "message": str(e)},
            status_code=500
        )

@app.get("/stats")
async def get_stats():
    """Get resource statistics"""
    try:
        return resource_manager.get_stats()
    except Exception as e:
        logger.error(f"Stats endpoint error: {e}")
        return JSONResponse(
            content={"error": str(e)},
            status_code=500
        )

@app.get("/progress/{username}/{media_type}")
def get_progress(username: str, media_type: str):
    key = f"{username}:{media_type}"
    with progress_lock:
        overall_progress = progress_data.get(key, {"status": "not_started", "progress": 0, "total": 0, "downloaded": 0})
        file_progress_data = file_progress.get(key, {})
        return {
            "overall": overall_progress,
            "files": {
                filename: {
                    "status": data["status"],
                    "progress": data["progress"]
                } for filename, data in file_progress_data.items()
            }
        }

@app.websocket("/ws/progress/{username}/{media_type}")
async def websocket_endpoint(websocket: WebSocket, username: str, media_type: str):
    key = f"{username}/{media_type}"
    try:
        await websocket_manager.connect(websocket, key)
        while True:
            try:
                # Keep the connection alive and update last activity
                data = await websocket.receive_text()
                if websocket in websocket_manager.connection_metadata[key]:
                    websocket_manager.connection_metadata[key][websocket]["last_activity"] = time.time()
            except WebSocketDisconnect:
                await websocket_manager.disconnect(websocket, key)
                break
            except Exception as e:
                logger.error(f"Error in WebSocket connection: {e}")
                if websocket in websocket_manager.connection_metadata[key]:
                    websocket_manager.connection_metadata[key][websocket]["error_count"] += 1
                    if websocket_manager.connection_metadata[key][websocket]["error_count"] >= 3:
                        await websocket_manager.disconnect(websocket, key)
                        break
    except Exception as e:
        logger.error(f"Error setting up WebSocket connection: {e}")
        try:
            await websocket.close()
        except:
            pass

@app.post("/download", response_model=DownloadResponse)
async def download_content(request: DownloadRequest, background_tasks: BackgroundTasks):
    try:
        logger.info(f"[Snapchat] /download request: username={request.username}, type={request.download_type}, send_to_telegram={request.send_to_telegram}")
        snapchat = SnapchatDL(directory_prefix=DOWNLOADS_DIR)
        key = f"{request.username}:{request.download_type}"
        
        # Initialize progress data
        with progress_lock:
            progress_data[key] = {
                "status": "fetching",
                "progress": 0,
                "total": 0,
                "downloaded": 0,
                "message": f"Starting download for {request.username}"
            }
            file_progress[key] = {}

        async def progress_callback(ws_message):
            try:
                with progress_lock:
                    # Update overall progress
                    if "overall" in ws_message:
                        progress_data[key].update(ws_message["overall"])
                    
                    # Update file progress
                    if "files" in ws_message:
                        file_progress[key].update(ws_message["files"])
                    
                    # Update gallery metadata
                    if "overall" in ws_message and "metadata" in ws_message["overall"]:
                        save_media_metadata(request.username, request.download_type, ws_message["overall"]["metadata"])
                    
                    # Broadcast progress update via WebSocket
                    await websocket_manager.broadcast(key, {
                        "overall": progress_data[key],
                        "files": file_progress[key]
                    })
            except Exception as e:
                logger.error(f"Error in progress callback: {e}")
                logger.error(traceback.format_exc())

        # Create a synchronous wrapper for the downloader progress callback
        def sync_progress_callback(progress):
            """Synchronous wrapper for progress callback to avoid coroutine warnings"""
            try:
                # Create a simple progress message
                progress_message = {
                    "type": "progress_update",
                    "progress": progress
                }
                # Schedule the async callback to run in the event loop
                asyncio.create_task(progress_callback(progress_message))
            except Exception as e:
                logger.error(f"Error in sync progress callback: {e}")



        # Execute download synchronously (like Instagram system)
        try:
            logger.info(f"🔍 DEBUG: Starting download execution for {request.username}")
            
            # Create a new SnapchatDL instance
            snapchat = SnapchatDL(directory_prefix=DOWNLOADS_DIR)
            
            # Call the appropriate download method
            if request.download_type == "stories":
                logger.info(f"🔍 DEBUG: Calling snapchat.download({request.username})")
                await snapchat.download(request.username, progress_callback)
                logger.info(f"🔍 DEBUG: snapchat.download completed successfully")
            elif request.download_type == "highlights":
                logger.info(f"🔍 DEBUG: Calling snapchat.download_highlights({request.username})")
                await snapchat.download_highlights(request.username, progress_callback)
                logger.info(f"🔍 DEBUG: snapchat.download_highlights completed successfully")
            elif request.download_type == "spotlights":
                logger.info(f"🔍 DEBUG: Calling snapchat.download_spotlights({request.username})")
                await snapchat.download_spotlights(request.username, progress_callback)
                logger.info(f"🔍 DEBUG: snapchat.download_spotlights completed successfully")
            else:
                logger.info(f"🔍 DEBUG: Invalid download type: {request.download_type}")
                return DownloadResponse(
                    status="error",
                    message="Invalid download type selected.",
                    media_urls=None
                )
            
            # If Telegram sending is enabled, send downloaded content immediately
            logger.info(f"🔍 DEBUG: Reached Telegram logic section")
            telegram_sent = False
            telegram_message = None
            
            # Debug logging to see what's happening
            logger.info(f"🔍 DEBUG: request.send_to_telegram = {request.send_to_telegram}")
            logger.info(f"🔍 DEBUG: telegram_manager = {telegram_manager is not None}")
            
            if request.send_to_telegram and telegram_manager:
                logger.info(f"📤 [AUTO] Starting Telegram send for {request.username}/{request.download_type}")
                await send_downloaded_content_to_telegram(request.username, request.download_type, request.telegram_caption)
                telegram_sent = True
                telegram_message = "Successfully sent to Telegram"
                logger.info(f"✅ [AUTO] Telegram send completed for {request.username}")
            else:
                if not request.send_to_telegram:
                    logger.info(f"ℹ️ Telegram sending disabled for {request.username} (send_to_telegram = False)")
                if not telegram_manager:
                    logger.info(f"ℹ️ Telegram sending disabled for {request.username} (telegram_manager = None)")
            
            telegram_info = f" + Telegram sending enabled" if request.send_to_telegram else ""
            return DownloadResponse(
                status="success",
                message=f"Download completed for {request.username} ({request.download_type}){telegram_info}",
                media_urls=None,
                telegram_sent=telegram_sent,
                telegram_message=telegram_message
            )
            
        except NoStoriesFound:
            with progress_lock:
                progress_data[key]["status"] = "error"
                progress_data[key]["message"] = f"No {request.download_type} found for {request.username}"
            await websocket_manager.broadcast(key, {"overall": progress_data[key], "files": file_progress[key]})
            raise HTTPException(status_code=404, detail=f"No {request.download_type} found for {request.username}")
        except TypeError as e:
            if "NoneType" in str(e):
                with progress_lock:
                    progress_data[key]["status"] = "error"
                    progress_data[key]["message"] = (
                        f"Could not find any content for {request.username}. "
                        f"The user might not exist or have any {request.download_type}."
                    )
                await websocket_manager.broadcast(key, {"overall": progress_data[key], "files": file_progress[key]})
                raise HTTPException(status_code=404, detail=f"Could not find any content for {request.username}")
            else:
                with progress_lock:
                    progress_data[key]["status"] = "error"
                    progress_data[key]["message"] = str(e)
                await websocket_manager.broadcast(key, {"overall": progress_data[key], "files": file_progress[key]})
                raise HTTPException(status_code=500, detail=str(e))
        except Exception as e:
            logger.error(f"Unhandled error in download: {e}")
            logger.error(traceback.format_exc())
            with progress_lock:
                progress_data[key]["status"] = "error"
                progress_data[key]["message"] = str(e)
            await websocket_manager.broadcast(key, {"overall": progress_data[key], "files": file_progress[key]})
            raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        logger.error(f"Error in download_content: {e}")
        logger.error(traceback.format_exc())
        with progress_lock:
            progress_data[key]["status"] = "error"
            progress_data[key]["message"] = str(e)
        await websocket_manager.broadcast(key, {"overall": progress_data[key], "files": file_progress[key]})
        raise HTTPException(status_code=500, detail=str(e))

async def send_downloaded_content_to_telegram(username: str, media_type: str, custom_caption: str = None):
    """
    Send downloaded content to Telegram after successful download
    Similar to Instagram system's automatic Telegram sending
    """
    try:
        if not telegram_manager:
            logger.warning("⚠️ Telegram not configured - skipping Telegram send")
            return
        
        # Get media directory
        media_dir = os.path.join(DOWNLOADS_DIR, username, media_type)
        if not os.path.exists(media_dir):
            logger.warning(f"⚠️ Media directory not found: {media_dir}")
            return
        
        # Get all media files in the directory
        media_files = []
        for filename in os.listdir(media_dir):
            if filename.lower().endswith(('.jpg', '.jpeg', '.png', '.gif', '.mp4', '.mov', '.avi')):
                media_files.append(filename)
        
        if not media_files:
            logger.info(f"ℹ️ No media files found for {username}/{media_type}")
            return
        
        logger.info(f"📤 [AUTO] Sending {len(media_files)} files to Telegram for {username}/{media_type}")
        
        sent_files = []
        failed_files = []
        
        # Send each file to Telegram
        for i, filename in enumerate(media_files, 1):
            file_path = os.path.join(media_dir, filename)
            
            try:
                # Generate caption
                caption = custom_caption or generate_telegram_caption(username, media_type)
                
                # Log sending attempt (like Instagram)
                logger.info(f"📤 [AUTO] Sending item {i} ({filename}) to Telegram...")
                
                # Send to Telegram
                if filename.lower().endswith(('.mp4', '.mov', '.avi')):
                    result = await telegram_manager.send_video_with_retry(file_path, caption)
                else:
                    result = await telegram_manager.send_photo_with_retry(file_path, caption)
                
                # Log success
                await db_manager.insert_telegram_log(
                    media_id=f"{username}_{filename}",
                    username=username,
                    media_type=media_type,
                    telegram_chat_id=TELEGRAM_CHANNEL_ID,
                    telegram_message_id=str(result.get('message_id')),
                    caption=caption,
                    status='success'
                )
                
                sent_files.append(filename)
                logger.info(f"✅ [AUTO] Item {i} sent to Telegram successfully")
                
            except Exception as e:
                logger.error(f"⚠️ [AUTO] Failed to send item {i} to Telegram: {e}")
                await db_manager.insert_telegram_log(
                    media_id=f"{username}_{filename}",
                    username=username,
                    media_type=media_type,
                    telegram_chat_id=TELEGRAM_CHANNEL_ID,
                    caption=custom_caption or generate_telegram_caption(username, media_type),
                    status='error',
                    error_message=str(e)
                )
                failed_files.append(filename)
        
        # Log summary (like Instagram)
        if sent_files:
            logger.info(f"✅ [AUTO] Successfully sent {len(sent_files)} items to Telegram for {username}")
        if failed_files:
            logger.warning(f"⚠️ [AUTO] Failed to send {len(failed_files)} items to Telegram for {username}")
            
    except Exception as e:
        logger.error(f"❌ [AUTO] Error in send_downloaded_content_to_telegram: {e}")

@app.post("/schedule", response_model=DownloadResponse)
async def schedule_download(request: ScheduleRequest):
    try:
        job_id = f"{request.username}_{datetime.now().timestamp()}"
        
        async def download_job():
            snapchat = SnapchatDL(directory_prefix=DOWNLOADS_DIR)
            media_urls = []
            
            if request.download_type in ["all", "stories"]:
                stories = await snapchat.get_stories(request.username)
                media_urls.extend(stories)
                
            if request.download_type in ["all", "highlights"]:
                highlights = await snapchat.get_highlights(request.username)
                media_urls.extend(highlights)
                
            if media_urls:
                await snapchat.download_media(media_urls)
        
        scheduler.add_job(
            download_job,
            trigger=IntervalTrigger(minutes=request.interval_minutes),
            id=job_id,
            replace_existing=True
        )
        
        scheduled_downloads[job_id] = {
            "username": request.username,
            "interval": request.interval_minutes,
            "type": request.download_type
        }
        
        return DownloadResponse(
            status="success",
            message=f"Scheduled download for {request.username} every {request.interval_minutes} minutes"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/scheduled")
async def get_scheduled_downloads():
    return scheduled_downloads

@app.delete("/schedule/{job_id}")
async def remove_scheduled_download(job_id: str):
    try:
        scheduler.remove_job(job_id)
        if job_id in scheduled_downloads:
            del scheduled_downloads[job_id]
        return {"status": "success", "message": "Scheduled download removed"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

def get_metadata_path(username, media_type):
    return os.path.join(DOWNLOADS_DIR, username, media_type, ".media_metadata.json")

def load_media_metadata(username, media_type):
    path = get_metadata_path(username, media_type)
    if os.path.exists(path):
        with open(path, "r") as f:
            return json.load(f)
    return []

def save_media_metadata(username, media_type, metadata):
    path = get_metadata_path(username, media_type)
    with open(path, "w") as f:
        json.dump(metadata, f)

@app.get("/gallery/{username}/{media_type}", response_model=GalleryResponse)
async def get_gallery(username: str, media_type: str):
    logger.info(f"Fetching gallery for {username}/{media_type}")
    if media_type not in ["stories", "highlights", "spotlights"]:
        raise HTTPException(status_code=400, detail="Invalid media type")
    
    dir_name = os.path.join(DOWNLOADS_DIR, username, media_type)
    logger.info(f"Fetching gallery for directory: {dir_name}")
    if not os.path.exists(dir_name):
        logger.info(f"Creating directory for new user: {dir_name}")
        os.makedirs(dir_name, exist_ok=True)
    
    metadata = load_media_metadata(username, media_type)
    media_files = []
    key = f"{username}:{media_type}"
    
    with progress_lock:
        file_progress_data = file_progress.get(key, {})
    
    for item in metadata:
        file_path = os.path.join(dir_name, item["filename"])
        if os.path.isfile(file_path):
            file_type = item["type"]
            download_status = item["download_status"]
            progress = item["progress"]
            
            if item["filename"] in file_progress_data:
                file_status = file_progress_data[item["filename"]]
                download_status = file_status["status"]
                progress = file_status["progress"]
            
            # Use the actual file as both thumbnail and download URL
            file_url = f"/downloads/{username}/{media_type}/{item['filename']}"
            media_files.append(
                GalleryMediaItem(
                    filename=item["filename"],
                    type=file_type,
                    thumbnail_url=file_url,
                    download_status=download_status,
                    progress=progress,
                    download_url=file_url
                )
            )
    
    return GalleryResponse(status="success", media=media_files)

@app.post("/bulk-download/{username}/{media_type}")
def bulk_download(username: str, media_type: str, request: BulkDownloadRequest):
    if media_type not in ["stories", "highlights", "spotlights"]:
        raise HTTPException(status_code=400, detail="Invalid media type")
    dir_name = os.path.join(DOWNLOADS_DIR, username, media_type)
    if not os.path.exists(dir_name):
        raise HTTPException(status_code=404, detail="No files found")
    with tempfile.NamedTemporaryFile(delete=False, suffix=".zip") as temp_zip:
        with zipfile.ZipFile(temp_zip.name, 'w') as zipf:
            for file in request.files:
                file_path = os.path.join(dir_name, file)
                if os.path.exists(file_path):
                    zipf.write(file_path, file)
    return FileResponse(temp_zip.name, media_type="application/zip", filename=f"{username}_{media_type}.zip")

# Add a new endpoint to get WebSocket connection stats
@app.get("/ws/stats/{username}/{media_type}")
async def get_websocket_stats(username: str, media_type: str):
    key = f"{username}:{media_type}"
    return websocket_manager.get_connection_stats(key)

async def update_progress(username: str, media_type: str, filename: str, progress: float, status: str = "in_progress"):
    """Update progress for a specific file and broadcast to all connected clients."""
    key = f"{username}/{media_type}"
    
    # Get current progress data
    progress_data = progress_tracker.get_progress(key) or {
        "status": "in_progress",
        "files": {},
        "overall": {
            "status": "in_progress",
            "progress": 0,
            "message": "Download in progress"
        }
    }
    
    # Update file progress
    progress_data["files"][filename] = {
        "status": status,
        "progress": progress
    }
    
    # Calculate overall progress
    total_files = len(progress_data["files"])
    if total_files > 0:
        total_progress = sum(f["progress"] for f in progress_data["files"].values())
        overall_progress = total_progress / total_files
        progress_data["overall"]["progress"] = overall_progress
        
        # Update overall status if all files are complete
        if all(f["status"] == "complete" for f in progress_data["files"].values()):
            progress_data["overall"]["status"] = "complete"
            progress_data["overall"]["message"] = "Download completed"
        elif any(f["status"] == "error" for f in progress_data["files"].values()):
            progress_data["overall"]["status"] = "error"
            progress_data["overall"]["message"] = "Some files failed to download"
    
    # Update progress tracker
    progress_tracker.update_progress(key, progress_data)
    
    # Broadcast update to all connected clients
    await websocket_manager.broadcast(key, progress_data)

def cleanup_downloads():
    """Clean up the downloads directory."""
    try:
        if os.path.exists(DOWNLOADS_DIR):
            # Delete contents of the directory
            for item in os.listdir(DOWNLOADS_DIR):
                item_path = os.path.join(DOWNLOADS_DIR, item)
                if os.path.isfile(item_path):
                    os.remove(item_path)
                elif os.path.isdir(item_path):
                    shutil.rmtree(item_path)
            logger.info("Cleaned up downloads directory contents")
    except Exception as e:
        logger.error(f"Error cleaning up downloads directory: {e}")

def signal_handler(signum, frame):
    """Handle shutdown signals."""
    logger.info("Received shutdown signal, cleaning up...")
    # Don't immediately exit - let the process shutdown gracefully
    # The atexit handler will clean up when the process actually exits

# Register signal handlers
signal.signal(signal.SIGINT, signal_handler)
signal.signal(signal.SIGTERM, signal_handler)

# Register cleanup on normal exit
atexit.register(cleanup_downloads)

# Shutdown event (replaced by enhanced_shutdown_event)

@app.post("/send-media", response_model=SendMediaResponse)
async def send_media(request: SendMediaRequest):
    try:
        # Validate media type
        if request.media_type not in ["stories", "highlights", "spotlights"]:
            raise HTTPException(status_code=400, detail="Invalid media type")

        # Get Twilio credentials from environment variables
        account_sid = os.getenv("TWILIO_ACCOUNT_SID")
        auth_token = os.getenv("TWILIO_AUTH_TOKEN")
        twilio_number = os.getenv("TWILIO_PHONE_NUMBER")

        if not all([account_sid, auth_token, twilio_number]):
            raise HTTPException(
                status_code=500,
                detail="Twilio credentials not configured. Please set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER environment variables."
            )

        # Initialize Twilio client
        client = Client(account_sid, auth_token)

        # Format phone number
        phone_number = request.phone_number
        if not phone_number.startswith('+'):
            phone_number = '+1' + phone_number.lstrip('+')

        # Get the directory containing the media files
        media_dir = os.path.join(DOWNLOADS_DIR, request.username, request.media_type)
        if not os.path.exists(media_dir):
            raise HTTPException(status_code=404, detail="Media directory not found")

        sent_files = []
        failed_files = []

        # Send each media file
        for filename in request.media_files:
            file_path = os.path.join(media_dir, filename)
            if not os.path.exists(file_path):
                failed_files.append(filename)
                continue

            try:
                # Send media message using Twilio
                message = client.messages.create(
                    body=f"Media from {request.username}'s {request.media_type}",
                    from_=twilio_number,
                    to=phone_number,
                    media_url=[f"file://{file_path}"]
                )
                sent_files.append(filename)
                logger.info(f"Sent {filename} to {phone_number}")
            except TwilioRestException as e:
                logger.error(f"Error sending {filename}: {str(e)}")
                failed_files.append(filename)

        # Prepare response
        if sent_files and not failed_files:
            return SendMediaResponse(
                status="success",
                message=f"Successfully sent {len(sent_files)} files to {phone_number}",
                sent_files=sent_files
            )
        elif sent_files and failed_files:
            return SendMediaResponse(
                status="partial",
                message=f"Sent {len(sent_files)} files, failed to send {len(failed_files)} files",
                sent_files=sent_files,
                failed_files=failed_files
            )
        else:
            return SendMediaResponse(
                status="error",
                message="Failed to send any files",
                failed_files=failed_files
            )

    except Exception as e:
        logger.error(f"Error in send_media: {e}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/send-email", response_model=SendEmailResponse)
async def send_email(request: SendEmailRequest):
    try:
        # Validate media type
        if request.media_type not in ["stories", "highlights", "spotlights"]:
            raise HTTPException(status_code=400, detail="Invalid media type")

        # Get email credentials from environment variables
        smtp_server = os.getenv("SMTP_SERVER", "smtp.gmail.com")
        smtp_port = int(os.getenv("SMTP_PORT", "587"))
        smtp_username = os.getenv("SMTP_USERNAME")
        smtp_password = os.getenv("SMTP_PASSWORD")

        if not all([smtp_username, smtp_password]):
            raise HTTPException(
                status_code=500,
                detail="Email credentials not configured. Please set SMTP_USERNAME and SMTP_PASSWORD environment variables."
            )

        # Get the directory containing the media files
        media_dir = os.path.join(DOWNLOADS_DIR, request.username, request.media_type)
        if not os.path.exists(media_dir):
            raise HTTPException(status_code=404, detail="Media directory not found")

        sent_files = []
        failed_files = []

        # Create email message
        msg = MIMEMultipart()
        msg['From'] = smtp_username
        msg['To'] = request.email
        msg['Subject'] = f"Media from {request.username}'s {request.media_type}"

        # Add email body
        body = f"""Hi there!

Here are the requested media files from {request.username}'s {request.media_type}.

Files attached:
"""
        
        # Attach each media file
        for filename in request.media_files:
            file_path = os.path.join(media_dir, filename)
            if not os.path.exists(file_path):
                failed_files.append(filename)
                continue

            try:
                # Detect MIME type
                mime_type, _ = mimetypes.guess_type(file_path)
                
                # Read and attach file
                with open(file_path, 'rb') as f:
                    if mime_type and mime_type.startswith('image'):
                        attachment = MIMEImage(f.read())
                    else:
                        attachment = MIMEBase('application', 'octet-stream')
                        attachment.set_payload(f.read())
                        encoders.encode_base64(attachment)
                    
                    attachment.add_header('Content-Disposition', f'attachment; filename="{filename}"')
                    msg.attach(attachment)
                    sent_files.append(filename)
                    body += f"- {filename}\n"
                    
            except Exception as e:
                logger.error(f"Error attaching {filename}: {str(e)}")
                failed_files.append(filename)

        # Add body to email
        msg.attach(MIMEText(body, 'plain'))

        # Send email
        if sent_files:
            try:
                server = smtplib.SMTP(smtp_server, smtp_port)
                server.starttls()
                server.login(smtp_username, smtp_password)
                server.send_message(msg)
                server.quit()
                logger.info(f"Sent email with {len(sent_files)} files to {request.email}")
            except Exception as e:
                logger.error(f"Error sending email: {str(e)}")
                raise HTTPException(status_code=500, detail=f"Failed to send email: {str(e)}")

        # Prepare response
        if sent_files and not failed_files:
            return SendEmailResponse(
                status="success",
                message=f"Successfully sent {len(sent_files)} files to {request.email}",
                sent_files=sent_files
            )
        elif sent_files and failed_files:
            return SendEmailResponse(
                status="partial",
                message=f"Sent {len(sent_files)} files, failed to attach {len(failed_files)} files",
                sent_files=sent_files,
                failed_files=failed_files
            )
        else:
            return SendEmailResponse(
                status="error",
                message="Failed to attach any files",
                failed_files=failed_files
            )

    except Exception as e:
        logger.error(f"Error in send_email: {e}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/send-discord", response_model=SendDiscordResponse)
async def send_discord(request: SendDiscordRequest):
    try:
        # Validate media type
        if request.media_type not in ["stories", "highlights", "spotlights"]:
            raise HTTPException(status_code=400, detail="Invalid media type")

        # Get webhook URL from request or environment
        webhook_url = request.webhook_url or os.getenv("DISCORD_WEBHOOK_URL")
        
        if not webhook_url:
            raise HTTPException(
                status_code=500,
                detail="Discord webhook URL not provided. Either pass webhook_url in request or set DISCORD_WEBHOOK_URL environment variable."
            )

        # Get the directory containing the media files
        media_dir = os.path.join(DOWNLOADS_DIR, request.username, request.media_type)
        if not os.path.exists(media_dir):
            raise HTTPException(status_code=404, detail="Media directory not found")

        sent_files = []
        failed_files = []

        # Discord webhooks have a 25MB limit per request
        MAX_SIZE_PER_REQUEST = 25 * 1024 * 1024  # 25MB in bytes
        
        async with aiohttp.ClientSession() as session:
            # Group files for sending
            current_batch = []
            current_batch_size = 0
            
            for filename in request.media_files:
                file_path = os.path.join(media_dir, filename)
                if not os.path.exists(file_path):
                    failed_files.append(filename)
                    continue
                
                file_size = os.path.getsize(file_path)
                
                # If single file is too large, skip it
                if file_size > MAX_SIZE_PER_REQUEST:
                    logger.warning(f"File {filename} is too large for Discord ({file_size} bytes)")
                    failed_files.append(filename)
                    continue
                
                # If adding this file would exceed limit, send current batch
                if current_batch and (current_batch_size + file_size > MAX_SIZE_PER_REQUEST):
                    await send_discord_batch(session, webhook_url, current_batch, request.username, request.media_type, sent_files, failed_files)
                    current_batch = []
                    current_batch_size = 0
                
                current_batch.append((filename, file_path))
                current_batch_size += file_size
            
            # Send remaining files
            if current_batch:
                await send_discord_batch(session, webhook_url, current_batch, request.username, request.media_type, sent_files, failed_files)

        # Prepare response
        if sent_files and not failed_files:
            return SendDiscordResponse(
                status="success",
                message=f"Successfully sent {len(sent_files)} files to Discord",
                sent_files=sent_files
            )
        elif sent_files and failed_files:
            return SendDiscordResponse(
                status="partial",
                message=f"Sent {len(sent_files)} files, failed to send {len(failed_files)} files",
                sent_files=sent_files,
                failed_files=failed_files
            )
        else:
            return SendDiscordResponse(
                status="error",
                message="Failed to send any files",
                failed_files=failed_files
            )

    except Exception as e:
        logger.error(f"Error in send_discord: {e}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))

async def send_discord_batch(session, webhook_url, batch, username, media_type, sent_files, failed_files):
    """Helper function to send a batch of files to Discord"""
    try:
        # Prepare multipart form data
        data = aiohttp.FormData()
        data.add_field('content', f"Media from {username}'s {media_type}")
        
        # Add files to form data
        for filename, file_path in batch:
            with open(file_path, 'rb') as f:
                data.add_field('file', f.read(), filename=filename, content_type=mimetypes.guess_type(file_path)[0] or 'application/octet-stream')
        
        # Send to Discord
        async with session.post(webhook_url, data=data) as response:
            if response.status in [200, 204]:
                for filename, _ in batch:
                    sent_files.append(filename)
                    logger.info(f"Sent {filename} to Discord")
            else:
                error_text = await response.text()
                logger.error(f"Discord API error: {response.status} - {error_text}")
                for filename, _ in batch:
                    failed_files.append(filename)
                    
    except Exception as e:
        logger.error(f"Error sending batch to Discord: {str(e)}")
        for filename, _ in batch:
            failed_files.append(filename)

# Telegram integration endpoints
@app.post("/send-to-telegram", response_model=SendTelegramResponse)
async def send_to_telegram(request: SendTelegramRequest):
    """
    Send media files to Telegram channel
    
    Parameters:
    - username: Snapchat username
    - media_type: 'stories', 'highlights', 'spotlights'
    - media_files: List of filenames to send
    - caption: Optional custom caption
    """
    if not telegram_manager:
        raise HTTPException(status_code=503, detail="Telegram not configured")
    
    try:
        # Validate inputs
        if request.media_type not in ["stories", "highlights", "spotlights"]:
            raise HTTPException(status_code=400, detail="Invalid media type")
        
        # Get media directory
        media_dir = os.path.join(DOWNLOADS_DIR, request.username, request.media_type)
        if not os.path.exists(media_dir):
            raise HTTPException(status_code=404, detail="Media directory not found")
        
        sent_files = []
        failed_files = []
        
        # Send each file to Telegram
        for filename in request.media_files:
            file_path = os.path.join(media_dir, filename)
            if not os.path.exists(file_path):
                failed_files.append(filename)
                continue
            
            try:
                # Generate caption
                caption = request.caption or generate_telegram_caption(request.username, request.media_type)
                
                # Send to Telegram
                if filename.lower().endswith(('.mp4', '.mov', '.avi')):
                    result = await telegram_manager.send_video_with_retry(file_path, caption)
                else:
                    result = await telegram_manager.send_photo_with_retry(file_path, caption)
                
                # Log success
                await db_manager.insert_telegram_log(
                    media_id=f"{request.username}_{filename}",
                    username=request.username,
                    media_type=request.media_type,
                    telegram_chat_id=TELEGRAM_CHANNEL_ID,
                    telegram_message_id=str(result.get('message_id')),
                    caption=caption,
                    status='success'
                )
                
                sent_files.append(filename)
                
            except Exception as e:
                logger.error(f"Failed to send {filename} to Telegram: {e}")
                await db_manager.insert_telegram_log(
                    media_id=f"{request.username}_{filename}",
                    username=request.username,
                    media_type=request.media_type,
                    telegram_chat_id=TELEGRAM_CHANNEL_ID,
                    caption=request.caption or generate_telegram_caption(request.username, request.media_type),
                    status='error',
                    error_message=str(e)
                )
                failed_files.append(filename)
        
        # Return response
        if sent_files and not failed_files:
            return SendTelegramResponse(
                status="success",
                message=f"Successfully sent {len(sent_files)} files to Telegram",
                sent_files=sent_files
            )
        elif sent_files and failed_files:
            return SendTelegramResponse(
                status="partial",
                message=f"Sent {len(sent_files)} files, failed to send {len(failed_files)} files",
                sent_files=sent_files,
                failed_files=failed_files
            )
        else:
            return SendTelegramResponse(
                status="error",
                message="Failed to send any files",
                failed_files=failed_files
            )
            
    except Exception as e:
        logger.error(f"Error in send_to_telegram: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/send-file-to-telegram/{username}/{media_type}/{filename}")
async def send_file_to_telegram(username: str, media_type: str, filename: str, caption: str = None):
    """
    Send a single file to Telegram from the gallery
    Similar to Instagram system's individual "Send to Telegram" buttons
    """
    if not telegram_manager:
        raise HTTPException(status_code=503, detail="Telegram not configured")
    
    try:
        # Validate inputs
        if media_type not in ["stories", "highlights", "spotlights"]:
            raise HTTPException(status_code=400, detail="Invalid media type")
        
        # Get media directory and file path
        media_dir = os.path.join(DOWNLOADS_DIR, username, media_type)
        file_path = os.path.join(media_dir, filename)
        
        if not os.path.exists(media_dir):
            raise HTTPException(status_code=404, detail="Media directory not found")
        
        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail="File not found")
        
        # Generate caption
        final_caption = caption or generate_telegram_caption(username, media_type)
        
        # Send to Telegram
        if filename.lower().endswith(('.mp4', '.mov', '.avi')):
            result = await telegram_manager.send_video_with_retry(file_path, final_caption)
        else:
            result = await telegram_manager.send_photo_with_retry(file_path, final_caption)
        
        # Log success
        await db_manager.insert_telegram_log(
            media_id=f"{username}_{filename}",
            username=username,
            media_type=media_type,
            telegram_chat_id=TELEGRAM_CHANNEL_ID,
            telegram_message_id=str(result.get('message_id')),
            caption=final_caption,
            status='success'
        )
        
        logger.info(f"✅ [MANUAL] Sent {filename} to Telegram for {username}")
        
        return {
            "status": "success",
            "message": f"Successfully sent {filename} to Telegram",
            "filename": filename,
            "telegram_message_id": result.get('message_id')
        }
        
    except Exception as e:
        logger.error(f"❌ [MANUAL] Failed to send {filename} to Telegram: {e}")
        
        # Log error
        await db_manager.insert_telegram_log(
            media_id=f"{username}_{filename}",
            username=username,
            media_type=media_type,
            telegram_chat_id=TELEGRAM_CHANNEL_ID,
            caption=caption or generate_telegram_caption(username, media_type),
            status='error',
            error_message=str(e)
        )
        
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/telegram/stats", response_model=TelegramStatsResponse)
async def get_telegram_stats():
    """Get Telegram sending statistics"""
    try:
        stats = await db_manager.get_telegram_stats()
        return TelegramStatsResponse(**stats)
    except Exception as e:
        logger.error(f"Error getting Telegram stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/telegram/config")
async def get_telegram_config():
    """Get Telegram configuration status"""
    return {
        "configured": telegram_manager is not None,
        "bot_token": "***" if TELEGRAM_BOT_TOKEN else None,
        "channel_id": TELEGRAM_CHANNEL_ID
    }

# ===== PHASE 2: POLLING SYSTEM IMPLEMENTATION =====

# ===== 2.1 Polling State Management Functions =====
async def start_polling(username):
    global TARGET_USERNAME, polling_started
    
    if polling_started:
        logger.warning('⚠️ Polling already started')
        return
    
    TARGET_USERNAME = username
    polling_started = True
    
    logger.info(f"Snapchat polling started for @{TARGET_USERNAME}")
    logger.info('Manual poll: GET /poll-now')
    logger.info(f'Frontend available: http://localhost:8000')
    
    # Start health check system
    health_check.start()
    
    # Start first poll after 10 seconds
    await asyncio.sleep(10.0)
    await execute_poll_cycle()

async def stop_polling():
    global current_polling_timeout, polling_started
    
    if current_polling_timeout:
        current_polling_timeout.cancel()
        current_polling_timeout = None
        logger.info('Polling stopped')
    
    polling_started = False

async def restart_polling():
    await stop_polling()
    logger.info(f"Restarting polling for @{TARGET_USERNAME}")
    
    # Start new poll after 5 seconds
    await asyncio.sleep(5.0)
    await execute_poll_cycle()

# ===== 2.2 Smart Polling Scheduling =====
async def schedule_next_poll():
    global current_polling_timeout
    
    # Get smart polling interval based on activity
    base_minutes = activity_tracker.get_polling_interval()
    variation_minutes = 2  # ±2 minutes for randomization (like Instagram)
    
    # Add/subtract variation (±2 minutes)
    variation = random.randint(-variation_minutes, variation_minutes)
    final_minutes = max(1, base_minutes + variation)  # Ensure minimum 1 minute
    
    next_poll_seconds = final_minutes * 60
    
    next_poll_time = datetime.now(timezone(timedelta(hours=-4))) + timedelta(minutes=final_minutes)  # EDT timezone
    time_string = next_poll_time.strftime('%I:%M %p')
    logger.info(f"Next poll scheduled in {final_minutes} minutes (smart: {base_minutes} ± {abs(variation)}) for @{TARGET_USERNAME} at {time_string} EDT")
    
    # Schedule next poll using asyncio
    current_polling_timeout = asyncio.create_task(asyncio.sleep(next_poll_seconds))
    await current_polling_timeout
    await execute_poll_cycle()

async def execute_poll_cycle():
    if POLLING_ENABLED:
        try:
            # Check for new stories
            await check_for_new_stories()
            await schedule_next_poll()  # Schedule the next poll
        except Exception as error:
            logger.error(f'❌ Polling cycle failed: {error}')
            # Log error but don't stop polling
            error_log_path = os.path.join(os.path.dirname(__file__), 'error-logs.txt')
            with open(error_log_path, 'a', encoding='utf-8') as f:
                f.write(f"[{datetime.now(timezone(timedelta(hours=-4))).isoformat()}] Polling error: {error}\n")
            
            # Retry after 5 minutes instead of the full interval
            await asyncio.sleep(5 * 60)
            await execute_poll_cycle()

# ===== 2.3 Story Processing Pipeline =====
async def check_for_new_stories(force=False):
    try:
        logger.info(f"\nChecking for new stories from @{TARGET_USERNAME} {force and '(force send enabled)' or ''}")
        
        # Use existing Snapchat downloader to get stories
        snapchat_dl = SnapchatDL()
        
        try:
            # Fetch stories without downloading
            stories = []
            async for story, user_info in snapchat_dl._web_fetch_story(TARGET_USERNAME):
                # Convert to the format expected by the polling system
                story_data = {
                    'url': story["snapUrls"]["mediaUrl"],
                    'type': 'video' if story["snapMediaType"] == "VIDEO" else 'photo',
                    'snap_id': story["snapId"]["value"],
                    'timestamp': story["timestampInSec"]["value"]
                }
                stories.append(story_data)
            
            logger.info(f"Found {len(stories)} total stories")
        except NoStoriesFound:
            logger.info("No stories found for user")
            stories = []
        except Exception as e:
            logger.error(f"Error fetching stories: {e}")
            request_tracker.track_snapchat(f"stories_{TARGET_USERNAME}", False, str(e))
            return
        
        # Use cache to find only new stories
        new_stories = await find_new_stories(TARGET_USERNAME, stories)
        
        # Update cache with current stories
        await update_stories_cache(TARGET_USERNAME, stories)
        
        if len(new_stories) == 0 and not force:
            logger.info("✅ No new stories found, skipping story processing...")
            return
        
        logger.info(f"Processing {len(new_stories)} new stories out of {len(stories)} total")
        
        # Process each new story
        for story in new_stories:
            try:
                # Send to Telegram automatically
                if telegram_manager:
                    try:
                        logger.info(f"📤 [AUTO] Sending story to Telegram...")
                        story_caption = f"✨ New story from <a href='https://snapchat.com/add/{TARGET_USERNAME}'>@{TARGET_USERNAME}</a>! 📱"
                        
                        # Determine if it's a video based on file extension or content type
                        is_video = story.get('url', '').lower().endswith(('.mp4', '.mov', '.avi')) or story.get('type') == 'video'
                        
                        if is_video:
                            result = await telegram_manager.send_video_with_retry(story['url'], story_caption)
                            request_tracker.track_telegram('video', True)
                        else:
                            result = await telegram_manager.send_photo_with_retry(story['url'], story_caption)
                            request_tracker.track_telegram('photo', True)
                        
                        logger.info(f"✅ [AUTO] Story sent to Telegram successfully")
                        
                        # Add delay between Telegram sends
                        await asyncio.sleep(1)
                        
                    except Exception as telegram_error:
                        logger.error(f"⚠️ [AUTO] Failed to send story to Telegram: {telegram_error}")
                        request_tracker.track_telegram('photo' if not is_video else 'video', False, str(telegram_error))
                
                # Mark as processed
                story_id = generate_story_id(story)
                await mark_story_processed(story_id, TARGET_USERNAME, story['url'], story.get('type', 'photo'))
                logger.info(f"✅ Story marked as processed: {story_id}")
                
            except Exception as error:
                logger.error(f"⚠️ Error processing story: {error}")
        
        # Update activity tracker with new stories found
        if len(new_stories) > 0:
            activity_tracker.update_activity(len(new_stories))
            logger.info(f"📊 Activity updated: +{len(new_stories)} new stories processed")
        
        logger.info('Polling check completed')
        # Always print request statistics after each polling run
        request_tracker.print_stats()
        
        # Reset activity counter for next poll cycle
        activity_tracker.reset_activity_counter()
        
        logger.info('')
        
    except Exception as error:
        logger.error(f'Polling error: {error}')
        request_tracker.track_snapchat(f"stories_{TARGET_USERNAME}", False, str(error))

# ===== 2.4 Database Operations for Stories =====
async def find_new_stories(username, fetched_stories):
    """Find stories that are not in the cache"""
    try:
        # Get cached stories for this user
        cached_stories = await db_manager.get_cached_media(username, 'stories')
        cached_story_ids = {story['snap_id'] for story in cached_stories if story.get('snap_id')}
        
        new_stories = []
        for story in fetched_stories:
            story_id = generate_story_id(story)
            if story_id not in cached_story_ids:
                new_stories.append(story)
        
        logger.info(f"📊 Stories summary: {len(fetched_stories)} fetched, {len(cached_story_ids)} cached, {len(new_stories)} new")
        return new_stories
        
    except Exception as error:
        logger.error(f"Error finding new stories: {error}")
        return fetched_stories  # Return all stories if cache lookup fails

async def update_stories_cache(username, stories):
    """Update the stories cache with current stories"""
    try:
        # Clear old cache entries for this user
        await db_manager.clear_cached_media(username, 'stories')
        
        # Insert new cache entries
        for i, story in enumerate(stories):
            story_id = generate_story_id(story)
            await db_manager.insert_cached_media(
                username=username,
                media_url=story['url'],
                snap_id=story_id,
                media_type=story.get('type', 'photo'),
                media_order=i
            )
        
        logger.info(f"✅ Stories cache updated for @{username}")
        
    except Exception as error:
        logger.error(f"Error updating stories cache: {error}")

def generate_story_id(story):
    """Generate a unique story ID from the snap_id or URL"""
    if story.get('snap_id'):
        return story['snap_id']
    elif story.get('url'):
        import hashlib
        return hashlib.md5(story['url'].encode()).hexdigest()[:20]
    else:
        return f"story_{int(time.time())}_{random.randint(1000, 9999)}"

async def check_story_processed(username, story_id):
    """Check if a story has already been processed"""
    try:
        processed_media = await db_manager.get_processed_media_by_id(story_id)
        return processed_media is not None
        
    except Exception as error:
        logger.error(f"Error checking story processed: {error}")
        return False

async def mark_story_processed(story_id, username, story_url, story_type):
    """Mark a story as processed"""
    try:
        await db_manager.insert_processed_media(
            media_id=story_id,
            username=username,
            media_url=story_url,
            media_type=story_type,
            file_path=story_url,  # For stories, URL is the file path
            is_sent_to_telegram=True
        )
        
    except Exception as error:
        logger.error(f"Error marking story processed: {error}")

# ===== PHASE 5: API ENDPOINTS =====

# ===== 5.1 Polling Control Endpoints =====
@app.post("/start-polling")
async def start_polling_endpoint():
    """Start automatic polling for Snapchat stories"""
    try:
        if not TARGET_USERNAME:
            raise HTTPException(status_code=400, detail="No target set. Please set a target first.")
        
        if polling_started:
            return {
                "success": True,
                "message": "Polling already started",
                "target": TARGET_USERNAME,
                "polling_active": True
            }
        
        logger.info(f"Starting polling for @{TARGET_USERNAME}")
        await start_polling(TARGET_USERNAME)
        
        return {
            "success": True,
            "message": f'Polling started for @{TARGET_USERNAME}',
            "target": TARGET_USERNAME,
            "polling_active": True
        }
        
    except Exception as error:
        logger.error(f"Error starting polling: {error}")
        raise HTTPException(status_code=500, detail=str(error))

@app.post("/stop-polling")
async def stop_polling_endpoint():
    """Stop automatic polling"""
    try:
        if not polling_started:
            return {
                "success": True,
                "message": "Polling not active",
                "polling_active": False
            }
        
        logger.info(f"🛑 Stopping polling for @{TARGET_USERNAME}")
        await stop_polling()
        
        return {
            "success": True,
            "message": "Polling stopped",
            "polling_active": False
        }
        
    except Exception as error:
        logger.error(f"Error stopping polling: {error}")
        raise HTTPException(status_code=500, detail=str(error))

@app.get("/poll-now")
async def manual_poll_endpoint(force: bool = False):
    """Trigger manual polling immediately"""
    try:
        if not TARGET_USERNAME:
            raise HTTPException(status_code=400, detail="No target set. Please set a target first.")
        
        logger.info(f"Manual polling triggered via API (force={force})")
        await check_for_new_stories(force)
        
        return {
            "success": True,
            "message": "Polling completed",
            "target": TARGET_USERNAME,
            "force": force
        }
        
    except Exception as error:
        logger.error(f"Error in manual polling: {error}")
        raise HTTPException(status_code=500, detail=str(error))

# ===== 5.2 Status and Statistics Endpoints =====
@app.get("/status")
async def get_status():
    """Get service status and polling information"""
    try:
        stats = request_tracker.get_stats()
        return {
            "status": "running",
            "target_username": TARGET_USERNAME,
            "polling_enabled": POLLING_ENABLED,
            "polling_active": current_polling_timeout is not None,
            "polling_started": polling_started,
            "uptime": stats['uptime'],
            "statistics": {
                "snapchat": stats['snapchat'],
                "telegram": stats['telegram'],
                "rates": stats['rates']
            }
        }
        
    except Exception as error:
        logger.error(f"Error getting status: {error}")
        raise HTTPException(status_code=500, detail=str(error))

@app.get("/stats")
async def get_stats():
    """Get detailed request statistics"""
    try:
        stats = request_tracker.get_stats()
        return stats
        
    except Exception as error:
        logger.error(f"Error getting stats: {error}")
        raise HTTPException(status_code=500, detail=str(error))

@app.get("/polling/config")
async def get_polling_config():
    """Get polling configuration"""
    return {
        "target_username": TARGET_USERNAME,
        "polling_enabled": POLLING_ENABLED,
        "polling_active": polling_started,
        "current_timeout": current_polling_timeout is not None,
        "activity_level": activity_tracker.get_activity_level(),
        "current_interval": activity_tracker.get_polling_interval()
    }

@app.post("/set-target")
async def set_target_endpoint(username: str):
    """Set the target username for polling (follows Instagram flow - no automatic polling)"""
    try:
        global TARGET_USERNAME
        
        if not username or username.strip() == "":
            raise HTTPException(status_code=400, detail="Username cannot be empty")
        
        # Only stop polling if we're changing to a different target (matches Instagram behavior)
        if polling_started and TARGET_USERNAME and TARGET_USERNAME.strip() != username.strip():
            logger.info(f"🔄 Changing target from @{TARGET_USERNAME} to @{username.strip()}, stopping current polling")
            await stop_polling()
        
        TARGET_USERNAME = username.strip()
        
        logger.info(f"Target username set to: @{TARGET_USERNAME}")
        
        return {
            "success": True,
            "message": f"Target username set to @{TARGET_USERNAME}",
            "target": TARGET_USERNAME
        }
        
    except Exception as error:
        logger.error(f"Error setting target: {error}")
        raise HTTPException(status_code=500, detail=str(error))

# ===== PHASE 6: TELEGRAM INTEGRATION ENHANCEMENT =====

# ===== 6.1 Enhanced Telegram Sending with Fallbacks =====
async def send_story_to_telegram_with_fallback(story, username):
    """Send story to Telegram with comprehensive fallback handling"""
    try:
        if not telegram_manager:
            logger.warning("⚠️ Telegram not configured - skipping story send")
            return False
        
        story_caption = f"✨ New story from <a href='https://snapchat.com/add/{username}'>@{username}</a>! 📱"
        is_video = story.get('url', '').lower().endswith(('.mp4', '.mov', '.avi')) or story.get('type') == 'video'
        
        # Primary send attempt
        try:
            if is_video:
                result = await telegram_manager.send_video_with_retry(story['url'], story_caption)
                request_tracker.track_telegram('video', True)
            else:
                result = await telegram_manager.send_photo_with_retry(story['url'], story_caption)
                request_tracker.track_telegram('photo', True)
            
            logger.info(f"✅ [AUTO] Story sent to Telegram successfully")
            return True
            
        except Exception as primary_error:
            logger.warning(f"⚠️ Primary Telegram send failed: {primary_error}")
            
            # Fallback: Try with different caption format
            try:
                fallback_caption = f"📱 New story from @{username}"
                if is_video:
                    result = await telegram_manager.send_video_with_retry(story['url'], fallback_caption)
                else:
                    result = await telegram_manager.send_photo_with_retry(story['url'], fallback_caption)
                
                logger.info(f"✅ [FALLBACK] Story sent to Telegram with fallback caption")
                request_tracker.track_telegram('video' if is_video else 'photo', True)
                return True
                
            except Exception as fallback_error:
                logger.error(f"❌ Fallback Telegram send also failed: {fallback_error}")
                request_tracker.track_telegram('video' if is_video else 'photo', False, str(fallback_error))
                return False
                
    except Exception as error:
        logger.error(f"❌ Error in send_story_to_telegram_with_fallback: {error}")
        return False

# ===== PHASE 7: SERVICE INTEGRATION & GRACEFUL SHUTDOWN =====

# ===== 7.1 Enhanced Graceful Shutdown =====
async def graceful_shutdown():
    """Enhanced graceful shutdown for the polling system"""
    try:
        logger.info("🔄 Starting graceful shutdown...")
        
        # Stop polling system
        if polling_started:
            logger.info("🛑 Stopping polling system...")
            await stop_polling()
        
        # Stop health check system
        if health_check.running:
            logger.info("🏥 Stopping health check system...")
            health_check.stop()
        
        # Stop memory management
        if memory_manager.running:
            logger.info("🧠 Stopping memory management...")
            memory_manager.stop()
        
        # Close database connections
        if db_manager:
            logger.info("🗄️ Closing database connections...")
            await db_manager.close()
        
        # Close Telegram manager
        if telegram_manager:
            logger.info("📤 Closing Telegram manager...")
            await telegram_manager.close()
        
        # Stop scheduler
        if scheduler.running:
            logger.info("⏰ Stopping scheduler...")
            scheduler.shutdown()
        
        # Close WebSocket connections
        logger.info("🔌 Closing WebSocket connections...")
        for key in list(websocket_manager.active_connections.keys()):
            for websocket in websocket_manager.active_connections[key]:
                try:
                    await websocket.close()
                except:
                    pass
        
        logger.info("✅ Graceful shutdown completed")
        
    except Exception as error:
        logger.error(f"❌ Error during graceful shutdown: {error}")

# ===== 7.2 Enhanced Startup Integration =====
@app.on_event("startup")
async def enhanced_startup_event():
    """Enhanced startup with polling system integration"""
    try:
        app.startup_time = time.time()
        
        # Initialize core services
        logger.info("Initializing Snapchat service...")
        
        # Validate Telegram configuration
        telegram_valid = await validate_telegram_config()
        if telegram_valid:
            logger.info("Telegram integration ready")
        else:
            logger.warning("⚠️ Telegram integration disabled")
        
        # Start monitoring systems
        health_check.start()
        memory_manager.start()
        
        # Initialize polling if target is set
        if TARGET_USERNAME:
            logger.info(f"🎯 Target username found: @{TARGET_USERNAME}")
            logger.info("💡 Use /start-polling to begin automatic polling")
        else:
            logger.info("💡 Set target username with /set-target to enable polling")
        
        logger.info("Snapchat service started successfully")
        logger.info("API Documentation: http://localhost:8000/docs")
        logger.info("Health Check: http://localhost:8000/health")
        
    except Exception as error:
        logger.error(f"❌ Error during startup: {error}")
        raise

# ===== 7.3 Enhanced Shutdown Integration =====
@app.on_event("shutdown")
async def enhanced_shutdown_event():
    """Enhanced shutdown event handler"""
    try:
        logger.info("🔄 Shutdown signal received...")
        await graceful_shutdown()
        cleanup_downloads()
    except Exception as error:
        logger.error(f"❌ Error during shutdown: {error}")

# ===== 7.4 Signal Handlers for Graceful Shutdown =====
def enhanced_signal_handler(signum, frame):
    """Enhanced signal handler for graceful shutdown"""
    logger.info(f"📡 Received signal {signum}, initiating graceful shutdown...")
    
    # Schedule graceful shutdown in the event loop
    asyncio.create_task(graceful_shutdown())

# Register enhanced signal handlers
signal.signal(signal.SIGINT, enhanced_signal_handler)
signal.signal(signal.SIGTERM, enhanced_signal_handler)

# ===== 7.5 Enhanced Polling Integration =====
async def enhanced_check_for_new_stories(force=False):
    """Enhanced story checking with better error handling and Telegram integration"""
    try:
        logger.info(f"\nChecking for new stories from @{TARGET_USERNAME} {force and '(force send enabled)' or ''}")
        
        # Use existing Snapchat downloader to get stories
        snapchat_dl = SnapchatDL()
        
        try:
            # Fetch stories without downloading
            stories = []
            async for story, user_info in snapchat_dl._web_fetch_story(TARGET_USERNAME):
                # Convert to the format expected by the polling system
                story_data = {
                    'url': story["snapUrls"]["mediaUrl"],
                    'type': 'video' if story["snapMediaType"] == "VIDEO" else 'photo',
                    'snap_id': story["snapId"]["value"],
                    'timestamp': story["timestampInSec"]["value"]
                }
                stories.append(story_data)
            
            logger.info(f"Found {len(stories)} total stories")
            request_tracker.track_snapchat(f"stories_{TARGET_USERNAME}", True)
        except NoStoriesFound:
            logger.info("No stories found for user")
            stories = []
            request_tracker.track_snapchat(f"stories_{TARGET_USERNAME}", True)
        except Exception as e:
            logger.error(f"Error fetching stories: {e}")
            request_tracker.track_snapchat(f"stories_{TARGET_USERNAME}", False, str(e))
            return
        
        # Use cache to find only new stories
        new_stories = await find_new_stories(TARGET_USERNAME, stories)
        
        # Update cache with current stories
        await update_stories_cache(TARGET_USERNAME, stories)
        
        if len(new_stories) == 0 and not force:
            logger.info("✅ No new stories found, skipping story processing...")
            return
        
        logger.info(f"Processing {len(new_stories)} new stories out of {len(stories)} total")
        
        # Process each new story with enhanced Telegram integration
        successful_sends = 0
        failed_sends = 0
        
        for i, story in enumerate(new_stories, 1):
            try:
                logger.info(f"📤 [AUTO] Processing story {i}/{len(new_stories)}...")
                
                # Send to Telegram with enhanced fallback
                telegram_success = await send_story_to_telegram_with_fallback(story, TARGET_USERNAME)
                
                if telegram_success:
                    successful_sends += 1
                else:
                    failed_sends += 1
                
                # Mark as processed
                story_id = generate_story_id(story)
                await mark_story_processed(story_id, TARGET_USERNAME, story['url'], story.get('type', 'photo'))
                logger.info(f"✅ Story {i} marked as processed: {story_id}")
                
                # Add delay between sends to avoid rate limiting
                if i < len(new_stories):
                    await asyncio.sleep(2)
                
            except Exception as error:
                logger.error(f"⚠️ Error processing story {i}: {error}")
                failed_sends += 1
        
        # Update activity tracker with new stories found
        if len(new_stories) > 0:
            activity_tracker.update_activity(len(new_stories))
            logger.info(f"📊 Activity updated: +{len(new_stories)} new stories processed")
        
        # Log summary
        logger.info(f"Polling check completed: {successful_sends} sent, {failed_sends} failed")
        request_tracker.print_stats()
        logger.info('')
        
    except Exception as error:
        logger.error(f'Polling error: {error}')
        request_tracker.track_snapchat(f"stories_{TARGET_USERNAME}", False, str(error))

# Replace the original check_for_new_stories with the enhanced version
check_for_new_stories = enhanced_check_for_new_stories

# Add clear cache endpoint
@app.post("/clear-cache")
async def clear_cache():
    """Clear all cached data and processed media"""
    try:
        # Clear progress data
        with progress_lock:
            progress_data.clear()
            file_progress.clear()
        
        # Clear WebSocket connections
        for key in list(websocket_manager.active_connections.keys()):
            for websocket in websocket_manager.active_connections[key]:
                try:
                    await websocket.close()
                except:
                    pass
            websocket_manager.active_connections[key] = []
        
        # Clear database cache (if using database)
        if db_manager:
            try:
                await db_manager.clear_all_cached_media()
                logger.info("Database cache cleared")
            except Exception as e:
                logger.warning(f"Could not clear database cache: {e}")
        
        logger.info("Cache cleared successfully")
        return {"success": True, "message": "Cache cleared successfully"}
        
    except Exception as e:
        logger.error(f"Error clearing cache: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to clear cache: {str(e)}")

# Add gallery endpoint for all users
@app.get("/gallery/{media_type}", response_model=GalleryResponse)
async def get_gallery_all_users(media_type: str):
    """Get gallery for all users of a specific media type"""
    logger.info(f"Fetching gallery for all users - {media_type}")
    if media_type not in ["stories", "highlights", "spotlights"]:
        raise HTTPException(status_code=400, detail="Invalid media type")
    
    all_media_files = []
    
    # Get all user directories
    if not os.path.exists(DOWNLOADS_DIR):
        return GalleryResponse(status="success", media=[])
    
    for username in os.listdir(DOWNLOADS_DIR):
        user_dir = os.path.join(DOWNLOADS_DIR, username)
        if not os.path.isdir(user_dir):
            continue
            
        media_dir = os.path.join(user_dir, media_type)
        if not os.path.exists(media_dir):
            continue
        
        try:
            metadata = load_media_metadata(username, media_type)
            key = f"{username}:{media_type}"
            
            with progress_lock:
                file_progress_data = file_progress.get(key, {})
            
            for item in metadata:
                file_path = os.path.join(media_dir, item["filename"])
                if os.path.isfile(file_path):
                    file_type = item["type"]
                    download_status = item["download_status"]
                    progress = item["progress"]
                    
                    if item["filename"] in file_progress_data:
                        file_status = file_progress_data[item["filename"]]
                        download_status = file_status["status"]
                        progress = file_status["progress"]
                    
                    # Use the actual file as both thumbnail and download URL
                    file_url = f"/downloads/{username}/{media_type}/{item['filename']}"
                    all_media_files.append(
                        GalleryMediaItem(
                            filename=item["filename"],
                            type=file_type,
                            thumbnail_url=file_url,
                            download_status=download_status,
                            progress=progress,
                            download_url=file_url
                        )
                    )
        except Exception as e:
            logger.warning(f"Error processing user {username}: {e}")
            continue
    
    return GalleryResponse(status="success", media=all_media_files)

# Static file serving for downloaded media
@app.get("/downloads/{username}/{media_type}/{filename}")
async def serve_downloaded_file(username: str, media_type: str, filename: str):
    """Serve downloaded media files"""
    try:
        file_path = os.path.join(DOWNLOADS_DIR, username, media_type, filename)
        
        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail="File not found")
        
        # Determine content type based on file extension
        content_type = "application/octet-stream"
        if filename.lower().endswith(('.jpg', '.jpeg')):
            content_type = "image/jpeg"
        elif filename.lower().endswith('.png'):
            content_type = "image/png"
        elif filename.lower().endswith(('.mp4', '.mov')):
            content_type = "video/mp4"
        elif filename.lower().endswith('.gif'):
            content_type = "image/gif"
        
        return FileResponse(
            path=file_path,
            media_type=content_type,
            filename=filename
        )
    except Exception as e:
        logger.error(f"Error serving file {filename}: {e}")
        raise HTTPException(status_code=500, detail="Error serving file")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
