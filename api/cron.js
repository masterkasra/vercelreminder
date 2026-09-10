import { createClient } from 'redis';

const client = createClient({ url: process.env.REDIS_URL });
client.on('error', err => console.error('Redis Error:', err));

export default async function handler(req, res) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return res.status(500).json({ error: 'Token missing' });

  try {
    if (!client.isOpen) await client.connect();
    const keys = await client.keys('reminders:*');
    const now = new Date().getTime();
    let messagesSent = 0;

    for (const key of keys) {
      const chatId = key.split(':')[1];
      let reminders = JSON.parse(await client.get(key) || '[]');
      let dbChanged = false;

      for (let r of reminders) {
        if (r.completed) continue;
        const targetTime = new Date(r.datetime).getTime();
        const advanceTime = targetTime - ((r.advanceNotice || 0) * 24 * 60 * 60 * 1000);

        // ۱. ارسال هشدار زودهنگام
        if (r.advanceNotice > 0 && !r.advanceSent && advanceTime <= now && targetTime > now) {
          const msg = `⏳ *هشدار (${r.advanceNotice} روز مانده)*\n\n📌 عنوان: ${r.title}`;
          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: msg, parse_mode: 'Markdown' })
          });
          r.advanceSent = true; dbChanged = true; messagesSent++;
        }

        // ۲. سررسید اصلی + دکمه‌های شیشه‌ای + تکرار دوره‌ای
        if (!r.sent && targetTime <= now) {
          // دکمه‌های شیشه‌ای تلگرام
          const keyboard = {
            inline_keyboard: [
              [{ text: "✅ انجام شد", callback_data: `complete_${r.id}` }],
              [{ text: "💤 یادآوری ۱ ساعت بعد", callback_data: `snooze_${r.id}` }]
            ]
          };

          const msg = `⏰ *یادآور رسید!*\n\n📌 عنوان: ${r.title}\n📝 توضیحات: ${r.desc || '-'}`;
          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: msg, parse_mode: 'Markdown', reply_markup: keyboard })
          });
          
          r.sent = true; dbChanged = true; messagesSent++;

          // ساخت خودکار یادآور بعدی برای کارهای دوره‌ای (روزانه/هفتگی/ماهانه)
          if (r.recurring && r.recurring !== 'none') {
            let nextDate = new Date(r.datetime);
            if (r.recurring === 'daily') nextDate.setDate(nextDate.getDate() + 1);
            else if (r.recurring === 'weekly') nextDate.setDate(nextDate.getDate() + 7);
            else if (r.recurring === 'monthly') nextDate.setDate(nextDate.getDate() + 30);
            
            reminders.push({ ...r, id: Date.now() + Math.random(), datetime: nextDate.toISOString(), sent: false, advanceSent: false, completed: false });
          }
        }
      }
      if (dbChanged) await client.set(key, JSON.stringify(reminders));
    }
    return res.status(200).json({ success: true, sent: messagesSent });
  } catch (error) { return res.status(500).json({ error: error.message }); }
}
