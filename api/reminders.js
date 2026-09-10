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
      const { action, id, title, datetime, priority, desc } = req.body;
      const data = await client.get(key);
      let reminders = data ? JSON.parse(data) : [];

      if (action === 'delete') {
        reminders = reminders.filter(r => r.id !== id);
      } else if (action === 'complete') {
        const index = reminders.findIndex(r => r.id === id);
        if (index > -1) reminders[index].completed = !reminders[index].completed;
      } else {
        reminders.push({ id: Date.now(), title, datetime, priority, desc, completed: false, sent: false });
      }

      await client.set(key, JSON.stringify(reminders));
      return res.status(200).json({ success: true, reminders });
    }
  } catch (error) {
    console.error(">>> Error:", error);
    return res.status(500).json({ error: error.message });
  }
}
