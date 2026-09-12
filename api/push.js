import { updateJSON, requireSession } from '../lib/db.js';
import { getVapidKeys } from '../lib/push.js';

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

    if (action === 'subscribe') {
      const valid = subscription && typeof subscription.endpoint === 'string' && subscription.endpoint.startsWith('https://')
        && subscription.keys && subscription.keys.p256dh && subscription.keys.auth;
      if (!valid) return res.status(400).json({ error: 'اشتراک نامعتبر است' });
      await updateJSON(`push:${session.chatId}`, [], subs => [
        ...subs.filter(s => s.endpoint !== subscription.endpoint),
        { endpoint: subscription.endpoint, keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth } }
      ].slice(-10));
    } else if (action === 'unsubscribe') {
      await updateJSON(`push:${session.chatId}`, [], subs => subs.filter(s => s.endpoint !== endpoint));
    } else {
      return res.status(400).json({ error: 'عملیات نامعتبر است.' });
    }
    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
