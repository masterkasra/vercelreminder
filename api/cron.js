import jalaali from 'jalaali-js';
import { getRedis, readJSON, updateJSON, scanKeys } from '../lib/db.js';
import { sendPush } from '../lib/push.js';
import { tg, hasBotToken, webhookSecret } from '../lib/telegram.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const TEHRAN_OFFSET_MS = 3.5 * 60 * 60 * 1000; // ایران از ۱۴۰۱ ساعت تابستانی ندارد

const escapeHtml = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

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

// وب‌هوک فعلی ربات را یک بار با secret_token دوباره ثبت می‌کند تا درخواست‌های جعلی به /api/webhook رد شوند
async function ensureWebhookSecret(redis) {
  if (!hasBotToken() || await redis.get('config:webhook_secured')) return;
  try {
    const info = await (await tg('getWebhookInfo')).json();
    const url = info && info.result && info.result.url;
    if (!url) return;
    const res = await tg('setWebhook', { url, secret_token: webhookSecret() });
    if (res.ok) await redis.set('config:webhook_secured', '1');
    else console.error('setWebhook failed', res.status, await res.text());
  } catch (err) {
    console.error('ensureWebhookSecret failed', err);
  }
}

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}` && req.query.secret !== secret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const redis = await getRedis();
    await ensureWebhookSecret(redis);
    const keys = await scanKeys('reminders:*');
    const now = Date.now();
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    let messagesSent = 0, pushesSent = 0;

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
            expiredEndpoints.push(...await sendPush(subs, {
              title: '⏳ هشدار زودهنگام', body: msgTitle, tag: `nirvana-${r.id}-adv-${targetTime}`,
              data: { id: r.id }, actions: [{ action: 'done', title: '✅ انجام شد' }]
            }, host));
            pushesSent++;
          }
          if (done) { markUpdate(r, { advanceSent: true }); messagesSent++; }
        }

        if (!r.sent && targetTime <= now) {
          const keyboard = { inline_keyboard: [[{ text: '✅ انجام شد', callback_data: `complete_${r.id}` }], [{ text: '💤 تاخیر ۱ ساعت', callback_data: `snooze_${r.id}` }]] };
          const msg = `⏰ <b>یادآور رسید!</b>\n\n📌 عنوان: ${escapeHtml(msgTitle)}\n📝 توضیحات: ${escapeHtml(msgDesc)}`;
          const done = await sendTelegram(chatId, msg, r.isEncrypted ? undefined : keyboard);
          if (subs.length) {
            expiredEndpoints.push(...await sendPush(subs, {
              title: '⏰ یادآور رسید!', body: msgTitle, tag: `nirvana-${r.id}-due-${targetTime}`,
              requireInteraction: r.priority === 'high', data: { id: r.id },
              actions: [{ action: 'done', title: '✅ انجام شد' }, { action: 'snooze', title: '💤 ۱ ساعت بعد' }]
            }, host));
            pushesSent++;
          }

          if (done) {
            messagesSent++;
            const fields = { sent: true };
            // recurrenceSpawned جلوی ساخت تکرار تکراری بعد از «تاخیر ۱ ساعت» را می‌گیرد
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
    }
    return res.status(200).json({ success: true, sent: messagesSent, pushes: pushesSent });
  } catch (error) { return res.status(500).json({ error: error.message }); }
}
