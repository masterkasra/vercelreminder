import { rateLimit, requireSession } from '../lib/db.js';
import { getBotUsername } from '../lib/telegram.js';
import { supportConfig, getSupporter, publicSupporter, recordSupport, verifyTronUsdt } from '../lib/support.js';

const VERIFY_ERRORS = {
  invalid_txid: [400, 'شناسه تراکنش (TxID) نامعتبر است؛ ۶۴ کاراکتر hex.'],
  not_found: [404, 'تراکنش پیدا نشد یا هنوز تأیید نشده؛ یک دقیقه بعد دوباره امتحان کنید.'],
  failed_tx: [400, 'این تراکنش روی شبکه ناموفق بوده است.'],
  wrong_receiver: [400, 'این تراکنش انتقال USDT به آدرس حمایت نیست.'],
  network: [502, 'ارتباط با شبکه ترون برقرار نشد؛ کمی بعد دوباره امتحان کنید.'],
  not_configured: [400, 'پرداخت با TRC20 روی سرور تنظیم نشده است.']
};

export default async function handler(req, res) {
  try {
    const session = await requireSession(req, res);
    if (!session) return;
    const config = supportConfig();

    if (req.method === 'GET') {
      const supporter = publicSupporter(await getSupporter(session.chatId));
      return res.status(200).json({
        wallets: config.wallets,
        minUsdt: config.minUsdt,
        stars: config.starsEnabled ? { botUsername: await getBotUsername(), amounts: config.starsAmounts } : null,
        // حامی‌ها تبلیغ نمی‌بینند
        adsUnit: supporter ? null : config.adsUnit,
        supporter
      });
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const body = req.body || {};
    if (body.action !== 'verify-trc20') return res.status(400).json({ error: 'درخواست نامعتبر است.' });
    const wallet = config.wallets.find(w => w.id === 'trc20');
    if (!wallet) return res.status(400).json({ error: VERIFY_ERRORS.not_configured[1] });
    if (!(await rateLimit(`ratelimit:support:${session.chatId}`, 10, 60 * 60))) {
      return res.status(429).json({ error: 'تعداد درخواست زیاد بود؛ یک ساعت بعد دوباره تلاش کنید.' });
    }

    const result = await verifyTronUsdt(body.txid, wallet.address, config.minUsdt);
    if (result.error === 'too_small') {
      return res.status(400).json({ error: `مبلغ این تراکنش ${result.amount} USDT است؛ حداقل ${config.minUsdt} USDT لازم است.` });
    }
    if (result.error) {
      const [status, message] = VERIFY_ERRORS[result.error] || [400, 'تأیید تراکنش ناموفق بود.'];
      return res.status(status).json({ error: message });
    }
    const fresh = await recordSupport(session.chatId, { method: 'trc20', amount: result.amount, currency: 'USDT', ref: result.txid });
    if (!fresh) return res.status(409).json({ error: 'این تراکنش قبلاً ثبت شده است.' });
    return res.status(200).json({ ok: true, amount: result.amount, supporter: publicSupporter(await getSupporter(session.chatId)) });
  } catch (error) {
    console.error('Support API error:', error);
    return res.status(500).json({ error: error.message });
  }
}
