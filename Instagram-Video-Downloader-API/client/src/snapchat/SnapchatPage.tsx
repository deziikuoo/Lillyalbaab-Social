import React, { useState, useEffect } from 'react';
import './styles.css';
import Downloader from './Downloader';
import Gallery from './Gallery';

interface SnapchatPageProps {
  fetchSnapchatTarget: () => Promise<{
    target_username: string;
    enabled: boolean;
    active: boolean;
    started: boolean;
    current_interval?: number;
    activity_level?: string;
  } | null>;
  setSnapchatTarget: (targetUsername: string) => Promise<{
    success: boolean;
    target?: string;
    error?: string;
  }>;
  startSnapchatPolling: () => Promise<{
    success: boolean;
    message: string;
  }>;
  stopSnapchatPolling: () => Promise<{
    success: boolean;
    message: string;
  }>;
  manualSnapchatPoll: () => Promise<{
    success: boolean;
    message: string;
  }>;
  fetchSnapchatStats: () => Promise<{
    success: boolean;
    stats: any;
  }>;
}

const SnapchatPage: React.FC<SnapchatPageProps> = ({
  fetchSnapchatTarget,
  setSnapchatTarget,
  startSnapchatPolling,
  stopSnapchatPolling,
  manualSnapchatPoll,
  fetchSnapchatStats
}) => {
  // Target management state
  const [currentTarget, setCurrentTarget] = useState<string>('')
  const [newTarget, setNewTarget] = useState<string>('')
  const [targetLoading, setTargetLoading] = useState(false)
  const [targetError, setTargetError] = useState<string | null>(null)
  const [showTargetManager, setShowTargetManager] = useState(false)
  const [showPollingManager, setShowPollingManager] = useState(false)

  // Polling status state
  const [pollingStatus, setPollingStatus] = useState<{
    enabled: boolean;
    active: boolean;
    started: boolean;
    current_interval?: number;
    activity_level?: string;
  }>({ enabled: false, active: false, started: false })

  // Statistics state
  const [showStats, setShowStats] = useState(false)
  const [stats, setStats] = useState<any>(null)
  const [statsLoading, setStatsLoading] = useState(false)

  // Fetch current target and polling status
  const fetchCurrentTarget = async () => {
    const data = await fetchSnapchatTarget()
    if (data) {
      setCurrentTarget(data.target_username)
      setPollingStatus({
        enabled: data.enabled,
        active: data.active,
        started: data.started,
        current_interval: data.current_interval,
        activity_level: data.activity_level
      })
    }
  }

  // Set target username (follows Instagram flow - no automatic polling)
  const handleSetTarget = async (targetUsername: string) => {
    setTargetLoading(true)
    setTargetError(null)
    
    const result = await setSnapchatTarget(targetUsername)
    
    if (result.success) {
      setCurrentTarget(targetUsername)
      setShowTargetManager(false)
      setNewTarget('')
      // Only refresh status, don't trigger polling (matches Instagram behavior)
      await fetchCurrentTarget()
    } else {
      setTargetError(result.error || 'Failed to set target')
    }
    
    setTargetLoading(false)
  }

  // Start polling
  const handleStartPolling = async () => {
    const result = await startSnapchatPolling()
    if (result.success) {
      alert(result.message)
      await fetchCurrentTarget()
    } else {
      alert(result.message)
    }
  }

  // Stop polling
  const handleStopPolling = async () => {
    const result = await stopSnapchatPolling()
    if (result.success) {
      alert(result.message)
      await fetchCurrentTarget()
    } else {
      alert(result.message)
    }
  }

  // Manual poll
  const handleManualPoll = async () => {
    const result = await manualSnapchatPoll()
    if (result.success) {
      alert(result.message)
      await fetchCurrentTarget()
    } else {
      alert(result.message)
    }
  }

  // Fetch statistics
  const handleFetchStats = async () => {
    setStatsLoading(true)
    const result = await fetchSnapchatStats()
    if (result.success) {
      setStats(result.stats)
    }
    setStatsLoading(false)
  }

  // Fetch current target only on mount (no continuous polling like Instagram)
  useEffect(() => {
    fetchCurrentTarget()
  }, [])

  return (
    <div className="snap-page">
      <h1>Snapchat Content Manager</h1>
      <p className="app-subtitle">
        Download Snapchat stories, highlights, and spotlights with automatic polling and Telegram integration.
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
              className="btn-show-polling"
              onClick={() => setShowPollingManager(!showPollingManager)}
            >
              Polling Controls
            </button>
            <button 
              className="btn-show-stats"
              onClick={() => {
                setShowStats(!showStats)
                if (!showStats) handleFetchStats()
              }}
            >
              Statistics
            </button>
            <button 
              className="btn-refresh-status"
              onClick={fetchCurrentTarget}
              title="Refresh current status"
            >
              🔄 Refresh
            </button>
          </div>
        </div>

        {showTargetManager && (
          <div className="target-manager">
            <form onSubmit={(e) => {
              e.preventDefault()
              if (newTarget.trim()) {
                handleSetTarget(newTarget.trim())
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
                    onClick={handleStartPolling}
                    className="btn-start-polling"
                    title="Start automatic polling for new stories"
                  >
                    🚀 Start Polling
                  </button>
                ) : (
                  <button 
                    onClick={handleStopPolling}
                    className="btn-stop-polling"
                    title="Stop automatic polling"
                  >
                    🛑 Stop Polling
                  </button>
                )}
                <button 
                  onClick={handleManualPoll}
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
                onClick={handleFetchStats}
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

      <div className="snap-grid">
        <Downloader />
        <Gallery />
      </div>
    </div>
  );
};

export default SnapchatPage;
