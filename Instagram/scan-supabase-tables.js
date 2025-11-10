// Supabase Database Scanner
// Scans all tables and displays their contents
require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");

// Initialize Supabase client
const supabaseUrl =
  process.env.SUPABASE_URL || "https://tuvyckzfwdtaieajlszb.supabase.co";
const supabaseKey =
  process.env.SUPABASE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR1dnlja3pmd2R0YWllYWpsc3piIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU4MTk3MjIsImV4cCI6MjA3MTM5NTcyMn0.-BNhNk3iO8WguyU6liZfJ4Vxuat5YG7wTHuDRumkbG8";

const supabase = createClient(supabaseUrl, supabaseKey);

// All tables to scan
const TABLES = {
  instagram: [
    "cache_cleanup_log",
    "processed_posts",
    "processed_stories",
    "recent_posts_cache",
    "recent_stories_cache",
  ],
  snapchat: [
    "snapchat_cache_cleanup_log",
    "snapchat_processed_stories",
    "snapchat_recent_stories_cache",
  ],
};

async function scanTable(tableName) {
  try {
    console.log(`\n${"=".repeat(80)}`);
    console.log(`📊 Table: ${tableName}`);
    console.log(`${"=".repeat(80)}`);

    // Get total count
    const { count, error: countError } = await supabase
      .from(tableName)
      .select("*", { count: "exact", head: true });

    if (countError) {
      console.error(`❌ Error getting count: ${countError.message}`);
      return;
    }

    console.log(`📈 Total rows: ${count || 0}`);

    if (count === 0) {
      console.log("📭 Table is empty\n");
      return;
    }

    // Get all data (limit to 1000 for safety)
    const { data, error } = await supabase
      .from(tableName)
      .select("*")
      .order("id", { ascending: false })
      .limit(1000);

    if (error) {
      console.error(`❌ Error fetching data: ${error.message}`);
      return;
    }

    if (!data || data.length === 0) {
      console.log("📭 No data found\n");
      return;
    }

    // Display column headers
    const columns = Object.keys(data[0]);
    console.log(`\n📋 Columns: ${columns.join(", ")}`);

    // Display first few rows
    const displayLimit = Math.min(10, data.length);
    console.log(`\n📄 First ${displayLimit} rows:\n`);

    data.slice(0, displayLimit).forEach((row, index) => {
      console.log(`\n--- Row ${index + 1} ---`);
      columns.forEach((col) => {
        let value = row[col];

        // Format value for display
        if (value === null) {
          value = "NULL";
        } else if (typeof value === "object") {
          value = JSON.stringify(value);
        } else if (typeof value === "string" && value.length > 100) {
          value = value.substring(0, 100) + "...";
        }

        console.log(`  ${col}: ${value}`);
      });
    });

    if (data.length > displayLimit) {
      console.log(`\n... and ${data.length - displayLimit} more rows`);
    }

    // Statistics
    console.log(`\n📊 Statistics:`);

    // If there's a username column, count by username
    if (columns.includes("username")) {
      const usernames = [...new Set(data.map((row) => row.username))];
      console.log(`  Unique usernames: ${usernames.length}`);
      console.log(`  Usernames: ${usernames.join(", ")}`);

      // Count per username
      const usernameCounts = {};
      data.forEach((row) => {
        usernameCounts[row.username] = (usernameCounts[row.username] || 0) + 1;
      });

      console.log(`  Counts per username:`);
      Object.entries(usernameCounts)
        .sort((a, b) => b[1] - a[1])
        .forEach(([username, count]) => {
          console.log(`    @${username}: ${count} entries`);
        });
    }

    // If there's a created_at or cached_at column, show date range
    const dateColumns = [
      "created_at",
      "cached_at",
      "processed_at",
      "cleaned_at",
    ];
    const dateCol = dateColumns.find((col) => columns.includes(col));

    if (dateCol) {
      const dates = data
        .map((row) => row[dateCol])
        .filter(Boolean)
        .map((d) => new Date(d))
        .sort((a, b) => a - b);

      if (dates.length > 0) {
        console.log(`  Date range (${dateCol}):`);
        console.log(`    Oldest: ${dates[0].toISOString()}`);
        console.log(`    Newest: ${dates[dates.length - 1].toISOString()}`);
      }
    }

    console.log("");
  } catch (error) {
    console.error(`❌ Error scanning table ${tableName}:`, error.message);
  }
}

async function main() {
  console.log("🔍 Supabase Database Scanner");
  console.log("============================\n");
  console.log(`📡 Connected to: ${supabaseUrl}`);
  console.log(
    `🔑 Using service key: ${supabaseKey.substring(0, 20)}...${supabaseKey.slice(-10)}`
  );

  // Scan Instagram tables
  console.log("\n\n");
  console.log("🟣 INSTAGRAM TABLES");
  console.log("=".repeat(80));

  for (const table of TABLES.instagram) {
    await scanTable(table);
  }

  // Scan Snapchat tables
  console.log("\n\n");
  console.log("🟡 SNAPCHAT TABLES");
  console.log("=".repeat(80));

  for (const table of TABLES.snapchat) {
    await scanTable(table);
  }

  console.log("\n\n");
  console.log("✅ Database scan complete!");
  console.log("\n📊 Summary:");

  // Get totals for all tables
  for (const category of Object.keys(TABLES)) {
    console.log(`\n${category.toUpperCase()}:`);
    for (const table of TABLES[category]) {
      try {
        const { count } = await supabase
          .from(table)
          .select("*", { count: "exact", head: true });
        console.log(`  ${table}: ${count || 0} rows`);
      } catch (error) {
        console.log(`  ${table}: Error - ${error.message}`);
      }
    }
  }

  console.log("\n");
}

// Run the scanner
main().catch((error) => {
  console.error("❌ Fatal error:", error);
  process.exit(1);
});

