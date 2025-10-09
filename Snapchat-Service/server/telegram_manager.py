import aiohttp
import asyncio
import os
import time
from typing import Dict, Optional, Any
from loguru import logger
from aiohttp import FormData

class TelegramRateLimiter:
    def __init__(self, max_requests_per_second: int = 1):
        self.max_requests = max_requests_per_second
        self.last_request_time = 0
        self.lock = asyncio.Lock()
    
    async def wait_if_needed(self):
        """Wait if rate limit would be exceeded"""
        async with self.lock:
            current_time = time.time()
            time_since_last = current_time - self.last_request_time
            min_interval = 1.0 / self.max_requests
            
            if time_since_last < min_interval:
                wait_time = min_interval - time_since_last
                await asyncio.sleep(wait_time)
            
            self.last_request_time = time.time()

class TelegramErrorHandler:
    @staticmethod
    async def handle_telegram_error(error: Exception, context: dict) -> dict:
        """Handle Telegram API errors with appropriate responses"""
        
        error_message = str(error)
        
        # Handle the specific list error
        if "'list' object has no attribute 'get'" in error_message:
            return {
                "status": "error",
                "type": "list_response_error",
                "message": "Telegram API returned unexpected list response instead of dictionary",
                "retry": False
            }
        
        # Categorize errors
        if "bot was blocked" in error_message.lower():
            return {
                "status": "error",
                "type": "bot_blocked",
                "message": "Bot was blocked by the user",
                "retry": False
            }
        elif "chat not found" in error_message.lower():
            return {
                "status": "error",
                "type": "chat_not_found",
                "message": "Telegram chat not found",
                "retry": False
            }
        elif "file too large" in error_message.lower():
            return {
                "status": "error",
                "type": "file_too_large",
                "message": "File exceeds Telegram size limit (50MB)",
                "retry": False
            }
        elif "rate limit" in error_message.lower():
            return {
                "status": "error",
                "type": "rate_limit",
                "message": "Rate limit exceeded, will retry",
                "retry": True,
                "retry_delay": 60
            }
        else:
            return {
                "status": "error",
                "type": "unknown",
                "message": f"Unknown error: {error_message}",
                "retry": True,
                "retry_delay": 30
            }

