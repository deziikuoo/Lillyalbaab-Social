#!/usr/bin/env python3
"""
Test script to check Supabase table status and functionality
"""

import asyncio
import os
import sys
from datetime import datetime
from loguru import logger

# Add the server directory to the path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'server'))

from supabase_manager import SnapchatSupabaseManager

async def test_supabase_tables():
    """Test Supabase table functionality"""
    
    # Initialize Supabase manager
    supabase_manager = SnapchatSupabaseManager()
    
    # Test connection
    logger.info("🔌 Testing Supabase connection...")
    connected = await supabase_manager.connect()
    
    if not connected:
        logger.error("❌ Failed to connect to Supabase")
        return False
    
    logger.info("✅ Connected to Supabase successfully")
    
    # Test table existence
    logger.info("📊 Testing table existence...")
    
    try:
        # Test snapchat_recent_stories_cache table
        logger.info("Testing snapchat_recent_stories_cache table...")
        response = supabase_manager.client.table("snapchat_recent_stories_cache").select("*").limit(1).execute()
        logger.info("✅ snapchat_recent_stories_cache table exists")
    except Exception as e:
        logger.error(f"❌ snapchat_recent_stories_cache table does not exist: {e}")
        return False
    
    try:
        # Test snapchat_processed_stories table
        logger.info("Testing snapchat_processed_stories table...")
        response = supabase_manager.client.table("snapchat_processed_stories").select("*").limit(1).execute()
        logger.info("✅ snapchat_processed_stories table exists")
    except Exception as e:
        logger.error(f"❌ snapchat_processed_stories table does not exist: {e}")
        return False
    
    try:
        # Test snapchat_cache_cleanup_log table
        logger.info("Testing snapchat_cache_cleanup_log table...")
        response = supabase_manager.client.table("snapchat_cache_cleanup_log").select("*").limit(1).execute()
        logger.info("✅ snapchat_cache_cleanup_log table exists")
    except Exception as e:
        logger.error(f"❌ snapchat_cache_cleanup_log table does not exist: {e}")
        return False
    
    # Test cache operations
    logger.info("📊 Testing cache operations...")
    
    test_username = "test_user"
    test_stories = [
        {
            "url": "https://example.com/story1.jpg",
            "type": "photo",
            "snap_id": "test_snap_1",
            "timestamp": int(datetime.now().timestamp())
        },
        {
            "url": "https://example.com/story2.mp4",
            "type": "video",
            "snap_id": "test_snap_2",
            "timestamp": int(datetime.now().timestamp())
        }
    ]
    
    # Test updating cache
    logger.info("Testing cache update...")
    success = await supabase_manager.update_recent_stories_cache(test_username, test_stories)
    if success:
        logger.info("✅ Cache update successful")
    else:
        logger.error("❌ Cache update failed")
        return False
    
    # Test getting cached stories
    logger.info("Testing cache retrieval...")
    cached_stories = await supabase_manager.get_cached_recent_stories(test_username)
    logger.info(f"✅ Retrieved {len(cached_stories)} cached stories")
    
    # Test marking story as processed
    logger.info("Testing story processing...")
    success = await supabase_manager.mark_story_processed("test_snap_1", test_username, "https://example.com/story1.jpg", "photo")
    if success:
        logger.info("✅ Story processing successful")
    else:
        logger.error("❌ Story processing failed")
        return False
    
    # Test checking if story is processed
    logger.info("Testing processed story check...")
    is_processed = await supabase_manager.is_story_processed("test_snap_1", test_username)
    if is_processed:
        logger.info("✅ Story processed check successful")
    else:
        logger.error("❌ Story processed check failed")
        return False
    
    # Test cache statistics
    logger.info("Testing cache statistics...")
    stats = supabase_manager.get_snapchat_cache_stats()
    logger.info(f"✅ Cache stats: {stats}")
    
    # Clean up test data
    logger.info("🧹 Cleaning up test data...")
    await supabase_manager.clear_user_data(test_username)
    logger.info("✅ Test data cleaned up")
    
    logger.info("🎉 All Supabase tests passed!")
    return True

if __name__ == "__main__":
    # Configure logging
    logger.remove()
    logger.add(
        sys.stdout,
        format="{time:HH:mm:ss} | {level:<8} | {message}",
        level="INFO",
        colorize=True
    )
    
    # Run tests
    success = asyncio.run(test_supabase_tables())
    
    if success:
        logger.info("✅ Supabase is working correctly!")
        sys.exit(0)
    else:
        logger.error("❌ Supabase has issues that need to be fixed!")
        sys.exit(1)
