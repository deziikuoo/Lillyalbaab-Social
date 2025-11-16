// scripts/renderRotationController.js
// GitHub Actions controller to rotate between two Render accounts
// when free-tier services are suspended. It checks two Gmail accounts
// for new "Your free services are temporarily suspended" emails and,
// if found, suspends the exhausted account's services, resumes the
// other account's services, and updates Vercel backend URLs.

const { google } = require("googleapis");
const fetch = require("node-fetch");

const RENDER_API_BASE = "https://api.render.com/v1";
const VERCEL_API_BASE = "https://api.vercel.com";

function getGmailClient(kind) {
  // kind is 'A' or 'B'
  const clientId = process.env[`GMAIL_${kind}_CLIENT_ID`];
  const clientSecret = process.env[`GMAIL_${kind}_CLIENT_SECRET`];
  const refreshToken = process.env[`GMAIL_${kind}_REFRESH_TOKEN`];

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(`Missing Gmail OAuth credentials for account ${kind}`);
  }

  const oAuth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oAuth2Client.setCredentials({ refresh_token: refreshToken });

  return google.gmail({ version: "v1", auth: oAuth2Client });
}

async function findSuspensionEmails(gmail) {
  // Look for unread suspension emails from Render
  // Subject: "[Important] Your free services have been suspended"
  // From: no-reply@render.com
  const query =
    'from:no-reply@render.com subject:"Your free services have been suspended" is:unread';

  const res = await gmail.users.messages.list({
    userId: "me",
    q: query,
    maxResults: 10,
  });

  return res.data.messages || [];
}

async function markMessagesRead(gmail, messages) {
  if (!messages.length) return;
  try {
    const ids = messages.map((m) => m.id);
    await gmail.users.messages.batchModify({
      userId: "me",
      requestBody: {
        ids,
        removeLabelIds: ["UNREAD"],
      },
    });
    console.log(`[Gmail] Marked ${ids.length} message(s) as read`);
  } catch (err) {
    // Non-blocking: rotation already succeeded, just log the error
    console.warn(
      `[Gmail] Failed to mark messages as read (non-critical): ${err.message}`
    );
    console.warn(
      `[Gmail] Note: Regenerate OAuth tokens with 'gmail.modify' scope to enable this feature`
    );
  }
}

async function suspendRenderServices(which) {
  const apiKey =
    which === "A"
      ? process.env.RENDER_ACCOUNTA_API_KEY
      : process.env.RENDER_ACCOUNTB_API_KEY;

  const servicesJson =
    which === "A"
      ? process.env.RENDER_ACCOUNTA_SERVICES
      : process.env.RENDER_ACCOUNTB_SERVICES;

  if (!apiKey || !servicesJson) {
    throw new Error(`Missing Render config for account ${which}`);
  }

  const services = JSON.parse(servicesJson);

  for (const id of services) {
    console.log(`[Render] Suspending service ${id} (account ${which})`);
    const resp = await fetch(`${RENDER_API_BASE}/services/${id}/suspend`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!resp.ok) {
      const text = await resp.text();
      console.error(`[Render] Failed to suspend ${id}: ${resp.status} ${text}`);
    }
  }
}

async function resumeRenderServices(which) {
  const apiKey =
    which === "A"
      ? process.env.RENDER_ACCOUNTA_API_KEY
      : process.env.RENDER_ACCOUNTB_API_KEY;

  const servicesJson =
    which === "A"
      ? process.env.RENDER_ACCOUNTA_SERVICES
      : process.env.RENDER_ACCOUNTB_SERVICES;

  if (!apiKey || !servicesJson) {
    throw new Error(`Missing Render config for account ${which}`);
  }

  const services = JSON.parse(servicesJson);

  for (const id of services) {
    console.log(`[Render] Resuming service ${id} (account ${which})`);
    const resp = await fetch(`${RENDER_API_BASE}/services/${id}/resume`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!resp.ok) {
      const text = await resp.text();
      console.error(`[Render] Failed to resume ${id}: ${resp.status} ${text}`);
    } else {
      console.log(`[Render] Service ${id} resumed successfully`);

      // Trigger a manual deploy to get the latest commit
      console.log(`[Render] Triggering manual deploy for service ${id}...`);
      await triggerManualDeploy(apiKey, id);
    }
  }
}

