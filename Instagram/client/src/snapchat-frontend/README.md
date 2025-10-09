# Snapchat Frontend

A modern React-based frontend for the Snapchat Content Manager service, built with TypeScript, Vite, and React Router. This frontend provides a comprehensive interface for downloading Snapchat content, managing polling systems, and integrating with Telegram.

## Features

- **Content Download**: Download Snapchat stories, highlights, and spotlights
- **Real-time Progress**: WebSocket-based progress tracking with polling fallback
- **Polling Management**: Start, stop, and manually trigger content polling
- **Target Management**: Set and manage target Snapchat usernames
- **Telegram Integration**: Automatic and manual sending to Telegram
- **Gallery View**: Browse and manage downloaded content
- **Statistics**: View service usage statistics
- **Responsive Design**: Mobile-friendly interface

## Technology Stack

- **React 18.3.1** - Modern React with hooks and functional components
- **TypeScript 5.8.3** - Type-safe JavaScript development
- **Vite 7.1.2** - Fast build tool and development server
- **React Router DOM 7.8.0** - Client-side routing

## Project Structure

```
src/
├── App.tsx                 # Main application component
├── style.css              # Global styles
├── main.tsx               # Application entry point
├── snapchat/              # Snapchat-specific components
│   ├── SnapchatPage.tsx   # Snapchat page wrapper
│   ├── Downloader.tsx     # Snapchat downloader component
│   ├── Gallery.tsx        # Snapchat gallery component
│   ├── api.ts             # Snapchat API functions
│   ├── ProgressWS.ts      # WebSocket progress handling
│   └── styles.css         # Snapchat-specific styles
└── vite-env.d.ts          # Vite environment types
```

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn
- Snapchat backend service running on port 8000

### Installation

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm run dev
```

3. Open your browser and navigate to `http://localhost:5174`

### Building for Production

```bash
npm run build
```

The built files will be in the `dist` directory.

## Configuration

The frontend is configured to connect to the Snapchat backend service running on `http://localhost:8000`. The Vite configuration includes proxy settings for development.

### Environment Variables

- `VITE_SNAPCHAT_API_BASE` - Base URL for Snapchat API (default: `/snapchat-api`)

## API Endpoints

The frontend communicates with the following backend endpoints:

### Snapchat Service (Port 8000)
- `POST /snapchat-api/download` - Start content download
- `GET /snapchat-api/gallery/{username}/{type}` - Get gallery content
- `GET /snapchat-api/progress/{username}/{type}` - Get download progress
- `WS /snapchat-api/ws/progress/{username}/{type}` - WebSocket progress updates

### Polling Management
- `GET /status` - Get service status
- `POST /start-polling` - Start automatic polling
- `POST /stop-polling` - Stop automatic polling
- `GET /poll-now?force=true` - Trigger manual poll
- `POST /set-target` - Set target username
- `GET /stats` - Get service statistics

### Telegram Integration
- `POST /send-to-telegram` - Send media to Telegram

## Usage

### Setting a Target

1. Click "Change Target" in the target management section
2. Enter a Snapchat username (3-15 characters, alphanumeric and underscores)
3. Click "Update" to set the target

### Downloading Content

1. Enter a Snapchat username in the downloader
2. Select content type (stories, highlights, or spotlights)
3. Toggle "Auto-send to Telegram" if desired
4. Click "Download" to start the process
5. Monitor real-time progress via WebSocket or polling fallback

### Managing Polling

1. Click "Polling Controls" to show polling management
2. Use "Start Polling" to begin automatic monitoring
3. Use "Stop Polling" to halt automatic monitoring
4. Use "Manual Poll" to trigger a single poll immediately

### Viewing Gallery

1. Select content type from the gallery dropdown
2. Browse downloaded content with thumbnails
3. Download individual items or send to Telegram
4. Use "Refresh" to update the gallery

### Viewing Statistics

1. Click "Statistics" to show service statistics
2. View Snapchat requests, Telegram sends, and success rates
3. Use "Refresh" to update statistics

## Development

### Code Style

The project uses TypeScript for type safety and follows React best practices with functional components and hooks.

### Adding New Features

1. Create new components in the appropriate directory
2. Add TypeScript interfaces for new data types
3. Update API functions in `src/snapchat/api.ts`
4. Add styles in the appropriate CSS files

### Testing

```bash
npm run lint
```

## Troubleshooting

### Common Issues

1. **Backend Connection**: Ensure the Snapchat backend service is running on port 8000
2. **WebSocket Issues**: The frontend will automatically fall back to polling if WebSocket fails
3. **CORS Issues**: The Vite proxy should handle CORS in development

### Debug Mode

Open browser developer tools to view console logs and network requests for debugging.

## Contributing

1. Follow the existing code structure and patterns
2. Use TypeScript for all new code
3. Add appropriate error handling
4. Test on both desktop and mobile devices

## License

This project is part of the Snapchat Content Manager service.
