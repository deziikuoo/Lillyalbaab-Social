# Supabase Database Scan Summary

**Date**: November 10, 2025  
**Time**: ~8:43 AM UTC  
**Database**: https://tuvyckzfwdtaieajlszb.supabase.co

---

## 📊 Overview

Total tables scanned: **8**

- Instagram tables: **5**
- Snapchat tables: **3**

Total rows across all tables: **362 rows**

---

## 🟣 Instagram Tables

### 1. cache_cleanup_log (5 rows)

**Purpose**: Tracks cache cleanup operations

**Status**: ✅ Active

- All entries for @wolftyla
- Date range: Oct 10, 2025
- Cleanup history shows 0-8 posts removed per operation
- Last cleanup: Oct 10, 2025 at 23:53:46 UTC

### 2. processed_posts (31 rows)

**Purpose**: Tracks processed Instagram posts to prevent duplicates

**Status**: ✅ Active

- Username: @wolftyla (100%)
- Types: Videos (majority), Carousels
- Pinned: None
- Date range: Oct 10, 2025 → Nov 10, 2025
- Latest post: DQsgivOASZr (Nov 7)
- Oldest post: DQCV_M1iG8Q (Oct 10)

**Post Type Distribution**:

- Videos: ~25 posts
- Carousels: ~6 posts

### 3. processed_stories (108 rows)

**Purpose**: Tracks processed Instagram stories to prevent duplicates

**Status**: ✅ Very Active

- Username: @wolftyla (100%)
- Types: Videos, Images
- Storage: FastDL proxy URLs
- Date range: Oct 10, 2025 → Nov 10, 2025
- Latest: Story processed Nov 10 at 05:23 AM

**Story Type Distribution**:

- Videos: ~80+ stories
- Images: ~20+ stories

### 4. recent_posts_cache (0 rows)

**Purpose**: Caches recent posts for gallery display

**Status**: ❌ **EMPTY**

- No cached posts
- This explains why post gallery shows 0 items
- Should contain last 8-12 posts per user

**Action Needed**: Investigate why posts aren't being cached after processing

### 5. recent_stories_cache (6 rows)

**Purpose**: Caches current active stories for gallery display

**Status**: ✅ Active

- Username: @wolftyla (100%)
- Cache time: Nov 10, 2025 at 08:32:21 UTC
- Types: 4 videos, 2 images
- Storage: FastDL proxy URLs

**Current Stories**:

1. Story ID: 39b13b9df301a73e (video)
2. Story ID: 8dd70d9f3d01903c (image)
3. Story ID: d44c3f6bbc5663b8 (video)
4. Story ID: da58c2219dafc7d1 (video)
5. Story ID: d2acc941100464d4 (image)
6. Story ID: 4226d8652d289c84 (video)

---

## 🟡 Snapchat Tables

### 6. snapchat_cache_cleanup_log (0 rows)

**Purpose**: Tracks Snapchat cache cleanup operations

**Status**: ⚠️ **EMPTY**

- No cleanup operations logged yet
- Table exists but unused
- Cleanup may not be implemented yet

### 7. snapchat_processed_stories (201 rows) 🔥

**Purpose**: Tracks processed Snapchat stories to prevent duplicates

**Status**: ✅ **Most Active Table**

- Usernames: @wolftyla (200), test_user (1)
- Types: Videos, Photos
- Storage: Snapchat CDN URLs (bolt-gcdn.sc-cdn.net, cf-st.sc-cdn.net)
- Date range: Aug 29, 2025 → Nov 10, 2025 (3+ months!)
- Latest: Story processed Nov 10 at 08:21 AM

**Story Type Distribution**:

- Videos: ~150+ stories
- Photos: ~50 stories

**Activity Level**:

- ~67 stories per month
- ~2-3 stories per day average
- Very consistent activity

### 8. snapchat_recent_stories_cache (11 rows)

**Purpose**: Caches current active Snapchat stories for gallery display

**Status**: ✅ Active

- Usernames: @wolftyla (9), test_user (2)
- Cache time: Nov 10, 2025 at 08:43:00 UTC
- Types: Mostly videos, some photos
- Ordered: story_order 1-9 for wolftyla

**Current Stories** (@wolftyla):

1. Photo - snap_id: ...YWp4Z3ppcA... (order 1)
2. Photo - snap_id: ...bGFud2RwbmZ0... (order 2)
3. Photo - snap_id: ...dWJra3hmbG5w... (order 3)
4. Video - snap_id: ...ZmxydG5jcWVv... (order 4)
5. Video - snap_id: ...a3R2ZGppcGxh... (order 5)
6. Video - snap_id: ...dWx6eG5mc3Vx... (order 6)
7. Video - snap_id: ...a3Rid3R0YnprA... (order 7)
8. Video - snap_id: ...cnJ1dWd0em1w... (order 8)
9. Video - snap_id: ...c2xhY252aWJr... (order 9)

