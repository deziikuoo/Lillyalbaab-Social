const axios = require('axios');

const API_BASE = 'http://localhost:3000';

async function monitorStats() {
  try {
    console.log('📊 Instagram & Telegram Request Monitor');
    console.log('=====================================\n');
    
    // Get current stats
    const statsResponse = await axios.get(`${API_BASE}/stats`);
    const stats = statsResponse.data;
    
    // Display stats
    console.log(`⏱️  Server Uptime: ${stats.uptime.days}d ${stats.uptime.hours}h ${stats.uptime.minutes}m`);
    console.log(`🕐 Started: ${new Date(stats.startTime).toLocaleString()}`);
    console.log('');
    
    console.log('📱 Instagram Requests:');
    console.log(`   Total: ${stats.instagram.total}`);
    console.log(`   ✅ Successful: ${stats.instagram.successful}`);
    console.log(`   ❌ Failed: ${stats.instagram.failed}`);
    console.log(`   🚫 Rate Limited: ${stats.instagram.rateLimited}`);
    console.log(`   📈 Last Hour: ${stats.rates.instagramPerHour}`);
    console.log(`   📈 Last 24h: ${stats.rates.instagramPerDay}`);
    console.log('');
    
    console.log('📤 Telegram Requests:');
    console.log(`   Total: ${stats.telegram.total}`);
    console.log(`   ✅ Successful: ${stats.telegram.successful}`);
    console.log(`   ❌ Failed: ${stats.telegram.failed}`);
    console.log(`   📸 Photos: ${stats.telegram.photos}`);
    console.log(`   🎬 Videos: ${stats.telegram.videos}`);
    console.log(`   📈 Last Hour: ${stats.rates.telegramPerHour}`);
    console.log(`   📈 Last 24h: ${stats.rates.telegramPerDay}`);
    console.log('');
    
    // Calculate success rates
    const instagramSuccessRate = stats.instagram.total > 0 ? 
      ((stats.instagram.successful / stats.instagram.total) * 100).toFixed(1) : 0;
    const telegramSuccessRate = stats.telegram.total > 0 ? 
      ((stats.telegram.successful / stats.telegram.total) * 100).toFixed(1) : 0;
    
    console.log('📊 Success Rates:');
    console.log(`   Instagram: ${instagramSuccessRate}%`);
    console.log(`   Telegram: ${telegramSuccessRate}%`);
    console.log('');
    
    // Show recent logs
    console.log('📋 Recent Activity (last 10 requests):');
    const logsResponse = await axios.get(`${API_BASE}/logs`);
    const logs = logsResponse.data.logs.slice(0, 10);
    
    if (logs.length > 0) {
      logs.forEach((log, index) => {
        console.log(`   ${index + 1}. ${log}`);
      });
    } else {
      console.log('   No recent activity');
    }
    
  } catch (error) {
    console.error('❌ Error fetching stats:', error.message);
    console.log('Make sure the server is running on http://localhost:3000');
  }
}

// Run monitor
monitorStats();
