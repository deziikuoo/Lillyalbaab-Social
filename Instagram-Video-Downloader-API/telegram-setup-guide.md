# Telegram Bot Setup Guide

## Current Issue
The bot is configured but getting "Bad Request: chat not found" error. This means the bot cannot access the specified chat/channel.

## Step-by-Step Fix

### 1. Verify Bot Token
✅ Your bot token is working: `@TylaIG_bot (Tyla IG Kapturez)`

### 2. Fix Channel/Chat Access

#### Option A: Use a Private Chat (Easiest)
1. Open Telegram
2. Search for your bot: `@TylaIG_bot`
3. Start a conversation with the bot
4. Send any message to the bot
5. Get your chat ID by visiting: `https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates`
6. Look for the `chat.id` in the response (it will be a number like `123456789`)
7. Update your `.env` file:
   ```
   TELEGRAM_CHANNEL_ID=123456789
   ```

#### Option B: Use a Channel
1. Create a new channel in Telegram
2. Add your bot `@TylaIG_bot` as an admin
3. Give the bot permission to post messages
4. Get the channel ID:
   - Post a message in the channel
   - Visit: `https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates`
   - Look for `channel_post` and note the `chat.id` (will be negative like `-1001234567890`)
5. Update your `.env` file with the channel ID

#### Option C: Use a Group
1. Create a new group in Telegram
2. Add your bot `@TylaIG_bot` to the group
3. Get the group ID:
   - Send a message in the group
   - Visit: `https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates`
   - Look for the `chat.id` in the response
4. Update your `.env` file with the group ID

### 3. Test the Fix
Run the test script after updating the channel ID:
```bash
node test-telegram.js
```

### 4. Common Channel ID Formats
- **Private chat**: `123456789` (positive number)
- **Group**: `-123456789` (negative number)
- **Channel**: `-1001234567890` (negative number starting with -100)

### 5. Get Updates URL
Replace `<YOUR_BOT_TOKEN>` with your actual token:
```
https://api.telegram.org/bot8033935478:AAFCuh5q0.../getUpdates
```

## Quick Fix Commands

### Get current updates:
```bash
curl "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates"
```

### Test with a new chat ID:
```bash
node test-telegram.js
```

## Troubleshooting

### If still getting "chat not found":
1. Make sure the bot is actually added to the chat/channel
2. Verify the bot has permission to send messages
3. Try sending a message to the bot first (for private chats)
4. Check that the channel ID format is correct

### If bot token is invalid:
1. Create a new bot with @BotFather
2. Update the `TELEGRAM_BOT_TOKEN` in your `.env` file

### If channel ID is wrong:
1. Use the getUpdates method above to find the correct ID
2. Make sure to use the exact number format (positive/negative)
