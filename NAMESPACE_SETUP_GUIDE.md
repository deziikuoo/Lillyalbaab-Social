# Supabase Namespace Setup Guide

This guide explains how to set up namespace separation for multiple projects sharing the same Supabase database.

## Overview

The namespace system allows multiple projects (e.g., Tyla Social and Lillyalbaab Social) to share the same Supabase database while keeping their data completely separate. Each project only queries data in its own "folder" (namespace).

## How It Works

- **Namespace**: A text field (`project_namespace`) added to all tables
- **Filtering**: All queries automatically filter by `project_namespace`
- **Isolation**: Projects can't see each other's data
- **Same Database**: Both projects use the same Supabase instance

## Step 1: Run Database Migration

1. **Open Supabase Dashboard**
   - Go to your Supabase project
   - Navigate to **SQL Editor**

2. **Run Migration Script**
   - Open `SUPABASE_NAMESPACE_MIGRATION.sql`
   - Copy the entire contents
   - Paste into SQL Editor
   - Click **Run**

3. **Verify Migration**
   - Check that all tables now have `project_namespace` column
   - Verify indexes were created

## Step 2: Configure Environment Variables

### For Tyla Social (Original Project)

Set in Render/Vercel environment variables:

```env
PROJECT_NAMESPACE=tyla
```

### For Lillyalbaab Social (New Project)

Set in Render/Vercel environment variables:

```env
PROJECT_NAMESPACE=lillyalbaab
```

## Step 3: Update Existing Data (Optional)

If you have existing data that should be assigned to a namespace:

1. **For Tyla Social data** (default namespace is already 'tyla'):
   - No action needed - migration sets default to 'tyla'

2. **For new project data**:
   - Data will automatically use the namespace from `PROJECT_NAMESPACE` env var
   - Old data without namespace will use default 'tyla'

## Step 4: Verify Setup

### Test Tyla Social

1. Set `PROJECT_NAMESPACE=tyla` in environment
2. Deploy/restart service
3. Check logs for: `📁 Using project namespace: tyla`
4. Verify queries only return data with `project_namespace='tyla'`

### Test Lillyalbaab Social

1. Set `PROJECT_NAMESPACE=lillyalbaab` in environment
2. Deploy/restart service
3. Check logs for: `📁 Using project namespace: lillyalbaab`
4. Verify queries only return data with `project_namespace='lillyalbaab'`

## Tables Updated

All tables now include `project_namespace`:

### Instagram Tables
- `processed_posts`
- `recent_posts_cache`
- `processed_stories`
- `recent_stories_cache`
- `cache_cleanup_log`

### Snapchat Tables
- `snapchat_processed_stories`
- `snapchat_recent_stories_cache`
- `snapchat_cache_cleanup_log`

## Query Examples

### Before (No Namespace)
```javascript
// Would return data from ALL projects
client.from("processed_posts")
  .select("*")
  .eq("username", "wolftyla")
```

### After (With Namespace)
```javascript
// Only returns data for this project's namespace
client.from("processed_posts")
  .select("*")
  .eq("project_namespace", "lillyalbaab")  // Auto-added
  .eq("username", "lillyalbaab")
```

## Code Changes Made

### Instagram Service
- ✅ `Instagram/supabase-manager.js` - All queries filter by namespace
- ✅ `Instagram/index.js` - Direct Supabase calls include namespace

### Snapchat Service
- ✅ `Snapchat-Service/server/supabase_manager.py` - All queries filter by namespace

### Configuration
- ✅ `Instagram/render.yaml` - Added `PROJECT_NAMESPACE` env var

## Benefits

1. **Data Isolation**: Projects can't accidentally access each other's data
2. **Cost Efficient**: Share one Supabase database
3. **Easy Management**: One database to monitor
4. **Backward Compatible**: Default namespace is 'tyla' for existing data

## Troubleshooting

### Data Not Appearing

**Problem**: Queries return empty results

**Solution**:
- Verify `PROJECT_NAMESPACE` environment variable is set
- Check logs for namespace being used
- Verify data has correct `project_namespace` value
- Check migration was run successfully

### Migration Errors

**Problem**: Migration fails

**Solution**:
- Check if columns already exist (safe to run multiple times)
- Verify you have admin access to Supabase
- Check SQL syntax in migration file

### Wrong Namespace Data

**Problem**: Seeing data from wrong project

**Solution**:
- Verify `PROJECT_NAMESPACE` env var is correct
- Check service logs for namespace being used
- Verify database migration completed
- Check that queries include namespace filter

## Migration Status

- ✅ SQL migration script created
- ✅ Instagram SupabaseManager updated
- ✅ Snapchat SupabaseManager updated
- ✅ Direct queries in index.js updated
- ✅ Environment variable added to render.yaml
- ⚠️ **Action Required**: Run SQL migration in Supabase dashboard

## Next Steps

1. ✅ Run `SUPABASE_NAMESPACE_MIGRATION.sql` in Supabase
2. ✅ Set `PROJECT_NAMESPACE` environment variable for each project
3. ✅ Deploy/restart services
4. ✅ Verify data isolation works correctly
5. ✅ Test both projects independently

---

**Last Updated**: January 26, 2026  
**Status**: Ready for Migration
