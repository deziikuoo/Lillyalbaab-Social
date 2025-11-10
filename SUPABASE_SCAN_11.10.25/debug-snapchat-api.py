"""
Debug tool to see exactly what Snapchat's API returns
This will help identify why a specific snap is not being processed
"""

import asyncio
import aiohttp
import json
import re
from loguru import logger
import sys

# Configure logger
logger.remove()
logger.add(sys.stdout, format="{message}", level="INFO")

async def fetch_snapchat_api(username):
    """Fetch and display raw Snapchat API response"""
    
    endpoint = f"https://www.snapchat.com/add/{username}/"
    regexp = r'<script\s*id="__NEXT_DATA__"\s*type="application\/json">([^<]+)</script>'
    
    logger.info("=" * 80)
    logger.info(f"🔍 Fetching Snapchat API for: @{username}")
    logger.info(f"📡 URL: {endpoint}")
    logger.info("=" * 80)
    
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(
                endpoint,
                headers={
                    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
                }
            ) as response:
                if response.status != 200:
                    logger.error(f"❌ API returned status {response.status}")
                    return
                
                logger.info(f"✅ API Response: {response.status}")
                
                html = await response.text()
                logger.info(f"📄 HTML Length: {len(html)} characters")
                
                # Extract JSON
                json_match = re.findall(regexp, html)
                if not json_match:
                    logger.error("❌ Could not find __NEXT_DATA__ JSON in response")
                    logger.info("\n🔍 Searching for alternative JSON patterns...")
                    
                    # Try to find any JSON-like content
                    script_tags = re.findall(r'<script[^>]*>([^<]*)</script>', html)
                    for i, script in enumerate(script_tags[:5]):  # First 5 scripts
                        if 'story' in script.lower() or 'snap' in script.lower():
                            logger.info(f"\n📜 Script {i+1} (contains 'story' or 'snap'):")
                            logger.info(script[:500])
                    return
                
                # Parse JSON
                data = json.loads(json_match[0])
                logger.info("✅ JSON parsed successfully")
                
                # Navigate to pageProps
                if "props" not in data or "pageProps" not in data["props"]:
                    logger.error("❌ Unexpected JSON structure - no props.pageProps")
                    logger.info(f"Keys in response: {list(data.keys())}")
                    return
                
                page_props = data["props"]["pageProps"]
                logger.info(f"\n📊 pageProps keys: {list(page_props.keys())}")
                
                # Check for story data
                if "story" in page_props:
                    story_data = page_props["story"]
                    logger.info(f"\n✅ Found 'story' key!")
                    logger.info(f"   Story keys: {list(story_data.keys())}")
                    
                    if "snapList" in story_data:
                        snap_list = story_data["snapList"]
                        logger.info(f"\n🎯 SNAP LIST FOUND: {len(snap_list)} snaps")
                        logger.info("=" * 80)
                        
                        for i, snap in enumerate(snap_list, 1):
                            logger.info(f"\n📱 Snap {i}:")
                            logger.info(f"   Snap ID: {snap.get('snapId', {}).get('value', 'N/A')}")
                            logger.info(f"   Media Type: {snap.get('snapMediaType', 'N/A')}")
                            logger.info(f"   Timestamp: {snap.get('timestampInSec', {}).get('value', 'N/A')}")
                            
                            # Check for media URLs
                            if 'snapUrls' in snap:
                                urls = snap['snapUrls']
                                media_url = urls.get('mediaUrl', 'N/A')
                                preview_url = urls.get('mediaPreviewUrl', 'N/A')
                                logger.info(f"   Media URL: {media_url[:100]}...")
                            
                            # Full snap data (truncated)
                            snap_json = json.dumps(snap, indent=2)
                            if len(snap_json) > 500:
                                logger.info(f"   Full data (first 500 chars): {snap_json[:500]}...")
                            else:
                                logger.info(f"   Full data: {snap_json}")
                    else:
                        logger.warning("⚠️ Story exists but no 'snapList' key")
                        logger.info(f"   Available keys: {list(story_data.keys())}")
                else:
                    logger.warning("⚠️ No 'story' key in pageProps")
                    logger.info("   This user may not have any active stories")
                
                # Check for highlights
                if "curatedHighlights" in page_props:
                    highlights = page_props["curatedHighlights"]
                    logger.info(f"\n📚 Curated Highlights: {len(highlights)} found")
                
                if "spotHighlights" in page_props:
                    spot_highlights = page_props["spotHighlights"]
                    logger.info(f"✨ Spot Highlights: {len(spot_highlights)} found")
                
                # Check for user profile
                if "userProfile" in page_props:
                    user_profile = page_props["userProfile"]
                    logger.info(f"\n👤 User Profile found")
                    if "$case" in user_profile:
                        case = user_profile["$case"]
                        logger.info(f"   Profile type: {case}")
                
                # Save full response to file
                output_file = f"snapchat_api_debug_{username}.json"
                with open(output_file, 'w', encoding='utf-8') as f:
                    json.dump(data, f, indent=2, ensure_ascii=False)
                logger.info(f"\n💾 Full API response saved to: {output_file}")
                
                logger.info("\n" + "=" * 80)
                logger.info("🎯 ANALYSIS COMPLETE")
                logger.info("=" * 80)
                
    except Exception as e:
        logger.error(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()

async def main():
    if len(sys.argv) < 2:
        logger.info("Usage: python debug-snapchat-api.py <username>")
        logger.info("Example: python debug-snapchat-api.py wolftyla")
        sys.exit(1)
    
    username = sys.argv[1].replace('@', '')
    await fetch_snapchat_api(username)

if __name__ == "__main__":
    asyncio.run(main())

