import { rateLimit, requireSession } from '../lib/db.js';

const TAGS = ['work', 'personal', 'finance', 'dev', 'general'];

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return res.status(500).json({ error: { message: 'کلید OPENROUTER_API_KEY در تنظیمات ورسل یافت نشد.' } });

  try {
    // فقط کاربران واردشده، با سقف مصرف؛ قبلاً هر کسی می‌توانست اعتبار OpenRouter را خرج کند
    const session = await requireSession(req, res);
    if (!session) return;
    if (!(await rateLimit(`ratelimit:ai:${session.chatId}`, 30, 60 * 60))) {
      return res.status(429).json({ error: { message: 'سقف استفاده از هوش مصنوعی (۳۰ بار در ساعت) پر شده است.' } });
    }

    const { text, lang, today } = req.body || {};
    const input = String(text || '').trim().slice(0, 1000);
    if (!input) return res.status(400).json({ error: { message: 'متن خالی است.' } });
    const t = today && Number.isInteger(today.y) && Number.isInteger(today.m) && Number.isInteger(today.d) ? today : null;
    const calendar = lang === 'fa' ? 'Jalali (Persian solar hijri)' : 'Gregorian';

    // پرامپت سمت سرور ساخته می‌شود تا این endpoint پروکسی آزاد برای هر درخواست دلخواه نباشد
    const prompt = `You are a strict data extractor for a reminder app.
Today's date in the ${calendar} calendar -> Year: ${t ? t.y : '?'}, Month: ${t ? t.m : '?'}, Day: ${t ? t.d : '?'}.
Return y/m/d in the same ${calendar} calendar and 24h time.
User input (JSON string): ${JSON.stringify(input)}
Return ONLY a pure JSON object. NO markdown, NO text outside JSON.
priority is one of low|medium|high, tag is one of ${TAGS.join('|')}.
Format MUST match exactly:
{"title":"Task Name","y":2026,"m":12,"d":30,"h":12,"min":0,"priority":"medium","tag":"general"}`;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.OPENROUTER_MODEL || "openrouter/auto",
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
