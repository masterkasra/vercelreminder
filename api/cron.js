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
        if (r.completed) continue; // اگر انجام شده، عبور کن

        const targetTime = new Date(r.datetime).getTime();
        const advanceDays = r.advanceNotice || 0;
        
        // محاسبه زمان پیش‌هشدار (کسر کردن تعداد روز از زمان اصلی)
        const advanceTime = targetTime - (advanceDays * 24 * 60 * 60 * 1000);

        // ۱. بررسی یادآوری زودهنگام
        if (advanceDays > 0 && !r.advanceSent && advanceTime <= now && targetTime > now) {
          const msg = `⏳ *هشدار زودهنگام (${advanceDays} روز مانده)*\n\n📌 عنوان: ${r.title}\n📝 توضیحات: ${r.desc || '-'}`;
          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: msg, parse_mode: 'Markdown' })
          });
          r.advanceSent = true;
          dbChanged = true;
          messagesSent++;
        }

        // ۲. بررسی یادآوری زمان اصلی
        if (!r.sent && targetTime <= now) {
          const priorityEmoji = r.priority === 'high' ? '🔴 فوری' : r.priority === 'medium' ? '🟡 متوسط' : '🟢 عادی';
          const msg = `⏰ *سررسید یادآور!*\n\n📌 عنوان: ${r.title}\n📝 توضیحات: ${r.desc || '-'}\n📊 اولویت: ${priorityEmoji}`;
          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
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
