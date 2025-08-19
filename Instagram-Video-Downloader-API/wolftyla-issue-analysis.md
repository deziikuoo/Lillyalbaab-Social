# In-Depth Analysis: Current Logic Setup and Wolftyla Profile Issue

## Current Logic Architecture

### 1. **Story Processing Flow**

```
Instagram Story URL → Snapsave Service → Enhanced Logic → Database Filtering → Telegram
```

### 2. **Enhanced Logic Components**

#### **A. Snapsave Integration**

- **Location**: `getInstagramStoriesViaWeb()` function
- **Process**: Calls `originalSnapsave(storyUrl)` to get raw story data
- **Output**: Array of story items with URLs, quality info, etc.

#### **B. Video Detection & Deduplication**

- **Location**: Enhanced logic within `getInstagramStoriesViaWeb()`
- **Components**:
  - **Video Extension Detection**: Checks for `.mp4`, `.m4v`, `.mov`, etc.
  - **Unique Key Generation**: Creates `uniqueKey` from JWT token filename
  - **Deduplication Map**: `uniqueStories` Map prevents duplicate processing
  - **Confidence Scoring**: Multi-factor video detection algorithm

#### **C. Database Filtering (New)**

- **Location**: `processInstagramStories()` function
- **Process**: `getUnprocessedStories()` filters out already-sent stories
- **Output**: Only unprocessed stories proceed to Telegram

### 3. **Unique Key Generation Logic**

```javascript
// Extract filename from JWT token
const decodedToken = JSON.parse(
  Buffer.from(token.split(".")[1], "base64").toString()
);
if (decodedToken.filename) {
  uniqueKey = `filename_${decodedToken.filename}`;
}
```

### 4. **Deduplication Process**

```javascript
if (uniqueStories.has(uniqueKey)) {
  console.log(`⏭️ Skipping duplicate story for key: ${uniqueKey}`);
  continue;
}
uniqueStories.set(uniqueKey, storyData);
```

## The Wolftyla Profile Issue

### **Problem Statement**

- **Other profiles**: All stories found and processed correctly
- **Wolftyla profile**: Only 1 out of 3 videos found
- **Consistent behavior**: Issue persists across multiple runs

### **Root Cause Analysis**

#### **1. JWT Token Filename Deduplication**

The issue is in the **unique key generation**. For Wolftyla's profile:

- **All 3 videos likely have the same filename** in their JWT tokens
- **Example**: All might be `snapsave-app_xxxxx.mp4` with different `xxxxx` parts
- **Result**: All 3 videos get the same `uniqueKey`
- **Deduplication**: Only the first video passes, others are skipped

#### **2. Why Other Profiles Work**

Other profiles might have:

- **Different filenames** for each story
- **Different content types** (mix of videos and images)
- **Different JWT token structures**

#### **3. Evidence from Logs**

```
🔑 Processing new unique story with key: filename_snapsave-app_hyn0fpp282hx6ogn51r2xd.mp4 (item 1)
📊 Integrated enhanced logic found 1 unique stories
```

This shows only 1 story survived the deduplication.

### **Technical Details**

#### **A. JWT Token Structure**

```javascript
// Example JWT token payload
{
  "url": "https://instagram.com/...",
  "filename": "snapsave-app_hyn0fpp282hx6ogn51r2xd.mp4",
  "headers": {...},
  "iat": 1755591300
}
```

#### **B. Unique Key Generation**

```javascript
// Current logic
uniqueKey = `filename_${decodedToken.filename}`;
// Result: "filename_snapsave-app_hyn0fpp282hx6ogn51r2xd.mp4"
```

#### **C. The Deduplication Problem**

If all 3 videos have similar filenames:

- Video 1: `filename_snapsave-app_hyn0fpp282hx6ogn51r2xd.mp4`
- Video 2: `filename_snapsave-app_hyn0fpp282hx6ogn51r2xd.mp4` (same or similar)
- Video 3: `filename_snapsave-app_hyn0fpp282hx6ogn51r2xd.mp4` (same or similar)

All get the same `uniqueKey`, so only the first one is processed.

## Why This Doesn't Affect Other Profiles

### **1. Different Content Mix**

- **Other profiles**: Mix of videos and images
- **Wolftyla**: All videos (same format, similar filenames)

### **2. Different JWT Token Patterns**

- **Other profiles**: Different filenames for each story
- **Wolftyla**: Similar filenames across all stories

### **3. Different Story Types**

- **Other profiles**: Various story types with different naming conventions
- **Wolftyla**: All similar video stories

## The Real Issue

The problem is **NOT** with video format detection (which we just fixed), but with **overly aggressive deduplication** in the enhanced logic.

### **Current Flow Problem**

```
Snapsave returns 3 videos → Enhanced logic deduplicates to 1 → Database filtering sees only 1 → Only 1 processed
```

### **What Should Happen**

```
Snapsave returns 3 videos → Enhanced logic processes all 3 → Database filtering removes already-sent → All new videos processed
```

## Solution Options

### **Option 1: Remove Enhanced Logic Deduplication**

- **Remove**: `uniqueStories` Map deduplication
- **Keep**: Database-based filtering only
- **Pros**: Simple, lets database handle all deduplication
- **Cons**: Might process more stories initially

### **Option 2: Improve Unique Key Generation**

- **Add**: Timestamp, quality, or other differentiating factors
- **Example**: `uniqueKey = filename_${decodedToken.filename}_${item.quality || i}`
- **Pros**: More precise deduplication
- **Cons**: More complex logic

### **Option 3: Hybrid Approach**

- **Keep**: Enhanced logic for video detection
- **Remove**: Enhanced logic deduplication
- **Add**: Better logging to see what's being deduplicated

## Current Video Format Detection (Recently Fixed)

### **Supported Formats**

```javascript
const videoExtensions = [
  ".mp4",
  ".m4v",
  ".mov",
  ".avi",
  ".webm",
  ".mkv",
  ".flv",
  ".wmv",
  ".asf",
  ".3gp",
  ".3g2",
  ".ogv",
  ".ts",
  ".mts",
  ".m2ts",
  ".vob",
  ".ogm",
  ".rm",
  ".rmvb",
  ".divx",
  ".xvid",
  ".h264",
  ".h265",
  ".hevc",
  ".vp8",
  ".vp9",
];
```

### **Detection Logic**

- **URL Check**: Scans URL for video extensions
- **Filename Check**: Scans JWT token filename for video extensions
- **Combined Result**: `hasVideoExtension = urlHasVideo || filenameHasVideo`

## Summary

The core issue is that the enhanced logic is being too aggressive in deduplicating stories that should be processed separately, specifically for profiles like Wolftyla that have multiple similar videos. The video format detection is working correctly (we can see `.mp4` format detected), but the deduplication logic is preventing the other 2 videos from being processed.
