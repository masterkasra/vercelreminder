import { getRedis, readJSON, updateJSON } from '../lib/db.js';
import { tg, webhookSecret } from '../lib/telegram.js';
import { getChatSettings, updateChatSettings } from '../lib/settings.js';
import { buildTaskList, snoozeTarget, whenLabel, reminderTitle, toLatinDigits, fa, HELP_TEXT } from '../lib/bot.js';

const SNOOZE_ACTIONS = { snooze: '1h', snz10m: '10m', snz1h: '1h', snztonight: 'tonight', snztomorrow: 'tomorrow' };
const TRASH_TTL = 24 * 60 * 60;

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

    if (update.callback_query) await handleCallback(redis, update.callback_query);
    else if (update.message && update.message.text) await handleMessage(update.message);
  } catch (e) {
    console.error("Webhook Error", e);
  }
  return res.status(200).send('OK');
}

// ۱. دکمه‌های شیشه‌ای: complete_ID و snz*_ID روی پیام یادآور، ld/lx_kind_ID روی لیست‌ها، restore_ID بعد از حذف
async function handleCallback(redis, cb) {
  const chatId = cb.message.chat.id;
  const messageId = cb.message.message_id;
  const key = `reminders:${chatId}`;
  const parts = String(cb.data || '').split('_');
  const action = parts[0];
  const kind = parts.length > 2 ? parts[1] : null;
  const id = Number(parts[parts.length - 1]); // Number و نه parseInt: شناسه‌های اعشاری تکرارهای قدیمی
  const { tzOffsetMinutes: tz } = await getChatSettings(chatId);
  const now = Date.now();
  const answer = text => tg('answerCallbackQuery', { callback_query_id: cb.id, text: text ? text.slice(0, 190) : undefined });

  if (action === 'restore') {
    const trashKey = `trash:${chatId}:${id}`;
    const trashed = await readJSON(trashKey, null);
    if (!trashed) return answer('مهلت بازگردانی تمام شده است.');
    await updateJSON(key, [], list => list.some(r => r.id === id) ? undefined : [...list, trashed.reminder]);
    if (trashed.attachment) await redis.set(`attachment:${chatId}:${id}`, trashed.attachment);
    await redis.del(trashKey);
    await tg('editMessageText', { chat_id: chatId, message_id: messageId, text: `↩️ «${reminderTitle(trashed.reminder)}» بازگردانده شد.` });
    return answer('بازگردانده شد');
  }

  const preset = SNOOZE_ACTIONS[action];
  if (!['complete', 'ld', 'lx'].includes(action) && !preset) return answer();

  let found = null;
  await updateJSON(key, [], list => {
    found = null; // ممکن است با WATCH دوباره اجرا شود
    const index = list.findIndex(r => r.id === id);
    if (index === -1) return undefined;
    const r = list[index];
    found = { ...r };
    if (action === 'lx') list.splice(index, 1);
    else if (preset) Object.assign(r, { datetime: new Date(snoozeTarget(preset, now, tz)).toISOString(), sent: false, completed: false });
    else r.completed = true;
    return list;
  });
  if (!found) return answer('این یادآور دیگر وجود ندارد.');
  const title = reminderTitle(found);

  if (action === 'ld' || action === 'lx') {
    if (action === 'lx') {
      // حذف برگشت‌پذیر: تا ۲۴ ساعت با دکمه «بازگردانی»
      const attachmentKey = `attachment:${chatId}:${id}`;
      const attachment = await redis.get(attachmentKey);
      await redis.set(`trash:${chatId}:${id}`, JSON.stringify({ reminder: found, attachment }), { EX: TRASH_TTL });
      if (attachment) await redis.del(attachmentKey);
      await tg('sendMessage', {
        chat_id: chatId, text: `🗑 «${title}» حذف شد.`,
        reply_markup: { inline_keyboard: [[{ text: '↩️ بازگردانی', callback_data: `restore_${id}` }]] }
      });
    }
    const list = buildTaskList(await readJSON(key, []), kind === 'l' ? 'l' : 't', now, tz);
    await tg('editMessageText', { chat_id: chatId, message_id: messageId, text: list.text, parse_mode: 'HTML', reply_markup: list.reply_markup });
    return answer(action === 'ld' ? `✅ «${title}» انجام شد` : '🗑 حذف شد');
  }

  const note = preset
    ? `💤 یادآوری به ${whenLabel(snoozeTarget(preset, now, tz), now, tz)} موکول شد`
    : '✅ توسط شما انجام شد';
  await tg('editMessageText', { chat_id: chatId, message_id: messageId, text: `${cb.message.text}\n\n${note}` });
  return answer(note);
}

