import { getRedis, updateJSON } from '../lib/db.js';
import { tg, webhookSecret } from '../lib/telegram.js';

const TEHRAN_OFFSET_MS = 3.5 * 60 * 60 * 1000; // سرور ورسل روی UTC است؛ ساعت کاربر به وقت تهران است

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).send('Webhook is running');
  const update = req.body || {};

  try {
    const redis = await getRedis();

    // درخواست‌های جعلی رد می‌شوند (بعد از اینکه cron وب‌هوک را با secret_token ثبت کرد، یا اگر TELEGRAM_WEBHOOK_SECRET تنظیم شده باشد)
    const enforce = process.env.TELEGRAM_WEBHOOK_SECRET || await redis.get('config:webhook_secured');
    if (enforce && req.headers['x-telegram-bot-api-secret-token'] !== webhookSecret()) {
      return res.status(401).send('Unauthorized');
    }

    // ۱. پردازش کلیک روی دکمه‌های شیشه‌ای
    if (update.callback_query) {
      const cb = update.callback_query;
      const chatId = cb.message.chat.id;
      const sep = cb.data.indexOf('_');
      const action = cb.data.slice(0, sep);
      const id = Number(cb.data.slice(sep + 1)); // parseInt شناسه‌های اعشاری تکرارهای قدیمی را خراب می‌کرد

      let note = '';
      let found = false;
      await updateJSON(`reminders:${chatId}`, [], reminders => {
        const r = reminders.find(x => x.id === id);
        found = Boolean(r);
        if (!r) return undefined;
        if (action === 'complete') {
          r.completed = true;
          note = '✅ توسط شما انجام شد';
        } else if (action === 'snooze') {
          // تعویق به مدت ۱ ساعت از الان (نه از زمان قبلی که ممکن است گذشته باشد)
          r.datetime = new Date(Date.now() + 60 * 60 * 1000).toISOString();
          r.sent = false;
          r.completed = false;
          note = '💤 یادآوری به ۱ ساعت دیگر موکول شد';
        } else {
          return undefined;
        }
        return reminders;
      });

      if (note) await tg('editMessageText', { chat_id: chatId, message_id: cb.message.message_id, text: `${cb.message.text}\n\n${note}` });
      await tg('answerCallbackQuery', { callback_query_id: cb.id, text: found ? (note || undefined) : 'این یادآور دیگر وجود ندارد.' });
      return res.status(200).send('OK');
    }

    // ۲. پردازش تایپ مستقیم در تلگرام (NLP ساده)
    if (update.message && update.message.text) {
      const chatId = update.message.chat.id;
      // تبدیل اعداد فارسی و عربی به انگلیسی
      const text = update.message.text
        .replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
        .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));

      if (text.startsWith('/start') || text.startsWith('/id')) {
        await tg('sendMessage', { chat_id: chatId, text: `👋 سلام! شناسه تلگرام (Chat ID) شما:\n\n${chatId}\n\nاین عدد را در فرم ثبت‌نام سایت وارد کنید. کد تأیید هم در همین چت برایتان ارسال می‌شود.` });
        return res.status(200).send('OK');
      }

      // جستجوی الگو: "نام کار فردا ساعت 18:30"
      const match = text.match(/(.*?)\s+(امروز|فردا)\s+ساعت\s+(\d{1,2})(?::(\d{2}))?/i);
      const hour = match ? parseInt(match[3]) : NaN;
      const minute = match && match[4] ? parseInt(match[4]) : 0;

      if (match && hour <= 23 && minute <= 59) {
        const title = match[1].trim().slice(0, 500);
        const day = match[2];

        const nowTehran = new Date(Date.now() + TEHRAN_OFFSET_MS);
        const targetMs = Date.UTC(nowTehran.getUTCFullYear(), nowTehran.getUTCMonth(), nowTehran.getUTCDate() + (day === 'فردا' ? 1 : 0), hour, minute) - TEHRAN_OFFSET_MS;

        await updateJSON(`reminders:${chatId}`, [], reminders => [...reminders, {
          id: Date.now(), title, datetime: new Date(targetMs).toISOString(),
          priority: 'medium', advanceNotice: 0, recurring: 'none', tag: 'general', subtasks: [], attachment: null,
          completed: false, sent: false, advanceSent: false, desc: 'ثبت سریع از تلگرام'
        }]);

        const timeStr = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
        await tg('sendMessage', { chat_id: chatId, text: `✅ یادآور "${title}" برای ${day} ساعت ${timeStr} در سیستم ثبت شد.` });
      } else {
        await tg('sendMessage', { chat_id: chatId, text: `🤖 *راهنمای ثبت سریع:*\nبرای ثبت یادآور از داخل تلگرام، دقیقاً با فرمت زیر تایپ کنید:\n\n👉 *مثال:* خرید نان فردا ساعت 18:30\n👉 *مثال:* چک کردن ایمیل امروز ساعت 9`, parse_mode: 'Markdown' });
      }
    }
  } catch (e) {
    console.error("Webhook Error", e);
  }
  return res.status(200).send('OK');
}
