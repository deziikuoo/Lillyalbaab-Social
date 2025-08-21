export const SNAP_BASE: string =
  (import.meta as any).env?.VITE_SNAPCHAT_API_BASE || "/snapchat-api";

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
    throw new Error(error.detail || "Snapchat download failed");
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

  const res = await fetch(url);
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.detail || "Gallery fetch failed");
  }

  const data = await res.json();

  // Normalize URLs to be absolute
  if (data.media) {
    data.media = data.media.map((item: any) => ({
      ...item,
      download_url: item.download_url?.startsWith("http")
        ? item.download_url
        : `${window.location.origin}${item.download_url}`,
      thumbnail_url: item.thumbnail_url?.startsWith("http")
        ? item.thumbnail_url
        : `${window.location.origin}${item.thumbnail_url}`,
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
    throw new Error(error.detail || "Progress fetch failed");
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
    throw new Error(error.detail || "Telegram send failed");
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
    throw new Error(error.detail || "Cache clear failed");
  }
  return res.json();
}
