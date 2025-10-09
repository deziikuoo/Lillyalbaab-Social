// Integrated Enhanced Stories Logic (Method 4 only)
// This is the working logic that analyzes Snapsave results for video detection

async function getInstagramStoriesViaWeb(username, userAgent = null) {
  try {
    console.log(`🎬 Processing stories for @${username} with integrated enhanced logic...`);
    
    const headers = {
      'User-Agent': userAgent || getRandomUserAgent(),
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Accept-Encoding': 'gzip, deflate, br',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1'
    };

    const stories = [];
    const storyUrl = `https://www.instagram.com/stories/${username}/`;

    // Integrated Method: Analyze current Snapsave results to detect videos
    console.log('🔍 Analyzing Snapsave results for video detection...');
    
    try {
      // Use the original snapsave to get results, then analyze them
      const originalSnapsave = require("./snapsave-downloader/src/index");
      const snapsaveResult = await originalSnapsave(storyUrl);
      
      if (snapsaveResult && snapsaveResult.data && snapsaveResult.data.length > 0) {
        for (const item of snapsaveResult.data) {
          // Analyze the URL to determine if it's actually a video
          const url = item.url; // Only analyze the main URL, not thumbnails
          
          if (url) {
            console.log(`  🔍 Analyzing Snapsave URL: ${url.substring(0, 100)}...`);
            
            // Check if the URL contains video indicators - COMPREHENSIVE CHECK
            const videoUrlPatterns = [
              '.mp4', '.m4v', '.mov', '.avi', '.webm', '.mkv', '.flv', '.wmv', '.asf',
              '.3gp', '.3g2', '.ogv', '.ts', '.mts', '.m2ts', '.vob', '.ogm', '.rm',
              '.rmvb', '.divx', '.xvid', '.h264', '.h265', '.hevc', '.vp8', '.vp9',
              'video', 'v2', 'v3', 'stream', 'media', 'content', 'download', 'file',
              'asset', 'resource', 'cdn', 'cache', 'proxy', 'mirror', 'backup'
            ];
            const isVideo = videoUrlPatterns.some(pattern => 
              url.toLowerCase().includes(pattern.toLowerCase())
            ) || (item.quality && item.quality.toLowerCase().includes('video'));
            
            // Additional check: try to detect video by checking content type
            let confirmedVideo = isVideo;
            let actualVideoUrl = url;
            
            if (url.startsWith('http')) {
              try {
                // Follow redirects to get the actual content
                const response = await axios.get(url, { 
                  headers, 
                  timeout: 10000,
                  maxRedirects: 5,
                  validateStatus: function (status) {
                    return status >= 200 && status < 400; // Accept redirects
                  }
                });
                
                // Check if we got redirected to a different URL
                if (response.request && response.request.res && response.request.res.responseUrl) {
                  actualVideoUrl = response.request.res.responseUrl;
                  console.log(`  🔄 Followed redirect to: ${actualVideoUrl.substring(0, 100)}...`);
                }
                
                // Enhanced content type and response header analysis
                const contentType = response.headers['content-type'] || '';
                const contentLength = response.headers['content-length'] || '0';
                const contentRange = response.headers['content-range'] || '';
                const acceptRanges = response.headers['accept-ranges'] || '';
                const contentDisposition = response.headers['content-disposition'] || '';
                
                console.log(`  📊 Content-Type: ${contentType}, Size: ${contentLength} bytes`);
                console.log(`  📊 Content-Range: ${contentRange}, Accept-Ranges: ${acceptRanges}`);
                
                // Enhanced video detection with multiple criteria - COMPREHENSIVE LIST
                const videoMimeTypes = [
                  'video/mp4', 'video/mpeg', 'video/quicktime', 'video/x-msvideo', 'video/x-ms-wmv',
                  'video/avi', 'video/webm', 'video/ogg', 'video/x-matroska', 'video/x-flv',
                  'video/3gpp', 'video/3gpp2', 'video/x-ms-asf', 'video/x-m4v', 'video/mp2t',
                  'video/x-ms-wmx', 'video/x-ms-wvx', 'video/x-ms-wm', 'video/x-ms-wma',
                  'application/x-mpegURL', 'application/vnd.apple.mpegurl'
                ];
                const videoExtensions = [
                  '.mp4', '.m4v', '.mov', '.avi', '.webm', '.mkv', '.flv', '.wmv', '.asf',
                  '.3gp', '.3g2', '.ogv', '.ts', '.mts', '.m2ts', '.vob', '.ogm', '.rm',
                  '.rmvb', '.divx', '.xvid', '.h264', '.h265', '.hevc', '.vp8', '.vp9'
                ];
                const videoUrlPatterns = [
                  'video', 'v2', 'v3', 'mp4', 'mov', 'avi', 'webm', 'mkv', 'flv', 'wmv',
                  'stream', 'media', 'content', 'download', 'file', 'asset', 'resource',
                  'cdn', 'cache', 'proxy', 'mirror', 'backup', 'archive', 'storage'
                ];
                const qualityIndicators = [
                  'hd', '4k', 'uhd', '1080p', '720p', '480p', '360p', '240p', '144p',
                  'high', 'medium', 'low', 'best', 'worst', 'original', 'compressed',
                  'quality', 'resolution', 'bitrate', 'fps', 'frame'
                ];
                
                // Primary: Enhanced content-type and file size analysis
                const hasVideoMimeType = videoMimeTypes.some(type => contentType.toLowerCase().includes(type));
                const hasVideoExtension = videoExtensions.some(ext => actualVideoUrl.toLowerCase().includes(ext));
                const hasVideoUrlPattern = videoUrlPatterns.some(pattern => actualVideoUrl.toLowerCase().includes(pattern));
                const hasQualityIndicator = qualityIndicators.some(quality => actualVideoUrl.toLowerCase().includes(quality));
                const isLargeFile = parseInt(contentLength) > 500000; // Lowered threshold to 500KB
                const hasVideoHeaders = contentRange.includes('bytes') || acceptRanges === 'bytes';
                
                // Secondary: Enhanced URL pattern matching and Instagram CDN detection
                const isInstagramCDN = actualVideoUrl.includes('scontent.cdninstagram.com') || 
                                     actualVideoUrl.includes('cdninstagram.com') ||
                                     actualVideoUrl.includes('fbcdn.net');
                const isSnapsaveVideo = actualVideoUrl.includes('rapidcdn.app/v2') || 
                                       actualVideoUrl.includes('snapsave.app/video');
                
                // Calculate confidence score
                let confidenceScore = 0;
                if (hasVideoMimeType) confidenceScore += 3;
                if (hasVideoExtension) confidenceScore += 2;
                if (hasVideoUrlPattern) confidenceScore += 1;
                if (hasQualityIndicator) confidenceScore += 1;
                if (isLargeFile) confidenceScore += 2;
                if (hasVideoHeaders) confidenceScore += 1;
                if (isInstagramCDN) confidenceScore += 1;
                if (isSnapsaveVideo) confidenceScore += 1;
                
                console.log(`  🎯 Video Detection Score: ${confidenceScore}/12`);
                console.log(`  📊 Criteria: MIME(${hasVideoMimeType}) Ext(${hasVideoExtension}) Pattern(${hasVideoUrlPattern}) Quality(${hasQualityIndicator}) Size(${isLargeFile}) Headers(${hasVideoHeaders}) CDN(${isInstagramCDN}) Snapsave(${isSnapsaveVideo})`);
                
                // Determine if this is video based on confidence score
                confirmedVideo = confidenceScore >= 3; // Require at least 3 points for video detection
                
                // Tertiary: File header analysis and magic number detection
                if (response.data && response.data.length > 0) {
                  try {
                    // Get first few bytes for magic number detection
                    const firstBytes = response.data.slice(0, 12);
                    const hexSignature = firstBytes.toString('hex').toLowerCase();
                    
                    console.log(`  🔍 File Header Analysis: ${hexSignature.substring(0, 24)}...`);
                    
                    // Video file magic numbers - COMPREHENSIVE LIST
                    const videoMagicNumbers = {
                      'mp4': ['66747970', '00000020', '0000001c', '00000018', '00000014'], // 'ftyp' and variations
                      'mov': ['66747970', '6d6f6f76', '6d646174', '6d657461', '75647461'], // 'ftyp', 'moov', 'mdat', 'meta', 'udta'
                      'avi': ['52494646', '41564920', '4156494c', '41564958'], // 'RIFF' + 'AVI ', 'AVIL', 'AVIX'
                      'webm': ['1a45dfa3', '1549a966', '1654ae6b'], // WebM/Matroska signatures
                      'mkv': ['1a45dfa3', '1549a966', '1654ae6b'], // Matroska signatures
                      'flv': ['464c5601', '464c5604', '464c5605'], // 'FLV' + versions
                      'wmv': ['3026b275', '8e8e8e8e'], // WMV signatures
                      'asf': ['3026b275', '8e8e8e8e'], // ASF signatures
                      '3gp': ['66747970', '33677020', '33677034', '33677035', '33677036'], // 'ftyp' + 3GP variations
                      'm4v': ['66747970', '4d345620', '4d345634'], // 'ftyp' + M4V variations
                      'ts': ['47400000', '47400001', '47400002'], // MPEG-TS signatures
                      'ogv': ['4f676753', '4f676753'], // Ogg signatures
                      'rm': ['2e524d46', '2e7261fd'], // RealMedia signatures
                      'rmvb': ['2e524d46', '2e7261fd'], // RealMedia signatures
                      'divx': ['52494646', '44495658'], // 'RIFF' + 'DIVX'
                      'xvid': ['52494646', '58564944'] // 'RIFF' + 'XVID'
                    };
                    
                    // Check for video magic numbers
                    let hasVideoMagicNumber = false;
                    for (const [format, signatures] of Object.entries(videoMagicNumbers)) {
                      if (signatures.some(sig => hexSignature.includes(sig))) {
                        console.log(`  ✅ Detected ${format.toUpperCase()} magic number`);
                        hasVideoMagicNumber = true;
                        confidenceScore += 2; // Bonus points for magic number match
                        break;
                      }
                    }
                    
                    // Check for image magic numbers (to confirm it's NOT a video) - COMPREHENSIVE LIST
                    const imageMagicNumbers = {
                      'jpeg': ['ffd8ff', 'ffd8fe', 'ffd8db'], // JPEG signatures
                      'jpg': ['ffd8ff', 'ffd8fe', 'ffd8db'], // JPG signatures
                      'png': ['89504e47', '89504e470d0a1a0a'], // PNG signatures
                      'gif': ['47494638', '474946383761', '474946383961'], // GIF87a, GIF89a
                      'webp': ['52494646', '57454250'], // 'RIFF' + 'WEBP'
                      'bmp': ['424d', '424d0000'], // 'BM' signatures
                      'tiff': ['49492a00', '4d4d002a', '4d4d002b'], // TIFF signatures
                      'ico': ['00000100', '00000200'], // ICO signatures
                      'cur': ['00000200'], // CUR signatures
                      'svg': ['3c737667', '3c3f786d6c'], // SVG signatures
                      'pdf': ['25504446'], // PDF signature
                      'eps': ['c5d0d3c6', '25215053'], // EPS signatures
                      'raw': ['49492a00', '4d4d002a', '4d4d002b'] // RAW signatures (TIFF-based)
                    };
                    
                    let hasImageMagicNumber = false;
                    for (const [format, signatures] of Object.entries(imageMagicNumbers)) {
                      if (signatures.some(sig => hexSignature.includes(sig))) {
                        console.log(`  🖼️ Detected ${format.toUpperCase()} magic number (likely image)`);
                        hasImageMagicNumber = true;
                        confidenceScore -= 2; // Penalty for image magic number
                        break;
                      }
                    }
                    
                    // Update confidence score
                    console.log(`  🎯 Updated Video Detection Score: ${confidenceScore}/14`);
                    confirmedVideo = confidenceScore >= 3; // Re-evaluate with magic number data
                    
                  } catch (headerError) {
                    console.log(`  ⚠️ File header analysis failed: ${headerError.message}`);
                  }
                }
                
                // Additional check: if it's a rapidcdn URL, try to extract the original Instagram URL
                if (actualVideoUrl.includes('rapidcdn.app') && actualVideoUrl.includes('token=')) {
                  try {
                    // Extract the token and decode it to find the original Instagram URL
                    const tokenMatch = actualVideoUrl.match(/token=([^&]+)/);
                    if (tokenMatch) {
                      const token = tokenMatch[1];
                      
                      // Try multiple decoding approaches
                      let tokenData = null;
                      let decodedToken = '';
                      
                      try {
                        // Method 1: Standard base64 decode
                        decodedToken = Buffer.from(token, 'base64').toString('utf-8');
                        tokenData = JSON.parse(decodedToken);
                      } catch (decodeError1) {
                        try {
                          // Method 2: URL-safe base64 decode
                          const urlSafeToken = token.replace(/-/g, '+').replace(/_/g, '/');
                          decodedToken = Buffer.from(urlSafeToken, 'base64').toString('utf-8');
                          tokenData = JSON.parse(decodedToken);
                        } catch (decodeError2) {
                          try {
                            // Method 3: Try to extract URL directly from token string
                            const urlMatch = token.match(/https?:\/\/[^\s"']+/);
                            if (urlMatch) {
                              tokenData = { url: urlMatch[0] };
                            }
                          } catch (decodeError3) {
                            console.log(`  ⚠️ All token decoding methods failed`);
                          }
                        }
                      }
                      
                      if (tokenData && tokenData.url) {
                        console.log(`  🔗 Found original Instagram URL: ${tokenData.url.substring(0, 100)}...`);
                        
                        // Check if the original URL is a video - COMPREHENSIVE CHECK
                        const originalVideoPatterns = [
                          '.mp4', '.m4v', '.mov', '.avi', '.webm', '.mkv', '.flv', '.wmv', '.asf',
                          '.3gp', '.3g2', '.ogv', '.ts', '.mts', '.m2ts', '.vob', '.ogm', '.rm',
                          '.rmvb', '.divx', '.xvid', '.h264', '.h265', '.hevc', '.vp8', '.vp9',
                          'video', 'v2', 'v3', 'stream', 'media', 'content', 'download',
                          'v/t51.2885-15', 'v/t51.2885-16', 'v/t51.2885-17', 'v/t51.2885-18',
                          'cdninstagram.com/v/', 'fbcdn.net/v/', 'scontent.cdninstagram.com/v/'
                        ];
                        const originalIsVideo = originalVideoPatterns.some(pattern => 
                          tokenData.url.toLowerCase().includes(pattern.toLowerCase())
                        );
                        
                        if (originalIsVideo) {
                          confirmedVideo = true;
                          actualVideoUrl = tokenData.url;
                          console.log(`  ✅ Confirmed as video from original URL`);
                        }
                      }
                    }
                  } catch (tokenError) {
                    console.log(`  ⚠️ Token extraction failed: ${tokenError.message}`);
                  }
                }
                
              } catch (headError) {
                console.log(`  ⚠️ Could not analyze URL: ${headError.message}`);
                // Keep original detection if analysis fails
              }
            }
            
            console.log(`  🎯 Final enhanced detection result:`);
            console.log(`  - confirmedVideo: ${confirmedVideo}`);
            console.log(`  - storyType: ${confirmedVideo ? 'video' : 'photo'}`);
            console.log(`  - isVideo: ${confirmedVideo}`);
            console.log(`  - contentType: ${confirmedVideo ? 'video' : 'image'}`);
            
            stories.push({
              thumbnail: item.thumbnail || url,
              url: actualVideoUrl,
              storyId: `analyzed_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              storyType: confirmedVideo ? 'video' : 'photo',
              quality: item.quality || 'HD',
              isVideo: confirmedVideo,
              method: 'integrated_enhanced',
              originalUrl: url,
              contentType: confirmedVideo ? 'video' : 'image'
            });
            
            console.log(`  ✅ Analyzed ${confirmedVideo ? 'video' : 'photo'}: ${actualVideoUrl.substring(0, 50)}...`);
          }
        }
      }
    } catch (analysisError) {
      console.log(`  ❌ Analysis failed: ${analysisError.message}`);
    }
    
    console.log(`📊 Integrated enhanced logic found ${stories.length} stories`);
    
    if (stories.length > 0) {
      console.log(`✅ Integrated enhanced logic found ${stories.length} stories`);
      return stories;
    } else {
      console.log(`⚠️ No stories found via integrated enhanced logic`);
      return [];
    }
    
  } catch (error) {
    console.log(`❌ Integrated enhanced logic failed: ${error.message}`);
    throw error;
  }
}

module.exports = getInstagramStoriesViaWeb;
