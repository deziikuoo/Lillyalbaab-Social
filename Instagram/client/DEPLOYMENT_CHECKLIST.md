# Vercel Deployment Checklist ✅

Use this checklist to ensure a smooth deployment to Vercel.

## 📋 Pre-Deployment

### Code Preparation

- [x] `vercel.json` configured in `Instagram/client/` directory
- [x] Environment variables configured for production use
- [x] `.gitignore` updated to exclude `.env` files
- [x] TypeScript types added for environment variables
- [x] API base URLs use environment variables

### Local Testing

- [ ] Install dependencies: `npm install`
- [ ] Build succeeds: `npm run build`
- [ ] Preview works: `npm run preview`
- [ ] Test Instagram functionality
- [ ] Test Snapchat functionality
- [ ] Test routing (navigate between pages)
- [ ] Check browser console for errors

### Repository

- [ ] All changes committed to Git
- [ ] Changes pushed to remote repository
- [ ] Repository is accessible (GitHub/GitLab/Bitbucket)

### Backend Preparation

- [ ] Backend API is deployed and accessible
- [ ] Backend health check endpoint works
- [ ] CORS is configured to allow Vercel domain
- [ ] API endpoints tested and working

---

## 🚀 Deployment

### Vercel Dashboard Method

- [ ] Log in to [vercel.com](https://vercel.com)
- [ ] Click "Add New..." → "Project"
- [ ] Import Git repository
- [ ] Configure project settings:
  - [ ] Framework Preset: **Vite**
  - [ ] Root Directory: **Instagram/client**
  - [ ] Build Command: `npm run build`
  - [ ] Output Directory: `dist`
  - [ ] Install Command: `npm install`

### Environment Variables

- [ ] Add `VITE_INSTAGRAM_API_BASE` = `https://tyla-social.onrender.com`
- [ ] Add `VITE_SNAPCHAT_API_BASE` = `https://tyla-social.onrender.com`
- [ ] Add `VITE_ENV` = `production`
- [ ] Select environments: **Production** and **Preview**

### Deploy

- [ ] Click "Deploy"
- [ ] Wait for build to complete (1-3 minutes)
- [ ] Deployment successful ✅

---

## ✅ Post-Deployment Verification

### Site Accessibility

- [ ] Homepage loads: `https://your-project.vercel.app`
- [ ] No JavaScript errors in console
- [ ] Site is responsive on mobile

### Routing

- [ ] Navigate to `/instagram`
- [ ] Navigate to `/snapchat`
- [ ] Refresh page (should not show 404)
- [ ] Back button works
- [ ] Direct URL access works

### Console Logs

Check browser console for:

- [ ] "Environment: PRODUCTION"
- [ ] "Instagram API Base URL: https://tyla-social.onrender.com"
- [ ] "Snapchat API Base URL: https://tyla-social.onrender.com"

### Instagram Features

- [ ] Manual URL download works
- [ ] Download links are generated correctly
- [ ] "Send to Telegram" button works (if configured)
- [ ] Target management works
- [ ] Polling controls work
- [ ] Storage management works

### Snapchat Features

- [ ] Manual username download works
- [ ] Gallery loads correctly
- [ ] Download type selector works
- [ ] Target management works
- [ ] Polling controls work
- [ ] Storage management works

### API Connectivity

- [ ] Frontend can reach backend
- [ ] No CORS errors
- [ ] API responses are correct
- [ ] Error messages display properly

---

## 🔧 Backend CORS Configuration

Update backend to allow Vercel domain:

```javascript
// Example for Node.js/Express
const cors = require("cors");

app.use(
  cors({
    origin: [
      "https://your-project.vercel.app",
      "https://your-project-*.vercel.app", // For preview deployments
      "http://localhost:5173", // Keep for local development
    ],
    credentials: true,
  })
);
```

- [ ] CORS configured in backend
- [ ] Backend redeployed with CORS changes
- [ ] CORS tested from Vercel deployment

---

## 🌐 DNS & Domain (Optional)

### Custom Domain Setup

- [ ] Domain purchased and ready
- [ ] Log in to Vercel Dashboard
- [ ] Navigate to: Project → Settings → Domains
- [ ] Add custom domain
- [ ] Configure DNS records as instructed
- [ ] Wait for DNS propagation (up to 48 hours)
- [ ] Verify SSL certificate is issued
- [ ] Test site on custom domain

---

## 📊 Monitoring & Analytics

### Vercel Analytics

- [ ] Enable Vercel Analytics in project settings
- [ ] Verify analytics data is collecting

### Error Tracking (Optional)

- [ ] Set up Sentry or similar
- [ ] Add Sentry DSN to environment variables
- [ ] Test error reporting
- [ ] Configure alerts

### Performance Monitoring (Optional)

- [ ] Enable Web Vitals tracking
- [ ] Set up performance alerts
- [ ] Configure performance budgets

---

## 🔄 Continuous Deployment

### Git Integration

- [ ] Verify automatic deployments are enabled
- [ ] Test: Push to main branch → Production deployment
- [ ] Test: Push to feature branch → Preview deployment
- [ ] Test: Pull request → Preview deployment with comment

### Deployment Protection (Optional)

- [ ] Enable password protection for preview deployments
- [ ] Configure deployment branch restrictions
- [ ] Set up approval workflow

---

## 📱 Browser Testing

Test on multiple browsers:

### Desktop

- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)

