import crypto from 'node:crypto';
import { createClient, WatchError } from 'redis';

const client = createClient({ url: process.env.REDIS_URL });
client.on('error', err => console.error('Redis Error:', err));

const SESSION_TTL = 60 * 24 * 60 * 60; // ۶۰ روز

export async function getRedis() {
  if (!client.isOpen) await client.connect();
  return client;
}

export async function readJSON(key, fallback) {
  const raw = await (await getRedis()).get(key);
  return raw ? JSON.parse(raw) : fallback;
}

// خواندن-تغییر-نوشتن با WATCH تا cron، وب‌هوک تلگرام و تب‌های مختلف تغییرات همدیگر را پاک نکنند.
// mutate مقدار جدید را برمی‌گرداند (undefined یعنی تغییری نیست) و ممکن است چند بار اجرا شود، پس نباید اثر جانبی غیرتکرارپذیر داشته باشد.
export async function updateJSON(key, fallback, mutate) {
  const redis = await getRedis();
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await redis.executeIsolated(async isolated => {
        await isolated.watch(key);
        const raw = await isolated.get(key);
        const current = raw ? JSON.parse(raw) : fallback;
        const next = await mutate(current);
        if (next === undefined) { await isolated.unwatch(); return current; }
        await isolated.multi().set(key, JSON.stringify(next)).exec();
        return next;
      });
    } catch (err) {
      if (err instanceof WatchError) continue;
      if (/unknown command|not supported|not allowed/i.test(err.message || '')) {
        // سرویس Redis بدون پشتیبانی WATCH: همان روش ساده قبلی
        const current = await readJSON(key, fallback);
        const next = await mutate(current);
        if (next !== undefined) await redis.set(key, JSON.stringify(next));
        return next === undefined ? current : next;
      }
      throw err;
    }
  }
  throw new Error('تغییر هم‌زمان؛ لطفاً دوباره تلاش کنید.');
}

export async function scanKeys(pattern) {
  const keys = [];
  for await (const item of (await getRedis()).scanIterator({ MATCH: pattern, COUNT: 500 })) {
    if (Array.isArray(item)) keys.push(...item); else keys.push(item);
  }
  return keys;
}

// true یعنی هنوز زیر سقف مجاز است
export async function rateLimit(key, limit, windowSeconds) {
  const redis = await getRedis();
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, windowSeconds);
  return count <= limit;
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `scrypt:${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`;
}

export function verifyPassword(password, stored) {
  const [scheme, salt, hash] = String(stored || '').split(':');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = crypto.scryptSync(password, salt, expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

export function safeEqual(a, b) {
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}

export async function createSession(user) {
  const token = crypto.randomBytes(32).toString('hex');
  const redis = await getRedis();
  await redis.set(`session:${token}`, JSON.stringify({ email: user.email, chatId: String(user.chatId) }), { EX: SESSION_TTL });
  // فهرست نشست‌های هر کاربر (حداکثر ۲۰) تا بعد از تغییر رمز همه باطل شوند
  let evicted = [];
  await updateJSON(`usersessions:${user.email}`, [], tokens => {
    const next = [...tokens, token];
    evicted = next.slice(0, -20);
    return next.slice(-20);
  });
  await Promise.all(evicted.map(t => redis.del(`session:${t}`)));
  return token;
}

export async function removeSession(email, token) {
  await (await getRedis()).del(`session:${token}`);
  await updateJSON(`usersessions:${email}`, [], tokens => tokens.includes(token) ? tokens.filter(t => t !== token) : undefined);
}

export async function revokeAllSessions(email) {
  const redis = await getRedis();
  const tokens = await readJSON(`usersessions:${email}`, []);
  await Promise.all(tokens.map(t => redis.del(`session:${t}`)));
  await redis.del(`usersessions:${email}`);
}

export async function getSession(req) {
  const header = String(req.headers.authorization || '');
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const session = await readJSON(`session:${token}`, null);
  return session ? { ...session, token } : null;
}

// اگر نشست معتبر نبود، خودش پاسخ 401 می‌دهد و null برمی‌گرداند
export async function requireSession(req, res) {
  const session = await getSession(req);
  if (!session) res.status(401).json({ error: 'نشست شما منقضی شده است؛ دوباره وارد شوید.' });
  return session;
}
