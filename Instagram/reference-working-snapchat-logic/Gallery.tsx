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
