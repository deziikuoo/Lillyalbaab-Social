# Instagram & Snapchat Downloader - Frontend

A modern, responsive web application for downloading Instagram and Snapchat content with automatic polling and Telegram integration.

## 🌟 Features

### Instagram

- Download posts, reels, stories, and IGTV videos
- Automatic polling for new content from target accounts
- Manual URL-based downloads
- Carousel support (multi-image posts)
- Telegram integration for automatic notifications
- Cache and storage management

### Snapchat

- Download stories, highlights, and spotlights
- Automatic polling for new content
- Username-based downloads
- Telegram integration
- Real-time gallery updates
- Storage management

## 🏗️ Tech Stack

- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **Routing**: React Router v7
- **Styling**: CSS with modern features
- **Type Safety**: TypeScript with strict mode
- **Development**: Hot Module Replacement (HMR)

## 📦 Project Structure

```
client/
├── src/
│   ├── App.tsx              # Main application with routing
│   ├── main.tsx             # Application entry point
│   ├── style.css            # Global styles
│   ├── vite-env.d.ts        # TypeScript declarations
│   └── snapchat/            # Snapchat-specific components
│       ├── SnapchatPage.tsx # Snapchat gallery component
│       ├── api.ts           # API client functions
│       └── ProgressWS.ts    # WebSocket for progress updates
├── public/                   # Static assets
├── dist/                     # Build output (generated)
├── package.json             # Dependencies and scripts
├── tsconfig.json            # TypeScript configuration
├── vite.config.ts           # Vite configuration
├── vercel.json              # Vercel deployment config
├── QUICK_START.md           # Quick deployment guide
├── VERCEL_DEPLOYMENT.md     # Comprehensive deployment guide
└── ENV_SETUP.md             # Environment variables guide
```

## 🚀 Quick Start

### Local Development

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Set up environment variables** (optional for development)

   ```bash
   # Create .env.local file
   echo "VITE_INSTAGRAM_API_BASE=http://localhost:3000" > .env.local
   echo "VITE_SNAPCHAT_API_BASE=http://localhost:8000" >> .env.local
   echo "VITE_ENV=development" >> .env.local
   ```

3. **Start development server**

   ```bash
   npm run dev
   ```

4. **Open browser**
   - Navigate to `http://localhost:5173`
   - Instagram: `http://localhost:5173/instagram`
   - Snapchat: `http://localhost:5173/snapchat`

### Production Build

```bash
# Build for production
npm run build

# Preview production build
npm run preview
```

## 📤 Deployment

### Vercel (Recommended)

**Quick deployment:**
See [QUICK_START.md](./QUICK_START.md) for 5-minute deployment guide.

**Comprehensive guide:**
See [VERCEL_DEPLOYMENT.md](./VERCEL_DEPLOYMENT.md) for detailed instructions.

**TL;DR:**