async function triggerManualDeploy(apiKey, serviceId) {
  try {
    // Trigger manual deploy
    const deployResp = await fetch(
      `${RENDER_API_BASE}/services/${serviceId}/deploys`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          clearCache: false,
        }),
      }
    );

    if (!deployResp.ok) {
      const text = await deployResp.text();
      console.warn(
        `[Render] Failed to trigger deploy for ${serviceId}: ${text}`
      );
    } else {
      console.log(`[Render] Manual deploy triggered for service ${serviceId}`);
    }
  } catch (error) {
    console.warn(
      `[Render] Error triggering deploy for ${serviceId}: ${error.message}`
    );
  }
}

// UptimeRobot helpers
async function setUptimeMonitorsStatus(which, status) {
  // status: 0 = paused, 1 = active
  const apiKey = process.env.UPTIMEROBOT_API_KEY;
  if (!apiKey) {
    console.log("[UptimeRobot] API key not set - skipping monitor updates");
    return;
  }

  const monitorsJson =
    which === "A"
      ? process.env.UPTIMEROBOT_ACCOUNTA_MONITORS
      : process.env.UPTIMEROBOT_ACCOUNTB_MONITORS;

  if (!monitorsJson) {
    console.log(
      `[UptimeRobot] No monitor list configured for account ${which} - skipping`
    );
    return;
  }

  const ids = JSON.parse(monitorsJson);
  if (!ids.length) {
    console.log(
      `[UptimeRobot] Empty monitor list for account ${which} - skipping`
    );
    return;
  }

  for (const id of ids) {
    console.log(
      `[UptimeRobot] Setting monitor ${id} (account ${which}) to ${
        status === 1 ? "active" : "paused"
      }`
    );

    const body = new URLSearchParams({
      api_key: apiKey,
      format: "json",
      id: String(id),
      status: String(status), // 0 = paused, 1 = active
    });

    const resp = await fetch("https://api.uptimerobot.com/v2/editMonitor", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });

    if (!resp.ok) {
      const text = await resp.text();
      console.error(
        `[UptimeRobot] Failed to edit monitor ${id}: ${resp.status} ${text}`
      );
    }
  }
}

