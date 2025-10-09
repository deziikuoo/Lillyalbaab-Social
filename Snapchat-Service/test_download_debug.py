import asyncio
import os
import sys
from loguru import logger

# Add the snapchat_dl directory to the path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'snapchat_dl'))

from downloader import download_url

def test_download_url():
    """Test the download_url function to see what it returns"""
    
    # Test with a valid URL
    test_url = "https://bolt-gcdn.sc-cdn.net/3/bsoMy860iVH5ArYNuieVb.1034.IRZXSOY?mo=GlQaFDIBfToBBEIGCPjTj8UGSAJQS2ABogE3CIoIEiUKIwiTkC8gATDgAzjUBkABSg4KCT4kLSUiGx8hIhD0A1DyTWgCIgsSACoHSVJaWFNPWZAD8k0%3D&uc=75"
    test_output = "test_download.jpg"
    
    logger.info(f"🔍 Testing download_url with URL: {test_url[:50]}...")
    logger.info(f"🔍 Output file: {test_output}")
    
    try:
        result = download_url(test_url, test_output, 0.1)
        logger.info(f"✅ download_url returned: {result}")
        logger.info(f"✅ Return type: {type(result)}")
        logger.info(f"✅ File exists: {os.path.exists(test_output)}")
        
        if os.path.exists(test_output):
            file_size = os.path.getsize(test_output)
            logger.info(f"✅ File size: {file_size} bytes")
            
            # Clean up
            os.remove(test_output)
            logger.info("✅ Test file cleaned up")
        
    except Exception as e:
        logger.error(f"❌ download_url failed: {e}")
        logger.error(f"❌ Exception type: {type(e)}")

if __name__ == "__main__":
    test_download_url()
