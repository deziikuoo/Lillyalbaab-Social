# Tyla Social - Namespace Update Guide

**Date**: January 26, 2026  
**Status**: ⚠️ Pending - To be updated later  
**Project**: Tyla Social (Original Project)

## Overview

This document outlines all changes needed to update the **Tyla Social** project to work with the new Supabase namespace system. The Tyla Social project needs to be updated to use `PROJECT_NAMESPACE=tyla` so it only accesses its own data in the shared database.

## Why This Update is Needed

After implementing namespace separation for Lillyalbaab Social, the Tyla Social project also needs to be updated to:
1. Use the namespace system to filter its own data
2. Prevent cross-contamination with Lillyalbaab Social data
3. Ensure both projects can share the same Supabase database safely

## Required Changes

### 1. Code Updates ✅ (Same as Lillyalbaab)

The code changes are **identical** to what was done for Lillyalbaab Social. The Tyla Social project needs the same updates:

#### Files to Update:

**`Instagram/supabase-manager.js`**:
- ✅ Add `projectNamespace` property from `PROJECT_NAMESPACE` env var
- ✅ Update all queries to filter by `.eq("project_namespace", this.projectNamespace)`
- ✅ Update all inserts to include `project_namespace` field
- ✅ Update all deletes to filter by namespace

**`Instagram/index.js`**:
- ✅ Update direct Supabase calls to include namespace
- ✅ Update `updateStoriesCache()` to include namespace in cache entries

**`Snapchat-Service/server/supabase_manager.py`**:
- ✅ Add `project_namespace` property from `PROJECT_NAMESPACE` env var
- ✅ Update all queries to filter by `.eq("project_namespace", self.project_namespace)`
- ✅ Update all inserts to include `project_namespace` field

**Note**: These files should already have the namespace code (if copied from Lillyalbaab), but verify they're using the correct namespace value.

### 2. Environment Variables ⚠️ **REQUIRED**

Add to Render/Vercel environment variables for Tyla Social:

```env
PROJECT_NAMESPACE=tyla
```

**Where to add**:
- **Render**: Tyla Social service → Environment → Add `PROJECT_NAMESPACE=tyla`
- **Vercel**: Tyla Social project → Settings → Environment Variables → Add `PROJECT_NAMESPACE=tyla`

### 3. Configuration Files

**`Instagram/render.yaml`** (if using):
- Add environment variable:
  ```yaml
  - key: PROJECT_NAMESPACE
    value: tyla
  ```

### 4. Database Migration ✅ (Already Done)

The database migration should already be run (shared database). Verify:
- All tables have `project_namespace` column
- Indexes are created
- Existing Tyla data has `project_namespace='tyla'` (default)

## Step-by-Step Update Process

### Step 1: Verify Database Migration

1. Check Supabase dashboard
2. Verify `project_namespace` column exists in all tables
3. Verify existing Tyla data has `project_namespace='tyla'`

### Step 2: Update Code

