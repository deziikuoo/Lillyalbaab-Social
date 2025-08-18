const axios = require('axios');
require('dotenv').config({ silent: true });

class InstagramCarouselDownloader {
  constructor(userAgent = null) {
    this.userAgent = userAgent || process.env.USER_AGENT || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    this.xIgAppId = process.env.X_IG_APP_ID || '936619743392459';
  }

  // Extract shortcode from Instagram URL
  extractShortcode(url) {
    const match = url.match(/instagram\.com\/(?:[A-Za-z0-9_.]+\/)?(p|reels|reel|stories)\/([A-Za-z0-9-_]+)/);
    return match ? match[2] : null;
  }

  // Get Instagram data using GraphQL API
  async getInstagramData(shortcode) {
    try {
      console.log(`Trying Instagram GraphQL API for shortcode: ${shortcode}`);
      
      const graphqlUrl = new URL("https://www.instagram.com/api/graphql");
      graphqlUrl.searchParams.set("variables", JSON.stringify({ shortcode: shortcode }));
      graphqlUrl.searchParams.set("doc_id", "10015901848480474");
      graphqlUrl.searchParams.set("lsd", "AVqbxe3J_YA");

      const response = await axios.post(graphqlUrl.toString(), null, {
        headers: {
          "User-Agent": this.userAgent,
          "Content-Type": "application/x-www-form-urlencoded",
          "X-IG-App-ID": this.xIgAppId,
          "X-FB-LSD": "AVqbxe3J_YA",
          "X-ASBD-ID": "129477",
          "Sec-Fetch-Site": "same-origin",
          "Accept": "application/json"
        },
        timeout: 15000
      });

      const json = response.data;
      console.log('✅ GraphQL API response received');
      
      return json;
    } catch (error) {
      console.log(`❌ GraphQL API failed: ${error.message}`);
      return null;
    }
  }

  // Extract carousel items from GraphQL response
  extractCarouselItems(graphqlData) {
    try {
      const items = [];
      
      // Navigate to the media data - try different response structures
      let media = null;
      
      // Try the expected structure first
      if (graphqlData.data?.xdt_api__v1__media__shortcode__web_info?.items?.[0]) {
        media = graphqlData.data.xdt_api__v1__media__shortcode__web_info.items[0];
      }
      // Try alternative structure (this is what we're actually getting)
      else if (graphqlData.data?.xdt_shortcode_media) {
        media = graphqlData.data.xdt_shortcode_media;
      }
      
      if (!media) {
        console.log('No media data found in GraphQL response');
        console.log('Available data keys:', Object.keys(graphqlData.data || {}));
        
        // Check if the media is null (private/restricted/deleted)
        if (graphqlData.data?.xdt_shortcode_media === null) {
          console.log('⚠️ Post appears to be private, restricted, or deleted (xdt_shortcode_media is null)');
          console.log('📝 This is why GraphQL fails but snapsave may still work');
        }
        
        console.log('Full response structure:', JSON.stringify(graphqlData.data, null, 2).substring(0, 500) + '...');
        return [];
      }

      console.log(`Media type: ${media.product_type || 'unknown'}`);
      console.log(`Is video: ${media.is_video}`);
      console.log(`Has carousel: ${!!media.edge_sidecar_to_children}`);
      
      // Check for pinning information
      const isPinned = media.is_pinned || media.pinned || false;
      if (isPinned) {
        console.log(`📌 Post is PINNED on profile`);
      }

      // Check for carousel items using edge_sidecar_to_children
      if (media.edge_sidecar_to_children && media.edge_sidecar_to_children.edges) {
        // GraphQL format - carousel
        console.log(`Processing carousel with ${media.edge_sidecar_to_children.edges.length} items`);
        media.edge_sidecar_to_children.edges.forEach((edge, index) => {
          const node = edge.node;
          const isVideo = node.is_video;
          // Prefer highest-resolution candidate when available
          const imageCandidates = node.display_resources || [];
          const bestImage = imageCandidates.length ? imageCandidates[imageCandidates.length - 1]?.src : node.display_url;
          const item = {
            carouselIndex: index + 1,
            isVideo: isVideo,
            displayUrl: isVideo ? node.video_url : (bestImage || node.display_url),
            videoUrl: isVideo ? node.video_url : null,
            thumbnailUrl: node.thumbnail_src || bestImage || node.display_url,
            quality: isVideo ? 'Video' : 'Image',
            dimensions: {
              width: node.dimensions?.width,
              height: node.dimensions?.height
            }
          };
          items.push(item);
        });
      } else if (media.product_type === "carousel_container" && media.carousel_media) {
        // Direct API format
        console.log(`Processing carousel with ${media.carousel_media.length} items`);
        media.carousel_media.forEach((item, index) => {
          const isVideo = item.media_type === 2;
          const candidates = item.image_versions2?.candidates || [];
          const best = candidates.length ? candidates[0] : null; // IG often has highest-res first here
          const carouselItem = {
            carouselIndex: index + 1,
            isVideo: isVideo,
            displayUrl: isVideo ? item.video_versions?.[0]?.url : (best?.url || candidates[candidates.length - 1]?.url),
            videoUrl: isVideo ? item.video_versions?.[0]?.url : null,
            thumbnailUrl: best?.url || candidates[candidates.length - 1]?.url,
            quality: isVideo ? 'Video' : 'Image',
            dimensions: {
              width: best?.width || item.image_versions2?.candidates?.[0]?.width,
              height: best?.height || item.image_versions2?.candidates?.[0]?.height
            }
          };
          items.push(carouselItem);
        });
      } else {
        // Single media item
        console.log('Processing single media item');
        const isVideo = media.is_video;
        const item = {
          carouselIndex: 1,
          isVideo: isVideo,
          displayUrl: isVideo ? media.video_url : media.display_url,
          videoUrl: isVideo ? media.video_url : null,
          thumbnailUrl: media.thumbnail_src,
          quality: isVideo ? 'Video' : 'Image',
          dimensions: {
            width: media.dimensions?.width,
            height: media.dimensions?.height
          }
        };
        items.push(item);
      }
      
      console.log(`Extracted ${items.length} items from GraphQL response`);
      return items;
      
    } catch (error) {
      console.error('Error extracting carousel items from GraphQL:', error.message);
      return [];
    }
  }

