import asyncio
import os
import sys
from loguru import logger

# Add the server directory to the path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'server'))

from telegram_manager import TelegramManager

async def test_telegram_sending():
    """Test Telegram sending to identify the list error"""
    
    # Check if Telegram is configured
    bot_token = os.getenv("TELEGRAM_BOT_TOKEN")
    channel_id = os.getenv("TELEGRAM_CHANNEL_ID")
    
    if not bot_token or not channel_id:
        logger.error("❌ Telegram not configured. Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHANNEL_ID")
        return
    
    logger.info(f"🔍 Testing Telegram sending...")
    logger.info(f"🔍 Bot token: {bot_token[:10]}...")
    logger.info(f"🔍 Channel ID: {channel_id}")
    
    # Create Telegram manager
    telegram_manager = TelegramManager(bot_token, channel_id)
    
    # Test connection
    try:
        is_valid = await telegram_manager.validate_connection()
        logger.info(f"✅ Connection validation: {is_valid}")
    except Exception as e:
        logger.error(f"❌ Connection validation failed: {e}")
        return
    
    # Test sending a simple text message first
    try:
        logger.info("🔍 Testing text message sending...")
        result = await telegram_manager.send_text_with_retry("🧪 Test message from Snapchat service")
        logger.info(f"✅ Text message result type: {type(result)}")
        logger.info(f"✅ Text message result: {result}")
    except Exception as e:
        logger.error(f"❌ Text message failed: {e}")
        logger.error(f"❌ Error type: {type(e)}")
        return
    
    # Test sending a photo (if we have a test image)
    test_image_path = "test_image.jpg"
    if os.path.exists(test_image_path):
        try:
            logger.info("🔍 Testing photo sending...")
            result = await telegram_manager.send_photo_with_retry(test_image_path, "🧪 Test photo from Snapchat service")
            logger.info(f"✅ Photo result type: {type(result)}")
            logger.info(f"✅ Photo result: {result}")
        except Exception as e:
            logger.error(f"❌ Photo sending failed: {e}")
            logger.error(f"❌ Error type: {type(e)}")
            logger.error(f"❌ Error details: {str(e)}")
    else:
        logger.warning("⚠️ No test image found, skipping photo test")
    
    # Test sending a video (if we have a test video)
    test_video_path = "test_video.mp4"
    if os.path.exists(test_video_path):
        try:
            logger.info("🔍 Testing video sending...")
            result = await telegram_manager.send_video_with_retry(test_video_path, "🧪 Test video from Snapchat service")
            logger.info(f"✅ Video result type: {type(result)}")
            logger.info(f"✅ Video result: {result}")
        except Exception as e:
            logger.error(f"❌ Video sending failed: {e}")
            logger.error(f"❌ Error type: {type(e)}")
            logger.error(f"❌ Error details: {str(e)}")
    else:
        logger.warning("⚠️ No test video found, skipping video test")

if __name__ == "__main__":
    asyncio.run(test_telegram_sending())
