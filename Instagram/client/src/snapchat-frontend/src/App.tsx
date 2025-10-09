import React, { useState, useEffect, useMemo } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import SnapchatPage from "./snapchat/SnapchatPage";
import "./style.css";

// API base URL for Snapchat service
const API_BASE_URL = "/snapchat-api";

// Type definitions
interface DownloadItem {
  quality?: string;
  thumb?: string;
  url: string;
  isProgress?: boolean;
  carouselIndex?: number;
  isVideo?: boolean;
}

interface PollingStatus {
  enabled: boolean;
  active: boolean;
  started: boolean;
  target_username?: string;
  current_interval?: number;
  activity_level?: string;
}

const App: React.FC = () => {
  // Core download state
  const [username, setUsername] = useState("");
  const [downloadType, setDownloadType] = useState<
    "stories" | "highlights" | "spotlights"
  >("stories");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<DownloadItem[]>([]);

  // Telegram integration state
  const [autoSendToTelegram, setAutoSendToTelegram] = useState(true);
  const [sendingStatus, setSendingStatus] = useState<{
    [key: number]: "idle" | "sending" | "success" | "error";
  }>({});
  const [telegramErrors, setTelegramErrors] = useState<{
    [key: number]: string;
  }>({});

  // Target management state
  const [currentTarget, setCurrentTarget] = useState<string>("");
  const [newTarget, setNewTarget] = useState<string>("");
  const [targetLoading, setTargetLoading] = useState(false);
  const [targetError, setTargetError] = useState<string | null>(null);
  const [showTargetManager, setShowTargetManager] = useState(false);
  const [showPollingManager, setShowPollingManager] = useState(false);

  // Polling status state
  const [pollingStatus, setPollingStatus] = useState<PollingStatus>({
    enabled: false,
    active: false,
    started: false,
  });

  // Statistics state
  const [showStats, setShowStats] = useState(false);
  const [stats, setStats] = useState<any>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  // URL validation for Snapchat usernames
  const isValidSnapchatUsername = useMemo(() => {
    if (!username) return false;
    // Snapchat usernames: 3-15 characters, alphanumeric and underscores
    return /^[a-zA-Z0-9_]{3,15}$/.test(username.trim());
  }, [username]);

  // Fetch current target and polling status
  const fetchCurrentTarget = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/status`);
      const data = await response.json();
      setCurrentTarget(data.target_username || "");
      setPollingStatus({
        enabled: data.enabled || false,
        active: data.active || false,
        started: data.started || false,
        target_username: data.target_username,
        current_interval: data.current_interval,
        activity_level: data.activity_level,
      });
    } catch (error) {
      console.error("Failed to fetch current target:", error);
    }
  };

  // Set target username
  const setTarget = async (targetUsername: string) => {
    setTargetLoading(true);
    setTargetError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/set-target`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: targetUsername }),
      });

      const data = await response.json();

      if (response.ok) {
        setCurrentTarget(targetUsername);
        setShowTargetManager(false);
        setNewTarget("");
        await fetchCurrentTarget();
      } else {
        setTargetError(data.detail || "Failed to set target");
      }
    } catch (error) {
      setTargetError("Network error");
    } finally {
      setTargetLoading(false);
    }
  };

  // Start polling
  const startPolling = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/start-polling`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await response.json();
      if (data.success) {
        alert("Polling started successfully!");
        await fetchCurrentTarget();
      } else {
        alert(data.detail || "Failed to start polling");
      }
    } catch (error) {
      alert("Error starting polling");
    }
  };

  // Stop polling
  const stopPolling = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/stop-polling`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await response.json();
      if (data.success) {
        alert("Polling stopped successfully!");
        await fetchCurrentTarget();
      } else {
        alert(data.detail || "Failed to stop polling");
      }
    } catch (error) {
      alert("Error stopping polling");
    }
  };

  // Manual poll
  const manualPoll = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/poll-now?force=true`);
      const data = await response.json();
      if (data.success) {
        alert("Manual poll triggered successfully!");
        await fetchCurrentTarget();
      } else {
        alert(data.detail || "Failed to trigger manual poll");
      }
    } catch (error) {
      alert("Error triggering manual poll");
    }
  };

  // Fetch statistics
  const fetchStats = async () => {
    setStatsLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/stats`);
      const data = await response.json();
      setStats(data);
    } catch (error) {
      console.error("Failed to fetch stats:", error);
    } finally {
      setStatsLoading(false);
    }
  };

  // Download Snapchat content
  const handleDownload = async () => {
    if (!username.trim()) {
      setError("Please enter a username");
      return;
    }

    setLoading(true);
    setError(null);
    setItems([]);

    try {
      const response = await fetch(`${API_BASE_URL}/download`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username.trim(),
          download_type: downloadType,
          send_to_telegram: autoSendToTelegram,
        }),
      });

      const data = await response.json();

      if (response.ok && data.status === "success") {
        // Handle success - items will be available in gallery
        console.log("Download completed:", data.message);
        setUsername("");
      } else {
        setError(data.message || "Download failed");
      }
    } catch (err: any) {
      setError(err.message || "Download failed");
    } finally {
      setLoading(false);
    }
  };

  // Send to Telegram
  async function sendToTelegram(
    itemIndex: number,
    mediaUrl: string,
    originalSnapchatUrl?: string
  ) {
    setSendingStatus((prev) => ({ ...prev, [itemIndex]: "sending" }));
    setTelegramErrors((prev) => ({ ...prev, [itemIndex]: "" }));

    try {
      const response = await fetch(`${API_BASE_URL}/send-to-telegram`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mediaUrl,
          originalSnapchatUrl,
          caption: `✨ New ${downloadType} from <a href="https://snapchat.com/add/${
            currentTarget || "User not found"
          }">@${currentTarget || "User not found"}</a>! 📱`,
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setSendingStatus((prev) => ({ ...prev, [itemIndex]: "success" }));
        setTimeout(() => {
          setSendingStatus((prev) => ({ ...prev, [itemIndex]: "idle" }));
        }, 2000);
      } else {
        setSendingStatus((prev) => ({ ...prev, [itemIndex]: "error" }));
        setTelegramErrors((prev) => ({
          ...prev,
          [itemIndex]: data.detail || "Failed to send to Telegram",
        }));
      }
    } catch (err: any) {
      setSendingStatus((prev) => ({ ...prev, [itemIndex]: "error" }));
      setTelegramErrors((prev) => ({ ...prev, [itemIndex]: err.message }));
    }
  }

  // Clear cache
  const clearCache = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/clear-cache`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await response.json();
      if (data.success) {
        alert("Cache cleared successfully!");
      } else {
        alert(data.detail || "Failed to clear cache");
      }
    } catch (error) {
      alert("Error clearing cache");
    }
  };

  // Fetch current target on mount and every 3 seconds
  useEffect(() => {
    fetchCurrentTarget();
    const interval = setInterval(fetchCurrentTarget, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <BrowserRouter>
      <div className="app-container">
        <div className="content-wrapper">
          <h1 className="app-title">Snapchat Content Manager</h1>
          <p className="app-subtitle">
            Download Snapchat stories, highlights, and spotlights with automatic
            polling and Telegram integration.
          </p>

          {/* Target Management */}
          <div className="target-management">
            <div className="current-target">
              <span className="target-label">Currently tracking:</span>
              <span className="target-username">
                {currentTarget ? `@${currentTarget}` : "No target set"}
              </span>
              <div className="target-buttons">
                <button
                  className="btn-change-target"
                  onClick={() => setShowTargetManager(!showTargetManager)}
                >
                  Change Target
                </button>
                <button
                  className="btn-show-polling"
                  onClick={() => setShowPollingManager(!showPollingManager)}
                >
                  Polling Controls
                </button>
                <button
                  className="btn-show-stats"
                  onClick={() => {
                    setShowStats(!showStats);
                    if (!showStats) fetchStats();
                  }}
                >
                  Statistics
                </button>
              </div>
            </div>

            {showTargetManager && (
              <div className="target-manager">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (newTarget.trim()) {
                      setTarget(newTarget.trim());
                    }
                  }}
                  className="target-form"
                >
                  <div className="input-group">
                    <input
                      type="text"
                      value={newTarget}
                      onChange={(e) => setNewTarget(e.target.value)}
                      placeholder="Enter Snapchat username (e.g., username)"
                      className="target-input"
                      disabled={targetLoading}
                    />
                    <button
                      type="submit"
                      className="btn-update-target"
                      disabled={targetLoading || !newTarget.trim()}
                    >
                      {targetLoading ? "Updating..." : "Update"}
                    </button>
                  </div>
                  {targetError && (
                    <div className="target-error">{targetError}</div>
                  )}
                  <div className="target-examples">
                    <small>Examples: username, @username</small>
                  </div>
                </form>
              </div>
            )}

            {showPollingManager && (
              <div className="polling-manager">
                <div className="polling-controls">
                  <div className="polling-buttons">
                    {!pollingStatus.active ? (
                      <button
                        onClick={startPolling}
                        className="btn-start-polling"
                        title="Start automatic polling for new stories"
                      >
                        🚀 Start Polling
                      </button>
                    ) : (
                      <button
                        onClick={stopPolling}
                        className="btn-stop-polling"
                        title="Stop automatic polling"
                      >
                        🛑 Stop Polling
                      </button>
                    )}
                    <button
                      onClick={manualPoll}
                      className="btn-manual-poll"
                      title="Trigger a single manual poll"
                    >
                      🔄 Manual Poll
                    </button>
                  </div>
                  <small className="polling-info">
                    {pollingStatus.active
                      ? "Polling is active"
                      : "Polling is stopped"}
                    {pollingStatus.current_interval &&
                      ` (${pollingStatus.current_interval} min intervals)`}
                    {pollingStatus.activity_level &&
                      ` - Activity: ${pollingStatus.activity_level}`}
                  </small>
                </div>
              </div>
            )}

            {showStats && (
              <div className="stats-manager">
                <div className="stats-header">
                  <h3>Service Statistics</h3>
                  <button
                    onClick={fetchStats}
                    className="btn-refresh-stats"
                    disabled={statsLoading}
                  >
                    {statsLoading ? "Loading..." : "🔄 Refresh"}
                  </button>
                </div>
                {stats && (
                  <div className="stats-content">
                    <div className="stats-grid">
                      <div className="stat-item">
                        <span className="stat-label">Snapchat Requests:</span>
                        <span className="stat-value">
                          {stats.snapchat?.total || 0}
                        </span>
                      </div>
                      <div className="stat-item">
                        <span className="stat-label">Telegram Sends:</span>
                        <span className="stat-value">
                          {stats.telegram?.total || 0}
                        </span>
                      </div>
                      <div className="stat-item">
                        <span className="stat-label">Success Rate:</span>
                        <span className="stat-value">
                          {stats.snapchat?.total
                            ? `${Math.round(
                                (stats.snapchat.success /
                                  stats.snapchat.total) *
                                  100
                              )}%`
                            : "N/A"}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Telegram Toggle */}
          <div className="telegram-toggle-container">
            <label className="telegram-toggle">
              <input
                type="checkbox"
                checked={autoSendToTelegram}
                onChange={(e) => setAutoSendToTelegram(e.target.checked)}
              />
              <span className="toggle-slider"></span>
              <span className="toggle-label">📱 Auto-send to Telegram</span>
            </label>
          </div>

          {/* Main Content */}
          <Routes>
            <Route path="/" element={<SnapchatPage />} />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  );
};

export default App;
