import { createClient } from 'redis';
import webpush from 'web-push';
import jalaali from 'jalaali-js';

const client = createClient({ url: process.env.REDIS_URL });
client.on('error', err => console.error('Redis Error:', err));

const DAY_MS = 24 * 60 * 60 * 1000;
const TEHRAN_OFFSET_MS = 3.5 * 60 * 60 * 1000; // ایران از ۱۴۰۱ ساعت تابستانی ندارد

const pushEnabled = Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
if (pushEnabled) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:nirvana-reminder@example.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

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
async function sendTelegram(token, chatId, text, replyMarkup) {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', reply_markup: replyMarkup })
    });
    if (res.ok) return true;
    console.error('Telegram error', chatId, res.status, await res.text());
    // 400 (چت نامعتبر) و 403 (ربات بلاک شده) با تکرار درست نمی‌شوند
    return res.status === 400 || res.status === 403;
  } catch (err) {
    console.error('Telegram fetch failed', chatId, err);
    return false;
  }
}

// آدرس اشتراک‌های منقضی‌شده را برمی‌گرداند
async function sendPush(subs, payload) {
  const expired = [];
  await Promise.all(subs.map(async sub => {
    try {
      await webpush.sendNotification(sub, JSON.stringify(payload), { TTL: 60 * 60 });
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) expired.push(sub.endpoint);
      else console.error('Push error', err.statusCode, err.body || err.message);
    }
  }));
  return expired;
}

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}` && req.query.secret !== secret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token && !pushEnabled) return res.status(500).json({ error: 'Token missing' });

  try {
    if (!client.isOpen) await client.connect();
    const keys = await client.keys('reminders:*');
    const now = Date.now();
    let messagesSent = 0, pushesSent = 0;

    for (const key of keys) {
      const chatId = key.split(':')[1];
      const reminders = JSON.parse(await client.get(key) || '[]');
      const subs = pushEnabled ? JSON.parse(await client.get(`push:${chatId}`) || '[]') : [];
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
          const done = token ? await sendTelegram(token, chatId, `⏳ <b>هشدار زودهنگام</b>\n\n📌 عنوان: ${escapeHtml(msgTitle)}`) : true;
          if (subs.length) {
            expiredEndpoints.push(...await sendPush(subs, {
              title: '⏳ هشدار زودهنگام', body: msgTitle, tag: `nirvana-${r.id}-adv-${targetTime}`,
              data: { id: r.id, chatId }, actions: [{ action: 'done', title: '✅ انجام شد' }]
            }));
            pushesSent++;
          }
          if (done) { markUpdate(r, { advanceSent: true }); messagesSent++; }
        }

        if (!r.sent && targetTime <= now) {
          const keyboard = { inline_keyboard: [[{ text: '✅ انجام شد', callback_data: `complete_${r.id}` }], [{ text: '💤 تاخیر ۱ ساعت', callback_data: `snooze_${r.id}` }]] };
          const msg = `⏰ <b>یادآور رسید!</b>\n\n📌 عنوان: ${escapeHtml(msgTitle)}\n📝 توضیحات: ${escapeHtml(msgDesc)}`;
          const done = token ? await sendTelegram(token, chatId, msg, r.isEncrypted ? undefined : keyboard) : true;
          if (subs.length) {
            expiredEndpoints.push(...await sendPush(subs, {
              title: '⏰ یادآور رسید!', body: msgTitle, tag: `nirvana-${r.id}-due-${targetTime}`,
              requireInteraction: r.priority === 'high', data: { id: r.id, chatId },
              actions: [{ action: 'done', title: '✅ انجام شد' }, { action: 'snooze', title: '💤 ۱ ساعت بعد' }]
            }));
            pushesSent++;
          }

          if (done) {
            messagesSent++;
            const fields = { sent: true };
            // recurrenceSpawned جلوی ساخت تکرار تکراری بعد از «تاخیر ۱ ساعت» را می‌گیرد
            if (r.recurring && r.recurring !== 'none' && !r.recurrenceSpawned) {
              const next = nextOccurrence(r.datetime, r.recurring, now);
              if (next) {
                newOccurrences.push({
                  ...r,
                  id: Date.now() * 1000 + Math.floor(Math.random() * 1000), // عدد صحیح، تا دکمه‌های تلگرام با parse درست کار کنند
                  datetime: next.toISOString(),
                  subtasks: (r.subtasks || []).map(st => ({ ...st, done: false })),
                  sent: false, advanceSent: false, completed: false, recurrenceSpawned: false
                });
                fields.recurrenceSpawned = true;
              }
            }
            markUpdate(r, fields);
          }
        }
      }

      if (updates.size || newOccurrences.length) {
        // دوباره خوانده می‌شود تا تغییراتی که کاربر حین ارسال پیام‌ها ثبت کرده از بین نرود
        const fresh = JSON.parse(await client.get(key) || '[]');
        for (const item of fresh) {
          const u = updates.get(item.id);
          if (u && item.datetime === u.datetime) Object.assign(item, u.fields);
        }
        fresh.push(...newOccurrences);
        await client.set(key, JSON.stringify(fresh));
      }

      if (expiredEndpoints.length) {
        const pushKey = `push:${chatId}`;
        const current = JSON.parse(await client.get(pushKey) || '[]');
        await client.set(pushKey, JSON.stringify(current.filter(s => !expiredEndpoints.includes(s.endpoint))));
      }
    }
    return res.status(200).json({ success: true, sent: messagesSent, pushes: pushesSent });
  } catch (error) { return res.status(500).json({ error: error.message }); }
}
