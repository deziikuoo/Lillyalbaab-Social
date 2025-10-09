import requests
from loguru import logger
import time
import os
from typing import Optional, Callable
from requests.exceptions import RequestException
import asyncio

class DownloadError(Exception):
    """Custom exception for download errors."""
    pass

def download_url(url: str, output: str, sleep_interval: float, progress_callback: Optional[Callable] = None, max_retries: int = 3) -> Optional[str]:
    """
    Download file from URL to specified output path with progress tracking and retry logic.
    
    Args:
        url: The URL to download from
        output: The output file path
        sleep_interval: Time to sleep between chunks
        progress_callback: Optional callback function for progress updates
        max_retries: Maximum number of retry attempts
    
    Returns:
        The filename if successful, None if failed
        
    Raises:
        DownloadError: If download fails after all retries
    """
    retry_count = 0
    last_error = None
    
    while retry_count < max_retries:
        try:
            response = requests.get(url, stream=True, timeout=30)
            response.raise_for_status()
            
            total_size = int(response.headers.get('content-length', 0))
            downloaded_size = 0
            chunk_size = 8192  # Increased chunk size for better performance
            
            # Create directory if it doesn't exist
            output_dir = os.path.dirname(output)
            if output_dir:  # Only create directory if there's a directory path
                os.makedirs(output_dir, exist_ok=True)
            
            with open(output, 'wb') as f:
                for chunk in response.iter_content(chunk_size=chunk_size):
                    if chunk:
                        f.write(chunk)
                        downloaded_size += len(chunk)
                        if progress_callback and total_size > 0:
                            progress = (downloaded_size / total_size) * 100
                            try:
                                progress_callback(progress)
                            except TypeError:
                                # If the callback doesn't accept the progress parameter, try calling without it
                                progress_callback()
            
            # Verify file was downloaded completely
            if total_size > 0 and os.path.getsize(output) != total_size:
                raise DownloadError("Downloaded file size doesn't match expected size")
            
            time.sleep(sleep_interval)
            return os.path.basename(output)
            
        except RequestException as e:
            last_error = e
            retry_count += 1
            if retry_count < max_retries:
                wait_time = 2 ** retry_count  # Exponential backoff
                logger.warning(f"Download failed (attempt {retry_count}/{max_retries}). Retrying in {wait_time} seconds...")
                time.sleep(wait_time)
            else:
                logger.error(f"Failed to download {url} after {max_retries} attempts: {str(e)}")
                raise DownloadError(f"Failed to download after {max_retries} attempts: {str(e)}")
                
        except Exception as e:
            logger.error(f"Unexpected error downloading {url}: {e}")
            raise DownloadError(f"Unexpected error: {str(e)}")
    
    return None