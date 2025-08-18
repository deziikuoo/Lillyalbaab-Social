import React, { useState } from 'react';
import { getGallery, sendToTelegram } from './api';

interface MediaItem {
  filename: string;
  type: string; // 'image' | 'video'
  thumbnail_url?: string;
  download_status: string;
  progress?: number;
  download_url?: string;
}

const Gallery: React.FC = () => {
  const [username, setUsername] = useState('');
  const [mediaType, setMediaType] = useState<'stories' | 'highlights' | 'spotlights'>('stories');
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<MediaItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState<Record<string, 'idle'|'sending'|'success'|'error'>>({});

  const load = async () => {
    if (!username.trim()) return;
    setLoading(true);
    setError(null);
    setItems([]);
    try {
      const res = await getGallery(username, mediaType);
      setItems(res?.media || []);
    } catch (e: any) {
      setError(e?.message || 'Failed to load gallery');
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async (item: MediaItem) => {
    const key = item.filename;
    setSending(prev => ({ ...prev, [key]: 'sending' }));
    try {
      const url = item.download_url || item.thumbnail_url || '';
      if (!url) throw new Error('No media URL');
      await sendToTelegram(url, item.type === 'video' ? 'video' : 'photo', {
        source: 'snapchat',
        originalUrl: `snapchat:@${username}/stories`,
      });
      setSending(prev => ({ ...prev, [key]: 'success' }));
      setTimeout(() => setSending(prev => ({ ...prev, [key]: 'idle' })), 2500);
    } catch (e: any) {
      console.error('Send to Telegram failed:', e);
      setSending(prev => ({ ...prev, [key]: 'error' }));
      setTimeout(() => setSending(prev => ({ ...prev, [key]: 'idle' })), 3000);
    }
  };

  return (
    <div className="snap-card">
      <h2>{mediaType.charAt(0).toUpperCase() + mediaType.slice(1)} Gallery</h2>
      <div className="snap-row">
        <input
          className="snap-input"
          placeholder="snapchat username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <select
          value={mediaType}
          onChange={(e) => setMediaType(e.target.value as 'stories' | 'highlights' | 'spotlights')}
          className="snap-select"
          disabled={loading}
        >
          <option value="stories">Stories</option>
          <option value="highlights">Highlights</option>
          <option value="spotlights">Spotlights</option>
        </select>
        <button className="snap-btn" disabled={!username.trim() || loading} onClick={load}>
          {loading ? 'Loading' : 'Load'}
        </button>
        <button className="snap-btn" disabled={loading} onClick={load}>
          🔄 Refresh
        </button>
      </div>

      {error && <div className="snap-error">{error}</div>}

      <div className="snap-gallery">
        {items.map((m) => (
          <div key={m.filename} className="snap-media">
            {m.type === 'video' ? (
              <video controls src={m.download_url || m.thumbnail_url} />
            ) : (
              <img src={m.thumbnail_url || m.download_url} alt={m.filename} />
            )}
            <div className="snap-media-meta">
              <span className="snap-file-name">{m.filename}</span>
              <span className={`snap-badge ${m.download_status}`}>{m.download_status}</span>
              {typeof m.progress === 'number' && (
                <span className="snap-file-progress">{Math.round(m.progress)}%</span>
              )}
              {m.download_url && (
                <a className="snap-link" href={m.download_url} target="_blank" rel="noreferrer">Download</a>
              )}
              <button
                className="snap-btn"
                style={{ marginLeft: 8 }}
                disabled={sending[m.filename] === 'sending'}
                onClick={() => handleSend(m)}
              >
                {sending[m.filename] === 'sending' ? 'Sending…' : sending[m.filename] === 'success' ? 'Sent!' : sending[m.filename] === 'error' ? 'Failed' : 'Send to Telegram'}
              </button>
            </div>
          </div>
        ))}
        {!loading && items.length === 0 && <div className="snap-empty">No media</div>}
      </div>
    </div>
  );
};

export default Gallery;