  // Main method to download carousel
  async downloadCarousel(url) {
    try {
      console.log(`Processing carousel: ${url}`);
      
      const shortcode = this.extractShortcode(url);
      if (!shortcode) {
        throw new Error('Invalid Instagram URL');
      }
      
      console.log(`Extracted shortcode: ${shortcode}`);
      
      // Try GraphQL method first
      console.log('🔄 Trying Instagram GraphQL API...');
      const graphqlData = await this.getInstagramData(shortcode);
      let carouselItems = [];
      
      if (graphqlData) {
        carouselItems = this.extractCarouselItems(graphqlData);
        console.log(`GraphQL method found ${carouselItems.length} carousel items`);
      }
      
      // If GraphQL method failed or found no items, fallback to snapsave
      if (carouselItems.length === 0) {
        console.log('⚠️ GraphQL method failed, falling back to snapsave...');
        return {
          developer: 'Instagram GraphQL Downloader',
          status: false,
          msg: 'GraphQL method failed - will use snapsave fallback'
        };
      }
      
      // Check if post is pinned from GraphQL data
      const isPinned = graphqlData?.data?.xdt_shortcode_media?.is_pinned || false;
      
      // Format results for compatibility
      const formattedItems = carouselItems.map(item => ({
        quality: item.quality,
        thumb: item.thumbnailUrl,
        url: item.displayUrl,
        isProgress: false,
        carouselIndex: item.carouselIndex,
        isVideo: item.isVideo,
        isPinned: isPinned // Add pinning information to each item
      }));
      
      console.log(`✅ Successfully formatted ${formattedItems.length} carousel items${isPinned ? ' (PINNED POST)' : ''}`);
      
      return {
        developer: 'Instagram GraphQL Downloader',
        status: true,
        data: formattedItems,
        isPinned: isPinned // Include pinning status in response
      };
      
    } catch (error) {
      console.error('Error downloading carousel:', error.message);
      return {
        developer: 'Instagram GraphQL Downloader',
        status: false,
        msg: error.message
      };
    }
  }
}

module.exports = InstagramCarouselDownloader;
