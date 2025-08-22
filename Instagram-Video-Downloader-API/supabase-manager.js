const { createClient } = require('@supabase/supabase-js');

class SupabaseManager {
  constructor() {
    this.client = null;
    this.isConnected = false;
    
    // Supabase configuration
    this.supabaseUrl = process.env.SUPABASE_URL || 'https://tuvyckzfwdtaieajlszb.supabase.co';
    this.supabaseKey = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR1dnlja3pmd2R0YWllYWpsc3piIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU4MTk3MjIsImV4cCI6MjA3MTM5NTcyMn0.-BNhNk3iO8WguyU6liZfJ4Vxuat5YG7wTHuDRumkbG8';
  }

  async connect() {
    try {
      console.log('🔌 Connecting to Supabase...');
      
      this.client = createClient(this.supabaseUrl, this.supabaseKey);
      
      // Test the connection
      const { data, error } = await this.client.from('processed_posts').select('count').limit(1);
      
      if (error && !error.message.includes('relation "processed_posts" does not exist')) {
        throw error;
      }
      
      this.isConnected = true;
      console.log('✅ Supabase connected successfully');
      
      // Initialize tables
      await this.initializeTables();
      
      return true;
    } catch (error) {
      console.error('❌ Supabase connection failed:', error.message);
      this.isConnected = false;
      return false;
    }
  }

  async disconnect() {
    this.isConnected = false;
    console.log('🔌 Supabase disconnected');
  }

  async initializeTables() {
    try {
      console.log('🔧 Initializing Supabase tables...');
      
      // Create tables using SQL
      const tables = [
        // Processed posts table
        `CREATE TABLE IF NOT EXISTS processed_posts (
          id TEXT PRIMARY KEY,
          username TEXT NOT NULL,
          post_url TEXT,
          post_type TEXT,
          is_pinned BOOLEAN DEFAULT FALSE,
          pinned_at TIMESTAMP WITH TIME ZONE,
          processed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )`,
        
        // Recent posts cache table
        `CREATE TABLE IF NOT EXISTS recent_posts_cache (
          id SERIAL PRIMARY KEY,
          username TEXT NOT NULL,
          post_url TEXT NOT NULL,
          shortcode TEXT,
          is_pinned BOOLEAN DEFAULT FALSE,
          post_order INTEGER,
          cached_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          UNIQUE(username, shortcode)
        )`,
        
        // Cache cleanup log table
        `CREATE TABLE IF NOT EXISTS cache_cleanup_log (
          id SERIAL PRIMARY KEY,
          cleaned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          posts_removed INTEGER DEFAULT 0,
          username TEXT
        )`,
        
        // Processed stories table
        `CREATE TABLE IF NOT EXISTS processed_stories (
          id TEXT PRIMARY KEY,
          username TEXT NOT NULL,
          story_url TEXT,
          story_type TEXT,
          story_id TEXT,
          processed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )`,
        
        // Recent stories cache table
        `CREATE TABLE IF NOT EXISTS recent_stories_cache (
          id SERIAL PRIMARY KEY,
          username TEXT NOT NULL,
          story_url TEXT NOT NULL,
          story_id TEXT,
          story_type TEXT,
          cached_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          UNIQUE(username, story_id)
        )`
      ];

      for (const tableSQL of tables) {
        const { error } = await this.client.rpc('exec_sql', { sql: tableSQL });
        if (error && !error.message.includes('already exists')) {
          console.log(`⚠️ Table creation warning: ${error.message}`);
        }
      }

      // Create indexes for better performance
      const indexes = [
        'CREATE INDEX IF NOT EXISTS idx_processed_posts_username ON processed_posts(username)',
        'CREATE INDEX IF NOT EXISTS idx_processed_posts_username_id ON processed_posts(username, id)',
        'CREATE INDEX IF NOT EXISTS idx_recent_posts_cache_username ON recent_posts_cache(username)',
        'CREATE INDEX IF NOT EXISTS idx_processed_stories_username ON processed_stories(username)',
        'CREATE INDEX IF NOT EXISTS idx_processed_stories_username_story_id ON processed_stories(username, story_id)',
        'CREATE INDEX IF NOT EXISTS idx_recent_stories_cache_username ON recent_stories_cache(username)'
      ];

      for (const indexSQL of indexes) {
        const { error } = await this.client.rpc('exec_sql', { sql: indexSQL });
        if (error && !error.message.includes('already exists')) {
          console.log(`⚠️ Index creation warning: ${error.message}`);
        }
      }

      console.log('✅ Supabase tables and indexes initialized');
    } catch (error) {
      console.error('❌ Supabase initialization failed:', error.message);
    }
  }

