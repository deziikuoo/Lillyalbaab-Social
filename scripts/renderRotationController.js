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
  const query =
    'from:no-reply@render.com subject:"Your free services are temporarily suspended" is:unread';

  const res = await gmail.users.messages.list({
    userId: "me",
    q: query,
    maxResults: 10,
  });

  return res.data.messages || [];
}

async function markMessagesRead(gmail, messages) {
  if (!messages.length) return;
  const ids = messages.map((m) => m.id);
  await gmail.users.messages.batchModify({
    userId: "me",
    requestBody: {
      ids,
      removeLabelIds: ["UNREAD"],
    },
  });
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
    }
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

async function switchVercelBackend(activeWhich) {
  const token = process.env.VERCEL_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  const teamId = process.env.VERCEL_TEAM_ID || "";

  const backendUrl =
    activeWhich === "A"
      ? process.env.BACKEND_ACCOUNT1_URL
      : process.env.BACKEND_ACCOUNT2_URL;

  if (!token || !projectId || !backendUrl) {
    throw new Error("Missing Vercel configuration");
  }

  console.log(`[Vercel] Updating backend URL to ${backendUrl}`);

  const envVars = [
    { key: "VITE_INSTAGRAM_API_BASE", value: backendUrl },
    { key: "VITE_SNAPCHAT_API_BASE", value: backendUrl },
  ];

  for (const { key, value } of envVars) {
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
      console.error(`[Vercel] Failed to update env ${key}: ${text}`);
    } else {
      console.log(`[Vercel] Updated env ${key}`);
    }
  }

  console.log("[Vercel] Triggering production redeploy");
  const deployUrl = new URL(`${VERCEL_API_BASE}/v13/deployments`);
  if (teamId) deployUrl.searchParams.set("teamId", teamId);

  const deployResp = await fetch(deployUrl.toString(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: "tyla-social",
      project: projectId,
      target: "production",
    }),
  });

  if (!deployResp.ok) {
    const text = await deployResp.text();
    console.error(`[Vercel] Failed to trigger deploy: ${text}`);
  } else {
    console.log("[Vercel] Deploy triggered successfully");
  }
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
