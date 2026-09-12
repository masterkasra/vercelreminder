const CACHE_NAME = 'nirvana-reminder-v3';
const APP_ICON = 'https://cdn-icons-png.flaticon.com/512/819/819865.png';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  'https://cdn.tailwindcss.com',
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
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
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
    badge: APP_ICON,
    dir: 'rtl',
    lang: 'fa',
    requireInteraction: Boolean(payload.requireInteraction),
    vibrate: [200, 100, 200],
    data: { url: '/', ...(payload.data || {}) },
    actions: Array.isArray(payload.actions) ? payload.actions : []
  }));
});

self.addEventListener('notificationclick', event => {
  const notification = event.notification;
  const data = notification.data || {};
  notification.close();

  if ((event.action === 'done' || event.action === 'snooze') && data.id != null && data.chatId) {
    const body = event.action === 'done'
      ? { action: 'complete', id: data.id, completed: true }
      : { action: 'snooze', id: data.id, minutes: 60 };
    event.waitUntil(
      fetch(`/api/reminders?chat_id=${encodeURIComponent(data.chatId)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      })
        .then(() => broadcast({ type: 'reminders-changed' }))
        .catch(err => console.error('Notification action failed:', err))
    );
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
