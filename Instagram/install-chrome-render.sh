#!/bin/bash
# install-chrome-render.sh
# Install Chromium and dependencies for Puppeteer on Render

echo "📦 Installing Chromium dependencies for Render..."

# Update package list
apt-get update

# Install Chromium and required dependencies
apt-get install -y \
    chromium \
    chromium-sandbox \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    fonts-thai-tlwg \
    fonts-kacst \
    fonts-freefont-ttf

echo "✅ Chromium dependencies installed"

# Install Puppeteer Chrome
echo "📦 Installing Puppeteer Chrome..."
npx puppeteer browsers install chrome

echo "✅ Setup complete!"

