// scripts/healthCheck.js
// Reusable health check functions for both rotation and deployment workflows

const fetch = require("node-fetch");

async function checkServiceHealth(serviceUrl, serviceName) {
  try {
    const healthUrl = `${serviceUrl}/health`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    const resp = await fetch(healthUrl, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "User-Agent": "Health-Check-Script/1.0",
      },
    });

    clearTimeout(timeoutId);

    if (resp.ok && resp.status < 500) {
      try {
        const data = await resp.json();
        return { healthy: true, status: resp.status, data };
      } catch {
        return { healthy: true, status: resp.status };
      }
    }

    return { healthy: false, status: resp.status, error: `HTTP ${resp.status}` };
  } catch (error) {
    if (error.name === "AbortError") {
      return { healthy: false, error: "Request timeout" };
    }
    return { healthy: false, error: error.message };
  }
}

async function waitForServicesReady(instagramUrl, snapchatUrl, maxWaitTime = 600000) {
  // maxWaitTime: 10 minutes default (increased from 5 minutes)
  let startTime = Date.now();
  let extendedDeadline = startTime + maxWaitTime;
  const checkInterval = 15000; // Check every 15 seconds
  const extensionTime = 300000; // 5 minutes extension when one service becomes healthy

  console.log(`[Health Check] Waiting for both services to be healthy...`);
  console.log(`[Health Check]   Instagram: ${instagramUrl}`);
  console.log(`[Health Check]   Snapchat: ${snapchatUrl}`);
  console.log(`[Health Check]   Initial timeout: ${maxWaitTime / 1000}s`);
  console.log(`[Health Check]   Timeout will extend by ${extensionTime / 1000}s when one service becomes healthy`);

  let instagramHealthy = false;
  let snapchatHealthy = false;

  while (Date.now() < extendedDeadline) {
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    const remaining = Math.round((extendedDeadline - Date.now()) / 1000);

    const instagramHealth = await checkServiceHealth(instagramUrl, "Instagram");
    const snapchatHealth = await checkServiceHealth(snapchatUrl, "Snapchat");

    // Track if services just became healthy
    const instagramJustHealthy = !instagramHealthy && instagramHealth.healthy;
    const snapchatJustHealthy = !snapchatHealthy && snapchatHealth.healthy;

    instagramHealthy = instagramHealth.healthy;
    snapchatHealthy = snapchatHealth.healthy;

    // If one service just became healthy, extend the deadline
    if ((instagramJustHealthy || snapchatJustHealthy) && !(instagramHealthy && snapchatHealthy)) {
      extendedDeadline = Date.now() + extensionTime;
      const serviceName = instagramJustHealthy ? "Instagram" : "Snapchat";
      console.log(
        `[Health Check] ✅ ${serviceName} is healthy! Extending timeout by ${extensionTime / 1000}s for the other service...`
      );
    }

    if (instagramHealthy && snapchatHealthy) {
      console.log(`[Health Check] ✅ Both services are healthy! (${elapsed}s elapsed)`);
      return true;
    }

    const instagramStatus = instagramHealthy
      ? "✅ Healthy"
      : `❌ Unhealthy (${instagramHealth.error || `HTTP ${instagramHealth.status}`})`;
    const snapchatStatus = snapchatHealthy
      ? "✅ Healthy"
      : `❌ Unhealthy (${snapchatHealth.error || `HTTP ${snapchatHealth.status}`})`;

    console.log(
      `[Health Check] Services not ready yet (${elapsed}s elapsed, ${remaining}s remaining):`
    );
    console.log(`[Health Check]   Instagram: ${instagramStatus}`);
    console.log(`[Health Check]   Snapchat: ${snapchatStatus}`);

    await new Promise((resolve) => setTimeout(resolve, checkInterval));
  }

  const finalElapsed = Math.round((Date.now() - startTime) / 1000);
  console.warn(
    `[Health Check] ⚠️ Services did not become healthy within ${finalElapsed}s (extended timeout: ${Math.round((extendedDeadline - startTime) / 1000)}s)`
  );
  console.warn(
    `[Health Check] Final status - Instagram: ${instagramHealthy ? "✅" : "❌"}, Snapchat: ${snapchatHealthy ? "✅" : "❌"}`
  );
  return false;
}

// If run directly (not imported), determine active account and wait
if (require.main === module) {
  async function main() {
    // Try to determine active account from Vercel, or default to Account A
    let instagramUrl = process.env.INSTAGRAM_ACCOUNT1_URL;
    let snapchatUrl = process.env.SNAPCHAT_ACCOUNT1_URL;
    let activeAccount = "A";
    
    // If Account 2 URLs are provided, check if we should use them
    // For testing, you can set ACTIVE_ACCOUNT env var
    if (process.env.ACTIVE_ACCOUNT === "B") {
      instagramUrl = process.env.INSTAGRAM_ACCOUNT2_URL;
      snapchatUrl = process.env.SNAPCHAT_ACCOUNT2_URL;
      activeAccount = "B";
    }
    
    // If not specified, check both accounts and use whichever is healthy
    if (!instagramUrl || !snapchatUrl) {
      console.log("Checking both accounts to find active services...");
      const account1Ready = await waitForServicesReady(
        process.env.INSTAGRAM_ACCOUNT1_URL,
        process.env.SNAPCHAT_ACCOUNT1_URL,
        30000 // Quick 30s check
      );
      
      if (account1Ready) {
        instagramUrl = process.env.INSTAGRAM_ACCOUNT1_URL;
        snapchatUrl = process.env.SNAPCHAT_ACCOUNT1_URL;
        activeAccount = "A";
      } else {
        instagramUrl = process.env.INSTAGRAM_ACCOUNT2_URL;
        snapchatUrl = process.env.SNAPCHAT_ACCOUNT2_URL;
        activeAccount = "B";
      }
    }

    if (!instagramUrl || !snapchatUrl) {
      console.error("Missing service URLs. Set INSTAGRAM_ACCOUNT*_URL and SNAPCHAT_ACCOUNT*_URL");
      process.exit(1);
    }

    console.log(`Using Account ${activeAccount} services`);
    const ready = await waitForServicesReady(instagramUrl, snapchatUrl);
    process.exit(ready ? 0 : 1);
  }

  main();
}

module.exports = { checkServiceHealth, waitForServicesReady };

