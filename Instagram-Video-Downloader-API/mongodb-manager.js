const { MongoClient } = require("mongodb");

class MongoDBManager {
  constructor() {
    this.client = null;
    this.db = null;
    this.isConnected = false;

    // MongoDB connection string
    this.connectionString =
      process.env.MONGODB_URI ||
      "mongodb+srv://ifdawanprintqualified14:oGTyQTIU0UQ8R5Zu@tylasocial.j6cgdfx.mongodb.net/?retryWrites=true&w=majority&appName=tylasocial&ssl=true&tls=true&tlsAllowInvalidCertificates=true";
    this.dbName = "tylasocial";
  }

  async connect() {
    const maxRetries = 3;
    let attempt = 0;

    while (attempt < maxRetries) {
      try {
        attempt++;
        console.log(`🔌 Connecting to MongoDB... (attempt ${attempt}/${maxRetries})`);
        
        // MongoDB connection options to handle SSL/TLS issues
        const options = {
          ssl: true,
          sslValidate: false, // Disable SSL certificate validation
          tls: true,
          tlsAllowInvalidCertificates: true, // Allow invalid certificates
          tlsAllowInvalidHostnames: true, // Allow invalid hostnames
          retryWrites: true,
          w: 'majority',
          maxPoolSize: 10,
          serverSelectionTimeoutMS: 10000, // Increased timeout
          socketTimeoutMS: 45000,
          connectTimeoutMS: 10000, // Connection timeout
        };

        this.client = new MongoClient(this.connectionString, options);
        await this.client.connect();

        // Test the connection
        await this.client.db("admin").command({ ping: 1 });

        this.db = this.client.db(this.dbName);
        this.isConnected = true;

        console.log("✅ MongoDB connected successfully");

        // Initialize collections
        await this.initializeCollections();

        return true;
      } catch (error) {
        console.error(`❌ MongoDB connection attempt ${attempt} failed:`, error.message);
        
        if (this.client) {
          try {
            await this.client.close();
          } catch (closeError) {
            console.log("⚠️ Error closing MongoDB client:", closeError.message);
          }
        }
        
        this.isConnected = false;
        
        if (attempt < maxRetries) {
          console.log(`🔄 Retrying MongoDB connection in 2 seconds...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        } else {
          console.error("❌ All MongoDB connection attempts failed");
          return false;
        }
      }
    }
  }

  async disconnect() {
    if (this.client) {
      await this.client.close();
      this.isConnected = false;
      console.log("🔌 MongoDB disconnected");
    }
  }

  async initializeCollections() {
    try {
      // Create collections if they don't exist
      const collections = [
        "processed_posts",
        "recent_posts_cache",
        "cache_cleanup_log",
        "processed_stories",
        "recent_stories_cache",
      ];

      for (const collectionName of collections) {
        await this.db.createCollection(collectionName);
      }

      // Create indexes for better performance
      await this.db
        .collection("recent_posts_cache")
        .createIndex({ username: 1, shortcode: 1 }, { unique: true });
      await this.db
        .collection("processed_posts")
        .createIndex({ username: 1, id: 1 }, { unique: true });
      await this.db
        .collection("processed_stories")
        .createIndex({ username: 1, story_id: 1 }, { unique: true });
      await this.db
        .collection("recent_stories_cache")
        .createIndex({ username: 1, story_id: 1 }, { unique: true });

      console.log("✅ MongoDB collections and indexes initialized");
    } catch (error) {
      console.error("❌ MongoDB initialization failed:", error.message);
    }
  }

  // Cache functions for recent posts
  async getCachedRecentPosts(username) {
    try {
      if (!this.isConnected) {
        console.log("⚠️ MongoDB not connected, returning empty cache");
        return [];
      }

      const collection = this.db.collection("recent_posts_cache");
      const cachedPosts = await collection
        .find({ username })
        .sort({ is_pinned: -1, post_order: 1 })
        .toArray();

      return cachedPosts.map((post) => ({
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
        console.log("⚠️ MongoDB not connected, skipping cache update");
        return;
      }

      const collection = this.db.collection("recent_posts_cache");

      // Remove old cache entries for this user
      await collection.deleteMany({ username });

      if (posts.length === 0) {
        console.log(`📊 Cache cleared for @${username}`);
        return;
      }

      // Prepare new cache entries
      const cacheEntries = posts.map((post, index) => {
        const shortcode =
          post.shortcode || post.url.match(/\/(p|reel|tv)\/([^\/]+)\//)?.[2];
        return {
          username,
          post_url: post.url,
          shortcode,
          is_pinned: post.is_pinned || false,
          post_order: index + 1,
          cached_at: new Date().toISOString(),
        };
      });

      // Insert new cache entries
      if (cacheEntries.length > 0) {
        await collection.insertMany(cacheEntries);
      }

      console.log(
        `✅ Updated MongoDB cache with ${posts.length} posts for @${username}`
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

      const collection = this.db.collection("processed_posts");
      const post = await collection.findOne({ id: postId, username });

      if (!post) return false;

      // Check if it's a pinned post (allow re-processing if pinned within 24 hours)
      if (post.is_pinned) {
        const pinnedAt = new Date(post.pinned_at);
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

      const collection = this.db.collection("processed_posts");

      const postData = {
        id: postId,
        username,
        post_url: postUrl,
        post_type: postType,
        is_pinned: isPinned,
        processed_at: new Date().toISOString(),
      };

      if (isPinned) {
        postData.pinned_at = new Date().toISOString();
      }

      await collection.updateOne(
        { id: postId, username },
        { $set: postData },
        { upsert: true }
      );

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

      const collection = this.db.collection("cache_cleanup_log");
      const lastCleanup = await collection.findOne(
        {},
        { sort: { cleaned_at: -1 } }
      );

      if (lastCleanup) {
        return new Date(lastCleanup.cleaned_at);
      }

      // Return a date 8 days ago to trigger cleanup
      const eightDaysAgo = new Date();
      eightDaysAgo.setDate(eightDaysAgo.getDate() - 8);
      return eightDaysAgo;
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

      const collection = this.db.collection("cache_cleanup_log");
      await collection.insertOne({
        cleaned_at: new Date().toISOString(),
        posts_removed: postsRemoved,
        username: username,
      });

      console.log(`✅ Updated cleanup log: ${postsRemoved} posts removed`);
    } catch (error) {
      console.error("❌ Failed to update cleanup log:", error.message);
    }
  }

  // Cleanup functions
  async cleanExpiredCache() {
    try {
      if (!this.isConnected) {
        console.log("⚠️ MongoDB not connected, skipping cleanup");
        return;
      }

      console.log("🧹 Starting MongoDB cache cleanup...");

      const fourWeeksAgo = new Date();
      fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);

      // Clean up old cache entries
      const cacheCollection = this.db.collection("recent_posts_cache");
      const cacheResult = await cacheCollection.deleteMany({
        cached_at: { $lt: fourWeeksAgo.toISOString() },
      });

      // Clean up old processed posts (keep pinned posts)
      const postsCollection = this.db.collection("processed_posts");
      const postsResult = await postsCollection.deleteMany({
        processed_at: { $lt: fourWeeksAgo.toISOString() },
        is_pinned: false,
      });

      const totalRemoved = cacheResult.deletedCount + postsResult.deletedCount;

      await this.updateLastCleanupDate(totalRemoved);

      console.log(
        `✅ MongoDB cleanup completed: ${totalRemoved} entries removed`
      );
    } catch (error) {
      console.error("❌ MongoDB cleanup failed:", error.message);
    }
  }

  // Health check
  async healthCheck() {
    try {
      if (!this.isConnected) return false;

      await this.db.admin().ping();
      return true;
    } catch (error) {
      console.error("❌ MongoDB health check failed:", error.message);
      return false;
    }
  }

  // Story processing functions
  async checkStoryProcessed(username, storyId) {
    try {
      if (!this.isConnected) return false;

      const collection = this.db.collection("processed_stories");
      const story = await collection.findOne({ username, story_id: storyId });

      return !!story;
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

      const collection = this.db.collection("processed_stories");
      const id = `${username}_${storyId}`;

      await collection.updateOne(
        { id },
        {
          $set: {
            id,
            username,
            story_url: storyUrl,
            story_type: storyType,
            story_id: storyId,
            processed_at: new Date().toISOString(),
          },
        },
        { upsert: true }
      );

      console.log(
        `✅ Story ${storyId} marked as processed for @${username} (MongoDB)`
      );
    } catch (error) {
      console.error(
        `❌ Failed to mark story ${storyId} as processed:`,
        error.message
      );
    }
  }

  async updateStoriesCache(username, stories) {
    try {
      if (!this.isConnected) return;

      const collection = this.db.collection("recent_stories_cache");

      // Remove old cache entries for this user
      await collection.deleteMany({ username });

      if (stories.length === 0) {
        console.log(`📊 Stories cache cleared for @${username}`);
        return;
      }

      // Prepare new cache entries
      const cacheEntries = stories.map((story) => ({
        username,
        story_url: story.url,
        story_id: story.storyId,
        story_type: story.storyType,
        cached_at: new Date().toISOString(),
      }));

      // Insert new cache entries
      if (cacheEntries.length > 0) {
        await collection.insertMany(cacheEntries);
      }

      console.log(
        `✅ Stories cache updated for @${username} (${stories.length} entries) (MongoDB)`
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
          error: "Not connected to MongoDB",
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
        const count = await this.db.collection(collectionName).countDocuments();
        stats.collections[collectionName] = count;
      }

      return stats;
    } catch (error) {
      return {
        connected: false,
        error: error.message,
      };
    }
  }
}

module.exports = MongoDBManager;
