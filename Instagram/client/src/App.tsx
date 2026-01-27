import React, { useState, useEffect, useMemo } from "react";
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import SnapchatPage from "./snapchat/SnapchatPage";
import "./style.css";

// Instagram API base URL - use environment variable or fallback to defaults
const INSTAGRAM_API_BASE =
  import.meta.env.VITE_INSTAGRAM_API_BASE ||
  (import.meta.env.PROD
    ? "https://lillyalbaab-social.onrender.com" // Render backend for production
    : "http://localhost:3000"); // Local backend for development

// Snapchat API base URL - use environment variable or fallback to defaults
const SNAPCHAT_API_BASE =
  import.meta.env.VITE_SNAPCHAT_API_BASE ||
  (import.meta.env.PROD
    ? "https://tyla-social.onrender.com" // Same as Instagram backend (proxies to Python)
    : "http://localhost:8000"); // Direct Python service for development

// Debug: Log the API URL being used
console.log(
  "Environment:",
  import.meta.env.PROD ? "PRODUCTION" : "DEVELOPMENT"
);
console.log("Instagram API Base URL:", INSTAGRAM_API_BASE);
console.log("Snapchat API Base URL:", SNAPCHAT_API_BASE);

// Type definitions
interface DownloadItem {
  quality?: string;
  thumb?: string;
  url: string;
  isProgress?: boolean;
  carouselIndex?: number;
  isVideo?: boolean;
}

interface BackendItem {
  quality?: string;
  thumb?: string;
  thumbnail?: string; // Backend might use this instead
  url: string;
  isProgresser?: boolean; // Backend might use this field name
  isProgress?: boolean;
  isVideo?: boolean;
}

interface ApiResponse {
  developer: string;
  status: boolean;
  data?: BackendItem[];
  msg?: string;
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
  // Instagram state
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<DownloadItem[]>([]);

  // Helper function to proxy Instagram images through backend to avoid CORS
  const getProxiedImageUrl = (
    imageUrl: string | undefined
  ): string | undefined => {
    if (!imageUrl) return undefined;

    // Only proxy Instagram CDN URLs
    if (
      imageUrl.includes("cdninstagram.com") ||
      imageUrl.includes("scontent-") ||
      imageUrl.includes("instagram.com")
    ) {
      return `${INSTAGRAM_API_BASE}/proxy-image?url=${encodeURIComponent(
        imageUrl
      )}`;
    }

    // Return original URL for non-Instagram URLs
    return imageUrl;
  };

  // Snapchat state
  const [snapchatUsername, setSnapchatUsername] = useState("");
  const [downloadType, setDownloadType] = useState<
    "stories" | "highlights" | "spotlights"
  >("stories");
  const [snapchatLoading, setSnapchatLoading] = useState(false);
  const [snapchatError, setSnapchatError] = useState<string | null>(null);

  // Telegram functionality state
  const [autoSendToTelegram, setAutoSendToTelegram] = useState(true);
  const [sendingStatus, setSendingStatus] = useState<{
    [key: number]: "idle" | "sending" | "success" | "error";
  }>({});
  const [telegramErrors, setTelegramErrors] = useState<{
    [key: number]: string;
  }>({});

  // Target management state (separate for Instagram and Snapchat)
  const [instagramCurrentTargets, setInstagramCurrentTargets] = useState<
    string[]
  >([]);
  const [instagramCurrentTarget, setInstagramCurrentTarget] =
    useState<string>(""); // Backward compatibility - first target
  const [snapchatCurrentTarget, setSnapchatCurrentTarget] =
    useState<string>("");
  const [newTarget, setNewTarget] = useState<string>("");
  const [targetLoading, setTargetLoading] = useState(false);
  const [targetError, setTargetError] = useState<string | null>(null);
  const [showTargetManager, setShowTargetManager] = useState(false);
  const [showPollingManager, setShowPollingManager] = useState(false);

  // Instagram polling status state
  const [instagramPollingStatus, setInstagramPollingStatus] = useState<{
    enabled: boolean;
    active: boolean;
    started: boolean;
  }>({ enabled: false, active: false, started: false });

  // Snapchat polling status state
  const [snapchatPollingStatus, setSnapchatPollingStatus] =
    useState<PollingStatus>({
      enabled: false,
      active: false,
      started: false,
    });

