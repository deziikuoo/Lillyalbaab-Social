# Vercel Deployment Guide

This guide provides complete instructions for deploying the Instagram/Snapchat Downloader frontend to Vercel.

## 📋 Table of Contents

1. [Prerequisites](#prerequisites)
2. [Project Structure](#project-structure)
3. [Configuration Files](#configuration-files)
4. [Deployment Methods](#deployment-methods)
5. [Environment Variables](#environment-variables)
6. [Troubleshooting](#troubleshooting)
7. [Post-Deployment](#post-deployment)

---

## Prerequisites

Before deploying to Vercel, ensure you have:

- ✅ A [Vercel account](https://vercel.com/signup)
- ✅ [Vercel CLI](https://vercel.com/cli) installed (optional, for CLI deployment)
- ✅ Git repository with your code
- ✅ Backend API URL (e.g., `https://tyla-social.onrender.com`)

### Installing Vercel CLI

```bash
npm install -g vercel
```

---

## Project Structure

Your frontend application is located in:

```
Instagram/client/
├── src/                    # Source code
│   ├── App.tsx            # Main application component
│   ├── main.tsx           # Application entry point
│   └── snapchat/          # Snapchat-specific components
├── public/                 # Static assets
├── dist/                   # Build output (generated)
├── package.json           # Dependencies and scripts
├── vite.config.ts         # Vite configuration
├── vercel.json            # Vercel configuration
└── ENV_SETUP.md          # Environment variables guide
```

---

## Configuration Files

### 1. `vercel.json`

Located at `Instagram/client/vercel.json`:

```json
{
  "version": 2,
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "devCommand": "npm run dev",
  "installCommand": "npm install",
  "framework": "vite",
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ],
  "headers": [
    {
      "source": "/assets/(.*)",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "public, max-age=31536000, immutable"
        }
      ]
    }
  ]
}
```

**Key configurations:**

- **buildCommand**: Runs TypeScript compilation + Vite build
- **outputDirectory**: Build output directory (`dist`)
- **rewrites**: Enables client-side routing for React Router
- **headers**: Optimizes caching for static assets

### 2. `vite.config.ts`

The Vite configuration includes:

- React plugin for JSX/TSX support
- Development server on port 5173
- Proxy configuration (only for development)

**Important**: Proxy settings in `vite.config.ts` only work during local development. In production, the frontend communicates directly with the backend API using environment variables.

### 3. Environment Variables

See `ENV_SETUP.md` for detailed environment variable configuration.

---

## Deployment Methods

### Method 1: Deploy via Vercel Dashboard (Recommended for First Deploy)

1. **Login to Vercel**

   - Go to [vercel.com](https://vercel.com)
   - Sign in with your GitHub, GitLab, or Bitbucket account

2. **Import Your Project**

   - Click "Add New..." → "Project"
   - Import your Git repository
   - Vercel will automatically detect your repository

3. **Configure Project Settings**

   - **Framework Preset**: Vite
   - **Root Directory**: `Instagram/client`
   - **Build Command**: `npm run build` (auto-detected)
   - **Output Directory**: `dist` (auto-detected)
   - **Install Command**: `npm install` (auto-detected)

4. **Add Environment Variables**

   Navigate to "Environment Variables" and add:

   | Variable Name             | Value                              | Environment         |
   | ------------------------- | ---------------------------------- | ------------------- |
   | `VITE_INSTAGRAM_API_BASE` | `https://tyla-social.onrender.com` | Production, Preview |
   | `VITE_SNAPCHAT_API_BASE`  | `https://tyla-social.onrender.com` | Production, Preview |
   | `VITE_ENV`                | `production`                       | Production, Preview |

5. **Deploy**
   - Click "Deploy"
   - Wait for the build to complete (usually 1-3 minutes)
   - Your site will be live at `https://your-project.vercel.app`

---

### Method 2: Deploy via Vercel CLI

Perfect for subsequent deployments and automation.

#### Initial Setup

```bash
# Navigate to the client directory
cd Instagram/client

# Login to Vercel (one-time setup)
vercel login

# Link your project to Vercel
vercel link
```

Follow the prompts:

- Set up and deploy? **Y**
- Which scope? Select your account
- Link to existing project? **N** (for first deploy) or **Y** (for subsequent deploys)
- What's your project's name? `tyla-social-downloader` (or your preferred name)
- In which directory is your code located? `./`

#### Set Environment Variables

```bash
# Add Instagram API base URL
vercel env add VITE_INSTAGRAM_API_BASE production
# Enter: https://tyla-social.onrender.com

# Add Snapchat API base URL
vercel env add VITE_SNAPCHAT_API_BASE production
# Enter: https://tyla-social.onrender.com

# Add environment indicator
vercel env add VITE_ENV production
# Enter: production
```

#### Deploy to Production

```bash
# Deploy to production
vercel --prod
```

#### Deploy to Preview

```bash
# Deploy to preview environment (for testing)
vercel
```

---

### Method 3: Automatic Deployments via Git

After initial setup, Vercel automatically deploys when you push to your repository:

- **Push to `main` branch** → Production deployment
- **Push to other branches** → Preview deployment
- **Pull requests** → Preview deployment with URL in PR comments

---

## Environment Variables

### Required Variables

| Variable                  | Description               | Example                            |
| ------------------------- | ------------------------- | ---------------------------------- |
| `VITE_INSTAGRAM_API_BASE` | Instagram API backend URL | `https://tyla-social.onrender.com` |
| `VITE_SNAPCHAT_API_BASE`  | Snapchat API backend URL  | `https://tyla-social.onrender.com` |
| `VITE_ENV`                | Environment indicator     | `production`                       |

### Setting Environment Variables

#### Via Vercel Dashboard

1. Go to your project in Vercel Dashboard
2. Click "Settings" → "Environment Variables"
3. Add each variable with appropriate values
4. Select environments: Production, Preview, or both
5. Click "Save"

**Important**: After adding/changing environment variables, you must redeploy:

- Vercel Dashboard: Click "Deployments" → "..." → "Redeploy"
- CLI: Run `vercel --prod --force`

#### Via Vercel CLI

```bash
# Production environment
vercel env add VITE_INSTAGRAM_API_BASE production

# Preview environment
vercel env add VITE_INSTAGRAM_API_BASE preview

# Development environment
vercel env add VITE_INSTAGRAM_API_BASE development
```

### Verifying Environment Variables

```bash
# List all environment variables
vercel env ls

# Pull environment variables to local .env file
vercel env pull
```

---

## Troubleshooting

### Build Fails

**Problem**: Build fails with TypeScript errors

**Solution**:

```bash
# Test build locally
cd Instagram/client
npm install
npm run build

# If successful locally, ensure Vercel uses the same Node.js version
# Add to package.json:
{
  "engines": {
    "node": ">=18.0.0"
  }
}
```

---

### 404 on Page Refresh

**Problem**: Direct navigation to routes like `/snapchat` returns 404

**Solution**: Ensure `vercel.json` has the rewrite rule:

```json
{
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

This is already configured in the provided `vercel.json`.

---

### API Requests Fail

**Problem**: Frontend can't reach backend API

**Possible causes and solutions**:

1. **Wrong API URL**

   - Check environment variables in Vercel Dashboard
   - Verify backend URL is accessible: `curl https://tyla-social.onrender.com/status`

2. **CORS Issues**

   - Ensure backend has CORS configured to allow your Vercel domain
   - Backend should allow: `https://your-project.vercel.app`

3. **Environment Variables Not Set**
   - Check browser console for API URLs being used
   - Look for: "Instagram API Base URL: undefined"
   - Set environment variables and redeploy

---

### Blank Page After Deployment

**Problem**: Deployed site shows blank page

**Solutions**:

1. **Check Browser Console**

   - Open Developer Tools → Console
   - Look for JavaScript errors

2. **Check Build Logs**

   - Vercel Dashboard → Deployments → Click on deployment
   - Review build logs for errors

3. **Test Local Build**
   ```bash
   npm run build
   npm run preview
   ```

---

### Environment Variables Not Working

**Problem**: App uses default values instead of environment variables

**Causes**:

1. **Missing `VITE_` Prefix**

   - Vite requires `VITE_` prefix for client-side variables
   - ❌ Wrong: `API_BASE`
   - ✅ Correct: `VITE_API_BASE`

2. **Not Redeployed After Setting Variables**
   - Environment variables are embedded at build time
   - Must redeploy after changing them

**Solution**:

```bash
# Verify variables are set
vercel env ls

# Force rebuild
vercel --prod --force
```

---

## Post-Deployment

### 1. Verify Deployment

After deployment, verify these:

✅ **Homepage loads**: Visit `https://your-project.vercel.app`

✅ **Routing works**:

- Navigate to `/instagram`
- Navigate to `/snapchat`
- Refresh page (should not get 404)

✅ **API connections**:

- Open browser console
- Check logged API URLs
- Test a download to verify backend connectivity

✅ **Environment check**:
Look for console logs:

```
Environment: PRODUCTION
Instagram API Base URL: https://tyla-social.onrender.com
Snapchat API Base URL: https://tyla-social.onrender.com
```

### 2. Set Up Custom Domain (Optional)

1. Go to Vercel Dashboard → Your Project → Settings → Domains
2. Add your custom domain
3. Follow DNS configuration instructions
4. Wait for DNS propagation (can take up to 48 hours)

### 3. Configure Backend CORS

Ensure your backend (Render) allows requests from your Vercel domain:

```javascript
// Example for Express.js
const cors = require("cors");
app.use(
  cors({
    origin: [
      "https://your-project.vercel.app",
      "http://localhost:5173", // Keep for local development
    ],
  })
);
```

### 4. Monitor Performance

Vercel provides analytics:

- Dashboard → Your Project → Analytics
- Monitor page load times, traffic, and errors

### 5. Set Up Monitoring

Consider setting up monitoring for your deployment:

- **Vercel Analytics**: Built-in analytics
- **Sentry**: Error tracking
- **LogRocket**: Session replay

---

## Deployment Checklist

Before deploying, ensure:

- [ ] All code is committed and pushed to Git
- [ ] `vercel.json` is in `Instagram/client/` directory
- [ ] Environment variables are documented
- [ ] Backend API is accessible and has CORS configured
- [ ] Local build succeeds: `npm run build`
- [ ] Local preview works: `npm run preview`

During deployment:

- [ ] Set all environment variables in Vercel
- [ ] Configure root directory as `Instagram/client`
- [ ] Verify framework preset is "Vite"
- [ ] Build completes successfully

After deployment:

- [ ] Test homepage loads
- [ ] Test Instagram page works
- [ ] Test Snapchat page works
- [ ] Test route navigation
- [ ] Test page refresh doesn't cause 404
- [ ] Verify API connections work
- [ ] Check browser console for errors

---

## Additional Resources

- [Vercel Documentation](https://vercel.com/docs)
- [Vite Deployment Guide](https://vitejs.dev/guide/static-deploy.html)
- [React Router with Vercel](https://vercel.com/guides/deploying-react-with-vercel)
- [Environment Variables Guide](./ENV_SETUP.md)

---

## Support

If you encounter issues:

1. Check this guide's [Troubleshooting](#troubleshooting) section
2. Review Vercel build logs
3. Test local build with `npm run build && npm run preview`
4. Check Vercel [status page](https://www.vercel-status.com/)

---

## Quick Commands Reference

```bash
# Install dependencies
npm install

# Test build locally
npm run build

# Preview production build locally
npm run preview

# Deploy to preview
vercel

# Deploy to production
vercel --prod

# Check environment variables
vercel env ls

# Pull environment variables
vercel env pull

# Check deployment logs
vercel logs [deployment-url]
```

---

## Success! 🎉

Your frontend is now deployed to Vercel! The application will automatically deploy on every push to your main branch.

**Next Steps**:

- Set up a custom domain
- Configure monitoring and analytics
- Set up staging environment (preview branch)
- Enable Vercel Analytics for insights