### Mobile

- [ ] Chrome Mobile (Android)
- [ ] Safari (iOS)
- [ ] Samsung Internet (Android)

### Functionality to Test

- [ ] All features work
- [ ] Responsive design looks good
- [ ] Touch interactions work
- [ ] No console errors

---

## 🔐 Security

### SSL/HTTPS

- [ ] Site loads over HTTPS
- [ ] No mixed content warnings
- [ ] SSL certificate is valid

### Environment Variables

- [ ] No sensitive data in client-side code
- [ ] Environment variables not visible in browser
- [ ] API keys not exposed

### Headers

- [ ] Security headers configured (Vercel provides defaults)
- [ ] Content Security Policy (optional)

---

## 📚 Documentation

### Update Documentation

- [ ] Add production URL to README
- [ ] Document deployment process
- [ ] Update API endpoint documentation
- [ ] Document environment variables

### Team Communication

- [ ] Notify team of deployment
- [ ] Share production URL
- [ ] Share Vercel dashboard access
- [ ] Document any issues encountered

---

## 🎯 Performance Optimization (Optional)

### Asset Optimization

- [ ] Images optimized (use WebP format)
- [ ] Enable Vercel Image Optimization
- [ ] Lazy load images
- [ ] Code splitting implemented

### Caching

- [ ] Asset caching headers configured (already in `vercel.json`)
- [ ] API response caching (if applicable)
- [ ] CDN configured (Vercel provides this)

### Bundle Size

- [ ] Check bundle size: Run `npm run build` and check output
- [ ] No unnecessary dependencies
- [ ] Code splitting implemented

---

## 🐛 Troubleshooting

If something goes wrong:

1. **Check build logs** in Vercel Dashboard
2. **Check browser console** for JavaScript errors
3. **Verify environment variables** are set correctly
4. **Test local build**: `npm run build && npm run preview`
5. **Check backend** is accessible and CORS is configured
6. **Review documentation**: [VERCEL_DEPLOYMENT.md](./VERCEL_DEPLOYMENT.md)

---

## 📞 Support Resources

- **Quick Start**: [QUICK_START.md](./QUICK_START.md)
- **Full Deployment Guide**: [VERCEL_DEPLOYMENT.md](./VERCEL_DEPLOYMENT.md)
- **Environment Setup**: [ENV_SETUP.md](./ENV_SETUP.md)
- **Vercel Documentation**: [vercel.com/docs](https://vercel.com/docs)
- **Vercel Support**: [vercel.com/support](https://vercel.com/support)

---

## ✨ Success Criteria

Your deployment is successful when:

✅ Site loads without errors
✅ All routes work correctly
✅ API calls succeed
✅ Instagram downloads work
✅ Snapchat downloads work
✅ Routing doesn't cause 404s
✅ Mobile experience is good
✅ No console errors
✅ Performance is acceptable

---

## 🎉 Congratulations!

Once all items are checked, your frontend is successfully deployed to Vercel!

**Next steps:**

1. Monitor initial usage
2. Gather user feedback
3. Plan future improvements
4. Set up monitoring and alerts
5. Consider A/B testing (Vercel Edge Config)

---

**Deployment Date**: ******\_******

**Deployed By**: ******\_******

**Production URL**: ******\_******

**Notes**: **********************\_**********************
