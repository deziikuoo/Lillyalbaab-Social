-- Supabase Tables for Snapchat Service
-- Run these commands in your Supabase SQL Editor

-- 1. Snapchat processed stories table
CREATE TABLE IF NOT EXISTS snapchat_processed_stories (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  story_url TEXT,
  story_type TEXT,
  snap_id TEXT,
  processed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Snapchat recent stories cache table
CREATE TABLE IF NOT EXISTS snapchat_recent_stories_cache (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL,
  story_url TEXT NOT NULL,
  snap_id TEXT,
  story_type TEXT,
  story_order INTEGER,
  cached_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(username, snap_id)
);

-- 3. Snapchat cache cleanup log table
CREATE TABLE IF NOT EXISTS snapchat_cache_cleanup_log (
  id SERIAL PRIMARY KEY,
  cleaned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  stories_removed INTEGER DEFAULT 0,
  username TEXT
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_snapchat_processed_stories_username ON snapchat_processed_stories(username);
CREATE INDEX IF NOT EXISTS idx_snapchat_processed_stories_username_snap_id ON snapchat_processed_stories(username, snap_id);
CREATE INDEX IF NOT EXISTS idx_snapchat_recent_stories_cache_username ON snapchat_recent_stories_cache(username);
CREATE INDEX IF NOT EXISTS idx_snapchat_recent_stories_cache_username_snap_id ON snapchat_recent_stories_cache(username, snap_id);

-- Enable Row Level Security (RLS) - optional but recommended
ALTER TABLE snapchat_processed_stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE snapchat_recent_stories_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE snapchat_cache_cleanup_log ENABLE ROW LEVEL SECURITY;

-- Create policies to allow all operations (for service account)
CREATE POLICY "Allow all operations on snapchat_processed_stories" ON snapchat_processed_stories FOR ALL USING (true);
CREATE POLICY "Allow all operations on snapchat_recent_stories_cache" ON snapchat_recent_stories_cache FOR ALL USING (true);
CREATE POLICY "Allow all operations on snapchat_cache_cleanup_log" ON snapchat_cache_cleanup_log FOR ALL USING (true);
