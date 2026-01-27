# Telegram Bot Setup Guide for Lillyalbaab Social

This guide will walk you through setting up a new Telegram bot and channel for the Lillyalbaab Social project.

## Step 1: Create a Telegram Bot

1. **Open Telegram** and search for `@BotFather`
2. **Start a conversation** with BotFather by clicking "Start"
3. **Create a new bot** by sending the command:
   ```
   /newbot
   ```
4. **Choose a name** for your bot (e.g., "Lillyalbaab Social Bot")
5. **Choose a username** for your bot (must end with `bot`, e.g., `lillyalbaab_social_bot`)
6. **Copy the bot token** - BotFather will give you a token that looks like:
   ```
   123456789:ABCdefGHIjklMNOpqrsTUVwxyz
   ```
   ⚠️ **IMPORTANT**: Save this token securely! You'll need it for the environment variables.

## Step 2: Create a Telegram Channel

1. **Open Telegram** and click the menu (☰) in the top left
2. **Click "New Channel"**
3. **Enter a name** for your channel (e.g., "Lillyalbaab Social")
4. **Add a description** (optional)
5. **Choose channel type**:
   - **Public**: Anyone can find it via search (recommended for public content)
   - **Private**: Only people with invite link can join
6. **Create the channel**

## Step 3: Add Bot as Administrator

1. **Open your channel** in Telegram
2. **Click on the channel name** at the top
3. **Click "Administrators"** or "Manage Channel"
4. **Click "Add Administrator"**
5. **Search for your bot** (the username you created, e.g., `@lillyalbaab_social_bot`)
6. **Select your bot** and click "Add"
7. **Grant permissions**:
   - ✅ **Post Messages** (required)
   - ✅ **Edit Messages** (optional, but recommended)
   - ❌ **Delete Messages** (optional)
   - ❌ **Invite Users** (optional)
   - ❌ **Restrict Members** (optional)
8. **Click "Done"**

## Step 4: Get Channel ID

The channel ID is needed for the `TELEGRAM_CHANNEL_ID` environment variable.

### Method 1: Using a Bot to Get Channel ID

1. **Send a message** to your channel (any message)
2. **Forward that message** to `@userinfobot` or `@getidsbot`
3. The bot will reply with the channel ID (it will be a negative number like `-1001234567890`)

### Method 2: Using Telegram Web

1. **Open** [https://web.telegram.org](https://web.telegram.org)
2. **Open your channel**
3. **Look at the URL** - it will contain the channel ID
4. **Or use this method**:
   - Add `@RawDataBot` to your channel
   - It will send you the channel information including the ID

### Method 3: Using API (Programmatic)

1. **Send a message** to your channel from the bot
2. **Use this API call** (replace `YOUR_BOT_TOKEN`):
   ```
   https://api.telegram.org/botYOUR_BOT_TOKEN/getUpdates
   ```
3. **Look for** `"chat":{"id":-1001234567890}` in the response
4. The ID will be a negative number starting with `-100`

## Step 5: Configure Environment Variables

Add these to your `.env` files and Render/Vercel deployment:

### For Instagram Service (Render)

```env
TELEGRAM_BOT_TOKEN=YOUR_BOT_TOKEN_HERE
TELEGRAM_CHANNEL_ID=YOUR_CHANNEL_ID_HERE
TELEGRAM_AUTH=true
```

### For Snapchat Service (Render - if using)

```env
TELEGRAM_BOT_TOKEN=YOUR_BOT_TOKEN_HERE
TELEGRAM_CHANNEL_ID=YOUR_CHANNEL_ID_HERE
TELEGRAM_AUTH=true
```

### For Local Development

Create/update `.env` files:

**`Instagram/.env`**:
```env
TELEGRAM_BOT_TOKEN=YOUR_BOT_TOKEN_HERE
TELEGRAM_CHANNEL_ID=YOUR_CHANNEL_ID_HERE
TELEGRAM_AUTH=true
```

**`Snapchat-Service/server/.env`**:
```env
TELEGRAM_BOT_TOKEN=YOUR_BOT_TOKEN_HERE
TELEGRAM_CHANNEL_ID=YOUR_CHANNEL_ID_HERE
TELEGRAM_AUTH=true
```

## Step 6: Test the Setup

1. **Start your services** locally or deploy to Render
2. **Trigger a test download** (manual download or polling)
3. **Check your Telegram channel** - you should see the content appear
4. **Verify**:
   - ✅ Bot can post messages
   - ✅ Media (photos/videos) are sent correctly
   - ✅ Captions include "Lillyalbaab Social" branding

## Troubleshooting

### Bot can't send messages
- **Check**: Bot is added as administrator
- **Check**: Bot has "Post Messages" permission
- **Check**: Channel is not restricted

### Channel ID not working
- **Verify**: Channel ID is negative (starts with `-`)
- **Verify**: Bot is in the channel
- **Try**: Removing and re-adding the bot

### Token not working
- **Verify**: Token is copied correctly (no extra spaces)
- **Verify**: Bot hasn't been deleted/recreated
- **Try**: Creating a new bot and getting a new token

### Messages not appearing
- **Check**: Service logs for errors
- **Check**: Environment variables are set correctly
- **Check**: Network connectivity from server to Telegram API

## Security Notes

⚠️ **IMPORTANT SECURITY TIPS**:

1. **Never commit** your bot token or channel ID to Git
2. **Use environment variables** for all sensitive data
3. **Rotate tokens** if they're accidentally exposed
4. **Use different bots** for development and production if possible
5. **Keep channel private** if content is sensitive

## Next Steps

After setting up Telegram:

1. ✅ Update `render.yaml` with your bot token and channel ID
2. ✅ Deploy to Render with new environment variables
3. ✅ Test with a manual download
4. ✅ Enable automatic polling
5. ✅ Monitor the channel for new content

## Support

If you encounter issues:
- Check the service logs on Render
- Verify all environment variables are set
- Test the bot token with: `https://api.telegram.org/botYOUR_TOKEN/getMe`
- Test channel access with: `https://api.telegram.org/botYOUR_TOKEN/getChat?chat_id=YOUR_CHANNEL_ID`
