"""The Main Snapchat Downloader Class."""

import concurrent.futures
import json
import os
import re
import asyncio
import aiohttp
from dotenv import load_dotenv
import requests
from loguru import logger
import time
import threading
import tempfile
import shutil
from pathlib import Path
from datetime import datetime
import portalocker
import traceback
import platform

# Import msvcrt only on Windows
if platform.system() == "Windows":
    import msvcrt
else:
    msvcrt = None

from snapchat_dl.downloader import download_url
from snapchat_dl.utils import APIResponseError
from snapchat_dl.utils import dump_response
from snapchat_dl.utils import MEDIA_TYPE
from snapchat_dl.utils import NoStoriesFound
from snapchat_dl.utils import strf_time
from snapchat_dl.utils import UserNotFoundError

load_dotenv()

class FileLock:
    def __init__(self, filename):
        self.filename = filename
        self.lock_file = f"{filename}.lock"
        self.lock = None
        self.max_retries = 3
        self.retry_delay = 0.1  # 100ms

    def __enter__(self):
        retries = 0
        while retries < self.max_retries:
            try:
                # Create the lock file if it doesn't exist
                if not os.path.exists(self.lock_file):
                    with open(self.lock_file, 'w') as f:
                        f.write(str(os.getpid()))
                
                # Try to acquire the lock
                self.lock = open(self.lock_file, 'r+')
                try:
                    # Try to get an exclusive lock (Windows-specific)
                    if msvcrt:
                        msvcrt.locking(self.lock.fileno(), msvcrt.LK_NBLCK, 1)
                    # If successful, write our PID to the lock file
                    self.lock.seek(0)
                    self.lock.write(str(os.getpid()))
                    self.lock.truncate()
                    self.lock.flush()
                    return self
                except (IOError, OSError):
                    # If we couldn't get the lock, close the file and retry
                    self.lock.close()
                    self.lock = None
                    retries += 1
                    if retries == self.max_retries:
                        raise
                    time.sleep(self.retry_delay)
            except Exception as e:
                if self.lock:
                    self.lock.close()
                    self.lock = None
                retries += 1
                if retries == self.max_retries:
                    raise
                time.sleep(self.retry_delay)

    def __exit__(self, exc_type, exc_val, exc_tb):
        if self.lock:
            try:
                # Release the lock (Windows-specific)
                if msvcrt:
                    msvcrt.locking(self.lock.fileno(), msvcrt.LK_UNLCK, 1)
                self.lock.close()
            except:
                pass
            try:
                # Remove the lock file if it exists and belongs to us
                if os.path.exists(self.lock_file):
                    with open(self.lock_file, 'r') as f:
                        pid = f.read().strip()
                        if pid == str(os.getpid()):
                            os.remove(self.lock_file)
            except:
                pass

