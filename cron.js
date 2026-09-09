import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return res.status(500).json({ error: 'Telegram token missing' });

  try {
    // پیدا کردن لیست همه کاربران در دیتابیس
    const keys = await kv.keys('reminders:*');
    const now = new Date().getTime();
    let messagesSent = 0;

    for (const key of keys) {
      const chatId = key.split(':')[1];
      let reminders = await kv.get(key) || [];
      let dbChanged = false;

      for (let r of reminders) {
        const targetTime = new Date(r.datetime).getTime();
        
        // اگر زمان سررسید رسیده و قبلا ارسال نشده و تکمیل هم نشده
        if (!r.sent && !r.completed && targetTime <= now) {
          const priorityEmoji = r.priority === 'high' ? '🔴 فوری' : r.priority === 'medium' ? '🟡 متوسط' : '🟢 عادی';
          const msg = `⏰ *یادآور رسید!*\n\n📌 عنوان: ${r.title}\n📝 توضیحات: ${r.desc || '-'}\n📊 اولویت: ${priorityEmoji}`;
          
          // ارسال به تلگرام
          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: msg, parse_mode: 'Markdown' })
          });

          r.sent = true; // علامت‌گذاری به عنوان ارسال شده
          dbChanged = true;
          messagesSent++;
        }
      }

      // آپدیت دیتابیس در صورت ارسال پیام
      if (dbChanged) await kv.set(key, reminders);
    }

    return res.status(200).json({ success: true, sent: messagesSent });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}