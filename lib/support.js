import crypto from 'node:crypto';
import { getRedis, readJSON, updateJSON } from './db.js';

// حمایت مالی: کمک با تتر/تون و Telegram Stars، و تبلیغ اختیاری A-ADS (برای غیرحامی‌ها)
// همه آدرس‌ها از متغیرهای محیطی خوانده می‌شوند؛ تا تنظیم نشوند چیزی نمایش داده نمی‌شود.

export const USDT_TRC20_CONTRACT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
const TRANSFER_TOPIC = 'ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const TXID_RE = /^[a-f0-9]{64}$/;
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

// آدرس ترون (Base58Check) به ۲۰ بایت hex؛ null یعنی آدرس نامعتبر
export function tronToHex(address) {
  let n = 0n;
  for (const ch of String(address || '')) {
    const v = B58.indexOf(ch);
    if (v < 0) return null;
    n = n * 58n + BigInt(v);
  }
  const hex = n.toString(16).padStart(50, '0');
  if (hex.length !== 50 || !hex.startsWith('41')) return null;
  const payload = Buffer.from(hex.slice(0, 42), 'hex');
  const check = crypto.createHash('sha256').update(crypto.createHash('sha256').update(payload).digest()).digest();
  return check.subarray(0, 4).toString('hex') === hex.slice(42) ? hex.slice(2, 42) : null;
}

const positiveInts = (value, fallback) => {
  const list = String(value || '').split(',').map(s => Number(s.trim())).filter(n => Number.isInteger(n) && n > 0 && n <= 100000);
  return list.length ? list.slice(0, 4) : fallback;
};

export function supportConfig() {
  const env = process.env;
  const wallets = [];
  if (tronToHex(env.DONATE_USDT_TRC20)) wallets.push({ id: 'trc20', label: 'USDT · TRC20 (Tron)', address: env.DONATE_USDT_TRC20, autoVerify: true });
  if (env.DONATE_TON) wallets.push({ id: 'ton', label: 'TON / USDT · TON', address: String(env.DONATE_TON).trim() });
  if (/^0x[a-fA-F0-9]{40}$/.test(env.DONATE_USDT_BEP20 || '')) wallets.push({ id: 'bep20', label: 'USDT · BEP20 (BNB Chain)', address: env.DONATE_USDT_BEP20 });
  const minUsdt = Number(env.SUPPORTER_MIN_USDT);
  return {
    wallets,
    minUsdt: Number.isFinite(minUsdt) && minUsdt > 0 ? minUsdt : 2,
    starsEnabled: Boolean(env.TELEGRAM_BOT_TOKEN) && env.DONATE_STARS !== 'off',
    starsAmounts: positiveInts(env.DONATE_STARS_AMOUNTS, [50, 150, 500]),
    adsUnit: /^\d{1,12}$/.test(env.ADS_AADS_UNIT || '') ? env.ADS_AADS_UNIT : null
  };
}

export const getSupporter = chatId => readJSON(`supporter:${chatId}`, null);

// ثبت یک کمک؛ ref (شناسه تراکنش) فقط یک بار در کل سیستم قبول می‌شود. false یعنی تکراری بوده
export async function recordSupport(chatId, { method, amount, currency, ref }) {
  const redis = await getRedis();
  const claimed = await redis.set(`support:ref:${method}:${ref}`, String(chatId), { NX: true });
  if (!claimed) return false;
  await updateJSON(`supporter:${chatId}`, null, current => {
    const s = current || { since: Date.now(), payments: [] };
    const payments = [...(s.payments || []), { method, amount, currency, ref: String(ref).slice(0, 80), at: Date.now() }].slice(-20);
    return { ...s, payments };
  });
  return true;
}

export const publicSupporter = s => s ? { since: s.since, count: (s.payments || []).length } : null;

// تراکنش USDT روی ترون را از TronGrid (فقط بلاک‌های تأییدشده) بررسی می‌کند
export async function verifyTronUsdt(txid, receiver, minUsdt) {
  const id = String(txid || '').trim().toLowerCase().replace(/^0x/, '');
  if (!TXID_RE.test(id)) return { error: 'invalid_txid' };
  const receiverHex = tronToHex(receiver);
  const contractHex = tronToHex(USDT_TRC20_CONTRACT);
  if (!receiverHex) return { error: 'not_configured' };

  const headers = { 'Content-Type': 'application/json' };
  if (process.env.TRONGRID_API_KEY) headers['TRON-PRO-API-KEY'] = process.env.TRONGRID_API_KEY;
  let info;
  try {
    const res = await fetch('https://api.trongrid.io/walletsolidity/gettransactioninfobyid', {
      method: 'POST', headers, body: JSON.stringify({ value: id }), signal: AbortSignal.timeout(10000)
    });
    if (!res.ok) return { error: 'network' };
    info = await res.json();
  } catch (err) {
    console.error('TronGrid failed', err);
    return { error: 'network' };
  }
  if (!info || !info.id) return { error: 'not_found' }; // هنوز تأیید نشده یا اصلاً وجود ندارد
  if (info.receipt && info.receipt.result && info.receipt.result !== 'SUCCESS') return { error: 'failed_tx' };

  let units = 0n;
  for (const log of info.log || []) {
    const topics = log.topics || [];
    if (String(log.address).toLowerCase().replace(/^41/, '') !== contractHex || topics[0] !== TRANSFER_TOPIC) continue;
    if (String(topics[2] || '').slice(-40).toLowerCase() !== receiverHex) continue;
    units += BigInt('0x' + (log.data || '0'));
  }
  if (!units) return { error: 'wrong_receiver' };
  const amount = Number(units) / 1e6; // USDT روی ترون ۶ رقم اعشار دارد
  if (amount < minUsdt) return { error: 'too_small', amount };
  return { ok: true, txid: id, amount };
}