class SnapchatDL:
    def __init__(
        self,
        directory_prefix=os.getenv("DOWNLOADS_DIR", "downloads"),
        max_workers=2,
        limit_story=-1,
        sleep_interval=1,
        quiet=False,
        dump_json=False,
    ):
        self.directory_prefix = os.path.abspath(os.path.normpath(directory_prefix))
        self.max_workers = max_workers
        self.limit_story = limit_story
        self.sleep_interval = sleep_interval
        self.quiet = quiet
        self.dump_json = dump_json
        self.endpoint_web = "https://www.snapchat.com/add/{}/"
        self.regexp_web_json = (
            r'<script\s*id="__NEXT_DATA__"\s*type="application\/json">([^<]+)</script>'
        )
        self.response_ok = 200

    async def _api_response(self, username):
        async with aiohttp.ClientSession() as session:
            web_url = self.endpoint_web.format(username)
            async with session.get(
                web_url,
                headers={
                    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
                }
            ) as response:
                if response.status != self.response_ok:
                    raise APIResponseError(f"API returned status {response.status}")
                return await response.text()

    async def _web_fetch_story(self, username):
        response = await self._api_response(username)
        response_json_raw = re.findall(self.regexp_web_json, response)
        try:
            response_json = json.loads(response_json_raw[0])
            def util_web_user_info(content: dict):
                if "userProfile" in content["props"]["pageProps"]:
                    user_profile = content["props"]["pageProps"]["userProfile"]
                    field_id = user_profile["$case"]
                    return user_profile[field_id]
                else:
                    raise UserNotFoundError
            def util_web_story(content: dict):
                if "story" in content["props"]["pageProps"]:
                    return content["props"]["pageProps"]["story"]["snapList"]
                return list()
            def util_web_extract(content: dict, key: str):
                if key in content["props"]["pageProps"]:
                    return content["props"]["pageProps"][key]
                return list()
            
            user_info = util_web_user_info(response_json)
            stories = util_web_story(response_json)
            curated_highlights = util_web_extract(response_json, "curatedHighlights")
            spot_highlights = util_web_extract(response_json, "spotHighlights")
            
            # Yield each story as it's processed
            for story in stories:
                yield story, user_info
            
            # Store the additional data in the instance for later use
            self._curated_highlights = curated_highlights
            self._spot_highlights = spot_highlights
            
        except (IndexError, KeyError, ValueError):
            raise APIResponseError

    def _get_metadata_path(self, username, media_type):
        return os.path.join(self.directory_prefix, username, media_type, ".media_metadata.json")

    def _load_media_metadata(self, username, media_type):
        metadata_file = self._get_metadata_path(username, media_type)
        if not os.path.exists(metadata_file):
            return []
        with FileLock(metadata_file):
            try:
                with open(metadata_file, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except json.JSONDecodeError as e:
                logger.error(f"JSON decode error in metadata file for {username}/{media_type}: {e}")
                return []
            except Exception as e:
                logger.error(f"Error loading metadata for {username}/{media_type}: {e}")
                return []

    def _save_media_metadata(self, username, media_type, metadata):
        metadata_file = self._get_metadata_path(username, media_type)
        temp_file = f"{metadata_file}.tmp"
        os.makedirs(os.path.dirname(metadata_file), exist_ok=True)
        with FileLock(metadata_file):
            try:
                with open(temp_file, 'w', encoding='utf-8') as f:
                    json.dump(metadata, f, indent=2, ensure_ascii=False)
                os.replace(temp_file, metadata_file)
            except Exception as e:
                logger.error(f"Error saving metadata for {username}/{media_type}: {e}")
                if os.path.exists(temp_file):
                    os.remove(temp_file)
                raise

    def _update_media_metadata(self, username, media_type, filename, status, progress=None):
        with FileLock(self._get_metadata_path(username, media_type)):
            metadata = self._load_media_metadata(username, media_type)
            for item in metadata:
                if item["filename"] == filename:
                    item["download_status"] = status
                    if progress is not None:
                        item["progress"] = progress
                    break
            self._save_media_metadata(username, media_type, metadata)

    def _create_progress_callback(self, username, media_type, filename, total, downloaded, progress_callback):
        last_progress = 0
        last_update_time = time.time()
        update_interval = 0.05  # 50ms
        last_metadata_update = 0
        metadata_update_interval = 0.1  # 100ms

        async def callback(progress=None):
            nonlocal last_progress, last_update_time, last_metadata_update
            current_time = time.time()
            
            # Only update if enough time has passed or progress has changed significantly
            if current_time - last_update_time >= update_interval or (progress is not None and abs(progress - last_progress) >= 5):
                try:
                    # Update metadata
                    self._update_media_metadata(username, media_type, filename, "in_progress", progress or 0)
                    
                    # Prepare WebSocket message
                    ws_message = {
                        "files": {
                            filename: {
                                "status": "in_progress",
                                "progress": progress or 0
                            }
                        },
                        "overall": {
                            "status": "in_progress",
                            "progress": (downloaded / total * 100) if total > 0 else 0
                        }
                    }
                    
                    # Send file progress update
                    if progress_callback:
                        await progress_callback(ws_message)
                    
                    # Send metadata update less frequently
                    if current_time - last_metadata_update >= metadata_update_interval:
                        metadata = self._load_media_metadata(username, media_type)
                        metadata_message = {
                            "type": "metadata_update",
                            "items": [item for item in metadata if item["filename"] == filename]
                        }
                        if progress_callback:
                            await progress_callback(metadata_message)
                        last_metadata_update = current_time
                    
                    last_progress = progress or 0
                    last_update_time = current_time
                    
                except Exception as e:
                    logger.error(f"Error in progress callback: {e}")
                    logger.error(traceback.format_exc())

        return callback

    async def download(self, username, progress_callback=None):
        try:
            logger.info(f"[Download] Starting download for {username}")
            
            # Initialize counters and directories
            total = 0
            downloaded = 0
            dir_name = os.path.join(self.directory_prefix, username, "stories")
            os.makedirs(dir_name, exist_ok=True)
            logger.info(f"[Download] Output directory: {dir_name}")

            # Load existing metadata (don't clear it - preserve previous downloads)
            existing_metadata = self._load_media_metadata(username, "stories")
            existing_filenames = {item.get("filename") for item in existing_metadata}
            
            # Send initial state
            if progress_callback:
                ws_message = {
                    "type": "initial_state",
                    "overall": {
                        "status": "in_progress",
                        "total_files": 0,
                        "downloaded": 0,
                        "progress": 0
                    }
                }
                await progress_callback(ws_message)

            # Collect all stories first
            stories = []
            story_count = 0
            async for story, user_info in self._web_fetch_story(username):
                if self.limit_story > -1 and story_count >= self.limit_story:
                    break
                    
                story_count += 1
                total += 1
                stories.append((story, user_info))
                
                # Update total count
                if progress_callback:
                    ws_message = {
                        "type": "total_update",
                        "overall": {
                            "status": "in_progress",
                            "total_files": total,
                            "downloaded": downloaded,
                            "progress": (downloaded / total * 100) if total > 0 else 0
                        }
                    }
                    await progress_callback(ws_message)

            # Process and download files concurrently
            media_urls = []  # Track URLs for return value
            with concurrent.futures.ThreadPoolExecutor(max_workers=self.max_workers) as executor:
                futures = []
                for story, user_info in stories:
                    snap_id = story["snapId"]["value"]
                    media_url = story["snapUrls"]["mediaUrl"]
                    media_urls.append(media_url)  # Collect URL
                    media_type = story["snapMediaType"]
                    timestamp = int(story["timestampInSec"]["value"])
                    filename = strf_time(timestamp, "%Y-%m-%d_%H-%M-%S_{}_{}.{}").format(
                        snap_id, username, MEDIA_TYPE[media_type]
                    )
                    thumbnail_url = story["snapUrls"].get("mediaPreviewUrl") or media_url
                    
                    # Skip if already exists in metadata (avoid duplicates)
                    if filename in existing_filenames:
                        logger.info(f"[Download] Skipping duplicate: {filename}")
                        continue
                    
                    # Add to metadata immediately
                    metadata = self._load_media_metadata(username, "stories")
                    new_item = {
                        "filename": filename,
                        "type": "video" if MEDIA_TYPE[media_type] == "mp4" else "image",
                        "thumbnail_url": thumbnail_url,
                        "download_status": "not_started",
                        "progress": 0,
                        "download_url": f"/downloads/{username}/stories/{filename}"
                    }
                    metadata.append(new_item)
                    existing_filenames.add(filename)  # Track to avoid duplicates in same session
                    self._save_media_metadata(username, "stories", metadata)
                    
                    # Send metadata update
                    if progress_callback:
                        metadata_message = {
                            "type": "metadata_update",
                            "items": [metadata[-1]]
                        }
                        await progress_callback(metadata_message)

                    media_output = os.path.join(dir_name, filename)
                    logger.info(f"[Download] Starting download for {filename} to {media_output}")

                    # Create progress callback
                    file_progress_callback = self._create_progress_callback(
                        username, "stories", filename, total, downloaded, progress_callback
                    )

                    # Update status to in_progress before starting download
                    self._update_media_metadata(username, "stories", filename, "in_progress", 0)
                    if progress_callback:
                        ws_message = {
                            "files": {
                                filename: {
                                    "status": "in_progress",
                                    "progress": 0
                                }
                            },
                            "overall": {
                                "status": "in_progress",
                                "downloaded": downloaded,
                                "total_files": total,
                                "progress": (downloaded / total * 100) if total > 0 else 0
                            }
                        }
                        await progress_callback(ws_message)

                    # Start download
                    future = executor.submit(
                        download_url,
                        media_url,
                        media_output,
                        self.sleep_interval,
                        file_progress_callback
                    )
                    futures.append((future, filename))

                # Process completed downloads
                for future, filename in futures:
                    try:
                        result = future.result()
                        if result:
                            downloaded += 1
                            logger.info(f"[Download] Completed {result} ({downloaded}/{total})")
                            self._update_media_metadata(username, "stories", result, "complete", 100)
                            
                            # Send completion update
                            if progress_callback:
                                ws_message = {
                                    "files": {
                                        result: {
                                            "status": "complete",
                                            "progress": 100
                                        }
                                    },
                                    "overall": {
                                        "status": "complete" if downloaded == total else "in_progress",
                                        "downloaded": downloaded,
                                        "total_files": total,
                                        "progress": (downloaded / total * 100) if total > 0 else 0
                                    }
                                }
                                await progress_callback(ws_message)
                    except Exception as e:
                        logger.error(f"[Download] Error downloading {filename}: {e}")
                        self._update_media_metadata(username, "stories", filename, "error", 0)
                        if progress_callback:
                            ws_message = {
                                "files": {
                                    filename: {
                                        "status": "error",
                                        "progress": 0,
                                        "error": str(e)
                                    }
                                },
                                "overall": {
                                    "status": "error",
                                    "downloaded": downloaded,
                                    "total_files": total,
                                    "progress": (downloaded / total * 100) if total > 0 else 0
                                }
                            }
                            await progress_callback(ws_message)

            if not self.quiet:
                logger.info(f"[✓] {downloaded} stories downloaded for {username}")
            
            return media_urls  # Return list of media URLs

        except Exception as e:
            logger.error(f"[Download] Error in download process: {e}, completed {downloaded}/{total} downloads")
            if progress_callback:
                ws_message = {
                    "type": "error",
                    "overall": {
                        "status": "error",
                        "message": str(e),
                        "downloaded": downloaded,
                        "total_files": total,
                        "progress": (downloaded / total * 100) if total > 0 else 0
                    }
                }
                await progress_callback(ws_message)
            raise

    async def download_highlights(self, username, progress_callback=None):
        try:
            _, _, curated_highlights, _ = await self._web_fetch_story(username)
            media_list = curated_highlights
            total = len(media_list)
            downloaded = 0
            dir_name = os.path.join(self.directory_prefix, username, "highlights")
            os.makedirs(dir_name, exist_ok=True)
            logger.info(f"[Download] Output directory: {dir_name}")

            # Load existing metadata (don't clear it - preserve previous downloads)
            existing_metadata = self._load_media_metadata(username, "highlights")
            existing_filenames = {item.get("filename") for item in existing_metadata}
            
            # Send initial state
            if progress_callback:
                ws_message = {
                    "type": "initial_state",
                    "overall": {
                        "status": "in_progress",
                        "total_files": total,
                        "downloaded": 0,
                        "progress": 0
                    }
                }
                await progress_callback(ws_message)

            # Process and download files
            media_urls = []  # Track URLs for return value
            with concurrent.futures.ThreadPoolExecutor(max_workers=self.max_workers) as executor:
                futures = []
                for media in media_list:
                    media_url = media.get("snapUrls", {}).get("mediaUrl")
                    if not media_url:
                        continue
                    media_urls.append(media_url)  # Collect URL
                    snap_id = media_url.split("/")[-1].split(".")[0]
                    timestamp = int(os.path.getmtime(dir_name)) if os.path.exists(dir_name) else int(asyncio.get_event_loop().time())
                    extension = "mp4" if "video" in media_url.lower() else "jpg"
                    filename = strf_time(timestamp, "%Y-%m-%d_%H-%M-%S_{}_{}.{}").format(
                        snap_id, username, extension
                    )
                    
                    # Skip if already exists in metadata (avoid duplicates)
                    if filename in existing_filenames:
                        logger.info(f"[Download] Skipping duplicate: {filename}")
                        continue
                    
                    thumbnail_url = media.get("snapUrls", {}).get("mediaPreviewUrl") or media_url
                    
                    # Add to metadata immediately
                    metadata = self._load_media_metadata(username, "highlights")
                    new_item = {
                        "filename": filename,
                        "type": "video" if extension == "mp4" else "image",
                        "thumbnail_url": thumbnail_url,
                        "download_status": "not_started",
                        "progress": 0,
                        "download_url": f"/downloads/{username}/highlights/{filename}"
                    }
                    metadata.append(new_item)
                    existing_filenames.add(filename)  # Track to avoid duplicates in same session
                    self._save_media_metadata(username, "highlights", metadata)
                    
                    # Send metadata update
                    if progress_callback:
                        metadata_message = {
                            "type": "metadata_update",
                            "items": [metadata[-1]]  # Send only the new item
                        }
                        await progress_callback(metadata_message)

                    media_output = os.path.join(dir_name, filename)
                    logger.info(f"[Download] Starting download for {filename} to {media_output}")

                    # Create progress callback
                    file_progress_callback = self._create_progress_callback(
                        username, "highlights", filename, total, downloaded, progress_callback
                    )

                    # Start download
                    future = executor.submit(
                        download_url,
                        media_url,
                        media_output,
                        self.sleep_interval,
                        file_progress_callback
                    )
                    futures.append((future, filename))

                    if self.dump_json:
                        media_json = {"url": media_url, "username": username, "type": "highlights"}
                        filename_json = os.path.join(dir_name, filename + ".json")
                        dump_response(media_json, filename_json)

                # Process completed downloads
                for future, filename in futures:
                    try:
                        result = future.result()
                        if result:
                            downloaded += 1
                            logger.info(f"[Download] Completed {result} ({downloaded}/{total})")
                            self._update_media_metadata(username, "highlights", result, "complete", 100)
                            
                            # Send completion update
                            if progress_callback:
                                ws_message = {
                                    "files": {
                                        result: {
                                            "status": "complete",
                                            "progress": 100
                                        }
                                    },
                                    "overall": {
                                        "status": "complete" if downloaded == total else "in_progress",
                                        "downloaded": downloaded,
                                        "total_files": total,
                                        "progress": (downloaded / total * 100) if total > 0 else 0
                                    }
                                }
                                await progress_callback(ws_message)
                    except Exception as e:
                        logger.error(f"[Download] Error downloading {filename}: {e}")
                        self._update_media_metadata(username, "highlights", filename, "error", 0)
                        if progress_callback:
                            ws_message = {
                                "files": {
                                    filename: {
                                        "status": "error",
                                        "progress": 0,
                                        "error": str(e)
                                    }
                                },
                                "overall": {
                                    "status": "error",
                                    "downloaded": downloaded,
                                    "total_files": total,
                                    "progress": (downloaded / total * 100) if total > 0 else 0
                                }
                            }
                            await progress_callback(ws_message)

            if not self.quiet:
                logger.info(f"[✓] {downloaded} highlights downloaded for {username}")
            
            return media_urls  # Return list of media URLs

        except Exception as e:
            logger.error(f"[Download] Error in highlights download process: {e}, completed {downloaded}/{total} downloads")
            if progress_callback:
                ws_message = {
                    "type": "error",
                    "overall": {
                        "status": "error",
                        "message": str(e),
                        "downloaded": downloaded,
                        "total_files": total,
                        "progress": (downloaded / total * 100) if total > 0 else 0
                    }
                }
                await progress_callback(ws_message)
            raise

    async def download_spotlights(self, username, progress_callback=None):
        try:
            _, _, _, spot_highlights = await self._web_fetch_story(username)
            media_list = spot_highlights
            total = len(media_list)
            downloaded = 0
            dir_name = os.path.join(self.directory_prefix, username, "spotlights")
            os.makedirs(dir_name, exist_ok=True)
            logger.info(f"[Download] Output directory: {dir_name}")

            # Load existing metadata (don't clear it - preserve previous downloads)
            existing_metadata = self._load_media_metadata(username, "spotlights")
            existing_filenames = {item.get("filename") for item in existing_metadata}
            
            # Send initial state
            if progress_callback:
                ws_message = {
                    "type": "initial_state",
                    "overall": {
                        "status": "in_progress",
                        "total_files": total,
                        "downloaded": 0,
                        "progress": 0
                    }
                }
                await progress_callback(ws_message)

            # Process and download files
            media_urls = []  # Track URLs for return value
            with concurrent.futures.ThreadPoolExecutor(max_workers=self.max_workers) as executor:
                futures = []
                for media in media_list:
                    media_url = media.get("snapUrls", {}).get("mediaUrl")
                    if not media_url:
                        continue
                    media_urls.append(media_url)  # Collect URL
                    snap_id = media_url.split("/")[-1].split(".")[0]
                    timestamp = int(os.path.getmtime(dir_name)) if os.path.exists(dir_name) else int(asyncio.get_event_loop().time())
                    extension = "mp4" if "video" in media_url.lower() else "jpg"
                    filename = strf_time(timestamp, "%Y-%m-%d_%H-%M-%S_{}_{}.{}").format(
                        snap_id, username, extension
                    )
                    
                    # Skip if already exists in metadata (avoid duplicates)
                    if filename in existing_filenames:
                        logger.info(f"[Download] Skipping duplicate: {filename}")
                        continue
                    
                    thumbnail_url = media.get("snapUrls", {}).get("mediaPreviewUrl") or media_url
                    
                    # Add to metadata immediately
                    metadata = self._load_media_metadata(username, "spotlights")
                    new_item = {
                        "filename": filename,
                        "type": "video" if extension == "mp4" else "image",
                        "thumbnail_url": thumbnail_url,
                        "download_status": "not_started",
                        "progress": 0,
                        "download_url": f"/downloads/{username}/spotlights/{filename}"
                    }
                    metadata.append(new_item)
                    existing_filenames.add(filename)  # Track to avoid duplicates in same session
                    self._save_media_metadata(username, "spotlights", metadata)
                    
                    # Send metadata update
                    if progress_callback:
                        metadata_message = {
                            "type": "metadata_update",
                            "items": [metadata[-1]]  # Send only the new item
                        }
                        await progress_callback(metadata_message)

                    media_output = os.path.join(dir_name, filename)
                    logger.info(f"[Download] Starting download for {filename} to {media_output}")

                    # Create progress callback
                    file_progress_callback = self._create_progress_callback(
                        username, "spotlights", filename, total, downloaded, progress_callback
                    )

                    # Start download
                    future = executor.submit(
                        download_url,
                        media_url,
                        media_output,
                        self.sleep_interval,
                        file_progress_callback
                    )
                    futures.append((future, filename))

                    if self.dump_json:
                        media_json = {"url": media_url, "username": username, "type": "spotlights"}
                        filename_json = os.path.join(dir_name, filename + ".json")
                        dump_response(media_json, filename_json)

                # Process completed downloads
                for future, filename in futures:
                    try:
                        result = future.result()
                        if result:
                            downloaded += 1
                            logger.info(f"[Download] Completed {result} ({downloaded}/{total})")
                            self._update_media_metadata(username, "spotlights", result, "complete", 100)
                            
                            # Send completion update
                            if progress_callback:
                                ws_message = {
                                    "files": {
                                        result: {
                                            "status": "complete",
                                            "progress": 100
                                        }
                                    },
                                    "overall": {
                                        "status": "complete" if downloaded == total else "in_progress",
                                        "downloaded": downloaded,
                                        "total_files": total,
                                        "progress": (downloaded / total * 100) if total > 0 else 0
                                    }
                                }
                                await progress_callback(ws_message)
                    except Exception as e:
                        logger.error(f"[Download] Error downloading {filename}: {e}")
                        self._update_media_metadata(username, "spotlights", filename, "error", 0)
                        if progress_callback:
                            ws_message = {
                                "files": {
                                    filename: {
                                        "status": "error",
                                        "progress": 0,
                                        "error": str(e)
                                    }
                                },
                                "overall": {
                                    "status": "error",
                                    "downloaded": downloaded,
                                    "total_files": total,
                                    "progress": (downloaded / total * 100) if total > 0 else 0
                                }
                            }
                            await progress_callback(ws_message)

            if not self.quiet:
                logger.info(f"[✓] {downloaded} spotlights downloaded for {username}")
            
            return media_urls  # Return list of media URLs

        except Exception as e:
            logger.error(f"[Download] Error in spotlights download process: {e}, completed {downloaded}/{total} downloads")
            if progress_callback:
                ws_message = {
                    "type": "error",
                    "overall": {
                        "status": "error",
                        "message": str(e),
                        "downloaded": downloaded,
                        "total_files": total,
                        "progress": (downloaded / total * 100) if total > 0 else 0
                    }
                }
                await progress_callback(ws_message)
            raise