1. Push code to Git repository
2. Go to [vercel.com](https://vercel.com) and import project
3. Set Root Directory to `Instagram/client`
4. Add environment variables:
   - `VITE_INSTAGRAM_API_BASE`
   - `VITE_SNAPCHAT_API_BASE`
   - `VITE_ENV`
5. Deploy!

### Other Platforms

The application can be deployed to any static hosting platform that supports Vite:

- **Netlify**: Use `dist` as publish directory
- **Cloudflare Pages**: Build command: `npm run build`, Output: `dist`
- **GitHub Pages**: Use vite-plugin-github-pages
- **AWS S3 + CloudFront**: Upload `dist` folder

## 🔧 Configuration

### Environment Variables

The application uses these environment variables:

| Variable                  | Description           | Default (Dev)           | Default (Prod)                     |
| ------------------------- | --------------------- | ----------------------- | ---------------------------------- |
| `VITE_INSTAGRAM_API_BASE` | Instagram API URL     | `http://localhost:3000` | `https://tyla-social.onrender.com` |
| `VITE_SNAPCHAT_API_BASE`  | Snapchat API URL      | `http://localhost:8000` | `https://tyla-social.onrender.com` |
| `VITE_ENV`                | Environment indicator | `development`           | `production`                       |

See [ENV_SETUP.md](./ENV_SETUP.md) for detailed configuration.

### Vite Configuration

Key configurations in `vite.config.ts`:

- **Dev Server**: Port 5173
- **Proxy**: API proxying for local development
- **Plugins**: React with Fast Refresh
- **Build**: Optimized production builds

### Vercel Configuration

The `vercel.json` file includes:

- SPA routing (no 404s on refresh)
- Asset caching optimization
- Automatic Vite framework detection
- Build and output directory configuration

## 🛠️ Development

### Available Scripts

```bash
# Start development server with HMR
npm run dev

# Build for production (TypeScript + Vite)
npm run build

# Preview production build locally
npm run preview

# Build for Vercel (same as build)
npm run vercel-build

# Type checking only
npx tsc --noEmit
```

### Development Workflow

1. **Start development server**

   ```bash
   npm run dev
   ```

2. **Make changes** - Hot reload is automatic

3. **Test build locally**

   ```bash
   npm run build
   npm run preview
   ```

4. **Commit and push** - Vercel auto-deploys from Git

### API Integration

The frontend communicates with backend APIs:

**Instagram API** (Node.js backend):

- `/igdl` - Download Instagram content
- `/send-to-telegram` - Send to Telegram
- `/target` - Get/set tracking target
- `/start-polling`, `/stop-polling` - Control polling
- `/status`, `/stats` - Service status
- `/clear-cache`, `/clear-all` - Storage management

**Snapchat API** (Python backend via Node.js proxy):

- `/snapchat-download` - Download Snapchat content
- `/snapchat-set-target` - Set target username
- `/snapchat-start-polling`, `/snapchat-stop-polling` - Control polling
- `/snapchat-status`, `/snapchat-stats` - Service status
- `/gallery/:mediaType` - Get downloaded media

### Adding New Features

1. **Components**: Add to `src/` directory
2. **Routes**: Update `App.tsx` routes
3. **API calls**: Add to `src/snapchat/api.ts` or create new API file
4. **Styles**: Update `src/style.css` or component-specific CSS

## 🎨 Styling

The application uses vanilla CSS with:

- CSS custom properties (variables)
- Flexbox and Grid layouts
- Responsive design (mobile-friendly)
- Modern CSS features (animations, transitions)

Global styles in `src/style.css`:

- Typography and colors
- Layout utilities
- Component styles
- Responsive breakpoints

## 🔍 TypeScript

The project uses TypeScript with strict mode:

- Type safety for API responses
- Interface definitions for data structures
- Environment variable types in `vite-env.d.ts`
- Strict null checks and type checking

### Key Type Definitions

```typescript
// Download items
interface DownloadItem {
  quality?: string;
  thumb?: string;
  url: string;
  isProgress?: boolean;
  carouselIndex?: number;
  isVideo?: boolean;
}

// API responses
interface ApiResponse {
  developer: string;
  status: boolean;
  data?: BackendItem[];
  msg?: string;
}

// Polling status
interface PollingStatus {
  enabled: boolean;
  active: boolean;
  started: boolean;
  target_username?: string;
}
```

## 🧪 Testing

### Manual Testing Checklist

**Instagram**:

- [ ] Download single image post
- [ ] Download carousel post
- [ ] Download reel/video
- [ ] Download story
- [ ] Set tracking target
- [ ] Start/stop polling
- [ ] Send to Telegram
- [ ] Clear cache/storage

**Snapchat**:

- [ ] Download stories
- [ ] Download highlights
- [ ] Download spotlights
- [ ] Set tracking target
- [ ] Start/stop polling
- [ ] Gallery refresh
- [ ] Clear cache/storage

**Routing**:

- [ ] Navigate between pages
- [ ] Refresh page (no 404)
- [ ] Direct URL access

### Browser Testing

Test on:

- Chrome/Edge (Chromium)
- Firefox
- Safari (desktop and mobile)
- Mobile browsers (responsive design)

## 🐛 Troubleshooting

### Development Issues

**Port already in use**:

```bash
# Kill process on port 5173
npx kill-port 5173
# Or change port in vite.config.ts
```

**API not reachable**:

- Ensure backend is running
- Check proxy configuration in `vite.config.ts`
- Verify environment variables

**Build fails**:

```bash
# Clean install
rm -rf node_modules package-lock.json
npm install
npm run build
```

### Production Issues

**Blank page after deployment**:

- Check browser console for errors
- Verify environment variables are set
- Check Vercel build logs

**404 on routes**:

- Ensure `vercel.json` has rewrite rules
- Verify framework preset is Vite

**API calls failing**:

- Check environment variables
- Verify backend CORS configuration
- Check backend URL accessibility

See [VERCEL_DEPLOYMENT.md](./VERCEL_DEPLOYMENT.md) for more troubleshooting.

## 📱 Browser Support

- **Modern browsers**: Full support

  - Chrome 90+
  - Firefox 88+
  - Safari 14+
  - Edge 90+

- **Mobile browsers**: Full support

  - Chrome Mobile
  - Safari iOS 14+
  - Samsung Internet

- **Legacy browsers**: Partial support (ES6+ required)

## 🔒 Security

- No sensitive data in client-side code
- Environment variables for API URLs
- HTTPS enforced in production
- No API keys exposed to client
- CORS protection on backend

## 📄 License

[Your license here]

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test locally
5. Submit a pull request

## 📞 Support

- **Issues**: GitHub Issues
- **Documentation**: See guides in this directory
- **Deployment**: See [VERCEL_DEPLOYMENT.md](./VERCEL_DEPLOYMENT.md)

## 🎯 Next Steps

After deployment:

1. ✅ Set up custom domain
2. ✅ Configure monitoring (Vercel Analytics, Sentry)
3. ✅ Set up staging environment
4. ✅ Add unit tests
5. ✅ Implement error boundaries
6. ✅ Add loading skeletons
7. ✅ Optimize images and assets
8. ✅ Add PWA support (optional)

---

**Built with ❤️ using React, TypeScript, and Vite**
