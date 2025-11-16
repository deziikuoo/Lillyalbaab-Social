# Snapchat Backend Service - Health check test v3 (with fallback)
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
import sys

# Configure logging to write to server.log file
log_file_path = os.path.join(os.path.dirname(__file__), '..', 'server.log')
logger.remove()  # Remove default handler
logger.add(
    log_file_path,
    format="{time:YYYY-MM-DD HH:mm:ss.SSS} | {level:<8} | {name}:{function}:{line} - {message}",
    level="INFO",
    rotation="10 MB",
    retention="7 days",
    compression="zip"
)
logger.add(
    sys.stdout,
    format="{time:HH:mm:ss} | {level:<8} | {message}",
    level="INFO",
    colorize=True
)

# Import snapchat_dl with path adjustment
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
from server.telegram_manager import TelegramManager, generate_telegram_caption, generate_bulk_caption
from server.supabase_manager import SnapchatSupabaseManager
import re

# Load environment variables from the server directory
load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))

# ===== SNAPCHAT POLLING CONFIGURATION =====
TARGET_USERNAME = os.getenv('SNAPCHAT_TARGET_USERNAME')
POLLING_ENABLED = True
current_polling_timeout = None  # Track current polling timeout for restart
polling_started = False  # Track if polling has been started

# ===== GLOBAL MEMORY CACHE =====
# Memory cache removed - using Supabase as single source of truth for cache

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

# Shutdown flag
shutdown_in_progress = False

app = FastAPI(title="Snapchat Downloader API")

# Configure logging
logging.basicConfig(level=logging.INFO)
logger.remove()
logger.add(sys.stderr, format="<green>{time:YYYY-MM-DD HH:mm:ss.SSS}</green> | <level>{level: <8}</level> | <cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> - <level>{message}</level>")

# Disable FastAPI access logs to reduce noise
logging.getLogger("uvicorn.access").setLevel(logging.WARNING)

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
        self.check_interval = 10 * 60  # 10 minutes (reduced frequency)
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
                
                # Database connectivity checked via Supabase only
                
                # Check memory usage (proactive cleanup at 70% to prevent OOM)
                memory = psutil.virtual_memory()
                if memory.percent > 70:
                    logger.warning(f"⚠️ Elevated memory usage: {memory.percent}% - performing cleanup")
                    await self.cleanup_memory()
                if memory.percent > 85:
                    logger.error(f"🚨 Critical memory usage: {memory.percent}% - aggressive cleanup")
                    await self.aggressive_memory_cleanup()
                
                # Check downloads directory size (not system disk - we're on cloud hosting)
                downloads_size_mb = await self.get_directory_size(DOWNLOADS_DIR)
                downloads_size_threshold_mb = 500  # Cleanup if downloads exceed 500MB
                downloads_critical_threshold_mb = 1000  # Aggressive cleanup at 1GB
                
                if downloads_size_mb > downloads_size_threshold_mb:
                    logger.warning(f"⚠️ Downloads directory size: {downloads_size_mb:.1f}MB - cleaning old files")
                    await self.cleanup_downloads()
                if downloads_size_mb > downloads_critical_threshold_mb:
                    logger.error(f"🚨 Critical downloads size: {downloads_size_mb:.1f}MB - aggressive cleanup")
                    await self.diagnose_disk_usage()
                    await self.aggressive_disk_cleanup()
                    await self.cleanup_old_logs()
                
                # Reset failure counter on success
                self.consecutive_failures = 0
                self.last_check = time.time()
                # Only log on failure, not success (to reduce log noise)
                
        except Exception as error:
            logger.error(f"❌ Health check failed: {error}")
            self.consecutive_failures += 1
            
            if self.consecutive_failures >= self.max_failures:
                logger.error("🚨 Too many consecutive health check failures")
                await self.restart_service()
    
    async def get_directory_size(self, directory: str) -> float:
        """Get directory size in MB"""
        try:
            total_size = 0
            for root, dirs, files in os.walk(directory):
                for file in files:
                    file_path = os.path.join(root, file)
                    try:
                        total_size += os.path.getsize(file_path)
                    except (OSError, FileNotFoundError):
                        pass  # Skip files that can't be accessed
            return total_size / (1024 * 1024)  # Convert bytes to MB
        except Exception as e:
            logger.error(f"Failed to get directory size: {e}")
            return 0.0
    
    async def cleanup_memory(self):
        """Clean up memory"""
        try:
            # Force garbage collection
            gc.collect()
            logger.info("🗑️ Memory cleanup performed")
        except Exception as e:
            logger.error(f"Memory cleanup failed: {e}")
    
    async def aggressive_memory_cleanup(self):
        """Aggressive memory cleanup to prevent OOM kills"""
        try:
            # Clear progress data older than 1 hour
            with progress_lock:
                keys_to_remove = []
                for key in list(progress_data.keys()):
                    # Remove old progress entries
                    keys_to_remove.append(key)
                for key in keys_to_remove:
                    progress_data.pop(key, None)
                    file_progress.pop(key, None)
            
            # Force multiple garbage collection passes
            for _ in range(3):
                gc.collect()
            
            # Get new memory stats
            memory = psutil.virtual_memory()
            logger.info(f"🧹 Aggressive cleanup completed. Memory now at {memory.percent}%")
        except Exception as e:
            logger.error(f"Aggressive memory cleanup failed: {e}")
    
    async def cleanup_downloads(self):
        """Clean up old downloads (1-day cleanup instead of 7-day)"""
        try:
            # Remove files older than 1 day (was 7 days)
            cutoff_time = time.time() - (1 * 24 * 60 * 60)  # Changed from 7 days
            removed_count = 0
            freed_bytes = 0
            
            for root, dirs, files in os.walk(DOWNLOADS_DIR):
                for file in files:
                    file_path = os.path.join(root, file)
                    try:
                        if os.path.getmtime(file_path) < cutoff_time:
                            file_size = os.path.getsize(file_path)
                            os.remove(file_path)
                            removed_count += 1
                            freed_bytes += file_size
                    except Exception:
                        pass
            
            freed_mb = freed_bytes / (1024 * 1024)
            if removed_count > 0:
                logger.info(f"🧹 Cleaned up {removed_count} old files ({freed_mb:.1f} MB freed)")
        except Exception as e:
            logger.error(f"Download cleanup failed: {e}")
    
    async def aggressive_disk_cleanup(self):
        """Aggressive disk cleanup to prevent disk-full issues (removes 3+ day old files)"""
        try:
            # Remove files older than 3 days (more aggressive)
            cutoff_time = time.time() - (3 * 24 * 60 * 60)
            removed_count = 0
            freed_bytes = 0
            
            for root, dirs, files in os.walk(DOWNLOADS_DIR):
                for file in files:
                    file_path = os.path.join(root, file)
                    try:
                        if os.path.getmtime(file_path) < cutoff_time:
                            file_size = os.path.getsize(file_path)
                            os.remove(file_path)
                            removed_count += 1
                            freed_bytes += file_size
                    except Exception:
                        pass  # Skip files that can't be removed
                
                # Remove empty directories
                for dir_name in dirs:
                    dir_path = os.path.join(root, dir_name)
                    try:
                        if not os.listdir(dir_path):
                            os.rmdir(dir_path)
                    except Exception:
                        pass
            
            freed_mb = freed_bytes / (1024 * 1024)
            downloads_size_mb = await self.get_directory_size(DOWNLOADS_DIR)
            logger.info(f"🧹 Aggressive cleanup: {removed_count} files removed, {freed_mb:.1f}MB freed. Downloads folder now at {downloads_size_mb:.1f}MB")
        except Exception as e:
            logger.error(f"Aggressive disk cleanup failed: {e}")
    
    async def diagnose_disk_usage(self):
        """Diagnose what's using disk space in application folders"""
        try:
            logger.info("📊 [DISK] Analyzing application disk usage...")
            
            # Check downloads directory
            downloads_size = sum(
                os.path.getsize(os.path.join(root, file))
                for root, dirs, files in os.walk(DOWNLOADS_DIR)
                for file in files
            ) / (1024 * 1024)  # Convert to MB
            
            downloads_count = sum(
                len(files)
                for root, dirs, files in os.walk(DOWNLOADS_DIR)
            )
            
            logger.info(f"📊 [DISK] Downloads folder: {downloads_count} files, {downloads_size:.1f} MB")
            logger.info(f"📊 [DISK] Downloads path: {DOWNLOADS_DIR}")
            
            # Check log files
            log_dir = os.path.dirname(__file__)
            log_files = ['server.log', 'request-logs.txt', 'error-logs.txt']
            total_log_size = 0
            for log_file in log_files:
                log_path = os.path.join(log_dir, log_file)
                if os.path.exists(log_path):
                    size_mb = os.path.getsize(log_path) / (1024 * 1024)
                    total_log_size += size_mb
                    logger.info(f"📊 [DISK] {log_file}: {size_mb:.1f} MB")
            
            # Check for compressed log archives
            compressed_logs_count = 0
            compressed_logs_size = 0
            for file in os.listdir(log_dir):
                if file.endswith('.zip') and 'server.log' in file:
                    compressed_logs_count += 1
                    file_path = os.path.join(log_dir, file)
                    compressed_logs_size += os.path.getsize(file_path) / (1024 * 1024)
            
            if compressed_logs_count > 0:
                logger.info(f"📊 [DISK] Compressed logs: {compressed_logs_count} files, {compressed_logs_size:.1f} MB")
            
            # Check database files
            db_files = [
                os.path.join(os.path.dirname(__file__), 'snapchat_telegram.db'),
                os.path.join(os.path.dirname(__file__), '..', 'snapchat_telegram.db')
            ]
            for db_path in db_files:
                if os.path.exists(db_path):
                    size_mb = os.path.getsize(db_path) / (1024 * 1024)
                    logger.info(f"📊 [DISK] Database {db_path}: {size_mb:.1f} MB")
            
            # Total application usage
            total_app_usage = downloads_size + total_log_size + compressed_logs_size
            logger.info(f"📊 [DISK] Total application usage: {total_app_usage:.1f} MB")
            logger.info(f"📊 [DISK] Note: System disk usage (on cloud hosting) is not monitored as it includes dependencies, OS, and other services")
            
        except Exception as e:
            logger.error(f"❌ [DISK] Diagnostic failed: {e}")
    
    async def cleanup_old_logs(self):
        """Clean up old log files"""
        try:
            log_dir = os.path.dirname(__file__)
            
            # Clean up old compressed logs (older than 7 days)
            cutoff_time = time.time() - (7 * 24 * 60 * 60)
            removed_count = 0
            freed_bytes = 0
            
            for file in os.listdir(log_dir):
                if file.endswith('.zip') and 'server.log' in file:
                    file_path = os.path.join(log_dir, file)
                    try:
                        if os.path.getmtime(file_path) < cutoff_time:
                            file_size = os.path.getsize(file_path)
                            os.remove(file_path)
                            removed_count += 1
                            freed_bytes += file_size
                    except Exception:
                        pass
            
            freed_mb = freed_bytes / (1024 * 1024)
            if removed_count > 0:
                logger.info(f"🧹 Cleaned up {removed_count} old log archives ({freed_mb:.1f} MB freed)")
        except Exception as e:
            logger.error(f"❌ Log cleanup failed: {e}")
    
    async def cleanup_downloads_4week(self):
        """Clean up downloads folder (4-week complete wipe)"""
        try:
            # Remove files older than 4 weeks
            cutoff_time = time.time() - (4 * 7 * 24 * 60 * 60)  # 4 weeks
            removed_count = 0
            
            for root, dirs, files in os.walk(DOWNLOADS_DIR):
                for file in files:
                    file_path = os.path.join(root, file)
                    if os.path.getmtime(file_path) < cutoff_time:
                        os.remove(file_path)
                        removed_count += 1
                
                # Remove empty directories
                for dir_name in dirs:
                    dir_path = os.path.join(root, dir_name)
                    try:
                        if not os.listdir(dir_path):  # Directory is empty
                            os.rmdir(dir_path)
                    except OSError:
                        pass  # Directory not empty or other error
            
            logger.info(f"🧹 4-week downloads cleanup: {removed_count} files removed")
            return removed_count
        except Exception as e:
            logger.error(f"4-week downloads cleanup failed: {e}")
            return 0
    
    async def cleanup_snapchat_cache(self):
        """Clean up Snapchat cache (4-week complete wipe)"""
        try:
            if supabase_manager.is_connected:
                # Use Supabase cleanup
                cleanup_result = await supabase_manager.clean_expired_snapchat_cache()
                logger.info(f"🧹 Snapchat Supabase cache cleanup: {cleanup_result}")
            else:
                logger.info("🧹 Snapchat cache cleanup skipped (Supabase not connected)")
        except Exception as e:
            logger.error(f"Snapchat cache cleanup failed: {e}")
    
    async def scheduled_cleanup(self):
        """Scheduled 4-week cleanup for cache, memory, and downloads"""
        try:
            logger.info("🔄 Starting scheduled 4-week cleanup...")
            
            # Clean up cache
            await self.cleanup_snapchat_cache()
            
            # Clean up memory
            await self.cleanup_memory()
            
            # Clean up downloads (4-week old files)
            downloads_removed = await self.cleanup_downloads_4week()
            
            logger.info(f"✅ Scheduled 4-week cleanup completed: {downloads_removed} downloads removed")
            
        except Exception as e:
            logger.error(f"Scheduled cleanup failed: {e}")
    
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
            # Database reconnection handled via Supabase only
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

