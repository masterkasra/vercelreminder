import webpush from 'web-push';
import { getRedis, readJSON } from './db.js';

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

// آدرس اشتراک‌های منقضی‌شده را برمی‌گرداند
export async function sendPush(subs, payload, host) {
  if (!subs.length) return [];
  const keys = await getVapidKeys();
  const subject = process.env.VAPID_SUBJECT || (host ? `https://${host}` : 'mailto:nirvana-reminder@example.com');
  const expired = [];
  await Promise.all(subs.map(async sub => {
    try {
      await webpush.sendNotification(sub, JSON.stringify(payload), {
        TTL: 60 * 60,
        vapidDetails: { subject, publicKey: keys.publicKey, privateKey: keys.privateKey }
      });
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) expired.push(sub.endpoint);
      else console.error('Push error', err.statusCode, err.body || err.message);
    }
  }));
  return expired;
}
