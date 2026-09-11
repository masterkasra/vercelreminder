export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
  
  // خواندن کلید گوگل که در ورسل ثبت کردید
  const apiKey = process.env.Google_API;
  if (!apiKey) return res.status(500).json({ error: { message: 'Google API key is missing in Vercel' } });

  const { prompt } = req.body;

  try {
    // 🌟 رفع باگ: تغییر نام مدل به نام صحیح و پذیرفته شده توسط گوگل (gemini-1.5-flash-latest)
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    });
    
    const data = await response.json();
    
    // اگر سرور گوگل اروری داد (مثل محدودیت آی‌پی یا توکن غلط)، ارور دقیق را به فرانت‌اند بفرست
    if (!response.ok) {
        return res.status(response.status).json({ error: data.error || { message: "Unknown Google API Error" } });
    }
    
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ error: { message: error.message } });
  }
}
