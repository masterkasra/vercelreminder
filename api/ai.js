export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
  
  // خواندن کلید OpenRouter (حتماً در Vercel متغیر OPENROUTER_API_KEY را با کلید sk-or-v1-... تنظیم کنید)
  const apiKey = process.env.OPENROUTER_API_KEY;
  
  if (!apiKey) {
    return res.status(500).json({ error: { message: 'کلید OPENROUTER_API_KEY در تنظیمات ورسل یافت نشد.' } });
  }

  const { prompt } = req.body;

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        // استفاده از مدل رایگان و پرسرعت برای استخراج متن
        model: "meta-llama/llama-3-8b-instruct:free", 
        messages: [{ role: "user", content: prompt }]
      })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
        return res.status(response.status).json({ error: data.error || { message: "OpenRouter API Error" } });
    }
    
    // تبدیل خروجی اوپن‌روتر به فرمتی که فرانت‌اند ما انتظار دارد
    // فرانت‌اند منتظر data.candidates[0].content.parts[0].text است
    const aiText = data.choices[0].message.content;
    
    return res.status(200).json({
      candidates: [
        {
          content: {
            parts: [{ text: aiText }]
          }
        }
      ]
    });

  } catch (error) {
    return res.status(500).json({ error: { message: error.message } });
  }
}
