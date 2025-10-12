# Quick Start - Vercel Deployment

The fastest way to deploy your frontend to Vercel.

## 🚀 5-Minute Deployment

### Option 1: Deploy via Vercel Dashboard (Easiest)

1. **Go to [vercel.com](https://vercel.com)** and sign in

2. **Click "Add New..." → "Project"**

3. **Import your Git repository**

4. **Configure settings:**

   - Framework Preset: **Vite**
   - Root Directory: **Instagram/client**
   - Build Command: `npm run build` (auto-detected)
   - Output Directory: `dist` (auto-detected)

5. **Add Environment Variables:**

   ```
   VITE_INSTAGRAM_API_BASE = https://tyla-social.onrender.com
   VITE_SNAPCHAT_API_BASE = https://tyla-social.onrender.com
   VITE_ENV = production
   ```

6. **Click "Deploy"** 🎉

---

### Option 2: Deploy via CLI (For Developers)

```bash
# 1. Install Vercel CLI (one time)
npm install -g vercel

# 2. Navigate to your project
cd Instagram/client

# 3. Login to Vercel
vercel login

# 4. Deploy
vercel --prod
```

When prompted:

- Set up and deploy? **Y**
- Which scope? Select your account
- Link to existing project? **N** (first time)
- Project name? `tyla-social-downloader` (or your choice)
- In which directory? `./`

Then set environment variables:

```bash
vercel env add VITE_INSTAGRAM_API_BASE production
# Enter: https://tyla-social.onrender.com

vercel env add VITE_SNAPCHAT_API_BASE production
# Enter: https://tyla-social.onrender.com

vercel env add VITE_ENV production
# Enter: production
```

**Redeploy with environment variables:**

```bash
vercel --prod --force
```

---

## ✅ Verify Deployment

After deployment:

1. **Visit your site**: `https://your-project.vercel.app`

2. **Check browser console** for:

   ```
   Environment: PRODUCTION
   Instagram API Base URL: https://tyla-social.onrender.com
   Snapchat API Base URL: https://tyla-social.onrender.com
   ```

3. **Test routes**:

   - `/instagram` - Instagram downloader
   - `/snapchat` - Snapchat downloader

4. **Test functionality**:
   - Try downloading an Instagram post
   - Check that API calls work

---

## 🔧 Common Issues

### 404 on routes?

✅ Already fixed - `vercel.json` includes rewrite rules

### API calls failing?

- Check environment variables are set
- Verify backend URL is correct
- Ensure backend has CORS enabled for your Vercel domain

### Build failing?

Test locally first:

```bash
npm install
npm run build
npm run preview
```

---

## 📚 Need More Help?

- **Full Guide**: See `VERCEL_DEPLOYMENT.md`
- **Environment Variables**: See `ENV_SETUP.md`
- **Vercel Docs**: [vercel.com/docs](https://vercel.com/docs)

---

## 🎯 What's Configured

Your project is already set up with:

✅ `vercel.json` - Proper Vite configuration
✅ SPA routing - No 404s on page refresh
✅ Environment variables - Backend API URLs
✅ Build optimization - Asset caching configured
✅ TypeScript types - Environment variable types

You're ready to deploy! 🚀
