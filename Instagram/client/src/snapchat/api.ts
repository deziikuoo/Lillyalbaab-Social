// Snapchat API base URL with environment-aware configuration and fallbacks
export const SNAP_BASE: string =
  import.meta.env.VITE_SNAPCHAT_API_BASE ||
  (import.meta.env.PROD
    ? "https://tyla-social.onrender.com" // Production: Render (Node.js proxies to Python)
    : "/snapchat-api"); // Development: Use Vite proxy to avoid CORS

// Fallback URLs for graceful degradation
const FALLBACK_URLS = {
  development: ["/snapchat-api", "http://localhost:3000"],
  production: [
    "https://tyla-social.onrender.com",
    "https://tyla-social.vercel.app",
  ],
};

// Enhanced error handling with retry logic
const fetchWithFallback = async (
  url: string,
  options: RequestInit = {},
  maxRetries: number = 2
): Promise<Response> => {
  const fallbackUrls = import.meta.env.PROD
    ? FALLBACK_URLS.production
    : FALLBACK_URLS.development;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const currentUrl =
      attempt === 0
        ? url
        : fallbackUrls[attempt - 1] + url.replace(SNAP_BASE, "");

    try {
      logInfo(
        "snapchat.api",
        "fetchWithFallback",
        25,
        `🔄 Attempt ${attempt + 1}: ${currentUrl}`
      );

      const response = await fetch(currentUrl, {
        ...options,
        signal: AbortSignal.timeout(10000),
      });

      if (response.ok) {
        logInfo(
          "snapchat.api",
          "fetchWithFallback",
          35,
          `✅ Success on attempt ${attempt + 1}`
        );
        return response;
      }

      // If not ok but we have more attempts, continue to fallback
      if (attempt < maxRetries) {
        logInfo(
          "snapchat.api",
          "fetchWithFallback",
          41,
          `⚠️ Attempt ${attempt + 1} failed (${
            response.status
          }), trying fallback`
        );
        continue;
      }

      return response; // Return the last response even if not ok
    } catch (error) {
      lastError = error as Error;
      logError(
        "snapchat.api",
        "fetchWithFallback",
        48,
        `❌ Attempt ${attempt + 1} error: ${lastError.message}`
      );

      if (attempt < maxRetries) {
        logInfo(
          "snapchat.api",
          "fetchWithFallback",
          51,
          `🔄 Trying fallback URL...`
        );
        continue;
      }
    }
  }

  throw lastError || new Error("All API endpoints failed");
};

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

    // Normalize URLs to be absolute (use appropriate service origin)
    if (data.media) {
      const baseUrl = import.meta.env.PROD
        ? "https://tyla-social.onrender.com"
        : "/snapchat-api";

    data.media = data.media.map((item: any) => ({
      ...item,
      download_url: item.download_url?.startsWith("http")
        ? item.download_url
        : `${baseUrl}${item.download_url}`,
      thumbnail_url: item.thumbnail_url?.startsWith("http")
        ? item.thumbnail_url
        : `${baseUrl}${item.thumbnail_url}`,
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
