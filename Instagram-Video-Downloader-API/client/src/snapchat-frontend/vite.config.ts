import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174, // Different port from Instagram (5173)
    proxy: {
      // Snapchat service proxy (REST + WebSocket)
      '/snapchat-api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        ws: true,
        rewrite: (p) => p.replace(/^\/snapchat-api/, ''),
      },
      // Polling endpoints
      '/start-polling': { target: 'http://localhost:8000', changeOrigin: true },
      '/stop-polling': { target: 'http://localhost:8000', changeOrigin: true },
      '/poll-now': { target: 'http://localhost:8000', changeOrigin: true },
      '/status': { target: 'http://localhost:8000', changeOrigin: true },
      '/stats': { target: 'http://localhost:8000', changeOrigin: true },
      // Target management
      '/set-target': { target: 'http://localhost:8000', changeOrigin: true },
      '/polling/config': { target: 'http://localhost:8000', changeOrigin: true },
      // Telegram integration
      '/send-to-telegram': { target: 'http://localhost:8000', changeOrigin: true },
    },
  },
})
