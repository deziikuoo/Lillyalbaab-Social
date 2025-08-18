import React, { useEffect, useMemo, useRef, useState } from 'react';
import { startDownload, getProgress, sendToTelegram } from './api';
import { createProgressSocket } from './ProgressWS';

interface OverallProgress {
  status: string;
  progress: number;
  total?: number;
  downloaded?: number;
  message?: string;
}

const Downloader: React.FC = () => {
  const [username, setUsername] = useState('');
  const [downloadType, setDownloadType] = useState<'stories' | 'highlights' | 'spotlights'>('stories');
  const [busy, setBusy] = useState(false);
  const [overall, setOverall] = useState<OverallProgress>({ status: 'idle', progress: 0 });
  const [files, setFiles] = useState<Record<string, { status: string; progress: number }>>({});
  const wsRef = useRef<WebSocket | null>(null);
  const pollTimerRef = useRef<number | null>(null);
  const heartbeatTimerRef = useRef<number | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef<number>(0);
  const [autoSendToTelegram, setAutoSendToTelegram] = useState(true);
  const [sendingStatus, setSendingStatus] = useState<{ [key: string]: 'idle' | 'sending' | 'success' | 'error' }>({});
  const [telegramErrors, setTelegramErrors] = useState<{ [key: string]: string }>({});

  const canStart = useMemo(() => username.trim().length > 0 && !busy, [username, busy]);

  useEffect(() => () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.close();
    }
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    if (heartbeatTimerRef.current) {
      clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const startPollingFallback = () => {
    if (pollTimerRef.current) return;
    console.warn('[Snapchat] WebSocket unavailable, starting polling fallback every 1.5s');
    pollTimerRef.current = window.setInterval(() => {
      void pollProgress();
    }, 1500);
  };

  const clearHeartbeat = () => {
    if (heartbeatTimerRef.current) {
      clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }
  };

  const startHeartbeat = () => {
    clearHeartbeat();
    heartbeatTimerRef.current = window.setInterval(() => {
      try {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send('ping');
        }
      } catch (err) {
        console.debug('[Snapchat] WS heartbeat send failed:', err);
      }
    }, 20000); // 20s
  };

  const scheduleReconnect = () => {
    const maxAttempts = 5;
    if (reconnectAttemptsRef.current >= maxAttempts) {
      console.warn('[Snapchat] WS reconnect: max attempts reached, using polling fallback');
      startPollingFallback();
      return;
    }
    reconnectAttemptsRef.current += 1;
    const delayMs = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current - 1), 10000);
    console.warn(`[Snapchat] WS reconnect attempt ${reconnectAttemptsRef.current} in ${delayMs}ms`);
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    reconnectTimerRef.current = window.setTimeout(() => {
      setupWebSocket();
    }, delayMs);
  };

  const setupWebSocket = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try { wsRef.current.close(); } catch {}
    }
    clearHeartbeat();
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    try {
      const ws = createProgressSocket(username, downloadType);
      wsRef.current = ws;

      ws.onopen = () => {
        console.info('[Snapchat] WS connected');
        if (pollTimerRef.current) {
          clearInterval(pollTimerRef.current);
          pollTimerRef.current = null;
          console.info('[Snapchat] Switched back to WS; stopped polling');
        }
        reconnectAttemptsRef.current = 0;
        startHeartbeat();
      };

      ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data);
          if (data.overall) setOverall(data.overall);
          if (data.files) setFiles(data.files);
          const overallStatus = String(data?.overall?.status || '').toLowerCase();
          const overallProgress = Number(data?.overall?.progress || 0);
          // Backend handles Telegram auto-send when enabled
        } catch (err) {
          console.debug('[Snapchat] WS message parse error:', err);
        }
      };

      ws.onerror = () => {
        console.warn('[Snapchat] WS error');
        clearHeartbeat();
        scheduleReconnect();
      };

      ws.onclose = () => {
        console.warn('[Snapchat] WS closed');
        clearHeartbeat();
        scheduleReconnect();
      };
    } catch (e) {
      console.warn('[Snapchat] WS setup failed - using polling fallback', e);
      void pollProgress();
      startPollingFallback();
    }
  };

  const handleStart = async () => {
    if (!canStart) return;
    setBusy(true);
    setOverall({ status: 'fetching', progress: 0, message: `Starting download for ${username}` });
    setFiles({});
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }

    try {
      await startDownload(username, downloadType, autoSendToTelegram);
      setupWebSocket();
    } catch (e: any) {
      setOverall({ status: 'error', progress: 0, message: e?.message || 'Failed to start download' });
    } finally {
      setBusy(false);
    }
  };

  const pollProgress = async () => {
    try {
      const res = await getProgress(username, downloadType);
      if (res?.overall) setOverall(res.overall);
      if (res?.files) setFiles(res.files);
      const status = String(res?.overall?.status || '').toLowerCase();
      const progress = Number(res?.overall?.progress || 0);
      if (status === 'complete' || status === 'completed' || progress >= 99) {
        if (pollTimerRef.current) {
          clearInterval(pollTimerRef.current);
          pollTimerRef.current = null;
          console.info('[Snapchat] Polling fallback stopped (status:', status || progress, ')');
        }
        // Backend handles Telegram auto-send when enabled
      }
    } catch (err) {
      console.debug('[Snapchat] Polling error:', err);
    }
  };

  const autoSendAllToTelegram = async (files: Record<string, { status: string; progress: number }>) => {
    if (!autoSendToTelegram) return;

    console.log('[Snapchat] Auto-sending all files to Telegram...');
    const fileEntries = Object.entries(files);

    for (const [filename, fileData] of fileEntries) {
      const fileStatus = String(fileData.status || '').toLowerCase();
      if (/(complete|completed|downloaded)/.test(fileStatus)) {
        try {
          setSendingStatus(prev => ({ ...prev, [filename]: 'sending' }));
          setTelegramErrors(prev => ({ ...prev, [filename]: '' }));

          const downloadUrl = `/snapchat-api/downloads/${encodeURIComponent(username)}/stories/${encodeURIComponent(filename)}`;
          const isVideo = /\.(mp4|mov|webm|avi)$/i.test(filename);

          await sendToTelegram(downloadUrl, isVideo ? 'video' : 'photo', {
            source: 'snapchat',
            originalUrl: `snapchat:@${username}/stories`,
          });

          setSendingStatus(prev => ({ ...prev, [filename]: 'success' }));
          console.log(`[Snapchat] Auto-sent ${filename} to Telegram`);
          setTimeout(() => {
            setSendingStatus(prev => ({ ...prev, [filename]: 'idle' }));
          }, 3000);
        } catch (err: any) {
          console.error(`[Snapchat] Auto-send failed for ${filename}:`, err);
          setSendingStatus(prev => ({ ...prev, [filename]: 'error' }));
          setTelegramErrors(prev => ({ ...prev, [filename]: err.message }));
        }
      }
    }
  };

  return (
    <div className="snap-card">
      <h2>{downloadType.charAt(0).toUpperCase() + downloadType.slice(1)} Downloader</h2>
      {/* Telegram Toggle */}
      <div className="telegram-toggle-container" style={{ marginBottom: '16px' }}>
        <label className="telegram-toggle">
          <input
            type="checkbox"
            checked={autoSendToTelegram}
            onChange={(e) => setAutoSendToTelegram(e.target.checked)}
          />
          <span className="toggle-slider"></span>
          <span className="toggle-label">
            👻 Auto-send to Telegram
          </span>
        </label>
      </div>
      <div className="snap-row">
        <input
          className="snap-input"
          placeholder="snapchat username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <select
          value={downloadType}
          onChange={(e) => setDownloadType(e.target.value as 'stories' | 'highlights' | 'spotlights')}
          className="snap-select"
          disabled={busy}
        >
          <option value="stories">Stories</option>
          <option value="highlights">Highlights</option>
          <option value="spotlights">Spotlights</option>
        </select>
        <button className="snap-btn" disabled={!canStart} onClick={handleStart}>
          {busy ? 'Starting…' : 'Start download'}
        </button>
      </div>

      <div className="snap-progress">
        <div className="snap-progress-line">
          <span className="snap-label">Status</span>
          <span className="snap-value">{overall.status} {overall.message ? `— ${overall.message}` : ''}</span>
        </div>
        <div className="snap-progress-line">
          <span className="snap-label">Overall</span>
          <span className="snap-value">{Math.round(overall.progress || 0)}%</span>
        </div>
      </div>

      {Object.keys(files).length > 0 && (
        <div className="snap-files">
          <h3>Files</h3>
          <ul>
            {Object.entries(files).map(([name, meta]) => (
              <li key={name}>
                <span className="snap-file-name">{name}</span>
                <span className={`snap-badge ${meta.status}`}>{meta.status}</span>
                <span className="snap-file-progress">{Math.round(meta.progress)}%</span>
                {sendingStatus[name] && (
                  <span className={`snap-badge ${sendingStatus[name]}`}>
                    {sendingStatus[name] === 'sending' ? '📤 Sending...' :
                     sendingStatus[name] === 'success' ? '✅ Sent!' :
                     sendingStatus[name] === 'error' ? '❌ Failed' : ''}
                  </span>
                )}
                {telegramErrors[name] && (
                  <div className="snap-error" style={{ fontSize: '12px', marginTop: '4px' }}>
                    {telegramErrors[name]}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default Downloader;
