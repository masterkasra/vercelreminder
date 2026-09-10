import { createClient } from 'redis';

const client = createClient({ url: process.env.REDIS_URL });
client.on('error', err => console.error('Redis Error:', err));

export default async function handler(req, res) {
  try {
    if (!client.isOpen) await client.connect();
    
    const { chat_id } = req.query;
    if (!chat_id) return res.status(400).json({ error: 'Chat ID is required' });

    const key = `reminders:${chat_id}`;

    if (req.method === 'GET') {
      const data = await client.get(key);
      return res.status(200).json(data ? JSON.parse(data) : []);
    }

    if (req.method === 'POST') {
      // ساب‌تسک‌ها (subtasks) به بدنه درخواست اضافه شد
      const { action, id, title, datetime, priority, desc, advanceNotice, recurring, tag, subtasks } = req.body;
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
            subtasks: subtasks || [], // ذخیره ساب‌تسک‌های ویرایش شده
            sent: false, advanceSent: false 
          };
        }
      } else {
        reminders.push({ 
          id: Date.now(), title, datetime, priority, desc, 
          advanceNotice: advanceNotice || 0,
          recurring: recurring || 'none',
          tag: tag || 'general',
          subtasks: subtasks || [], // ذخیره ساب‌تسک‌های جدید
          completed: false, sent: false, advanceSent: false 
        });
      }

      await client.set(key, JSON.stringify(reminders));
      return res.status(200).json({ success: true, reminders });
    }
  } catch (error) {
    console.error(">>> Error:", error);
    return res.status(500).json({ error: error.message });
  }
}
