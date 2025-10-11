# UptimeRobot Setup Guide

## Why UptimeRobot?

**Better than self-ping because:**

- ✅ External service (more reliable)
- ✅ Downtime monitoring & alerts
- ✅ No code changes needed
- ✅ Free tier: 50 monitors, 5-min intervals
- ✅ Prevents Render free tier timeout

## Quick Setup (5 minutes)

### 1. Create Account

- Go to: https://uptimerobot.com
- Sign up (free)
- Verify email

### 2. Add Monitor

1. Click **"+ Add New Monitor"**
2. Fill in:
   ```
   Monitor Type: HTTP(s)
   Friendly Name: Snapchat Service
   URL: https://tyla-social-snapchat-python.onrender.com/ping
   Monitoring Interval: 5 minutes
   ```
3. Click **"Create Monitor"**

### 3. Configure Alerts (Optional)

1. Go to **"My Settings"** → **"Alert Contacts"**
2. Add your email
3. Get notified if service goes down

### 4. Done! ✅

UptimeRobot will now:

- Ping your service every 5 minutes
- Keep Render from spinning down
- Alert you if service is down
- Provide uptime statistics

## What It Does

```
Every 5 minutes:
UptimeRobot → GET /ping → Your Service
              ↓
        Render sees activity
              ↓
        Service stays alive ✅
```

## Verify It's Working

### Check Render Logs

You should see `/ping` requests every 5 minutes:

```
[timestamp] GET /ping (but won't be logged - we silenced it)
```

### Check UptimeRobot Dashboard

- Monitor status: **Up** (green)
- Uptime: **100%** (ideally)
- Response time: < 1 second

### Check for SIGTERM

After 1-2 hours, check Render logs:

- ✅ Should see **NO** "Received signal 15" messages
- ✅ Service should run continuously

## Free Tier Limits

**UptimeRobot Free:**

- 50 monitors (you only need 1)
- 5-minute intervals (perfect)
- Email alerts
- 2-month logs

**Paid ($7/month):**

- 1-minute intervals
- SMS alerts
- Unlimited logs
- Advanced features

Free tier is **more than enough** for this!

## Alternative Services

If you prefer something else:

### 1. **Cronitor** (https://cronitor.io)

- Free tier: 5 monitors
- Similar to UptimeRobot

### 2. **Better Uptime** (https://betteruptime.com)

- Free tier: 10 monitors
- Modern UI

### 3. **Pingdom** (https://pingdom.com)

- Free trial, then paid
- More features

### 4. **Simple Cron Job**

```bash
# Your own server with cron
*/5 * * * * curl https://tyla-social-snapchat-python.onrender.com/ping
```

## Troubleshooting

### Monitor Shows "Down"

1. Check if Render service is actually running
2. Verify URL is correct
3. Check `/ping` endpoint works: `curl https://your-url.com/ping`

### Still Getting SIGTERM

1. Verify UptimeRobot is actually pinging (check logs)
2. Interval might be too long (try upgrading to 1-min)
3. Disk usage still high? (check aggressive cleanup is working)
4. Consider Render paid plan ($7/month)

### UptimeRobot Not Pinging

1. Check monitor is "paused" - unpause it
2. Verify email is confirmed
3. Check account didn't hit limits

## Cost Comparison

| Option               | Cost  | Reliability  | Extras             |
| -------------------- | ----- | ------------ | ------------------ |
| **UptimeRobot Free** | $0    | ✅ High      | Monitoring, alerts |
| Self-ping (code)     | $0    | ⚠️ Medium    | None               |
| Render Paid          | $7/mo | ✅✅ Highest | No timeout at all  |
| UptimeRobot Paid     | $7/mo | ✅ High      | 1-min checks, SMS  |

**Recommendation:** Use **UptimeRobot Free** - best balance of cost and reliability!

## What We Kept from Previous Fixes

✅ **Aggressive disk cleanup** - Still in code
✅ **Graceful shutdown** - Still in code
✅ **Health endpoints** - Still in code
✅ **Error handling** - Still in code

We ONLY removed the self-ping job since UptimeRobot does it better.

---

**Setup Time:** 5 minutes  
**Cost:** $0  
**Maintenance:** None  
**Reliability:** ⭐⭐⭐⭐⭐