---

## 📈 Key Statistics

### Activity Comparison

| Platform          | Processed | Recent Cache |
| ----------------- | --------- | ------------ |
| Instagram Posts   | 31        | 0 ❌         |
| Instagram Stories | 108       | 6 ✅         |
| Snapchat Stories  | 201       | 9 ✅         |

### Total Activity

- **Total processed content**: 340 items
- **Total cached content**: 15 items
- **Primary user**: @wolftyla (99.7% of all content)

### Date Ranges

- **Instagram**: Oct 10, 2025 → Nov 10, 2025 (1 month)
- **Snapchat**: Aug 29, 2025 → Nov 10, 2025 (2.5 months)

---

## 🎯 Issues & Recommendations

### ❌ Critical Issues

1. **Empty Instagram Posts Cache**
   - Table: `recent_posts_cache`
   - Impact: Post gallery shows 0 items
   - Cause: Posts being processed but not cached
   - **Recommendation**: Check cache insertion logic after post processing

### ⚠️ Minor Issues

2. **Unused Cleanup Log**
   - Table: `snapchat_cache_cleanup_log`
   - Impact: No cleanup history for Snapchat
   - **Recommendation**: Implement Snapchat cache cleanup logging

### ✅ Working Well

3. **Story Caching**

   - Both Instagram and Snapchat stories are properly cached
   - Recent cache is updated regularly
   - Deduplication working (no duplicate story_ids)

4. **Processing Logs**
   - All processed content is properly logged
   - No duplicate entries detected
   - Timestamps accurate

---

## 🔧 Storage Analysis

### URL Types in Use

**Instagram Stories**:

- Format: `https://media.fastdl.app/get?__sig=...&__expires=...&uri=...`
- Provider: FastDL proxy service
- Expires: URLs have expiration timestamps

**Snapchat Stories**:

- Format 1: `https://bolt-gcdn.sc-cdn.net/3/...` (videos)
- Format 2: `https://cf-st.sc-cdn.net/d/...` (photos)
- Provider: Snapchat CDN
- Parameters: Include `mo=` (media options) parameter

### Data Retention

**Processed Stories**: Kept indefinitely

- Instagram: 108 stories (1 month of data)
- Snapchat: 201 stories (2.5 months of data)

**Recent Cache**: Short-term storage

- Updated on each poll
- Only keeps current/active stories
- Cleaned up regularly

---

## 📝 Table Schemas

### Instagram Tables

```sql
-- cache_cleanup_log
id (int), cleaned_at (timestamp), posts_removed (int), username (text)

-- processed_posts
id (text/shortcode), username (text), post_url (text), post_type (text),
is_pinned (bool), pinned_at (timestamp), processed_at (timestamp)

-- processed_stories
id (text), username (text), story_url (text), story_type (text),
story_id (text), processed_at (timestamp)

-- recent_posts_cache
(empty - schema not verified)

-- recent_stories_cache
id (int), username (text), story_url (text), story_id (text),
story_type (text), cached_at (timestamp)
```

### Snapchat Tables

```sql
-- snapchat_cache_cleanup_log
(empty - schema not verified)

-- snapchat_processed_stories
id (text), username (text), story_url (text), story_type (text),
snap_id (text), processed_at (timestamp)

-- snapchat_recent_stories_cache
id (int), username (text), story_url (text), snap_id (text),
story_type (text), story_order (int), cached_at (timestamp)
```

---

## 🎬 Next Steps

1. **Fix Instagram Posts Cache**

   - Debug why `recent_posts_cache` is empty
   - Check cache insertion after post processing
   - Verify cache update logic in polling

2. **Implement Snapchat Cleanup Logging**

   - Use `snapchat_cache_cleanup_log` table
   - Mirror Instagram cleanup logging

3. **Monitor Cache Size**

   - Watch processed_stories growth (108 Instagram, 201 Snapchat)
   - Consider implementing periodic cleanup for old processed entries
   - Keep last 4 weeks of processed data

4. **Verify Expiring URLs**
   - FastDL URLs have expiration timestamps
   - May need URL refresh mechanism for old cached stories

---

## 📞 Contact & Support

**Database URL**: https://tuvyckzfwdtaieajlszb.supabase.co  
**Scan Tool**: `scan-supabase-tables.js` (included in this folder)  
**Full Output**: `scan-results.txt` (detailed raw output)

To run another scan:

```bash
cd Instagram
node scan-supabase-tables.js
```

---

_Scan completed: November 10, 2025_
