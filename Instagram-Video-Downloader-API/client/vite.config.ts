import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/igdl': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/send-to-telegram': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/target': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/poll-now': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/start-polling': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/stop-polling': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/status': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/stats': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/set-target': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      // Snapchat service proxy (REST + optional WS)
      '/snapchat-api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        ws: true,
        rewrite: (p) => p.replace(/^\/snapchat-api/, ''),
      },
    },
  },
})


