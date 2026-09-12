import { readJSON, updateJSON } from './db.js';

// تنظیمات هر چت تلگرام؛ getTimezoneOffset تهران ‎-210 است
export const DEFAULT_SETTINGS = { dailySummary: true, summaryHour: 8, tzOffsetMinutes: -210 };

export async function getChatSettings(chatId) {
  return { ...DEFAULT_SETTINGS, ...(await readJSON(`settings:${chatId}`, {})) };
}

export async function updateChatSettings(chatId, patch) {
  const next = await updateJSON(`settings:${chatId}`, {}, current => ({ ...current, ...patch }));
  return { ...DEFAULT_SETTINGS, ...next };
}

export function cleanSettingsPatch(body) {
  const patch = {};
  if (typeof body.dailySummary === 'boolean') patch.dailySummary = body.dailySummary;
  const hour = Number(body.summaryHour);
  if (body.summaryHour !== undefined && Number.isInteger(hour) && hour >= 0 && hour <= 23) patch.summaryHour = hour;
  const tz = Number(body.tzOffsetMinutes);
  if (body.tzOffsetMinutes !== undefined && Number.isInteger(tz) && tz >= -840 && tz <= 720) patch.tzOffsetMinutes = tz;
  return patch;
}

export const publicSettings = s => ({ dailySummary: s.dailySummary, summaryHour: s.summaryHour, tzOffsetMinutes: s.tzOffsetMinutes });
