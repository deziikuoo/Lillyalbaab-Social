export const SNAP_BASE: string = (import.meta as any).env?.VITE_SNAPCHAT_API_BASE || '/snapchat-api'

export async function startDownload(
  username: string,
  downloadType: 'stories' | 'highlights' | 'spotlights' = 'stories',
  sendToTelegram: boolean = false
) {
  try {
    const res = await fetch(`${SNAP_BASE}/download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, download_type: downloadType, send_to_telegram: sendToTelegram })
    })
    
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}))
      throw new Error(errorData.detail || errorData.message || `Download failed: ${res.status}`)
    }
    
    return res.json()
  } catch (error) {
    console.error('Snapchat download error:', error)
    throw error
  }
}

export async function getGallery(
  username: string,
  mediaType: 'stories' | 'highlights' | 'spotlights' = 'stories'
) {
  try {
    const safeUser = encodeURIComponent(username)
    const res = await fetch(`${SNAP_BASE}/gallery/${safeUser}/${mediaType}`)
    
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}))
      throw new Error(errorData.detail || errorData.message || `Gallery failed: ${res.status}`)
    }
    
    const data = await res.json()
    const prefix = SNAP_BASE.replace(/\/$/, '')
    
    // Enhanced URL normalization
    const normalized = (data?.media || []).map((m: any) => ({
      ...m,
      thumbnail_url: normalizeUrl(m.thumbnail_url, prefix),
      download_url: normalizeUrl(m.download_url, prefix),
    }))
    
    return { ...data, media: normalized }
  } catch (error) {
    console.error('Snapchat gallery error:', error)
    throw error
  }
}

// Helper function for URL normalization
function normalizeUrl(url: string | undefined, prefix: string): string {
  if (!url || typeof url !== 'string') return ''
  
  // If it's already an absolute URL, return as is
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url
  }
  
  // If it's a relative URL starting with /, add the prefix
  if (url.startsWith('/')) {
    return `${prefix}${url}`
  }
  
  // If it's a relative URL without /, add prefix and /
  return `${prefix}/${url}`
}

export async function getProgress(
  username: string,
  mediaType: 'stories' | 'highlights' | 'spotlights' = 'stories'
) {
  try {
    const safeUser = encodeURIComponent(username)
    const res = await fetch(`${SNAP_BASE}/progress/${safeUser}/${mediaType}`)
    
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}))
      throw new Error(errorData.detail || errorData.message || `Progress failed: ${res.status}`)
    }
    
    return res.json()
  } catch (error) {
    console.error('Snapchat progress error:', error)
    throw error
  }
}

export async function sendToTelegram(
  mediaUrl: string,
  type: 'photo' | 'video',
  options: { caption?: string; originalUrl?: string; source?: 'snapchat' | 'instagram' } = {}
) {
  try {
    const body = {
      mediaUrl,
      type,
      source: options.source || 'snapchat',
      caption: options.caption,
      originalInstagramUrl: options.originalUrl,
    }
    
    const res = await fetch(`${SNAP_BASE}/send-to-telegram`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    
    const data = await res.json().catch(() => ({}))
    
    if (!res.ok) {
      throw new Error(data?.detail || data?.error || data?.message || `Telegram send failed: ${res.status}`)
    }
    
    return data
  } catch (error) {
    console.error('Snapchat Telegram send error:', error)
    throw error
  }
}

