// Search for specific Snap ID in Supabase
require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");

// Initialize Supabase client
const supabaseUrl =
  process.env.SUPABASE_URL || "https://tuvyckzfwdtaieajlszb.supabase.co";
const supabaseKey =
  process.env.SUPABASE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR1dnlja3pmd2R0YWllYWpsc3piIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU4MTk3MjIsImV4cCI6MjA3MTM5NTcyMn0.-BNhNk3iO8WguyU6liZfJ4Vxuat5YG7wTHuDRumkbG8";

const supabase = createClient(supabaseUrl, supabaseKey);

// The snap ID we're looking for
const TARGET_SNAP_ID = "pWHqAhPcRT6rrYfCQJc_zwAAgcGt5bHZ5eXFqAZpswUnaAZpsfLRyAAAAAA";
const TARGET_URL = "https://www.snapchat.com/@wolftyla/pWHqAhPcRT6rrYfCQJc_zwAAgcGt5bHZ5eXFqAZpswUnaAZpsfLRyAAAAAA";

console.log("🔍 Searching for Snap ID in Supabase Database");
console.log("=" .repeat(80));
console.log(`\n📌 Target Snap ID: ${TARGET_SNAP_ID}`);
console.log(`📌 Target URL: ${TARGET_URL}`);
console.log(`📌 Username: @wolftyla\n`);

async function searchSnapId() {
  const results = {
    exactMatches: [],
    partialMatches: [],
    similarIds: [],
  };

  // 1. Search in snapchat_processed_stories (exact match)
  console.log("\n🔍 Searching snapchat_processed_stories (exact match)...");
  try {
    const { data, error } = await supabase
      .from("snapchat_processed_stories")
      .select("*")
      .eq("snap_id", TARGET_SNAP_ID);

    if (error) throw error;

    if (data && data.length > 0) {
      console.log(`✅ FOUND ${data.length} exact match(es) in processed_stories!`);
      results.exactMatches.push(...data.map(d => ({ ...d, table: "snapchat_processed_stories" })));
      
      data.forEach((row, i) => {
        console.log(`\n--- Match ${i + 1} ---`);
        console.log(`  ID: ${row.id}`);
        console.log(`  Username: ${row.username}`);
        console.log(`  Snap ID: ${row.snap_id}`);
        console.log(`  Type: ${row.story_type}`);
        console.log(`  Processed At: ${row.processed_at}`);
        console.log(`  URL: ${row.story_url.substring(0, 100)}...`);
      });
    } else {
      console.log(`❌ No exact matches found in processed_stories`);
    }
  } catch (error) {
    console.error(`❌ Error searching processed_stories: ${error.message}`);
  }

  // 2. Search in snapchat_recent_stories_cache (exact match)
  console.log("\n🔍 Searching snapchat_recent_stories_cache (exact match)...");
  try {
    const { data, error } = await supabase
      .from("snapchat_recent_stories_cache")
      .select("*")
      .eq("snap_id", TARGET_SNAP_ID);

    if (error) throw error;

    if (data && data.length > 0) {
      console.log(`✅ FOUND ${data.length} exact match(es) in recent_cache!`);
      results.exactMatches.push(...data.map(d => ({ ...d, table: "snapchat_recent_stories_cache" })));
      
      data.forEach((row, i) => {
        console.log(`\n--- Match ${i + 1} ---`);
        console.log(`  ID: ${row.id}`);
        console.log(`  Username: ${row.username}`);
        console.log(`  Snap ID: ${row.snap_id}`);
        console.log(`  Type: ${row.story_type}`);
        console.log(`  Order: ${row.story_order}`);
        console.log(`  Cached At: ${row.cached_at}`);
        console.log(`  URL: ${row.story_url.substring(0, 100)}...`);
      });
    } else {
      console.log(`❌ No exact matches found in recent_cache`);
    }
  } catch (error) {
    console.error(`❌ Error searching recent_cache: ${error.message}`);
  }

  // 3. Search for partial matches (contains the ID)
  console.log("\n🔍 Searching for partial matches (ID contains target)...");
  try {
    const { data, error } = await supabase
      .from("snapchat_processed_stories")
      .select("*")
      .ilike("snap_id", `%${TARGET_SNAP_ID.substring(20, 50)}%`);

    if (error) throw error;

    if (data && data.length > 0) {
      console.log(`⚠️ FOUND ${data.length} partial match(es)!`);
      results.partialMatches.push(...data);
      
      data.forEach((row, i) => {
        console.log(`\n--- Partial Match ${i + 1} ---`);
        console.log(`  Snap ID: ${row.snap_id}`);
        console.log(`  Processed At: ${row.processed_at}`);
        console.log(`  Match similarity: ${calculateSimilarity(row.snap_id, TARGET_SNAP_ID)}%`);
      });
    } else {
      console.log(`✅ No partial matches found`);
    }
  } catch (error) {
    console.error(`❌ Error searching partial matches: ${error.message}`);
  }

  // 4. Search for wolftyla entries with similar structure
  console.log("\n🔍 Searching for similar snap IDs (same prefix structure)...");
  try {
    // Extract the prefix pattern
    const prefix = TARGET_SNAP_ID.substring(0, 30); // First 30 chars
    
    const { data, error } = await supabase
      .from("snapchat_processed_stories")
      .select("*")
      .eq("username", "wolftyla")
      .ilike("snap_id", `${prefix}%`);

    if (error) throw error;

    if (data && data.length > 0) {
      console.log(`📊 FOUND ${data.length} snap(s) with similar prefix!`);
      results.similarIds.push(...data);
      
      data.forEach((row, i) => {
        console.log(`\n--- Similar ${i + 1} ---`);
        console.log(`  Snap ID: ${row.snap_id}`);
        console.log(`  Processed At: ${row.processed_at}`);
        console.log(`  Same as target: ${row.snap_id === TARGET_SNAP_ID ? "YES ✅" : "NO"}`);
      });
    } else {
      console.log(`✅ No similar snap IDs found with same prefix`);
    }
  } catch (error) {
    console.error(`❌ Error searching similar IDs: ${error.message}`);
  }

  // 5. Get all wolftyla snaps to check for pattern
  console.log("\n🔍 Analyzing all wolftyla snap IDs for patterns...");
  try {
    const { data, error } = await supabase
      .from("snapchat_processed_stories")
      .select("snap_id, processed_at")
      .eq("username", "wolftyla")
      .order("processed_at", { ascending: false })
      .limit(10);

    if (error) throw error;

    if (data && data.length > 0) {
      console.log(`\n📋 Last 10 processed snap IDs:`);
      data.forEach((row, i) => {
        const isMatch = row.snap_id === TARGET_SNAP_ID;
        console.log(`  ${i + 1}. ${row.snap_id.substring(0, 60)}... (${row.processed_at}) ${isMatch ? "🎯 THIS IS IT!" : ""}`);
      });
    }
  } catch (error) {
    console.error(`❌ Error analyzing patterns: ${error.message}`);
  }

  return results;
}

