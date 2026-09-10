import { createClient } from 'redis';

const client = createClient({ url: process.env.REDIS_URL });
client.on('error', err => console.error('Redis Error:', err));

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).send('Webhook is running');
  
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const update = req.body;

  try {
    if (!client.isOpen) await client.connect();

    // ۱. پردازش کلیک روی دکمه‌های شیشه‌ای
    if (update.callback_query) {
      const cb = update.callback_query;
      const chatId = cb.message.chat.id;
      const [action, idStr] = cb.data.split('_');
      const id = parseInt(idStr);
      const key = `reminders:${chatId}`;
      
      let reminders = JSON.parse(await client.get(key) || '[]');
      const index = reminders.findIndex(r => r.id === id);
      
      if (index > -1) {
        if (action === 'complete') {
          reminders[index].completed = true;
          await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, message_id: cb.message.message_id, text: cb.message.text + '\n\n✅ *توسط شما انجام شد*' })
          });
        } else if (action === 'snooze') {
          // تعویق به مدت ۱ ساعت
          const newTime = new Date(reminders[index].datetime).getTime() + (60 * 60 * 1000);
          reminders[index].datetime = new Date(newTime).toISOString();
          reminders[index].sent = false;
          reminders[index].completed = false;
          await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, message_id: cb.message.message_id, text: cb.message.text + '\n\n💤 *یادآوری به ۱ ساعت دیگر موکول شد*' })
          });
        }
        await client.set(key, JSON.stringify(reminders));
      }
      return res.status(200).send('OK');
    }

    // ۲. پردازش تایپ مستقیم در تلگرام (NLP ساده)
    if (update.message && update.message.text) {
      const chatId = update.message.chat.id;
      // تبدیل اعداد فارسی به انگلیسی
      const text = update.message.text.replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
      const key = `reminders:${chatId}`;

      // جستجوی الگو: "نام کار فردا ساعت 18:30"
      const match = text.match(/(.*?)\s+(امروز|فردا)\s+ساعت\s+(\d{1,2})(?::(\d{2}))?/i);
      
      if (match) {
        const title = match[1].trim();
        const day = match[2];
        const hour = parseInt(match[3]);
        const minute = match[4] ? parseInt(match[4]) : 0;
        
        let targetDate = new Date();
        if (day === 'فردا') targetDate.setDate(targetDate.getDate() + 1);
        targetDate.setHours(hour, minute, 0, 0);

        let reminders = JSON.parse(await client.get(key) || '[]');
        reminders.push({
          id: Date.now(), title, datetime: targetDate.toISOString(),
          priority: 'medium', advanceNotice: 0, recurring: 'none',
          completed: false, sent: false, advanceSent: false, desc: 'ثبت سریع از تلگرام'
        });
        await client.set(key, JSON.stringify(reminders));

        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: `✅ یادآور "${title}" برای ${day} ساعت ${hour}:${minute === 0 ? '00' : minute} در سیستم ثبت شد.` })
        });
      } else if (!text.startsWith('/start')) {
         await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: `🤖 *راهنمای ثبت سریع:*\nبرای ثبت یادآور از داخل تلگرام، دقیقاً با فرمت زیر تایپ کنید:\n\n👉 *مثال:* خرید نان فردا ساعت 18:30\n👉 *مثال:* چک کردن ایمیل امروز ساعت 9`, parse_mode: 'Markdown' })
          });
      }
    }
  } catch (e) {
    console.error("Webhook Error", e);
  }
  return res.status(200).send('OK');
}
