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