class TelegramManager:
    def __init__(self, bot_token: str, channel_id: str):
        self.bot_token = bot_token
        self.channel_id = channel_id
        self.base_url = f"https://api.telegram.org/bot{bot_token}"
        self.session = None
        self.rate_limiter = TelegramRateLimiter(max_requests_per_second=1)
    
    async def __aenter__(self):
        self.session = aiohttp.ClientSession()
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.session:
            await self.session.close()
    
    async def validate_connection(self) -> bool:
        """Validate bot token and channel access"""
        try:
            if not self.session:
                self.session = aiohttp.ClientSession()
            
            # Test bot info
            async with self.session.get(f"{self.base_url}/getMe") as response:
                if response.status != 200:
                    logger.error(f"❌ Bot token validation failed: {response.status}")
                    return False
                
                bot_info = await response.json()
                if not bot_info.get("ok"):
                    logger.error(f"❌ Bot token invalid: {bot_info}")
                    return False
                
                logger.info(f"✅ Bot validated: @{bot_info['result']['username']}")
            
            # Test channel access
            async with self.session.get(f"{self.base_url}/getChat", params={"chat_id": self.channel_id}) as response:
                if response.status != 200:
                    logger.error(f"❌ Channel access validation failed: {response.status}")
                    return False
                
                chat_info = await response.json()
                if not chat_info.get("ok"):
                    logger.error(f"❌ Channel access invalid: {chat_info}")
                    return False
                
                logger.info(f"✅ Channel access validated: {chat_info['result']['title']}")
                return True
                
        except Exception as e:
            logger.error(f"❌ Connection validation failed: {e}")
            return False
    
    async def send_photo(self, photo_path: str, caption: str) -> dict:
        """Send photo to Telegram channel"""
        await self.rate_limiter.wait_if_needed()
        
        try:
            if not self.session:
                self.session = aiohttp.ClientSession()
            
            # Check file exists
            if not os.path.exists(photo_path):
                raise Exception(f"Photo file not found: {photo_path}")
            
            # Check file size (Telegram limit: 10MB for photos)
            file_size = os.path.getsize(photo_path)
            if file_size > 10 * 1024 * 1024:  # 10MB
                raise Exception(f"Photo file too large: {file_size} bytes")
            
            # Prepare form data
            data = FormData()
            data.add_field('chat_id', self.channel_id)
            data.add_field('caption', caption)
            data.add_field('parse_mode', 'HTML')
            
            # Add photo file
            with open(photo_path, 'rb') as f:
                data.add_field('photo', f.read(), filename=os.path.basename(photo_path))
            
            # Send request
            async with self.session.post(f"{self.base_url}/sendPhoto", data=data) as response:
                if response.status == 200:
                    result = await response.json()
                    # Debug: Check what Telegram API returns
                    logger.info(f"🔍 [DEBUG] Telegram API response type: {type(result)}")
                    logger.info(f"🔍 [DEBUG] Telegram API response content: {result}")
                    
                    if result.get("ok"):
                        logger.info(f"✅ Photo sent to Telegram: {os.path.basename(photo_path)}")
                        return result["result"]
                    else:
                        raise Exception(f"Telegram API error: {result}")
                else:
                    error_text = await response.text()
                    logger.error(f"❌ Failed to send photo: {response.status} - {error_text}")
                    raise Exception(f"Telegram API error: {error_text}")
                    
        except Exception as e:
            logger.error(f"Error sending photo to Telegram: {e}")
            raise
    
    async def send_video(self, video_path: str, caption: str) -> dict:
        """Send video to Telegram channel"""
        await self.rate_limiter.wait_if_needed()
        
        try:
            if not self.session:
                self.session = aiohttp.ClientSession()
            
            # Check file exists
            if not os.path.exists(video_path):
                raise Exception(f"Video file not found: {video_path}")
            
            # Check file size (Telegram limit: 50MB)
            file_size = os.path.getsize(video_path)
            if file_size > 50 * 1024 * 1024:  # 50MB
                raise Exception(f"Video file too large: {file_size} bytes")
            
            # Prepare form data
            data = FormData()
            data.add_field('chat_id', self.channel_id)
            data.add_field('caption', caption)
            data.add_field('parse_mode', 'HTML')
            
            # Add video file
            with open(video_path, 'rb') as f:
                data.add_field('video', f.read(), filename=os.path.basename(video_path))
            
            # Send request
            async with self.session.post(f"{self.base_url}/sendVideo", data=data) as response:
                if response.status == 200:
                    result = await response.json()
                    # Debug: Check what Telegram API returns
                    logger.info(f"🔍 [DEBUG] Telegram API response type: {type(result)}")
                    logger.info(f"🔍 [DEBUG] Telegram API response content: {result}")
                    
                    # Validate response format
                    if isinstance(result, list):
                        logger.error(f"❌ Telegram API returned list instead of dict: {result}")
                        raise Exception(f"Telegram API returned unexpected list response: {result}")
                    
                    if not isinstance(result, dict):
                        logger.error(f"❌ Telegram API returned unexpected type: {type(result)} - {result}")
                        raise Exception(f"Telegram API returned unexpected response type: {type(result)}")
                    
                    if result.get("ok"):
                        logger.info(f"✅ Video sent to Telegram: {os.path.basename(video_path)}")
                        return result["result"]
                    else:
                        error_description = result.get("description", "Unknown error")
                        raise Exception(f"Telegram API error: {error_description}")
                else:
                    error_text = await response.text()
                    logger.error(f"❌ Failed to send video: {response.status} - {error_text}")
                    raise Exception(f"Telegram API error: {error_text}")
                    
        except Exception as e:
            logger.error(f"Error sending video to Telegram: {e}")
            raise
    
    async def send_text(self, text: str) -> dict:
        """Send text message to Telegram channel"""
        await self.rate_limiter.wait_if_needed()
        
        try:
            if not self.session:
                self.session = aiohttp.ClientSession()
            
            # Prepare data
            data = {
                'chat_id': self.channel_id,
                'text': text,
                'parse_mode': 'HTML'
            }
            
            # Send request
            async with self.session.post(f"{self.base_url}/sendMessage", json=data) as response:
                if response.status == 200:
                    result = await response.json()
                    # Debug: Check what Telegram API returns
                    logger.info(f"🔍 [DEBUG] Telegram API response type: {type(result)}")
                    logger.info(f"🔍 [DEBUG] Telegram API response content: {result}")
                    
                    # Validate response format
                    if isinstance(result, list):
                        logger.error(f"❌ Telegram API returned list instead of dict: {result}")
                        raise Exception(f"Telegram API returned unexpected list response: {result}")
                    
                    if not isinstance(result, dict):
                        logger.error(f"❌ Telegram API returned unexpected type: {type(result)} - {result}")
                        raise Exception(f"Telegram API returned unexpected response type: {type(result)}")
                    
                    if result.get("ok"):
                        logger.info(f"✅ Text message sent to Telegram")
                        return result["result"]
                    else:
                        error_description = result.get("description", "Unknown error")
                        raise Exception(f"Telegram API error: {error_description}")
                else:
                    error_text = await response.text()
                    logger.error(f"❌ Failed to send text message: {response.status} - {error_text}")
                    raise Exception(f"Telegram API error: {error_text}")
                    
        except Exception as e:
            logger.error(f"Error sending text message to Telegram: {e}")
            raise
    
    async def send_with_retry(self, send_func, *args, max_retries: int = 3):
        """Send to Telegram with exponential backoff retry"""
        
        for attempt in range(max_retries):
            try:
                result = await send_func(*args)
                # Debug: Check what send_func returns
                logger.info(f"🔍 [DEBUG] send_func return type: {type(result)}")
                logger.info(f"🔍 [DEBUG] send_func return content: {result}")
                
                # Validate result format
                if isinstance(result, list):
                    logger.error(f"❌ send_func returned list instead of dict: {result}")
                    raise Exception(f"Unexpected list response from send_func: {result}")
                
                if not isinstance(result, dict):
                    logger.error(f"❌ send_func returned unexpected type: {type(result)} - {result}")
                    raise Exception(f"Unexpected response type from send_func: {type(result)}")
                
                return result
                
            except Exception as e:
                # Handle the specific list error
                if "'list' object has no attribute 'get'" in str(e):
                    logger.error(f"❌ List error detected: {e}")
                    logger.error(f"❌ This usually means the Telegram API returned a list instead of a dict")
                    raise Exception(f"Telegram API returned unexpected list response: {e}")
                
                error_info = await TelegramErrorHandler.handle_telegram_error(e, {
                    "attempt": attempt + 1,
                    "max_retries": max_retries
                })
                
                if not error_info["retry"] or attempt == max_retries - 1:
                    raise Exception(error_info["message"])
                
                # Wait before retry
                wait_time = error_info.get("retry_delay", 2 ** attempt)
                logger.warning(f"Retrying in {wait_time} seconds (attempt {attempt + 1}/{max_retries})")
                await asyncio.sleep(wait_time)
    
    async def send_text_with_retry(self, text: str, max_retries: int = 3) -> dict:
        """Send text with retry logic"""
        return await self.send_with_retry(self.send_text, text, max_retries=max_retries)
    
    async def send_photo_with_retry(self, photo_path: str, caption: str, max_retries: int = 3) -> dict:
        """Send photo with retry logic"""
        return await self.send_with_retry(self.send_photo, photo_path, caption, max_retries=max_retries)
    
    async def send_video_with_retry(self, video_path: str, caption: str, max_retries: int = 3) -> dict:
        """Send video with retry logic"""
        return await self.send_with_retry(self.send_video, video_path, caption, max_retries=max_retries)

def generate_telegram_caption(
    username: str,
    media_type: str,
    custom_caption: str = None,
    include_link: bool = True
) -> str:
    """Generate Telegram caption for Snapchat media"""
    
    base_caption = custom_caption or f"✨ New {media_type} from @{username}! 📱"
    
    if include_link:
        # Note: Snapchat doesn't have direct profile links like Instagram
        # Could link to Snapchat web profile or use different approach
        base_caption += f"\n\n📱 Snapchat: @{username}"
    
    return base_caption

def generate_bulk_caption(
    username: str,
    media_type: str,
    file_count: int
) -> str:
    """Generate caption for bulk media sending"""
    return f"📸 {file_count} new {media_type} from @{username}! 📱\n\n✨ Snapchat: @{username}"
