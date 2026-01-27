const { createClient } = require("@supabase/supabase-js");

class SupabaseManager {
  constructor() {
    this.client = null;
    this.isConnected = false;

    // Supabase configuration
    this.supabaseUrl =
      process.env.SUPABASE_URL || "https://tuvyckzfwdtaieajlszb.supabase.co";
    this.supabaseKey =
      process.env.SUPABASE_KEY ||
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR1dnlja3pmd2R0YWllYWpsc3piIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU4MTk3MjIsImV4cCI6MjA3MTM5NTcyMn0.-BNhNk3iO8WguyU6liZfJ4Vxuat5YG7wTHuDRumkbG8";
    
    // Project namespace for data separation (default: 'tyla' for backward compatibility)
    this.projectNamespace = process.env.PROJECT_NAMESPACE || 'tyla';
    console.log(`📁 Using project namespace: ${this.projectNamespace}`);
  }

  async connect() {
    try {
      console.log("🔌 Connecting to Supabase...");

      this.client = createClient(this.supabaseUrl, this.supabaseKey);

      // Test the connection by checking if client is properly initialized
      if (!this.client) {
        throw new Error("Supabase client not initialized");
      }

      // Actually test the connection with a timeout
      try {
        const testPromise = this.client
          .from("_connection_test")
          .select("*")
          .limit(1)
          .maybeSingle();
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Connection timeout")), 5000)
        );

        await Promise.race([testPromise, timeoutPromise]);
      } catch (testError) {
        // Network errors (fetch failed, DNS errors, etc.) mean we can't connect
        const errorMsg = testError.message || String(testError);
        if (
          errorMsg.includes("fetch failed") ||
          errorMsg.includes("getaddrinfo") ||
          errorMsg.includes("ECONNREFUSED") ||
          errorMsg.includes("ENOTFOUND") ||
          errorMsg.includes("timeout")
        ) {
          console.error(`❌ Supabase network connection failed: ${errorMsg}`);
          this.isConnected = false;
          return false;
        }
        // Other errors (like table not found) are OK - connection works
      }

      this.isConnected = true;
      console.log("✅ Supabase connected successfully");

      // Initialize tables
      await this.initializeTables();

      return true;
    } catch (error) {
      console.error("❌ Supabase connection failed:", error.message);
      this.isConnected = false;
      return false;
    }
  }

  async disconnect() {
    this.isConnected = false;
    console.log("🔌 Supabase disconnected");
  }

  async initializeTables() {
    try {
      console.log("🔧 Initializing Supabase tables...");

      // Note: Tables need to be created manually in Supabase dashboard
      // See supabase-tables.sql file for the SQL commands to run
      console.log(
        "ℹ️ Tables will be created manually using supabase-tables.sql"
      );
      console.log("✅ Supabase connection test successful");
    } catch (error) {
      console.error("❌ Supabase initialization failed:", error.message);
    }
  }

  // Helper method to wrap Supabase calls with error handling
  async _safeSupabaseCall(operation, errorContext = "") {
    try {
      if (!this.isConnected) {
        return { error: { message: "Not connected" }, data: null };
      }
      return await operation();
    } catch (error) {
      const errorMsg = error.message || String(error);
      // Check for network errors
      if (
        errorMsg.includes("fetch failed") ||
        errorMsg.includes("getaddrinfo") ||
        errorMsg.includes("ECONNREFUSED") ||
        errorMsg.includes("ENOTFOUND") ||
        errorMsg.includes("timeout")
      ) {
        console.error(
          `❌ Supabase network error${
            errorContext ? ` in ${errorContext}` : ""
          }: ${errorMsg}`
        );
        // Mark as disconnected on network errors
        this.isConnected = false;
        return {
          error: { message: "Network error", networkError: true },
          data: null,
        };
      }
      // Re-throw other errors
      throw error;
    }
  }

  // Cache functions for recent posts
  async getCachedRecentPosts(username) {
    try {
      if (!this.isConnected) {
        console.log("⚠️ Supabase not connected, returning empty cache");
        return [];
      }

      const result = await this._safeSupabaseCall(
        () =>
          this.client
            .from("recent_posts_cache")
            .select("*")
            .eq("project_namespace", this.projectNamespace)
            .eq("username", username)
            .order("is_pinned", { ascending: false })
            .order("post_order", { ascending: true }),
        `getCachedRecentPosts(${username})`
      );

      const { data, error } = result;

      if (error) {
        // Network errors - already logged, return empty
        if (error.networkError) {
          return [];
        }
        // Check if it's a table not found error
        if (
          error.message.includes("Could not find the table") ||
          error.message.includes("relation") ||
          error.message.includes("does not exist")
        ) {
          console.log(
            `⚠️ Supabase table 'recent_posts_cache' does not exist, returning empty cache`
          );
          return [];
        }
        console.error(
          `❌ Failed to get cached posts for @${username}:`,
          error.message
        );
        return [];
      }

      return data.map((post) => ({
        post_url: post.post_url,
        shortcode: post.shortcode,
        is_pinned: post.is_pinned,
        post_order: post.post_order,
        cached_at: post.cached_at,
      }));
    } catch (error) {
      console.error(
        `❌ Failed to get cached posts for @${username}:`,
        error.message
      );
      return [];
    }
  }

  async updateRecentPostsCache(username, posts) {
    try {
      if (!this.isConnected) {
        console.log("⚠️ Supabase not connected, skipping cache update");
        return;
      }

      // Remove old cache entries for this user and namespace
      const { error: deleteError } = await this.client
        .from("recent_posts_cache")
        .delete()
        .eq("project_namespace", this.projectNamespace)
        .eq("username", username);

      if (deleteError) {
        // Check if it's a table not found error
        if (
          deleteError.message.includes("Could not find the table") ||
          deleteError.message.includes("relation") ||
          deleteError.message.includes("does not exist")
        ) {
          console.log(
            `⚠️ Supabase table 'recent_posts_cache' does not exist, skipping cache update`
          );
          return;
        }
        console.error(
          `❌ Failed to delete old cache for @${username}:`,
          deleteError.message
        );
        return;
      }

      if (posts.length === 0) {
        console.log(`📊 Cache cleared for @${username}`);
        return;
      }

      // Prepare new cache entries
      const cacheEntries = posts.map((post, index) => {
        const shortcode =
          post.shortcode || post.url.match(/\/(p|reel|tv)\/([^\/]+)\//)?.[2];
        return {
          project_namespace: this.projectNamespace,
          username,
          post_url: post.url,
          shortcode,
          is_pinned: post.is_pinned || false,
          post_order: index + 1,
        };
      });

      // Insert new cache entries
      if (cacheEntries.length > 0) {
        const { error: insertError } = await this.client
          .from("recent_posts_cache")
          .insert(cacheEntries);

        if (insertError) {
          // Check if it's a table not found error
          if (
            insertError.message.includes("Could not find the table") ||
            insertError.message.includes("relation") ||
            insertError.message.includes("does not exist")
          ) {
            console.log(
              `⚠️ Supabase table 'recent_posts_cache' does not exist, skipping cache update`
            );
            return;
          }
          console.error(
            `❌ Failed to insert cache for @${username}:`,
            insertError.message
          );
          return;
        }
      }

      console.log(
        `✅ Updated Supabase cache with ${posts.length} posts for @${username}`
      );
    } catch (error) {
      console.error(
        `❌ Failed to update cache for @${username}:`,
        error.message
      );
    }
  }

  // Processed posts functions
  async isPostProcessed(postId, username) {
    try {
      if (!this.isConnected) return false;

      const { data, error } = await this.client
        .from("processed_posts")
        .select("*")
        .eq("project_namespace", this.projectNamespace)
        .eq("id", postId)
        .eq("username", username)
        .single();

      if (error) {
        // Check if it's a table not found error
        if (
          error.message.includes("Could not find the table") ||
          error.message.includes("relation") ||
          error.message.includes("does not exist")
        ) {
          console.log(
            `⚠️ Supabase table 'processed_posts' does not exist, treating as not processed`
          );
          return false;
        }
        return false;
      }

      if (!data) return false;

      // Check if it's a pinned post (allow re-processing if pinned within 24 hours)
      if (data.is_pinned && data.pinned_at) {
        const pinnedAt = new Date(data.pinned_at);
        const now = new Date();
        const hoursSincePinned = (now - pinnedAt) / (1000 * 60 * 60);

        if (hoursSincePinned < 24) {
          console.log(
            `📌 Pinned post ${postId} can be re-processed (pinned ${hoursSincePinned.toFixed(
              1
            )}h ago)`
          );
          return false;
        }
      }

      return true;
    } catch (error) {
      console.error(
        `❌ Failed to check if post ${postId} is processed:`,
        error.message
      );
      return false;
    }
  }

  async markPostAsProcessed(
    postId,
    username,
    postUrl,
    postType,
    isPinned = false
  ) {
    try {
      if (!this.isConnected) return;

      const postData = {
        id: postId,
        project_namespace: this.projectNamespace,
        username,
        post_url: postUrl,
        post_type: postType,
        is_pinned: isPinned,
        processed_at: new Date().toISOString(),
      };

      if (isPinned) {
        postData.pinned_at = new Date().toISOString();
      }

      const result = await this._safeSupabaseCall(
        () =>
          this.client
            .from("processed_posts")
            .upsert(postData, { onConflict: "id" }),
        `markPostAsProcessed(${postId})`
      );

      const { error } = result;

      if (error) {
        // Network errors - already logged, silently fail
        if (error.networkError) {
          return;
        }
        // Check if it's a table not found error
        if (
          error.message.includes("Could not find the table") ||
          error.message.includes("relation") ||
          error.message.includes("does not exist")
        ) {
          console.log(
            `⚠️ Supabase table 'processed_posts' does not exist, skipping post marking`
          );
          return;
        }
        console.error(
          `❌ Failed to mark post ${postId} as processed:`,
          error.message
        );
        return;
      }

      console.log(`✅ Marked post ${postId} as processed for @${username}`);
    } catch (error) {
      console.error(
        `❌ Failed to mark post ${postId} as processed:`,
        error.message
      );
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
        .from("cache_cleanup_log")
        .select("cleaned_at")
        .eq("project_namespace", this.projectNamespace)
        .order("cleaned_at", { ascending: false })
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
      console.error("❌ Failed to get last cleanup date:", error.message);
      const eightDaysAgo = new Date();
      eightDaysAgo.setDate(eightDaysAgo.getDate() - 8);
      return eightDaysAgo;
    }
  }

  async updateLastCleanupDate(postsRemoved = 0, username = null) {
    try {
      if (!this.isConnected) return;

      const { error } = await this.client.from("cache_cleanup_log").insert({
        project_namespace: this.projectNamespace,
        cleaned_at: new Date().toISOString(),
        posts_removed: postsRemoved,
        username: username,
      });

      if (error) {
        console.error("❌ Failed to update cleanup log:", error.message);
        return;
      }

      console.log(`✅ Updated cleanup log: ${postsRemoved} posts removed`);
    } catch (error) {
      console.error("❌ Failed to update cleanup log:", error.message);
    }
  }

  // Cleanup functions
  async cleanExpiredCache() {
    try {
      if (!this.isConnected) {
        console.log("⚠️ Supabase not connected, skipping cleanup");
        return;
      }

      console.log("🧹 Starting Supabase cache cleanup...");

      const twoWeeksAgo = new Date();
      twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

      // Clean up old cache entries for this namespace
      const { error: cacheError } = await this.client
        .from("recent_posts_cache")
        .delete()
        .eq("project_namespace", this.projectNamespace)
        .lt("cached_at", twoWeeksAgo.toISOString());

      // Clean up old processed posts (keep pinned posts) for this namespace
      const { error: postsError } = await this.client
        .from("processed_posts")
        .delete()
        .eq("project_namespace", this.projectNamespace)
        .lt("processed_at", twoWeeksAgo.toISOString())
        .eq("is_pinned", false);

      if (cacheError) {
        console.error("❌ Cache cleanup error:", cacheError.message);
      }

      if (postsError) {
        console.error("❌ Posts cleanup error:", postsError.message);
      }

      await this.updateLastCleanupDate(0);
      console.log("✅ Supabase cleanup completed");
    } catch (error) {
      console.error("❌ Supabase cleanup failed:", error.message);
    }
  }

  // Health check
  async healthCheck() {
    try {
      if (!this.isConnected) return false;

      const { data, error } = await this.client
        .from("processed_posts")
        .select("count")
        .limit(1);

      return !error;
    } catch (error) {
      console.error("❌ Supabase health check failed:", error.message);
      return false;
    }
  }

  // Story processing functions
  async checkStoryProcessed(username, storyId) {
    try {
      if (!this.isConnected) return false;

      const { data, error } = await this.client
        .from("processed_stories")
        .select("*")
        .eq("project_namespace", this.projectNamespace)
        .eq("username", username)
        .eq("story_id", storyId)
        .single();

      return !error && !!data;
    } catch (error) {
      console.error(
        `❌ Failed to check if story ${storyId} is processed:`,
        error.message
      );
      return false;
    }
  }

  async markStoryProcessed(username, storyUrl, storyType, storyId) {
    try {
      if (!this.isConnected) return;

      const id = `${username}_${storyId}`;
      const storyData = {
        id,
        project_namespace: this.projectNamespace,
        username,
        story_url: storyUrl,
        story_type: storyType,
        story_id: storyId,
        processed_at: new Date().toISOString(),
      };

      const result = await this._safeSupabaseCall(
        () =>
          this.client
            .from("processed_stories")
            .upsert(storyData, { onConflict: "id" }),
        `markStoryProcessed(${storyId})`
      );

      const { error } = result;

      if (error) {
        // Network errors - already logged, rethrow so caller knows it failed
        if (error.networkError) {
          throw new Error("Network error: Supabase connection failed");
        }
        console.error(
          `❌ Failed to mark story ${storyId} as processed:`,
          error.message
        );
        return;
      }

      console.log(
        `✅ Story ${storyId} marked as processed for @${username} (Supabase)`
      );
    } catch (error) {
      console.error(
        `❌ Failed to mark story ${storyId} as processed:`,
        error.message
      );
      throw error; // Re-throw so caller can handle it
    }
  }

  async updateStoriesCache(username, stories) {
    try {
      if (!this.isConnected) return;

      // Remove old cache entries for this user and namespace
      const deleteResult = await this._safeSupabaseCall(
        () =>
          this.client
            .from("recent_stories_cache")
            .delete()
            .eq("project_namespace", this.projectNamespace)
            .eq("username", username),
        `updateStoriesCache delete(${username})`
      );

      if (deleteResult.error) {
        // Network errors - already logged, return early
        if (deleteResult.error.networkError) {
          return;
        }
        console.error(
          `❌ Failed to delete old stories cache for @${username}:`,
          deleteResult.error.message
        );
        return;
      }

      if (stories.length === 0) {
        console.log(`📊 Stories cache cleared for @${username}`);
        return;
      }

      // Prepare new cache entries
      const cacheEntries = stories.map((story) => ({
        project_namespace: this.projectNamespace,
        username,
        story_url: story.url,
        story_id: story.storyId,
        story_type: story.storyType,
      }));

      // Insert new cache entries
      if (cacheEntries.length > 0) {
        const insertResult = await this._safeSupabaseCall(
          () => this.client.from("recent_stories_cache").insert(cacheEntries),
          `updateStoriesCache insert(${username})`
        );

        if (insertResult.error) {
          // Network errors - already logged, return early
          if (insertResult.error.networkError) {
            return;
          }
          console.error(
            `❌ Failed to insert stories cache for @${username}:`,
            insertResult.error.message
          );
          return;
        }
      }

      console.log(
        `✅ Stories cache updated for @${username} (${stories.length} entries) (Supabase)`
      );
    } catch (error) {
      console.error(
        `❌ Failed to update stories cache for @${username}:`,
        error.message
      );
    }
  }

  // Get database stats
  async getStats() {
    try {
      if (!this.isConnected) {
        return {
          connected: false,
          collections: {},
          error: "Not connected to Supabase",
        };
      }

      const stats = {
        connected: true,
        collections: {},
      };

      const collections = [
        "recent_posts_cache",
        "processed_posts",
        "processed_stories",
        "recent_stories_cache",
      ];

      for (const collectionName of collections) {
        const { count, error } = await this.client
          .from(collectionName)
          .select("*", { count: "exact", head: true });

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
        error: error.message,
      };
    }
  }

  // Get total row count for storage-based cleanup checking
  async getTotalRowCount() {
    try {
      if (!this.isConnected) {
        return 0;
      }

      const tables = [
        "recent_posts_cache",
        "processed_posts",
        "processed_stories",
        "recent_stories_cache",
      ];

      let totalCount = 0;
      for (const tableName of tables) {
        const result = await this._safeSupabaseCall(
          () =>
            this.client
              .from(tableName)
              .select("*", { count: "exact", head: true }),
          `getTotalRowCount(${tableName})`
        );

        if (!result.error && result.data?.count !== undefined) {
          totalCount += result.data.count;
        } else if (result.count !== undefined) {
          totalCount += result.count;
        }
      }

      return totalCount;
    } catch (error) {
      console.error(`❌ Failed to get total row count: ${error.message}`);
      return 0;
    }
  }

  // Storage-based cleanup for Supabase (keeps last 8 posts per user)
  async performStorageCleanup() {
    try {
      if (!this.isConnected) {
        console.log("⚠️ Supabase not connected, skipping storage cleanup");
        return { cacheRemoved: 0, processedRemoved: 0 };
      }

      console.log("🧹 Starting Supabase storage-based cleanup...");

      // Get all unique usernames for this namespace
      const { data: users, error: usersError } = await this.client
        .from("recent_posts_cache")
        .select("username")
        .eq("project_namespace", this.projectNamespace)
        .then((result) => {
          if (result.error) throw result.error;
          const uniqueUsers = [...new Set(result.data.map((u) => u.username))];
          return { data: uniqueUsers, error: null };
        })
        .catch((err) => ({ data: [], error: err }));

      if (usersError || !users || users.length === 0) {
        console.log("📊 No users found for storage cleanup");
        return { cacheRemoved: 0, processedRemoved: 0 };
      }

      let totalCacheRemoved = 0;
      let totalProcessedRemoved = 0;

      // Clean up cache for each user (keep last 8)
      for (const username of users) {
        // Get last 8 cache entries to keep
        const { data: keepCache, error: keepCacheError } = await this.client
          .from("recent_posts_cache")
          .select("shortcode")
          .eq("project_namespace", this.projectNamespace)
          .eq("username", username)
          .order("cached_at", { ascending: false })
          .limit(8);

        if (!keepCacheError && keepCache && keepCache.length > 0) {
          const keepShortcodes = keepCache.map((p) => p.shortcode);

          // Get all cache entries for this user and namespace
          const { data: allCache, error: allCacheError } = await this.client
            .from("recent_posts_cache")
            .select("shortcode")
            .eq("project_namespace", this.projectNamespace)
            .eq("username", username);

          if (!allCacheError && allCache) {
            // Delete entries not in the keep list
            const toDelete = allCache.filter(
              (p) => !keepShortcodes.includes(p.shortcode)
            );

            if (toDelete.length > 0) {
              const deleteShortcodes = toDelete.map((p) => p.shortcode);
              // Delete using .in() with the shortcodes to delete
              const { data: deletedCache, error: deleteCacheError } =
                await this.client
                  .from("recent_posts_cache")
                  .delete()
                  .eq("project_namespace", this.projectNamespace)
                  .eq("username", username)
                  .in("shortcode", deleteShortcodes)
                  .select();

              if (!deleteCacheError) {
                totalCacheRemoved += deletedCache?.length || 0;
                console.log(
                  `   🗑️ @${username}: Kept last 8 cache entries, removed ${toDelete.length}`
                );
              }
            } else {
              console.log(
                `   ✅ @${username}: Already at limit (${keepCache.length} entries)`
              );
            }
          }
        } else if (!keepCacheError) {
          // No cache entries to keep, delete all for this namespace
          const { data: deletedAll, error: deleteAllError } = await this.client
            .from("recent_posts_cache")
            .delete()
            .eq("project_namespace", this.projectNamespace)
            .eq("username", username)
            .select();

          if (!deleteAllError) {
            totalCacheRemoved += deletedAll?.length || 0;
            console.log(`   🗑️ @${username}: Cleared all cache entries`);
          }
        }

        // Get last 8 processed posts to keep (non-pinned) for this namespace
        const { data: keepProcessed, error: keepProcessedError } =
          await this.client
            .from("processed_posts")
            .select("id")
            .eq("project_namespace", this.projectNamespace)
            .eq("username", username)
            .eq("is_pinned", false)
            .order("processed_at", { ascending: false })
            .limit(8);

        if (!keepProcessedError && keepProcessed && keepProcessed.length > 0) {
          const keepIds = keepProcessed.map((p) => p.id);

          // Get all processed posts for this user and namespace (non-pinned)
          const { data: allProcessed, error: allProcessedError } =
            await this.client
              .from("processed_posts")
              .select("id")
              .eq("project_namespace", this.projectNamespace)
              .eq("username", username)
              .eq("is_pinned", false);

          if (!allProcessedError && allProcessed) {
            // Delete entries not in the keep list
            const toDelete = allProcessed.filter(
              (p) => !keepIds.includes(p.id)
            );

            if (toDelete.length > 0) {
              const deleteIds = toDelete.map((p) => p.id);
              // Delete using .in() with the IDs to delete
              const { data: deletedProcessed, error: deleteProcessedError } =
                await this.client
                  .from("processed_posts")
                  .delete()
                  .eq("project_namespace", this.projectNamespace)
                  .eq("username", username)
                  .eq("is_pinned", false)
                  .in("id", deleteIds)
                  .select();

              if (!deleteProcessedError) {
                totalProcessedRemoved += deletedProcessed?.length || 0;
                console.log(
                  `   🗑️ @${username}: Kept last 8 processed posts (pinned preserved), removed ${toDelete.length}`
                );
              }
            } else {
              console.log(
                `   ✅ @${username}: Already at limit (${keepProcessed.length} processed posts)`
              );
            }
          }
        }
      }

      console.log(
        `✅ Supabase storage cleanup completed: ${totalCacheRemoved} cache entries, ${totalProcessedRemoved} processed posts removed`
      );

      return {
        cacheRemoved: totalCacheRemoved,
        processedRemoved: totalProcessedRemoved,
      };
    } catch (error) {
      console.error(`❌ Supabase storage cleanup failed: ${error.message}`);
      return { cacheRemoved: 0, processedRemoved: 0 };
    }
  }

  // Clear cache for specific user (Supabase version)
  async clearUserCache(username) {
    try {
      if (!this.isConnected) {
        console.log("⚠️ Supabase not connected, cannot clear cache");
        return 0;
      }

      const { data, error } = await this.client
        .from("recent_posts_cache")
        .delete()
        .eq("project_namespace", this.projectNamespace)
        .eq("username", username)
        .select();

      if (error) {
        console.error(
          `❌ Failed to clear cache for @${username}:`,
          error.message
        );
        return 0;
      }

      const deletedCount = data ? data.length : 0;
      console.log(
        `🗑️ Cleared cache for @${username} (${deletedCount} entries) (Supabase)`
      );
      return deletedCount;
    } catch (error) {
      console.error(`❌ Error clearing cache for @${username}:`, error.message);
      return 0;
    }
  }

  // Clear processed posts for specific user (Supabase version)
  async clearUserProcessedPosts(username) {
    try {
      if (!this.isConnected) {
        console.log("⚠️ Supabase not connected, cannot clear processed posts");
        return 0;
      }

      const { data, error } = await this.client
        .from("processed_posts")
        .delete()
        .eq("project_namespace", this.projectNamespace)
        .eq("username", username)
        .select();

      if (error) {
        console.error(
          `❌ Failed to clear processed posts for @${username}:`,
          error.message
        );
        return 0;
      }

      const deletedCount = data ? data.length : 0;
      console.log(
        `🗑️ Cleared processed posts for @${username} (${deletedCount} entries) (Supabase)`
      );
      return deletedCount;
    } catch (error) {
      console.error(
        `❌ Error clearing processed posts for @${username}:`,
        error.message
      );
      return 0;
    }
  }

  // Clear all data for specific user (cache + processed posts) (Supabase version)
  async clearUserData(username) {
    try {
      if (!this.isConnected) {
        console.log("⚠️ Supabase not connected, cannot clear user data");
        return { processedDeleted: 0, cacheDeleted: 0 };
      }

      const [processedDeleted, cacheDeleted] = await Promise.all([
        this.clearUserProcessedPosts(username),
        this.clearUserCache(username),
      ]);

      console.log(
        `🧹 Cleared all data for @${username} (processed: ${processedDeleted}, cache: ${cacheDeleted}) (Supabase)`
      );
      return { processedDeleted, cacheDeleted };
    } catch (error) {
      console.error(
        `❌ Error clearing user data for @${username}:`,
        error.message
      );
      return { processedDeleted: 0, cacheDeleted: 0 };
    }
  }

  // Clear stories data for specific user (Supabase version)
  async clearUserStoriesData(username) {
    try {
      if (!this.isConnected) {
        console.log("⚠️ Supabase not connected, cannot clear stories data");
        return { processedStoriesDeleted: 0, storiesCacheDeleted: 0 };
      }

      // Clear processed stories for this namespace
      const { data: processedData, error: processedError } = await this.client
        .from("processed_stories")
        .delete()
        .eq("project_namespace", this.projectNamespace)
        .eq("username", username)
        .select();

      if (processedError) {
        console.error(
          `❌ Failed to clear processed stories for @${username}:`,
          processedError.message
        );
      }

      // Clear stories cache for this namespace
      const { data: cacheData, error: cacheError } = await this.client
        .from("recent_stories_cache")
        .delete()
        .eq("project_namespace", this.projectNamespace)
        .eq("username", username)
        .select();

      if (cacheError) {
        console.error(
          `❌ Failed to clear stories cache for @${username}:`,
          cacheError.message
        );
      }

      const processedStoriesDeleted = processedData ? processedData.length : 0;
      const storiesCacheDeleted = cacheData ? cacheData.length : 0;

      console.log(
        `🗑️ Cleared stories data for @${username} (processed: ${processedStoriesDeleted}, cache: ${storiesCacheDeleted}) (Supabase)`
      );
      return { processedStoriesDeleted, storiesCacheDeleted };
    } catch (error) {
      console.error(
        `❌ Error clearing stories data for @${username}:`,
        error.message
      );
      return { processedStoriesDeleted: 0, storiesCacheDeleted: 0 };
    }
  }
}

module.exports = SupabaseManager;
