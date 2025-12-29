import React, { useState, useEffect, useRef } from "react";
import { getGallery, sendToTelegram } from "./api";
import { createProgressSocket } from "./ProgressWS";

interface DownloadItem {
  quality?: string;
  thumb?: string;
  thumbnail_url?: string; // Snapchat API uses this field
  url: string;
  download_url?: string; // Snapchat API may use this instead of url
  isProgress?: boolean;
  carouselIndex?: number;
  isVideo?: boolean;
  type?: string; // "video" | "photo"
  username?: string; // Username for grouped results
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
  const [wsConnected, setWsConnected] = useState(false);
  const [wsError, setWsError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [usernameFilter, setUsernameFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [mediaTypeFilter, setMediaTypeFilter] = useState<
    "" | "video" | "image"
  >("");
  const [sortBy, setSortBy] = useState("date_desc");

  // Helper functions for date dropdowns
  const parseDate = (dateStr: string) => {
    if (!dateStr) return { year: "", month: "", day: "" };
    const parts = dateStr.split("-");
    return {
      year: parts[0] || "",
      month: parts[1] || "",
      day: parts[2] || "",
    };
  };

  const buildDate = (year: string, month: string, day: string) => {
    // Build partial dates: allow year only, year-month, or year-month-day
    const parts: string[] = [];
    if (year) parts.push(year);
    if (month) parts.push(month);
    if (day) parts.push(day);
    return parts.length > 0 ? parts.join("-") : "";
  };

  const handleDateFromChange = (
    type: "year" | "month" | "day",
    value: string
  ) => {
    const current = parseDate(dateFrom);
    const updated = { ...current, [type]: value };
    // If clearing a parent field, clear children too
    if (type === "year" && !value) {
      updated.month = "";
      updated.day = "";
    } else if (type === "month" && !value) {
      updated.day = "";
    }
    setDateFrom(buildDate(updated.year, updated.month, updated.day));
  };

  const handleDateToChange = (
    type: "year" | "month" | "day",
    value: string
  ) => {
    const current = parseDate(dateTo);
    const updated = { ...current, [type]: value };
    // If clearing a parent field, clear children too
    if (type === "year" && !value) {
      updated.month = "";
      updated.day = "";
    } else if (type === "month" && !value) {
      updated.day = "";
    }
    setDateTo(buildDate(updated.year, updated.month, updated.day));
  };

  // Selection mode state - use filename as key for cross-pagination selection
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [bulkOperationStatus, setBulkOperationStatus] = useState<{
    operation: string | null;
    progress: number;
    total: number;
  }>({ operation: null, progress: 0, total: 0 });

  // Download progress state
  const [downloadProgress, setDownloadProgress] = useState<{
    [filename: string]: { progress: number; status: string };
  }>({});

  // Preview modal state
  const [previewItem, setPreviewItem] = useState<DownloadItem | null>(null);
  const [previewIndex, setPreviewIndex] = useState<number>(-1);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [panPosition, setPanPosition] = useState({ x: 0, y: 0 });

  // Storage stats state
  const [storageStats, setStorageStats] = useState<any>(null);
  const [showStats, setShowStats] = useState(false);

  // Pagination state
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [allItems, setAllItems] = useState<DownloadItem[]>([]);
  const [paginationInfo, setPaginationInfo] = useState<any>(null);
  const observerTarget = useRef<HTMLDivElement>(null);

  const fetchGallery = async (pageNum: number = 1, append: boolean = false) => {
    console.log(
      `🔄 [SNAPCHAT GALLERY] Fetching ${mediaType} gallery page ${pageNum}...`
    );
    if (!append) setLoading(true);
    setError(null);

    try {
      // Build query params
      const params = new URLSearchParams();
      if (usernameFilter) params.append("username", usernameFilter);
      if (searchQuery) params.append("search", searchQuery);
      if (dateFrom) params.append("date_from", dateFrom);
      if (dateTo) params.append("date_to", dateTo);
      if (mediaTypeFilter) params.append("media_type_filter", mediaTypeFilter);
      if (sortBy) params.append("sort_by", sortBy);
      params.append("page", pageNum.toString());
      params.append("per_page", "20");

      const queryString = params.toString();
      const SNAP_BASE = import.meta.env.PROD
        ? "https://tyla-social.onrender.com"
        : "/snapchat-api";
      const url = `${SNAP_BASE}/gallery/${mediaType}?${queryString}`;

      console.log(`🌐 [SNAPCHAT GALLERY] Fetching from: ${url}`);

      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Failed to fetch gallery: ${res.status}`);
      }

      const data = await res.json();
      console.log(
        `📊 [SNAPCHAT GALLERY] Received ${data.media?.length || 0} items`
      );

      if (append) {
        setAllItems((prev) => [...prev, ...(data.media || [])]);
        setGalleryItems((prev) => [...prev, ...(data.media || [])]);
      } else {
        setAllItems(data.media || []);
        setGalleryItems(data.media || []);
      }

      setPaginationInfo(data.pagination);
      setHasMore(data.pagination?.has_next || false);
      setPage(pageNum);
    } catch (err: any) {
      console.error("❌ [SNAPCHAT GALLERY] Fetch error:", err);
      setError(err.message || "Failed to fetch gallery");
    } finally {
      setLoading(false);
    }
  };

  const handleSendToTelegram = async (itemIndex: number, mediaUrl: string) => {
    setSendingStatus((prev) => ({ ...prev, [itemIndex]: "sending" }));
    setTelegramErrors((prev) => ({ ...prev, [itemIndex]: "" }));

    try {
      const item = galleryItems[itemIndex];
      // Extract filename from download_url (e.g., /downloads/wolftyla/stories/filename.jpg -> filename.jpg)
      const filename = (item.download_url || mediaUrl).split("/").pop() || "";
      const username = item.username || "";

      if (!username) {
        throw new Error("Username not found for this item");
      }

      const SNAP_BASE = import.meta.env.PROD
        ? "https://tyla-social.onrender.com"
        : "/snapchat-api";

      const response = await fetch(`${SNAP_BASE}/send-to-telegram`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username,
          media_type: mediaType,
          media_files: [filename],
          caption: `✨ New ${mediaType} content from @${username}! 📱`,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.status === "success") {
          setSendingStatus((prev) => ({ ...prev, [itemIndex]: "success" }));
          setTimeout(() => {
            setSendingStatus((prev) => ({ ...prev, [itemIndex]: "idle" }));
          }, 2000);
        } else {
          setSendingStatus((prev) => ({ ...prev, [itemIndex]: "error" }));
          setTelegramErrors((prev) => ({
            ...prev,
            [itemIndex]: result.message || "Failed to send to Telegram",
          }));
        }
      } else {
        const error = await response.json();
        setSendingStatus((prev) => ({ ...prev, [itemIndex]: "error" }));
        setTelegramErrors((prev) => ({
          ...prev,
          [itemIndex]: error.detail || "Failed to send to Telegram",
        }));
      }
    } catch (err: any) {
      setSendingStatus((prev) => ({ ...prev, [itemIndex]: "error" }));
      setTelegramErrors((prev) => ({ ...prev, [itemIndex]: err.message }));
    }
  };

  // Selection handlers
  // Get unique identifier for an item (filename)
  const getItemKey = (item: DownloadItem): string => {
    return (
      (item.download_url || item.url)?.split("/").pop() || `item-${item.url}`
    );
  };

  const handleSelectItem = (item: DownloadItem, checked: boolean) => {
    const key = getItemKey(item);
    setSelectedItems((prev) => {
      const newSet = new Set(prev);
      if (checked) {
        newSet.add(key);
      } else {
        newSet.delete(key);
      }
      return newSet;
    });
  };

  const handleSelectAll = async () => {
    // Always fetch total from API to ensure we have the correct count
    const totalAvailable = paginationInfo?.total;
    
    // If all items are already selected, deselect all
    if (totalAvailable && selectedItems.size === totalAvailable && totalAvailable > 0) {
      setSelectedItems(new Set());
      return;
    }
    
    // Always fetch all filenames from API to ensure we get ALL items, not just loaded ones
    setBulkOperationStatus({ operation: 'selecting', progress: 0, total: 100 });
    
    try {
      // Build same query params as current gallery view
      const params = new URLSearchParams();
      if (usernameFilter) params.append("username", usernameFilter);
      if (searchQuery) params.append("search", searchQuery);
      if (dateFrom) params.append("date_from", dateFrom);
      if (dateTo) params.append("date_to", dateTo);
      if (mediaTypeFilter) params.append("media_type_filter", mediaTypeFilter);
      if (sortBy) params.append("sort_by", sortBy);
      
      const SNAP_BASE = import.meta.env.PROD 
        ? "https://tyla-social.onrender.com" 
        : "/snapchat-api";
      const url = `${SNAP_BASE}/gallery/${mediaType}/filenames?${params.toString()}`;
      
      console.log(`[SELECT ALL] Fetching all filenames from: ${url}`);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to fetch filenames: ${res.status}`);
      
      const data = await res.json();
      console.log(`[SELECT ALL] Received ${data.filenames?.length || 0} filenames from API`);
      
      // Select all filenames from the response
      const allKeys = (data.filenames || []).map((item: {filename: string}) => item.filename);
      setSelectedItems(new Set(allKeys));
      console.log(`[SELECT ALL] Selected ${allKeys.length} items`);
      
    } catch (error) {
      console.error("Failed to select all:", error);
      // Fallback to selecting currently loaded items
      const allKeys = allItems.map((item) => getItemKey(item));
      setSelectedItems(new Set(allKeys));
      console.log(`[SELECT ALL] Fallback: Selected ${allKeys.length} loaded items`);
    } finally {
      setBulkOperationStatus({ operation: null, progress: 0, total: 0 });
    }
  };

  const handleClearSelection = () => {
    setSelectedItems(new Set());
    setSelectionMode(false);
  };

  // Helper function to group filenames by username
  const groupItemsByUsername = async (filenames: string[]): Promise<Map<string, string[]>> => {
    const grouped = new Map<string, string[]>();
    
    // First, try to find items in allItems to get usernames
    const foundUsernames = new Map<string, string>();
    filenames.forEach(filename => {
      const item = allItems.find(item => getItemKey(item) === filename);
      if (item?.username) {
        foundUsernames.set(filename, item.username);
      }
    });
    
    // For filenames not in allItems, we need to fetch usernames from the filenames endpoint
    const missingFilenames = filenames.filter(f => !foundUsernames.has(f));
    
    if (missingFilenames.length > 0) {
      try {
        // Build query params matching current filters
        const params = new URLSearchParams();
        if (usernameFilter) params.append("username", usernameFilter);
        if (searchQuery) params.append("search", searchQuery);
        if (dateFrom) params.append("date_from", dateFrom);
        if (dateTo) params.append("date_to", dateTo);
        if (mediaTypeFilter) params.append("media_type_filter", mediaTypeFilter);
        if (sortBy) params.append("sort_by", sortBy);
        
        const SNAP_BASE = import.meta.env.PROD 
          ? "https://tyla-social.onrender.com" 
          : "/snapchat-api";
        const url = `${SNAP_BASE}/gallery/${mediaType}/filenames?${params.toString()}`;
        
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          const filenameMap = new Map<string, string>();
          (data.filenames || []).forEach((item: {filename: string, username: string}) => {
            filenameMap.set(item.filename, item.username);
          });
          
          // Add missing usernames to foundUsernames
          missingFilenames.forEach(filename => {
            if (filenameMap.has(filename)) {
              foundUsernames.set(filename, filenameMap.get(filename)!);
            }
          });
        }
      } catch (error) {
        console.error("Failed to fetch usernames for grouping:", error);
      }
    }
    
    // Group filenames by username
    filenames.forEach(filename => {
      const username = foundUsernames.get(filename) || '';
      if (!grouped.has(username)) {
        grouped.set(username, []);
      }
      grouped.get(username)!.push(filename);
    });
    
    return grouped;
  };

