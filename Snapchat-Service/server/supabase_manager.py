import os
from supabase import create_client, Client
from loguru import logger
from typing import List, Dict, Optional, Any
from datetime import datetime, timedelta
import asyncio

class SnapchatSupabaseManager:
    def __init__(self):
        self.client: Client = None
        self.is_connected = False
        
        # Supabase configuration (same as Instagram)
        self.supabase_url = os.getenv("SUPABASE_URL", "https://tuvyckzfwdtaieajlszb.supabase.co")
        self.supabase_key = os.getenv("SUPABASE_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR1dnlja3pmd2R0YWllYWpsc3piIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU4MTk3MjIsImV4cCI6MjA3MTM5NTcyMn0.-BNhNk3iO8WguyU6liZfJ4Vxuat5YG7wTHuDRumkbG8")
    
    async def connect(self) -> bool:
        """Connect to Supabase"""
        try:
            logger.info("🔌 Connecting to Supabase for Snapchat...")
            self.client = create_client(self.supabase_url, self.supabase_key)
            
            # Test connection
            is_healthy = await self.health_check()
            if is_healthy:
                self.is_connected = True
                logger.info("✅ Snapchat Supabase connected successfully")
                return True
            else:
                logger.error("❌ Snapchat Supabase health check failed")
                return False
                
        except Exception as error:
            logger.error(f"❌ Snapchat Supabase connection failed: {error}")
            self.is_connected = False
            return False
    
    async def disconnect(self):
        """Disconnect from Supabase"""
        self.is_connected = False
        logger.info("🔌 Snapchat Supabase disconnected")
    
    async def health_check(self) -> bool:
        """Check if Supabase connection is healthy"""
        try:
            if not self.client:
                return False
            
            # Simple connection test - just verify we can create a client and it responds
            # Don't test specific tables as they might not exist yet
            try:
                # Test basic client functionality
                # This will fail if the URL or key is invalid
                test_response = self.client.table("_test_connection").select("*").limit(1).execute()
                # If we get here, the connection is working (even if table doesn't exist)
                return True
            except Exception as connection_error:
                # Check if it's a table not found error (which means connection is working)
                error_str = str(connection_error).lower()
                if ("could not find the table" in error_str or 
                    "relation" in error_str and "does not exist" in error_str or
                    "pgrst205" in error_str):
                    logger.info("✅ Supabase connection working (table doesn't exist yet)")
                    return True
                else:
                    logger.error(f"❌ Supabase connection failed: {connection_error}")
                    return False
            
        except Exception as error:
            logger.error(f"❌ Snapchat Supabase health check failed: {error}")
            return False
    
    # Cache functions for recent stories
    async def get_cached_recent_stories(self, username: str) -> List[Dict[str, Any]]:
        """Get cached stories for comparison (Snapchat equivalent of getCachedRecentPosts)"""
        try:
            if not self.is_connected:
                logger.warning("⚠️ Supabase not connected, returning empty cache")
                return []
            
            response = self.client.table("snapchat_recent_stories_cache").select("*").eq("username", username).order("story_order").execute()
            
            # No need to check response.error as Supabase client handles errors differently
            
            return [
                {
                    "story_url": story["story_url"],
                    "snap_id": story["snap_id"],
                    "story_type": story["story_type"],
                    "story_order": story["story_order"],
                    "cached_at": story["cached_at"]
                }
                for story in response.data
            ]
            
        except Exception as error:
            logger.error(f"❌ Failed to get cached stories for @{username}: {error}")
            return []
    
    async def update_recent_stories_cache(self, username: str, stories: List[Dict[str, Any]]) -> bool:
        """Update stories cache (Snapchat equivalent of updateRecentPostsCache)"""
        try:
            if not self.is_connected:
                logger.warning("⚠️ Supabase not connected, skipping cache update")
                return False
            
            # Remove old cache entries for this user
            self.client.table("snapchat_recent_stories_cache").delete().eq("username", username).execute()
            
            if not stories:
                logger.info(f"📊 Stories cache cleared for @{username}")
                return True
            
            # Prepare new cache entries
            cache_entries = []
            for i, story in enumerate(stories):
                cache_entries.append({
                    "username": username,
                    "story_url": story["url"],
                    "snap_id": story.get("snap_id"),
                    "story_type": story.get("type", "photo"),
                    "story_order": i + 1
                })
            
            # Insert new cache entries
            if cache_entries:
                self.client.table("snapchat_recent_stories_cache").insert(cache_entries).execute()
            
            logger.info(f"✅ Updated Supabase stories cache with {len(stories)} stories for @{username}")
            return True
            
        except Exception as error:
            logger.error(f"❌ Failed to update stories cache for @{username}: {error}")
            return False
    
    # Story processing functions
    async def is_story_processed(self, snap_id: str, username: str) -> bool:
        """Check if story was already processed (Snapchat equivalent of isPostProcessed)"""
        try:
            if not self.is_connected:
                return False
            
            response = self.client.table("snapchat_processed_stories").select("*").eq("snap_id", snap_id).eq("username", username).execute()
            
            # No need to check response.error as Supabase client handles errors differently
            
            return len(response.data) > 0
            
        except Exception as error:
            logger.error(f"❌ Failed to check if story {snap_id} is processed: {error}")
            return False
    
    async def mark_story_processed(self, snap_id: str, username: str, story_url: str, story_type: str) -> bool:
        """Mark story as processed (Snapchat equivalent of markPostAsProcessed)"""
        try:
            if not self.is_connected:
                return False
            
            story_data = {
                "id": f"{username}_{snap_id}",
                "username": username,
                "story_url": story_url,
                "story_type": story_type,
                "snap_id": snap_id,
                "processed_at": datetime.now().isoformat()
            }
            
            self.client.table("snapchat_processed_stories").upsert(story_data).execute()
            
            logger.info(f"✅ Marked story {snap_id} as processed for @{username}")
            return True
            
        except Exception as error:
            logger.error(f"❌ Failed to mark story {snap_id} as processed: {error}")
            return False
    
    # Cache cleanup functions
    async def clean_expired_snapchat_cache(self) -> Dict[str, int]:
        """Clean expired Snapchat cache (complete wipe every 4 weeks)"""
        try:
            if not self.is_connected:
                logger.warning("⚠️ Supabase not connected, skipping cleanup")
                return {"stories_removed": 0, "processed_removed": 0}
            
            logger.info("🧹 Starting Snapchat Supabase cache cleanup...")
            
            four_weeks_ago = datetime.now() - timedelta(days=28)
            
            # Complete wipe of stories cache (not selective like Instagram)
            cache_response = self.client.table("snapchat_recent_stories_cache").delete().lt("cached_at", four_weeks_ago.isoformat()).execute()
            
            # Complete wipe of processed stories (not selective like Instagram)
            processed_response = self.client.table("snapchat_processed_stories").delete().lt("processed_at", four_weeks_ago.isoformat()).execute()
            
            stories_removed = len(cache_response.data) if cache_response.data else 0
            processed_removed = len(processed_response.data) if processed_response.data else 0
            
            # Log cleanup
            self.update_snapchat_cleanup_log(stories_removed + processed_removed)
            
            logger.info(f"✅ Snapchat cache cleanup completed: {stories_removed} stories, {processed_removed} processed removed")
            return {"stories_removed": stories_removed, "processed_removed": processed_removed}
            
        except Exception as error:
            logger.error(f"❌ Snapchat cache cleanup failed: {error}")
            return {"stories_removed": 0, "processed_removed": 0}
    
    async def update_snapchat_cleanup_log(self, stories_removed: int) -> None:
        """Update cleanup log for Snapchat"""
        try:
            self.client.table("snapchat_cache_cleanup_log").insert({
                "stories_removed": stories_removed,
                "cleaned_at": datetime.now().isoformat()
            }).execute()
            
        except Exception as error:
            logger.error(f"❌ Failed to update Snapchat cleanup log: {error}")
    
    # Cache statistics
    def get_snapchat_cache_stats(self) -> Dict[str, Any]:
        """Get Snapchat cache statistics"""
        try:
            if not self.is_connected:
                return {"connected": False, "error": "Not connected to Supabase"}
            
            # Get counts using a more robust approach
            def safe_get_count(table_name: str) -> int:
                try:
                    response = self.client.table(table_name).select("*", count="exact").execute()
                    return response.count if hasattr(response, 'count') and response.count is not None else 0
                except Exception as e:
                    logger.warning(f"⚠️ Failed to get count for {table_name}: {e}")
                    return 0
            
            cache_count = safe_get_count("snapchat_recent_stories_cache")
            processed_count = safe_get_count("snapchat_processed_stories")
            cleanup_count = safe_get_count("snapchat_cache_cleanup_log")
            
            stats = {
                "connected": True,
                "collections": {
                    "snapchat_recent_stories_cache": cache_count,
                    "snapchat_processed_stories": processed_count,
                    "snapchat_cache_cleanup_log": cleanup_count
                },
                "last_cleanup": None
            }
            
            # Get last cleanup date
            if cleanup_count > 0:
                try:
                    last_cleanup_response = self.client.table("snapchat_cache_cleanup_log").select("cleaned_at").order("cleaned_at", desc=True).limit(1).execute()
                    if last_cleanup_response.data:
                        stats["last_cleanup"] = last_cleanup_response.data[0]["cleaned_at"]
                except Exception as e:
                    logger.warning(f"⚠️ Failed to get last cleanup date: {e}")
            
            return stats
            
        except Exception as error:
            logger.error(f"❌ Failed to get Snapchat cache stats: {error}")
            return {"connected": False, "error": str(error)}
    
    # Get last cleanup date
    async def get_last_cleanup_date(self) -> Optional[str]:
        """Get the last cleanup date for Snapchat"""
        try:
            if not self.is_connected:
                return None
            
            response = self.client.table("snapchat_cache_cleanup_log").select("cleaned_at").order("cleaned_at", desc=True).limit(1).execute()
            
            if response.data:
                return response.data[0]["cleaned_at"]
            return None
            
        except Exception as error:
            logger.error(f"❌ Failed to get last cleanup date: {error}")
            return None

    # Clear cache for specific user (Supabase version)
    async def clear_user_cache(self, username: str) -> int:
        """Clear cache for specific user (Supabase version)"""
        try:
            if not self.is_connected:
                logger.warning("⚠️ Supabase not connected, cannot clear cache")
                return 0
            
            response = self.client.table("snapchat_recent_stories_cache").delete().eq("username", username).execute()
            
            deleted_count = len(response.data) if response.data else 0
            logger.info(f"🗑️ Cleared cache for @{username} ({deleted_count} entries) (Supabase)")
            return deleted_count
            
        except Exception as error:
            logger.error(f"❌ Error clearing cache for @{username}: {error}")
            return 0

    # Clear processed stories for specific user (Supabase version)
    async def clear_user_processed_stories(self, username: str) -> int:
        """Clear processed stories for specific user (Supabase version)"""
        try:
            if not self.is_connected:
                logger.warning("⚠️ Supabase not connected, cannot clear processed stories")
                return 0
            
            response = self.client.table("snapchat_processed_stories").delete().eq("username", username).execute()
            
            deleted_count = len(response.data) if response.data else 0
            logger.info(f"🗑️ Cleared processed stories for @{username} ({deleted_count} entries) (Supabase)")
            return deleted_count
            
        except Exception as error:
            logger.error(f"❌ Error clearing processed stories for @{username}: {error}")
            return 0

    # Clear all data for specific user (cache + processed stories) (Supabase version)
    async def clear_user_data(self, username: str) -> Dict[str, int]:
        """Clear all data for specific user (cache + processed stories) (Supabase version)"""
        try:
            if not self.is_connected:
                logger.warning("⚠️ Supabase not connected, cannot clear user data")
                return {"processed_deleted": 0, "cache_deleted": 0}
            
            # Clear both cache and processed stories concurrently
            cache_task = self.clear_user_cache(username)
            processed_task = self.clear_user_processed_stories(username)
            
            cache_deleted, processed_deleted = await asyncio.gather(cache_task, processed_task)
            
            logger.info(f"🧹 Cleared all data for @{username} (processed: {processed_deleted}, cache: {cache_deleted}) (Supabase)")
            return {"processed_deleted": processed_deleted, "cache_deleted": cache_deleted}
            
        except Exception as error:
            logger.error(f"❌ Error clearing user data for @{username}: {error}")
            return {"processed_deleted": 0, "cache_deleted": 0}
