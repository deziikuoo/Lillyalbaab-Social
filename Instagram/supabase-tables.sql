-- Supabase Tables for Instagram Video Downloader API
-- Run these commands in your Supabase SQL Editor

-- 1. Processed posts table
CREATE TABLE IF NOT EXISTS processed_posts (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  post_url TEXT,
  post_type TEXT,
  is_pinned BOOLEAN DEFAULT FALSE,
  pinned_at TIMESTAMP WITH TIME ZONE,
  processed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Recent posts cache table
CREATE TABLE IF NOT EXISTS recent_posts_cache (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL,
  post_url TEXT NOT NULL,
  shortcode TEXT,
  is_pinned BOOLEAN DEFAULT FALSE,
  post_order INTEGER,
  cached_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(username, shortcode)
);

-- 3. Cache cleanup log table
CREATE TABLE IF NOT EXISTS cache_cleanup_log (
  id SERIAL PRIMARY KEY,
  cleaned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  posts_removed INTEGER DEFAULT 0,
  username TEXT
);

-- 4. Processed stories table
CREATE TABLE IF NOT EXISTS processed_stories (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  story_url TEXT,
  story_type TEXT,
  story_id TEXT,
  processed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Recent stories cache table
CREATE TABLE IF NOT EXISTS recent_stories_cache (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL,
  story_url TEXT NOT NULL,
  story_id TEXT,
  story_type TEXT,
  cached_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(username, story_id)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_processed_posts_username ON processed_posts(username);
CREATE INDEX IF NOT EXISTS idx_processed_posts_username_id ON processed_posts(username, id);
CREATE INDEX IF NOT EXISTS idx_recent_posts_cache_username ON recent_posts_cache(username);
CREATE INDEX IF NOT EXISTS idx_processed_stories_username ON processed_stories(username);
CREATE INDEX IF NOT EXISTS idx_processed_stories_username_story_id ON processed_stories(username, story_id);
CREATE INDEX IF NOT EXISTS idx_recent_stories_cache_username ON recent_stories_cache(username);

-- Enable Row Level Security (RLS) - optional but recommended
ALTER TABLE processed_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE recent_posts_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE cache_cleanup_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE processed_stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE recent_stories_cache ENABLE ROW LEVEL SECURITY;

-- Create policies to allow all operations (for service account)
CREATE POLICY "Allow all operations on processed_posts" ON processed_posts FOR ALL USING (true);
CREATE POLICY "Allow all operations on recent_posts_cache" ON recent_posts_cache FOR ALL USING (true);
CREATE POLICY "Allow all operations on cache_cleanup_log" ON cache_cleanup_log FOR ALL USING (true);
CREATE POLICY "Allow all operations on processed_stories" ON processed_stories FOR ALL USING (true);
CREATE POLICY "Allow all operations on recent_stories_cache" ON recent_stories_cache FOR ALL USING (true);
