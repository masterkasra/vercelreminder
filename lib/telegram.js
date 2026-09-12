import crypto from 'node:crypto';

export const hasBotToken = () => Boolean(process.env.TELEGRAM_BOT_TOKEN);

export async function tg(method, body) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { ok: false, status: 500, json: async () => ({}), text: async () => 'TELEGRAM_BOT_TOKEN missing' };
  return fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {})
  });
}

let botUsername = null;
export async function getBotUsername() {
  if (botUsername || !hasBotToken()) return botUsername;
  try {
    const data = await (await tg('getMe')).json();
    botUsername = (data && data.result && data.result.username) || null;
  } catch (err) {
    console.error('getMe failed', err);
  }
  return botUsername;
}

// اگر TELEGRAM_WEBHOOK_SECRET تنظیم نشده باشد، از روی توکن ربات ساخته می‌شود تا تنظیم دستی لازم نباشد
export function webhookSecret() {
  if (process.env.TELEGRAM_WEBHOOK_SECRET) return process.env.TELEGRAM_WEBHOOK_SECRET;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  return token ? crypto.createHash('sha256').update(`nirvana-webhook:${token}`).digest('hex') : null;
}
