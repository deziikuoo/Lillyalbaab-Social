# Environment Variables Setup

This document explains how to set up environment variables for the Instagram/Snapchat Downloader frontend.

## Environment Variables

The application uses the following environment variables:

### Required Variables

1. **VITE_INSTAGRAM_API_BASE** - Base URL for Instagram API

   - Development: `http://localhost:3000`
   - Production: `https://tyla-social.onrender.com` (or your production backend URL)

2. **VITE_SNAPCHAT_API_BASE** - Base URL for Snapchat API

   - Development: `http://localhost:8000`
   - Production: `https://tyla-social.onrender.com` (or your production backend URL)

3. **VITE_ENV** - Current environment
   - Development: `development`
   - Production: `production`

## Local Development Setup

Create a `.env.local` file in the `Instagram/client` directory:

```env
VITE_INSTAGRAM_API_BASE=http://localhost:3000
VITE_SNAPCHAT_API_BASE=http://localhost:8000
VITE_ENV=development
```

## Vercel Deployment Setup

### Step 1: Add Environment Variables in Vercel Dashboard

1. Go to your project settings in Vercel Dashboard
2. Navigate to "Environment Variables"
3. Add the following variables:

| Variable Name           | Value                            | Environments        |
| ----------------------- | -------------------------------- | ------------------- |
| VITE_INSTAGRAM_API_BASE | https://tyla-social.onrender.com | Production, Preview |
| VITE_SNAPCHAT_API_BASE  | https://tyla-social.onrender.com | Production, Preview |
| VITE_ENV                | production                       | Production, Preview |

### Step 2: Using Vercel CLI

Alternatively, you can set environment variables using the Vercel CLI:

```bash
# Navigate to the client directory
cd Instagram/client

# Add environment variables
vercel env add VITE_INSTAGRAM_API_BASE
# Enter: https://tyla-social.onrender.com
# Select: Production, Preview

vercel env add VITE_SNAPCHAT_API_BASE
# Enter: https://tyla-social.onrender.com
# Select: Production, Preview

vercel env add VITE_ENV
# Enter: production
# Select: Production, Preview
```

## Important Notes

1. **Vite Environment Variables**: All environment variables must be prefixed with `VITE_` to be exposed to the client-side code.

2. **Build Time**: Environment variables are embedded at build time in Vite, so you need to redeploy after changing them.

3. **Security**: Never commit `.env` files to version control. The `.env.example` file is safe to commit as it contains no sensitive data.

4. **Default Values**: The application has fallback values hardcoded, but it's recommended to set environment variables explicitly for better control.

## Testing Environment Variables

After setting up environment variables, you can test them locally:

```bash
npm run dev
```

Then check the browser console. The application logs the API base URLs on startup:

- "Environment: PRODUCTION" or "DEVELOPMENT"
- "Instagram API Base URL: [URL]"
- "Snapchat API Base URL: [URL]"