async function checkServiceHealth(serviceUrl, serviceName) {
  try {
    const healthUrl = `${serviceUrl}/health`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
    
    const resp = await fetch(healthUrl, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "User-Agent": "Render-Rotation-Controller/1.0",
      },
    });
    
    clearTimeout(timeoutId);
    
    if (resp.ok && resp.status < 500) {
      // Try to parse JSON response if available
      try {
        const data = await resp.json();
        return { healthy: true, status: resp.status, data };
      } catch {
        // If not JSON, just check status code
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

    // Check Instagram service
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

    // Log status
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
  
  // Fallback: If we've waited the full initial timeout (10 minutes), proceed anyway
  // Services may be ready but health checks are failing due to Render deployment delays
  if (finalElapsed >= maxWaitTime / 1000) {
    console.log(
      `[Health Check] ⏱️ Reached ${maxWaitTime / 1000}s timeout - proceeding with Vercel update anyway`
    );
    console.log(
      `[Health Check] Services may be ready but health checks are delayed. Vercel will deploy and services should be available.`
    );
    return true; // Proceed anyway after full timeout
  }
  
  console.warn(
    `[Health Check] Proceeding with Vercel update anyway - services may still be deploying`
  );
  return false;
}

async function switchVercelBackend(activeWhich) {
  const token = process.env.VERCEL_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  const teamId = process.env.VERCEL_TEAM_ID || "";

  // Get separate URLs for Instagram and Snapchat
  const instagramUrl =
    activeWhich === "A"
      ? process.env.INSTAGRAM_ACCOUNT1_URL
      : process.env.INSTAGRAM_ACCOUNT2_URL;

  const snapchatUrl =
    activeWhich === "A"
      ? process.env.SNAPCHAT_ACCOUNT1_URL
      : process.env.SNAPCHAT_ACCOUNT2_URL;

  if (!token || !projectId || !instagramUrl || !snapchatUrl) {
    throw new Error(
      "Missing Vercel configuration (need INSTAGRAM_ACCOUNT*_URL and SNAPCHAT_ACCOUNT*_URL)"
    );
  }

  console.log(`[Vercel] Updating backend URLs:`);
  console.log(`[Vercel]   Instagram: ${instagramUrl}`);
  console.log(`[Vercel]   Snapchat: ${snapchatUrl}`);

  const envVars = [
    { key: "VITE_INSTAGRAM_API_BASE", value: instagramUrl },
    { key: "VITE_SNAPCHAT_API_BASE", value: snapchatUrl },
  ];

  // First, get existing env vars to find their IDs
  const listUrl = new URL(`${VERCEL_API_BASE}/v9/projects/${projectId}/env`);
  if (teamId) listUrl.searchParams.set("teamId", teamId);

  const listResp = await fetch(listUrl.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!listResp.ok) {
    const text = await listResp.text();
    throw new Error(`Failed to list Vercel env vars: ${text}`);
  }

  const existingEnvs = await listResp.json();
  const envMap = new Map();
  // Find env vars that apply to production (may have multiple targets)
  existingEnvs.envs?.forEach((env) => {
    if (env.target?.includes("production")) {
      // If multiple env vars with same key exist, prefer the one with production
      if (!envMap.has(env.key) || env.target.includes("production")) {
        envMap.set(env.key, env);
      }
    }
  });

  // Update or create env vars
  for (const { key, value } of envVars) {
    const existing = envMap.get(key);

    if (existing) {
      // Update existing env var - preserve existing targets
      const url = new URL(
        `${VERCEL_API_BASE}/v9/projects/${projectId}/env/${existing.id}`
      );
      if (teamId) url.searchParams.set("teamId", teamId);

      const resp = await fetch(url.toString(), {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          value, // Only update the value, preserve existing targets
        }),
      });

      if (!resp.ok) {
        const text = await resp.text();
        console.error(`[Vercel] Failed to update env ${key}: ${text}`);
      } else {
        console.log(
          `[Vercel] Updated env ${key} (preserved targets: ${
            existing.target?.join(", ") || "none"
          })`
        );
      }
    } else {
      // Create new env var
      const url = new URL(`${VERCEL_API_BASE}/v9/projects/${projectId}/env`);
      if (teamId) url.searchParams.set("teamId", teamId);

      const resp = await fetch(url.toString(), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          key,
          value,
          target: ["production"],
          type: "plain",
        }),
      });

      if (!resp.ok) {
        const text = await resp.text();
        console.error(`[Vercel] Failed to create env ${key}: ${text}`);
      } else {
        console.log(`[Vercel] Created env ${key}`);
      }
    }
  }

  // Note: Vercel will automatically pick up the new env vars on the next deployment.
  // For immediate effect, you can manually trigger a redeploy from the Vercel dashboard.
  // The deployment API requires complex git source info, so we skip auto-deploy here.
  console.log(
    "[Vercel] Environment variables updated. They will be applied on the next deployment."
  );
  console.log(
    "[Vercel] To apply immediately, manually trigger a redeploy from the Vercel dashboard."
  );
}

async function handleAccount(kind) {
  const gmail = getGmailClient(kind);
  const messages = await findSuspensionEmails(gmail);

  if (!messages.length) {
    console.log(`[Gmail] No new suspension emails for account ${kind}.`);
    return;
  }

  console.log(
    `[Gmail] Found ${messages.length} suspension email(s) for account ${kind}.`
  );

  const exhausted = kind; // 'A' or 'B'
  const active = exhausted === "A" ? "B" : "A";

  await suspendRenderServices(exhausted);
  await resumeRenderServices(active);
  
  // Get service URLs for health checks
  const instagramUrl =
    active === "A"
      ? process.env.INSTAGRAM_ACCOUNT1_URL
      : process.env.INSTAGRAM_ACCOUNT2_URL;
  
  const snapchatUrl =
    active === "A"
      ? process.env.SNAPCHAT_ACCOUNT1_URL
      : process.env.SNAPCHAT_ACCOUNT2_URL;
  
  if (!instagramUrl || !snapchatUrl) {
    console.warn(
      `[Health Check] Service URLs not configured, skipping health check`
    );
  } else {
    // Wait for both services to be healthy before updating Vercel
    await waitForServicesReady(instagramUrl, snapchatUrl);
  }
  
  await switchVercelBackend(active);

  // Toggle UptimeRobot monitors
  await setUptimeMonitorsStatus(exhausted, 0); // pause exhausted account monitors
  await setUptimeMonitorsStatus(active, 1); // enable active account monitors

  await markMessagesRead(gmail, messages);

  console.log(
    `[Controller] Rotation complete. Active account is now ${active}.`
  );
}

async function main() {
  try {
    await handleAccount("A");
    await handleAccount("B");
  } catch (err) {
    console.error("[Controller] Failed:", err);
    process.exit(1);
  }
}

main();
