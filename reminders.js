import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  const { chat_id } = req.query;
  if (!chat_id) return res.status(400).json({ error: 'Chat ID is required' });

  const key = `reminders:${chat_id}`;

  // خواندن یادآورها
  if (req.method === 'GET') {
    const reminders = await kv.get(key) || [];
    return res.status(200).json(reminders);
  }

  // ذخیره، ویرایش و حذف یادآورها
  if (req.method === 'POST') {
    const { action, id, title, datetime, priority, desc } = req.body;
    let reminders = await kv.get(key) || [];

    if (action === 'delete') {
      reminders = reminders.filter(r => r.id !== id);
    } else if (action === 'complete') {
      const index = reminders.findIndex(r => r.id === id);
      if (index > -1) reminders[index].completed = !reminders[index].completed;
    } else {
      // ایجاد یادآور جدید
      reminders.push({ 
        id: Date.now(), title, datetime, priority, desc, 
        completed: false, sent: false 
      });
    }

    await kv.set(key, reminders);
    return res.status(200).json({ success: true, reminders });
  }
}