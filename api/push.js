import { readJSON, updateJSON, rateLimit, requireSession } from '../lib/db.js';
import { getVapidKeys, sendPush, recordPushResults } from '../lib/push.js';

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
      const results = await sendPush(subs, {
        title: '🔔 اعلان آزمایشی (از سرور)',
        body: 'اگر این پیام را می‌بینید، اعلان پس‌زمینه روی این دستگاه کار می‌کند.',
        tag: 'nirvana-test-push', data: { url: '/' }
      }, req.headers['x-forwarded-host'] || req.headers.host);
      await recordPushResults(session.chatId, results);
      return res.status(200).json({
        success: true, devices: subs.length, delivered: results.filter(r => r.ok).length,
        // آدرس کامل اشتراک برگردانده نمی‌شود؛ فقط سرویس و شناسه کوتاه
        results: results.map(({ id, service, ok, expired, status, error }) => ({ id, service, ok, expired, status: status || null, error: error || null }))
      });
    }

    return res.status(400).json({ error: 'عملیات نامعتبر است.' });
  } catch (error) {
    console.error('Push API error:', error);
    return res.status(500).json({ error: error.message });
  }
}
