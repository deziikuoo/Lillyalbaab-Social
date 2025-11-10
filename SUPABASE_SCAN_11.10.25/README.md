# Supabase Database Scan - November 10, 2025

This folder contains a complete scan of the Supabase database for the Tyla Social project.

## 📁 Contents

| File | Description |
|------|-------------|
| `README.md` | This file - overview and instructions |
| `SUMMARY.md` | Detailed analysis and insights from the scan |
| `scan-results.txt` | Raw output from the database scanner |
| `scan-supabase-tables.js` | The scanner script used to generate results |
| `search-snap-id.js` | Script to search for specific snap IDs |
| `MISSING-SNAP-INVESTIGATION.md` | Investigation of missing snap case study (OUTDATED) |
| `MISSING-SNAP-REAL-CAUSE.md` | **UPDATED** investigation with actual cause |
| `debug-snapchat-api.py` | Debug tool to capture Snapchat API responses |
| `HOW-TO-DEBUG-ON-RENDER.md` | **Instructions for debugging on Render** |

## 🎯 Quick Summary

**Total Tables**: 8 (5 Instagram, 3 Snapchat)  
**Total Rows**: 362  
**Primary User**: @wolftyla  
**Date Range**: Aug 29, 2025 → Nov 10, 2025

### Table Overview

| Table | Rows | Status |
|-------|------|--------|
| Instagram: cache_cleanup_log | 5 | ✅ Active |
| Instagram: processed_posts | 31 | ✅ Active |
| Instagram: processed_stories | 108 | ✅ Very Active |
| Instagram: recent_posts_cache | 0 | ❌ **Empty** |
| Instagram: recent_stories_cache | 6 | ✅ Active |
| Snapchat: snapchat_cache_cleanup_log | 0 | ⚠️ Empty |
| Snapchat: snapchat_processed_stories | 201 | ✅ Most Active |
| Snapchat: snapchat_recent_stories_cache | 11 | ✅ Active |

## ⚠️ Critical Finding

**Instagram Posts Cache is Empty**
- The `recent_posts_cache` table has 0 rows
- This is why the post gallery shows 0 items
- Posts are being processed (31 in processed_posts) but not cached
- **Action Required**: Debug cache insertion logic

## 🚀 How to Run Another Scan

```bash
# Navigate to Instagram directory
cd "Instagram"

# Run the scanner
node scan-supabase-tables.js

# Save output to a file
node scan-supabase-tables.js > scan-results-new.txt 2>&1
```

## 📊 Key Metrics

### Content Processing
- **Snapchat Stories**: 201 processed (most active)
- **Instagram Stories**: 108 processed
- **Instagram Posts**: 31 processed

### Current Cache
- **Snapchat**: 9 active stories
- **Instagram Stories**: 6 active stories
- **Instagram Posts**: 0 cached ❌

### Activity Level
- **Snapchat**: ~67 stories/month (2-3 per day)
- **Instagram**: ~108 stories/month (3-4 per day)

## 🔍 What Each File Contains

### SUMMARY.md
- Detailed table-by-table breakdown
- Statistics and insights
- Issues and recommendations
- Storage analysis
- Table schemas
- Next steps

### scan-results.txt
- Raw console output from scanner
- Shows first 10 rows of each table
- Column details
- Statistics per table
- Date ranges
- Username distribution

### scan-supabase-tables.js
- Node.js script to scan Supabase
- Connects using Supabase client
- Queries all 8 tables
- Generates detailed reports
- Can be reused for future scans

## 📝 Notes

- All data is for user **@wolftyla** (except 3 test entries)
- Snapchat has 2.5 months of history
- Instagram has 1 month of history
- FastDL URLs for Instagram stories may expire
- Snapchat CDN URLs are from official Snapchat servers

## 🔗 Database Connection

**URL**: `https://tuvyckzfwdtaieajlszb.supabase.co`  
**Key**: Stored in environment variables  
**Connection**: via @supabase/supabase-js client

## 📅 Scan Information

**Scan Date**: November 10, 2025  
**Scan Time**: ~8:43 AM UTC  
**Duration**: ~15 seconds  
**Status**: ✅ Successful

---

For detailed analysis, see **SUMMARY.md**  
For raw data, see **scan-results.txt**