# Memory management removed to reduce log noise

# Initialize health check system
health_check = HealthCheck()

# Initialize Supabase manager
supabase_manager = SnapchatSupabaseManager()

# ===== SNAPCHAT CACHING FUNCTIONS =====

def extract_snap_id_from_url(story_url: str) -> Optional[str]:
    """Extract snap_id from Snapchat story URL (Snapchat equivalent of shortcode extraction)"""
    try:
        # Snapchat story URLs typically contain unique identifiers
        # Example: https://story.snapchat.com/s/ABC123XYZ
        if "story.snapchat.com" in story_url:
            # Extract the unique identifier after /s/
            match = re.search(r'/s/([^/?]+)', story_url)
            if match:
                return match.group(1)
        
        # Fallback: use URL hash as snap_id
        import hashlib
        return hashlib.md5(story_url.encode()).hexdigest()[:20]
        
    except Exception as error:
        logger.error(f"❌ Error extracting snap_id from URL: {error}")
        return None

def normalize_story_structure(story: Dict[str, Any]) -> Dict[str, Any]:
    """Ensure story has all required fields with proper structure"""
    try:
        # Ensure story is a dictionary
        if not isinstance(story, dict):
            logger.error(f"❌ Story is not a dictionary: {type(story)}")
            return {}
        
        # Ensure required fields exist
        normalized_story = {
            'url': story.get('url', ''),
            'type': story.get('type', 'photo'),
            'snap_id': story.get('snap_id', ''),
            'timestamp': story.get('timestamp', int(time.time()))
        }
        
        # Generate snap_id if missing
        if not normalized_story['snap_id']:
            normalized_story['snap_id'] = generate_snap_id(normalized_story)
        
        return normalized_story
        
    except Exception as error:
        logger.error(f"❌ Error normalizing story structure: {error}")
        return {}

def generate_snap_id(story: Dict[str, Any]) -> str:
    """Generate snap_id for story (Snapchat equivalent of shortcode generation)"""
    try:
        # Try to extract from URL first
        if story.get('url'):
            snap_id = extract_snap_id_from_url(story['url'])
            if snap_id:
                return snap_id
        
        # Fallback: generate from story data
        story_data = f"{story.get('url', '')}{story.get('type', '')}{story.get('timestamp', '')}"
        import hashlib
        return hashlib.md5(story_data.encode()).hexdigest()[:20]
        
    except Exception as error:
        logger.error(f"❌ Error generating snap_id: {error}")
        # Final fallback: timestamp-based ID
        return f"snap_{int(time.time())}_{random.randint(1000, 9999)}"

# ===== CACHE CHECKING AND LOADING FUNCTIONS =====

async def check_cache_on_boot():
    """Check cache status on startup (Snapchat equivalent of checkCacheOnBoot)"""
    try:
        # Check if we have any cached data
        if supabase_manager.is_connected:
            # Get last cleanup date from Supabase
            last_cleanup = await supabase_manager.get_last_cleanup_date()
            if last_cleanup:
                last_cleanup_date = datetime.fromisoformat(last_cleanup.replace('Z', '+00:00'))
                week_ago = datetime.now(timezone.utc) - timedelta(days=7)
                
                if last_cleanup_date < week_ago:
                    logger.info("📊 Cache cleanup would be due (7+ days since last cleanup)")
                    logger.info(f"   Last cleanup: {last_cleanup_date.strftime('%Y-%m-%d')}")
                    logger.info(f"   Days since: {int((datetime.now(timezone.utc) - last_cleanup_date).days)}")
                else:
                    logger.info("✅ Cache is up to date")
                    logger.info(f"   Last cleanup: {last_cleanup_date.strftime('%Y-%m-%d')}")
            else:
                logger.info("📊 No previous cleanup record found")
        
        # Load existing cache data into memory for faster access
        await load_existing_cache()
        
    except Exception as error:
        logger.warning(f"⚠️ Cache cleanup check failed: {error}")
        logger.info("✅ Cache system initialized (first run)")

