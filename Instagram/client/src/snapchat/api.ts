// Direct API calls to Python service (bypassing Node.js proxy for manual operations)
export const SNAP_BASE: string = "http://localhost:8000";

// Unified logging format (same as Python loguru)
const getTimestamp = () => {
  const now = new Date();
  return now.toISOString().replace("T", " ").substring(0, 23);
};

const snapchatLog = (
  level: string,
  module: string,
  function_name: string,
  line: number,
  message: string
) => {
  const timestamp = getTimestamp();
  const level_padded = level.padEnd(8);
  console.log(
    `${timestamp} | ${level_padded} | ${module}:${function_name}:${line} - ${message}`
  );
};

// Helper functions for different log levels
const logInfo = (
  module: string,
  function_name: string,
  line: number,
  message: string
) => snapchatLog("INFO", module, function_name, line, message);
const logError = (
  module: string,
  function_name: string,
  line: number,
  message: string
) => snapchatLog("ERROR", module, function_name, line, message);

export async function startDownload(
  username: string,
  downloadType: "stories" | "highlights" | "spotlights" = "stories",
  sendToTelegram: boolean = false
) {
  const res = await fetch(`${SNAP_BASE}/download`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username,
      download_type: downloadType,
      send_to_telegram: sendToTelegram,
    }),
  });
  if (!res.ok) {
    const error = await res.json();
    const errorMessage =
      error.detail ||
      error.message ||
      error.error ||
      "Snapchat download failed";
    throw new Error(
      typeof errorMessage === "string"
        ? errorMessage
        : JSON.stringify(errorMessage)
    );
  }
  return res.json();
}

export async function getGallery(
  username: string,
  mediaType: "stories" | "highlights" | "spotlights" = "stories"
) {
  // If username is empty, get gallery for all users
  const url = username
    ? `${SNAP_BASE}/gallery/${encodeURIComponent(username)}/${mediaType}`
    : `${SNAP_BASE}/gallery/${mediaType}`;

  logInfo("snapchat.api", "getGallery", 45, `🌐 Fetching gallery from: ${url}`);

  const res = await fetch(url);
  logInfo(
    "snapchat.api",
    "getGallery",
    47,
    `📊 Gallery response status: ${res.status}`
  );

  if (!res.ok) {
    const error = await res.json();
    const errorMessage =
      error.detail || error.message || error.error || "Gallery fetch failed";
    logError(
      "snapchat.api",
      "getGallery",
      53,
      `❌ Gallery fetch failed: ${errorMessage}`
    );
    throw new Error(
      typeof errorMessage === "string"
        ? errorMessage
        : JSON.stringify(errorMessage)
    );
  }

  const data = await res.json();
  logInfo(
    "snapchat.api",
    "getGallery",
    61,
    `📄 Gallery data received: status=${data.status}, mediaCount=${
      data.media?.length || 0
    }`
  );

  // Normalize URLs to be absolute (use Python service origin)
  if (data.media) {
    data.media = data.media.map((item: any) => ({
      ...item,
      download_url: item.download_url?.startsWith("http")
        ? item.download_url
        : `http://localhost:8000${item.download_url}`,
      thumbnail_url: item.thumbnail_url?.startsWith("http")
        ? item.thumbnail_url
        : `http://localhost:8000${item.thumbnail_url}`,
    }));
  }

  return data;
}

export async function getProgress(
  username: string,
  mediaType: "stories" | "highlights" | "spotlights" = "stories"
) {
  const res = await fetch(
    `${SNAP_BASE}/progress/${encodeURIComponent(username)}/${mediaType}`
  );
  if (!res.ok) {
    const error = await res.json();
    const errorMessage =
      error.detail || error.message || error.error || "Progress fetch failed";
    throw new Error(
      typeof errorMessage === "string"
        ? errorMessage
        : JSON.stringify(errorMessage)
    );
  }
  return res.json();
}

export async function sendToTelegram(
  mediaUrl: string,
  type: "photo" | "video",
  options: {
    caption?: string;
    originalUrl?: string;
    source?: "snapchat" | "instagram";
  } = {}
) {
  const res = await fetch(`${SNAP_BASE}/send-to-telegram`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mediaUrl,
      type,
      caption: options.caption,
      originalUrl: options.originalUrl,
      source: options.source || "snapchat",
    }),
  });

  if (!res.ok) {
    const error = await res.json();
    const errorMessage =
      error.detail || error.message || error.error || "Telegram send failed";
    throw new Error(
      typeof errorMessage === "string"
        ? errorMessage
        : JSON.stringify(errorMessage)
    );
  }

  return res.json();
}

export async function clearCache() {
  const res = await fetch(`${SNAP_BASE}/clear-cache`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) {
    const error = await res.json();
    const errorMessage =
      error.detail || error.message || error.error || "Cache clear failed";
    throw new Error(
      typeof errorMessage === "string"
        ? errorMessage
        : JSON.stringify(errorMessage)
    );
  }
  return res.json();
}
