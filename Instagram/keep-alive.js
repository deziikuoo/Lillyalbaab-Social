const axios = require('axios');

// Configuration
const HEALTH_URL = process.env.HEALTH_URL || 'http://localhost:3000/health';
const PING_INTERVAL = 13 * 60 * 1000; // 13 minutes in milliseconds
const LOG_PREFIX = '🔄 [KEEP-ALIVE]';

console.log(`${LOG_PREFIX} Starting keep-alive service...`);
console.log(`${LOG_PREFIX} Target URL: ${HEALTH_URL}`);
console.log(`${LOG_PREFIX} Ping interval: ${PING_INTERVAL / 1000 / 60} minutes`);

// Function to ping the health endpoint
async function pingHealthEndpoint() {
  try {
    const startTime = Date.now();
    const response = await axios.get(HEALTH_URL, {
      timeout: 30000, // 30 second timeout
      headers: {
        'User-Agent': 'Keep-Alive-Script/1.0'
      }
    });
    
    const endTime = Date.now();
    const responseTime = endTime - startTime;
    
    if (response.status === 200) {
      const health = response.data;
      console.log(`${LOG_PREFIX} ✅ Ping successful (${responseTime}ms)`);
      console.log(`   📊 Status: ${health.status}`);
      console.log(`   🎯 Polling: ${health.polling?.active ? 'Active' : 'Inactive'}`);
      console.log(`   🎯 Target: @${health.polling?.target || 'None'}`);
      console.log(`   💾 Database: ${health.database}`);
      console.log(`   ⏰ Uptime: ${Math.floor(health.uptime / 60)} minutes`);
    } else {
      console.log(`${LOG_PREFIX} ⚠️ Ping returned status ${response.status}`);
    }
  } catch (error) {
    console.log(`${LOG_PREFIX} ❌ Ping failed: ${error.message}`);
    
    if (error.code === 'ECONNREFUSED') {
      console.log(`   💡 Service might be starting up...`);
    } else if (error.code === 'ETIMEDOUT') {
      console.log(`   💡 Request timed out, service might be slow...`);
    }
  }
}

// Function to schedule the next ping
function scheduleNextPing() {
  const now = new Date();
  const nextPing = new Date(now.getTime() + PING_INTERVAL);
  
  console.log(`${LOG_PREFIX} ⏰ Next ping scheduled for: ${nextPing.toLocaleTimeString('en-US', { timeZone: 'America/New_York' })} EDT`);
  
  setTimeout(async () => {
    await pingHealthEndpoint();
    scheduleNextPing(); // Schedule the next one
  }, PING_INTERVAL);
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log(`\n${LOG_PREFIX} 🛑 Shutting down keep-alive service...`);
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log(`\n${LOG_PREFIX} 🛑 Shutting down keep-alive service...`);
  process.exit(0);
});

// Start the keep-alive service
async function startKeepAlive() {
  console.log(`${LOG_PREFIX} 🚀 Initial ping...`);
  await pingHealthEndpoint();
  
  console.log(`${LOG_PREFIX} 📅 Scheduling regular pings...`);
  scheduleNextPing();
}

// Start the service
startKeepAlive().catch(error => {
  console.error(`${LOG_PREFIX} 💥 Failed to start keep-alive service:`, error);
  process.exit(1);
});
