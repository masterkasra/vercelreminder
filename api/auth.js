import crypto from 'node:crypto';
import { getRedis, readJSON, rateLimit, hashPassword, verifyPassword, safeEqual, createSession, getSession } from '../lib/db.js';
import { tg, getBotUsername, hasBotToken } from '../lib/telegram.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CHAT_ID_RE = /^-?\d{1,20}$/;
const CODE_TTL = 10 * 60;

const clip = (value, max) => String(value ?? '').trim().slice(0, max);
const sha256 = value => crypto.createHash('sha256').update(String(value)).digest('hex');
const clientIp = req => String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';

const publicUser = u => ({
  email: u.email, firstName: u.firstName || '', lastName: u.lastName || '',
  phone: u.phone || '', job: u.job || '', country: u.country || '', chatId: String(u.chatId)
});

const checkPassword = (user, password) => user.passwordHash
  ? verifyPassword(password, user.passwordHash)
  : typeof user.password === 'string' && safeEqual(user.password, password); // حساب‌های قدیمی با رمز ذخیره‌شده به‌صورت متن

// کد تأیید به همان Chat ID فرستاده می‌شود؛ کسی که Chat ID دیگری را وارد کند کد را نمی‌بیند
async function sendCode(email, chatId, extra) {
  if (!(await rateLimit(`ratelimit:code:${email}`, 5, 60 * 60))) {
    return { status: 429, error: 'تعداد درخواست کد زیاد بود؛ یک ساعت بعد دوباره تلاش کنید.' };
  }
  const code = String(crypto.randomInt(100000, 1000000));
  const res = await tg('sendMessage', {
    chat_id: chatId,
    text: `🔐 کد تأیید نیروانا: ${code}\n\nاین کد ۱۰ دقیقه اعتبار دارد. اگر شما درخواست نداده‌اید، این پیام را نادیده بگیرید.`
  });
  if (!res.ok) {
    const bot = await getBotUsername();
    return { status: 400, error: `ربات نتوانست به این Chat ID پیام بدهد. اول در تلگرام به ${bot ? '@' + bot : 'ربات'} پیام /start بدهید و Chat ID را درست وارد کنید.` };
  }
  await (await getRedis()).set(`verify:${email}`, JSON.stringify({ codeHash: sha256(code), attempts: 0, ...extra }), { EX: CODE_TTL });
  return { ok: true };
}

async function finishLogin(redis, user, res) {
  const ownerKey = `chatowner:${user.chatId}`;
  const claimed = await redis.set(ownerKey, user.email, { NX: true });
  if (!claimed && (await redis.get(ownerKey)) !== user.email) {
    return res.status(400).json({ error: 'این Chat ID قبلاً به حساب دیگری متصل شده است.' });
  }
  user.chatVerified = true;
  await redis.set(`user:${user.email}`, JSON.stringify(user));
  return res.status(200).json({ success: true, user: publicUser(user), token: await createSession(user) });
}

export default async function handler(req, res) {
  if (req.method === 'GET') return res.status(200).json({ botUsername: await getBotUsername() });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const redis = await getRedis();
    const body = req.body || {};
    const { action } = body;

    if (action === 'logout') {
      const session = await getSession(req);
      if (session) await redis.del(`session:${session.token}`);
      return res.status(200).json({ success: true });
    }

    const email = clip(body.email, 200).toLowerCase();
    const password = String(body.password || '');
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'ایمیل معتبر نیست.' });
    const userKey = `user:${email}`;

    if (action === 'register') {
      if (!(await rateLimit(`ratelimit:register:${clientIp(req)}`, 10, 60 * 60))) {
        return res.status(429).json({ error: 'درخواست‌های ثبت‌نام زیاد بود؛ کمی بعد دوباره تلاش کنید.' });
      }
      if (password.length < 6) return res.status(400).json({ error: 'رمز عبور باید حداقل ۶ کاراکتر باشد.' });
      const chatId = clip(body.chatId, 25);
      if (!CHAT_ID_RE.test(chatId)) return res.status(400).json({ error: 'شناسه تلگرام (Chat ID) باید فقط عدد باشد.' });
      if (await redis.get(userKey)) return res.status(400).json({ error: 'این ایمیل قبلاً ثبت شده است؛ وارد شوید.' });
      const owner = await redis.get(`chatowner:${chatId}`);
      if (owner && owner !== email) return res.status(400).json({ error: 'این Chat ID قبلاً به حساب دیگری متصل شده است.' });

      const newUser = {
        email, passwordHash: hashPassword(password), chatId, chatVerified: false, createdAt: new Date().toISOString(),
        firstName: clip(body.firstName, 100), lastName: clip(body.lastName, 100), phone: clip(body.phone, 30),
        job: clip(body.job, 100), country: clip(body.country, 100)
      };
      if (!hasBotToken()) return finishLogin(redis, newUser, res);
      // حساب فقط بعد از وارد کردن کد ساخته می‌شود
      const sent = await sendCode(email, chatId, { pendingUser: newUser });
      if (sent.error) return res.status(sent.status).json({ error: sent.error });
      return res.status(200).json({ needsVerification: true });
    }

    if (action === 'login') {
      if (!(await rateLimit(`ratelimit:login:${email}`, 10, 15 * 60))) {
        return res.status(429).json({ error: 'تلاش‌های ورود زیاد بود؛ ۱۵ دقیقه بعد دوباره امتحان کنید.' });
      }
      const user = await readJSON(userKey, null);
      if (!user || !checkPassword(user, password)) return res.status(401).json({ error: 'ایمیل یا رمز عبور اشتباه است.' });

      if (!user.passwordHash) { // انتقال رمز متنی قدیمی به hash
        user.passwordHash = hashPassword(password);
        delete user.password;
        await redis.set(userKey, JSON.stringify(user));
      }
      if (user.chatVerified || !hasBotToken()) return finishLogin(redis, user, res);

      const sent = await sendCode(email, user.chatId, {});
      if (sent.error) return res.status(sent.status).json({ error: sent.error });
      return res.status(200).json({ needsVerification: true });
    }

    if (action === 'verify') {
      const verifyKey = `verify:${email}`;
      const pending = await readJSON(verifyKey, null);
      if (!pending) return res.status(400).json({ error: 'کد منقضی شده است؛ دوباره درخواست کد بدهید.' });
      if (pending.attempts >= 5) {
        await redis.del(verifyKey);
        return res.status(429).json({ error: 'کد اشتباه زیاد وارد شد؛ دوباره درخواست کد بدهید.' });
      }
      if (!safeEqual(sha256(clip(body.code, 10)), pending.codeHash)) {
        pending.attempts++;
        await redis.set(verifyKey, JSON.stringify(pending), { KEEPTTL: true })
          .catch(() => redis.set(verifyKey, JSON.stringify(pending), { EX: CODE_TTL })); // KEEPTTL needs Redis 6+
        return res.status(400).json({ error: 'کد اشتباه است.' });
      }
      await redis.del(verifyKey);

      if (pending.pendingUser) {
        if (await redis.get(userKey)) return res.status(400).json({ error: 'این ایمیل قبلاً ثبت شده است؛ وارد شوید.' });
        return finishLogin(redis, pending.pendingUser, res);
      }
      const user = await readJSON(userKey, null);
      if (!user) return res.status(400).json({ error: 'حساب کاربری یافت نشد.' });
      return finishLogin(redis, user, res);
    }

    return res.status(400).json({ error: 'عملیات نامعتبر است.' });
  } catch (error) {
    console.error('Auth Error:', error);
    return res.status(500).json({ error: 'خطای سرور' });
  }
}