async def load_existing_cache():
    """Check existing cache data in Supabase (no memory cache loading)"""
    try:
        # Use Supabase if available
        if supabase_manager.is_connected:
            logger.info("📊 Checking Supabase cache...")
            
            try:
                # Get cache statistics to check cache status
                cache_stats = supabase_manager.get_snapchat_cache_stats()
                logger.info(f"📊 Supabase cache stats: {cache_stats}")
                
                # Get all cached usernames from Supabase
                response = supabase_manager.client.table("snapchat_recent_stories_cache").select("username").order("username").execute()
                
                cached_users = response.data
                unique_usernames = list(set([user['username'] for user in cached_users]))
                logger.info(f"📊 Found {len(unique_usernames)} cached users in Supabase")
                
                if len(unique_usernames) == 0:
                    logger.info("📊 No existing cache data found in Supabase")
                    return
                
                logger.info(f"✅ Supabase cache verified ({len(unique_usernames)} users)")
                
                return  # Successfully verified Supabase
                
            except Exception as error:
                logger.error(f"❌ Supabase cache check failed: {error}")
                logger.info("✅ Cache system initialized (first run)")
        
    except Exception as error:
        logger.error(f"❌ Cache check failed: {error}")
        logger.info("✅ Cache system initialized (first run)")

async def get_cached_recent_stories(username: str) -> List[Dict[str, Any]]:
    """Get cached stories for a username (directly from Supabase - no memory cache)"""
    try:
        logger.info(f"📊 [CACHE] Getting cached stories for @{username}...")
        
        # Use Supabase as single source of truth
        if supabase_manager.is_connected:
            try:
                logger.info(f"📊 [CACHE] Fetching from Supabase for @{username}...")
                cached_stories = await supabase_manager.get_cached_recent_stories(username)
                
                # Normalize cached stories to ensure proper structure
                normalized_stories = []
                for story in cached_stories:
                    normalized_story = normalize_story_structure(story)
                    if normalized_story:  # Only add if normalization succeeded
                        normalized_stories.append(normalized_story)
                
                logger.info(f"✅ [CACHE] Retrieved {len(normalized_stories)} stories from Supabase for @{username}")
                return normalized_stories
            except Exception as error:
                logger.error(f"❌ [CACHE] Supabase cache retrieval failed: {error}")
                logger.info(f"📊 [CACHE] No cached stories found for @{username}")
                return []
        
        logger.info(f"📊 [CACHE] No cached stories found for @{username}")
        return []
        
    except Exception as error:
        logger.error(f"❌ [CACHE] Failed to get cached stories for @{username}: {error}")
        return []

async def update_stories_cache(username: str, stories: List[Dict[str, Any]]) -> bool:
    """Update cache with new stories (directly to Supabase - no memory cache)"""
    try:
        # Use Supabase as single source of truth
        if supabase_manager.is_connected:
            success = await supabase_manager.update_recent_stories_cache(username, stories)
            return success
        else:
            logger.warning(f"⚠️ [CACHE] Supabase not connected - cannot update cache for @{username}")
            return False
        
    except Exception as error:
        logger.error(f"❌ Failed to update stories cache for @{username}: {error}")
        return False

async def is_story_processed(snap_id: str, username: str) -> bool:
    """Check if a story has been processed (with memory cache optimization)"""
    try:
        # Use Supabase for caching
        if supabase_manager.is_connected:
            return await supabase_manager.is_story_processed(snap_id, username)
        else:
            logger.warning(f"⚠️ [CACHE] Supabase not connected - cannot check if story is processed")
            return False
        
        return False
        
    except Exception as error:
        logger.error(f"❌ Failed to check if story is processed: {error}")
        return False

async def mark_story_processed(snap_id: str, username: str, story_url: str, story_type: str) -> bool:
    """Mark a story as processed (with memory cache optimization)"""
    try:
        # Use Supabase for caching
        if supabase_manager.is_connected:
            return await supabase_manager.mark_story_processed(snap_id, username, story_url, story_type)
        else:
            logger.warning(f"⚠️ [CACHE] Supabase not connected - cannot mark story as processed")
            return False
        
        return False
        
    except Exception as error:
        logger.error(f"❌ Failed to mark story as processed: {error}")
        return False

