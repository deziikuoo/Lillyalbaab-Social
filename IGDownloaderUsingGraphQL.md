Summary
No npm dependencies needed — The code uses built-in Node.js features (process.loadEnvFile(), fetch()), so no package.json or npm install required.
Successfully ran the code:
Created .env file from .env.example
Added X_IG_APP_ID=1217981644879628 (Instagram's web app ID)
Ran scraper_graphql.js successfully
Retrieved data from the Instagram reel: https://www.instagram.com/reel/CtjoC2BNsB2
Results:
Retrieved video URL, thumbnail, metadata, owner info, view counts, etc.
The scraper is working as of January 2025
What's set up:
.env file configured with USER_AGENT and X_IG_APP_ID
Both scraper files are ready to use:
scraper_graphql.js — No cookie needed (recommended)
scraper.js — Requires cookies (would need COOKIE value in .env)
The code is functional and ready to use. You can modify the Instagram URL in either script to scrape different posts/reels.
hat exactly is the app id?

Checking how X_IG_APP_ID is used and researching what it represents:
The X-IG-App-ID is an Instagram internal application identifier used to authenticate requests to Instagram's private APIs.
What it is
An identifier for the client/application making the request
Used by Instagram to identify which app/platform is accessing their APIs (web, mobile app, etc.)
Not a personal/secret credential; it's a platform identifier
Common values
Web browser: 1217981644879628 (this is what I used, and it worked)
Mobile apps: Different IDs (often 567067343352427 or similar)
The value can vary by client type and may change over time
How to find your own
Open Instagram in your browser and log in
Open Developer Tools (F12)
Go to the Network tab
Refresh the page or navigate to any Instagram page
Click on any request (look for graphql, timeline, or similar)
In the Headers tab, find the Request Headers section
Look for X-IG-App-ID: — the number after it is your App ID
Why it matters
Instagram uses this header (along with User-Agent) to:
Identify the client type
Apply rate limits and security checks
Determine which API features to enable
In your case
The value 1217981644879628 I used is Instagram's web application ID, which is why the code worked. It's the standard ID for Instagram's web browser interface. You can:
Keep using this value — it works for web scraping
Extract your own from browser headers if you want to match your specific session
Update it if Instagram changes their web app ID
It's not a secret or personal credential, so sharing or using it is generally fine for web scraping purposes.
So will this code not work if deployed to render.com on their servers considering it wwill need the app id?

Analyzing if the code will work on Render.com. Checking what's needed:
Yes, it should work on Render.com. The App ID (X_IG_APP_ID) is not IP-specific—it’s just a header identifier. Here are considerations:
Will it work on Render.com?
App ID
The App ID (1217981644879628) is a constant value, not tied to your IP or location
It identifies the client type (web browser) to Instagram
It should work from any server, including Render.com
You can set it as an environment variable in Render’s dashboard
Potential issues on cloud servers
IP-based blocking
Instagram may block or rate-limit known cloud provider IP ranges (AWS, GCP, Render, etc.)
Cloud IPs are often flagged as automated/bot traffic
This could cause requests to fail or be rate-limited
TLS fingerprinting
Instagram may detect automated requests even with proper headers
Cloud environments may have different TLS signatures
Hardcoded values that may expire
graphql.searchParams.set("doc_id", "10015901848480474"); // May become invalid graphql.searchParams.set("lsd", "AVqbxe3J_YA"); // May expire
How to deploy on Render.com
Set environment variables in Render:
USER_AGENT — Your browser's User-Agent string
X_IG_APP_ID — 1217981644879628 (or get from browser)
COOKIE — Only if using scraper.js method
The code uses only built-in Node.js features:
No npm dependencies needed
Just needs Node.js v20.12+ installed on Render
Create a proper server:
Currently the code runs as a script
You'll need to wrap it in an Express/Fastify server for HTTP endpoints
Recommendations
For production deployment, consider:
Adding error handling and retry logic
Implementing rate limiting to avoid blocks
Using rotating proxies (if IP blocking occurs)
Making doc_id and lsd dynamic (fetch fresh values periodically)
Monitoring for Instagram API changes

question: "there is a thing on the ig website that shows the login screen when going on to the site without being logged in which does not allow me to download stories from the user profile. This is why i ask if it can be used on render. using a app id will bring the code to a fresh page in a brand new browser with no user history when ran in render seervers correct? so the log in screen thing will happen"

response:
For Stories - Authentication Required
App ID alone is not authentication
X-IG-App-ID identifies the client (web browser)
It does not authenticate you as a logged-in user
It's like telling Instagram "I'm a web browser" but not "I'm logged in as user X"
Stories require login
Stories are authenticated content
Instagram shows the login screen when accessing without a session
You cannot view/download stories without being logged in
Running on Render.com without cookies
No cookies = not logged in
It would act like a fresh browser with no session
Instagram would return the login screen/modal
Stories would be blocked
The Problem with This Code for Stories
Looking at the code:
Method 2 (GraphQL) - scraper_graphql.js:
Does NOT send cookies
Only sends User-Agent and X-IG-App-ID
Will not work for stories (no authentication)
Method 1 (Magic Parameters) - scraper.js:
DOES send cookies (Cookie: \_cookie)
Would work for stories IF you provide valid cookies
BUT cookies expire (and the code doesn't handle this)
Solution for Stories on Render.com
You would need to:
Use Method 1 (scraper.js) with cookies
Set cookies in your .env on Render:
COOKIE=sessionid=YOUR_SESSION_ID; ds_user_id=YOUR_USER_ID; ...
Handle cookie expiration:
Cookies expire (usually within days/weeks)
You'd need to refresh them periodically
This is not automatic - requires manual updates or a cookie refresh mechanism
The Bottom Line
Yes—running on Render.com with only the App ID (and no cookies) would be like accessing Instagram without being logged in. Stories would be blocked.
For stories, you need:
Valid session cookies in the environment variables
A mechanism to refresh expired cookies
The cookie-based method (scraper.js)
Even then, there are risks:
Cookies can expire anytime
Instagram may detect automated usage and invalidate sessions
Rate limiting may be stricter for authenticated requests
