export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
  
  // خواندن کلید گوگل که در ورسل ثبت کردید
  const apiKey = process.env.Google_API;
  if (!apiKey) return res.status(500).json({ error: 'Google API key is missing in Vercel' });

  const { prompt } = req.body;

  try {
    // اتصال مستقیم به موتور قدرتمند Gemini 1.5 Flash گوگل
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    });
    
    const data = await response.json();
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