  // Cache functions for recent posts
  async getCachedRecentPosts(username) {
    try {
      if (!this.isConnected) {
        console.log('⚠️ Supabase not connected, returning empty cache');
        return [];
      }

      const { data, error } = await this.client
        .from('recent_posts_cache')
        .select('*')
        .eq('username', username)
        .order('is_pinned', { ascending: false })
        .order('post_order', { ascending: true });

      if (error) {
        console.error(`❌ Failed to get cached posts for @${username}:`, error.message);
        return [];
      }

      return data.map(post => ({
        post_url: post.post_url,
        shortcode: post.shortcode,
        is_pinned: post.is_pinned,
        post_order: post.post_order,
        cached_at: post.cached_at
      }));
    } catch (error) {
      console.error(`❌ Failed to get cached posts for @${username}:`, error.message);
      return [];
    }
  }

  async updateRecentPostsCache(username, posts) {
    try {
      if (!this.isConnected) {
        console.log('⚠️ Supabase not connected, skipping cache update');
        return;
      }

      // Remove old cache entries for this user
      const { error: deleteError } = await this.client
        .from('recent_posts_cache')
        .delete()
        .eq('username', username);

      if (deleteError) {
        console.error(`❌ Failed to delete old cache for @${username}:`, deleteError.message);
        return;
      }

      if (posts.length === 0) {
        console.log(`📊 Cache cleared for @${username}`);
        return;
      }

      // Prepare new cache entries
      const cacheEntries = posts.map((post, index) => {
        const shortcode = post.shortcode || post.url.match(/\/(p|reel|tv)\/([^\/]+)\//)?.[2];
        return {
          username,
          post_url: post.url,
          shortcode,
          is_pinned: post.is_pinned || false,
          post_order: index + 1
        };
      });

      // Insert new cache entries
      if (cacheEntries.length > 0) {
        const { error: insertError } = await this.client
          .from('recent_posts_cache')
          .insert(cacheEntries);

        if (insertError) {
          console.error(`❌ Failed to insert cache for @${username}:`, insertError.message);
          return;
        }
      }

      console.log(`✅ Updated Supabase cache with ${posts.length} posts for @${username}`);
    } catch (error) {
      console.error(`❌ Failed to update cache for @${username}:`, error.message);
    }
  }

  // Processed posts functions
  async isPostProcessed(postId, username) {
    try {
      if (!this.isConnected) return false;

      const { data, error } = await this.client
        .from('processed_posts')
        .select('*')
        .eq('id', postId)
        .eq('username', username)
        .single();

      if (error || !data) return false;

      // Check if it's a pinned post (allow re-processing if pinned within 24 hours)
      if (data.is_pinned && data.pinned_at) {
        const pinnedAt = new Date(data.pinned_at);
        const now = new Date();
        const hoursSincePinned = (now - pinnedAt) / (1000 * 60 * 60);

        if (hoursSincePinned < 24) {
          console.log(`📌 Pinned post ${postId} can be re-processed (pinned ${hoursSincePinned.toFixed(1)}h ago)`);
          return false;
        }
      }

      return true;
    } catch (error) {
      console.error(`❌ Failed to check if post ${postId} is processed:`, error.message);
      return false;
    }
  }

  async markPostAsProcessed(postId, username, postUrl, postType, isPinned = false) {
    try {
      if (!this.isConnected) return;

      const postData = {
        id: postId,
        username,
        post_url: postUrl,
        post_type: postType,
        is_pinned: isPinned,
        processed_at: new Date().toISOString()
      };

      if (isPinned) {
        postData.pinned_at = new Date().toISOString();
      }

      const { error } = await this.client
        .from('processed_posts')
        .upsert(postData, { onConflict: 'id' });

      if (error) {
        console.error(`❌ Failed to mark post ${postId} as processed:`, error.message);
        return;
      }

      console.log(`✅ Marked post ${postId} as processed for @${username}`);
    } catch (error) {
      console.error(`❌ Failed to mark post ${postId} as processed:`, error.message);
    }
  }

  // Cache cleanup functions
  async getLastCleanupDate() {
    try {
      if (!this.isConnected) {
        // Return a date 8 days ago to trigger cleanup
        const eightDaysAgo = new Date();
        eightDaysAgo.setDate(eightDaysAgo.getDate() - 8);
        return eightDaysAgo;
      }

      const { data, error } = await this.client
        .from('cache_cleanup_log')
        .select('cleaned_at')
        .order('cleaned_at', { ascending: false })
        .limit(1)
        .single();

      if (error || !data) {
        // Return a date 8 days ago to trigger cleanup
        const eightDaysAgo = new Date();
        eightDaysAgo.setDate(eightDaysAgo.getDate() - 8);
        return eightDaysAgo;
      }

      return new Date(data.cleaned_at);
    } catch (error) {
      console.error('❌ Failed to get last cleanup date:', error.message);
      const eightDaysAgo = new Date();
      eightDaysAgo.setDate(eightDaysAgo.getDate() - 8);
      return eightDaysAgo;
    }
  }

  async updateLastCleanupDate(postsRemoved = 0, username = null) {
    try {
      if (!this.isConnected) return;

      const { error } = await this.client
        .from('cache_cleanup_log')
        .insert({
          cleaned_at: new Date().toISOString(),
          posts_removed: postsRemoved,
          username: username
        });

      if (error) {
        console.error('❌ Failed to update cleanup log:', error.message);
        return;
      }

      console.log(`✅ Updated cleanup log: ${postsRemoved} posts removed`);
    } catch (error) {
      console.error('❌ Failed to update cleanup log:', error.message);
    }
  }

  // Cleanup functions
  async cleanExpiredCache() {
    try {
      if (!this.isConnected) {
        console.log('⚠️ Supabase not connected, skipping cleanup');
        return;
      }

      console.log('🧹 Starting Supabase cache cleanup...');

      const fourWeeksAgo = new Date();
      fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);

      // Clean up old cache entries
      const { error: cacheError } = await this.client
        .from('recent_posts_cache')
        .delete()
        .lt('cached_at', fourWeeksAgo.toISOString());

      // Clean up old processed posts (keep pinned posts)
      const { error: postsError } = await this.client
        .from('processed_posts')
        .delete()
        .lt('processed_at', fourWeeksAgo.toISOString())
        .eq('is_pinned', false);

      if (cacheError) {
        console.error('❌ Cache cleanup error:', cacheError.message);
      }

      if (postsError) {
        console.error('❌ Posts cleanup error:', postsError.message);
      }

      await this.updateLastCleanupDate(0);
      console.log('✅ Supabase cleanup completed');
    } catch (error) {
      console.error('❌ Supabase cleanup failed:', error.message);
    }
  }

