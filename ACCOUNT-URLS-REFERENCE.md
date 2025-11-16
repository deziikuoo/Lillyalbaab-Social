# Account URLs Reference

This document lists the correct service URLs for both Render accounts. These URLs are used by the rotation controller to automatically switch Vercel environment variables during account rotation.

## Account A (Account 1) URLs

- **Instagram Service:** `https://tyla-social.onrender.com`
- **Snapchat Service:** `https://tyla-social-snapchat-python.onrender.com`

## Account B (Account 2) URLs

- **Instagram Service:** `https://tyla-social-instagram2.onrender.com`
- **Snapchat Service:** `https://tyla-social-snapchat.onrender.com`

---

## GitHub Secrets Required

Add these secrets in GitHub (Settings → Secrets and variables → Actions):

### Account A Secrets:
- `INSTAGRAM_ACCOUNT1_URL` = `https://tyla-social.onrender.com`
- `SNAPCHAT_ACCOUNT1_URL` = `https://tyla-social-snapchat-python.onrender.com`

### Account B Secrets:
- `INSTAGRAM_ACCOUNT2_URL` = `https://tyla-social-instagram2.onrender.com`
- `SNAPCHAT_ACCOUNT2_URL` = `https://tyla-social-snapchat.onrender.com`

---

## Local Development (.env file)

For local development, use Account A URLs (or localhost):

```env
VITE_INSTAGRAM_API_BASE=https://tyla-social.onrender.com
VITE_SNAPCHAT_API_BASE=https://tyla-social-snapchat-python.onrender.com
```

---

## How Rotation Works

1. **Rotation Controller** (GitHub Actions) detects suspension email
2. **Suspends** exhausted account's services
3. **Resumes** other account's services
4. **Updates Vercel** environment variables automatically:
   - `VITE_INSTAGRAM_API_BASE` → Points to active account's Instagram URL
   - `VITE_SNAPCHAT_API_BASE` → Points to active account's Snapchat URL
5. **Toggles UptimeRobot** monitors (pause exhausted, activate active)

No manual intervention needed after initial setup!

