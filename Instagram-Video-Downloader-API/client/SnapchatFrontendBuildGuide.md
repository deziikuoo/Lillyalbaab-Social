# Snapchat Frontend Implementation Guide

## Overview
This guide outlines the implementation plan for creating a comprehensive frontend for the Snapchat service that mirrors the functionality and design patterns of the Instagram service frontend. The goal is to provide a unified, modern React-based interface for Snapchat content downloading, polling management, and Telegram integration.

## Technology Stack Alignment

### Core Technologies (Same as Instagram)
- **React 18.3.1** - Modern React with hooks and functional components
- **TypeScript 5.8.3** - Type-safe JavaScript development
- **Vite 7.1.2** - Fast build tool and development server
- **React Router DOM 7.8.0** - Client-side routing

### Development Tools
- **@vitejs/plugin-react** - Vite plugin for React support
- **@types/react** - TypeScript definitions for React
- **@types/react-dom** - TypeScript definitions for React DOM

## Project Structure

```
snapchat-frontend/
├── src/
│   ├── App.tsx                 # Main application component
│   ├── style.css              # Global styles (mirroring Instagram design)
│   ├── main.tsx               # Application entry point
│   ├── components/            # Reusable components
│   │   ├── TargetManager.tsx  # Target management component
│   │   ├── PollingManager.tsx # Polling control component
│   │   ├── Downloader.tsx     # Content downloader component
│   │   ├── Gallery.tsx        # Media gallery component
│   │   ├── TelegramSender.tsx # Telegram integration component
│   │   └── StatusIndicator.tsx # Real-time status indicators
│   ├── hooks/                 # Custom React hooks
│   │   ├── usePolling.ts      # Polling state management
│   │   ├── useTarget.ts       # Target management
│   │   ├── useTelegram.ts     # Telegram integration
│   │   └── useWebSocket.ts    # WebSocket management
│   ├── api/                   # API integration
│   │   ├── snapchatApi.ts     # Snapchat API functions
│   │   ├── pollingApi.ts      # Polling API functions
│   │   └── telegramApi.ts     # Telegram API functions
│   ├── types/                 # TypeScript type definitions
│   │   ├── snapchat.ts        # Snapchat-specific types
│   │   ├── polling.ts         # Polling-related types
│   │   └── telegram.ts        # Telegram-related types
│   └── utils/                 # Utility functions
│       ├── urlUtils.ts        # URL processing utilities
│       ├── validation.ts      # Input validation
│       └── formatters.ts      # Data formatting utilities
├── public/
│   └── snapchat-icon.svg      # Snapchat-themed icon
├── index.html                 # HTML entry point
├── vite.config.ts            # Vite configuration
├── tsconfig.json             # TypeScript configuration
└── package.json              # Dependencies and scripts
```

## Phase 1: Core Infrastructure Setup

### 1.1 Project Initialization
```bash
# Create new React project with TypeScript
npm create vite@latest snapchat-frontend -- --template react-ts
cd snapchat-frontend

# Install dependencies
npm install react-router-dom @types/react @types/react-dom
npm install -D @vitejs/plugin-react typescript
```

### 1.2 Vite Configuration
```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174, // Different port from Instagram
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
    },
  },
})
```

### 1.3 Type Definitions
```typescript
// types/snapchat.ts
export interface SnapchatStory {
  id: string
  url: string
  type: 'photo' | 'video'
  timestamp: string
  username: string
  thumbnail?: string
  quality?: string
}

export interface DownloadItem {
  id: string
  url: string
  type: 'photo' | 'video'
  thumbnail?: string
  quality?: string
  isProgress?: boolean
  carouselIndex?: number
}

export interface PollingStatus {
  enabled: boolean
  active: boolean
  started: boolean
  target_username?: string
  current_interval?: number
  activity_level?: string
}

export interface TelegramStatus {
  [key: string]: 'idle' | 'sending' | 'success' | 'error'
}

export interface TelegramError {
  [key: string]: string
}
```

## Phase 2: Core Components Implementation

### 2.1 Main Application Component (App.tsx) - Enhanced with Target Management
```typescript
import React, { useState, useEffect, useMemo } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import SnapchatPage from './snapchat/SnapchatPage'
import './style.css'

// API base URL for Snapchat service
const API_BASE_URL = '/snapchat-api'

// Type definitions
interface DownloadItem {
  quality?: string
  thumb?: string
  url: string
  isProgress?: boolean
  carouselIndex?: number
  isVideo?: boolean
}

interface PollingStatus {
  enabled: boolean
  active: boolean
  started: boolean
  target_username?: string
  current_interval?: number
  activity_level?: string
}

const App: React.FC = () => {
  // Core download state
  const [username, setUsername] = useState('')
  const [downloadType, setDownloadType] = useState<'stories' | 'highlights' | 'spotlights'>('stories')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<DownloadItem[]>([])

  // Telegram integration state
  const [autoSendToTelegram, setAutoSendToTelegram] = useState(true)
  const [sendingStatus, setSendingStatus] = useState<{ [key: number]: 'idle' | 'sending' | 'success' | 'error' }>({})
  const [telegramErrors, setTelegramErrors] = useState<{ [key: number]: string }>({})

  // Target management state - CRITICAL MISSING FEATURE
  const [currentTarget, setCurrentTarget] = useState<string>('')
  const [newTarget, setNewTarget] = useState<string>('')
  const [targetLoading, setTargetLoading] = useState(false)
  const [targetError, setTargetError] = useState<string | null>(null)
  const [showTargetManager, setShowTargetManager] = useState(false)
  const [showPollingManager, setShowPollingManager] = useState(false)

  // Polling status state - CRITICAL MISSING FEATURE
  const [pollingStatus, setPollingStatus] = useState<PollingStatus>({ 
    enabled: false, 
    active: false, 
    started: false 
  })

  // Statistics state - MISSING FEATURE
  const [showStats, setShowStats] = useState(false)
  const [stats, setStats] = useState<any>(null)
  const [statsLoading, setStatsLoading] = useState(false)

  // URL validation for Snapchat usernames
  const isValidSnapchatUsername = useMemo(() => {
    if (!username) return false
    // Snapchat usernames: 3-15 characters, alphanumeric and underscores
    return /^[a-zA-Z0-9_]{3,15}$/.test(username.trim())
  }, [username])

  // Fetch current target and polling status - CRITICAL MISSING FEATURE
  const fetchCurrentTarget = async () => {
    try {
      const response = await fetch('/status')
      const data = await response.json()
      setCurrentTarget(data.target_username || '')
      setPollingStatus({
        enabled: data.enabled || false,
        active: data.active || false,
        started: data.started || false,
        target_username: data.target_username,
        current_interval: data.current_interval,
        activity_level: data.activity_level
      })
    } catch (error) {
      console.error('Failed to fetch current target:', error)
    }
  }

  // Set target username - CRITICAL MISSING FEATURE
  const setTarget = async (targetUsername: string) => {
    setTargetLoading(true)
    setTargetError(null)
    
    try {
      const response = await fetch('/set-target', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: targetUsername })
      })
      
      const data = await response.json()
      
      if (response.ok) {
        setCurrentTarget(targetUsername)
        setShowTargetManager(false)
        setNewTarget('')
        await fetchCurrentTarget()
      } else {
        setTargetError(data.detail || 'Failed to set target')
      }
    } catch (error) {
      setTargetError('Network error')
    } finally {
      setTargetLoading(false)
    }
  }

  // Start polling - CRITICAL MISSING FEATURE
  const startPolling = async () => {
    try {
      const response = await fetch('/start-polling', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
      const data = await response.json()
      if (data.success) {
        alert('Polling started successfully!')
        await fetchCurrentTarget()
      } else {
        alert(data.detail || 'Failed to start polling')
      }
    } catch (error) {
      alert('Error starting polling')
    }
  }

  // Stop polling - CRITICAL MISSING FEATURE
  const stopPolling = async () => {
    try {
      const response = await fetch('/stop-polling', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
      const data = await response.json()
      if (data.success) {
        alert('Polling stopped successfully!')
        await fetchCurrentTarget()
      } else {
        alert(data.detail || 'Failed to stop polling')
      }
    } catch (error) {
      alert('Error stopping polling')
    }
  }

  // Manual poll - CRITICAL MISSING FEATURE
  const manualPoll = async () => {
    try {
      const response = await fetch('/poll-now?force=true')
      const data = await response.json()
      if (data.success) {
        alert('Manual poll triggered successfully!')
        await fetchCurrentTarget()
      } else {
        alert(data.detail || 'Failed to trigger manual poll')
      }
    } catch (error) {
      alert('Error triggering manual poll')
    }
  }

  // Fetch statistics - MISSING FEATURE
  const fetchStats = async () => {
    setStatsLoading(true)
    try {
      const response = await fetch('/stats')
      const data = await response.json()
      setStats(data)
    } catch (error) {
      console.error('Failed to fetch stats:', error)
    } finally {
      setStatsLoading(false)
    }
  }

  // Clear cache - MISSING FEATURE
  const clearCache = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/clear-cache`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
      const data = await response.json()
      if (data.success) {
        alert('Cache cleared successfully!')
      } else {
        alert(data.detail || 'Failed to clear cache')
      }
    } catch (error) {
      alert('Error clearing cache')
    }
  }

  // Fetch current target on mount and every 3 seconds
  useEffect(() => {
    fetchCurrentTarget()
    const interval = setInterval(fetchCurrentTarget, 3000)
    return () => clearInterval(interval)
  }, [])

  return (
    <BrowserRouter>
      <div className="app-container">
        <div className="content-wrapper">
          <h1 className="app-title">Snapchat Content Manager</h1>
          <p className="app-subtitle">
            Download Snapchat stories, highlights, and spotlights with automatic polling and Telegram integration.
          </p>

          {/* Target Management - CRITICAL MISSING FEATURE */}
          <div className="target-management">
            <div className="current-target">
              <span className="target-label">Currently tracking:</span>
              <span className="target-username">
                {currentTarget ? `@${currentTarget}` : 'No target set'}
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
                    setShowStats(!showStats)
                    if (!showStats) fetchStats()
                  }}
                >
                  Statistics
                </button>
              </div>
            </div>

            {showTargetManager && (
              <div className="target-manager">
                <form onSubmit={(e) => {
                  e.preventDefault()
                  if (newTarget.trim()) {
                    setTarget(newTarget.trim())
                  }
                }} className="target-form">
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
                      {targetLoading ? 'Updating...' : 'Update'}
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
                    {pollingStatus.active ? 'Polling is active' : 'Polling is stopped'}
                    {pollingStatus.current_interval && ` (${pollingStatus.current_interval} min intervals)`}
                    {pollingStatus.activity_level && ` - Activity: ${pollingStatus.activity_level}`}
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
                    {statsLoading ? 'Loading...' : '🔄 Refresh'}
                  </button>
                </div>
                {stats && (
                  <div className="stats-content">
                    <div className="stats-grid">
                      <div className="stat-item">
                        <span className="stat-label">Snapchat Requests:</span>
                        <span className="stat-value">{stats.snapchat?.total || 0}</span>
                      </div>
                      <div className="stat-item">
                        <span className="stat-label">Telegram Sends:</span>
                        <span className="stat-value">{stats.telegram?.total || 0}</span>
                      </div>
                      <div className="stat-item">
                        <span className="stat-label">Success Rate:</span>
                        <span className="stat-value">
                          {stats.snapchat?.total ? 
                            `${Math.round((stats.snapchat.success / stats.snapchat.total) * 100)}%` : 
                            'N/A'
                          }
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
              <span className="toggle-label">
                📱 Auto-send to Telegram
              </span>
            </label>
          </div>

          {/* Main Content */}
          <Routes>
            <Route path="/" element={<SnapchatPage />} />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  )
}

export default App
                onChange={(e) => setAutoSendToTelegram(e.target.checked)}
              />
              <span className="toggle-slider"></span>
              <span className="toggle-label">
                📱 Auto-send to Telegram
              </span>
            </label>
          </div>

          {/* Main Content */}
          <Routes>
            <Route path="/" element={
              <div className="main-content">
                <Downloader 
                  target={currentTarget}
                  autoSendToTelegram={autoSendToTelegram}
                />
                <Gallery target={currentTarget} />
              </div>
            } />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  )
}

