# Working Snapchat Manual Fetching Logic - Reference

This folder contains the **working Snapchat manual fetching system** that was previously running on port 5173. This system had basic but functional manual download capabilities.

## 🎯 **Key Differences from Current System**

### **1. Direct API Communication**

- **Working System**: Frontend directly calls Python service at `http://localhost:8000`
- **Current System**: Frontend → Node.js → Python service (proxy chain)

### **2. API Endpoints**

- **Working System**: Uses `/snapchat-api/download` directly
- **Current System**: Uses `/snapchat-download` (Node.js proxy)

### **3. WebSocket Integration**

- **Working System**: Real-time progress via WebSocket
- **Current System**: Basic polling fallback

## 📁 **File Structure**

```
reference-working-snapchat-logic/
├── api.ts              # Direct API calls to Python service
├── Downloader.tsx      # Main download component with WebSocket
├── Gallery.tsx         # Gallery display component
├── ProgressWS.ts       # WebSocket connection setup
├── App.tsx             # Main app component
├── vite.config.ts      # Proxy configuration
└── styles.css          # Styling
```

## 🔧 **Working API Logic**

### **api.ts - Direct Service Communication**

```typescript
export const SNAP_BASE: string = "/snapchat-api";

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
  // Direct error handling
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.detail || "Snapchat download failed");
  }
  return res.json();
}
```

### **vite.config.ts - Direct Proxy**

```typescript
proxy: {
  "/snapchat-api": {
    target: "http://localhost:8000",
    changeOrigin: true,
    ws: true,
    rewrite: (p) => p.replace(/^\/snapchat-api/, ""),
  },
}
```

## 🚀 **Key Features That Worked**

### **1. Real-time Progress Tracking**

- WebSocket connection for live progress updates
- Fallback to polling if WebSocket fails
- Heartbeat mechanism for connection stability

### **2. Direct Error Handling**

- Immediate error responses from Python service
- No timeout issues (direct communication)
- Clear error messages

### **3. Gallery Integration**

- Automatic gallery refresh after downloads
- Real-time file display
- Download status tracking

## 🔍 **Why This System Worked**

1. **No Proxy Chain**: Direct frontend → Python service communication
2. **No Timeout Issues**: Direct API calls without Node.js proxy
3. **WebSocket Support**: Real-time progress updates
4. **Simple Architecture**: Fewer moving parts = fewer failure points

## 📋 **Implementation Notes**

### **To Fix Current System:**

1. **Remove Node.js proxy** for manual downloads
2. **Use direct API calls** like in `api.ts`
3. **Implement WebSocket** for real-time progress
4. **Simplify error handling** with direct responses

### **Current Issues:**

- Node.js proxy adds 60-second timeout
- Complex error handling chain
- No real-time progress updates
- Gallery refresh issues

## 🎯 **Recommendation**

Consider implementing the **direct API approach** from this working system for manual downloads, while keeping the Node.js proxy only for polling functionality.
