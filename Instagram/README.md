# Instagram Video Downloader API

A full-stack solution for downloading Instagram media (photos, videos, carousels), monitoring accounts for new posts, and optionally auto-posting to Telegram. Includes a Node.js/Express backend and a modern React/TypeScript frontend.

## ✨ Features

- Manual downloads from any public Instagram post URL
- Automated monitoring of a target Instagram account (smart polling)
- Carousel extraction (all media with correct ordering)
- Optional Telegram posting (photos/videos)
- Request tracking and live statistics for Instagram/Telegram calls
- React UI with real-time status and controls

## 🏗️ Architecture

- Backend (Node.js/Express)
  - Instagram Web Profile Info API + GraphQL + Puppeteer fallback
  - SQLite database for deduplication and recent cache
  - Smart polling (activity-aware, randomized, backoff)
  - Telegram integration (sendPhoto/sendVideo)
- Frontend (React + Vite + TypeScript)
  - Manage target account, polling, and manual downloads
  - Live polling status indicator (3-second refresh)

## 📦 Requirements

- Node.js v16+ (v18+ recommended)
- npm
- Optional: Telegram bot token and channel id

## ⚙️ Configuration

Create a `.env` file in `Instagram/`:

```env
# Server
PORT=3000

# Telegram (optional)
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
TELEGRAM_CHANNEL_ID=your_channel_id
```

Notes:

- Telegram settings are optional; if omitted, Telegram features are disabled.
- User agent rotation and IG headers are handled internally.

## 🚀 Getting Started

### 1) Install dependencies

```bash
# Backend
cd Instagram
npm install

# Frontend
cd client
npm install
cd ..
```

### 2) Run in development

```bash
# Backend
npm start
# Serves API at http://localhost:3000

# Frontend (in a separate terminal)
cd client
npm run dev
# Serves unified UI at http://localhost:5173
```

### 3) Build for production (optional)

```bash
cd client
npm run build
cd ..
```

## 🎮 Using the App

- Open the unified UI at `http://localhost:5173`
- Paste any public Instagram URL and click Download
- Use “Send to Telegram” on items (if Telegram is configured)

### Automated monitoring

- Click “Change Target” to set the target account (e.g., `@instagram`)
- Open “Polling” and click “Start Polling”
- Smart scheduler runs checks (15–45 mins depending on activity)
- Status indicator refreshes every 3 seconds

## 🔌 API Reference (Backend)

Core endpoints:

- `GET /igdl?url=<instagram_url>`: Download media for a given post URL
- `POST /send-to-telegram` { videoUrl, caption?, originalInstagramUrl? }
- `GET /target`: Get current target and polling status
- `POST /target` { username | url }: Set target account

Automation endpoints:

- `POST /start-polling` | `POST /stop-polling`
- `GET /poll-now?force=true`
- `POST /reset-processed` (clears processed history and recent cache)
- `POST /clear-cache` | `POST /clear-all` (manual cleanup)

Tracking/Statistics endpoints:

- `GET /stats`: JSON snapshot of request stats
- `POST /stats/print`: Pretty-print stats to server console
- `POST /stats/reset`: Reset counters
- `GET /logs`: Last 100 request log entries (newest first)

## 📊 View Statistics & Logs

From a terminal (with backend running):

```bash
# View statistics (JSON)
curl http://localhost:3000/stats | jq

# Print statistics to the server console
curl -X POST http://localhost:3000/stats/print

# Reset statistics
curl -X POST http://localhost:3000/stats/reset

# View recent request logs (last 100)
curl http://localhost:3000/logs | jq
```

Scripts included:

```bash
# One-off stats monitor (human-readable)
node monitor-stats.js

# Run a quick end-to-end test of the tracking system
node test-tracking.js
```

Log file:

- A rolling log of requests is written to `request-logs.txt` in the API root.

## 🧠 Polling & Activity Model

- Smart polling interval: 15–45 minutes based on recent activity
- Random variation per run to avoid predictable timing
- Backoff and error multiplier on failures or rate limits
- Next poll time logged with local timestamp (e.g., “at 10:45 PM”)

## 🗂️ Data Storage

- SQLite database `instagram_tracker.db` tracks processed posts and a recent-posts cache.
- Tables:
  - `processed_posts`: id, username, post_url, post_type, is_pinned, pinned_at, processed_at
  - `recent_posts_cache`: username, post_url, shortcode, is_pinned, post_order, cached_at
  - `cache_cleanup_log`: cleaned_at, posts_removed, username

## 🔐 Safety & Anti-detection

- Random delays and user-agent rotation
- Limited scope per poll (pinned + last ~5 posts)
- Exponential backoff on 429s (rate limits)
- Deduplication to prevent repeats and spam

## 📁 Project Structure

```
Instagram/
├─ client/                         # React frontend (Vite + TS)
│  ├─ src/
│  │  └─ App.tsx                   # UI with status controls
│  ├─ package.json
│  └─ vite.config.ts
├─ snapsave-downloader/
├─ instagram-carousel-downloader.js
├─ index.js                        # Express server & automation
├─ instagram_tracker.db            # SQLite database
├─ monitor-stats.js                # CLI stats viewer
├─ test-tracking.js                # Tracking system smoke test
├─ request-logs.txt                # Request activity log (created at runtime)
├─ package.json
└─ README.md
```

## 📦 Dependencies

See `package.json` files for exact versions. Key libraries used:

- Backend: express, axios, puppeteer, sqlite3, cheerio, form-data, node-fetch, node-cron, dotenv
- Frontend: react, react-dom, vite, typescript

## 🤝 Contributing

1. Fork the repo
2. Create a feature branch
3. Make changes + test (backend and UI)
4. Open a pull request with a clear description

## 📄 License & Disclaimer

This project is for educational and personal use. You are responsible for:

- Respecting Instagram’s Terms of Service
- Obtaining permissions for content you download/post
- Complying with local laws and platform policies

— Happy building! 🎉