export default App
```

### 2.2 Enhanced Downloader Component - With Missing Features
```typescript
// snapchat/Downloader.tsx
import React, { useState, useRef, useEffect } from 'react'
import { startDownload, getProgress } from './api'
import { createProgressSocket } from './ProgressWS'

interface DownloadItem {
  quality?: string
  thumb?: string
  url: string
  isProgress?: boolean
  carouselIndex?: number
  isVideo?: boolean
}

const Downloader: React.FC = () => {
  const [username, setUsername] = useState('')
  const [downloadType, setDownloadType] = useState<'stories' | 'highlights' | 'spotlights'>('stories')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<DownloadItem[]>([])
  const [overallProgress, setOverallProgress] = useState({ status: 'idle', progress: 0, message: '' })
  const [fileProgress, setFileProgress] = useState<Record<string, any>>({})
  const [autoSendToTelegram, setAutoSendToTelegram] = useState(true)

  const wsRef = useRef<WebSocket | null>(null)
  const reconnectAttemptsRef = useRef(0)
  const reconnectTimerRef = useRef<number | null>(null)
  const heartbeatTimerRef = useRef<number | null>(null)
  const pollingTimerRef = useRef<number | null>(null)

  const setupWebSocket = () => {
    if (!username.trim()) return

    const ws = createProgressSocket(username, downloadType)
    wsRef.current = ws

    ws.onopen = () => {
      console.log('[Snapchat] WebSocket connected')
      reconnectAttemptsRef.current = 0
      startHeartbeat()
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        
        if (data.overall) {
          setOverallProgress(data.overall)
        }
        
        if (data.files) {
          setFileProgress(data.files)
        }
        
        if (data.complete) {
          setLoading(false)
          setOverallProgress({ status: 'complete', progress: 100, message: 'Download completed!' })
        }
      } catch (err) {
        console.warn('[Snapchat] WS message parse failed:', err)
      }
    }

    ws.onclose = () => {
      console.warn('[Snapchat] WebSocket closed')
      clearHeartbeat()
      scheduleReconnect()
    }

    ws.onerror = (error) => {
      console.error('[Snapchat] WebSocket error:', error)
    }
  }

  const startHeartbeat = () => {
    heartbeatTimerRef.current = window.setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'heartbeat' }))
      }
    }, 30000) // 30 second heartbeat
  }

  const clearHeartbeat = () => {
    if (heartbeatTimerRef.current) {
      clearInterval(heartbeatTimerRef.current)
      heartbeatTimerRef.current = null
    }
  }

  const scheduleReconnect = () => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current)
    }

    const maxAttempts = 5
    if (reconnectAttemptsRef.current < maxAttempts) {
      reconnectAttemptsRef.current += 1
      const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current - 1), 10000)
      
      reconnectTimerRef.current = window.setTimeout(() => {
        console.log(`[Snapchat] Attempting reconnection ${reconnectAttemptsRef.current}/${maxAttempts}`)
        setupWebSocket()
      }, delay)
    } else {
      console.warn('[Snapchat] Max reconnection attempts reached, falling back to polling')
      startPollingFallback()
    }
  }

  const startPollingFallback = () => {
    if (pollingTimerRef.current) {
      clearInterval(pollingTimerRef.current)
    }

    pollingTimerRef.current = window.setInterval(async () => {
      try {
        const progress = await getProgress(username, downloadType)
        if (progress.overall) {
          setOverallProgress(progress.overall)
        }
        if (progress.files) {
          setFileProgress(progress.files)
        }
        if (progress.complete) {
          setLoading(false)
          setOverallProgress({ status: 'complete', progress: 100, message: 'Download completed!' })
          if (pollingTimerRef.current) {
            clearInterval(pollingTimerRef.current)
            pollingTimerRef.current = null
          }
        }
      } catch (error) {
        console.error('[Snapchat] Polling fallback error:', error)
      }
    }, 2000) // 2 second polling
  }

  const handleDownload = async () => {
    if (!username.trim()) {
      setError('Please enter a username')
      return
    }

    setLoading(true)
    setError(null)
    setItems([])
    setOverallProgress({ status: 'starting', progress: 0, message: 'Starting download...' })
    setFileProgress({})

    try {
      // Setup WebSocket for real-time progress
      setupWebSocket()

      // Start the download
      const response = await startDownload(username.trim(), downloadType, autoSendToTelegram)
      
      if (response.status === 'success') {
        setOverallProgress({ status: 'downloading', progress: 10, message: 'Download started...' })
        
        // If WebSocket fails, fall back to polling
        setTimeout(() => {
          if (overallProgress.status === 'starting') {
            startPollingFallback()
          }
        }, 5000)
      } else {
        setError(response.message || 'Download failed')
        setLoading(false)
        setOverallProgress({ status: 'error', progress: 0, message: 'Download failed' })
      }
    } catch (err: any) {
      setError(err.message || 'Download failed')
      setLoading(false)
      setOverallProgress({ status: 'error', progress: 0, message: 'Download failed' })
    }
  }

  const clearProgress = () => {
    setOverallProgress({ status: 'idle', progress: 0, message: '' })
    setFileProgress({})
  }

  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close()
      }
      if (heartbeatTimerRef.current) {
        clearInterval(heartbeatTimerRef.current)
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
      }
      if (pollingTimerRef.current) {
        clearInterval(pollingTimerRef.current)
      }
    }
  }, [])

  return (
    <div className="downloader-container">
      <div className="downloader-header">
        <h2>Download Snapchat Content</h2>
      </div>

      <div className="download-form">
        <div className="form-row">
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Enter Snapchat username"
            className="username-input"
            disabled={loading}
          />
          
          {/* MISSING FEATURE: Download Type Selection */}
          <select
            value={downloadType}
            onChange={(e) => setDownloadType(e.target.value as any)}
            className="download-type-select"
            disabled={loading}
          >
            <option value="stories">Stories</option>
            <option value="highlights">Highlights</option>
            <option value="spotlights">Spotlights</option>
          </select>
          
          <button
            onClick={handleDownload}
            disabled={loading || !username.trim()}
            className="download-button"
          >
            {loading ? 'Downloading...' : 'Download'}
          </button>
        </div>

        <div className="telegram-toggle-container">
          <label className="telegram-toggle">
            <input
              type="checkbox"
              checked={autoSendToTelegram}
              onChange={(e) => setAutoSendToTelegram(e.target.checked)}
              disabled={loading}
            />
            <span className="toggle-slider"></span>
            <span className="toggle-label">
              📱 Auto-send to Telegram
            </span>
          </label>
        </div>
      </div>

      {error && (
        <div className="error-message">{error}</div>
      )}

      {loading && (
        <div className="progress-container">
          <div className="overall-progress">
            <div className="progress-bar">
              <div 
                className="progress-fill" 
                style={{ width: `${overallProgress.progress}%` }}
              ></div>
            </div>
            <span className="progress-text">
              {overallProgress.message || `Progress: ${overallProgress.progress}%`}
            </span>
          </div>
          
          {/* MISSING FEATURE: File Progress Display */}
          {Object.keys(fileProgress).length > 0 && (
            <div className="file-progress">
              {Object.entries(fileProgress).map(([filename, progress]: [string, any]) => (
                <div key={filename} className="file-progress-item">
                  <span className="filename">{filename}</span>
                  <div className="file-progress-bar">
                    <div 
                      className="file-progress-fill" 
                      style={{ width: `${progress.progress || 0}%` }}
                    ></div>
                  </div>
                  <span className="file-progress-text">{progress.message || `${progress.progress || 0}%`}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* MISSING FEATURE: Success Message Display */}
      {!loading && overallProgress.status === 'complete' && (
        <div className="success-message">
          ✅ Download completed successfully!
          <button onClick={clearProgress} className="clear-progress-btn">
            Clear Progress
          </button>
        </div>
      )}
    </div>
  )
}

export default Downloader

### 2.3 Enhanced Gallery Component - With Missing Features
```typescript
// snapchat/Gallery.tsx
import React, { useState, useEffect } from 'react'
import { getGallery, sendToTelegram } from './api'

interface GalleryItem {
  filename: string
  url: string
  type: 'photo' | 'video'
  thumbnail_url?: string
  download_url: string
  timestamp?: string
  username?: string
}

const Gallery: React.FC = () => {
  const [mediaType, setMediaType] = useState<'stories' | 'highlights' | 'spotlights'>('stories')
  const [gallery, setGallery] = useState<GalleryItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sendingStatus, setSendingStatus] = useState<{ [key: string]: 'idle' | 'sending' | 'success' | 'error' }>({})
  const [telegramErrors, setTelegramErrors] = useState<{ [key: string]: string }>({})

  const fetchGallery = async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await getGallery('', mediaType) // Empty username for all users
      setGallery(response.media || [])
    } catch (err: any) {
      setError(err.message || 'Failed to fetch gallery')
    } finally {
      setLoading(false)
    }
  }

  const handleSendToTelegram = async (item: GalleryItem) => {
    const itemKey = item.filename
    setSendingStatus(prev => ({ ...prev, [itemKey]: 'sending' }))
    setTelegramErrors(prev => ({ ...prev, [itemKey]: '' }))

    try {
      await sendToTelegram(item.download_url, item.type, {
        caption: `✨ New ${mediaType} from Snapchat! 📱`,
        source: 'snapchat'
      })

      setSendingStatus(prev => ({ ...prev, [itemKey]: 'success' }))
      setTimeout(() => {
        setSendingStatus(prev => ({ ...prev, [itemKey]: 'idle' }))
      }, 2000)
    } catch (err: any) {
      setSendingStatus(prev => ({ ...prev, [itemKey]: 'error' }))
      setTelegramErrors(prev => ({ ...prev, [itemKey]: err.message }))
    }
  }

  useEffect(() => {
    fetchGallery()
  }, [mediaType])

  return (
    <div className="gallery-container">
      <div className="gallery-header">
        <h2>Gallery</h2>
        <div className="gallery-controls">
          {/* MISSING FEATURE: Media Type Selection */}
          <select
            value={mediaType}
            onChange={(e) => setMediaType(e.target.value as any)}
            className="media-type-select"
          >
            <option value="stories">Stories</option>
            <option value="highlights">Highlights</option>
            <option value="spotlights">Spotlights</option>
          </select>
          {/* MISSING FEATURE: Refresh Functionality */}
          <button onClick={fetchGallery} className="refresh-button">
            🔄 Refresh
          </button>
        </div>
      </div>

      {loading && (
        <div className="loading-message">Loading gallery...</div>
      )}

      {error && (
        <div className="error-message">{error}</div>
      )}

      <div className="gallery-grid">
        {gallery.map((item, index) => (
          <div key={item.filename || index} className="gallery-item">
            {item.thumbnail_url && (
              <img 
                src={item.thumbnail_url} 
                alt={item.filename}
                className="gallery-thumbnail"
              />
            )}
            <div className="gallery-item-content">
              <div className="item-info">
                <span className="item-filename">{item.filename}</span>
                <span className="item-type">{item.type}</span>
                {/* MISSING FEATURE: Timestamp Display */}
                {item.timestamp && (
                  <span className="item-timestamp">{new Date(item.timestamp).toLocaleString()}</span>
                )}
              </div>
              <div className="item-actions">
                <a
                  href={item.download_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="download-link"
                >
                  Download
                </a>
                <button
                  onClick={() => handleSendToTelegram(item)}
                  disabled={sendingStatus[item.filename] === 'sending'}
                  className={`telegram-send-btn ${sendingStatus[item.filename] || 'idle'}`}
                >
                  {sendingStatus[item.filename] === 'sending' && '📤 Sending...'}
                  {sendingStatus[item.filename] === 'success' && '✅ Sent'}
                  {sendingStatus[item.filename] === 'error' && '❌ Error'}
                  {sendingStatus[item.filename] === 'idle' && '📱 Send to Telegram'}
                </button>
              </div>
              {telegramErrors[item.filename] && (
                <div className="telegram-error">
                  {telegramErrors[item.filename]}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {!loading && gallery.length === 0 && (
        <div className="no-content">
          No {mediaType} found
        </div>
      )}
    </div>
  )
}

export default Gallery

## Phase 3: Missing Features Analysis & Implementation

### 3.1 Critical Missing Features (High Priority)

#### **🎯 Target Management System - COMPLETELY MISSING**
The existing Snapchat frontend has **NO target management functionality**, which is essential for the service to work properly.

**Missing Components:**
- Target state management (`currentTarget`, `newTarget`, `targetLoading`, `targetError`)
- Target setting interface with form validation
- Target display with current target indicator
- Target-based operations (polling, gallery filtering)
- Real-time target status updates

**Implementation Required:**
```typescript
// Target Management State
const [currentTarget, setCurrentTarget] = useState<string>('')
const [newTarget, setNewTarget] = useState<string>('')
const [targetLoading, setTargetLoading] = useState(false)
const [targetError, setTargetError] = useState<string | null>(null)
const [showTargetManager, setShowTargetManager] = useState(false)

// Target Management Functions
const fetchCurrentTarget = async () => { /* API call to get current target */ }
const setTarget = async (targetUsername: string) => { /* API call to set target */ }
```

#### **🔄 Polling Management System - COMPLETELY MISSING**
The existing frontend has **NO polling controls**, which is critical for automatic content monitoring.

**Missing Components:**
- Polling status tracking (`enabled`, `active`, `started`)
- Start/stop polling controls
- Manual polling trigger
- Real-time polling status updates
- Polling interval display
- Activity level indicators

**Implementation Required:**
```typescript
// Polling Management State
const [pollingStatus, setPollingStatus] = useState<PollingStatus>({ 
  enabled: false, 
  active: false, 
  started: false 
})

// Polling Management Functions
const startPolling = async () => { /* API call to start polling */ }
const stopPolling = async () => { /* API call to stop polling */ }
const manualPoll = async () => { /* API call to trigger manual poll */ }
```

#### **📊 Statistics System - COMPLETELY MISSING**
The existing frontend has **NO statistics display**, which is important for monitoring service performance.

**Missing Components:**
- Service statistics display
- Request tracking (Snapchat API calls, Telegram sends)
- Success rate calculations
- Performance metrics
- Statistics refresh functionality

**Implementation Required:**
```typescript
// Statistics State
const [showStats, setShowStats] = useState(false)
const [stats, setStats] = useState<any>(null)
const [statsLoading, setStatsLoading] = useState(false)

// Statistics Functions
const fetchStats = async () => { /* API call to get statistics */ }
```

### 3.2 Important Missing Features (Medium Priority)

#### **📥 Download Type Selection - MISSING**
The existing Downloader only supports stories, missing highlights and spotlights options.

**Missing Feature:**
```typescript
// Download Type Selection
const [downloadType, setDownloadType] = useState<'stories' | 'highlights' | 'spotlights'>('stories')

<select value={downloadType} onChange={(e) => setDownloadType(e.target.value as any)}>
  <option value="stories">Stories</option>
  <option value="highlights">Highlights</option>
  <option value="spotlights">Spotlights</option>
</select>
```

#### **📈 Enhanced Progress Tracking - MISSING**
The existing progress system is basic, missing file-level progress and detailed status.

**Missing Features:**
```typescript
// Enhanced Progress State
const [overallProgress, setOverallProgress] = useState({ status: 'idle', progress: 0, message: '' })
const [fileProgress, setFileProgress] = useState<Record<string, any>>({})

// File Progress Display
{Object.entries(fileProgress).map(([filename, progress]) => (
  <div key={filename} className="file-progress-item">
    <span className="filename">{filename}</span>
    <div className="file-progress-bar">
      <div className="file-progress-fill" style={{ width: `${progress.progress}%` }}></div>
    </div>
  </div>
))}
```

#### **🖼️ Gallery Media Type Selection - MISSING**
The existing Gallery doesn't allow filtering by content type.

**Missing Feature:**
```typescript
// Media Type Selection in Gallery
const [mediaType, setMediaType] = useState<'stories' | 'highlights' | 'spotlights'>('stories')

<select value={mediaType} onChange={(e) => setMediaType(e.target.value as any)}>
  <option value="stories">Stories</option>
  <option value="highlights">Highlights</option>
  <option value="spotlights">Spotlights</option>
</select>
```

#### **🔄 Gallery Refresh Functionality - MISSING**
The existing Gallery doesn't have manual refresh capability.

**Missing Feature:**
```typescript
// Refresh Functionality
const fetchGallery = async () => { /* API call to refresh gallery */ }

<button onClick={fetchGallery} className="refresh-button">
  🔄 Refresh
</button>
```

### 3.3 UI/UX Missing Features (Low Priority)

#### **🎨 Professional Snapchat Theme - MISSING**
The existing styling is basic, missing the professional Snapchat-themed design.

**Missing Styling:**
```css
/* Snapchat-themed color scheme */
:root {
  --snapchat-yellow: #fffc00;
  --snapchat-orange: #ff6b35;
  --snapchat-red: #f7931e;
  --snapchat-dark: #1a1a1a;
}

/* Professional gradient backgrounds */
.app-container {
  background: linear-gradient(120deg, #fffc00 0%, #ff6b35 50%, #f7931e 100%);
}

/* Glass morphism effects */
.content-wrapper {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 252, 0, 0.2);
}
```

#### **📱 Responsive Design - MISSING**
The existing design doesn't adapt well to different screen sizes.

**Missing Features:**
```css
/* Responsive breakpoints */
@media (max-width: 768px) {
  .form-row {
    flex-direction: column;
  }
  
  .gallery-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 480px) {
  .target-buttons {
    flex-direction: column;
  }
}
```

#### **✨ Animation Effects - MISSING**
The existing interface lacks smooth transitions and animations.

**Missing Features:**
```css
/* Smooth transitions */
.downloader-container, .gallery-container {
  transition: all 0.3s ease;
}

/* Loading animations */
.progress-fill {
  animation: progress-animation 2s ease-in-out infinite;
}

@keyframes progress-animation {
  0% { opacity: 0.7; }
  50% { opacity: 1; }
  100% { opacity: 0.7; }
}
```

### 3.4 Enhanced Error Handling - MISSING

#### **❌ Better Error Messages - MISSING**
The existing error handling is basic, missing detailed error information.

**Missing Features:**
```typescript
// Enhanced Error State
const [error, setError] = useState<string | null>(null)
const [errorDetails, setErrorDetails] = useState<any>(null)

// Detailed Error Display
{error && (
  <div className="error-message">
    <div className="error-title">❌ {error}</div>
    {errorDetails && (
      <div className="error-details">
        <pre>{JSON.stringify(errorDetails, null, 2)}</pre>
      </div>
    )}
  </div>
)}
```

## Phase 4: Custom Hooks Implementation

### 3.1 Polling Hook
```typescript
// hooks/usePolling.ts
import { useState, useEffect, useCallback } from 'react'
import { PollingStatus } from '../types/snapchat'
import { pollingApi } from '../api/pollingApi'

export const usePolling = () => {
  const [pollingStatus, setPollingStatus] = useState<PollingStatus>({
    enabled: false,
    active: false,
    started: false
  })

  const fetchStatus = useCallback(async () => {
    try {
      const status = await pollingApi.getStatus()
      setPollingStatus(status)
    } catch (error) {
      console.error('Failed to fetch polling status:', error)
    }
  }, [])

  const startPolling = useCallback(async () => {
    try {
      await pollingApi.startPolling()
      await fetchStatus()
    } catch (error) {
      console.error('Failed to start polling:', error)
      throw error
    }
  }, [fetchStatus])

  const stopPolling = useCallback(async () => {
    try {
      await pollingApi.stopPolling()
      await fetchStatus()
    } catch (error) {
      console.error('Failed to stop polling:', error)
      throw error
    }
  }, [fetchStatus])

  const manualPoll = useCallback(async () => {
    try {
      await pollingApi.manualPoll()
      await fetchStatus()
    } catch (error) {
      console.error('Failed to trigger manual poll:', error)
      throw error
    }
  }, [fetchStatus])

  // Real-time status updates
  useEffect(() => {
    fetchStatus()
    const interval = setInterval(fetchStatus, 3000) // 3-second updates
    return () => clearInterval(interval)
  }, [fetchStatus])

  return {
    pollingStatus,
    startPolling,
    stopPolling,
    manualPoll,
    fetchStatus
  }
}
```

### 3.2 Target Management Hook
```typescript
// hooks/useTarget.ts
import { useState, useCallback } from 'react'
import { pollingApi } from '../api/pollingApi'

export const useTarget = () => {
  const [currentTarget, setCurrentTarget] = useState<string>('')
  const [targetLoading, setTargetLoading] = useState(false)
  const [targetError, setTargetError] = useState<string | null>(null)

  const setTarget = useCallback(async (username: string) => {
    if (!username.trim()) {
      setTargetError('Username cannot be empty')
      return
    }

    setTargetLoading(true)
    setTargetError(null)

    try {
      await pollingApi.setTarget(username.trim())
      setCurrentTarget(username.trim())
    } catch (error: any) {
      setTargetError(error.message || 'Failed to set target')
      throw error
    } finally {
      setTargetLoading(false)
    }
  }, [])

  return {
    currentTarget,
    setTarget,
    targetLoading,
    targetError
  }
}
```

### 3.3 WebSocket Hook
```typescript
// hooks/useWebSocket.ts
import { useEffect, useRef, useCallback } from 'react'

interface WebSocketOptions {
  onMessage?: (data: any) => void
  onOpen?: () => void
  onClose?: () => void
  onError?: (error: Event) => void
}

export const useWebSocket = (url: string, options: WebSocketOptions = {}) => {
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectAttemptsRef = useRef(0)
  const reconnectTimerRef = useRef<number | null>(null)

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.close()
    }

    try {
      const ws = new WebSocket(url)
      wsRef.current = ws

      ws.onopen = () => {
        console.log('[WebSocket] Connected')
        reconnectAttemptsRef.current = 0
        options.onOpen?.()
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          options.onMessage?.(data)
        } catch (error) {
          console.warn('[WebSocket] Message parse failed:', error)
        }
      }

      ws.onclose = () => {
        console.warn('[WebSocket] Connection closed')
        options.onClose?.()
        
        // Reconnection logic
        const maxAttempts = 5
        if (reconnectAttemptsRef.current < maxAttempts) {
          reconnectAttemptsRef.current += 1
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current - 1), 10000)
          
          reconnectTimerRef.current = window.setTimeout(() => {
            connect()
          }, delay)
        }
      }

      ws.onerror = (error) => {
        console.error('[WebSocket] Error:', error)
        options.onError?.(error)
      }
    } catch (error) {
      console.error('[WebSocket] Connection failed:', error)
    }
  }, [url, options])

  const disconnect = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }
    
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
  }, [])

  useEffect(() => {
    if (url) {
      connect()
    }
    
    return () => {
      disconnect()
    }
  }, [url, connect, disconnect])

  return {
    send: (data: any) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify(data))
      }
    },
    disconnect
  }
}
```

## Phase 4: API Integration Layer

### 4.1 Snapchat API
```typescript
// api/snapchatApi.ts
const API_BASE = '/snapchat-api'

