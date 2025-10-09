import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/igdl": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
      "/send-to-telegram": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
      "/target": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
      "/poll-now": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
      "/start-polling": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
      "/stop-polling": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
      "/status": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
      "/stats": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
      "/set-target": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
      // Snapchat endpoints now integrated with Instagram backend
      "/snapchat-start-polling": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
      "/snapchat-stop-polling": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
      "/snapchat-poll-now": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
      "/snapchat-set-target": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
      "/snapchat-status": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
      "/snapchat-stats": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
      "/snapchat-download": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
      "/snapchat-clear-cache": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
      // Legacy Snapchat service proxy (for downloads and other features)
      "/snapchat-api": {
        target: "http://localhost:8000",
        changeOrigin: true,
        ws: true,
        rewrite: (p) => p.replace(/^\/snapchat-api/, ""),
      },
      // Static file serving for downloads
      "/downloads": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
});
