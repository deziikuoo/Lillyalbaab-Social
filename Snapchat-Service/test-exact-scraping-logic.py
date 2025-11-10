"""
Test the exact scraping logic used by the production code
This mimics snapchat_dl.py's _web_fetch_story and _api_response methods
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

async def test_scraping_logic(username):
    """
    Exact replica of the production code's scraping logic
    From snapchat_dl.py lines 119-173
    """
    
    # EXACT same endpoint as production code (line 119)
    endpoint_web = "https://www.snapchat.com/add/{}/"
    
    # EXACT same regex as production code (line 120-122)
    regexp_web_json = r'<script\s*id="__NEXT_DATA__"\s*type="application\/json">([^<]+)</script>'
    
    logger.info("=" * 80)
    logger.info("🔬 Testing EXACT Production Scraping Logic")
    logger.info("=" * 80)
    logger.info(f"\n📍 Username: @{username}")
    logger.info(f"📍 Endpoint: {endpoint_web.format(username)}")
    logger.info(f"📍 Regex: {regexp_web_json}")
    
    try:
        # Step 1: _api_response method (lines 125-136)
        logger.info("\n" + "=" * 80)
        logger.info("STEP 1: Making HTTP Request (same as _api_response)")
        logger.info("=" * 80)
        
        async with aiohttp.ClientSession() as session:
            web_url = endpoint_web.format(username)
            logger.info(f"🌐 Fetching: {web_url}")
            
            async with session.get(
                web_url,
                headers={
                    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
                }
            ) as response:
                if response.status != 200:
                    logger.error(f"❌ API returned status {response.status}")
                    return
                
                logger.info(f"✅ Response status: {response.status}")
                html = await response.text()
                logger.info(f"📄 HTML length: {len(html)} characters")
        
        # Step 2: Extract JSON (line 140)
        logger.info("\n" + "=" * 80)
        logger.info("STEP 2: Extracting JSON from HTML (same as _web_fetch_story)")
        logger.info("=" * 80)
        
        response_json_raw = re.findall(regexp_web_json, html)
        logger.info(f"🔍 Regex matches found: {len(response_json_raw)}")
        
        if not response_json_raw:
            logger.error("❌ No JSON found in HTML!")
            logger.info("\n🔍 Searching for script tags...")
            all_scripts = re.findall(r'<script[^>]*id="([^"]*)"[^>]*>', html)
            logger.info(f"   Found {len(all_scripts)} script tags with IDs: {all_scripts[:10]}")
            return
        
        # Step 3: Parse JSON (line 142)
        logger.info("\n" + "=" * 80)
        logger.info("STEP 3: Parsing JSON")
        logger.info("=" * 80)
        
        response_json = json.loads(response_json_raw[0])
        logger.info("✅ JSON parsed successfully")
        
        # Step 4: Navigate to pageProps (lines 143-157)
        logger.info("\n" + "=" * 80)
        logger.info("STEP 4: Extracting Data (same as util_web_story)")
        logger.info("=" * 80)
        
        if "props" not in response_json or "pageProps" not in response_json["props"]:
            logger.error("❌ No props.pageProps in JSON!")
            return
        
        page_props = response_json["props"]["pageProps"]
        logger.info(f"✅ pageProps found with keys: {list(page_props.keys())[:10]}...")
        
        # Step 5: Extract stories (lines 150-153)
        logger.info("\n" + "=" * 80)
        logger.info("STEP 5: Extracting Story List (line 152)")
        logger.info("=" * 80)
        
        if "story" not in page_props:
            logger.error("❌ No 'story' key in pageProps!")
            return
        
        story_data = page_props["story"]
        logger.info(f"✅ Story data found with keys: {list(story_data.keys())}")
        
        if "snapList" not in story_data:
            logger.error("❌ No 'snapList' in story data!")
            return
        
        snap_list = story_data["snapList"]
        logger.info(f"✅ snapList found: {len(snap_list)} snaps")
        
        # Step 6: Display all snap IDs (what production code sees)
        logger.info("\n" + "=" * 80)
        logger.info("STEP 6: Snap IDs That Production Code Would Process")
        logger.info("=" * 80)
        
        logger.info(f"\n🎯 TOTAL SNAPS IN SNAPLIST: {len(snap_list)}\n")
        
        for i, story in enumerate(snap_list, 1):
            snap_id = story.get("snapId", {}).get("value", "N/A")
            media_type = story.get("snapMediaType", "N/A")
            timestamp = story.get("timestampInSec", {}).get("value", "N/A")
            
            # Extract unique part for comparison
            unique_part = snap_id.split("AAgc")[-1].split("AZp")[0] if "AAgc" in snap_id else snap_id[-20:-10]
            
            type_str = "video" if media_type == 1 else "photo" if media_type == 0 else f"unknown({media_type})"
            
            logger.info(f"📱 Snap {i}:")
            logger.info(f"   Full ID: {snap_id}")
            logger.info(f"   Unique:  {unique_part}")
            logger.info(f"   Type:    {type_str}")
            logger.info(f"   Time:    {timestamp}")
            logger.info("")
        
        # Step 7: Check for your missing snap
        logger.info("=" * 80)
        logger.info("STEP 7: Checking for Your Missing Snap")
        logger.info("=" * 80)
        
        missing_snap = "pWHqAhPcRT6rrYfCQJc_zwAAgcGt5bHZ5eXFqAZpswUnaAZpsfLRyAAAAAA"
        missing_unique = "cGt5bHZ5eXFq"
        
        logger.info(f"\n🔍 Looking for: {missing_snap}")
        logger.info(f"🔍 Unique part: {missing_unique}")
        
        found = False
        for story in snap_list:
            snap_id = story.get("snapId", {}).get("value", "")
            if snap_id == missing_snap:
                logger.info(f"\n✅ FOUND IT! Position {snap_list.index(story) + 1}")
                found = True
                break
            elif missing_unique in snap_id:
                logger.info(f"\n⚠️ PARTIAL MATCH: {snap_id}")
                found = True
                break
        
        if not found:
            logger.info(f"\n❌ MISSING SNAP NOT FOUND IN SNAPLIST!")
            logger.info(f"   The snap is NOT in the JSON that production code extracts")
        
        # Step 8: Save full JSON for analysis
        logger.info("\n" + "=" * 80)
        logger.info("STEP 8: Saving Full Response")
        logger.info("=" * 80)
        
        output_file = f"snapchat_exact_scrape_{username}.json"
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(response_json, f, indent=2, ensure_ascii=False)
        logger.info(f"💾 Full JSON saved to: {output_file}")
        
        # Step 9: Summary
        logger.info("\n" + "=" * 80)
        logger.info("📊 SUMMARY")
        logger.info("=" * 80)
        logger.info(f"\nEndpoint used: {web_url}")
        logger.info(f"HTML received: {len(html)} chars")
        logger.info(f"JSON extracted: ✅")
        logger.info(f"Snaps in snapList: {len(snap_list)}")
        logger.info(f"Missing snap found: {'✅ YES' if found else '❌ NO'}")
        
        if not found:
            logger.info("\n🎯 CONCLUSION:")
            logger.info("   Your missing snap is NOT in the __NEXT_DATA__ JSON.")
            logger.info("   This means:")
            logger.info("   - The visual stories on the page use different data")
            logger.info("   - OR the page loads stories dynamically via JavaScript")
            logger.info("   - OR Snapchat serves different data to authenticated vs. unauthenticated users")
        
        logger.info("\n")
        
    except Exception as e:
        logger.error(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()

async def main():
    if len(sys.argv) < 2:
        logger.info("Usage: python test-exact-scraping-logic.py <username>")
        logger.info("Example: python test-exact-scraping-logic.py wolftyla")
        sys.exit(1)
    
    username = sys.argv[1].replace('@', '')
    await test_scraping_logic(username)

if __name__ == "__main__":
    asyncio.run(main())