  // Health check
  async healthCheck() {
    try {
      if (!this.isConnected) return false;

      const { data, error } = await this.client
        .from('processed_posts')
        .select('count')
        .limit(1);

      return !error;
    } catch (error) {
      console.error('❌ Supabase health check failed:', error.message);
      return false;
    }
  }

  // Story processing functions
  async checkStoryProcessed(username, storyId) {
    try {
      if (!this.isConnected) return false;

      const { data, error } = await this.client
        .from('processed_stories')
        .select('*')
        .eq('username', username)
        .eq('story_id', storyId)
        .single();

      return !error && !!data;
    } catch (error) {
      console.error(`❌ Failed to check if story ${storyId} is processed:`, error.message);
      return false;
    }
  }

  async markStoryProcessed(username, storyUrl, storyType, storyId) {
    try {
      if (!this.isConnected) return;

      const id = `${username}_${storyId}`;
      const storyData = {
        id,
        username,
        story_url: storyUrl,
        story_type: storyType,
        story_id: storyId,
        processed_at: new Date().toISOString()
      };

      const { error } = await this.client
        .from('processed_stories')
        .upsert(storyData, { onConflict: 'id' });

      if (error) {
        console.error(`❌ Failed to mark story ${storyId} as processed:`, error.message);
        return;
      }

      console.log(`✅ Story ${storyId} marked as processed for @${username} (Supabase)`);
    } catch (error) {
      console.error(`❌ Failed to mark story ${storyId} as processed:`, error.message);
    }
  }

  async updateStoriesCache(username, stories) {
    try {
      if (!this.isConnected) return;

      // Remove old cache entries for this user
      const { error: deleteError } = await this.client
        .from('recent_stories_cache')
        .delete()
        .eq('username', username);

      if (deleteError) {
        console.error(`❌ Failed to delete old stories cache for @${username}:`, deleteError.message);
        return;
      }

      if (stories.length === 0) {
        console.log(`📊 Stories cache cleared for @${username}`);
        return;
      }

      // Prepare new cache entries
      const cacheEntries = stories.map(story => ({
        username,
        story_url: story.url,
        story_id: story.storyId,
        story_type: story.storyType
      }));

      // Insert new cache entries
      if (cacheEntries.length > 0) {
        const { error: insertError } = await this.client
          .from('recent_stories_cache')
          .insert(cacheEntries);

        if (insertError) {
          console.error(`❌ Failed to insert stories cache for @${username}:`, insertError.message);
          return;
        }
      }

      console.log(`✅ Stories cache updated for @${username} (${stories.length} entries) (Supabase)`);
    } catch (error) {
      console.error(`❌ Failed to update stories cache for @${username}:`, error.message);
    }
  }

  // Get database stats
  async getStats() {
    try {
      if (!this.isConnected) {
        return {
          connected: false,
          collections: {},
          error: 'Not connected to Supabase'
        };
      }

      const stats = {
        connected: true,
        collections: {}
      };

      const collections = [
        'recent_posts_cache',
        'processed_posts',
        'processed_stories',
        'recent_stories_cache'
      ];

      for (const collectionName of collections) {
        const { count, error } = await this.client
          .from(collectionName)
          .select('*', { count: 'exact', head: true });

        if (error) {
          stats.collections[collectionName] = 0;
        } else {
          stats.collections[collectionName] = count || 0;
        }
      }

      return stats;
    } catch (error) {
      return {
        connected: false,
        error: error.message
      };
    }
  }
}

module.exports = SupabaseManager;
