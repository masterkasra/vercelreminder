import jalaali from 'jalaali-js';
import { getRedis, readJSON, updateJSON, scanKeys } from '../lib/db.js';
import { sendPush } from '../lib/push.js';
import { tg, hasBotToken, webhookSecret } from '../lib/telegram.js';
import { getChatSettings } from '../lib/settings.js';
import { buildTaskList, dueKeyboard, localHour, localDateKey, escapeHtml, BOT_COMMANDS, PUSH_DUE_ACTIONS } from '../lib/bot.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const TEHRAN_OFFSET_MS = 3.5 * 60 * 60 * 1000; // ایران از ۱۴۰۱ ساعت تابستانی ندارد
const BOT_COMMANDS_VERSION = 'v1';

// یک ماه جلالی جلوتر با همان ساعت به وقت تهران؛ اگر آن روز در ماه بعد نبود، آخرین روز ماه
function addJalaliMonth(date) {
  const local = new Date(date.getTime() + TEHRAN_OFFSET_MS);
  const j = jalaali.toJalaali(local.getUTCFullYear(), local.getUTCMonth() + 1, local.getUTCDate());
  let jy = j.jy, jm = j.jm + 1;
  if (jm > 12) { jm = 1; jy++; }
  const g = jalaali.toGregorian(jy, jm, Math.min(j.jd, jalaali.jalaaliMonthLength(jy, jm)));
  return new Date(Date.UTC(g.gy, g.gm - 1, g.gd, local.getUTCHours(), local.getUTCMinutes(), local.getUTCSeconds()) - TEHRAN_OFFSET_MS);
}

// اولین تکرار بعد از الان (اگر cron مدتی خاموش بوده، تکرارهای عقب‌افتاده پشت سر هم ساخته نمی‌شوند)
function nextOccurrence(iso, recurring, now) {
  let d = new Date(iso);
  for (let i = 0; i < 5000 && d.getTime() <= now; i++) {
    if (recurring === 'daily') d = new Date(d.getTime() + DAY_MS);
    else if (recurring === 'weekly') d = new Date(d.getTime() + 7 * DAY_MS);
    else if (recurring === 'monthly') d = addJalaliMonth(d);
    else return null;
  }
  return d;
}

// true یعنی دیگر نباید دوباره تلاش کرد
async function sendTelegram(chatId, text, replyMarkup) {
  if (!hasBotToken()) return true;
  try {
    const res = await tg('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', reply_markup: replyMarkup });
    if (res.ok) return true;
    console.error('Telegram error', chatId, res.status, await res.text());
    // 400 (چت نامعتبر) و 403 (ربات بلاک شده) با تکرار درست نمی‌شوند
    return res.status === 400 || res.status === 403;
  } catch (err) {
    console.error('Telegram fetch failed', chatId, err);
    return false;
  }
}

// تنظیمات یک‌باره ربات: secret_token وب‌هوک (رد درخواست‌های جعلی) و فهرست دستورها در منوی تلگرام
async function ensureBotSetup(redis) {
  if (!hasBotToken()) return;
  try {
    if (!(await redis.get('config:webhook_secured'))) {
      const info = await (await tg('getWebhookInfo')).json();
      const url = info && info.result && info.result.url;
      if (url) {
        const res = await tg('setWebhook', { url, secret_token: webhookSecret() });
        if (res.ok) await redis.set('config:webhook_secured', '1');
        else console.error('setWebhook failed', res.status, await res.text());
      }
    }
    if ((await redis.get('config:bot_commands')) !== BOT_COMMANDS_VERSION) {
      const res = await tg('setMyCommands', { commands: BOT_COMMANDS });
      if (res.ok) await redis.set('config:bot_commands', BOT_COMMANDS_VERSION);
    }
  } catch (err) {
    console.error('ensureBotSetup failed', err);
  }
}

