import { getRedis, readJSON, updateJSON, requireSession } from '../lib/db.js';

const PRIORITIES = ['low', 'medium', 'high'];
const TAGS = ['work', 'personal', 'finance', 'dev', 'general'];
const RECURRING = ['none', 'daily', 'weekly', 'monthly'];
const MAX_ATTACHMENT_CHARS = 1.5 * 1024 * 1024; // base64 یک فایل ۱ مگابایتی
const attachmentKey = (chatId, id) => `attachment:${chatId}:${id}`;

function cleanReminder(body) {
  const date = new Date(body.datetime);
  if (isNaN(date.getTime())) return { error: 'تاریخ نامعتبر است.' };
  const title = String(body.title ?? '').trim().slice(0, 500);
  if (!title) return { error: 'عنوان الزامی است.' };
  return {
    value: {
      title,
      desc: String(body.desc ?? '').slice(0, 5000),
      datetime: date.toISOString(),
      priority: PRIORITIES.includes(body.priority) ? body.priority : 'medium',
      tag: TAGS.includes(body.tag) ? body.tag : 'general',
      recurring: RECURRING.includes(body.recurring) ? body.recurring : 'none',
      advanceNotice: Math.min(Math.max(parseInt(body.advanceNotice) || 0, 0), 365),
      subtasks: Array.isArray(body.subtasks)
        ? body.subtasks.slice(0, 100).map(st => ({ text: String(st?.text ?? '').slice(0, 500), done: Boolean(st?.done) }))
        : [],
      isEncrypted: Boolean(body.isEncrypted)
    }
  };
}

// پیوست‌ها کلید جدا در Redis دارند تا هر بار با لیست یادآورها دانلود نشوند
function parseAttachment(att) {
  if (!att || typeof att !== 'object') return { remove: true };
  const meta = { name: String(att.name || 'file').slice(0, 200), type: String(att.type || '').slice(0, 100) };
  if (typeof att.data === 'string') {
    if (!att.data.startsWith('data:') || att.data.length > MAX_ATTACHMENT_CHARS) return { error: 'فایل پیوست نامعتبر یا بزرگ‌تر از ۱ مگابایت است.' };
    return { data: att.data, meta: { ...meta, size: att.data.length } };
  }
  return { keep: true };
}

export default async function handler(req, res) {
  try {
    const session = await requireSession(req, res);
    if (!session) return;
    const redis = await getRedis();
    const chatId = session.chatId;
    const key = `reminders:${chatId}`;

    if (req.method === 'GET') {
      if (req.query.attachment) {
        const file = await redis.get(attachmentKey(chatId, Number(req.query.attachment)));
        return file ? res.status(200).json(JSON.parse(file)) : res.status(404).json({ error: 'پیوست پیدا نشد.' });
      }
      let reminders = await readJSON(key, []);
      if (reminders.some(r => r.attachment && r.attachment.data)) {
        // انتقال پیوست‌های قدیمی که داخل خود یادآور ذخیره شده بودند
        reminders = await updateJSON(key, [], async current => {
          let changed = false;
          for (const r of current) {
            if (r.attachment && r.attachment.data) {
              await redis.set(attachmentKey(chatId, r.id), JSON.stringify(r.attachment));
              r.attachment = { name: r.attachment.name, type: r.attachment.type, size: r.attachment.data.length };
              changed = true;
            }
          }
          return changed ? current : undefined;
        });
      }
      return res.status(200).json(reminders);
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const body = req.body || {};
    const { action } = body;
    const id = Number(body.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'شناسه نامعتبر است.' });

    if (action === 'delete') {
      await updateJSON(key, [], current => current.filter(r => r.id !== id));
      await redis.del(attachmentKey(chatId, id));
      return res.status(200).json({ success: true });
    }

    if (action === 'complete' || action === 'snooze') {
      await updateJSON(key, [], current => {
        const r = current.find(x => x.id === id);
        if (!r) return undefined;
        if (action === 'complete') {
          r.completed = typeof body.completed === 'boolean' ? body.completed : !r.completed;
        } else {
          // until را مرورگر با ساعت محلی کاربر حساب می‌کند (مثلاً «فردا صبح ۹»)
          const nowMs = Date.now();
          const until = body.until ? new Date(body.until).getTime() : NaN;
          const target = Number.isFinite(until) && until > nowMs - 60 * 1000 && until < nowMs + 60 * 24 * 60 * 60 * 1000
            ? until
            : nowMs + Math.min(Math.max(parseInt(body.minutes) || 60, 1), 24 * 60) * 60 * 1000;
          r.datetime = new Date(target).toISOString();
          r.sent = false;
          r.completed = false;
        }
        return current;
      });
      return res.status(200).json({ success: true });
    }

    if (action !== 'add' && action !== 'edit') return res.status(400).json({ error: 'عملیات نامعتبر است.' });

    const cleaned = cleanReminder(body);
    if (cleaned.error) return res.status(400).json({ error: cleaned.error });
    const attachment = parseAttachment(body.attachment);
    if (attachment.error) return res.status(400).json({ error: attachment.error });
    if (attachment.data) {
      await redis.set(attachmentKey(chatId, id), JSON.stringify({ name: attachment.meta.name, type: attachment.meta.type, data: attachment.data }));
    }

    let removeAttachment = false;
    await updateJSON(key, [], current => {
      const index = current.findIndex(r => r.id === id);
      if (action === 'edit') {
        if (index === -1) return undefined;
        const old = current[index];
        // فقط اگر زمان عوض شده دوباره اعلان بفرست؛ قبلاً تیک زدن یک ساب‌تسک هم یادآور قدیمی را دوباره به تلگرام می‌فرستاد
        const timingChanged = old.datetime !== cleaned.value.datetime || Number(old.advanceNotice || 0) !== cleaned.value.advanceNotice;
        removeAttachment = Boolean(attachment.remove && old.attachment);
        current[index] = {
          ...old,
          ...cleaned.value,
          attachment: attachment.data ? attachment.meta : attachment.keep ? (old.attachment || null) : null,
          ...(timingChanged ? { sent: false, advanceSent: false } : {})
        };
        return current;
      }
      if (index > -1) return undefined; // اگر صف آفلاین درخواست را دوباره فرستاد، یادآور تکراری ساخته نشود
      current.push({
        id, ...cleaned.value,
        attachment: attachment.data ? attachment.meta : null,
        completed: false, sent: false, advanceSent: false
      });
      return current;
    });
    if (removeAttachment) await redis.del(attachmentKey(chatId, id));

    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
