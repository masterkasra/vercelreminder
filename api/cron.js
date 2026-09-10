import { createClient } from 'redis';

const client = createClient({ url: process.env.REDIS_URL });
client.on('error', err => console.error('Redis Error:', err));

export default async function handler(req, res) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return res.status(500).json({ error: 'Telegram token missing' });

  try {
    if (!client.isOpen) await client.connect();
    
    const keys = await client.keys('reminders:*');
    const now = new Date().getTime();
    let messagesSent = 0;

    for (const key of keys) {
      const chatId = key.split(':')[1];
      const data = await client.get(key);
      let reminders = data ? JSON.parse(data) : [];
      let dbChanged = false;

      for (let r of reminders) {
        const targetTime = new Date(r.datetime).getTime();
        if (!r.sent && !r.completed && targetTime <= now) {
          const priorityEmoji = r.priority === 'high' ? '🔴 فوری' : r.priority === 'medium' ? '🟡 متوسط' : '🟢 عادی';
          const msg = `⏰ *یادآور رسید!*\n\n📌 عنوان: ${r.title}\n📝 توضیحات: ${r.desc || '-'}\n📊 اولویت: ${priorityEmoji}`;
          
          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: msg, parse_mode: 'Markdown' })
          });

          r.sent = true;
          dbChanged = true;
          messagesSent++;
        }
      }
      if (dbChanged) await client.set(key, JSON.stringify(reminders));
    }
    return res.status(200).json({ success: true, sent: messagesSent });
  } catch (error) {
    console.error(">>> Cron Error:", error);
    return res.status(500).json({ error: error.message });
  }
}
