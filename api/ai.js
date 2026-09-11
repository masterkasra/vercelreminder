export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
  
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return res.status(500).json({ error: { message: 'کلید OPENROUTER_API_KEY در تنظیمات ورسل یافت نشد.' } });

  const { prompt } = req.body;

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "openrouter/auto", 
        messages: [{ role: "user", content: prompt }],
        // 🌟 این خط دقیقاً همان چیزی است که ارور شما را برطرف می‌کند
        // به سرور می‌گوییم ما کل ۱۳۱ هزار توکن را نمی‌خواهیم، فقط ۳۰۰ تا کافیست.
        max_tokens: 300 
      })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
        return res.status(response.status).json({ error: data.error || { message: "OpenRouter API Error" } });
    }
    
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
