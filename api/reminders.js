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
      const { action, id, title, datetime, priority, desc, advanceNotice, recurring, tag, subtasks, isEncrypted, attachment } = req.body;
      const data = await client.get(key);
      let reminders = data ? JSON.parse(data) : [];

      if (action === 'delete') {
        reminders = reminders.filter(r => r.id !== id);
      } else if (action === 'complete') {
        const index = reminders.findIndex(r => r.id === id);
        if (index > -1) reminders[index].completed = !reminders[index].completed;
      } else if (action === 'edit') {
        const index = reminders.findIndex(r => r.id === id);
        if (index > -1) {
          reminders[index] = {
            ...reminders[index],
            title, datetime, priority, desc,
            advanceNotice: advanceNotice || 0,
            recurring: recurring || 'none',
            tag: tag || 'general',
            subtasks: subtasks || [],
            isEncrypted: isEncrypted || false,
            attachment: attachment || null,
            sent: false, advanceSent: false 
          };
        }
      } else {
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
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
