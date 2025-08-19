const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const fs = require('fs');
const path = require('path');
const https = require('https');

async function downloadStories(username, downloadPath = './downloads', userAgent = null) {
// Create download folder if it doesn't exist
if (!fs.existsSync(downloadPath)) fs.mkdirSync(downloadPath, { recursive: true });

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();

if (userAgent) await page.setUserAgent(userAgent);

try {
await page.goto('https://fastdl.app/en', { waitUntil: 'networkidle2', timeout: 30000 });

    // Ensure "Stories" tab is selected
    const storiesButton = await page.waitForSelector('button.tabs-component_button', { timeout: 10000 });
    const isActive = await page.evaluate(el => el.classList.contains('tabs-component_button--active'), storiesButton);
    if (!isActive) await storiesButton.click();
    await page.waitForTimeout(1000); // Brief wait for tab switch

    // Enter the story URL
    await page.waitForSelector('#search-form-input', { timeout: 10000 });
    const storyUrl = `https://www.instagram.com/stories/${username}/`;
    await page.type('#search-form-input', storyUrl);
    await page.click('button:has-text("Download")');  // Submit the form

    // Wait for results
    await page.waitForSelector('ul.profile-media-list', { timeout: 30000 });

    // Extract download hrefs
    const downloadUrls = await page.$$eval('a.button.button--filled.button_download', anchors => anchors.map(a => a.href));

    if (downloadUrls.length === 0) throw new Error('No download links found.');

    // Download each file
    for (let i = 0; i < downloadUrls.length; i++) {
      const url = downloadUrls[i];
      const filePath = path.join(downloadPath, `story_${i + 1}${path.extname(url.split('?')[0])}`);
      await downloadFile(url, filePath);
      console.log(`Downloaded: ${filePath}`);
    }

    return { success: true, files: downloadUrls.length };

} catch (error) {
console.error(`Error for ${username}: ${error.message}`);
return { success: false, error: error.message };
} finally {
await browser.close();
}
}

async function downloadFile(url, filePath) {
return new Promise((resolve, reject) => {
const file = fs.createWriteStream(filePath);
https.get(url, response => {
response.pipe(file);
file.on('finish', () => file.close(resolve));
}).on('error', err => {
fs.unlink(filePath, () => reject(err));
});
});
}

// Example usage
downloadStories('wolfytyla', './instagram_stories');
