import jalaali from 'jalaali-js';

// متن‌ها و دکمه‌های مشترک ربات تلگرام (cron و webhook)

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
const WEEKDAYS = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه']; // ترتیب getUTCDay

export const fa = value => String(value).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);
export const toLatinDigits = value => String(value)
  .replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
  .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
export const escapeHtml = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const reminderTitle = r => (r.isEncrypted ? '🔒 [محرمانه]' : (r.title || '')).slice(0, 200);
const pad = n => String(n).padStart(2, '0');

// tzOffsetMinutes همان خروجی getTimezoneOffset مرورگر است (تهران: ‎-210)
const localDate = (ms, tz) => new Date(ms - tz * 60 * 1000);
export const dayStart = (ms, tz, dayDelta = 0) => {
  const d = localDate(ms, tz);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + dayDelta) + tz * 60 * 1000;
};
export const localHour = (ms, tz) => localDate(ms, tz).getUTCHours();
export const localDateKey = (ms, tz) => { const d = localDate(ms, tz); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };
export const timeLabel = (ms, tz) => { const d = localDate(ms, tz); return fa(`${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`); };
export const dateLabel = (ms, tz) => {
  const d = localDate(ms, tz);
  const j = jalaali.toJalaali(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  return `${WEEKDAYS[d.getUTCDay()]} ${fa(j.jd)} ${MONTHS[j.jm - 1]}`;
};
export const whenLabel = (ms, nowMs, tz) => dayStart(ms, tz) === dayStart(nowMs, tz) ? timeLabel(ms, tz) : `${dateLabel(ms, tz)} ${timeLabel(ms, tz)}`;

// زمان تعویق؛ «امشب» اگر کمتر از نیم ساعت به ۲۰:۰۰ مانده (یا گذشته) دو ساعت بعد است
export function snoozeTarget(preset, nowMs, tz) {
  if (preset === '10m') return nowMs + 10 * 60 * 1000;
  if (preset === '1h') return nowMs + 60 * 60 * 1000;
  if (preset === 'tonight') {
    const tonight = dayStart(nowMs, tz) + 20 * 60 * 60 * 1000;
    return tonight - nowMs < 30 * 60 * 1000 ? nowMs + 2 * 60 * 60 * 1000 : tonight;
  }
  if (preset === 'tomorrow') return dayStart(nowMs, tz, 1) + 9 * 60 * 60 * 1000;
  return null;
}

export const dueKeyboard = id => ({
  inline_keyboard: [
    [{ text: '✅ انجام شد', callback_data: `complete_${id}` }],
    [{ text: '💤 ۱۰ دقیقه', callback_data: `snz10m_${id}` }, { text: '💤 ۱ ساعت', callback_data: `snz1h_${id}` }],
    [{ text: '🌙 امشب', callback_data: `snztonight_${id}` }, { text: '☀️ فردا صبح', callback_data: `snztomorrow_${id}` }]
  ]
});

export const PUSH_DUE_ACTIONS = [
  { action: 'done', title: '✅ انجام شد' },
  { action: 'snooze', title: '💤 ۱ ساعت بعد' },
  { action: 'snooze10', title: '💤 ۱۰ دقیقه' },
  { action: 'tonight', title: '🌙 امشب' },
  { action: 'tomorrow', title: '☀️ فردا صبح' }
];

export const BOT_COMMANDS = [
  { command: 'today', description: 'کارهای امروز و عقب‌افتاده' },
  { command: 'list', description: 'همه کارهای باز' },
  { command: 'summary', description: 'تنظیم خلاصه صبحگاهی' },
  { command: 'id', description: 'نمایش Chat ID' },
  { command: 'help', description: 'راهنما' }
];

export const HELP_TEXT = `🤖 دستورهای ربات نیروانا:

/today — کارهای امروز و عقب‌افتاده (با دکمه انجام و حذف)
/list — همه کارهای باز
/summary — وضعیت خلاصه صبحگاهی
/summary off — خاموش کردن خلاصه
/summary 7 — ارسال خلاصه ساعت ۷ صبح
/id — نمایش Chat ID

➕ ثبت سریع یادآور:
خرید نان فردا ساعت 18:30
چک کردن ایمیل امروز ساعت 9`;

// kind: 't' = امروز و عقب‌افتاده، 'l' = همه کارهای باز. دکمه‌ها برای ۱۰ مورد اول ساخته می‌شوند.
export function buildTaskList(reminders, kind, nowMs, tz) {
  const open = reminders
    .map(r => ({ r, at: new Date(r.datetime).getTime() }))
    .filter(x => !x.r.completed && !isNaN(x.at))
    .sort((a, b) => a.at - b.at);
  const overdue = open.filter(x => x.at < nowMs);
  const rest = kind === 't' ? open.filter(x => x.at >= nowMs && x.at < dayStart(nowMs, tz, 1)) : open.filter(x => x.at >= nowMs);
  const header = kind === 't' ? `📅 <b>کارهای امروز</b> — ${dateLabel(nowMs, tz)}` : '🗂 <b>کارهای باز</b>';
  const total = overdue.length + rest.length;
  if (!total) {
    return { empty: true, text: `${header}\n\n🎉 ${kind === 't' ? 'برای امروز کاری ندارید.' : 'هیچ کار بازی ندارید.'}` };
  }

  const limit = kind === 't' ? 15 : 20;
  const lines = [header];
  const rows = [];
  let n = 0;
  for (const [title, items] of [['⚠️ عقب‌افتاده', overdue], [kind === 't' ? '📋 باقی امروز' : '🗓 پیش رو', rest]]) {
    if (!items.length || n >= limit) continue;
    lines.push('', `<b>${title}</b> (${fa(items.length)})`);
    for (const { r, at } of items) {
      if (n >= limit) break;
      n++;
      lines.push(`${fa(n)}. ${escapeHtml(reminderTitle(r))} — ${whenLabel(at, nowMs, tz)}${r.priority === 'high' ? ' 🔴' : ''}`);
      if (n <= 10) rows.push([{ text: `✅ ${fa(n)}`, callback_data: `ld_${kind}_${r.id}` }, { text: `🗑 ${fa(n)}`, callback_data: `lx_${kind}_${r.id}` }]);
    }
  }
  if (total > n) lines.push('', `… و ${fa(total - n)} مورد دیگر در اپ`);
  return { empty: false, text: lines.join('\n'), reply_markup: { inline_keyboard: rows } };
}