// ۲. دستورها و ثبت سریع متنی
async function handleMessage(message) {
  const chatId = message.chat.id;
  const text = toLatinDigits(message.text).trim();
  const key = `reminders:${chatId}`;
  const send = body => tg('sendMessage', { chat_id: chatId, ...body });
  const settings = await getChatSettings(chatId);
  const tz = settings.tzOffsetMinutes;

  const firstWord = text.split(/\s+/)[0];
  const command = firstWord.startsWith('/') ? firstWord.split('@')[0].toLowerCase() : null; // «/today@my_bot» در گروه‌ها
  const arg = command ? text.slice(firstWord.length).trim().toLowerCase() : '';

  if (command === '/start' || command === '/id') {
    return send({ text: `👋 سلام! شناسه تلگرام (Chat ID) شما:\n\n${chatId}\n\nاین عدد را در فرم ثبت‌نام سایت وارد کنید. کد تأیید هم در همین چت برایتان ارسال می‌شود.\n\nراهنمای دستورها: /help` });
  }
  if (command === '/help') return send({ text: HELP_TEXT });

  if (command === '/today' || command === '/list') {
    const list = buildTaskList(await readJSON(key, []), command === '/today' ? 't' : 'l', Date.now(), tz);
    return send({ text: list.text, parse_mode: 'HTML', reply_markup: list.reply_markup });
  }

  if (command === '/summary') {
    let patch = null;
    if (['off', 'خاموش'].includes(arg)) patch = { dailySummary: false };
    else if (['on', 'روشن'].includes(arg)) patch = { dailySummary: true };
    else if (/^\d{1,2}$/.test(arg) && Number(arg) <= 23) patch = { dailySummary: true, summaryHour: Number(arg) };
    else if (arg) return send({ text: 'استفاده: /summary on یا /summary off یا /summary 7 (ساعت ۰ تا ۲۳)' });

    const s = patch ? await updateChatSettings(chatId, patch) : settings;
    return send({
      text: s.dailySummary
        ? `☀️ خلاصه صبحگاهی روشن است و هر روز ساعت ${fa(String(s.summaryHour).padStart(2, '0'))}:۰۰ ارسال می‌شود.\n\nتغییر ساعت: /summary 7\nخاموش کردن: /summary off`
        : '🌙 خلاصه صبحگاهی خاموش است.\n\nروشن کردن: /summary on'
    });
  }

  // جستجوی الگو: "نام کار فردا ساعت 18:30"
  const match = !command && text.match(/(.*?)\s+(امروز|فردا)\s+ساعت\s+(\d{1,2})(?::(\d{2}))?/i);
  const hour = match ? parseInt(match[3]) : NaN;
  const minute = match && match[4] ? parseInt(match[4]) : 0;

  if (match && hour <= 23 && minute <= 59) {
    const title = match[1].trim().slice(0, 500);
    const day = match[2];
    // ساعت به وقت محلی کاربر (پیش‌فرض تهران)، نه UTC سرور ورسل
    const local = new Date(Date.now() - tz * 60 * 1000);
    const targetMs = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + (day === 'فردا' ? 1 : 0), hour, minute) + tz * 60 * 1000;

    await updateJSON(key, [], reminders => [...reminders, {
      id: Date.now(), title, datetime: new Date(targetMs).toISOString(),
      priority: 'medium', advanceNotice: 0, recurring: 'none', tag: 'general', subtasks: [], attachment: null,
      completed: false, sent: false, advanceSent: false, desc: 'ثبت سریع از تلگرام'
    }]);

    const timeStr = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    return send({ text: `✅ یادآور "${title}" برای ${day} ساعت ${timeStr} در سیستم ثبت شد.\n\nکارهای امروز: /today` });
  }

  if (command) return send({ text: `این دستور را نمی‌شناسم.\n\n${HELP_TEXT}` });
  return send({ text: `🤖 *راهنمای ثبت سریع:*\nبرای ثبت یادآور از داخل تلگرام، دقیقاً با فرمت زیر تایپ کنید:\n\n👉 *مثال:* خرید نان فردا ساعت 18:30\n👉 *مثال:* چک کردن ایمیل امروز ساعت 9\n\nهمه دستورها: /help`, parse_mode: 'Markdown' });
}
