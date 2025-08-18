import React, { useMemo, useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import SnapchatPage from './snapchat/SnapchatPage'

// API base URL - use Render backend in production, localhost in development
const API_BASE_URL = import.meta.env.PROD 
  ? 'https://tyla-social-api.onrender.com'  // Your Render backend URL
  : 'http://localhost:3000'

type DownloadItem = {
  quality?: string
  thumb?: string
  url: string
  isProgress?: boolean
  carouselIndex?: number
  isVideo?: boolean
}

type BackendItem = {
  quality?: string
  thumb?: string
  thumbnail?: string // Backend might use this instead
  url: string
  isProgresser?: boolean // Backend might use this field name
  isProgress?: boolean
  isVideo?: boolean
}

type ApiResponse = {
  developer: string
  status: boolean
  data?: BackendItem[]
  msg?: string
}

const App: React.FC = () => {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<DownloadItem[]>([])
  
  // Telegram functionality state
  const [autoSendToTelegram, setAutoSendToTelegram] = useState(true)
  const [sendingStatus, setSendingStatus] = useState<{ [key: number]: 'idle' | 'sending' | 'success' | 'error' }>({})
  const [telegramErrors, setTelegramErrors] = useState<{ [key: number]: string }>({})
  
  // Target management state
  const [currentTarget, setCurrentTarget] = useState<string>('')
  const [newTarget, setNewTarget] = useState<string>('')
  const [targetLoading, setTargetLoading] = useState(false)
  const [targetError, setTargetError] = useState<string | null>(null)
  const [showTargetManager, setShowTargetManager] = useState(false)
  const [showPollingManager, setShowPollingManager] = useState(false)
  const [pollingStatus, setPollingStatus] = useState<{
    enabled: boolean
    active: boolean
    started: boolean
  }>({ enabled: false, active: false, started: false })

  // Statistics state
  const [_showStats, _setShowStats] = useState(false)
  const [_stats, _setStats] = useState<any>(null)
  const [_statsLoading, _setStatsLoading] = useState(false)

  // Function to clean Instagram URLs by removing img_index parameters
  const cleanInstagramUrl = (inputUrl: string): string => {
    try {
      const url = new URL(inputUrl)
      url.searchParams.delete('img_index')
      return url.toString()
    } catch (error) {
      // If URL parsing fails, return the original input
      return inputUrl
    }
  }

  const isValidIgUrl = useMemo(() => {
    if (!url) return false
    return /(https?:\/\/)?(www\.)?instagram\.com\/(p|reel|tv|stories)\//i.test(url)
  }, [url])

  // Target management functions
  const fetchCurrentTarget = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/target`)
      const data = await response.json()
      setCurrentTarget(data.current_target || '')
      setPollingStatus({
        enabled: data.polling_enabled || false,
        active: data.polling_active || false,
        started: data.polling_started || false
      })
    } catch (error) {
      console.error('Failed to fetch current target:', error)
    }
  }

  // Snapchat-specific target management functions
  const fetchSnapchatTarget = async () => {
    try {
      const response = await fetch('/snapchat-api/status')
      const data = await response.json()
      return {
        target_username: data.target_username || '',
        enabled: data.polling_enabled || false,
        active: data.polling_active || false,
        started: data.polling_started || false,
        current_interval: data.statistics?.rates?.current_interval,
        activity_level: data.statistics?.rates?.activity_level
      }
    } catch (error) {
      console.error('Failed to fetch Snapchat target:', error)
      return null
    }
  }

  const setSnapchatTarget = async (targetUsername: string) => {
    try {
      const response = await fetch(`/snapchat-api/set-target?username=${encodeURIComponent(targetUsername)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
      
      const data = await response.json()
      
      if (response.ok) {
        return { success: true, target: targetUsername }
      } else {
        return { success: false, error: data.detail || 'Failed to set target' }
      }
    } catch (error) {
      return { success: false, error: 'Network error' }
    }
  }

  const startSnapchatPolling = async () => {
    try {
      const response = await fetch('/snapchat-api/start-polling', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
      const data = await response.json()
      return { success: data.success, message: data.message || 'Polling started successfully!' }
    } catch (error) {
      return { success: false, message: 'Error starting polling' }
    }
  }

  const stopSnapchatPolling = async () => {
    try {
      const response = await fetch('/snapchat-api/stop-polling', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
      const data = await response.json()
      return { success: data.success, message: data.message || 'Polling stopped successfully!' }
    } catch (error) {
      return { success: false, message: 'Error stopping polling' }
    }
  }

  const manualSnapchatPoll = async () => {
    try {
      const response = await fetch('/snapchat-api/poll-now?force=true')
      const data = await response.json()
      return { success: data.success, message: data.message || 'Manual poll triggered successfully!' }
    } catch (error) {
      return { success: false, message: 'Error triggering manual poll' }
    }
  }

  const fetchSnapchatStats = async () => {
    try {
      const response = await fetch('/snapchat-api/stats')
      const data = await response.json()
      return { success: true, stats: data }
    } catch (error) {
      console.error('Failed to fetch Snapchat stats:', error)
      return { success: false, stats: null }
    }
  }

  // Real-time polling status updates
  useEffect(() => {
    fetchCurrentTarget()
    
    // Refresh polling status every 3 seconds for real-time updates
    const statusInterval = setInterval(() => {
      fetchCurrentTarget()
    }, 3000)
    
    return () => clearInterval(statusInterval)
  }, [])

  const changeTarget = async () => {
    if (!newTarget.trim()) {
      setTargetError('Please enter a username or URL')
      return
    }

    setTargetLoading(true)
    setTargetError(null)

    try {
      const response = await fetch(`${API_BASE_URL}/target`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username: newTarget.trim() })
      })

      const data = await response.json()

      if (data.success) {
        setCurrentTarget(data.new_target)
        setNewTarget('')
        setShowTargetManager(false)
        // Refresh polling status
        await fetchCurrentTarget()
      } else {
        setTargetError(data.error || 'Failed to change target')
      }
    } catch (error) {
      setTargetError('Network error. Please try again.')
    } finally {
      setTargetLoading(false)
    }
  }

  const clearStorage = async () => {
    if (!currentTarget) {
      setTargetError('No target set - cannot clear storage')
      return
    }

    if (!confirm(`Are you sure you want to clear storage and cache for @${currentTarget}? This will allow all posts to be processed again.`)) {
      return
    }

    setTargetLoading(true)
    setTargetError(null)

    try {
      const response = await fetch(`${API_BASE_URL}/reset-processed`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      })

      const data = await response.json()

      if (data.success) {
        alert(`✅ Storage cleared! Deleted ${data.processed_deleted} processed posts and ${data.cache_deleted} cache entries for @${data.username}`)
      } else {
        setTargetError(data.error || 'Failed to clear storage')
      }
    } catch (error) {
      setTargetError('Network error - please try again')
    } finally {
      setTargetLoading(false)
    }
  }

  const clearStoriesCache = async () => {
    if (!currentTarget) {
      setTargetError('No target set - cannot clear stories cache')
      return
    }

    if (!confirm(`Are you sure you want to clear stories cache for @${currentTarget}? This will allow all stories to be processed again.`)) {
      return
    }

    setTargetLoading(true)
    setTargetError(null)

    try {
      const response = await fetch(`${API_BASE_URL}/clear-stories-cache`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      })

      const data = await response.json()

      if (data.success) {
        alert(`✅ Stories cache cleared! Deleted ${data.processed_stories_deleted} processed stories and ${data.stories_cache_deleted} stories cache entries for @${data.username}`)
      } else {
        setTargetError(data.error || 'Failed to clear stories cache')
      }
    } catch (error) {
      setTargetError('Network error - please try again')
    } finally {
      setTargetLoading(false)
    }
  }



  const startPolling = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/start-polling`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      })
      const data = await response.json()
      if (data.success) {
        alert('Polling started successfully!')
        await fetchCurrentTarget() // Refresh status
      } else {
        alert(data.error || 'Failed to start polling')
      }
    } catch (error) {
      alert('Error starting polling')
    }
  }

  const stopPolling = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/stop-polling`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      })
      const data = await response.json()
      if (data.success) {
        alert('Polling stopped successfully!')
        await fetchCurrentTarget() // Refresh status
      } else {
        alert(data.error || 'Failed to stop polling')
      }
    } catch (error) {
      alert('Error stopping polling')
    }
  }

  // Load current target on component mount
  useEffect(() => {
    fetchCurrentTarget()
  }, [])

  const fetchDownloads = async (url: string) => {
    setLoading(true)
    setError('')
    setItems([])
    
    try {
      const res = await fetch(`${API_BASE_URL}/igdl?url=${encodeURIComponent(url)}`)

      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`)
      }

      const body = await res.json()

      // Debug: Log the raw response
      console.log('Raw API response:', body)

      // Backend now returns snapsave result directly
      const payload: ApiResponse | undefined = body as any

      console.log('Processed payload:', payload)

      if (!payload || payload.status === false) {
        throw new Error(payload?.msg || 'Failed to fetch download links')
      }
      
      // Process results - GraphQL returns unique items, snapsave returns quality variants
      const rawItems = payload.data || []
      const processedItems: DownloadItem[] = []
      
      console.log(`Processing ${rawItems.length} items from backend...`)
      
      // Check if this is from GraphQL (unique URLs) or snapsave (quality variants)
      const initialUrls = rawItems.map(item => item.url)
      const initialUniqueUrls = new Set(initialUrls)
      const isFromGraphQL = initialUrls.length === initialUniqueUrls.size && initialUrls.length > 1
      
      if (isFromGraphQL) {
        // GraphQL result - each item is unique, no deduplication needed
        console.log(`✅ Detected GraphQL result with ${rawItems.length} unique items`)
        processedItems.push(...rawItems.map((item: any) => ({
          quality: item.quality || undefined,
          thumb: item.thumb || item.thumbnail || undefined,
          url: item.url,
          isProgress: item.isProgresser || item.isProgress || false,
          carouselIndex: item.carouselIndex || undefined,
          isVideo: item.isVideo ?? item.is_video ?? undefined
        })))
      } else {
        // Snapsave result - deduplicate quality variants
        console.log(`🔄 Detected snapsave result, deduplicating quality variants...`)
        
        const groupedItems = new Map<string, any[]>()
        
        // Group items by their thumbnail (which should be unique per carousel item)
        for (const item of rawItems) {
          const thumb = item.thumb || item.thumbnail || ''
          if (!groupedItems.has(thumb)) {
            groupedItems.set(thumb, [])
          }
          groupedItems.get(thumb)!.push(item)
        }
        
        console.log(`Grouped into ${groupedItems.size} unique items`)
        
        // For each group, select the highest quality item
        for (const [thumb, items] of groupedItems) {
          if (items.length === 0) continue
          
          // Sort by quality (prefer higher quality)
          const sortedItems = items.sort((a, b) => {
            const qualityA = a.quality || ''
            const qualityB = b.quality || ''
            
            // Prefer higher quality (HD > SD, etc.)
            if (qualityA.includes('HD') && !qualityB.includes('HD')) return -1
            if (qualityB.includes('HD') && !qualityA.includes('HD')) return 1
            if (qualityA.includes('SD') && !qualityB.includes('SD')) return -1
            if (qualityB.includes('SD') && !qualityA.includes('SD')) return 1
            
            // If same quality, prefer the first one
            return 0
          })
          
          const bestItem = sortedItems[0]
          processedItems.push({
            quality: bestItem.quality || undefined,
            thumb: bestItem.thumb || bestItem.thumbnail || undefined,
            url: bestItem.url,
            isProgress: bestItem.isProgresser || bestItem.isProgress || false,
            carouselIndex: bestItem.carouselIndex || undefined,
            isVideo: bestItem.isVideo ?? bestItem.is_video ?? undefined
          })
        }
      }
      
      console.log(`Final processed items: ${processedItems.length}`)
      
      // Debug: Log each item's details
      processedItems.forEach((item: any, index: number) => {
        console.log(`Item ${index + 1}:`, {
          carouselIndex: item.carouselIndex,
          quality: item.quality,
          url: item.url?.substring(0, 100) + '...',
          thumb: item.thumb?.substring(0, 100) + '...'
        });
      });
      
      // Check for duplicate URLs
      const finalUrls = processedItems.map((item: any) => item.url);
      const finalUniqueUrls = new Set(finalUrls);
      console.log(`🔍 URL Analysis: ${finalUrls.length} total URLs, ${finalUniqueUrls.size} unique URLs`);
      if (finalUrls.length !== finalUniqueUrls.size) {
        console.log(`⚠️ DUPLICATE URLs DETECTED!`);
        const urlCounts: { [key: string]: number } = {};
        finalUrls.forEach((url: string) => {
          urlCounts[url] = (urlCounts[url] || 0) + 1;
        });
        Object.entries(urlCounts).forEach(([url, count]) => {
          if (count > 1) {
            console.log(`  URL appears ${count} times: ${url.substring(0, 100)}...`);
          }
        });
      }
      
      setItems(processedItems)
      
      // Note: Telegram sending is handled by the backend for all posts (single and carousel)
      // Frontend auto-send is disabled to avoid duplicates
      if (autoSendToTelegram && processedItems.length > 0) {
        console.log('Auto-send disabled - backend handles all Telegram sending to avoid duplicates')
      }
    } catch (err: any) {
      console.error('Fetch error:', err)
      setError(err?.message || 'Unexpected error')
    } finally {
      setLoading(false)
    }
  }

  async function sendToTelegram(itemIndex: number, videoUrl: string, originalInstagramUrl?: string) {
    setSendingStatus(prev => ({ ...prev, [itemIndex]: 'sending' }))
    setTelegramErrors(prev => ({ ...prev, [itemIndex]: '' }))
    
    try {
      const response = await fetch(`${API_BASE_URL}/send-to-telegram`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          videoUrl,
          originalInstagramUrl,
                  caption: items[itemIndex]?.carouselIndex
          ? `✨ New photo from <a href="https://www.instagram.com/${currentTarget || 'User not found'}/">@${currentTarget || 'User not found'}</a>! 📱 <a href="${originalInstagramUrl}">View Original Post</a>`
          : `✨ New video from <a href="https://www.instagram.com/${currentTarget || 'User not found'}/">@${currentTarget || 'User not found'}</a>! 📱 <a href="${originalInstagramUrl}">View Original Post</a>`
        })
      })

      const result = await response.json()
      
      if (!response.ok) {
        throw new Error(result.details || result.error || 'Failed to send to Telegram')
      }

      setSendingStatus(prev => ({ ...prev, [itemIndex]: 'success' }))
      
      // Clear success status after 3 seconds
      setTimeout(() => {
        setSendingStatus(prev => ({ ...prev, [itemIndex]: 'idle' }))
      }, 3000)

    } catch (err: any) {
      console.error('Telegram send error:', err)
      setSendingStatus(prev => ({ ...prev, [itemIndex]: 'error' }))
      setTelegramErrors(prev => ({ ...prev, [itemIndex]: err.message }))
    }
  }



  // Load current target on component mount
  useEffect(() => {
    fetchCurrentTarget()
  }, [])

  const IgHome = (
    <div className="app-container">
      <div className="content-wrapper">
        <h1 className="app-title">Instagram Video Downloader</h1>
        <p className="app-subtitle">
          Paste a public Instagram post/reel/tv/stories URL and get downloadable links.
        </p>

        {/* Target Management */}
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
                className="btn-polling"
                onClick={() => setShowPollingManager(!showPollingManager)}
                disabled={!currentTarget}
              >
                Polling
              </button>
            </div>
          </div>

          {/* Polling Status */}
          {currentTarget && (
            <div className="polling-status">
              <span className="status-label">Polling:</span>
              <span className={`status-indicator ${pollingStatus.active ? 'active' : 'inactive'}`}>
                {pollingStatus.active ? '🟢 Active' : '🔴 Inactive'}
              </span>
            </div>
          )}

          {showTargetManager && (
            <div className="target-manager">
              <form onSubmit={(e) => { e.preventDefault(); changeTarget(); }} className="target-form">
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
                    {targetLoading ? 'Updating...' : 'Update'}
                  </button>
                </div>
                {targetError && (
                  <div className="target-error">{targetError}</div>
                )}
                <div className="target-examples">
                  <small>Examples: instagram, @instagram, instagram.com/instagram</small>
                </div>
              </form>
              
              {/* Clear Storage Buttons */}
              {currentTarget && (
                <div className="storage-controls">
                  <div className="storage-buttons">
                    <button 
                      onClick={clearStorage}
                      className="btn-clear-storage"
                      disabled={targetLoading}
                      title="Clear processed posts and cache storage to allow re-processing"
                    >
                      🗑️ Clear Posts Cache (@{currentTarget})
                    </button>
                    <button 
                      onClick={clearStoriesCache}
                      className="btn-clear-stories-cache"
                      disabled={targetLoading}
                      title="Clear processed stories and stories cache to allow re-processing"
                    >
                      📱 Clear Stories Cache (@{currentTarget})
                    </button>
                  </div>
                  <small className="storage-info">
                    Clear posts cache to re-process posts, or stories cache to re-process stories
                  </small>
                </div>
              )}
            </div>
          )}

          {/* Polling Manager */}
          {showPollingManager && currentTarget && (
            <div className="polling-manager">
              <div className="polling-controls">
                <div className="polling-buttons">
                  {!pollingStatus.active ? (
                    <button 
                      onClick={startPolling}
                      className="btn-start-polling"
                      disabled={targetLoading}
                      title="Start automatic polling for new posts"
                    >
                      🚀 Start Polling
                    </button>
                  ) : (
                    <button 
                      onClick={stopPolling}
                      className="btn-stop-polling"
                      disabled={targetLoading}
                      title="Stop automatic polling"
                    >
                      🛑 Stop Polling
                    </button>
                  )}

                </div>
                <small className="polling-info">
                  {pollingStatus.active ? 'Polling is active' : 'Polling is stopped'}
                </small>
              </div>
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
        
        <form onSubmit={(e) => { e.preventDefault(); fetchDownloads(url); }} className="form-container">
          <div className="form-input-group">
            <input
              type="url"
              placeholder="https://www.instagram.com/p/xxxxxx/ (img_index will be auto-removed)"
              value={url}
              onChange={(e) => {
                const cleanedUrl = cleanInstagramUrl(e.target.value)
                setUrl(cleanedUrl)
              }}
              className="url-input"
              required
            />
            <button
              type="submit"
              disabled={!isValidIgUrl || loading}
              className="submit-button"
            >
              {loading ? 'Fetching…' : 'Get Video'}
            </button>
          </div>
        </form>

        {error && (
          <div className="error-message">{error}</div>
        )}

        {loading && (
          <div style={{ marginTop: 20, textAlign: 'center', opacity: 0.8 }}>
            Loading download links...
          </div>
        )}

        <div className="results-grid">
          {items.map((item, idx) => (
            <div key={`${item.carouselIndex || idx}-${item.thumb || item.url}`} className="download-card">
              {item.thumb && (
                <img src={item.thumb} alt="thumb" className="card-thumbnail" />
              )}
              <div className="card-content">
                {item.quality && (
                  <div className="quality-row">
                    <span className="quality-label">Quality</span>
                    <strong className="quality-value">{item.quality}</strong>
                  </div>
                )}
                {item.carouselIndex && (
                  <div className="carousel-index">
                    <span className="index-label">Carousel Item</span>
                    <strong className="index-value">{item.carouselIndex}</strong>
                  </div>
                )}
                <div className="card-actions">
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="download-link"
                  >
                    {item.isProgress ? 'Open (progress API)' : 'Download video'}
                  </a>
                  
                  <button
                    type="button"
                    onClick={() => sendToTelegram(idx, item.url, url)}
                    disabled={sendingStatus[idx] === 'sending'}
                    className={`telegram-button ${
                      sendingStatus[idx] === 'success' ? 'success' : 
                      sendingStatus[idx] === 'error' ? 'error' : ''
                    }`}
                  >
                    {sendingStatus[idx] === 'sending' ? '📤 Sending...' :
                     sendingStatus[idx] === 'success' ? '✅ Sent!' :
                     sendingStatus[idx] === 'error' ? '❌ Failed' :
                     '📤 Send to Telegram'}
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
  )

  return (
    <BrowserRouter>
      <div style={{ padding: 12, display: 'flex', gap: 12 }}>
        <Link to="/instagram">Instagram</Link>
        <Link to="/snapchat">Snapchat</Link>
      </div>
      <Routes>
        <Route path="/instagram" element={IgHome} />
        <Route path="/snapchat" element={
          <SnapchatPage 
            fetchSnapchatTarget={fetchSnapchatTarget}
            setSnapchatTarget={setSnapchatTarget}
            startSnapchatPolling={startSnapchatPolling}
            stopSnapchatPolling={stopSnapchatPolling}
            manualSnapchatPoll={manualSnapchatPoll}
            fetchSnapchatStats={fetchSnapchatStats}
          />
        } />
        <Route path="*" element={IgHome} />
      </Routes>
    </BrowserRouter>
  )
}

export default App



