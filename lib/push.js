import crypto from 'node:crypto';
import webpush from 'web-push';
import { getRedis, readJSON, updateJSON } from './db.js';

const PUSH_TIMEOUT_MS = 10 * 1000;
const MAX_CONSECUTIVE_FAILURES = 5;

let vapidKeys = null;

// کلیدهای VAPID: اول از متغیرهای محیطی، وگرنه یک بار ساخته و در Redis نگه داشته می‌شوند (تنظیم دستی لازم نیست)
export async function getVapidKeys() {
  if (vapidKeys) return vapidKeys;
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    vapidKeys = { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  } else {
    let keys = await readJSON('config:vapid', null);
    if (!keys) {
      const generated = webpush.generateVAPIDKeys();
      const created = await (await getRedis()).set('config:vapid', JSON.stringify(generated), { NX: true });
      keys = created ? generated : await readJSON('config:vapid', null);
    }
    vapidKeys = keys;
  }
  return vapidKeys;
}

// شناسه کوتاه و غیرحساس هر اشتراک، تا مرورگر بتواند «این دستگاه» را در نتیجه تست تشخیص دهد
export const endpointId = endpoint => crypto.createHash('sha256').update(String(endpoint)).digest('hex').slice(0, 12);
const serviceName = endpoint => { try { return new URL(endpoint).hostname; } catch (e) { return 'unknown'; } };

function withTimeout(promise, ms) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error(`timeout after ${ms / 1000}s`), { code: 'TIMEOUT' })), ms); })
  ]).finally(() => clearTimeout(timer));
}

// برای هر اشتراک: { endpoint, id, service, ok, expired, status, error }
// بدون سقف زمانی، یک سرویس push که جواب نمی‌دهد تابع را تا چند دقیقه معطل می‌کرد (و cron را هم)
export async function sendPush(subs, payload, host) {
  if (!subs.length) return [];
  const keys = await getVapidKeys();
  const subject = process.env.VAPID_SUBJECT || (host ? `https://${host}` : 'mailto:nirvana-reminder@example.com');
  return Promise.all(subs.map(async sub => {
    const base = { endpoint: sub.endpoint, id: endpointId(sub.endpoint), service: serviceName(sub.endpoint) };
    try {
      const res = await withTimeout(webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, JSON.stringify(payload), {
        TTL: 60 * 60,
        // بدون urgency=high اندروید در حالت Doze اعلان را تا چند ده دقیقه عقب می‌اندازد
        urgency: 'high',
        timeout: PUSH_TIMEOUT_MS,
        vapidDetails: { subject, publicKey: keys.publicKey, privateKey: keys.privateKey }
      }), PUSH_TIMEOUT_MS + 2000);
      return { ...base, ok: true, expired: false, status: res && res.statusCode };
    } catch (err) {
      const expired = err.statusCode === 404 || err.statusCode === 410;
      const error = err.statusCode
        ? `${err.statusCode}${err.body ? ' ' + String(err.body).replace(/\s+/g, ' ').slice(0, 120) : ''}`
        : (err.code === 'TIMEOUT' ? err.message : (err.code || err.message));
      if (!expired) console.error('Push error', base.service, error);
      return { ...base, ok: false, expired, status: err.statusCode || null, error };
    }
  }));
}

// اشتراک‌های منقضی حذف می‌شوند و اشتراکی که ۵ بار پشت سر هم خطا بدهد کنار گذاشته می‌شود
export async function recordPushResults(chatId, results) {
  if (!results.length) return;
  const byEndpoint = new Map(results.map(r => [r.endpoint, r]));
  await updateJSON(`push:${chatId}`, [], subs => subs.flatMap(sub => {
    const r = byEndpoint.get(sub.endpoint);
    if (!r) return [sub];
    if (r.expired) return [];
    const failures = r.ok ? 0 : (sub.failures || 0) + 1;
    return failures >= MAX_CONSECUTIVE_FAILURES ? [] : [{ ...sub, failures }];
  }));
}
