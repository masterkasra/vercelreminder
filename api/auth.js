import { createClient } from 'redis';

const client = createClient({ url: process.env.REDIS_URL });
client.on('error', err => console.error('Redis Error:', err));

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  try {
    if (!client.isOpen) await client.connect();
    
    const { action, email, password, firstName, lastName, phone, job, country, chatId } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'ایمیل و رمز عبور الزامی است.' });
    }

    const userKey = `user:${email.toLowerCase()}`;

    if (action === 'register') {
      const existingUser = await client.get(userKey);
      if (existingUser) {
        return res.status(400).json({ error: 'این ایمیل قبلاً در سیستم ثبت شده است.' });
      }
      
      const newUser = { email: email.toLowerCase(), password, firstName, lastName, phone, job, country, chatId };
      // ذخیره اطلاعات کاربر در دیتابیس
      await client.set(userKey, JSON.stringify(newUser));
      
      // برای امنیت، رمز عبور را در خروجی برنمی‌گردانیم
      delete newUser.password;
      return res.status(200).json({ success: true, user: newUser });
    }

    if (action === 'login') {
      const userData = await client.get(userKey);
      if (!userData) {
        return res.status(400).json({ error: 'حساب کاربری با این ایمیل یافت نشد.' });
      }
      
      const user = JSON.parse(userData);
      if (user.password !== password) {
        return res.status(401).json({ error: 'رمز عبور اشتباه است.' });
      }
      
      delete user.password;
      return res.status(200).json({ success: true, user });
    }

    return res.status(400).json({ error: 'عملیات نامعتبر است.' });

  } catch (error) {
    console.error("Auth Error:", error);
    return res.status(500).json({ error: 'خطای سرور' });
  }
}
