-- Supabase Namespace Migration
-- This migration adds project_namespace column to all tables to separate data by project
-- Run this in your Supabase SQL Editor

-- ============================================
-- INSTAGRAM TABLES
-- ============================================

-- 1. Add project_namespace to processed_posts
ALTER TABLE processed_posts 
ADD COLUMN IF NOT EXISTS project_namespace TEXT DEFAULT 'tyla';

-- 2. Add project_namespace to recent_posts_cache
ALTER TABLE recent_posts_cache 
ADD COLUMN IF NOT EXISTS project_namespace TEXT DEFAULT 'tyla';

-- 3. Add project_namespace to processed_stories
ALTER TABLE processed_stories 
ADD COLUMN IF NOT EXISTS project_namespace TEXT DEFAULT 'tyla';

-- 4. Add project_namespace to recent_stories_cache
ALTER TABLE recent_stories_cache 
ADD COLUMN IF NOT EXISTS project_namespace TEXT DEFAULT 'tyla';

-- 5. Add project_namespace to cache_cleanup_log
ALTER TABLE cache_cleanup_log 
ADD COLUMN IF NOT EXISTS project_namespace TEXT DEFAULT 'tyla';

-- ============================================
-- SNAPCHAT TABLES
-- ============================================

-- 6. Add project_namespace to snapchat_processed_stories
ALTER TABLE snapchat_processed_stories 
ADD COLUMN IF NOT EXISTS project_namespace TEXT DEFAULT 'tyla';

-- 7. Add project_namespace to snapchat_recent_stories_cache
ALTER TABLE snapchat_recent_stories_cache 
ADD COLUMN IF NOT EXISTS project_namespace TEXT DEFAULT 'tyla';

-- 8. Add project_namespace to snapchat_cache_cleanup_log
ALTER TABLE snapchat_cache_cleanup_log 
ADD COLUMN IF NOT EXISTS project_namespace TEXT DEFAULT 'tyla';

-- ============================================
-- CREATE INDEXES FOR PERFORMANCE
-- ============================================

-- Instagram indexes
CREATE INDEX IF NOT EXISTS idx_processed_posts_namespace_username 
ON processed_posts(project_namespace, username);

CREATE INDEX IF NOT EXISTS idx_recent_posts_cache_namespace_username 
ON recent_posts_cache(project_namespace, username);

CREATE INDEX IF NOT EXISTS idx_processed_stories_namespace_username 
ON processed_stories(project_namespace, username);

CREATE INDEX IF NOT EXISTS idx_recent_stories_cache_namespace_username 
ON recent_stories_cache(project_namespace, username);

-- Snapchat indexes
CREATE INDEX IF NOT EXISTS idx_snapchat_processed_stories_namespace_username 
ON snapchat_processed_stories(project_namespace, username);

CREATE INDEX IF NOT EXISTS idx_snapchat_recent_stories_cache_namespace_username 
ON snapchat_recent_stories_cache(project_namespace, username);

-- ============================================
-- UPDATE EXISTING DATA (Optional)
-- ============================================

-- If you have existing data that should be assigned to a specific namespace,
-- uncomment and run these (adjust namespace as needed):

-- UPDATE processed_posts SET project_namespace = 'tyla' WHERE project_namespace IS NULL;
-- UPDATE recent_posts_cache SET project_namespace = 'tyla' WHERE project_namespace IS NULL;
-- UPDATE processed_stories SET project_namespace = 'tyla' WHERE project_namespace IS NULL;
-- UPDATE recent_stories_cache SET project_namespace = 'tyla' WHERE project_namespace IS NULL;
-- UPDATE cache_cleanup_log SET project_namespace = 'tyla' WHERE project_namespace IS NULL;
-- UPDATE snapchat_processed_stories SET project_namespace = 'tyla' WHERE project_namespace IS NULL;
-- UPDATE snapchat_recent_stories_cache SET project_namespace = 'tyla' WHERE project_namespace IS NULL;
-- UPDATE snapchat_cache_cleanup_log SET project_namespace = 'tyla' WHERE project_namespace IS NULL;

-- ============================================
-- VERIFY MIGRATION
-- ============================================

-- Check that columns were added:
-- SELECT column_name, data_type, column_default 
-- FROM information_schema.columns 
-- WHERE table_name = 'processed_posts' AND column_name = 'project_namespace';