  // Statistics state
  const [showStats, setShowStats] = useState(false);
  const [stats, setStats] = useState<any>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  // Snapchat username suggestions state
  const [snapchatSuggestions, setSnapchatSuggestions] = useState<string[]>([]);
  const [showSnapchatSuggestions, setShowSnapchatSuggestions] = useState(false);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);

  // Target suggestions state
  const [targetSuggestions, setTargetSuggestions] = useState<string[]>([]);
  const [showTargetSuggestions, setShowTargetSuggestions] = useState(false);
  const [targetSuggestionsLoading, setTargetSuggestionsLoading] =
    useState(false);

  // URL validation for Instagram
  const isValidIgUrl = useMemo(() => {
    if (!url) return false;
    return /(https?:\/\/)?(www\.)?instagram\.com\/(p|reel|tv|stories)\//i.test(
      url
    );
  }, [url]);

  // URL validation for Snapchat usernames
  const isValidSnapchatUsername = useMemo(() => {
    if (!snapchatUsername) return false;
    // Snapchat usernames: 3-15 characters, alphanumeric and underscores
    return /^[a-zA-Z0-9_]{3,15}$/.test(snapchatUsername.trim());
  }, [snapchatUsername]);

  // Function to clean Instagram URLs by removing img_index parameters
  const cleanInstagramUrl = (inputUrl: string): string => {
    try {
      const url = new URL(inputUrl);
      url.searchParams.delete("img_index");
      return url.toString();
    } catch (error) {
      // If URL parsing fails, return the original input
      return inputUrl;
    }
  };

  // Instagram target management functions
  const fetchInstagramCurrentTarget = async () => {
    try {
      const response = await fetch(`${INSTAGRAM_API_BASE}/target`);
      const data = await response.json();
      // Support both new array format and old single target format
      const targets =
        data.current_targets ||
        (data.current_target ? [data.current_target] : []);
      setInstagramCurrentTargets(targets);
      setInstagramCurrentTarget(targets.length > 0 ? targets[0] : ""); // Backward compatibility
      setInstagramPollingStatus({
        enabled: data.polling_enabled || false,
        active: data.polling_active || false,
        started: data.polling_started || false,
      });
    } catch (error) {
      console.error("Failed to fetch Instagram current target:", error);
    }
  };

  // Snapchat target management functions
  const fetchSnapchatCurrentTarget = async () => {
    try {
      const response = await fetch(`${SNAPCHAT_API_BASE}/snapchat-status`);
      const data = await response.json();
      setSnapchatCurrentTarget(data.target_username || "");
      setSnapchatPollingStatus({
        enabled: data.enabled || false,
        active: data.active || false,
        started: data.started || false,
        target_username: data.target_username,
        current_interval: data.current_interval,
        activity_level: data.activity_level,
      });
    } catch (error) {
      console.error("Failed to fetch Snapchat current target:", error);
    }
  };

  // Remove a single Instagram target
  const removeInstagramTarget = async (targetToRemove: string) => {
    if (!targetToRemove) {
      setTargetError("No target specified to remove");
      return;
    }

    setTargetLoading(true);
    setTargetError(null);

    try {
      const response = await fetch(
        `${INSTAGRAM_API_BASE}/target/${targetToRemove}`,
        {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        }
      );

      const data = await response.json();

      if (data.success) {
        // Update state with remaining targets
        setInstagramCurrentTargets(data.new_targets || []);
        setInstagramCurrentTarget(
          data.new_targets && data.new_targets.length > 0
            ? data.new_targets[0]
            : ""
        );
        await fetchInstagramCurrentTarget();
      } else {
        setTargetError(data.error || "Failed to remove target");
      }
    } catch (error) {
      setTargetError("Network error. Please try again.");
    } finally {
      setTargetLoading(false);
    }
  };

  // Set Instagram target(s) - supports single or multiple
  const changeInstagramTarget = async () => {
    if (!newTarget.trim()) {
      setTargetError("Please enter a username or URL");
      return;
    }

    setTargetLoading(true);
    setTargetError(null);

    try {
      // Check if multiple usernames (comma or newline separated)
      const input = newTarget.trim();
      const usernames = input
        .split(/[,\n]/)
        .map((u) => u.trim())
        .filter((u) => u.length > 0);
      
      const requestBody =
        usernames.length > 1 ? { usernames } : { username: usernames[0] };

      const response = await fetch(`${INSTAGRAM_API_BASE}/target`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();

      if (data.success) {
        // Update state with new targets
        const newTargets =
          data.new_targets || (data.new_target ? [data.new_target] : []);
        setInstagramCurrentTargets(newTargets);
        setInstagramCurrentTarget(newTargets.length > 0 ? newTargets[0] : "");
        setNewTarget("");
        setShowTargetManager(false);
        await fetchInstagramCurrentTarget();
      } else {
        setTargetError(data.error || "Failed to change target");
      }
    } catch (error) {
      setTargetError("Network error. Please try again.");
    } finally {
      setTargetLoading(false);
    }
  };

  // Set Snapchat target
  const setSnapchatTarget = async (targetUsername: string) => {
    setTargetLoading(true);
    setTargetError(null);

    try {
      const response = await fetch(`${SNAPCHAT_API_BASE}/snapchat-set-target`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: targetUsername }),
      });

      const data = await response.json();

      if (response.ok) {
        setSnapchatCurrentTarget(targetUsername);
        setShowTargetManager(false);
        setNewTarget("");
        await fetchSnapchatCurrentTarget();
      } else {
        // Handle different error response formats
        const errorMessage =
          data.detail || data.message || data.error || "Failed to set target";
        setTargetError(
          typeof errorMessage === "string"
            ? errorMessage
            : JSON.stringify(errorMessage)
        );
      }
    } catch (error) {
      console.error("Snapchat target error:", error);
      setTargetError("Network error");
    } finally {
      setTargetLoading(false);
    }
  };

  // Snapchat username suggestions with debouncing
  const debouncedFetchSuggestions = useMemo(() => {
    let timeoutId: ReturnType<typeof setTimeout>;
    return (input: string) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(async () => {
        if (input.trim().length >= 2) {
          setSuggestionsLoading(true);
          try {
            const response = await fetch(
              `${SNAPCHAT_API_BASE}/snapchat-targeted-usernames`
            );
            const data = await response.json();

            if (data.usernames) {
              const filtered = data.usernames.filter((username: string) =>
                username.toLowerCase().includes(input.toLowerCase())
              );
              setSnapchatSuggestions(filtered);
              setShowSnapchatSuggestions(filtered.length > 0);
            }
          } catch (error) {
            console.error("Error fetching suggestions:", error);
            setSnapchatSuggestions([]);
            setShowSnapchatSuggestions(false);
          } finally {
            setSuggestionsLoading(false);
          }
        } else {
          setSnapchatSuggestions([]);
          setShowSnapchatSuggestions(false);
        }
      }, 300); // 300ms debounce
    };
  }, []);

  const handleSnapchatUsernameChange = (value: string) => {
    setSnapchatUsername(value);
    debouncedFetchSuggestions(value);
  };

  const selectSuggestion = (username: string) => {
    setSnapchatUsername(username);
    setShowSnapchatSuggestions(false);
    setSnapchatSuggestions([]);
  };

  // Target username suggestions with debouncing
  const debouncedFetchTargetSuggestions = useMemo(() => {
    let timeoutId: ReturnType<typeof setTimeout>;
    return (input: string) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(async () => {
        if (input.trim().length >= 2) {
          setTargetSuggestionsLoading(true);
          try {
            const response = await fetch(
              `${SNAPCHAT_API_BASE}/snapchat-targeted-usernames`
            );
            const data = await response.json();

            if (data.usernames) {
              const filtered = data.usernames.filter((username: string) =>
                username.toLowerCase().includes(input.toLowerCase())
              );
              setTargetSuggestions(filtered);
              setShowTargetSuggestions(filtered.length > 0);
            }
          } catch (error) {
            console.error("Error fetching target suggestions:", error);
            setTargetSuggestions([]);
            setShowTargetSuggestions(false);
          } finally {
            setTargetSuggestionsLoading(false);
          }
        } else {
          setTargetSuggestions([]);
          setShowTargetSuggestions(false);
        }
      }, 300); // 300ms debounce
    };
  }, []);

  const handleTargetChange = (value: string) => {
    setNewTarget(value);
    debouncedFetchTargetSuggestions(value);
  };

  const selectTargetSuggestion = (username: string) => {
    setNewTarget(username);
    setShowTargetSuggestions(false);
    setTargetSuggestions([]);
  };

  // Instagram polling functions
  const startInstagramPolling = async () => {
    try {
      const response = await fetch(`${INSTAGRAM_API_BASE}/start-polling`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });
      const data = await response.json();
      if (data.success) {
        alert("Instagram polling started successfully!");
        await fetchInstagramCurrentTarget();
      } else {
        alert(data.error || "Failed to start Instagram polling");
      }
    } catch (error) {
      alert("Error starting Instagram polling");
    }
  };

  const stopInstagramPolling = async () => {
    try {
      const response = await fetch(`${INSTAGRAM_API_BASE}/stop-polling`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });
      const data = await response.json();
      if (data.success) {
        alert("Instagram polling stopped successfully!");
        await fetchInstagramCurrentTarget();
      } else {
        alert(data.error || "Failed to stop Instagram polling");
      }
    } catch (error) {
      alert("Error stopping Instagram polling");
    }
  };

  // Snapchat polling functions
  const startSnapchatPolling = async () => {
    try {
      const response = await fetch(
        `${SNAPCHAT_API_BASE}/snapchat-start-polling`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        }
      );
      const data = await response.json();
      if (data.success) {
        alert("Snapchat polling started successfully!");
        await fetchSnapchatCurrentTarget();
      } else {
        const errorMessage =
          data.detail ||
          data.message ||
          data.error ||
          "Failed to start Snapchat polling";
        alert(
          typeof errorMessage === "string"
            ? errorMessage
            : JSON.stringify(errorMessage)
        );
      }
    } catch (error) {
      console.error("Snapchat polling error:", error);
      alert("Error starting Snapchat polling");
    }
  };

  const stopSnapchatPolling = async () => {
    try {
      const response = await fetch(
        `${SNAPCHAT_API_BASE}/snapchat-stop-polling`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        }
      );
      const data = await response.json();
      if (data.success) {
        alert("Snapchat polling stopped successfully!");
        await fetchSnapchatCurrentTarget();
      } else {
        const errorMessage =
          data.detail ||
          data.message ||
          data.error ||
          "Failed to stop Snapchat polling";
        alert(
          typeof errorMessage === "string"
            ? errorMessage
            : JSON.stringify(errorMessage)
        );
      }
    } catch (error) {
      console.error("Snapchat polling error:", error);
      alert("Error stopping Snapchat polling");
    }
  };

  const manualSnapchatPoll = async () => {
    try {
      const response = await fetch(
        `${SNAPCHAT_API_BASE}/snapchat-poll-now?force=true`
      );
      const data = await response.json();
      if (data.success) {
        alert("Manual Snapchat poll triggered successfully!");
        await fetchSnapchatCurrentTarget();
      } else {
        const errorMessage =
          data.detail ||
          data.message ||
          data.error ||
          "Failed to trigger manual Snapchat poll";
        alert(
          typeof errorMessage === "string"
            ? errorMessage
            : JSON.stringify(errorMessage)
        );
      }
    } catch (error) {
      console.error("Snapchat manual poll error:", error);
      alert("Error triggering manual Snapchat poll");
    }
  };

  // Fetch Snapchat statistics
  const fetchSnapchatStats = async () => {
    setStatsLoading(true);
    try {
      const response = await fetch(`${SNAPCHAT_API_BASE}/snapchat-stats`);
      const data = await response.json();
      setStats(data);
    } catch (error) {
      console.error("Failed to fetch Snapchat stats:", error);
    } finally {
      setStatsLoading(false);
    }
  };

  // Instagram download function
  const fetchInstagramDownloads = async (url: string) => {
    setLoading(true);
    setError("");
    setItems([]);

    try {
      const res = await fetch(
        `${INSTAGRAM_API_BASE}/igdl?url=${encodeURIComponent(url)}`
      );

      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }

      const body = await res.json();
      const payload: ApiResponse | undefined = body as any;

      if (!payload || payload.status === false) {
        throw new Error(payload?.msg || "Failed to fetch download links");
      }

      const rawItems = payload.data || [];
      const processedItems: DownloadItem[] = [];

      const initialUrls = rawItems.map((item) => item.url);
      const initialUniqueUrls = new Set(initialUrls);
      const isFromGraphQL =
        initialUrls.length === initialUniqueUrls.size && initialUrls.length > 1;

      if (isFromGraphQL) {
        processedItems.push(
          ...rawItems.map((item: any) => ({
            quality: item.quality || undefined,
            thumb: item.thumb || item.thumbnail || undefined,
            url: item.url,
            isProgress: item.isProgresser || item.isProgress || false,
            carouselIndex: item.carouselIndex || undefined,
            isVideo: item.isVideo ?? item.is_video ?? undefined,
          }))
        );
      } else {
        const groupedItems = new Map<string, any[]>();

        for (const item of rawItems) {
          const thumb = item.thumb || item.thumbnail || "";
          if (!groupedItems.has(thumb)) {
            groupedItems.set(thumb, []);
          }
          groupedItems.get(thumb)!.push(item);
        }

        for (const [thumb, items] of groupedItems) {
          if (items.length === 0) continue;

          const sortedItems = items.sort((a, b) => {
            const qualityA = a.quality || "";
            const qualityB = b.quality || "";

            if (qualityA.includes("HD") && !qualityB.includes("HD")) return -1;
            if (qualityB.includes("HD") && !qualityA.includes("HD")) return 1;
            if (qualityA.includes("SD") && !qualityB.includes("SD")) return -1;
            if (qualityB.includes("SD") && !qualityA.includes("SD")) return 1;

            return 0;
          });

          const bestItem = sortedItems[0];
          processedItems.push({
            quality: bestItem.quality || undefined,
            thumb: bestItem.thumb || bestItem.thumbnail || undefined,
            url: bestItem.url,
            isProgress: bestItem.isProgresser || bestItem.isProgress || false,
            carouselIndex: bestItem.carouselIndex || undefined,
            isVideo: bestItem.isVideo ?? bestItem.is_video ?? undefined,
          });
        }
      }

      setItems(processedItems);
    } catch (err: any) {
      console.error("Fetch error:", err);
      setError(err?.message || "Unexpected error");
    } finally {
      setLoading(false);
    }
  };

  // Helper function to detect if input is a URL
  const isUrl = (input: string): boolean => {
    try {
      const url = new URL(input);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  };

  // Snapchat download function - Direct API call to Python service
  const handleSnapchatDownload = async () => {
    const input = snapchatUsername.trim();
    if (!input) {
      setSnapchatError("Please enter a username or URL");
      return;
    }

    const isUrlInput = isUrl(input);
    const username = isUrlInput ? null : input;
    const url = isUrlInput ? input : null;

    console.log(
      `\n🔍 [MANUAL SNAPCHAT] Starting download ${isUrlInput ? 'from URL' : `for @${username}`}`
    );
    if (isUrlInput) {
      console.log(`🔗 [MANUAL SNAPCHAT] URL: ${url}`);
    }
    console.log(`📱 [MANUAL SNAPCHAT] Download type: ${downloadType}`);
    console.log(`📤 [MANUAL SNAPCHAT] Send to Telegram: ${autoSendToTelegram}`);

    setSnapchatLoading(true);
    setSnapchatError(null);

    try {
      // Use snapchat-download endpoint which saves to disk (not /download which only sends to Telegram)
      const directApiUrl = `${SNAPCHAT_API_BASE}/snapchat-download`;
      const proxyApiUrl = `${SNAPCHAT_API_BASE}/snapchat-download`;

      console.log(
        `🌐 [MANUAL SNAPCHAT] Step 1: Making direct API request to: ${directApiUrl}`
      );
      console.log(`📋 [MANUAL SNAPCHAT] Request payload:`, {
        username: username,
        url: url,
        download_type: downloadType,
        send_to_telegram: autoSendToTelegram,
      });

      console.log("🔍 [MANUAL SNAPCHAT] About to make fetch request...");

      let response;
      try {
        // Try direct API call first
        const requestBody: any = {
          download_type: downloadType,
          send_to_telegram: autoSendToTelegram,
        };
        
        if (url) {
          requestBody.url = url;
        } else {
          requestBody.username = username;
        }
        
        response = await fetch(directApiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(requestBody),
        });
        console.log("🔍 [MANUAL SNAPCHAT] Direct API call successful");
      } catch (directError) {
        console.error(
          "🔍 [MANUAL SNAPCHAT] Direct API call failed:",
          directError
        );
        console.log("🔍 [MANUAL SNAPCHAT] Trying Node.js proxy as fallback...");

        // Fallback to Node.js proxy
        const fallbackRequestBody: any = {
          download_type: downloadType,
          send_to_telegram: autoSendToTelegram,
        };
        
        if (url) {
          fallbackRequestBody.url = url;
        } else {
          fallbackRequestBody.username = username;
        }
        
        response = await fetch(proxyApiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(fallbackRequestBody),
        });
        console.log("🔍 [MANUAL SNAPCHAT] Proxy API call successful");
      }

      console.log(
        "🔍 [MANUAL SNAPCHAT] Fetch request completed, status:",
        response.status
      );

      console.log(
        `📊 [MANUAL SNAPCHAT] Step 2: Response received - Status: ${response.status}`
      );

      const data = await response.json();
      console.log(`📄 [MANUAL SNAPCHAT] Step 3: Response data:`, data);

      if (response.ok && data.status === "success") {
        console.log(
          "✅ [MANUAL SNAPCHAT] Step 4: Download completed successfully:",
          data.message
        );

        if (data.details) {
          console.log("📝 [MANUAL SNAPCHAT] Download details:", data.details);
        }

        if (data.files_downloaded) {
          console.log(
            `📁 [MANUAL SNAPCHAT] Files downloaded: ${data.files_downloaded}`
          );
        }

        if (data.telegram_sent) {
          console.log(
            `📤 [MANUAL SNAPCHAT] Telegram messages sent: ${data.telegram_sent}`
          );
        }

        setSnapchatUsername("");

        // Trigger gallery refresh after successful download
        console.log(
          "🔄 [MANUAL SNAPCHAT] Step 5: Triggering gallery refresh..."
        );
        setTimeout(() => {
          // Dispatch custom event to trigger gallery refresh
          window.dispatchEvent(new CustomEvent("snapchat-download-complete"));
          console.log("✅ [MANUAL SNAPCHAT] Gallery refresh event dispatched");
        }, 2000);
      } else {
        const errorMessage =
          data.message ||
          data.detail ||
          data.error ||
          "Snapchat download failed";
        console.error(
          "❌ [MANUAL SNAPCHAT] Step 4: Download failed:",
          errorMessage
        );

        if (data.details) {
          console.error("🔍 [MANUAL SNAPCHAT] Error details:", data.details);
        }

        setSnapchatError(
          typeof errorMessage === "string"
            ? errorMessage
            : JSON.stringify(errorMessage)
        );
      }
    } catch (err: any) {
      console.error("❌ [MANUAL SNAPCHAT] Network error:", err);
      console.error("🔍 [MANUAL SNAPCHAT] Error type:", err.name);
      console.error("🔍 [MANUAL SNAPCHAT] Error message:", err.message);

      if (err.code) {
        console.error("🔍 [MANUAL SNAPCHAT] Error code:", err.code);
      }

      setSnapchatError(err.message || "Snapchat download failed");
    } finally {
      setSnapchatLoading(false);
      console.log("🏁 [MANUAL SNAPCHAT] Download process completed");
    }
  };

  // Send to Telegram function
  async function sendToTelegram(
    itemIndex: number,
    videoUrl: string,
    originalUrl?: string
  ) {
    setSendingStatus((prev) => ({ ...prev, [itemIndex]: "sending" }));
    setTelegramErrors((prev) => ({ ...prev, [itemIndex]: "" }));

    try {
      const response = await fetch(`${INSTAGRAM_API_BASE}/send-to-telegram`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          videoUrl,
          originalInstagramUrl: originalUrl,
          caption: items[itemIndex]?.carouselIndex
            ? `✨ New photo from <a href="https://www.instagram.com/${
                instagramCurrentTarget || "User not found"
              }/">@${
                instagramCurrentTarget || "User not found"
              }</a>! 📱 <a href="${originalUrl}">View Original Post</a>`
            : `✨ New video from <a href="https://www.instagram.com/${
                instagramCurrentTarget || "User not found"
              }/">@${
                instagramCurrentTarget || "User not found"
              }</a>! 📱 <a href="${originalUrl}">View Original Post</a>`,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.details || result.error || "Failed to send to Telegram"
        );
      }

      setSendingStatus((prev) => ({ ...prev, [itemIndex]: "success" }));

      setTimeout(() => {
        setSendingStatus((prev) => ({ ...prev, [itemIndex]: "idle" }));
      }, 3000);
    } catch (err: any) {
      console.error("Telegram send error:", err);
      setSendingStatus((prev) => ({ ...prev, [itemIndex]: "error" }));
      setTelegramErrors((prev) => ({ ...prev, [itemIndex]: err.message }));
    }
  }

  // Clear Snapchat cache
  const clearSnapchatCache = async () => {
    try {
      const response = await fetch(
        `${SNAPCHAT_API_BASE}/snapchat-clear-cache`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        }
      );
      const data = await response.json();
      if (data.success) {
        alert("Snapchat cache cleared successfully!");
      } else {
        const errorMessage =
          data.detail ||
          data.message ||
          data.error ||
          "Failed to clear Snapchat cache";
        alert(
          typeof errorMessage === "string"
            ? errorMessage
            : JSON.stringify(errorMessage)
        );
      }
    } catch (error) {
      console.error("Snapchat clear cache error:", error);
      alert("Error clearing Snapchat cache");
    }
  };

  // Snapchat storage clearing functions
  const clearSnapchatUserCache = async () => {
    if (!snapchatCurrentTarget) {
      alert("No target set. Please set a target first.");
      return;
    }

    if (
      !confirm(
        `Are you sure you want to clear the cache for @${snapchatCurrentTarget}?`
      )
    ) {
      return;
    }

    try {
      const response = await fetch(
        `${SNAPCHAT_API_BASE}/snapchat-clear-user-cache?username=${snapchatCurrentTarget}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        }
      );
      const data = await response.json();

      if (data.success) {
        alert(
          `Snapchat cache cleared successfully for @${snapchatCurrentTarget}! (${data.deleted} entries removed)`
        );
      } else {
        alert(data.detail || "Failed to clear Snapchat cache");
      }
    } catch (error) {
      console.error("Clear Snapchat cache error:", error);
      alert("Error clearing Snapchat cache");
    }
  };

  const clearSnapchatUserData = async () => {
    if (!snapchatCurrentTarget) {
      alert("No target set. Please set a target first.");
      return;
    }

    if (
      !confirm(
        `Are you sure you want to clear ALL data (cache + processed stories) for @${snapchatCurrentTarget}? This action cannot be undone.`
      )
    ) {
      return;
    }

    try {
      const response = await fetch(
        `${SNAPCHAT_API_BASE}/snapchat-clear-user-data?username=${snapchatCurrentTarget}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        }
      );
      const data = await response.json();

      if (data.success) {
        alert(
          `All Snapchat data cleared successfully for @${snapchatCurrentTarget}! (${data.processed_deleted} processed stories, ${data.cache_deleted} cache entries removed)`
        );
      } else {
        alert(data.detail || "Failed to clear Snapchat data");
      }
    } catch (error) {
      console.error("Clear Snapchat data error:", error);
      alert("Error clearing Snapchat data");
    }
  };

  // Instagram storage clearing functions
  const clearInstagramCache = async () => {
    if (!instagramCurrentTarget) {
      alert("No target set. Please set a target first.");
      return;
    }

    if (
      !confirm(
        `Are you sure you want to clear the cache for @${instagramCurrentTarget}?`
      )
    ) {
      return;
    }

    try {
      const response = await fetch(`${INSTAGRAM_API_BASE}/clear-cache`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await response.json();

      if (data.success) {
        alert(
          `Cache cleared successfully for @${instagramCurrentTarget}! (${data.deleted} entries removed)`
        );
      } else {
        alert(data.error || "Failed to clear cache");
      }
    } catch (error) {
      console.error("Clear cache error:", error);
      alert("Error clearing cache");
    }
  };

  const clearInstagramStorage = async () => {
    if (!instagramCurrentTarget) {
      alert("No target set. Please set a target first.");
      return;
    }

    if (
      !confirm(
        `Are you sure you want to clear ALL data (cache + processed posts) for @${instagramCurrentTarget}? This action cannot be undone.`
      )
    ) {
      return;
    }

    try {
      const response = await fetch(`${INSTAGRAM_API_BASE}/clear-all`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await response.json();

      if (data.success) {
        alert(
          `All data cleared successfully for @${instagramCurrentTarget}! (${data.processed_deleted} processed posts, ${data.cache_deleted} cache entries removed)`
        );
      } else {
        alert(data.error || "Failed to clear storage");
      }
    } catch (error) {
      console.error("Clear storage error:", error);
      alert("Error clearing storage");
    }
  };

  const clearInstagramStoriesCache = async () => {
    if (!instagramCurrentTarget) {
      alert("No target set. Please set a target first.");
      return;
    }

    if (
      !confirm(
        `Are you sure you want to clear the stories cache for @${instagramCurrentTarget}?`
      )
    ) {
      return;
    }

    try {
      const response = await fetch(
        `${INSTAGRAM_API_BASE}/clear-stories-cache`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        }
      );
      const data = await response.json();

      if (data.success) {
        alert(
          `Stories cache cleared successfully for @${instagramCurrentTarget}! (${data.total_deleted} entries removed)`
        );
      } else {
        alert(data.error || "Failed to clear stories cache");
      }
    } catch (error) {
      console.error("Clear stories cache error:", error);
      alert("Error clearing stories cache");
    }
  };

  // Load current targets on mount (health checks removed to save resources)
  useEffect(() => {
    fetchInstagramCurrentTarget();
    fetchSnapchatCurrentTarget();
  }, []);

  // Instagram Home Component
  const IgHome = (
    <div className="app-container">
      <div className="content-wrapper">
        <h1 className="app-title">Instagram Video Downloader</h1>
        <p className="app-subtitle">
          Paste a public Instagram post/reel/tv/stories URL and get downloadable
          links.
        </p>

        {/* Target Management */}
        <div className="target-management">
          <div className="current-target">
            <span className="target-label">Currently tracking:</span>
            <span className="target-username">
              {instagramCurrentTarget
                ? `@${instagramCurrentTarget}`
                : "No target set"}
            </span>
            <div className="target-buttons">
              <button
                className="btn-change-target"
                onClick={() => setShowTargetManager(!showTargetManager)}
              >
                Change Target
              </button>
              <button
                className="btn-polling"
                onClick={() => setShowPollingManager(!showPollingManager)}
                disabled={!instagramCurrentTarget}
              >
                Polling
              </button>
            </div>
          </div>

          {/* Polling Status */}
          {instagramCurrentTarget && (
            <div className="polling-status">
              <span className="status-label">Polling:</span>
              <span
                className={`status-indicator ${
                  instagramPollingStatus.active ? "active" : "inactive"
                }`}
              >
                {instagramPollingStatus.active ? "🟢 Active" : "🔴 Inactive"}
              </span>
            </div>
          )}

          {showTargetManager && (
            <div className="target-manager">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  changeInstagramTarget();
                }}
                className="target-form"
              >
                <div className="input-group">
                  <input
                    type="text"
                    value={newTarget}
                    onChange={(e) => setNewTarget(e.target.value)}
                    placeholder="Enter username (@instagram) or URL (instagram.com/@instagram)"
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
                  <small>
                    Examples: instagram, @instagram, instagram.com/instagram
                    <br />
                    Multiple targets: Separate with commas or newlines (e.g.,
                    "user1, user2" or "user1\nuser2")
                  </small>
                </div>
                {instagramCurrentTargets.length > 0 && (
                  <div
                    className="current-targets"
                    style={{
                      marginTop: "10px",
                      padding: "10px",
                      backgroundColor: "#f0f0f0",
                      borderRadius: "4px",
                    }}
                  >
                    <strong>
                      Current Targets ({instagramCurrentTargets.length}):
                    </strong>
                    <ul
                      style={{
                        margin: "5px 0",
                        paddingLeft: "20px",
                        listStyle: "none",
                      }}
                    >
                      {instagramCurrentTargets.map((target, idx) => (
                        <li
                          key={idx}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            marginBottom: "5px",
                          }}
                        >
                          <span>@{target}</span>
                          <button
                            type="button"
                            onClick={() => {
                              if (
                                confirm(
                                  `Are you sure you want to remove @${target} from the targets?`
                                )
                              ) {
                                removeInstagramTarget(target);
                              }
                            }}
                            disabled={targetLoading}
                            style={{
                              marginLeft: "10px",
                              padding: "2px 8px",
                              fontSize: "12px",
                              backgroundColor: "#ff4444",
                              color: "white",
                              border: "none",
                              borderRadius: "3px",
                              cursor: targetLoading ? "not-allowed" : "pointer",
                              opacity: targetLoading ? 0.6 : 1,
                            }}
                            title={`Remove @${target}`}
                          >
                            ✕
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </form>
            </div>
          )}

          {/* Polling Manager */}
          {showPollingManager && instagramCurrentTargets.length > 0 && (
            <div className="polling-manager">
              <div className="polling-controls">
                <div className="polling-buttons">
                  {!instagramPollingStatus.active ? (
                    <button
                      onClick={startInstagramPolling}
                      className="btn-start-polling"
                      disabled={targetLoading}
                      title="Start automatic polling for new posts"
                    >
                      🚀 Start Polling
                    </button>
                  ) : (
                    <button
                      onClick={stopInstagramPolling}
                      className="btn-stop-polling"
                      disabled={targetLoading}
                      title="Stop automatic polling"
                    >
                      🛑 Stop Polling
                    </button>
                  )}
                </div>
                <small className="polling-info">
                  {instagramPollingStatus.active
                    ? "Polling is active"
                    : "Polling is stopped"}
                </small>
              </div>
            </div>
          )}

          {/* Storage Controls */}
          {instagramCurrentTarget && (
            <div className="storage-controls">
              <div className="storage-buttons">
                <button
                  onClick={clearInstagramCache}
                  className="btn-clear-storage"
                  title="Clear cache for current target"
                >
                  🗑️ Clear Cache
                </button>
                <button
                  onClick={clearInstagramStorage}
                  className="btn-clear-storage"
                  title="Clear all data (cache + processed posts) for current target"
                >
                  🗑️ Clear Storage
                </button>
                <button
                  onClick={clearInstagramStoriesCache}
                  className="btn-clear-stories-cache"
                  title="Clear stories cache for current target"
                >
                  🗑️ Clear Stories Cache
                </button>
              </div>
              <small className="storage-info">
                Storage controls for @{instagramCurrentTarget}
              </small>
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
            <span className="toggle-label">
              📱 Auto-send to Telegram (Backend)
            </span>
          </label>
        </div>

        {/* Manual Instagram URL Input */}
        <div className="manual-input-section">
          <h3>📷 Manual Instagram Download</h3>
          <p>
            Paste any Instagram post, reel, or story URL to download content
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              fetchInstagramDownloads(url);
            }}
            className="form-container"
          >
            <div className="form-input-group">
              <input
                type="url"
                placeholder="https://www.instagram.com/p/xxxxxx/ (img_index will be auto-removed)"
                value={url}
                onChange={(e) => {
                  const cleanedUrl = cleanInstagramUrl(e.target.value);
                  setUrl(cleanedUrl);
                }}
                className="url-input"
                required
              />
              <button
                type="submit"
                disabled={!isValidIgUrl || loading}
                className="submit-button"
              >
                {loading ? "Fetching…" : "Get Video"}
              </button>
            </div>
          </form>
        </div>

        {error && <div className="error-message">{error}</div>}

        {loading && (
          <div style={{ marginTop: 20, textAlign: "center", opacity: 0.8 }}>
            Loading download links...
          </div>
        )}

        <div className="results-grid">
          {items.map((item, idx) => (
            <div
              key={`${item.carouselIndex || idx}-${item.thumb || item.url}`}
              className="download-card"
            >
              <div className="thumbnail-container">
                {item.thumb ? (
                  <img
                    src={getProxiedImageUrl(item.thumb)}
                    alt="Media preview"
                    className="card-thumbnail"
                    loading="lazy"
                    onError={(e) => {
                      // Fallback to direct URL if proxy fails
                      if (e.currentTarget.src !== item.thumb) {
                        e.currentTarget.src = item.thumb || "";
                      }
                    }}
                  />
                ) : (
                  <div className="card-thumbnail placeholder">
                    <span>📷</span>
                  </div>
              )}
              </div>
              <div className="card-content">
                {item.quality && (
                  <div className="quality-row">
                    <span className="quality-label">Media Type</span>
                    <strong className="quality-value">{item.quality}</strong>
                  </div>
                )}
                {item.carouselIndex && (
                  <div className="carousel-index">
                    <span className="index-label">Carousel Item</span>
                    <strong className="index-value">
                      {item.carouselIndex}
                    </strong>
                  </div>
                )}
                <div className="card-actions">
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="download-link"
                  >
                    {item.isProgress ? "Open (progress API)" : "Download video"}
                  </a>

                  <button
                    type="button"
                    onClick={() => sendToTelegram(idx, item.url, url)}
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

                  {telegramErrors[idx] && (
                    <div className="telegram-error">{telegramErrors[idx]}</div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {!loading && items.length === 0 && !error && (
          <div className="no-results">No results yet.</div>
        )}
      </div>
    </div>
  );

  // Snapchat Home Component
  const SnapchatHome = (
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
              {snapchatCurrentTarget
                ? `@${snapchatCurrentTarget}`
                : "No target set"}
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
                  if (!showStats) fetchSnapchatStats();
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
                    setSnapchatTarget(newTarget.trim());
                  }
                }}
                className="target-form"
              >
                <div className="input-group">
                  <div className="input-with-suggestions">
                    <input
                      type="text"
                      value={newTarget}
                      onChange={(e) => handleTargetChange(e.target.value)}
                      placeholder="Enter Snapchat username (e.g., username)"
                      className="target-input"
                      disabled={targetLoading}
                    />
                    {showTargetSuggestions && (
                      <div className="suggestions-dropdown">
                        {targetSuggestionsLoading ? (
                          <div className="suggestion-item loading">
                            Loading suggestions...
                          </div>
                        ) : (
                          targetSuggestions.map((username, index) => (
                            <div
                              key={index}
                              className="suggestion-item"
                              onClick={() => selectTargetSuggestion(username)}
                            >
                              👤 {username}
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
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
                  {!snapchatPollingStatus.active ? (
                    <button
                      onClick={startSnapchatPolling}
                      className="btn-start-polling"
                      title="Start automatic polling for new stories"
                    >
                      🚀 Start Polling
                    </button>
                  ) : (
                    <button
                      onClick={stopSnapchatPolling}
                      className="btn-stop-polling"
                      title="Stop automatic polling"
                    >
                      🛑 Stop Polling
                    </button>
                  )}
                  <button
                    onClick={manualSnapchatPoll}
                    className="btn-manual-poll"
                    title="Trigger a single manual poll"
                  >
                    🔄 Manual Poll
                  </button>
                </div>
                <small className="polling-info">
                  {snapchatPollingStatus.active
                    ? "Polling is active"
                    : "Polling is stopped"}
                  {snapchatPollingStatus.current_interval &&
                    ` (${snapchatPollingStatus.current_interval} min intervals)`}
                  {snapchatPollingStatus.activity_level &&
                    ` - Activity: ${snapchatPollingStatus.activity_level}`}
                </small>
              </div>
            </div>
          )}

          {/* Storage Controls */}
          {snapchatCurrentTarget && (
            <div className="storage-controls">
              <div className="storage-buttons">
                <button
                  onClick={clearSnapchatUserCache}
                  className="btn-clear-storage"
                  title="Clear cache for current target"
                >
                  🗑️ Clear Cache
                </button>
                <button
                  onClick={clearSnapchatUserData}
                  className="btn-clear-storage"
                  title="Clear all data (cache + processed stories) for current target"
                >
                  🗑️ Clear Storage
                </button>
              </div>
              <small className="storage-info">
                Storage controls for @{snapchatCurrentTarget}
              </small>
            </div>
          )}

          {showStats && (
            <div className="stats-manager">
              <div className="stats-header">
                <h3>Service Statistics</h3>
                <button
                  onClick={fetchSnapchatStats}
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
                              (stats.snapchat.success / stats.snapchat.total) *
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

        {/* Manual Snapchat Download Form */}
        <div className="manual-input-section">
          <h3>👻 Manual Snapchat Download</h3>
          <p>
            Enter a Snapchat username to download stories, highlights, or spotlights.
            Or paste a Snapchat media URL to download that specific media.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSnapchatDownload();
            }}
            className="form-container"
          >
            <div className="form-input-group">
              <div className="input-with-suggestions">
                <input
                  type="text"
                  placeholder="Enter Snapchat username or media URL"
                  value={snapchatUsername}
                  onChange={(e) => handleSnapchatUsernameChange(e.target.value)}
                  className="url-input"
                  required
                />
                {showSnapchatSuggestions && (
                  <div className="suggestions-dropdown">
                    {suggestionsLoading ? (
                      <div className="suggestion-item loading">
                        Loading suggestions...
                      </div>
                    ) : (
                      snapchatSuggestions.map((username, index) => (
                        <div
                          key={index}
                          className="suggestion-item"
                          onClick={() => selectSuggestion(username)}
                        >
                          👤 {username}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
              <select
                value={downloadType}
                onChange={(e) => setDownloadType(e.target.value as any)}
                className="download-type-select"
              >
                <option value="stories">Stories</option>
                <option value="highlights">Highlights</option>
                <option value="spotlights">Spotlights</option>
              </select>
              <button
                type="submit"
                disabled={!isValidSnapchatUsername || snapchatLoading}
                className="submit-button"
              >
                {snapchatLoading ? "Downloading…" : "Download"}
              </button>
            </div>
          </form>
        </div>

        {snapchatError && <div className="error-message">{snapchatError}</div>}

        {snapchatLoading && (
          <div style={{ marginTop: 20, textAlign: "center", opacity: 0.8 }}>
            Downloading Snapchat content...
          </div>
        )}

        {/* Snapchat Gallery */}
        <SnapchatPage />
      </div>
    </div>
  );

  return (
    <BrowserRouter>
      <div
        style={{
          padding: 12,
          display: "flex",
          gap: 12,
          borderBottom: "1px solid #e0e0e0",
          marginBottom: 20,
          backgroundColor: "#f8f9fa",
        }}
      >
        <Link
          to="/instagram"
          style={{
            padding: "8px 16px",
            textDecoration: "none",
            color: "#333",
            borderRadius: "4px",
            fontWeight: "500",
          }}
        >
          📷 Instagram
        </Link>
        <Link
          to="/snapchat"
          style={{
            padding: "8px 16px",
            textDecoration: "none",
            color: "#333",
            borderRadius: "4px",
            fontWeight: "500",
          }}
        >
          👻 Snapchat
        </Link>
      </div>
      <Routes>
        <Route path="/instagram" element={IgHome} />
        <Route path="/snapchat" element={SnapchatHome} />
        <Route path="*" element={IgHome} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
