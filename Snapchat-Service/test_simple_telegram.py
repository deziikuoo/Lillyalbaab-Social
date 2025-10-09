import asyncio
import os
import sys
from loguru import logger
from dotenv import load_dotenv

# Load environment variables from the server directory
load_dotenv(os.path.join(os.path.dirname(__file__), 'server', '.env'))

# Add the server directory to the path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'server'))

async def test_telegram_response():
    """Test what the Telegram API actually returns"""
    
    import aiohttp
    
    bot_token = os.getenv('TELEGRAM_BOT_TOKEN')
    channel_id = os.getenv('TELEGRAM_CHANNEL_ID')
    
    if not bot_token or not channel_id:
        logger.error("❌ Telegram bot token or channel ID not found")
        return
    
    logger.info(f"🔍 Testing Telegram API with bot token: {bot_token[:10]}...")
    logger.info(f"🔍 Channel ID: {channel_id}")
    
    # Test getMe endpoint first
    async with aiohttp.ClientSession() as session:
        try:
            # Test getMe
            async with session.get(f"https://api.telegram.org/bot{bot_token}/getMe") as response:
                if response.status == 200:
                    result = await response.json()
                    logger.info(f"✅ getMe response type: {type(result)}")
                    logger.info(f"✅ getMe response: {result}")
                else:
                    logger.error(f"❌ getMe failed: {response.status}")
                    return
            
            # Test sendMessage (this should work without a file)
            data = {
                'chat_id': channel_id,
                'text': 'Test message from debug script',
                'parse_mode': 'HTML'
            }
            
            async with session.post(f"https://api.telegram.org/bot{bot_token}/sendMessage", json=data) as response:
                if response.status == 200:
                    result = await response.json()
                    logger.info(f"✅ sendMessage response type: {type(result)}")
                    logger.info(f"✅ sendMessage response: {result}")
                    
                    if result.get("ok"):
                        logger.info(f"✅ Message sent successfully")
                        logger.info(f"✅ Result type: {type(result['result'])}")
                        logger.info(f"✅ Result content: {result['result']}")
                    else:
                        logger.error(f"❌ sendMessage failed: {result}")
                else:
                    error_text = await response.text()
                    logger.error(f"❌ sendMessage failed: {response.status} - {error_text}")
                    
        except Exception as e:
            logger.error(f"❌ Error testing Telegram API: {e}")

if __name__ == "__main__":
    asyncio.run(test_telegram_response())
