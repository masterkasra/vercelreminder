import { createClient } from 'redis';

const client = createClient({ url: process.env.REDIS_URL });
client.on('error', err => console.error('Redis Error:', err));

const TEHRAN_OFFSET_MS = 3.5 * 60 * 60 * 1000; // سرور ورسل روی UTC است؛ ساعت کاربر به وقت تهران است

const tg = (token, method, body) => fetch(`https://api.telegram.org/bot${token}/${method}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
});

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).send('Webhook is running');

  // اگر TELEGRAM_WEBHOOK_SECRET تنظیم شده باشد، فقط درخواست‌های واقعی تلگرام پذیرفته می‌شوند
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (webhookSecret && req.headers['x-telegram-bot-api-secret-token'] !== webhookSecret) {
    return res.status(401).send('Unauthorized');
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const update = req.body;

  try {
    if (!client.isOpen) await client.connect();

    // ۱. پردازش کلیک روی دکمه‌های شیشه‌ای
    if (update.callback_query) {
      const cb = update.callback_query;
      const chatId = cb.message.chat.id;
      const sep = cb.data.indexOf('_');
      const action = cb.data.slice(0, sep);
      const id = Number(cb.data.slice(sep + 1)); // parseInt شناسه‌های اعشاری تکرارهای قدیمی را خراب می‌کرد
      const key = `reminders:${chatId}`;

      let reminders = JSON.parse(await client.get(key) || '[]');
      const index = reminders.findIndex(r => r.id === id);

      if (index > -1) {
        let note = '';
        if (action === 'complete') {
          reminders[index].completed = true;
          note = '✅ توسط شما انجام شد';
        } else if (action === 'snooze') {
          // تعویق به مدت ۱ ساعت از الان (نه از زمان قبلی که ممکن است گذشته باشد)
          reminders[index].datetime = new Date(Date.now() + 60 * 60 * 1000).toISOString();
          reminders[index].sent = false;
          reminders[index].completed = false;
          note = '💤 یادآوری به ۱ ساعت دیگر موکول شد';
        }
        if (note) {
          await client.set(key, JSON.stringify(reminders));
          await tg(token, 'editMessageText', { chat_id: chatId, message_id: cb.message.message_id, text: `${cb.message.text}\n\n${note}` });
        }
        await tg(token, 'answerCallbackQuery', { callback_query_id: cb.id, text: note || undefined });
      } else {
        await tg(token, 'answerCallbackQuery', { callback_query_id: cb.id, text: 'این یادآور دیگر وجود ندارد.' });
      }
      return res.status(200).send('OK');
    }

    // ۲. پردازش تایپ مستقیم در تلگرام (NLP ساده)
    if (update.message && update.message.text) {
      const chatId = update.message.chat.id;
      // تبدیل اعداد فارسی و عربی به انگلیسی
      const text = update.message.text
        .replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
        .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
      const key = `reminders:${chatId}`;

      // جستجوی الگو: "نام کار فردا ساعت 18:30"
      const match = text.match(/(.*?)\s+(امروز|فردا)\s+ساعت\s+(\d{1,2})(?::(\d{2}))?/i);
      const hour = match ? parseInt(match[3]) : NaN;
      const minute = match && match[4] ? parseInt(match[4]) : 0;

      if (match && hour <= 23 && minute <= 59) {
        const title = match[1].trim();
        const day = match[2];

        const nowTehran = new Date(Date.now() + TEHRAN_OFFSET_MS);
        const targetMs = Date.UTC(nowTehran.getUTCFullYear(), nowTehran.getUTCMonth(), nowTehran.getUTCDate() + (day === 'فردا' ? 1 : 0), hour, minute) - TEHRAN_OFFSET_MS;

        let reminders = JSON.parse(await client.get(key) || '[]');
        reminders.push({
          id: Date.now(), title, datetime: new Date(targetMs).toISOString(),
          priority: 'medium', advanceNotice: 0, recurring: 'none', tag: 'general',
          completed: false, sent: false, advanceSent: false, desc: 'ثبت سریع از تلگرام'
        });
        await client.set(key, JSON.stringify(reminders));

        const timeStr = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
        await tg(token, 'sendMessage', { chat_id: chatId, text: `✅ یادآور "${title}" برای ${day} ساعت ${timeStr} در سیستم ثبت شد.` });
      } else if (!text.startsWith('/start')) {
        await tg(token, 'sendMessage', { chat_id: chatId, text: `🤖 *راهنمای ثبت سریع:*\nبرای ثبت یادآور از داخل تلگرام، دقیقاً با فرمت زیر تایپ کنید:\n\n👉 *مثال:* خرید نان فردا ساعت 18:30\n👉 *مثال:* چک کردن ایمیل امروز ساعت 9`, parse_mode: 'Markdown' });
      }
    }
  } catch (e) {
    console.error("Webhook Error", e);
  }
  return res.status(200).send('OK');
}
