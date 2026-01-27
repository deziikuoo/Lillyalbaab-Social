# Lillyalbaab Social - Deployment Checklist

This checklist covers all steps needed to deploy the Lillyalbaab Social project for the first time.

## Pre-Deployment Setup

### ✅ 1. Telegram Bot & Channel Setup
- [ ] Created Telegram bot via @BotFather
- [ ] Saved bot token securely
- [ ] Created Telegram channel
- [ ] Added bot as channel administrator
- [ ] Obtained channel ID (negative number)
- [ ] Tested bot can send messages to channel
- [ ] See `TELEGRAM_SETUP_GUIDE.md` for detailed instructions

### ✅ 2. Environment Variables Preparation
- [ ] Telegram Bot Token: `TELEGRAM_BOT_TOKEN`
- [ ] Telegram Channel ID: `TELEGRAM_CHANNEL_ID`
- [ ] Supabase URL: `SUPABASE_URL`
- [ ] Supabase Key: `SUPABASE_KEY`
- [ ] Instagram Target Username: `TARGET_USERNAMES=lillyalbaab`
- [ ] Snapchat Target Username: `SNAPCHAT_TARGET_USERNAME` (leave empty if no Snapchat)

### ✅ 3. Code Updates Verification
- [ ] All "Tyla" references changed to "Lillyalbaab"
- [ ] All "tyla-social" URLs changed to "lillyalbaab-social"
- [ ] All "wolftyla" references changed to "lillyalbaab"
- [ ] Telegram captions updated to "Lillyalbaab Social"
- [ ] Service names updated in all config files

## Render Deployment

### ✅ 4. Instagram Service (Render)
- [ ] Create new Render web service
- [ ] Name: `lillyalbaab-social`
- [ ] Connect GitHub repository
- [ ] Set build command: `cd Instagram && chmod +x install-chrome-render.sh && ./install-chrome-render.sh && npm install`
- [ ] Set start command: `cd Instagram && npm start`
- [ ] Add environment variables:
  - [ ] `NODE_ENV=production`
  - [ ] `PORT=3000`
  - [ ] `TARGET_USERNAMES=lillyalbaab`
  - [ ] `TELEGRAM_BOT_TOKEN=<your_token>`
  - [ ] `TELEGRAM_CHANNEL_ID=<your_channel_id>`
  - [ ] `TELEGRAM_AUTH=true`
  - [ ] `SUPABASE_URL=<your_supabase_url>`
  - [ ] `SUPABASE_KEY=<your_supabase_key>`
  - [ ] `SNAPCHAT_SERVICE_URL=https://lillyalbaab-social-snapchat.onrender.com` (if using Snapchat)
  - [ ] `PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=false`
  - [ ] `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium`
  - [ ] `PUPPETEER_CACHE_DIR=/opt/render/project/src/data/chrome`
  - [ ] `USER_AGENT=Mozilla/5.0 (Windows NT 10.0; Win64; x64)`
  - [ ] `X_IG_APP_ID=936619743392459`
  - [ ] `TZ=America/New_York`
- [ ] Deploy service
- [ ] Verify health endpoint: `https://lillyalbaab-social.onrender.com/health`
- [ ] Check logs for successful startup

### ✅ 5. Snapchat Service (Render - Optional)
**Note**: Skip this if Lillyalbaab doesn't have a Snapchat account

- [ ] Create new Render web service
- [ ] Name: `lillyalbaab-social-snapchat`
- [ ] Connect GitHub repository
- [ ] Set build command: `cd Snapchat-Service && pip install -r requirements.txt`
- [ ] Set start command: `cd Snapchat-Service && uvicorn server.main:app --host 0.0.0.0 --port $PORT`
- [ ] Add environment variables:
  - [ ] `API_HOST=127.0.0.1`
  - [ ] `API_PORT=8000`
  - [ ] `PORT=8000`
  - [ ] `TELEGRAM_BOT_TOKEN=<your_token>`
  - [ ] `TELEGRAM_CHANNEL_ID=<your_channel_id>`
  - [ ] `TELEGRAM_AUTH=true`
  - [ ] `SNAPCHAT_TARGET_USERNAME=<username>` (or leave empty to disable)
  - [ ] `DOWNLOADS_DIRECTORY=downloads`
  - [ ] `FRONTEND_URL=https://lillyalbaab-social.vercel.app`
  - [ ] `SUPABASE_URL=<your_supabase_url>`
  - [ ] `SUPABASE_KEY=<your_supabase_key>`