async def find_new_stories(username: str, fetched_stories: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Find stories that are not in the cache (with memory cache optimization)"""
    try:
        # Get cached stories for comparison (uses memory cache if available)
        cached_stories = await get_cached_recent_stories(username)
        cached_snap_ids = {story['snap_id'] for story in cached_stories if story.get('snap_id')}
        
        # Debug: Log cache details
        logger.info(f"🔍 [CACHE] Cache comparison for @{username}:")
        logger.info(f"   📊 Fetched stories: {len(fetched_stories)}")
        logger.info(f"   📊 Cached stories: {len(cached_stories)}")
        if cached_snap_ids:
            logger.info(f"   🔍 Cached snap_ids: {list(cached_snap_ids)[:5]}...")  # Show first 5
        else:
            logger.info(f"   🔍 No cached snap_ids found")
        
        # Filter out stories already in cache
        new_stories = []
        for story in fetched_stories:
            # Ensure story has the required structure
            if not isinstance(story, dict):
                logger.error(f"❌ [CACHE] Invalid story format: expected dict, got {type(story)}")
                continue
                
            # Ensure story has snap_id field
            if 'snap_id' not in story:
                story['snap_id'] = generate_snap_id(story)
            
            snap_id = story['snap_id']
            if snap_id and snap_id not in cached_snap_ids:
                new_stories.append(story)
                logger.info(f"🆕 [CACHE] New story found: {snap_id}")
            else:
                logger.info(f"⏭️ [CACHE] Story already cached: {snap_id}")
        
        logger.info(f"📊 [CACHE] Final comparison: {len(fetched_stories)} fetched, {len(cached_stories)} cached, {len(new_stories)} new")
        return new_stories
        
    except Exception as error:
        logger.error(f"❌ [CACHE] Error finding new stories: {error}")
        return fetched_stories  # Return all stories if cache check fails

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
            stats = {
                "active_downloads": len(self.active_downloads),
                "active_websockets": len(self.active_websockets)
            }
            
            # Safely get memory usage
            try:
                stats["memory_usage"] = psutil.virtual_memory()._asdict()
            except Exception as e:
                logger.error(f"Failed to get memory usage: {e}")
                stats["memory_usage"] = {"error": str(e)}
            
            # Get downloads directory size (not system disk)
            try:
                if os.path.exists(DOWNLOADS_DIR):
                    total_size = 0
                    file_count = 0
                    for root, dirs, files in os.walk(DOWNLOADS_DIR):
                        for file in files:
                            try:
                                total_size += os.path.getsize(os.path.join(root, file))
                                file_count += 1
                            except (OSError, FileNotFoundError):
                                pass
                    
                    stats["downloads_directory"] = {
                        "size_bytes": total_size,
                        "size_mb": round(total_size / (1024 * 1024), 2),
                        "file_count": file_count,
                        "path": DOWNLOADS_DIR
                    }
                else:
                    stats["downloads_directory"] = {"error": "downloads directory not found"}
            except Exception as e:
                logger.error(f"Failed to get downloads directory size: {e}")
                stats["downloads_directory"] = {"error": str(e)}
            
            return stats

# Initialize resource manager
resource_manager = ResourceManager()

# Configure CORS - Allow Vercel frontend and local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://tyla-social.vercel.app",  # Production Vercel domain
        "http://localhost:5173",  # Local development (Vite)
        "http://localhost:3000",  # Local development (Node.js proxy)
        "http://127.0.0.1:5173",  # Local development (alternative)
    ],
    allow_origin_regex=r"^https://tyla-social-.*\.vercel\.app$",  # Preview deployments
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*", "Content-Type", "Accept", "Authorization", "Access-Control-Request-Headers", "Access-Control-Request-Method"],
    expose_headers=["*"],
    max_age=3600,
)

# Add request logging middleware
@app.middleware("http")
async def log_requests(request: Request, call_next):
    global shutdown_in_progress
    
    # During shutdown, reject new requests gracefully
    if shutdown_in_progress:
        return JSONResponse(
            content={"status": "service_shutting_down", "message": "Service is shutting down"},
            status_code=503
        )
    
    # Skip logging for frequent health checks and gallery calls to reduce noise
    if "/ping" in str(request.url) or "/gallery/" in str(request.url):
        response = await call_next(request)
        return response
    
    logger.info(f"Request: {request.method} {request.url}")
    try:
        response = await call_next(request)
        logger.info(f"Response status: {response.status_code}")
        return response
    except Exception as e:
        logger.error(f"Request handling error: {e}")
        return JSONResponse(
            content={"status": "error", "message": str(e)},
            status_code=500
        )

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

@app.get("/test")
async def test_endpoint():
    logger.info("🔍 [PYTHON] /test endpoint called!")
    return {"message": "Test endpoint working", "timestamp": datetime.now().isoformat()}

@app.get("/ping")
@app.head("/ping")
async def ping_endpoint():
    """Ultra-lightweight health check for Render (no resource checks)"""
    return {"status": "ok", "timestamp": datetime.now().isoformat()}

@app.get("/health")
async def health_check_endpoint():
    """Health check endpoint - must respond quickly for Render"""
    try:
        # Basic health response (fast)
        health = {
            "status": "healthy",
            "timestamp": datetime.now().isoformat(),
            "uptime": time.time() - app.startup_time if hasattr(app, 'startup_time') else 0,
            "polling_active": polling_started
        }
        
        # Get resource stats (with timeout protection)
        try:
            stats = resource_manager.get_stats()
            health["resources"] = stats
        except Exception as e:
            logger.error(f"Failed to get resource stats: {e}")
            health["resources"] = {"error": str(e)}
        
        # Database connectivity
        health["database"] = "disconnected"  # SQLite removed
        
        # Health check status
        try:
            health["health_check"] = {
                "consecutive_failures": health_check.consecutive_failures,
                "last_check": health_check.last_check,
                "running": health_check.running
            }
        except Exception as e:
            logger.error(f"Failed to get health check status: {e}")
        
        # Check if service is unhealthy
        if health_check.consecutive_failures >= health_check.max_failures:
            health["status"] = "unhealthy"
            return JSONResponse(content=health, status_code=503)
        
        return health
    except Exception as e:
        logger.error(f"Health check endpoint error: {e}")
        # Always return a response, even if there's an error
        return JSONResponse(
            content={
                "status": "error", 
                "message": str(e),
                "timestamp": datetime.now().isoformat()
            },
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
        snapchat = SnapchatDL(directory_prefix=DOWNLOADS_DIR, max_workers=8)
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



        # Execute direct download and send to Telegram (NO DISK SAVING)
        try:
            logger.info(f"🔍 [MANUAL] Starting direct download for {request.username} ({request.download_type})")
            
            # Create SnapchatDL instance for fetching
            snapchat = SnapchatDL(max_workers=8)
            
            # Fetch stories based on type
            stories_to_send = []
            if request.download_type == "stories":
                async for story, user_info in snapchat._web_fetch_story(request.username):
                    # Snapchat returns: 0 = photo, 1 = video
                    media_type = story["snapMediaType"]
                    is_video = (media_type == 1 or str(media_type).upper() == "VIDEO")
                    
                    story_data = {
                        'url': story["snapUrls"]["mediaUrl"],
                        'type': 'video' if is_video else 'photo',
                        'snap_id': story["snapId"]["value"],
                        'timestamp': story["timestampInSec"]["value"]
                    }
                    stories_to_send.append(story_data)
                    logger.info(f"🔍 [MANUAL] Found {story_data['type']}: {story_data['snap_id']} (snapMediaType={media_type})")
            elif request.download_type == "highlights":
                async for highlight, user_info in snapchat._web_fetch_highlight(request.username):
                    # Snapchat returns: 0 = photo, 1 = video
                    media_type = highlight["snapMediaType"]
                    is_video = (media_type == 1 or str(media_type).upper() == "VIDEO")
                    
                    story_data = {
                        'url': highlight["snapUrls"]["mediaUrl"],
                        'type': 'video' if is_video else 'photo',
                        'snap_id': highlight["snapId"]["value"],
                        'timestamp': highlight["timestampInSec"]["value"]
                    }
                    stories_to_send.append(story_data)
                    logger.info(f"🔍 [MANUAL] Found {story_data['type']}: {story_data['snap_id']} (snapMediaType={media_type})")
            elif request.download_type == "spotlights":
                async for spotlight, user_info in snapchat._web_fetch_spotlight(request.username):
                    # Snapchat returns: 0 = photo, 1 = video
                    media_type = spotlight["snapMediaType"]
                    is_video = (media_type == 1 or str(media_type).upper() == "VIDEO")
                    
                    story_data = {
                        'url': spotlight["snapUrls"]["mediaUrl"],
                        'type': 'video' if is_video else 'photo',
                        'snap_id': spotlight["snapId"]["value"],
                        'timestamp': spotlight["timestampInSec"]["value"]
                    }
                    stories_to_send.append(story_data)
                    logger.info(f"🔍 [MANUAL] Found {story_data['type']}: {story_data['snap_id']} (snapMediaType={media_type})")
            else:
                return DownloadResponse(
                    status="error",
                    message="Invalid download type selected.",
                    media_urls=None
                )
            
            if not stories_to_send:
                raise NoStoriesFound(f"No {request.download_type} found for {request.username}")
            
            logger.info(f"📊 [MANUAL] Found {len(stories_to_send)} {request.download_type} to process")
            
            # Send directly to Telegram if enabled
            telegram_sent = False
            telegram_message = None
            
            if request.send_to_telegram and telegram_manager:
                logger.info(f"📤 [MANUAL] Sending ALL {len(stories_to_send)} items to Telegram (manual override - ignores cache)...")
                await download_and_send_directly(request.username, stories_to_send, request.telegram_caption or f"✨ {request.download_type} from @{request.username}")
                telegram_sent = True
                telegram_message = f"Successfully sent {len(stories_to_send)} items to Telegram"
                logger.info(f"✅ [MANUAL] Sent {len(stories_to_send)} items to Telegram")
                
                # Update cache with ONLY NEW items (skip already cached)
                logger.info(f"📊 [CACHE] Checking which items are new for cache update...")
                new_items_for_cache = await find_new_stories(request.username, stories_to_send)
                
                if len(new_items_for_cache) > 0:
                    logger.info(f"📊 [CACHE] Updating cache with {len(new_items_for_cache)} NEW items (skipping {len(stories_to_send) - len(new_items_for_cache)} already cached)...")
                    
                    # Get current cache
                    cached_stories = await get_cached_recent_stories(request.username)
                    
                    # Merge: keep old cached items + add new items
                    all_cached_items = cached_stories + new_items_for_cache
                    
                    # Update cache with merged list
                    await update_stories_cache(request.username, all_cached_items)
                    logger.info(f"✅ [CACHE] Cache updated: {len(cached_stories)} existing + {len(new_items_for_cache)} new = {len(all_cached_items)} total")
                else:
                    logger.info(f"ℹ️ [CACHE] All {len(stories_to_send)} items already in cache - no cache update needed")
                
            else:
                logger.info(f"ℹ️ Telegram sending disabled - items fetched but not sent")
            
            telegram_info = f" + {len(stories_to_send)} items sent to Telegram" if telegram_sent else ""
            return DownloadResponse(
                status="success",
                message=f"Found {len(stories_to_send)} {request.download_type} for {request.username}{telegram_info}",
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
                
                # Log success (Supabase logging handled by telegram manager)
                logger.info(f"✅ [TELEGRAM] Successfully sent {filename} to Telegram")
                
                sent_files.append(filename)
                logger.info(f"✅ [AUTO] Item {i} sent to Telegram successfully")
                
            except Exception as e:
                logger.error(f"⚠️ [AUTO] Failed to send item {i} to Telegram: {e}")
                logger.error(f"❌ [TELEGRAM] Failed to send {filename} to Telegram: {e}")
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
            snapchat = SnapchatDL(directory_prefix=DOWNLOADS_DIR, max_workers=8)
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
    
    # Get current progress data from global progress_data dict
    with progress_lock:
        current_progress = progress_data.get(key, {
            "status": "in_progress",
            "files": {},
            "overall": {
                "status": "in_progress",
                "progress": 0,
                "message": "Download in progress"
            }
        })
        
        # Update file progress
        current_progress["files"][filename] = {
            "status": status,
            "progress": progress
        }
        
        # Calculate overall progress
        total_files = len(current_progress["files"])
        if total_files > 0:
            total_progress = sum(f["progress"] for f in current_progress["files"].values())
            overall_progress = total_progress / total_files
            current_progress["overall"]["progress"] = overall_progress
            
            # Update overall status if all files are complete
            if all(f["status"] == "complete" for f in current_progress["files"].values()):
                current_progress["overall"]["status"] = "complete"
                current_progress["overall"]["message"] = "Download completed"
            elif any(f["status"] == "error" for f in current_progress["files"].values()):
                current_progress["overall"]["status"] = "error"
                current_progress["overall"]["message"] = "Some files failed to download"
        
        # Update global progress data
        progress_data[key] = current_progress
    
    # Broadcast update to all connected clients
    await websocket_manager.broadcast(key, current_progress)

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
                
                # Log success (Supabase logging handled by telegram manager)
                logger.info(f"✅ Successfully sent {filename} to Telegram")
                
                sent_files.append(filename)
                
            except Exception as e:
                logger.error(f"Failed to send {filename} to Telegram: {e}")
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
        
        # Log success (Supabase logging handled by telegram manager)
        logger.info(f"✅ [MANUAL] Successfully sent {filename} to Telegram")
        
        logger.info(f"✅ [MANUAL] Sent {filename} to Telegram for {username}")
        
        return {
            "status": "success",
            "message": f"Successfully sent {filename} to Telegram",
            "filename": filename,
            "telegram_message_id": result.get('message_id')
        }
        
    except Exception as e:
        logger.error(f"❌ [MANUAL] Failed to send {filename} to Telegram: {e}")
        
        # Log error (Supabase logging handled by telegram manager)
        
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/telegram/stats", response_model=TelegramStatsResponse)
async def get_telegram_stats():
    """Get Telegram sending statistics"""
    try:
        # Return basic stats since SQLite is removed
        stats = {
            "total_sent": 0,
            "total_failed": 0,
            "recent_sent": 0,
            "success_rate": 0.0,
            "download_url": None
        }
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

@app.get("/cache/stats")
async def get_cache_stats():
    """Get cache statistics for both SQLite and Supabase"""
    try:
        stats = {
            "sqlite": {
                "connected": False,
                "database_path": None
            },
            "supabase": {
                "connected": supabase_manager.is_connected if supabase_manager else False
            },
            "memory_cache": {
                "removed": "Memory cache removed - using Supabase only"
            }
        }
        
        # Get Supabase cache stats if connected
        if supabase_manager and supabase_manager.is_connected:
            supabase_stats = supabase_manager.get_snapchat_cache_stats()
            stats["supabase"].update(supabase_stats)
        
        return stats
        
    except Exception as error:
        logger.error(f"Error getting cache stats: {error}")
        raise HTTPException(status_code=500, detail=str(error))

@app.get("/cache/status")
async def get_cache_status():
    """Get detailed cache status (similar to Instagram's cache-status endpoint)"""
    try:
        username = TARGET_USERNAME or "no_target_set"
        
        # Get cached stories for the target user
        cached_stories = await get_cached_recent_stories(username) if TARGET_USERNAME else []
        
        return {
            "username": username,
            "database_cache": {
                "count": len(cached_stories),
                "stories": cached_stories[:5] if cached_stories else []  # First 5 stories for preview
            },
            "memory_cache": {
                "removed": "Memory cache removed - using Supabase only"
            },
            "cache_system": {
                "supabase_connected": supabase_manager.is_connected if supabase_manager else False,
                "sqlite_connected": False,
                "memory_cache_enabled": False
            }
        }
        
    except Exception as error:
        logger.error(f"Error getting cache status: {error}")
        raise HTTPException(status_code=500, detail=str(error))

@app.get("/targeted-usernames")
async def get_targeted_usernames():
    """Get all usernames that have been targeted for suggestions"""
    try:
        usernames = []
        
        # Get usernames from Supabase if connected
        if supabase_manager and supabase_manager.is_connected:
            try:
                response = supabase_manager.client.table("snapchat_recent_stories_cache").select("username").execute()
                if response.data:
                    supabase_usernames = list(set([user['username'] for user in response.data]))
                    usernames.extend(supabase_usernames)
            except Exception as error:
                logger.warning(f"Failed to get usernames from Supabase: {error}")
        
        # SQLite fallback removed - using Supabase only
        
        # Remove duplicates and sort
        unique_usernames = sorted(list(set(usernames)))
        
        return {
            "usernames": unique_usernames,
            "count": len(unique_usernames)
        }
        
    except Exception as error:
        logger.error(f"Error getting targeted usernames: {error}")
        raise HTTPException(status_code=500, detail=str(error))

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
    # Get service URL from environment or use default
    service_url = os.getenv('SNAPCHAT_SERVICE_URL', 'http://localhost:8000')
    logger.info(f'Frontend available: {service_url}')
    
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
            # Force garbage collection before poll to prevent memory buildup
            import gc
            gc.collect()
            
            # Check for new stories
            await check_for_new_stories()
            
            # Reset activity counter for next poll cycle
            activity_tracker.reset_activity_counter()
            
            # Force garbage collection after poll
            gc.collect()
            
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
    """Use the exact same approach as manual downloads for automatic polling"""
    try:
        logger.info(f"\n🔍 [POLL] Checking for new stories from @{TARGET_USERNAME} {force and '(force send enabled)' or ''}")
        
        # Check Supabase connection status
        if supabase_manager.is_connected:
            logger.info("✅ [CACHE] Supabase connection is active")
        else:
            logger.warning("⚠️ [CACHE] Supabase connection is not available, using fallback")
        
        # Use existing Snapchat downloader to get stories
        snapchat_dl = SnapchatDL(max_workers=8)
        
        try:
            # Fetch stories without downloading (same as manual)
            stories = []
            async for story, user_info in snapchat_dl._web_fetch_story(TARGET_USERNAME):
                # Snapchat returns: 0 = photo, 1 = video (integer, not string)
                media_type = story["snapMediaType"]
                is_video = (media_type == 1 or str(media_type).upper() == "VIDEO")
                
                # Convert to the format expected by the polling system
                story_data = {
                    'url': story["snapUrls"]["mediaUrl"],
                    'type': 'video' if is_video else 'photo',
                    'snap_id': story["snapId"]["value"],
                    'timestamp': story["timestampInSec"]["value"]
                }
                # Debug logging to verify type detection
                logger.info(f"🔍 [POLL] Story type detected: {story_data['type']} (snapMediaType: {media_type})")
                stories.append(story_data)
            
            logger.info(f"📊 [POLL] Found {len(stories)} total stories from Snapchat")
            request_tracker.track_snapchat(f"stories_{TARGET_USERNAME}", True)
        except NoStoriesFound:
            logger.info("📭 [POLL] No stories found for user")
            stories = []
            request_tracker.track_snapchat(f"stories_{TARGET_USERNAME}", True)
        except Exception as e:
            logger.error(f"❌ [POLL] Error fetching stories: {e}")
            request_tracker.track_snapchat(f"stories_{TARGET_USERNAME}", False, str(e))
            return
        
        # Get cached stories for comparison
        logger.info(f"📊 [CACHE] Checking cache for @{TARGET_USERNAME}...")
        cached_stories = await get_cached_recent_stories(TARGET_USERNAME)
        logger.info(f"📊 [CACHE] Found {len(cached_stories)} cached stories")
        
        # POLLING: Use cache to find ONLY NEW stories (skip already sent)
        new_stories = await find_new_stories(TARGET_USERNAME, stories)
        
        if len(new_stories) == 0 and not force:
            logger.info("✅ [CACHE] No new stories found, skipping story processing...")
            # Update cache even when no new stories (refreshes timestamps)
            logger.info(f"📊 [CACHE] Updating cache with {len(stories)} current stories...")
            await update_stories_cache(TARGET_USERNAME, stories)
            return
        
        logger.info(f"📱 [POLL] Processing {len(new_stories)} NEW stories out of {len(stories)} total (skipping {len(stories) - len(new_stories)} cached)")
        
        # POLLING: Send ONLY new stories (cache-filtered)
        if telegram_manager and len(new_stories) > 0:
            try:
                logger.info(f"📤 [AUTO] Using cache-filtered manual download infrastructure for {len(new_stories)} new stories...")
                
                # Download only the new stories using the manual infrastructure
                await download_filtered_stories(TARGET_USERNAME, new_stories, f"✨ New stories from <a href='https://snapchat.com/add/{TARGET_USERNAME}'>@{TARGET_USERNAME}</a>! 📱")
                
                logger.info(f"✅ [AUTO] Cache-filtered download and Telegram sending completed")
                
                # Mark all new stories as processed
                logger.info(f"📊 [CACHE] Marking {len(new_stories)} stories as processed...")
                for story in new_stories:
                    try:
                        story_id = generate_story_id(story)
                        story_url = story.get('url', '')
                        story_type = story.get('type', 'photo')
                        await mark_story_processed(story_id, TARGET_USERNAME, story_url, story_type)
                        logger.info(f"✅ [CACHE] Story marked as processed: {story_id}")
                    except Exception as process_error:
                        logger.error(f"❌ [AUTO] Error marking story as processed: {process_error}")
                
                # Update cache AFTER successful sending (allows retry on failure)
                logger.info(f"📊 [CACHE] Updating cache with {len(stories)} current stories after successful send...")
                await update_stories_cache(TARGET_USERNAME, stories)
                
                logger.info(f"✅ [AUTO] Successfully processed {len(new_stories)} new stories using cache-filtered manual infrastructure")
                
            except Exception as download_error:
                logger.error(f"❌ [AUTO] Error using cache-filtered manual download infrastructure: {download_error}")
                logger.error(f"🔍 [DEBUG] Error type: {type(download_error)}")
                logger.warning(f"⚠️ [CACHE] Cache NOT updated due to send failure - stories will retry next poll")
        
        # Update activity tracker with new stories found
        if len(new_stories) > 0:
            activity_tracker.update_activity(len(new_stories))
            logger.info(f"📊 [ACTIVITY] Activity updated: +{len(new_stories)} new stories processed")
        
        # Log summary
        logger.info(f"✅ [POLL] Polling check completed: {len(new_stories)} new stories processed using manual infrastructure")
        
        # Log cache statistics
        if supabase_manager.is_connected:
            try:
                cache_stats = supabase_manager.get_snapchat_cache_stats()
                logger.info(f"📊 [CACHE] Snapchat cache stats: {cache_stats}")
            except Exception as stats_error:
                logger.error(f"❌ [CACHE] Error getting cache stats: {stats_error}")
        
        request_tracker.print_stats()
        logger.info('')
        
    except Exception as error:
        logger.error(f'❌ [POLL] Polling error: {error}')
        request_tracker.track_snapchat(f"stories_{TARGET_USERNAME}", False, str(error))

async def update_stories_cache(username, stories):
    """Update the stories cache with current stories"""
    try:
        logger.info(f"📊 [CACHE] Updating stories cache for @{username} with {len(stories)} stories...")
        
        # Use Supabase for caching
        if supabase_manager.is_connected:
            # Update Supabase cache
            success = await supabase_manager.update_recent_stories_cache(username, stories)
            if success:
                logger.info(f"✅ [CACHE] Stories cache updated for @{username} (Supabase)")
            else:
                logger.error(f"❌ [CACHE] Failed to update Supabase cache for @{username}")
        else:
            logger.warning(f"⚠️ [CACHE] Supabase not connected - cannot update cache for @{username}")
        
    except Exception as error:
        logger.error(f"❌ [CACHE] Error updating stories cache: {error}")

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
        # Use Supabase for caching
        if supabase_manager.is_connected:
            return await supabase_manager.is_story_processed(story_id, username)
        else:
            logger.warning(f"⚠️ [CACHE] Supabase not connected - cannot check if story is processed")
            return False
        
    except Exception as error:
        logger.error(f"Error checking story processed: {error}")
        return False

async def mark_story_processed(story_id, username, story_url, story_type):
    """Mark a story as processed"""
    try:
        logger.info(f"📊 [CACHE] Marking story as processed: {story_id}")
        
        # Use Supabase for caching
        if supabase_manager.is_connected:
            success = await supabase_manager.mark_story_processed(story_id, username, story_url, story_type)
            if success:
                logger.info(f"✅ [CACHE] Story marked as processed in Supabase: {story_id}")
            else:
                logger.error(f"❌ [CACHE] Failed to mark story as processed in Supabase: {story_id}")
        else:
            logger.warning(f"⚠️ [CACHE] Supabase not connected - cannot mark story as processed")
        
    except Exception as error:
        logger.error(f"❌ [CACHE] Error marking story processed: {error}")

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
async def set_target_endpoint(request: AddTargetRequest):
    """Set the target username for polling (follows Instagram flow - no automatic polling)"""
    try:
        global TARGET_USERNAME
        
        username = request.username
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
# Note: This function has been removed as we now use the same download and sending
# infrastructure as the manual system to ensure videos are sent as videos, not images.

# ===== PHASE 6.5: SNAPCHAT-SPECIFIC ENDPOINTS FOR FRONTEND =====
# These endpoints provide the same functionality as the existing endpoints
# but with the snapchat- prefix that the frontend expects

@app.get("/snapchat-status")
async def get_snapchat_status():
    """Get Snapchat service status (frontend compatibility endpoint)"""
    try:
        stats = request_tracker.get_stats()
        return {
            "status": "running",
            "target_username": TARGET_USERNAME,
            "enabled": POLLING_ENABLED,
            "active": current_polling_timeout is not None,
            "started": polling_started,
            "current_interval": activity_tracker.get_polling_interval(),
            "activity_level": activity_tracker.get_activity_level(),
            "uptime": stats['uptime'],
            "statistics": {
                "snapchat": stats['snapchat'],
                "telegram": stats['telegram'],
                "rates": stats['rates']
            }
        }
        
    except Exception as error:
        logger.error(f"Error getting Snapchat status: {error}")
        raise HTTPException(status_code=500, detail=str(error))

@app.post("/snapchat-set-target")
async def set_snapchat_target_endpoint(request: AddTargetRequest):
    """Set the Snapchat target username (frontend compatibility endpoint)"""
    try:
        global TARGET_USERNAME
        
        username = request.username
        if not username or username.strip() == "":
            raise HTTPException(status_code=400, detail="Username cannot be empty")
        
        # Only stop polling if we're changing to a different target
        if polling_started and TARGET_USERNAME and TARGET_USERNAME.strip() != username.strip():
            logger.info(f"🔄 Changing Snapchat target from @{TARGET_USERNAME} to @{username.strip()}, stopping current polling")
            await stop_polling()
        
        TARGET_USERNAME = username.strip()
        
        logger.info(f"Snapchat target username set to: @{TARGET_USERNAME}")
        
        return {
            "success": True,
            "message": f"Snapchat target username set to @{TARGET_USERNAME}",
            "target": TARGET_USERNAME
        }
        
    except Exception as error:
        logger.error(f"Error setting Snapchat target: {error}")
        raise HTTPException(status_code=500, detail=str(error))

@app.get("/snapchat-targeted-usernames")
async def get_snapchat_targeted_usernames():
    """Get Snapchat targeted usernames (frontend compatibility endpoint)"""
    try:
        usernames = []
        if TARGET_USERNAME:
            usernames.append(TARGET_USERNAME)
        
        return {
            "usernames": usernames,
            "current_target": TARGET_USERNAME
        }
        
    except Exception as error:
        logger.error(f"Error getting Snapchat targeted usernames: {error}")
        raise HTTPException(status_code=500, detail=str(error))

@app.post("/snapchat-start-polling")
async def start_snapchat_polling_endpoint():
    """Start Snapchat polling (frontend compatibility endpoint)"""
    try:
        if not TARGET_USERNAME:
            raise HTTPException(status_code=400, detail="No target set. Please set a target first.")
        
        if polling_started:
            return {
                "success": True,
                "message": "Snapchat polling already started",
                "target": TARGET_USERNAME,
                "polling_active": True
            }
        
        logger.info(f"Starting Snapchat polling for @{TARGET_USERNAME}")
        await start_polling(TARGET_USERNAME)
        
        return {
            "success": True,
            "message": f'Snapchat polling started for @{TARGET_USERNAME}',
            "target": TARGET_USERNAME,
            "polling_active": True
        }
        
    except Exception as error:
        logger.error(f"Error starting Snapchat polling: {error}")
        raise HTTPException(status_code=500, detail=str(error))

@app.post("/snapchat-stop-polling")
async def stop_snapchat_polling_endpoint():
    """Stop Snapchat polling (frontend compatibility endpoint)"""
    try:
        if not polling_started:
            return {
                "success": True,
                "message": "Snapchat polling not active",
                "polling_active": False
            }
        
        logger.info(f"🛑 Stopping Snapchat polling for @{TARGET_USERNAME}")
        await stop_polling()
        
        return {
            "success": True,
            "message": "Snapchat polling stopped",
            "polling_active": False
        }
        
    except Exception as error:
        logger.error(f"Error stopping Snapchat polling: {error}")
        raise HTTPException(status_code=500, detail=str(error))

@app.post("/snapchat-download", response_model=DownloadResponse)
async def snapchat_download_endpoint(request: DownloadRequest, background_tasks: BackgroundTasks):
    """Download Snapchat content (frontend compatibility endpoint - wraps /download)"""
    try:
        logger.info(f"📥 [SNAPCHAT-DOWNLOAD] Request for @{request.username} - {request.download_type}")
        
        # Call the existing download function
        snapchat = SnapchatDL(directory_prefix=DOWNLOADS_DIR, max_workers=8)
        key = f"{request.username}:{request.download_type}"
        
        # Reset progress
        with progress_lock:
            progress_data[key] = {"current": 0, "total": 0, "status": "Starting..."}
            file_progress[key] = {}
        
        # Notify all connected clients that we're starting
        await websocket_manager.broadcast(key, {"overall": progress_data[key], "files": file_progress[key]})
        
        try:
            logger.info(f"Starting {request.download_type} download for {request.username}")
            
            # Update progress
            with progress_lock:
                progress_data[key]["status"] = "Downloading..."
            await websocket_manager.broadcast(key, {"overall": progress_data[key], "files": file_progress[key]})
            
            media_urls = []
            if request.download_type == "stories":
                media_urls = await snapchat.download(request.username)
            elif request.download_type == "highlights":
                media_urls = await snapchat.download_highlights(request.username)
            elif request.download_type == "spotlights":
                media_urls = await snapchat.download_spotlights(request.username)
            
            logger.info(f"Downloaded {len(media_urls)} files")
            
            # Update final progress
            with progress_lock:
                progress_data[key]["status"] = f"Completed - {len(media_urls)} files"
                progress_data[key]["current"] = len(media_urls)
                progress_data[key]["total"] = len(media_urls)
            await websocket_manager.broadcast(key, {"overall": progress_data[key], "files": file_progress[key]})
            
            # Send to Telegram if requested
            if request.send_to_telegram:
                logger.info(f"📤 [SNAPCHAT-DOWNLOAD] Sending to Telegram for @{request.username}")
                background_tasks.add_task(send_downloaded_content_to_telegram, request.username, request.download_type, request.telegram_caption)
            
            return DownloadResponse(
                status="success",
                message=f"Successfully downloaded {len(media_urls)} {request.download_type}",
                media_urls=media_urls,
                download_count=len(media_urls)
            )
            
        except NoStoriesFound as e:
            logger.warning(f"⚠️ No stories found for @{request.username}: {str(e)}")
            with progress_lock:
                progress_data[key]["status"] = "No content found"
            await websocket_manager.broadcast(key, {"overall": progress_data[key], "files": file_progress[key]})
            
            return DownloadResponse(
                status="success",
                message=f"No {request.download_type} found for {request.username}",
                media_urls=[],
                download_count=0
            )
            
    except Exception as e:
        logger.error(f"❌ [SNAPCHAT-DOWNLOAD] Error: {str(e)}")
        logger.error(traceback.format_exc())
        
        # Update progress with error
        key = f"{request.username}:{request.download_type}"
        with progress_lock:
            progress_data[key]["status"] = f"Error: {str(e)}"
        await websocket_manager.broadcast(key, {"overall": progress_data[key], "files": file_progress[key]})
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/debug-api/{username}")
async def debug_snapchat_api(username: str):
    """Debug endpoint to see raw Snapchat API response"""
    try:
        import re
        import aiohttp
        
        logger.info(f"🔍 [DEBUG] Fetching Snapchat API for @{username}")
        
        endpoint = f"https://www.snapchat.com/add/{username}/"
        regexp = r'<script\s*id="__NEXT_DATA__"\s*type="application\/json">([^<]+)</script>'
        
        async with aiohttp.ClientSession() as session:
            async with session.get(
                endpoint,
                headers={
                    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
                }
            ) as response:
                if response.status != 200:
                    return {
                        "success": False,
                        "error": f"API returned status {response.status}",
                        "status_code": response.status
                    }
                
                html = await response.text()
                
                # Extract JSON
                json_match = re.findall(regexp, html)
                if not json_match:
                    return {
                        "success": False,
                        "error": "Could not find __NEXT_DATA__ JSON in response",
                        "html_length": len(html)
                    }
                
                # Parse JSON
                data = json.loads(json_match[0])
                
                # Log JSON size for debugging
                logger.info(f"📊 [DEBUG] JSON size: {len(json_match[0])} characters")
                logger.info(f"📊 [DEBUG] HTML size: {len(html)} characters")
                
                # Extract key information
                page_props = data.get("props", {}).get("pageProps", {})
                
                result = {
                    "success": True,
                    "username": username,
                    "api_url": endpoint,
                    "html_size": len(html),
                    "json_size": len(json_match[0]),
                    "page_props_keys": list(page_props.keys()),
                    "stories": {},
                    "highlights": {},
                    "user_profile": {}
                }
                
                # Extract story information
                if "story" in page_props:
                    story_data = page_props["story"]
                    result["stories"]["has_story"] = True
                    result["stories"]["keys"] = list(story_data.keys())
                    
                    if "snapList" in story_data:
                        snap_list = story_data["snapList"]
                        result["stories"]["snap_count"] = len(snap_list)
                        result["stories"]["snaps"] = []
                        
                        logger.info(f"\n🔍 [DEBUG] Processing {len(snap_list)} snaps from snapList:")
                        
                        for i, snap in enumerate(snap_list, 1):
                            snap_info = {
                                "snap_id": snap.get("snapId", {}).get("value", "N/A"),
                                "media_type": snap.get("snapMediaType", "N/A"),
                                "timestamp": snap.get("timestampInSec", {}).get("value", "N/A"),
                                "has_media_url": "mediaUrl" in snap.get("snapUrls", {})
                            }
                            result["stories"]["snaps"].append(snap_info)
                            
                            # Log each snap ID with position for easy comparison
                            logger.info(f"   📱 Snap {i}/{len(snap_list)}: {snap_info['snap_id']}")
                else:
                    result["stories"]["has_story"] = False
                
                # Extract highlights
                if "curatedHighlights" in page_props:
                    result["highlights"]["curated_count"] = len(page_props["curatedHighlights"])
                
                if "spotHighlights" in page_props:
                    result["highlights"]["spot_count"] = len(page_props["spotHighlights"])
                
                # Extract user profile
                if "userProfile" in page_props:
                    user_profile = page_props["userProfile"]
                    result["user_profile"]["exists"] = True
                    result["user_profile"]["type"] = user_profile.get("$case", "unknown")
                
                logger.info(f"✅ [DEBUG] Found {result['stories'].get('snap_count', 0)} snaps in API")
                
                return result
                
    except Exception as e:
        logger.error(f"❌ [DEBUG] Error: {e}")
        return {
            "success": False,
            "error": str(e)
        }

@app.get("/snapchat-poll-now")
async def snapchat_poll_now_endpoint(force: bool = False):
    """Manual Snapchat polling (frontend compatibility endpoint)"""
    try:
        if not TARGET_USERNAME:
            raise HTTPException(status_code=400, detail="No target set. Please set a target first.")
        
        logger.info(f"Manual Snapchat polling requested for @{TARGET_USERNAME} {force and '(force enabled)' or ''}")
        
        # Run the polling check
        await check_for_new_stories(force=force)
        
        return {
            "success": True,
            "message": f"Manual Snapchat polling completed for @{TARGET_USERNAME}",
            "target": TARGET_USERNAME,
            "force": force
        }
        
    except Exception as error:
        logger.error(f"Error during manual Snapchat polling: {error}")
        raise HTTPException(status_code=500, detail=str(error))

@app.get("/snapchat-stats")
async def get_snapchat_stats():
    """Get Snapchat statistics (frontend compatibility endpoint)"""
    try:
        stats = request_tracker.get_stats()
        return {
            "snapchat": stats['snapchat'],
            "telegram": stats['telegram'],
            "rates": stats['rates'],
            "uptime": stats['uptime']
        }
        
    except Exception as error:
        logger.error(f"Error getting Snapchat stats: {error}")
        raise HTTPException(status_code=500, detail=str(error))

@app.post("/snapchat-clear-cache")
async def clear_snapchat_cache_endpoint():
    """Clear Snapchat cache (frontend compatibility endpoint)"""
    try:
        if not TARGET_USERNAME:
            raise HTTPException(status_code=400, detail="No target set. Please set a target first.")
        
        logger.info(f"Clearing Snapchat cache for @{TARGET_USERNAME}")
        
        # Clear cache for the current target
        if supabase_manager.is_connected:
            deleted_count = await supabase_manager.clear_user_cache(TARGET_USERNAME)
            logger.info(f"🗑️ Cleared {deleted_count} cache entries for @{TARGET_USERNAME}")
        else:
            logger.warning("⚠️ Supabase not connected, cannot clear cache")
            deleted_count = 0
        
        # Memory cache removed - Supabase is the only cache now
        
        return {
            "success": True,
            "message": f"Snapchat cache cleared for @{TARGET_USERNAME} (Supabase + memory)",
            "deleted_count": deleted_count
        }
        
    except Exception as error:
        logger.error(f"Error clearing Snapchat cache: {error}")
        raise HTTPException(status_code=500, detail=str(error))

# ===== PHASE 7: SERVICE INTEGRATION & GRACEFUL SHUTDOWN =====

# ===== 7.1 Enhanced Graceful Shutdown =====
async def graceful_shutdown():
    """Enhanced graceful shutdown for the polling system"""
    global shutdown_in_progress
    shutdown_in_progress = True
    logger.info("🔄 Starting graceful shutdown...")
    
    # Stop polling system
    try:
        if polling_started:
            logger.info("🛑 Stopping polling system...")
            await stop_polling()
    except Exception as e:
        logger.error(f"❌ Error stopping polling: {e}")
    
    # Stop health check system
    try:
        if health_check.running:
            logger.info("🏥 Stopping health check system...")
            health_check.stop()
    except Exception as e:
        logger.error(f"❌ Error stopping health check: {e}")
    
    # Database connections closed (SQLite removed)
    logger.info("🗄️ Database connections closed (SQLite removed)")
    
    # Close Telegram manager
    try:
        if telegram_manager:
            logger.info("📤 Closing Telegram manager...")
            await telegram_manager.close()
    except Exception as e:
        logger.error(f"❌ Error closing Telegram manager: {e}")
    
    # Stop scheduler
    try:
        if scheduler.running:
            logger.info("⏰ Stopping scheduler...")
            scheduler.shutdown()
    except Exception as e:
        logger.error(f"❌ Error stopping scheduler: {e}")
    
    # Close WebSocket connections
    try:
        logger.info("🔌 Closing WebSocket connections...")
        for key in list(websocket_manager.active_connections.keys()):
            for websocket in websocket_manager.active_connections[key]:
                try:
                    await websocket.close()
                except:
                    pass
    except Exception as e:
        logger.error(f"❌ Error closing WebSocket connections: {e}")
    
    logger.info("✅ Graceful shutdown completed")

# ===== 7.2 Enhanced Startup Integration =====
@app.on_event("startup")
async def enhanced_startup_event():
    """Enhanced startup with Supabase integration"""
    try:
        app.startup_time = time.time()
        
        # Initialize core services
        logger.info("Initializing Snapchat service...")
        
        # Connect to Supabase
        supabase_connected = await supabase_manager.connect()
        if supabase_connected:
            logger.info("✅ Supabase integration ready for Snapchat")
        else:
            logger.warning("⚠️ Supabase integration disabled for Snapchat")
        
        # Check and load cache on startup
        logger.info("📊 Checking cache status on startup...")
        await check_cache_on_boot()
        
        # Validate Telegram configuration
        telegram_valid = await validate_telegram_config()
        if telegram_valid:
            logger.info("Telegram integration ready")
        else:
            logger.warning("⚠️ Telegram integration disabled")
        
        # Start monitoring systems
        health_check.start()
        
        # Schedule 4-week cleanup (every 4 weeks)
        scheduler.add_job(
            health_check.scheduled_cleanup,
            trigger=IntervalTrigger(weeks=4),
            id="snapchat_4week_cleanup",
            replace_existing=True
        )
        logger.info("⏰ Scheduled 4-week cleanup job added")
        
        # Note: Use UptimeRobot (or similar) to ping /ping endpoint every 5-10 minutes
        # to prevent Render free tier from spinning down due to inactivity
        # https://uptimerobot.com - Free tier supports 50 monitors
        
        # Auto-start polling if TARGET_USERNAME environment variable is set
        env_target = os.getenv("TARGET_USERNAME")
        if env_target:
            global TARGET_USERNAME
            TARGET_USERNAME = env_target
            logger.info(f"🎯 Target username found in environment: @{TARGET_USERNAME}")
            # Wait 5 seconds for services to fully initialize, then start polling
            async def auto_start_polling():
                await asyncio.sleep(5.0)
                try:
                    logger.info(f"🚀 Auto-starting polling for @{TARGET_USERNAME}")
                    await start_polling(TARGET_USERNAME)
                except Exception as error:
                    logger.error(f"❌ Failed to auto-start polling: {error}")
            
            # Schedule auto-start
            asyncio.create_task(auto_start_polling())
        elif TARGET_USERNAME:
            logger.info(f"🎯 Target username found: @{TARGET_USERNAME}")
            logger.info("💡 Use /start-polling to begin automatic polling")
        else:
            logger.info("💡 Set TARGET_USERNAME environment variable to auto-start polling")
        
        logger.info("Snapchat service started successfully")
        # Get service URL from environment or use default
        service_url = os.getenv('SNAPCHAT_SERVICE_URL', 'http://localhost:8000')
        logger.info(f"API Documentation: {service_url}/docs")
        logger.info(f"Health Check: {service_url}/health")
        
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
    
    # Get the event loop and schedule graceful shutdown
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            loop.create_task(graceful_shutdown())
        else:
            # If no loop is running, run shutdown synchronously
            asyncio.run(graceful_shutdown())
    except Exception as e:
        logger.error(f"❌ Error scheduling graceful shutdown: {e}")

# Register enhanced signal handlers
signal.signal(signal.SIGINT, enhanced_signal_handler)
signal.signal(signal.SIGTERM, enhanced_signal_handler)



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
        
        # Database cache clearing removed (SQLite fallback removed)
        logger.info("Database cache clearing skipped (SQLite removed)")
        
        logger.info("Cache cleared successfully")
        return {"success": True, "message": "Cache cleared successfully"}
        
    except Exception as e:
        logger.error(f"Error clearing cache: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to clear cache: {str(e)}")

# Add clear cache for specific user endpoint
@app.post("/clear-user-cache")
async def clear_user_cache(username: str):
    """Clear cache for specific user"""
    try:
        if not username:
            raise HTTPException(status_code=400, detail="Username is required")
        
        deleted_count = 0
        
        # Use Supabase for caching
        if supabase_manager and supabase_manager.is_connected:
            try:
                logger.info(f"🗑️ Clearing cache for @{username} using Supabase...")
                deleted_count = await supabase_manager.clear_user_cache(username)
            except Exception as error:
                logger.error(f"❌ Supabase cache clear failed: {error}")
                logger.warning(f"⚠️ Cannot clear cache for @{username} - Supabase not available")
        else:
            logger.warning(f"⚠️ Cannot clear cache for @{username} - Supabase not connected")
        
        # Memory cache removed - Supabase is the only cache now
        
        return {
            "success": True, 
            "deleted": deleted_count, 
            "username": username,
            "message": f"Cache cleared for @{username}"
        }
        
    except Exception as e:
        logger.error(f"Error clearing user cache: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to clear user cache: {str(e)}")

# Add clear all data for specific user endpoint
@app.post("/clear-user-data")
async def clear_user_data(username: str):
    """Clear all data (cache + processed stories) for specific user"""
    try:
        if not username:
            raise HTTPException(status_code=400, detail="Username is required")
        
        processed_deleted = 0
        cache_deleted = 0
        
        # Use Supabase for caching
        if supabase_manager and supabase_manager.is_connected:
            try:
                logger.info(f"🧹 Clearing all data for @{username} using Supabase...")
                result = await supabase_manager.clear_user_data(username)
                processed_deleted = result["processed_deleted"]
                cache_deleted = result["cache_deleted"]
            except Exception as error:
                logger.error(f"❌ Supabase data clear failed: {error}")
                logger.warning(f"⚠️ Cannot clear data for @{username} - Supabase not available")
        else:
            logger.warning(f"⚠️ Cannot clear data for @{username} - Supabase not connected")
        
        # Memory cache removed - Supabase is the only cache now
        
        return {
            "success": True,
            "processed_deleted": processed_deleted,
            "cache_deleted": cache_deleted,
            "username": username,
            "message": f"All data cleared for @{username}"
        }
        
    except Exception as e:
        logger.error(f"Error clearing user data: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to clear user data: {str(e)}")

# Add gallery endpoint for all users
@app.get("/gallery/{media_type}", response_model=GalleryResponse)
async def get_gallery_all_users(media_type: str):
    """Get gallery for all users of a specific media type"""
    # Reduced logging to avoid spam
    # logger.info(f"Fetching gallery for all users - {media_type}")
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

# ===== DIRECT DOWNLOAD AND SEND FUNCTION (NO DISK SAVE) =====
async def download_and_send_directly(username: str, stories: list, telegram_caption: str):
    """
    Download stories to temporary memory and send directly to Telegram
    WITHOUT saving to disk permanently. Temp files are deleted immediately after sending.
    """
    try:
        logger.info(f"📥 [DIRECT] Downloading and sending {len(stories)} items directly to Telegram...")
        
        import tempfile
        sent_count = 0
        failed_count = 0
        
        for i, story in enumerate(stories, 1):
            temp_path = None
            try:
                story_url = story.get('url')
                story_type = story.get('type', 'photo')
                snap_id = story.get('snap_id', f'story_{i}')
                
                logger.info(f"📥 [DIRECT] Processing {i}/{len(stories)}: {story_type} - {snap_id}")
                
                # Download to temporary file
                file_extension = '.mp4' if story_type == 'video' else '.jpg'
                temp_file = tempfile.NamedTemporaryFile(suffix=file_extension, delete=False)
                temp_path = temp_file.name
                temp_file.close()
                
                # Download content
                async with aiohttp.ClientSession() as session:
                    async with session.get(story_url) as response:
                        if response.status == 200:
                            content = await response.read()
                            with open(temp_path, 'wb') as f:
                                f.write(content)
                            logger.info(f"✅ [DIRECT] Downloaded to temp: {os.path.basename(temp_path)}")
                        else:
                            logger.error(f"❌ [DIRECT] Download failed: HTTP {response.status}")
                            failed_count += 1
                            continue
                
                # Send to Telegram
                if telegram_manager:
                    try:
                        individual_caption = f"{telegram_caption}\n\n📱 Item {i}/{len(stories)}"
                        
                        if story_type == 'video':
                            result = await telegram_manager.send_video_with_retry(temp_path, individual_caption)
                        else:
                            result = await telegram_manager.send_photo_with_retry(temp_path, individual_caption)
                        
                        logger.info(f"✅ [DIRECT] Sent to Telegram: {snap_id}")
                        sent_count += 1
                        
                    except Exception as e:
                        logger.error(f"❌ [DIRECT] Failed to send to Telegram: {e}")
                        failed_count += 1
                    
            except Exception as e:
                logger.error(f"❌ [DIRECT] Error processing story {i}: {e}")
                failed_count += 1
            finally:
                # ALWAYS cleanup, even if error
                if temp_path and os.path.exists(temp_path):
                    try:
                        os.unlink(temp_path)
                        logger.info(f"🗑️ [DIRECT] Deleted temp file: {os.path.basename(temp_path)}")
                    except Exception as cleanup_error:
                        logger.error(f"⚠️ [DIRECT] Failed to delete temp file: {cleanup_error}")
        
        logger.info(f"📊 [DIRECT] Complete: {sent_count} sent, {failed_count} failed")
        
    except Exception as e:
        logger.error(f"❌ [DIRECT] Error in direct download and send: {e}")
        raise

# ===== CACHE-FILTERED DOWNLOAD FUNCTION =====
async def download_filtered_stories(username: str, new_stories: list, telegram_caption: str):
    """
    Download only new stories and send directly to Telegram
    Uses the direct download method (temp files only, no permanent disk save)
    """
    try:
        logger.info(f"📥 [POLLING] Processing {len(new_stories)} new stories...")
        
        # Use the direct download and send function (no permanent disk save)
        await download_and_send_directly(username, new_stories, telegram_caption)
        
        logger.info(f"✅ [POLLING] Completed sending {len(new_stories)} new stories")
        
    except Exception as e:
        logger.error(f"❌ [POLLING] Error in filtered download: {e}")
        raise

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
