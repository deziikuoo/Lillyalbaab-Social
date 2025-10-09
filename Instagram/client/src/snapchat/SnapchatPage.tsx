import React, { useState, useEffect } from "react";
import { getGallery, sendToTelegram } from "./api";
import { createProgressSocket } from "./ProgressWS";

interface DownloadItem {
  quality?: string;
  thumb?: string;
  url: string;
  isProgress?: boolean;
  carouselIndex?: number;
  isVideo?: boolean;
}

const SnapchatPage: React.FC = () => {
  const [mediaType, setMediaType] = useState<
    "stories" | "highlights" | "spotlights"
  >("stories");
  const [galleryItems, setGalleryItems] = useState<DownloadItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sendingStatus, setSendingStatus] = useState<{
    [key: number]: "idle" | "sending" | "success" | "error";
  }>({});
  const [telegramErrors, setTelegramErrors] = useState<{
    [key: number]: string;
  }>({});

  const fetchGallery = async () => {
    console.log(`🔄 [SNAPCHAT GALLERY] Fetching ${mediaType} gallery...`);
    setLoading(true);
    setError(null);

    try {
      const data = await getGallery("", mediaType);
      console.log(
        `📊 [SNAPCHAT GALLERY] Received ${data.media?.length || 0} items`
      );
      setGalleryItems(data.media || []);

      if (data.media && data.media.length > 0) {
        console.log(
          "📱 [SNAPCHAT GALLERY] Gallery items:",
          data.media.map((item: any) => ({
            filename: item.filename,
            type: item.type,
            download_status: item.download_status,
          }))
        );
      } else {
        console.log("📭 [SNAPCHAT GALLERY] No items found in gallery");
      }
    } catch (err: any) {
      console.error("❌ [SNAPCHAT GALLERY] Fetch error:", err);
      setError(err.message || "Failed to fetch gallery");
    } finally {
      setLoading(false);
      console.log("🏁 [SNAPCHAT GALLERY] Fetch completed");
    }
  };

  const handleSendToTelegram = async (itemIndex: number, mediaUrl: string) => {
    setSendingStatus((prev) => ({ ...prev, [itemIndex]: "sending" }));
    setTelegramErrors((prev) => ({ ...prev, [itemIndex]: "" }));

    try {
      const item = galleryItems[itemIndex];
      const response = await sendToTelegram(
        mediaUrl,
        item.isVideo ? "video" : "photo",
        {
          caption: `✨ New ${mediaType} content! 📱`,
          source: "snapchat",
        }
      );

      if (response.success) {
        setSendingStatus((prev) => ({ ...prev, [itemIndex]: "success" }));
        setTimeout(() => {
          setSendingStatus((prev) => ({ ...prev, [itemIndex]: "idle" }));
        }, 2000);
      } else {
        setSendingStatus((prev) => ({ ...prev, [itemIndex]: "error" }));
        setTelegramErrors((prev) => ({
          ...prev,
          [itemIndex]: response.detail || "Failed to send to Telegram",
        }));
      }
    } catch (err: any) {
      setSendingStatus((prev) => ({ ...prev, [itemIndex]: "error" }));
      setTelegramErrors((prev) => ({ ...prev, [itemIndex]: err.message }));
    }
  };

  useEffect(() => {
    fetchGallery();
  }, [mediaType]);

  // Auto-refresh gallery every 5 seconds when there are items (more frequent for real-time updates)
  useEffect(() => {
    if (galleryItems.length > 0) {
      const interval = setInterval(() => {
        console.log("🔄 [SNAPCHAT GALLERY] Auto-refreshing gallery...");
        fetchGallery();
      }, 5000);

      return () => clearInterval(interval);
    }
  }, [galleryItems.length]);

  // Listen for manual download completion events
  useEffect(() => {
    const handleDownloadComplete = () => {
      console.log(
        "🔄 [SNAPCHAT GALLERY] Manual download detected, refreshing gallery..."
      );
      setTimeout(() => {
        fetchGallery();
      }, 1000);
    };

    // Listen for custom events from manual downloads
    window.addEventListener(
      "snapchat-download-complete",
      handleDownloadComplete
    );

    return () => {
      window.removeEventListener(
        "snapchat-download-complete",
        handleDownloadComplete
      );
    };
  }, []);

  // More frequent refresh when gallery is empty (to catch new downloads)
  useEffect(() => {
    if (galleryItems.length === 0 && !loading) {
      const interval = setInterval(() => {
        console.log("🔍 [SNAPCHAT GALLERY] Checking for new downloads...");
        fetchGallery();
      }, 3000); // Check every 3 seconds when empty

      return () => clearInterval(interval);
    }
  }, [galleryItems.length, loading]);

  return (
    <div className="gallery-container">
      <div className="gallery-header">
        <h2>Snapchat Gallery</h2>
        <div className="gallery-controls">
          <select
            value={mediaType}
            onChange={(e) => setMediaType(e.target.value as any)}
            className="media-type-select"
          >
            <option value="stories">Stories</option>
            <option value="highlights">Highlights</option>
            <option value="spotlights">Spotlights</option>
          </select>
          <button
            onClick={fetchGallery}
            className="refresh-button"
            disabled={false}
          >
            {loading ? "🔄 Refreshing..." : "🔄 Refresh"}
          </button>
          <div className="gallery-status">
            <span className="status-text">
              {loading ? "🔄 Loading..." : `📱 ${galleryItems.length} items`}
            </span>
          </div>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}

      {loading && <div className="loading-message">Loading gallery...</div>}

      {!loading && galleryItems.length === 0 && (
        <div className="no-content">
          <div className="no-content-message">
            <h3>📭 No {mediaType} content found</h3>
            <p>Try the following:</p>
            <ul>
              <li>Use the manual download form above to download content</li>
              <li>Check if polling is active for automatic downloads</li>
              <li>Verify the target username is correct</li>
              <li>Try refreshing the gallery</li>
            </ul>
            <button onClick={fetchGallery} className="retry-button">
              🔄 Retry Gallery Load
            </button>
          </div>
        </div>
      )}

      {!loading && galleryItems.length > 0 && (
        <div className="gallery-grid">
          {galleryItems.map((item, idx) => (
            <div key={idx} className="gallery-item">
              {item.thumb && (
                <img
                  src={item.thumb}
                  alt="thumbnail"
                  className="gallery-thumbnail"
                />
              )}
              <div className="gallery-item-content">
                <div className="item-info">
                  <span className="item-filename">
                    {item.url
                      ? item.url.split("/").pop() || "Unknown file"
                      : "No URL available"}
                  </span>
                  <span className="item-type">{mediaType}</span>
                  <span className="item-timestamp">
                    {new Date().toLocaleDateString()}
                  </span>
                </div>
                <div className="item-actions">
                  {item.url && (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                      className="download-link"
                    >
                      Download
                    </a>
                  )}
                  {item.url && (
                    <button
                      onClick={() => handleSendToTelegram(idx, item.url)}
                      disabled={sendingStatus[idx] === "sending"}
                      className={`telegram-button ${
                        sendingStatus[idx] === "success"
                          ? "success"
                          : sendingStatus[idx] === "error"
                          ? "error"
                          : ""
                      }`}
                    >
                      {sendingStatus[idx] === "sending"
                        ? "📤 Sending..."
                        : sendingStatus[idx] === "success"
                        ? "✅ Sent!"
                        : sendingStatus[idx] === "error"
                        ? "❌ Failed"
                        : "📤 Send to Telegram"}
                    </button>
                  )}
                  {telegramErrors[idx] && (
                    <div className="telegram-error">{telegramErrors[idx]}</div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SnapchatPage;
