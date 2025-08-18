require('dotenv').config();
const axios = require('axios');

async function getChatId() {
  console.log('🔍 Getting Telegram Updates to find Chat ID...\n');
  
  const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  
  if (!TELEGRAM_BOT_TOKEN) {
    console.log('❌ TELEGRAM_BOT_TOKEN not found in .env file');
    return;
  }
  
  try {
    const response = await axios.get(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates`);
    
    if (response.data.ok) {
      const updates = response.data.result;
      
      if (updates.length === 0) {
        console.log('📭 No updates found. To get a chat ID:');
        console.log('   1. Send a message to your bot @TylaIG_bot');
        console.log('   2. Or add the bot to a group/channel');
        console.log('   3. Then run this script again');
        return;
      }
      
      console.log(`📨 Found ${updates.length} update(s):\n`);
      
      updates.forEach((update, index) => {
        console.log(`--- Update ${index + 1} ---`);
        
        if (update.message) {
          const chat = update.message.chat;
          console.log(`Type: Message`);
          console.log(`Chat ID: ${chat.id}`);
          console.log(`Chat Type: ${chat.type}`);
          console.log(`Chat Title: ${chat.title || chat.first_name || 'N/A'}`);
          console.log(`Username: ${chat.username || 'N/A'}`);
          console.log(`Message: ${update.message.text || 'N/A'}`);
        } else if (update.channel_post) {
          const chat = update.channel_post.chat;
          console.log(`Type: Channel Post`);
          console.log(`Chat ID: ${chat.id}`);
          console.log(`Chat Type: ${chat.type}`);
          console.log(`Chat Title: ${chat.title || 'N/A'}`);
          console.log(`Username: ${chat.username || 'N/A'}`);
          console.log(`Message: ${update.channel_post.text || 'N/A'}`);
        } else if (update.my_chat_member) {
          const chat = update.my_chat_member.chat;
          console.log(`Type: Chat Member Update`);
          console.log(`Chat ID: ${chat.id}`);
          console.log(`Chat Type: ${chat.type}`);
          console.log(`Chat Title: ${chat.title || chat.first_name || 'N/A'}`);
          console.log(`Username: ${chat.username || 'N/A'}`);
          console.log(`Status: ${update.my_chat_member.new_chat_member.status}`);
        }
        
        console.log('');
      });
      
      console.log('💡 To use one of these chat IDs, update your .env file:');
      console.log('   TELEGRAM_CHANNEL_ID=<chat_id_from_above>');
      console.log('\n🔧 Then test with: node test-telegram.js');
      
    } else {
      console.log('❌ Failed to get updates:', response.data.description);
    }
    
  } catch (error) {
    console.error('❌ Error getting updates:', error.message);
    if (error.response) {
      console.error('   Response:', error.response.data);
    }
  }
}

getChatId();