// خلاصه صبحگاهی: یک بار در روز، از ساعت انتخابی تا دو ساعت بعد (اگر cron مدتی قطع بود، عصر ارسال نشود)
async function maybeSendSummary(chatId, key, now) {
  if (!hasBotToken()) return false;
  const settings = await getChatSettings(chatId);
  const tz = settings.tzOffsetMinutes;
  const hour = localHour(now, tz);
  if (!settings.dailySummary || hour < settings.summaryHour || hour > settings.summaryHour + 2) return false;
  const today = localDateKey(now, tz);
  if (settings.lastSummaryDate === today) return false;

  let claimed = false; // قبل از ارسال ثبت می‌شود تا دو اجرای هم‌زمان cron دوبار نفرستند
  await updateJSON(`settings:${chatId}`, {}, current => {
    claimed = current.lastSummaryDate !== today;
    return claimed ? { ...current, lastSummaryDate: today } : undefined;
  });
  if (!claimed) return false;

  const list = buildTaskList(await readJSON(key, []), 't', now, tz);
  if (list.empty) return false; // روزهای بدون کار پیام نمی‌فرستیم
  await sendTelegram(chatId, `☀️ <b>صبح بخیر!</b>\n\n${list.text}\n\n<i>خاموش کردن خلاصه: /summary off</i>`, list.reply_markup);
  return true;
}

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}` && req.query.secret !== secret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const redis = await getRedis();
    await redis.set('config:last_cron_run', String(Date.now())); // در تنظیمات اپ نشان داده می‌شود
    await ensureBotSetup(redis);
    const keys = await scanKeys('reminders:*');
    const now = Date.now();
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    let messagesSent = 0, pushesSent = 0, summariesSent = 0;

    for (const key of keys) {
      const chatId = key.slice('reminders:'.length);
      const reminders = await readJSON(key, []);
      const subs = await readJSON(`push:${chatId}`, []);
      const updates = new Map(); // id -> { datetime, fields }
      const newOccurrences = [];
      const expiredEndpoints = [];
      const markUpdate = (r, fields) => {
        const prev = updates.get(r.id);
        updates.set(r.id, { datetime: r.datetime, fields: { ...(prev ? prev.fields : {}), ...fields } });
      };

      for (const r of reminders) {
        if (r.completed) continue;
        const targetTime = new Date(r.datetime).getTime();
        if (isNaN(targetTime)) continue;
        const advanceTime = targetTime - (Number(r.advanceNotice) || 0) * DAY_MS;

        // امنیت E2EE: اگر رمزنگاری شده باشد، اطلاعات در تلگرام سانسور می‌شود
        const msgTitle = r.isEncrypted ? '🔒 [پیام قفل شده و محرمانه]' : (r.title || '');
        const msgDesc = r.isEncrypted ? 'برای مشاهده جزئیات وارد اپلیکیشن شوید.' : (r.desc || '-');

        if (r.advanceNotice > 0 && !r.advanceSent && advanceTime <= now && targetTime > now) {
          const done = await sendTelegram(chatId, `⏳ <b>هشدار زودهنگام</b>\n\n📌 عنوان: ${escapeHtml(msgTitle)}`);
          if (subs.length) {
            expiredEndpoints.push(...(await sendPush(subs, {
              title: '⏳ هشدار زودهنگام', body: msgTitle, tag: `nirvana-${r.id}-adv-${targetTime}`,
              data: { id: r.id }, actions: [{ action: 'done', title: '✅ انجام شد' }]
            }, host)).expired);
            pushesSent++;
          }
          if (done) { markUpdate(r, { advanceSent: true }); messagesSent++; }
        }

        if (!r.sent && targetTime <= now) {
          const msg = `⏰ <b>یادآور رسید!</b>\n\n📌 عنوان: ${escapeHtml(msgTitle)}\n📝 توضیحات: ${escapeHtml(msgDesc)}`;
          const done = await sendTelegram(chatId, msg, r.isEncrypted ? undefined : dueKeyboard(r.id));
          if (subs.length) {
            // مرورگر فقط به تعداد Notification.maxActions (معمولاً ۲) دکمه نشان می‌دهد؛ ترتیب مهم است
            expiredEndpoints.push(...(await sendPush(subs, {
              title: '⏰ یادآور رسید!', body: msgTitle, tag: `nirvana-${r.id}-due-${targetTime}`,
              requireInteraction: r.priority === 'high', data: { id: r.id }, actions: PUSH_DUE_ACTIONS
            }, host)).expired);
            pushesSent++;
          }

          if (done) {
            messagesSent++;
            const fields = { sent: true };
            // recurrenceSpawned جلوی ساخت تکرار تکراری بعد از تعویق را می‌گیرد
            if (r.recurring && r.recurring !== 'none' && !r.recurrenceSpawned) {
              const next = nextOccurrence(r.datetime, r.recurring, now);
              if (next) {
                const copy = {
                  ...r,
                  id: Date.now() * 1000 + Math.floor(Math.random() * 1000), // عدد صحیح، تا دکمه‌های تلگرام درست کار کنند
                  datetime: next.toISOString(),
                  subtasks: (r.subtasks || []).map(st => ({ ...st, done: false })),
                  sent: false, advanceSent: false, completed: false, recurrenceSpawned: false
                };
                if (r.attachment) {
                  const file = await redis.get(`attachment:${chatId}:${r.id}`);
                  if (file) await redis.set(`attachment:${chatId}:${copy.id}`, file); else copy.attachment = null;
                }
                newOccurrences.push(copy);
                fields.recurrenceSpawned = true;
              }
            }
            markUpdate(r, fields);
          }
        }
      }

      if (updates.size || newOccurrences.length) {
        await updateJSON(key, [], current => {
          for (const item of current) {
            const u = updates.get(item.id);
            // اگر کاربر حین ارسال پیام‌ها زمان را عوض کرده، علامت «ارسال شد» روی زمان جدید اعمال نمی‌شود
            if (u && item.datetime === u.datetime) Object.assign(item, u.fields);
          }
          return [...current, ...newOccurrences];
        });
      }

      if (expiredEndpoints.length) {
        await updateJSON(`push:${chatId}`, [], current => current.filter(s => !expiredEndpoints.includes(s.endpoint)));
      }

      if (await maybeSendSummary(chatId, key, now)) summariesSent++;
    }
    return res.status(200).json({ success: true, sent: messagesSent, pushes: pushesSent, summaries: summariesSent });
  } catch (error) { return res.status(500).json({ error: error.message }); }
}
