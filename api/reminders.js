import { createClient } from 'redis';

const client = createClient({ url: process.env.REDIS_URL });
client.on('error', err => console.error('Redis Error:', err));

export default async function handler(req, res) {
  try {
    if (!client.isOpen) {
      await client.connect();
    }

    const { chat_id } = req.query;
    // مسدود کردن درخواست‌های بدون شناسه
    if (!chat_id || chat_id === 'undefined' || chat_id === 'null') {
      return res.status(400).json({ error: 'شناسه معتبر نیست' });
    }

    const key = `reminders:${chat_id}`;

    if (req.method === 'GET') {
      const data = await client.get(key);
      return res.status(200).json(data ? JSON.parse(data) : []);
    }

    if (req.method === 'POST') {
      const { action, id, title, datetime, priority, desc, advanceNotice, recurring, tag, subtasks, isEncrypted, attachment, completed, minutes } = req.body;
      const data = await client.get(key);
      let reminders = data ? JSON.parse(data) : [];
      const index = reminders.findIndex(r => r.id === id);

      if (action === 'delete') {
        reminders = reminders.filter(r => r.id !== id);
      } else if (action === 'complete') {
        if (index > -1) reminders[index].completed = typeof completed === 'boolean' ? completed : !reminders[index].completed;
      } else if (action === 'snooze') {
        if (index > -1) {
          const delayMin = Math.min(Math.max(parseInt(minutes) || 60, 1), 24 * 60);
          reminders[index].datetime = new Date(Date.now() + delayMin * 60 * 1000).toISOString();
          reminders[index].sent = false;
          reminders[index].completed = false;
        }
      } else if (action === 'edit') {
        if (index > -1) {
          const old = reminders[index];
          // فقط اگر زمان عوض شده دوباره اعلان بفرست؛ قبلاً تیک زدن یک ساب‌تسک هم یادآور قدیمی را دوباره به تلگرام می‌فرستاد
          const timingChanged = old.datetime !== datetime || Number(old.advanceNotice || 0) !== Number(advanceNotice || 0);
          reminders[index] = {
            ...old,
            title, datetime, priority, desc,
            advanceNotice: advanceNotice || 0,
            recurring: recurring || 'none',
            tag: tag || 'general',
            subtasks: subtasks || [],
            isEncrypted: isEncrypted || false,
            attachment: attachment || null,
            ...(timingChanged ? { sent: false, advanceSent: false } : {})
          };
        }
      } else if (index === -1) { // اگر صف آفلاین درخواست را دوباره فرستاد، یادآور تکراری ساخته نشود
        reminders.push({
          id: id || Date.now(), // 🌟 رفع باگ حیاتی: استفاده از شناسه مرورگر
          title, datetime, priority, desc,
          advanceNotice: advanceNotice || 0,
          recurring: recurring || 'none',
          tag: tag || 'general',
          subtasks: subtasks || [],
          isEncrypted: isEncrypted || false,
          attachment: attachment || null,
          completed: false, sent: false, advanceSent: false
        });
      }

      await client.set(key, JSON.stringify(reminders));
      return res.status(200).json({ success: true, reminders });
    }

    return res.status(405).json({ error: 'Method Not Allowed' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