  // Bulk operation handlers
  const handleBulkDownload = async () => {
    const selectedFilenames = Array.from(selectedItems);
    
    if (selectedFilenames.length === 0) return;

    // Group filenames by username
    const groupedByUsername = await groupItemsByUsername(selectedFilenames);
    const usernames = Array.from(groupedByUsername.keys());
    const totalFiles = selectedFilenames.length;

    setBulkOperationStatus({
      operation: "download",
      progress: 0,
      total: totalFiles,
    });

    try {
      const SNAP_BASE = import.meta.env.PROD
        ? "https://tyla-social.onrender.com"
        : "/snapchat-api";

      // Make separate download requests for each username
      for (const username of usernames) {
        if (!username) continue; // Skip empty usernames
        
        const usernameFilenames = groupedByUsername.get(username) || [];
        if (usernameFilenames.length === 0) continue;

        const response = await fetch(`${SNAP_BASE}/gallery/bulk-download`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: usernameFilenames,
            username: username,
            media_type: mediaType,
            operation: "download",
          }),
        });

        if (response.ok) {
          const blob = await response.blob();
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `${username}_${mediaType}.zip`;
          document.body.appendChild(a);
          a.click();
          window.URL.revokeObjectURL(url);
          document.body.removeChild(a);
          
          // Small delay to allow download to start
          await new Promise(resolve => setTimeout(resolve, 200));
        } else {
          console.error(`Failed to download files for ${username}:`, response.statusText);
        }
      }

      handleClearSelection();
    } catch (error) {
      console.error("Bulk download failed:", error);
      alert("Some downloads may have failed. Check the console for details.");
    } finally {
      setBulkOperationStatus({ operation: null, progress: 0, total: 0 });
    }
  };

  const handleBulkDelete = async () => {
    if (
      !confirm(`Delete ${selectedItems.size} items? This cannot be undone.`)
    ) {
      return;
    }

    const selectedFilenames = Array.from(selectedItems);
    
    if (selectedFilenames.length === 0) return;

    // Group filenames by username
    const groupedByUsername = await groupItemsByUsername(selectedFilenames);
    const usernames = Array.from(groupedByUsername.keys());
    const totalFiles = selectedFilenames.length;

    setBulkOperationStatus({
      operation: "delete",
      progress: 0,
      total: totalFiles,
    });

    try {
      const SNAP_BASE = import.meta.env.PROD
        ? "https://tyla-social.onrender.com"
        : "/snapchat-api";

      // Make separate delete requests for each username
      let successCount = 0;
      for (const username of usernames) {
        if (!username) continue; // Skip empty usernames
        
        const usernameFilenames = groupedByUsername.get(username) || [];
        if (usernameFilenames.length === 0) continue;

        const response = await fetch(`${SNAP_BASE}/gallery/bulk-delete`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: usernameFilenames,
            username: username,
            media_type: mediaType,
            operation: "delete",
          }),
        });

        if (response.ok) {
          successCount += usernameFilenames.length;
        } else {
          console.error(`Failed to delete files for ${username}:`, response.statusText);
        }
      }

      // Refresh gallery after all deletes
      if (successCount > 0) {
        setPage(1);
        setAllItems([]);
        fetchGallery(1, false);
        handleClearSelection();
      }
    } catch (error) {
      console.error("Bulk delete failed:", error);
      alert("Some deletions may have failed. Check the console for details.");
    } finally {
      setBulkOperationStatus({ operation: null, progress: 0, total: 0 });
    }
  };

  const handleBulkTelegram = async () => {
    const selectedFilenames = Array.from(selectedItems);
    
    if (selectedFilenames.length === 0) return;

    // Group filenames by username
    const groupedByUsername = await groupItemsByUsername(selectedFilenames);
    const usernames = Array.from(groupedByUsername.keys());
    const totalFiles = selectedFilenames.length;

    setBulkOperationStatus({
      operation: "telegram",
      progress: 0,
      total: totalFiles,
    });

    try {
      const SNAP_BASE = import.meta.env.PROD
        ? "https://tyla-social.onrender.com"
        : "/snapchat-api";

      // Make separate telegram requests for each username
      let totalSuccessful = 0;
      let totalFailed = 0;
      
      for (const username of usernames) {
        if (!username) continue; // Skip empty usernames
        
        const usernameFilenames = groupedByUsername.get(username) || [];
        if (usernameFilenames.length === 0) continue;

        const response = await fetch(`${SNAP_BASE}/gallery/bulk-telegram`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: usernameFilenames,
            username: username,
            media_type: mediaType,
            operation: "telegram",
          }),
        });

        if (response.ok) {
          const result = await response.json();
          totalSuccessful += result.successful || 0;
          totalFailed += result.failed || 0;
        } else {
          console.error(`Failed to send files for ${username}:`, response.statusText);
          totalFailed += usernameFilenames.length;
        }
      }

      if (totalSuccessful > 0 || totalFailed > 0) {
        alert(`Sent ${totalSuccessful}/${totalFiles} items to Telegram${totalFailed > 0 ? ` (${totalFailed} failed)` : ''}`);
      }
      
      handleClearSelection();
    } catch (error) {
      console.error("Bulk telegram failed:", error);
      alert("Failed to send some items to Telegram. Check the console for details.");
    } finally {
      setBulkOperationStatus({ operation: null, progress: 0, total: 0 });
    }
  };

  // Preview modal handlers
  const handleOpenPreview = (item: DownloadItem, index: number) => {
    setPreviewItem(item);
    setPreviewIndex(index);
    setZoomLevel(1);
    setPanPosition({ x: 0, y: 0 });
  };

  const handleClosePreview = () => {
    setPreviewItem(null);
    setPreviewIndex(-1);
    setZoomLevel(1);
    setPanPosition({ x: 0, y: 0 });
  };

  const handlePrevItem = () => {
    if (previewIndex > 0) {
      const newIndex = previewIndex - 1;
      setPreviewItem(galleryItems[newIndex]);
      setPreviewIndex(newIndex);
      setZoomLevel(1);
      setPanPosition({ x: 0, y: 0 });
    }
  };

  const handleNextItem = () => {
    if (previewIndex < galleryItems.length - 1) {
      const newIndex = previewIndex + 1;
      setPreviewItem(galleryItems[newIndex]);
      setPreviewIndex(newIndex);
      setZoomLevel(1);
      setPanPosition({ x: 0, y: 0 });
    }
  };

  const handleZoomIn = () => {
    setZoomLevel((prev) => Math.min(prev + 0.5, 3));
  };

  const handleZoomOut = () => {
    setZoomLevel((prev) => Math.max(prev - 0.5, 1));
  };

  const handleDownloadFromPreview = () => {
    if (!previewItem?.download_url) return;

    const a = document.createElement("a");
    a.href = previewItem.download_url;
    a.download = previewItem.download_url.split("/").pop() || "download";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleTelegramFromPreview = async () => {
    if (!previewItem?.download_url || !previewItem?.username) return;

    try {
      // Extract filename from download_url (e.g., /downloads/wolftyla/stories/filename.jpg -> filename.jpg)
      const filename = previewItem.download_url.split("/").pop() || "";

      const SNAP_BASE = import.meta.env.PROD
        ? "https://tyla-social.onrender.com"
        : "/snapchat-api";

      const response = await fetch(`${SNAP_BASE}/send-to-telegram`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: previewItem.username,
          media_type: mediaType,
          media_files: [filename],
          caption: `✨ ${mediaType} from @${previewItem.username}`,
        }),
      });

      if (response.ok) {
        alert("Sent to Telegram!");
      } else {
        const error = await response.json();
        alert(`Failed to send: ${error.detail || "Unknown error"}`);
      }
    } catch (error) {
      alert("Failed to send to Telegram");
    }
  };

  // Fetch storage stats
  const fetchStorageStats = async () => {
    try {
      const SNAP_BASE = import.meta.env.PROD
        ? "https://tyla-social.onrender.com"
        : "/snapchat-api";

      const response = await fetch(`${SNAP_BASE}/gallery/stats`);
      if (response.ok) {
        const data = await response.json();
        setStorageStats(data);
      }
    } catch (error) {
      console.error("Failed to fetch storage stats:", error);
    }
  };

  useEffect(() => {
    // Reset pagination when media type changes
    // Don't fetch gallery on mount - wait for user to search/filter
    setPage(1);
    setAllItems([]);
    setGalleryItems([]); // Start with empty gallery
    fetchStorageStats();
  }, [mediaType]);

  // Keyboard navigation for preview modal
  useEffect(() => {
    if (!previewItem) return;

    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClosePreview();
      else if (e.key === "ArrowLeft") handlePrevItem();
      else if (e.key === "ArrowRight") handleNextItem();
      else if (e.key === "+" || e.key === "=") handleZoomIn();
      else if (e.key === "-" || e.key === "_") handleZoomOut();
    };

    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, [previewItem, previewIndex]);

  // Infinite scroll observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading) {
          fetchGallery(page + 1, true);
        }
      },
      { threshold: 0.1 }
    );

    const currentTarget = observerTarget.current;
    if (currentTarget) {
      observer.observe(currentTarget);
    }

    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget);
      }
    };
  }, [hasMore, loading, page]);

  // Note: Removed auto-fetch on filter changes to prevent rapid requests
  // User must click Search button to apply filters

  // WebSocket connection for real-time gallery updates
  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = import.meta.env.PROD
      ? `${protocol}//tyla-social.onrender.com/ws/gallery/${mediaType}`
      : `${protocol}//${window.location.host}/snapchat-api/ws/gallery/${mediaType}`;

    console.log(`🔌 [GALLERY WS] Connecting to: ${wsUrl}`);

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("✅ [GALLERY WS] Connected");
      setWsConnected(true);
      setWsError(null);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log("📨 [GALLERY WS] Message received:", data);

        if (data.type === "gallery_update") {
          console.log(
            `🔄 [GALLERY WS] Gallery updated: ${data.count} new items from @${data.username}`
          );
          // Auto-refresh gallery - reset to page 1
          setTimeout(() => {
            setPage(1);
            setAllItems([]);
            fetchGallery(1, false);
          }, 500);
        } else if (data.type === "download_progress") {
          // Update download progress for specific files
          setDownloadProgress(data.files || {});
        } else if (data.type === "pong") {
          // Heartbeat response
        }
      } catch (error) {
        console.error("❌ [GALLERY WS] Parse error:", error);
      }
    };

    ws.onerror = (error) => {
      console.error("❌ [GALLERY WS] Error:", error);
      setWsError("WebSocket connection error");
      setWsConnected(false);
    };

    ws.onclose = () => {
      console.log("🔌 [GALLERY WS] Disconnected");
      setWsConnected(false);
    };

    // Heartbeat to keep connection alive
    const heartbeat = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send("ping");
      }
    }, 30000); // Every 30 seconds

    // Cleanup
    return () => {
      clearInterval(heartbeat);
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, [mediaType]);

  // Listen for manual download completion events (fallback)
  useEffect(() => {
    const handleDownloadComplete = () => {
      console.log(
        "🔄 [SNAPCHAT GALLERY] Manual download detected, refreshing gallery..."
      );
      setTimeout(() => {
        setPage(1);
        setAllItems([]);
        fetchGallery(1, false);
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

  return (
    <div className="gallery-container">
      <div className="gallery-header">
        <h2>Snapchat Gallery</h2>
        <div className="statsbutton-container">
          <button
            onClick={() => setShowStats(!showStats)}
            className="stats-toggle-btn-small"
            title={showStats ? "Hide Stats" : "Show Stats"}
          >
            📊 {showStats ? "Hide" : "Show"} Stats
          </button>
        </div>
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
          <div className="gallery-status">
            <span
              className={`ws-status ${
                wsConnected ? "connected" : "disconnected"
              }`}
            >
              {wsConnected ? "🟢 Live" : "🔴 Offline"}
            </span>
            <span className="status-text">
              {loading ? "🔄 Loading..." : `📱 ${galleryItems.length} items`}
            </span>
          </div>
        </div>
      </div>

      {/* Search and Filter Bar */}
      <div className="search-filter-container">
        <div className="search-row">
          <input
            type="text"
            placeholder="Username"
            value={usernameFilter}
            onChange={(e) => setUsernameFilter(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === "Enter") {
                setPage(1);
                setAllItems([]);
                fetchGallery(1, false);
              }
            }}
            className="search-input"
          />

          <input
            type="text"
            placeholder="Search filename..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === "Enter") {
                setPage(1);
                setAllItems([]);
                fetchGallery(1, false);
              }
            }}
            className="search-input"
          />

          <button
            onClick={() => {
              setPage(1);
              setAllItems([]);
              fetchGallery(1, false);
            }}
            className="search-button"
          >
            🔍 Search
          </button>

          <button
            onClick={() => {
              setSearchQuery("");
              setUsernameFilter("");
              setDateFrom("");
              setDateTo("");
              setMediaTypeFilter("");
              setSortBy("date_desc");
              setPage(1);
              setAllItems([]);
              setTimeout(() => fetchGallery(1, false), 100);
            }}
            className="clear-button"
          >
            ✕ Clear
          </button>
        </div>

        <div className="filter-row">
          <div className="filter-group">
            <label>Date From:</label>
            <div className="date-dropdown-group">
              {(() => {
                const dateFromParts = parseDate(dateFrom);
                return (
                  <>
                    <select
                      value={dateFromParts.year}
                      onChange={(e) =>
                        handleDateFromChange("year", e.target.value)
                      }
                      className="date-select"
                    >
                      <option value="">Year</option>
                      {Array.from(
                        { length: 10 },
                        (_, i) => new Date().getFullYear() - i
                      ).map((year) => (
                        <option key={year} value={year.toString()}>
                          {year}
                        </option>
                      ))}
                    </select>
                    <select
                      value={dateFromParts.month}
                      onChange={(e) =>
                        handleDateFromChange("month", e.target.value)
                      }
                      className="date-select"
                      disabled={!dateFromParts.year}
                    >
                      <option value="">Month</option>
                      {Array.from({ length: 12 }, (_, i) => {
                        const month = (i + 1).toString().padStart(2, "0");
                        const monthNames = [
                          "Jan",
                          "Feb",
                          "Mar",
                          "Apr",
                          "May",
                          "Jun",
                          "Jul",
                          "Aug",
                          "Sep",
                          "Oct",
                          "Nov",
                          "Dec",
                        ];
                        return { value: month, label: monthNames[i] };
                      }).map(({ value, label }) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <select
                      value={dateFromParts.day}
                      onChange={(e) =>
                        handleDateFromChange("day", e.target.value)
                      }
                      className="date-select"
                      disabled={!dateFromParts.year || !dateFromParts.month}
                    >
                      <option value="">Day</option>
                      {Array.from({ length: 31 }, (_, i) =>
                        (i + 1).toString().padStart(2, "0")
                      ).map((day) => (
                        <option key={day} value={day}>
                          {day}
                        </option>
                      ))}
                    </select>
                  </>
                );
              })()}
            </div>
          </div>

          <div className="filter-group">
            <label>Date To:</label>
            <div className="date-dropdown-group">
              {(() => {
                const dateToParts = parseDate(dateTo);
                return (
                  <>
                    <select
                      value={dateToParts.year}
                      onChange={(e) =>
                        handleDateToChange("year", e.target.value)
                      }
                      className="date-select"
                    >
                      <option value="">Year</option>
                      {Array.from(
                        { length: 10 },
                        (_, i) => new Date().getFullYear() - i
                      ).map((year) => (
                        <option key={year} value={year.toString()}>
                          {year}
                        </option>
                      ))}
                    </select>
                    <select
                      value={dateToParts.month}
                      onChange={(e) =>
                        handleDateToChange("month", e.target.value)
                      }
                      className="date-select"
                      disabled={!dateToParts.year}
                    >
                      <option value="">Month</option>
                      {Array.from({ length: 12 }, (_, i) => {
                        const month = (i + 1).toString().padStart(2, "0");
                        const monthNames = [
                          "Jan",
                          "Feb",
                          "Mar",
                          "Apr",
                          "May",
                          "Jun",
                          "Jul",
                          "Aug",
                          "Sep",
                          "Oct",
                          "Nov",
                          "Dec",
                        ];
                        return { value: month, label: monthNames[i] };
                      }).map(({ value, label }) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <select
                      value={dateToParts.day}
                      onChange={(e) =>
                        handleDateToChange("day", e.target.value)
                      }
                      className="date-select"
                      disabled={!dateToParts.year || !dateToParts.month}
                    >
                      <option value="">Day</option>
                      {Array.from({ length: 31 }, (_, i) =>
                        (i + 1).toString().padStart(2, "0")
                      ).map((day) => (
                        <option key={day} value={day}>
                          {day}
                        </option>
                      ))}
                    </select>
                  </>
                );
              })()}
            </div>
          </div>

          <div className="filter-group">
            <label>Type:</label>
            <select
              value={mediaTypeFilter}
              onChange={(e) => setMediaTypeFilter(e.target.value as any)}
              className="type-select"
            >
              <option value="">All</option>
              <option value="video">Videos</option>
              <option value="image">Images</option>
            </select>
          </div>

          <div className="filter-group">
            <label>Sort:</label>
            <select
              value={sortBy}
              onChange={(e) => {
                setSortBy(e.target.value);
                setTimeout(() => {
                  setPage(1);
                  setAllItems([]);
                  fetchGallery(1, false);
                }, 100);
              }}
              className="sort-select"
            >
              <option value="date_desc">Newest First</option>
              <option value="date_asc">Oldest First</option>
              <option value="filename_asc">Filename (A-Z)</option>
              <option value="filename_desc">Filename (Z-A)</option>
              <option value="type">Videos First</option>
            </select>
          </div>
        </div>

        {(dateFrom || dateTo) && !usernameFilter && (
          <div className="search-info">
            ℹ️ Date search without username will show results grouped by user
          </div>
        )}
      </div>

      {/* Selection Mode Toolbar */}
      {selectionMode && (
        <div className="selection-toolbar">
          <div className="selection-info">
            <button onClick={handleSelectAll} className="select-all-button">
              {(() => {
                const totalAvailable = paginationInfo?.total || allItems.length;
                return selectedItems.size === totalAvailable && totalAvailable > 0
                  ? "☑️ Deselect All"
                  : "☑️ Select All";
              })()}
            </button>
            <span className="selection-count">
              {selectedItems.size} of {paginationInfo?.total || allItems.length} selected
            </span>
          </div>

          {selectedItems.size > 0 && (
            <div className="selection-actions">
              <button
                onClick={handleBulkDownload}
                className="bulk-action-btn download"
              >
                📥 Download ({selectedItems.size})
              </button>
              <button
                onClick={handleBulkDelete}
                className="bulk-action-btn delete"
              >
                🗑️ Delete ({selectedItems.size})
              </button>
              <button
                onClick={handleBulkTelegram}
                className="bulk-action-btn telegram"
              >
                📤 Send to Telegram ({selectedItems.size})
              </button>
              <button
                onClick={handleClearSelection}
                className="bulk-action-btn cancel"
              >
                ✕ Cancel
              </button>
            </div>
          )}
        </div>
      )}

      {/* Action Buttons Container */}
      <div className="action-buttons-container">
        <div className="action-buttons-left">
          <button
            onClick={() => setSelectionMode(!selectionMode)}
            className="selection-mode-toggle"
          >
            {selectionMode ? "✓ Done Selecting" : "☑️ Select Items"}
          </button>
        </div>

        <button
          onClick={() => {
            setPage(1);
            setAllItems([]);
            fetchGallery(1, false);
          }}
          className="refresh-button"
          disabled={false}
        >
          {loading ? "🔄 Refreshing..." : "🔄 Refresh"}
        </button>
      </div>

      {showStats && storageStats && (
        <div className="storage-stats-panel">
          <h3>Storage Statistics</h3>

          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-value">{storageStats.total_files}</div>
              <div className="stat-label">Total Files</div>
            </div>

            <div className="stat-card">
              <div className="stat-value">{storageStats.total_size_mb} MB</div>
              <div className="stat-label">Storage Used</div>
            </div>

            <div className="stat-card">
              <div className="stat-value">
                {storageStats.by_file_type.video}
              </div>
              <div className="stat-label">Videos</div>
            </div>

            <div className="stat-card">
              <div className="stat-value">
                {storageStats.by_file_type.image}
              </div>
              <div className="stat-label">Images</div>
            </div>
          </div>

          <div className="stats-breakdown">
            <h4>By User</h4>
            <div className="stats-list">
              {Object.entries(storageStats.by_username).map(
                ([username, stats]: [string, any]) => (
                  <div key={username} className="stats-list-item">
                    <span className="stats-username">@{username}</span>
                    <span className="stats-files">{stats.files} files</span>
                    <span className="stats-size">
                      {stats.size_mb.toFixed(2)} MB
                    </span>
                  </div>
                )
              )}
            </div>
          </div>

          <div className="stats-breakdown">
            <h4>By Type</h4>
            <div className="stats-list">
              {Object.entries(storageStats.by_media_type).map(
                ([type, count]: [string, any]) => (
                  <div key={type} className="stats-list-item">
                    <span className="stats-type">{type}</span>
                    <span className="stats-count">{count} items</span>
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      )}

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
              <li>Use the Refresh button above to reload the gallery</li>
            </ul>
          </div>
        </div>
      )}

      {!loading && galleryItems.length > 0 && (
        <div className="gallery-grid">
          {galleryItems.map((item, idx) => {
            const itemKey = getItemKey(item);
            const isSelected = selectedItems.has(itemKey);

            return (
              <div
                key={idx}
                className="gallery-item"
                onClick={() => {
                  if (selectionMode) {
                    // Toggle selection when clicking the item in selection mode
                    handleSelectItem(item, !isSelected);
                  } else {
                    // Open preview when not in selection mode
                    handleOpenPreview(item, idx);
                  }
                }}
                style={{ cursor: selectionMode ? "pointer" : "pointer" }}
              >
                {selectionMode && (
                  <div className="selection-checkbox-container">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => {
                        e.stopPropagation();
                        handleSelectItem(item, e.target.checked);
                      }}
                      className="item-checkbox"
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                )}
                <div className="gallery-thumbnail-container">
                  {item.thumb || item.thumbnail_url ? (
                    <img
                      src={item.thumbnail_url || item.thumb}
                      alt="Media preview"
                      className="gallery-thumbnail"
                      loading="lazy"
                      onError={(e) => {
                        // Fallback: if thumbnail fails for video, show video icon
                        if (item.type === "video") {
                          e.currentTarget.style.display = "none";
                          const placeholder =
                            e.currentTarget.parentElement?.querySelector(
                              ".gallery-thumbnail.placeholder"
                            ) as HTMLElement;
                          if (placeholder) {
                            placeholder.style.display = "flex";
                            placeholder.innerHTML = "<span>🎥</span>";
                          }
                        }
                      }}
                    />
                  ) : (
                    <div className="gallery-thumbnail placeholder">
                      <span>{item.type === "video" ? "🎥" : "📸"}</span>
                    </div>
                  )}

                  {/* Progress Overlay */}
                  {(item.download_status === "downloading" ||
                    downloadProgress[
                      item.download_url?.split("/").pop() || ""
                    ]) && (
                    <div className="download-progress-overlay">
                      <div className="progress-bar">
                        <div
                          className="progress-fill"
                          style={{
                            width: `${
                              downloadProgress[
                                item.download_url?.split("/").pop() || ""
                              ]?.progress || 0
                            }%`,
                          }}
                        />
                      </div>
                      <span className="progress-text">
                        {downloadProgress[
                          item.download_url?.split("/").pop() || ""
                        ]?.progress || 0}
                        %
                      </span>
                    </div>
                  )}

                  {/* Status Badge - Removed complete status, only show active states */}
                  {item.download_status &&
                    item.download_status !== "complete" && (
                      <div className={`status-badge ${item.download_status}`}>
                        {item.download_status === "downloading" && "🟡"}
                        {item.download_status === "error" && "🔴"}
                        {item.download_status === "queued" && "⚪"}
                      </div>
                    )}
                </div>
                <div className="gallery-item-content">
                  {item.username && (
                    <div className="username-badge">@{item.username}</div>
                  )}
                  <div className="item-info">
                    <span className="item-filename">
                      <span>
                        {item.download_url || item.url
                          ? (item.download_url || item.url).split("/").pop() ||
                            "Unknown file"
                          : "No URL available"}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const filename =
                            (item.download_url || item.url)?.split("/").pop() ||
                            "Unknown file";
                          navigator.clipboard.writeText(filename);
                        }}
                        title="Copy filename"
                      >
                        📋
                      </button>
                    </span>
                    <span className="item-type">
                      {item.type
                        ? item.type.charAt(0).toUpperCase() + item.type.slice(1)
                        : mediaType}
                    </span>
                    <span className="item-timestamp">
                      {new Date().toLocaleDateString()}
                    </span>
                  </div>
                  <div className="item-actions">
                    {(item.url || item.download_url) && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation(); // Prevent modal from opening
                          const url = item.download_url || item.url;
                          const filename = url.split("/").pop() || "download";
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = filename;
                          document.body.appendChild(a);
                          a.click();
                          document.body.removeChild(a);
                        }}
                        className="download-link"
                      >
                        Download
                      </button>
                    )}
                    {(item.url || item.download_url) && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation(); // Prevent modal from opening
                          handleSendToTelegram(
                            idx,
                            item.download_url || item.url
                          );
                        }}
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
                      <div className="telegram-error">
                        {telegramErrors[idx]}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Infinite Scroll Sentinel */}
      {!loading && galleryItems.length > 0 && hasMore && (
        <div ref={observerTarget} className="scroll-sentinel">
          <div className="loading-spinner">Loading more...</div>
        </div>
      )}

      {!loading && galleryItems.length > 0 && !hasMore && (
        <div className="end-of-results">
          End of results ({galleryItems.length} items total)
        </div>
      )}

      {/* Preview Modal */}
      {previewItem && (
        <div className="preview-modal-overlay" onClick={handleClosePreview}>
          <div
            className="preview-modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Navigation Arrows */}
            {previewIndex > 0 && (
              <button className="preview-nav prev" onClick={handlePrevItem}>
                ‹
              </button>
            )}
            {previewIndex < galleryItems.length - 1 && (
              <button className="preview-nav next" onClick={handleNextItem}>
                ›
              </button>
            )}

            {/* Close Button */}
            <button className="preview-close" onClick={handleClosePreview}>
              ✕
            </button>

            {/* Media Display */}
            <div className="preview-media-container">
              {previewItem.type === "video" ? (
                <video
                  src={previewItem.download_url}
                  controls
                  autoPlay
                  className="preview-media"
                />
              ) : (
                <img
                  src={previewItem.thumbnail_url || previewItem.download_url}
                  alt={previewItem.download_url?.split("/").pop()}
                  className="preview-media"
                  style={{
                    transform: `scale(${zoomLevel}) translate(${panPosition.x}px, ${panPosition.y}px)`,
                    cursor: zoomLevel > 1 ? "move" : "default",
                  }}
                  draggable={zoomLevel > 1}
                />
              )}
            </div>

            {/* Action Bar */}
            <div className="preview-actions">
              <div className="preview-info">
                <span className="preview-filename">
                  {previewItem.download_url?.split("/").pop()}
                </span>
                <span className="preview-counter">
                  {previewIndex + 1} / {galleryItems.length}
                </span>
              </div>

              <div className="preview-buttons">
                {previewItem.type !== "video" && (
                  <>
                    <button onClick={handleZoomOut} disabled={zoomLevel <= 1}>
                      🔍-
                    </button>
                    <button onClick={handleZoomIn} disabled={zoomLevel >= 3}>
                      🔍+
                    </button>
                  </>
                )}
                <button onClick={handleDownloadFromPreview}>📥 Download</button>
                <button onClick={handleTelegramFromPreview}>
                  📤 Send to Telegram
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SnapchatPage;