- [ ] Deploy service
- [ ] Verify health endpoint: `https://lillyalbaab-social-snapchat.onrender.com/health`

## Vercel Deployment

### ✅ 6. Frontend (Vercel)
- [ ] Create new Vercel project
- [ ] Name: `lillyalbaab-social`
- [ ] Connect GitHub repository
- [ ] Set root directory: `Instagram/client`
- [ ] Set build command: `npm run build`
- [ ] Set output directory: `dist`
- [ ] Add environment variables:
  - [ ] `VITE_INSTAGRAM_API_BASE=https://lillyalbaab-social.onrender.com`
  - [ ] `VITE_SNAPCHAT_API_BASE=https://lillyalbaab-social.onrender.com` (or Snapchat service URL)
- [ ] Deploy
- [ ] Verify frontend loads: `https://lillyalbaab-social.vercel.app`
- [ ] Test Instagram download functionality
- [ ] Test target management
- [ ] Test polling controls

## Post-Deployment Testing

### ✅ 7. Functional Testing
- [ ] **Instagram Manual Download**:
  - [ ] Paste Instagram post URL
  - [ ] Verify download links appear
  - [ ] Test download functionality
  
- [ ] **Instagram Polling**:
  - [ ] Set target to `lillyalbaab`
  - [ ] Start polling
  - [ ] Verify polling status shows active
  - [ ] Wait for poll cycle (or trigger manual poll)
  - [ ] Check Telegram channel for new content
  - [ ] Verify captions show "Lillyalbaab Social"

- [ ] **Telegram Integration**:
  - [ ] Test manual send to Telegram
  - [ ] Verify media appears in channel
  - [ ] Check captions are correct
  - [ ] Verify "Lillyalbaab Social" branding

- [ ] **Snapchat (if enabled)**:
  - [ ] Set Snapchat target username
  - [ ] Test manual download
  - [ ] Test polling (if username configured)

### ✅ 8. Monitoring Setup
- [ ] Set up UptimeRobot or similar for health checks
- [ ] Monitor Instagram service: `https://lillyalbaab-social.onrender.com/health`
- [ ] Monitor Snapchat service (if enabled): `https://lillyalbaab-social-snapchat.onrender.com/health`
- [ ] Set up alerts for service downtime
- [ ] Monitor Telegram channel for content delivery

### ✅ 9. Documentation Updates
- [ ] Update README.md with new service URLs
- [ ] Update any deployment guides
- [ ] Document new Telegram channel
- [ ] Update service URLs in documentation files

## Configuration Files Updated

### ✅ 10. Verify All Config Files
- [ ] `package.json` - Project name updated
- [ ] `Instagram/render.yaml` - Service name and env vars updated
- [ ] `Instagram/index.js` - URLs and branding updated
- [ ] `Instagram/client/src/App.tsx` - API URLs updated
- [ ] `Instagram/client/src/snapchat/*.tsx` - API URLs updated
- [ ] `Snapchat-Service/server/main.py` - CORS origins updated
- [ ] All `.env` files updated (if using locally)

## Troubleshooting

### Common Issues

**Service won't start:**
- Check environment variables are set correctly
- Verify build commands are correct
- Check Render logs for errors

**Telegram not working:**
- Verify bot token is correct
- Check channel ID is negative number
- Ensure bot is channel administrator
- Test token: `https://api.telegram.org/bot<TOKEN>/getMe`

**Polling not working:**
- Check `TARGET_USERNAMES` is set correctly
- Verify service is running
- Check logs for polling errors
- Test manual poll endpoint

**Frontend can't connect:**
- Verify CORS origins are correct
- Check API base URLs in environment variables
- Verify backend services are running
- Check browser console for errors

## Next Steps After Deployment

1. ✅ Monitor first few poll cycles
2. ✅ Verify content appears in Telegram channel
3. ✅ Check service logs for any errors
4. ✅ Optimize polling intervals if needed
5. ✅ Set up automated backups (if needed)
6. ✅ Document any custom configurations

## Support Resources

- **Telegram Setup**: See `TELEGRAM_SETUP_GUIDE.md`
- **Render Docs**: https://render.com/docs
- **Vercel Docs**: https://vercel.com/docs
- **Service Logs**: Check Render dashboard
- **Health Endpoints**: Use for monitoring

---

**Last Updated**: January 26, 2026
**Project**: Lillyalbaab Social
**Status**: Ready for Deployment
