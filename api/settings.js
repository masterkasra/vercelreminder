import { getRedis, readJSON, requireSession } from '../lib/db.js';
import { getChatSettings, updateChatSettings, cleanSettingsPatch, publicSettings } from '../lib/settings.js';

export default async function handler(req, res) {
  try {
    const session = await requireSession(req, res);
    if (!session) return;

    if (req.method === 'GET') {
      // وضعیت اعلان‌ها هم برگردانده می‌شود تا در تنظیمات معلوم باشد چرا اعلانی نمی‌رسد
      const [settings, subs, lastCronRun] = await Promise.all([
        getChatSettings(session.chatId),
        readJSON(`push:${session.chatId}`, []),
        (await getRedis()).get('config:last_cron_run')
      ]);
      return res.status(200).json({ ...publicSettings(settings), pushDevices: subs.length, cronLastRun: lastCronRun ? Number(lastCronRun) : null });
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const patch = cleanSettingsPatch(req.body || {});
    if (!Object.keys(patch).length) return res.status(400).json({ error: 'تنظیمات نامعتبر است.' });
    return res.status(200).json(publicSettings(await updateChatSettings(session.chatId, patch)));
  } catch (error) {
    console.error('Settings API error:', error);
    return res.status(500).json({ error: error.message });
  }
}