export interface DownloadRequest {
  username: string
  download_type: 'stories' | 'highlights' | 'spotlights'
  send_to_telegram: boolean
  telegram_caption?: string
}

export interface DownloadResponse {
  status: string
  message: string
  media_urls?: string[]
  telegram_sent?: boolean
  telegram_message?: string
}

export const snapchatApi = {
  async startDownload(request: DownloadRequest): Promise<DownloadResponse> {
    const response = await fetch(`${API_BASE}/download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request)
    })
    
    if (!response.ok) {
      throw new Error('Download failed')
    }
    
    return response.json()
  },

  async getGallery(username: string, mediaType: string) {
    const response = await fetch(`${API_BASE}/gallery/${encodeURIComponent(username)}/${mediaType}`)
    
    if (!response.ok) {
      throw new Error('Gallery fetch failed')
    }
    
    return response.json()
  },

  async getProgress(username: string, mediaType: string) {
    const response = await fetch(`${API_BASE}/progress/${encodeURIComponent(username)}/${mediaType}`)
    
    if (!response.ok) {
      throw new Error('Progress fetch failed')
    }
    
    return response.json()
  }
}
```

### 4.2 Polling API
```typescript
// api/pollingApi.ts
export interface PollingStatus {
  enabled: boolean
  active: boolean
  started: boolean
  target_username?: string
  current_interval?: number
  activity_level?: string
}

export const pollingApi = {
  async getStatus(): Promise<PollingStatus> {
    const response = await fetch('/status')
    
    if (!response.ok) {
      throw new Error('Status fetch failed')
    }
    
    return response.json()
  },

  async startPolling(): Promise<void> {
    const response = await fetch('/start-polling', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })
    
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.detail || 'Failed to start polling')
    }
  },

  async stopPolling(): Promise<void> {
    const response = await fetch('/stop-polling', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })
    
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.detail || 'Failed to stop polling')
    }
  },

  async manualPoll(): Promise<void> {
    const response = await fetch('/poll-now?force=true')
    
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.detail || 'Failed to trigger manual poll')
    }
  },

  async setTarget(username: string): Promise<void> {
    const response = await fetch('/set-target', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username })
    })
    
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.detail || 'Failed to set target')
    }
  },

  async getConfig() {
    const response = await fetch('/polling/config')
    
    if (!response.ok) {
      throw new Error('Config fetch failed')
    }
    
    return response.json()
  }
}
```

## Phase 5: Downloader Component Implementation

### 5.1 Main Downloader Component
```typescript
// components/Downloader.tsx
import React, { useState, useRef } from 'react'
import { useWebSocket } from '../hooks/useWebSocket'
import { snapchatApi } from '../api/snapchatApi'
import { DownloadItem } from '../types/snapchat'
import TelegramSender from './TelegramSender'

interface DownloaderProps {
  target: string
  autoSendToTelegram: boolean
}

const Downloader: React.FC<DownloaderProps> = ({ target, autoSendToTelegram }) => {
  const [username, setUsername] = useState(target)
  const [downloadType, setDownloadType] = useState<'stories' | 'highlights' | 'spotlights'>('stories')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<DownloadItem[]>([])
  const [overallProgress, setOverallProgress] = useState({ status: 'idle', progress: 0 })
  const [fileProgress, setFileProgress] = useState<Record<string, any>>({})

  // WebSocket for real-time progress
  const wsUrl = target ? `/snapchat-api/ws/progress/${encodeURIComponent(target)}/${downloadType}` : ''
  const { send } = useWebSocket(wsUrl, {
    onMessage: (data) => {
      if (data.overall) {
        setOverallProgress(data.overall)
      }
      if (data.files) {
        setFileProgress(data.files)
      }
    }
  })

  const handleDownload = async () => {
    if (!username.trim()) {
      setError('Please enter a username')
      return
    }

    setLoading(true)
    setError(null)
    setItems([])

    try {
      const response = await snapchatApi.startDownload({
        username: username.trim(),
        download_type: downloadType,
        send_to_telegram: autoSendToTelegram
      })

      if (response.status === 'success') {
        // Handle success - items will be available in gallery
        console.log('Download completed:', response.message)
      } else {
        setError(response.message || 'Download failed')
      }
    } catch (err: any) {
      setError(err.message || 'Download failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="downloader-container">
      <div className="downloader-header">
        <h2>Download Snapchat Content</h2>
      </div>

      <div className="download-form">
        <div className="form-row">
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Enter Snapchat username"
            className="username-input"
            disabled={loading}
          />
          
          <select
            value={downloadType}
            onChange={(e) => setDownloadType(e.target.value as any)}
            className="download-type-select"
            disabled={loading}
          >
            <option value="stories">Stories</option>
            <option value="highlights">Highlights</option>
            <option value="spotlights">Spotlights</option>
          </select>
          
          <button
            onClick={handleDownload}
            disabled={loading || !username.trim()}
            className="download-button"
          >
            {loading ? 'Downloading...' : 'Download'}
          </button>
        </div>
      </div>

      {error && (
        <div className="error-message">{error}</div>
      )}

      {loading && (
        <div className="progress-container">
          <div className="overall-progress">
            <div className="progress-bar">
              <div 
                className="progress-fill" 
                style={{ width: `${overallProgress.progress}%` }}
              ></div>
            </div>
            <span className="progress-text">
              {overallProgress.message || `Progress: ${overallProgress.progress}%`}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

export default Downloader
```

## Phase 6: Gallery Component Implementation

### 6.1 Gallery Component
```typescript
// components/Gallery.tsx
import React, { useState, useEffect } from 'react'
import { snapchatApi } from '../api/snapchatApi'
import TelegramSender from './TelegramSender'

interface GalleryProps {
  target: string
}

const Gallery: React.FC<GalleryProps> = ({ target }) => {
  const [mediaType, setMediaType] = useState<'stories' | 'highlights' | 'spotlights'>('stories')
  const [gallery, setGallery] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchGallery = async () => {
    if (!target) return

    setLoading(true)
    setError(null)

    try {
      const response = await snapchatApi.getGallery(target, mediaType)
      setGallery(response.media || [])
    } catch (err: any) {
      setError(err.message || 'Failed to fetch gallery')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (target) {
      fetchGallery()
    }
  }, [target, mediaType])

  return (
    <div className="gallery-container">
      <div className="gallery-header">
        <h2>Gallery</h2>
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
          <button onClick={fetchGallery} className="refresh-button">
            🔄 Refresh
          </button>
        </div>
      </div>

      {loading && (
        <div className="loading-message">Loading gallery...</div>
      )}

      {error && (
        <div className="error-message">{error}</div>
      )}

      <div className="gallery-grid">
        {gallery.map((item, index) => (
          <div key={item.filename || index} className="gallery-item">
            {item.thumbnail_url && (
              <img 
                src={item.thumbnail_url} 
                alt={item.filename}
                className="gallery-thumbnail"
              />
            )}
            <div className="gallery-item-content">
              <div className="item-info">
                <span className="item-filename">{item.filename}</span>
                <span className="item-type">{item.type}</span>
              </div>
              <div className="item-actions">
                <a
                  href={item.download_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="download-link"
                >
                  Download
                </a>
                <TelegramSender
                  mediaUrl={item.download_url}
                  mediaType={item.type}
                  filename={item.filename}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {!loading && gallery.length === 0 && (
        <div className="no-content">
          No {mediaType} found for @{target}
        </div>
      )}
    </div>
  )
}

export default Gallery
```

## Phase 7: Enhanced Styling Implementation - With Missing UI Features

### 7.1 Global Styles (style.css) - Enhanced with Snapchat Theme
```css
/* Enhanced Snapchat design system with missing UI features */
:root {
  color-scheme: dark;
  /* Snapchat-themed color variables */
  --snapchat-yellow: #fffc00;
  --snapchat-orange: #ff6b35;
  --snapchat-red: #f7931e;
  --snapchat-dark: #1a1a1a;
  --snapchat-light: #ffffff;
  --snapchat-gray: #f5f5f5;
  --snapchat-shadow: rgba(0, 0, 0, 0.1);
  --snapchat-border: rgba(255, 252, 0, 0.2);
}

* {
  box-sizing: border-box;
}

html, body, #root {
  height: 100%;
  margin: 0;
  padding: 0;
  width: 100%;
}

body {
  font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell,
    Noto Sans, "Helvetica Neue", Arial, "Apple Color Emoji", "Segoe UI Emoji";
  overflow-x: hidden;
  background: #1a1a1a;
  color: #1a1a1a;
}

/* Enhanced main container with Snapchat gradient */
.app-container {
  min-height: 100vh;
  width: 100%;
  background: linear-gradient(120deg, #fffc00 0%, #ff6b35 50%, #f7931e 100%);
  color: #1a1a1a;
  padding: 40px 20px;
  position: relative;
  overflow-x: hidden;
}

/* Glass morphism content wrapper */
.content-wrapper {
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border-radius: 20px;
  padding: 40px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
  border: 1px solid var(--snapchat-border);
}

/* Enhanced typography with Snapchat branding */
.app-title {
  font-size: 2.5rem;
  font-weight: 700;
  text-align: center;
  margin-bottom: 10px;
  background: linear-gradient(135deg, #fffc00 0%, #ff6b35 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.app-subtitle {
  text-align: center;
  color: #666;
  margin-bottom: 40px;
  font-size: 1.1rem;
  line-height: 1.6;
}

/* Enhanced Target Management Styles */
.target-management {
  background: rgba(255, 252, 0, 0.05);
  border: 1px solid var(--snapchat-border);
  border-radius: 16px;
  padding: 24px;
  margin-bottom: 30px;
  backdrop-filter: blur(5px);
}

.current-target {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 16px;
  margin-bottom: 20px;
}

.target-label {
  font-weight: 600;
  color: #333;
  font-size: 1rem;
}

.target-username {
  font-weight: 700;
  color: var(--snapchat-orange);
  font-size: 1.1rem;
  background: rgba(255, 107, 53, 0.1);
  padding: 8px 16px;
  border-radius: 20px;
  border: 1px solid rgba(255, 107, 53, 0.3);
}

.target-buttons {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.btn-change-target,
.btn-show-polling,
.btn-show-stats {
  background: linear-gradient(135deg, #fffc00 0%, #ff6b35 100%);
  color: #1a1a1a;
  border: none;
  padding: 10px 20px;
  border-radius: 25px;
  font-weight: 600;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: 0 4px 12px rgba(255, 252, 0, 0.3);
}

.btn-change-target:hover,
.btn-show-polling:hover,
.btn-show-stats:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(255, 252, 0, 0.4);
}

/* Enhanced Target Manager Form */
.target-manager {
  background: white;
  border-radius: 12px;
  padding: 20px;
  margin-top: 16px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
}

.target-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.input-group {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  align-items: center;
}

.target-input {
  flex: 1;
  min-width: 250px;
  padding: 12px 16px;
  border: 2px solid var(--snapchat-border);
  border-radius: 8px;
  font-size: 1rem;
  outline: none;
  transition: all 0.3s ease;
}

.target-input:focus {
  border-color: var(--snapchat-orange);
  box-shadow: 0 0 0 3px rgba(255, 107, 53, 0.1);
}

.btn-update-target {
  background: var(--snapchat-orange);
  color: white;
  border: none;
  padding: 12px 24px;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
}

.btn-update-target:hover:enabled {
  background: #e55a2b;
  transform: translateY(-1px);
}

.btn-update-target:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.target-error {
  color: #e74c3c;
  background: rgba(231, 76, 60, 0.1);
  padding: 12px;
  border-radius: 8px;
  border: 1px solid rgba(231, 76, 60, 0.3);
  font-size: 0.9rem;
}

.target-examples {
  color: #666;
  font-size: 0.85rem;
  font-style: italic;
}

/* Enhanced Polling Manager Styles */
.polling-manager {
  background: white;
  border-radius: 12px;
  padding: 20px;
  margin-top: 16px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
}

.polling-controls {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.polling-buttons {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.btn-start-polling,
.btn-stop-polling,
.btn-manual-poll {
  background: linear-gradient(135deg, #fffc00 0%, #ff6b35 100%);
  color: #1a1a1a;
  border: none;
  padding: 12px 20px;
  border-radius: 25px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: 0 4px 12px rgba(255, 252, 0, 0.3);
}

.btn-start-polling:hover,
.btn-stop-polling:hover,
.btn-manual-poll:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(255, 252, 0, 0.4);
}

.btn-stop-polling {
  background: linear-gradient(135deg, #e74c3c 0%, #c0392b 100%);
  color: white;
}

.polling-info {
  color: #666;
  font-size: 0.9rem;
  font-style: italic;
}

/* Enhanced Statistics Manager */
.stats-manager {
  background: white;
  border-radius: 12px;
  padding: 20px;
  margin-top: 16px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
}

.stats-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.stats-header h3 {
  color: #333;
  font-size: 1.2rem;
  font-weight: 600;
}

.btn-refresh-stats {
  background: var(--snapchat-orange);
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 20px;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.3s ease;
}

.btn-refresh-stats:hover:enabled {
  background: #e55a2b;
  transform: translateY(-1px);
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
}

.stat-item {
  background: rgba(255, 252, 0, 0.1);
  padding: 16px;
  border-radius: 8px;
  border: 1px solid var(--snapchat-border);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.stat-label {
  font-size: 0.9rem;
  color: #666;
  font-weight: 500;
}

.stat-value {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--snapchat-orange);
}

/* Enhanced Telegram Toggle */
.telegram-toggle-container {
  display: flex;
  justify-content: center;
  margin: 30px 0;
}

.telegram-toggle {
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  user-select: none;
}

.telegram-toggle input[type="checkbox"] {
  display: none;
}

.toggle-slider {
  width: 50px;
  height: 26px;
  background: #ccc;
  border-radius: 13px;
  position: relative;
  transition: all 0.3s ease;
}

.toggle-slider:before {
  content: '';
  position: absolute;
  width: 20px;
  height: 20px;
  background: white;
  border-radius: 50%;
  top: 3px;
  left: 3px;
  transition: all 0.3s ease;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.telegram-toggle input:checked + .toggle-slider {
  background: var(--snapchat-orange);
}

.telegram-toggle input:checked + .toggle-slider:before {
  transform: translateX(24px);
}

.toggle-label {
  font-weight: 600;
  color: #333;
  font-size: 1rem;
}

/* Enhanced Downloader Container */
.downloader-container {
  background: rgba(255, 252, 0, 0.05);
  border: 1px solid var(--snapchat-border);
  border-radius: 16px;
  padding: 24px;
  margin-bottom: 30px;
  backdrop-filter: blur(5px);
}

.downloader-header h2 {
  color: #333;
  font-size: 1.5rem;
  font-weight: 600;
  margin-bottom: 20px;
  text-align: center;
}

.download-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.form-row {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  align-items: center;
}

.username-input {
  flex: 1;
  min-width: 200px;
  padding: 12px 16px;
  border: 2px solid var(--snapchat-border);
  border-radius: 8px;
  background: white;
  color: #1a1a1a;
  font-size: 16px;
  outline: none;
  transition: all 0.3s ease;
}

.username-input:focus {
  border-color: var(--snapchat-orange);
  box-shadow: 0 0 0 3px rgba(255, 107, 53, 0.1);
}

.download-type-select {
  padding: 12px 16px;
  border: 2px solid var(--snapchat-border);
  border-radius: 8px;
  background: white;
  color: #1a1a1a;
  font-size: 16px;
  outline: none;
  cursor: pointer;
  transition: all 0.3s ease;
}

.download-type-select:focus {
  border-color: var(--snapchat-orange);
  box-shadow: 0 0 0 3px rgba(255, 107, 53, 0.1);
}

.download-button {
  background: linear-gradient(135deg, #fffc00 0%, #ff6b35 100%);
  color: #1a1a1a;
  border: none;
  padding: 12px 24px;
  border-radius: 25px;
  font-weight: 600;
  font-size: 16px;
  cursor: pointer;
  transition: all 0.3s ease;
  white-space: nowrap;
  box-shadow: 0 4px 12px rgba(255, 252, 0, 0.3);
}

.download-button:hover:enabled {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(255, 252, 0, 0.4);
}

.download-button:disabled {
  background: #ccc;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

/* Enhanced Progress Tracking */
.progress-container {
  margin-top: 20px;
  padding: 20px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.overall-progress {
  margin-bottom: 20px;
}

.progress-bar {
  width: 100%;
  height: 8px;
  background: #f0f0f0;
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 8px;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #fffc00 0%, #ff6b35 100%);
  border-radius: 4px;
  transition: width 0.3s ease;
  animation: progress-animation 2s ease-in-out infinite;
}

@keyframes progress-animation {
  0% { opacity: 0.7; }
  50% { opacity: 1; }
  100% { opacity: 0.7; }
}

.progress-text {
  font-size: 0.9rem;
  color: #666;
  font-weight: 500;
}

/* File Progress Display */
.file-progress {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.file-progress-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: rgba(255, 252, 0, 0.05);
  border-radius: 8px;
  border: 1px solid var(--snapchat-border);
}

.filename {
  font-size: 0.9rem;
  color: #333;
  font-weight: 500;
  min-width: 150px;
}

.file-progress-bar {
  flex: 1;
  height: 6px;
  background: #f0f0f0;
  border-radius: 3px;
  overflow: hidden;
}

.file-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #fffc00 0%, #ff6b35 100%);
  border-radius: 3px;
  transition: width 0.3s ease;
}

.file-progress-text {
  font-size: 0.8rem;
  color: #666;
  min-width: 60px;
  text-align: right;
}

/* Success Message */
.success-message {
  background: rgba(46, 204, 113, 0.1);
  border: 1px solid rgba(46, 204, 113, 0.3);
  color: #27ae60;
  padding: 16px;
  border-radius: 8px;
  margin-top: 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.clear-progress-btn {
  background: #27ae60;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 20px;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.3s ease;
}

.clear-progress-btn:hover {
  background: #229954;
  transform: translateY(-1px);
}

/* Enhanced Gallery Container */
.gallery-container {
  background: rgba(255, 252, 0, 0.05);
  border: 1px solid var(--snapchat-border);
  border-radius: 16px;
  padding: 24px;
  backdrop-filter: blur(5px);
}

.gallery-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  flex-wrap: wrap;
  gap: 16px;
}

.gallery-header h2 {
  color: #333;
  font-size: 1.5rem;
  font-weight: 600;
}

.gallery-controls {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}

.media-type-select {
  padding: 10px 16px;
  border: 2px solid var(--snapchat-border);
  border-radius: 8px;
  background: white;
  color: #1a1a1a;
  font-size: 14px;
  outline: none;
  cursor: pointer;
  transition: all 0.3s ease;
}

.media-type-select:focus {
  border-color: var(--snapchat-orange);
  box-shadow: 0 0 0 3px rgba(255, 107, 53, 0.1);
}

.refresh-button {
  background: var(--snapchat-orange);
  color: white;
  border: none;
  padding: 10px 16px;
  border-radius: 20px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.3s ease;
}

.refresh-button:hover {
  background: #e55a2b;
  transform: translateY(-1px);
}

.gallery-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 20px;
}

.gallery-item {
  background: white;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
  transition: all 0.3s ease;
  border: 1px solid rgba(0, 0, 0, 0.05);
}

.gallery-item:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.15);
}

.gallery-thumbnail {
  width: 100%;
  height: 200px;
  object-fit: cover;
  background: #f0f0f0;
}

.gallery-item-content {
  padding: 16px;
}

.item-info {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
}

.item-filename {
  font-weight: 600;
  color: #333;
  font-size: 1rem;
  word-break: break-word;
}

.item-type {
  background: rgba(255, 252, 0, 0.2);
  color: #1a1a1a;
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 0.8rem;
  font-weight: 500;
  align-self: flex-start;
}

.item-timestamp {
  font-size: 0.8rem;
  color: #666;
  font-style: italic;
}

.item-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.download-link {
  background: var(--snapchat-orange);
  color: white;
  text-decoration: none;
  padding: 8px 16px;
  border-radius: 20px;
  font-size: 0.9rem;
  font-weight: 500;
  transition: all 0.3s ease;
  display: inline-block;
}

.download-link:hover {
  background: #e55a2b;
  transform: translateY(-1px);
}

.telegram-send-btn {
  background: #0088cc;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 20px;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  gap: 4px;
}

.telegram-send-btn:hover:enabled {
  background: #0077b3;
  transform: translateY(-1px);
}

.telegram-send-btn.success {
  background: #27ae60;
}

.telegram-send-btn.error {
  background: #e74c3c;
}

.telegram-send-btn:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.telegram-error {
  color: #e74c3c;
  font-size: 0.8rem;
  margin-top: 8px;
  padding: 8px;
  background: rgba(231, 76, 60, 0.1);
  border-radius: 4px;
  border: 1px solid rgba(231, 76, 60, 0.3);
}

/* Error and Loading Messages */
.error-message {
  background: rgba(231, 76, 60, 0.1);
  border: 1px solid rgba(231, 76, 60, 0.3);
  color: #e74c3c;
  padding: 16px;
  border-radius: 8px;
  margin: 20px 0;
  font-weight: 500;
}

.loading-message {
  text-align: center;
  color: #666;
  padding: 20px;
  font-style: italic;
}

.no-content {
  text-align: center;
  color: #666;
  padding: 40px;
  font-style: italic;
  background: rgba(255, 252, 0, 0.05);
  border-radius: 12px;
  border: 1px solid var(--snapchat-border);
}

/* Responsive Design */
@media (max-width: 768px) {
  .content-wrapper {
    padding: 20px;
    margin: 10px;
  }
  
  .app-title {
    font-size: 2rem;
  }
  
  .form-row {
    flex-direction: column;
  }
  
  .target-buttons {
    flex-direction: column;
  }
  
  .polling-buttons {
    flex-direction: column;
  }
  
  .gallery-grid {
    grid-template-columns: 1fr;
  }
  
  .stats-grid {
    grid-template-columns: 1fr;
  }
  
  .current-target {
    flex-direction: column;
    align-items: flex-start;
  }
  
  .gallery-header {
    flex-direction: column;
    align-items: flex-start;
  }
}

@media (max-width: 480px) {
  .app-container {
    padding: 10px;
  }
  
  .content-wrapper {
    padding: 16px;
  }
  
  .app-title {
    font-size: 1.5rem;
  }
  
  .target-username {
    font-size: 1rem;
    padding: 6px 12px;
  }
  
  .btn-change-target,
  .btn-show-polling,
  .btn-show-stats {
    padding: 8px 16px;
    font-size: 0.8rem;
  }
  
  .download-button {
    padding: 10px 20px;
    font-size: 14px;
  }
  
  .gallery-item {
    min-width: 100%;
  }
}

/* Smooth transitions for all interactive elements */
.downloader-container,
.gallery-container,
.target-management,
.polling-manager,
.stats-manager {
  transition: all 0.3s ease;
}

/* Enhanced focus states for accessibility */
button:focus,
input:focus,
select:focus {
  outline: 2px solid var(--snapchat-orange);
  outline-offset: 2px;
}

/* Loading spinner animation */
@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.loading-spinner {
  display: inline-block;
  width: 20px;
  height: 20px;
  border: 3px solid rgba(255, 252, 0, 0.3);
  border-radius: 50%;
  border-top-color: var(--snapchat-orange);
  animation: spin 1s ease-in-out infinite;
}

.btn-start-polling {
  background: #ff6b35;
  color: white;
  border: none;
  padding: 12px 24px;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-start-polling:hover {
  background: #e55a2b;
  transform: translateY(-1px);
}

.btn-stop-polling {
  background: #dc3545;
  color: white;
  border: none;
  padding: 12px 24px;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-stop-polling:hover {
  background: #c82333;
  transform: translateY(-1px);
}

/* Downloader Styles */
.downloader-container {
  background: rgba(255, 255, 255, 0.8);
  border-radius: 12px;
  padding: 24px;
  margin-bottom: 24px;
  border: 1px solid rgba(0, 0, 0, 0.1);
}

.download-form {
  margin-bottom: 20px;
}

.form-row {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  align-items: center;
}

.username-input {
  flex: 1;
  min-width: 200px;
  padding: 12px 16px;
  border-radius: 8px;
  border: 2px solid rgba(255, 252, 0, 0.5);
  background: white;
  color: #1a1a1a;
  font-size: 16px;
  outline: none;
  transition: border-color 0.2s ease;
}

.username-input:focus {
  border-color: #ff6b35;
}

.download-type-select {
  padding: 12px 16px;
  border-radius: 8px;
  border: 2px solid rgba(255, 252, 0, 0.5);
  background: white;
  color: #1a1a1a;
  font-size: 16px;
  outline: none;
  cursor: pointer;
}

.download-button {
  background: #ff6b35;
  color: white;
  border: none;
  padding: 12px 24px;
  border-radius: 8px;
  font-weight: 600;
  font-size: 16px;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
}

.download-button:hover:enabled {
  background: #e55a2b;
  transform: translateY(-1px);
}

.download-button:disabled {
  background: #ccc;
  cursor: not-allowed;
  transform: none;
}

/* Gallery Styles */
.gallery-container {
  background: rgba(255, 255, 255, 0.8);
  border-radius: 12px;
  padding: 24px;
  border: 1px solid rgba(0, 0, 0, 0.1);
}

.gallery-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  flex-wrap: wrap;
  gap: 12px;
}

.gallery-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 20px;
}

.gallery-item {
  background: white;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  transition: transform 0.2s ease;
}

.gallery-item:hover {
  transform: translateY(-2px);
}

.gallery-thumbnail {
  width: 100%;
  height: 200px;
  object-fit: cover;
}

.gallery-item-content {
  padding: 16px;
}

.item-info {
  margin-bottom: 12px;
}

.item-filename {
  display: block;
  font-weight: 600;
  color: #1a1a1a;
  margin-bottom: 4px;
}

.item-type {
  display: inline-block;
  background: #ff6b35;
  color: white;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
}

.item-actions {
  display: flex;
  gap: 8px;
}

.download-link {
  background: #ff6b35;
  color: white;
  text-decoration: none;
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 600;
  transition: background 0.2s ease;
}

.download-link:hover {
  background: #e55a2b;
}

/* Progress Styles */
.progress-container {
  margin-top: 20px;
}

.overall-progress {
  display: flex;
  align-items: center;
  gap: 12px;
}

.progress-bar {
  flex: 1;
  height: 8px;
  background: rgba(255, 252, 0, 0.3);
  border-radius: 4px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #ff6b35, #fffc00);
  transition: width 0.3s ease;
}

.progress-text {
  font-size: 14px;
  color: #666;
  white-space: nowrap;
}

/* Telegram Toggle */
.telegram-toggle-container {
  margin-bottom: 24px;
}

.telegram-toggle {
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  user-select: none;
}

.telegram-toggle input {
  display: none;
}

.toggle-slider {
  width: 48px;
  height: 24px;
  background: #ccc;
  border-radius: 12px;
  position: relative;
  transition: background 0.2s ease;
}

.toggle-slider:before {
  content: '';
  position: absolute;
  width: 20px;
  height: 20px;
  background: white;
  border-radius: 50%;
  top: 2px;
  left: 2px;
  transition: transform 0.2s ease;
}

.telegram-toggle input:checked + .toggle-slider {
  background: #0088cc;
}

.telegram-toggle input:checked + .toggle-slider:before {
  transform: translateX(24px);
}

.toggle-label {
  font-weight: 600;
  color: #1a1a1a;
}

/* Responsive Design */
@media (max-width: 768px) {
  .content-wrapper {
    padding: 20px;
    margin: 10px;
  }
  
  .form-row {
    flex-direction: column;
    align-items: stretch;
  }
  
  .gallery-header {
    flex-direction: column;
    align-items: stretch;
  }
  
  .gallery-grid {
    grid-template-columns: 1fr;
  }
  
  .polling-buttons {
    flex-direction: column;
  }
}
```

## Phase 8: Integration and Testing

### 8.1 Environment Configuration
```bash
# .env
VITE_SNAPCHAT_API_BASE=/snapchat-api
VITE_WS_BASE_URL=ws://localhost:8000
```

### 8.2 Testing Strategy
1. **Unit Tests**: Test individual components and hooks
2. **Integration Tests**: Test API integration and WebSocket communication
3. **E2E Tests**: Test complete user workflows
4. **Performance Tests**: Test real-time updates and large galleries

### 8.3 Deployment Configuration
```typescript
// vite.config.ts (production)
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          router: ['react-router-dom']
        }
      }
    }
  }
})
```

## Implementation Timeline

### Week 1: Foundation
- Project setup and configuration
- Core components structure
- Basic styling system

### Week 2: Core Features
- Target management implementation
- Polling system integration
- Basic download functionality

### Week 3: Advanced Features
- WebSocket integration
- Real-time progress tracking
- Gallery implementation

### Week 4: Polish & Testing
- Telegram integration
- Error handling
- Responsive design
- Testing and optimization

## Success Metrics

1. **Functionality**: All Instagram frontend features replicated
2. **Performance**: Sub-100ms response times for UI interactions
3. **Reliability**: 99.9% uptime for real-time features
4. **User Experience**: Intuitive interface matching Instagram quality
5. **Integration**: Seamless backend communication

This implementation plan provides a comprehensive roadmap for creating a Snapchat frontend that matches the quality and functionality of the Instagram service frontend while maintaining Snapchat-specific optimizations and features.