function calculateSimilarity(str1, str2) {
  const len1 = str1.length;
  const len2 = str2.length;
  const maxLen = Math.max(len1, len2);
  
  let matches = 0;
  for (let i = 0; i < Math.min(len1, len2); i++) {
    if (str1[i] === str2[i]) matches++;
  }
  
  return Math.round((matches / maxLen) * 100);
}

async function main() {
  try {
    const results = await searchSnapId();

    console.log("\n\n");
    console.log("=" .repeat(80));
    console.log("📊 SEARCH RESULTS SUMMARY");
    console.log("=" .repeat(80));

    console.log(`\n✅ Exact Matches: ${results.exactMatches.length}`);
    if (results.exactMatches.length > 0) {
      console.log("   Tables found in:");
      results.exactMatches.forEach(match => {
        console.log(`   - ${match.table} (processed: ${match.processed_at || match.cached_at})`);
      });
    }

    console.log(`\n⚠️  Partial Matches: ${results.partialMatches.length}`);
    console.log(`📊 Similar IDs: ${results.similarIds.length}`);

    console.log("\n\n");
    console.log("🎯 CONCLUSION:");
    console.log("=" .repeat(80));

    if (results.exactMatches.length > 0) {
      console.log("❌ DUPLICATE CONFIRMED!");
      console.log("   This snap ID was previously processed.");
      console.log("   The deduplication logic correctly prevented re-processing.");
      console.log("\n   Processed entries:");
      results.exactMatches.forEach((match, i) => {
        console.log(`   ${i + 1}. Table: ${match.table}`);
        console.log(`      Date: ${match.processed_at || match.cached_at}`);
        console.log(`      ID: ${match.id}`);
      });
    } else {
      console.log("✅ NOT A DUPLICATE!");
      console.log("   This snap ID does NOT exist in the database.");
      console.log("   The issue is likely something else:");
      console.log("   - Snap may not have been found during polling");
      console.log("   - Polling may have failed at that time");
      console.log("   - API may have returned different data");
      console.log("   - Snap may have expired before polling");
    }

    console.log("\n");
  } catch (error) {
    console.error("❌ Fatal error:", error);
    process.exit(1);
  }
}

main();

