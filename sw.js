const CACHE_NAME = 'nirvana-reminder-v4';
const AUTH_CACHE = 'nirvana-auth'; // صفحه توکن ورود را اینجا می‌گذارد تا دکمه‌های اعلان بتوانند API را صدا بزنند
const APP_ICON = '/icons/icon-192.png';
const BADGE_ICON = '/icons/badge-96.png';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/styles.css',
  APP_ICON,
  BADGE_ICON,
  'https://cdn.jsdelivr.net/npm/jalaali-js/dist/jalaali.min.js',
  'https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.003/Vazirmatn-font-face.css'
];

self.addEventListener('install', event => {
  // هر فایل جدا کش می‌شود؛ قبلاً خطای یک CDN کل نصب Service Worker (و در نتیجه اعلان‌ها) را خراب می‌کرد
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => Promise.all(
      ASSETS_TO_CACHE.map(url => cache.add(url).catch(err => console.warn('SW cache skipped:', url, err)))
    ))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME && key !== AUTH_CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).pathname.startsWith('/api/')) return;
  event.respondWith(
    fetch(request).catch(async () =>
      (await caches.match(request)) || (request.mode === 'navigate' && await caches.match('/index.html')) || Response.error()
    )
  );
});

// --- اعلان‌ها ---
self.addEventListener('push', event => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch (e) { payload = { body: event.data ? event.data.text() : '' }; }

  event.waitUntil(self.registration.showNotification(payload.title || '⏰ Nirvana', {
    body: payload.body || '',
    tag: payload.tag || 'nirvana',
    icon: APP_ICON,
    badge: BADGE_ICON,
    dir: 'rtl',
    lang: 'fa',
    requireInteraction: Boolean(payload.requireInteraction),
    vibrate: [200, 100, 200],
    data: { url: '/', ...(payload.data || {}) },
    actions: Array.isArray(payload.actions) ? payload.actions : []
  }));
});

const SNOOZE_ACTIONS = { snooze: '1h', snooze10: '10m', tonight: 'tonight', tomorrow: 'tomorrow' };

// با ساعت محلی دستگاه؛ همان منطق snoozeTarget در index.html و lib/bot.js
function snoozeTarget(preset, now = new Date()) {
  const ms = now.getTime();
  if (preset === '10m') return new Date(ms + 10 * 60 * 1000);
  if (preset === 'tonight') {
    const tonight = new Date(ms); tonight.setHours(20, 0, 0, 0);
    return tonight.getTime() - ms < 30 * 60 * 1000 ? new Date(ms + 2 * 60 * 60 * 1000) : tonight;
  }
  if (preset === 'tomorrow') {
    const tomorrow = new Date(ms); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(9, 0, 0, 0);
    return tomorrow;
  }
  return new Date(ms + 60 * 60 * 1000);
}

async function authHeaders() {
  try {
    const cache = await caches.open(AUTH_CACHE);
    const res = await cache.match('/__nirvana_auth');
    return res ? { Authorization: `Bearer ${await res.text()}` } : {};
  } catch (e) {
    return {};
  }
}

self.addEventListener('notificationclick', event => {
  const notification = event.notification;
  const data = notification.data || {};
  notification.close();

  const snoozePreset = SNOOZE_ACTIONS[event.action];
  if ((event.action === 'done' || snoozePreset) && data.id != null) {
    const body = event.action === 'done'
      ? { action: 'complete', id: data.id, completed: true }
      : { action: 'snooze', id: data.id, until: snoozeTarget(snoozePreset).toISOString() };
    event.waitUntil((async () => {
      try {
        const res = await fetch('/api/reminders', {
          method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) }, body: JSON.stringify(body)
        });
        if (res.status === 401) return focusOrOpen(data.url || '/'); // نشست منقضی شده؛ اپ را باز کن تا دوباره وارد شود
        await broadcast({ type: 'reminders-changed' });
      } catch (err) {
        console.error('Notification action failed:', err);
      }
    })());
    return;
  }

  event.waitUntil(focusOrOpen(data.url || '/'));
});

async function broadcast(message) {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  windows.forEach(client => client.postMessage(message));
}

async function focusOrOpen(url) {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const existing = windows.find(client => 'focus' in client);
  if (existing) {
    existing.postMessage({ type: 'reminders-changed' });
    return existing.focus();
  }
  return self.clients.openWindow(url);
}
