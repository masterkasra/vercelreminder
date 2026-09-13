import { readJSON, updateJSON, rateLimit, requireSession } from '../lib/db.js';
import { getVapidKeys, sendPush } from '../lib/push.js';

// ثبت/حذف اشتراک Web Push مرورگر تا cron بتواند وقتی سایت بسته است هم اعلان بفرستد
export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      return res.status(200).json({ publicKey: (await getVapidKeys()).publicKey });
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const session = await requireSession(req, res);
    if (!session) return;
    const { action, subscription, endpoint } = req.body || {};
    const pushKey = `push:${session.chatId}`;

    if (action === 'subscribe') {
      const valid = subscription && typeof subscription.endpoint === 'string' && subscription.endpoint.startsWith('https://')
        && subscription.keys && subscription.keys.p256dh && subscription.keys.auth;
      if (!valid) return res.status(400).json({ error: 'اشتراک نامعتبر است' });
      const subs = await updateJSON(pushKey, [], current => [
        ...current.filter(s => s.endpoint !== subscription.endpoint),
        { endpoint: subscription.endpoint, keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth } }
      ].slice(-10));
      return res.status(200).json({ success: true, devices: subs.length });
    }

    if (action === 'unsubscribe') {
      await updateJSON(pushKey, [], subs => subs.filter(s => s.endpoint !== endpoint));
      return res.status(200).json({ success: true });
    }

    // اعلان آزمایشی به همه دستگاه‌های این حساب؛ مستقل از cron، برای اینکه معلوم شود push روی گوشی می‌رسد یا نه
    if (action === 'test') {
      if (!(await rateLimit(`ratelimit:pushtest:${session.chatId}`, 10, 60 * 60))) {
        return res.status(429).json({ error: 'اعلان آزمایشی زیاد ارسال شد؛ کمی بعد دوباره امتحان کنید.' });
      }
      const subs = await readJSON(pushKey, []);
      const result = await sendPush(subs, {
        title: '🔔 اعلان آزمایشی نیروانا',
        body: 'اگر این پیام را می‌بینید، اعلان پس‌زمینه روی این دستگاه کار می‌کند.',
        tag: 'nirvana-test-push', data: { url: '/' }
      }, req.headers['x-forwarded-host'] || req.headers.host);
      if (result.expired.length) await updateJSON(pushKey, [], current => current.filter(s => !result.expired.includes(s.endpoint)));
      return res.status(200).json({ success: true, devices: subs.length, delivered: result.delivered, expired: result.expired.length, failed: result.failed });
    }

    return res.status(400).json({ error: 'عملیات نامعتبر است.' });
  } catch (error) {
    console.error('Push API error:', error);
    return res.status(500).json({ error: error.message });
  }
}
