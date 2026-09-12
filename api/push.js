import { createClient } from 'redis';

const client = createClient({ url: process.env.REDIS_URL });
client.on('error', err => console.error('Redis Error:', err));

// ثبت/حذف اشتراک Web Push مرورگر تا cron بتواند وقتی سایت بسته است هم اعلان بفرستد
export default async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json({ publicKey: process.env.VAPID_PUBLIC_KEY || null });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { chat_id } = req.query;
  if (!chat_id || chat_id === 'undefined' || chat_id === 'null') {
    return res.status(400).json({ error: 'شناسه معتبر نیست' });
  }

  const { action, subscription, endpoint } = req.body || {};

  try {
    if (!client.isOpen) await client.connect();
    const key = `push:${chat_id}`;
    let subs = JSON.parse(await client.get(key) || '[]');

    if (action === 'subscribe') {
      const valid = subscription && typeof subscription.endpoint === 'string' && subscription.endpoint.startsWith('https://')
        && subscription.keys && subscription.keys.p256dh && subscription.keys.auth;
      if (!valid) return res.status(400).json({ error: 'اشتراک نامعتبر است' });
      subs = subs.filter(s => s.endpoint !== subscription.endpoint);
      subs.push({ endpoint: subscription.endpoint, keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth } });
      subs = subs.slice(-10);
    } else if (action === 'unsubscribe') {
      subs = subs.filter(s => s.endpoint !== endpoint);
    } else {
      return res.status(400).json({ error: 'عملیات نامعتبر است.' });
    }

    await client.set(key, JSON.stringify(subs));
    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