**Option A: Copy Updated Files** (Recommended if Tyla Social hasn't been updated)
- Copy `Instagram/supabase-manager.js` from Lillyalbaab Social
- Copy `Instagram/index.js` (namespace parts only)
- Copy `Snapchat-Service/server/supabase_manager.py` from Lillyalbaab Social
- Verify namespace is set to `'tyla'` (default) or uses `PROJECT_NAMESPACE` env var

**Option B: Manual Update** (If Tyla Social has diverged)
- Follow the same pattern as Lillyalbaab Social updates
- Add namespace filtering to all queries
- Add namespace to all inserts
- See `NAMESPACE_IMPLEMENTATION_SUMMARY.md` for details

### Step 3: Set Environment Variable

1. **Render**:
   - Go to Tyla Social service
   - Environment → Add `PROJECT_NAMESPACE=tyla`
   - Save and redeploy

2. **Vercel** (if applicable):
   - Go to Tyla Social project
   - Settings → Environment Variables
   - Add `PROJECT_NAMESPACE=tyla`
   - Redeploy

### Step 4: Test

1. Deploy/restart Tyla Social service
2. Check logs for: `📁 Using project namespace: tyla`
3. Verify queries only return Tyla data
4. Test that Lillyalbaab data is NOT visible
5. Test that new Tyla data includes `project_namespace='tyla'`

## Verification Checklist

- [ ] Database migration completed (shared database)
- [ ] Code updated with namespace support
- [ ] `PROJECT_NAMESPACE=tyla` environment variable set
- [ ] Service logs show: `📁 Using project namespace: tyla`
- [ ] Queries only return data with `project_namespace='tyla'`
- [ ] New data includes `project_namespace='tyla'`
- [ ] No access to Lillyalbaab data (`project_namespace='lillyalbaab'`)
- [ ] Existing Tyla data still accessible
- [ ] Snapchat service (if used) also uses namespace

## Key Differences from Lillyalbaab

| Aspect | Tyla Social | Lillyalbaab Social |
|--------|-------------|-------------------|
| **Namespace** | `tyla` | `lillyalbaab` |
| **Default Value** | `'tyla'` (backward compatible) | `'lillyalbaab'` |
| **Existing Data** | Already has `project_namespace='tyla'` (default) | Will create new data with `'lillyalbaab'` |
| **Username** | `wolftyla` | `lillyalbaab` |

## Code Pattern to Follow

### Constructor Pattern
```javascript
// Instagram/supabase-manager.js
constructor() {
  // ... existing code ...
  this.projectNamespace = process.env.PROJECT_NAMESPACE || 'tyla'; // Default to 'tyla'
  console.log(`📁 Using project namespace: ${this.projectNamespace}`);
}
```

```python
# Snapchat-Service/server/supabase_manager.py
def __init__(self):
    # ... existing code ...
    self.project_namespace = os.getenv("PROJECT_NAMESPACE", "tyla")  # Default to 'tyla'
    logger.info(f"📁 Using project namespace: {self.project_namespace}")
```

### Query Pattern
```javascript
// All queries should include:
.eq("project_namespace", this.projectNamespace)
```

### Insert Pattern
```javascript
// All inserts should include:
{
  project_namespace: this.projectNamespace,
  // ... other fields ...
}
```

## Potential Issues & Solutions

### Issue 1: Existing Data Without Namespace

**Problem**: Old data might have `NULL` namespace

**Solution**: 
- Migration sets default to `'tyla'`, so existing data should be fine
- If needed, run: `UPDATE table_name SET project_namespace = 'tyla' WHERE project_namespace IS NULL;`

### Issue 2: Code Not Updated

**Problem**: Tyla Social code doesn't have namespace support

**Solution**:
- Copy updated files from Lillyalbaab Social
- Or manually apply changes following the same pattern

### Issue 3: Wrong Namespace

**Problem**: Using wrong namespace value

**Solution**:
- Verify `PROJECT_NAMESPACE=tyla` is set correctly
- Check logs show correct namespace
- Verify database queries filter correctly

## Testing After Update

1. **Data Isolation Test**:
   - Query Tyla data → Should only see `project_namespace='tyla'`
   - Query should NOT return Lillyalbaab data
   - Create new Tyla data → Should have `project_namespace='tyla'`

2. **Functionality Test**:
   - Instagram polling works
   - Snapchat polling works (if enabled)
   - Cache operations work
   - Cleanup operations work
   - All features function normally

3. **Performance Test**:
   - Queries are fast (indexes help)
   - No performance degradation
   - Database load is normal

## Rollback Plan

If issues occur:

1. **Remove namespace filter temporarily**:
   - Comment out `.eq("project_namespace", ...)` filters
   - Service will work but may see cross-project data

2. **Revert code changes**:
   - Git revert to pre-namespace version
   - Data remains safe in database

3. **Remove environment variable**:
   - Service will use default `'tyla'` namespace
   - Should work correctly

## Files Reference

For detailed implementation, see:
- `NAMESPACE_IMPLEMENTATION_SUMMARY.md` - Technical details
- `SUPABASE_NAMESPACE_MIGRATION.sql` - Database changes
- `NAMESPACE_SETUP_GUIDE.md` - Setup instructions

## Priority

**Priority Level**: Medium  
**Timeline**: Can be done after Lillyalbaab Social is deployed and tested  
**Dependencies**: Database migration must be completed first (shared)

## Notes

- Tyla Social can continue working without these updates (will use default 'tyla')
- However, for proper isolation, these updates are recommended
- Both projects can share the database safely after updates
- No data loss risk - migration is additive only

---

**Status**: ⚠️ Pending - Update when ready  
**Last Updated**: January 26, 2026
