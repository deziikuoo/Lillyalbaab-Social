const fs = require('fs');
const path = require('path');

function fixTelegramConfig() {
  console.log('🔧 Fixing Telegram Configuration...\n');
  
  const envPath = path.join(__dirname, '.env');
  
  // Read current .env file
  let envContent = '';
  try {
    envContent = fs.readFileSync(envPath, 'utf8');
  } catch (error) {
    console.log('📝 Creating new .env file...');
  }
  
  // Parse existing content
  const lines = envContent.split('\n');
  const envVars = {};
  
  lines.forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length > 0) {
        envVars[key] = valueParts.join('=');
      }
    }
  });
  
  // Update Telegram configuration
  const currentChannelId = envVars.TELEGRAM_CHANNEL_ID;
  const correctChannelId = '-1002885871132';
  
  console.log('Current configuration:');
  console.log(`TELEGRAM_BOT_TOKEN: ${envVars.TELEGRAM_BOT_TOKEN ? '✅ Set' : '❌ Missing'}`);
  console.log(`TELEGRAM_CHANNEL_ID: ${currentChannelId || '❌ Missing'}`);
  console.log(`Correct Channel ID: ${correctChannelId}`);
  console.log('');
  
  if (currentChannelId === correctChannelId) {
    console.log('✅ Channel ID is already correct!');
    return;
  }
  
  // Update the channel ID
  envVars.TELEGRAM_CHANNEL_ID = correctChannelId;
  
  // Ensure other required variables are present
  if (!envVars.PORT) envVars.PORT = '3000';
  if (!envVars.USER_AGENT) {
    envVars.USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  }
  if (!envVars.X_IG_APP_ID) envVars.X_IG_APP_ID = '936619743392459';
  
  // Create new .env content
  let newEnvContent = '# Server\n';
  newEnvContent += `PORT=${envVars.PORT}\n\n`;
  newEnvContent += '# Telegram Configuration\n';
  newEnvContent += `TELEGRAM_BOT_TOKEN=${envVars.TELEGRAM_BOT_TOKEN}\n`;
  newEnvContent += `TELEGRAM_CHANNEL_ID=${envVars.TELEGRAM_CHANNEL_ID}\n\n`;
  newEnvContent += '# Instagram Configuration\n';
  newEnvContent += `USER_AGENT=${envVars.USER_AGENT}\n`;
  newEnvContent += `X_IG_APP_ID=${envVars.X_IG_APP_ID}\n`;
  
  // Write the new .env file
  try {
    fs.writeFileSync(envPath, newEnvContent);
    console.log('✅ .env file updated successfully!');
    console.log(`   Changed TELEGRAM_CHANNEL_ID from ${currentChannelId || 'missing'} to ${correctChannelId}`);
    console.log('');
    console.log('🔧 Next steps:');
    console.log('   1. Run: node test-telegram.js');
    console.log('   2. If successful, restart your main application');
  } catch (error) {
    console.error('❌ Failed to update .env file:', error.message);
    console.log('');
    console.log('🔧 Manual fix required:');
    console.log('   Update your .env file manually:');
    console.log(`   TELEGRAM_CHANNEL_ID=${correctChannelId}`);
  }
}

fixTelegramConfig();
