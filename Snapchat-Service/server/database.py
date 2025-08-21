import sqlite3
import asyncio
import os
from datetime import datetime
from typing import List, Dict, Optional, Any
from loguru import logger
import json

class DatabaseManager:
    def __init__(self, db_path: str = "snapchat_telegram.db"):
        self.db_path = db_path
        self.init_database()
    
    def init_database(self):
        """Initialize database with required tables"""
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()
                
                # Create processed_media table
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS processed_media (
                        id TEXT PRIMARY KEY,
                        username TEXT NOT NULL,
                        media_url TEXT NOT NULL,
                        media_type TEXT NOT NULL,
                        file_path TEXT NOT NULL,
                        is_sent_to_telegram BOOLEAN DEFAULT FALSE,
                        telegram_sent_at DATETIME,
                        telegram_message_id TEXT,
                        processed_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                """)
                
                # Create recent_media_cache table
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS recent_media_cache (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        username TEXT NOT NULL,
                        media_url TEXT NOT NULL,
                        snap_id TEXT,
                        media_type TEXT NOT NULL,
                        is_sent_to_telegram BOOLEAN DEFAULT FALSE,
                        media_order INTEGER,
                        cached_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                """)
                
                # Create target_users table
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS target_users (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        username TEXT UNIQUE NOT NULL,
                        is_active BOOLEAN DEFAULT TRUE,
                        polling_enabled BOOLEAN DEFAULT FALSE,
                        polling_interval INTEGER DEFAULT 30,
                        last_polled DATETIME,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                """)
                
                # Create telegram_sending_log table
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS telegram_sending_log (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        media_id TEXT NOT NULL,
                        username TEXT NOT NULL,
                        media_type TEXT NOT NULL,
                        telegram_chat_id TEXT NOT NULL,
                        telegram_message_id TEXT,
                        caption TEXT,
                        status TEXT NOT NULL,
                        error_message TEXT,
                        sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (media_id) REFERENCES processed_media(id)
                    )
                """)
                
                # Create indexes for better performance
                cursor.execute("CREATE INDEX IF NOT EXISTS idx_processed_media_username ON processed_media(username)")
                cursor.execute("CREATE INDEX IF NOT EXISTS idx_processed_media_type ON processed_media(media_type)")
                cursor.execute("CREATE INDEX IF NOT EXISTS idx_cache_username ON recent_media_cache(username)")
                cursor.execute("CREATE INDEX IF NOT EXISTS idx_target_users_username ON target_users(username)")
                cursor.execute("CREATE INDEX IF NOT EXISTS idx_telegram_log_username ON telegram_sending_log(username)")
                
                conn.commit()
                logger.info("✅ Database initialized successfully")
                
        except Exception as e:
            logger.error(f"❌ Database initialization failed: {e}")
            raise
    
    async def insert_processed_media(
        self,
        media_id: str,
        username: str,
        media_url: str,
        media_type: str,
        file_path: str,
        is_sent_to_telegram: bool = False
    ) -> bool:
        """Insert processed media record"""
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    INSERT OR REPLACE INTO processed_media 
                    (id, username, media_url, media_type, file_path, is_sent_to_telegram, processed_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                """, (media_id, username, media_url, media_type, file_path, is_sent_to_telegram, datetime.now()))
                conn.commit()
                return True
        except Exception as e:
            logger.error(f"❌ Failed to insert processed media: {e}")
            return False
    
    async def get_processed_media(self, username: str, media_type: str) -> List[Dict[str, Any]]:
        """Get processed media for a user and media type"""
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.row_factory = sqlite3.Row
                cursor = conn.cursor()
                cursor.execute("""
                    SELECT * FROM processed_media 
                    WHERE username = ? AND media_type = ?
                    ORDER BY processed_at DESC
                """, (username, media_type))
                rows = cursor.fetchall()
                return [dict(row) for row in rows]
        except Exception as e:
            logger.error(f"❌ Failed to get processed media: {e}")
            return []
    
    async def update_telegram_status(
        self,
        media_id: str,
        telegram_message_id: str = None,
        is_sent: bool = True
    ) -> bool:
        """Update Telegram sending status for a media item"""
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    UPDATE processed_media 
                    SET is_sent_to_telegram = ?, telegram_message_id = ?, telegram_sent_at = ?
                    WHERE id = ?
                """, (is_sent, telegram_message_id, datetime.now() if is_sent else None, media_id))
                conn.commit()
                return True
        except Exception as e:
            logger.error(f"❌ Failed to update Telegram status: {e}")
            return False
    
    async def insert_telegram_log(
        self,
        media_id: str,
        username: str,
        media_type: str,
        telegram_chat_id: str,
        telegram_message_id: str = None,
        caption: str = None,
        status: str = "success",
        error_message: str = None
    ) -> bool:
        """Insert Telegram sending log entry"""
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    INSERT INTO telegram_sending_log 
                    (media_id, username, media_type, telegram_chat_id, telegram_message_id, caption, status, error_message)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, (media_id, username, media_type, telegram_chat_id, telegram_message_id, caption, status, error_message))
                conn.commit()
                return True
        except Exception as e:
            logger.error(f"❌ Failed to insert Telegram log: {e}")
            return False
    
    async def add_target_user(
        self,
        username: str,
        polling_interval: int = 30
    ) -> bool:
        """Add new target user"""
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    INSERT OR REPLACE INTO target_users 
                    (username, polling_interval, created_at)
                    VALUES (?, ?, ?)
                """, (username, polling_interval, datetime.now()))
                conn.commit()
                return True
        except Exception as e:
            logger.error(f"❌ Failed to add target user: {e}")
            return False
    
    async def get_target_users(self) -> List[Dict[str, Any]]:
        """Get all target users"""
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.row_factory = sqlite3.Row
                cursor = conn.cursor()
                cursor.execute("SELECT * FROM target_users ORDER BY created_at DESC")
                rows = cursor.fetchall()
                return [dict(row) for row in rows]
        except Exception as e:
            logger.error(f"❌ Failed to get target users: {e}")
            return []
    
    async def update_polling_status(
        self,
        username: str,
        enabled: bool,
        last_polled: datetime = None
    ) -> bool:
        """Update polling status for a target user"""
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    UPDATE target_users 
                    SET polling_enabled = ?, last_polled = ?
                    WHERE username = ?
                """, (enabled, last_polled or datetime.now(), username))
                conn.commit()
                return True
        except Exception as e:
            logger.error(f"❌ Failed to update polling status: {e}")
            return False
    
    async def get_target_user(self, username: str) -> Optional[Dict[str, Any]]:
        """Get specific target user"""
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.row_factory = sqlite3.Row
                cursor = conn.cursor()
                cursor.execute("SELECT * FROM target_users WHERE username = ?", (username,))
                row = cursor.fetchone()
                return dict(row) if row else None
        except Exception as e:
            logger.error(f"❌ Failed to get target user: {e}")
            return None
    
    async def remove_target_user(self, username: str) -> bool:
        """Remove target user"""
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()
                cursor.execute("DELETE FROM target_users WHERE username = ?", (username,))
                conn.commit()
                return True
        except Exception as e:
            logger.error(f"❌ Failed to remove target user: {e}")
            return False
    
    async def clear_user_data(self, username: str) -> Dict[str, int]:
        """Clear all data for a specific user"""
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()
                
                # Get counts before deletion
                cursor.execute("SELECT COUNT(*) FROM processed_media WHERE username = ?", (username,))
                processed_count = cursor.fetchone()[0]
                
                cursor.execute("SELECT COUNT(*) FROM recent_media_cache WHERE username = ?", (username,))
                cache_count = cursor.fetchone()[0]
                
                cursor.execute("SELECT COUNT(*) FROM telegram_sending_log WHERE username = ?", (username,))
                telegram_count = cursor.fetchone()[0]
                
                # Delete records
                cursor.execute("DELETE FROM processed_media WHERE username = ?", (username,))
                cursor.execute("DELETE FROM recent_media_cache WHERE username = ?", (username,))
                cursor.execute("DELETE FROM telegram_sending_log WHERE username = ?", (username,))
                cursor.execute("DELETE FROM target_users WHERE username = ?", (username,))
                
                conn.commit()
                
                return {
                    "processed_deleted": processed_count,
                    "cache_deleted": cache_count,
                    "telegram_logs_deleted": telegram_count,
                    "target_deleted": 1 if processed_count > 0 or cache_count > 0 else 0
                }
        except Exception as e:
            logger.error(f"❌ Failed to clear user data: {e}")
            return {"processed_deleted": 0, "cache_deleted": 0, "telegram_logs_deleted": 0, "target_deleted": 0}

    async def clear_all_cached_media(self) -> Dict[str, int]:
        """Clear all cached media for all users"""
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()
                
                # Get counts before deletion
                cursor.execute("SELECT COUNT(*) FROM recent_media_cache")
                cache_count = cursor.fetchone()[0]
                
                cursor.execute("SELECT COUNT(*) FROM processed_media")
                processed_count = cursor.fetchone()[0]
                
                # Delete all cached media
                cursor.execute("DELETE FROM recent_media_cache")
                cursor.execute("DELETE FROM processed_media")
                
                conn.commit()
                
                logger.info(f"Cleared {cache_count} cached media and {processed_count} processed media records")
                
                return {
                    "cache_deleted": cache_count,
                    "processed_deleted": processed_count
                }
        except Exception as e:
            logger.error(f"❌ Failed to clear all cached media: {e}")
            return {"cache_deleted": 0, "processed_deleted": 0}
    
    async def get_telegram_stats(self) -> Dict[str, Any]:
        """Get Telegram sending statistics"""
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()
                
                # Get total sent and failed
                cursor.execute("""
                    SELECT 
                        COUNT(*) as total,
                        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as sent,
                        SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as failed
                    FROM telegram_sending_log
                """)
                result = cursor.fetchone()
                
                # Get recent sent (last 24 hours)
                cursor.execute("""
                    SELECT COUNT(*) 
                    FROM telegram_sending_log 
                    WHERE status = 'success' 
                    AND sent_at >= datetime('now', '-1 day')
                """)
                recent_sent = cursor.fetchone()[0]
                
                total = result[0] or 0
                sent = result[1] or 0
                failed = result[2] or 0
                success_rate = (sent / total * 100) if total > 0 else 0
                
                return {
                    "total_sent": sent,
                    "total_failed": failed,
                    "recent_sent": recent_sent,
                    "success_rate": round(success_rate, 2),
                    "download_url": None  # Not applicable for Snapchat
                }
                
        except Exception as e:
            logger.error(f"Error getting Telegram stats: {e}")
            return {
                "total_sent": 0,
                "total_failed": 0,
                "recent_sent": 0,
                "success_rate": 0.0,
                "download_url": None
            }

    async def check_connection(self) -> bool:
        """Check if database connection is working"""
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT 1")
                result = cursor.fetchone()
                return result is not None and result[0] == 1
        except Exception as e:
            logger.error(f"Database connection check failed: {e}")
            return False

    async def reconnect(self) -> bool:
        """Reconnect to database (for health check system)"""
        try:
            # Test connection by creating a new one
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT 1")
                result = cursor.fetchone()
                if result and result[0] == 1:
                    logger.info("✅ Database reconnection successful")
                    return True
                else:
                    logger.error("❌ Database reconnection failed")
                    return False
        except Exception as e:
            logger.error(f"Database reconnection failed: {e}")
            return False

# Global database instance
db_manager = DatabaseManager()
