// Runs sw.js in a mocked ServiceWorkerGlobalScope and exercises push + notificationclick
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const listeners = {};
const shown = [], fetches = [], posted = [], deleted = [];
let opened = null, focused = 0, apiStatus = 200, authToken = 'a'.repeat(64);
let windows = [];

const self = {
  addEventListener: (type, fn) => { listeners[type] = fn; },
  registration: { showNotification: async (title, opts) => { shown.push({ title, opts }); } },
  clients: { matchAll: async () => windows, openWindow: async url => { opened = url; }, claim: async () => {} },
  skipWaiting: () => {}
};
const ctx = {
  self, URL, console, Promise, Array, JSON, Boolean,
  caches: {
    open: async name => ({
      add: async () => {},
      match: async key => (name === 'nirvana-auth' && key === '/__nirvana_auth' && authToken ? { text: async () => authToken } : undefined)
    }),
    keys: async () => ['nirvana-reminder-v3', 'nirvana-auth', 'nirvana-reminder-v4'],
    match: async () => undefined,
    delete: async key => { deleted.push(key); return true; }
  },
  fetch: async (url, opts) => { fetches.push({ url, headers: opts.headers, body: JSON.parse(opts.body) }); return { ok: apiStatus < 300, status: apiStatus }; },
  Response: { error: () => 'NETWORK_ERROR' }
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8'), ctx);

const plain = v => JSON.parse(JSON.stringify(v));
async function dispatch(type, event) {
  const pending = [];
  listeners[type]({ ...event, waitUntil: p => pending.push(p), respondWith: p => pending.push(Promise.resolve(p).then(v => { event.responded = v; })) });
  await Promise.all(pending);
}

await dispatch('activate', {});
assert.deepEqual(deleted, ['nirvana-reminder-v3'], 'old cache deleted, auth cache kept');

await dispatch('push', { data: { json: () => ({ title: '⏰ یادآور رسید!', body: 'پرداخت قبض', tag: 'nirvana-10-due-1', requireInteraction: true, data: { id: 10 }, actions: [{ action: 'done', title: '✅' }, { action: 'snooze', title: '💤' }] }) } });
assert.equal(shown[0].opts.tag, 'nirvana-10-due-1');
assert.equal(shown[0].opts.icon, '/icons/icon-192.png');
assert.equal(shown[0].opts.badge, '/icons/badge-96.png');
assert.deepEqual(plain(shown[0].opts.actions).map(a => a.action), ['done', 'snooze']);

await dispatch('push', { data: { json: () => { throw new Error('bad'); }, text: () => 'hello' } });
assert.equal(shown[1].opts.body, 'hello');

windows = [{ postMessage: m => posted.push(m), focus: async () => { focused++; } }];
const notification = data => ({ data, close: () => {} });
await dispatch('notificationclick', { action: 'done', notification: notification({ id: 10, url: '/' }) });
assert.equal(fetches[0].url, '/api/reminders');
assert.equal(fetches[0].headers.Authorization, `Bearer ${authToken}`, 'token read from auth cache');
assert.deepEqual(plain(fetches[0].body), { action: 'complete', id: 10, completed: true });
assert.deepEqual(plain(posted[0]), { type: 'reminders-changed' });
assert.equal(focused, 0);

const untilOf = f => new Date(f.body.until).getTime();
await dispatch('notificationclick', { action: 'snooze', notification: notification({ id: 10 }) });
assert.equal(fetches[1].body.action, 'snooze');
assert.ok(Math.abs(untilOf(fetches[1]) - (Date.now() + 3600e3)) < 5000, 'snooze = 1h');
await dispatch('notificationclick', { action: 'snooze10', notification: notification({ id: 10 }) });
assert.ok(Math.abs(untilOf(fetches.at(-1)) - (Date.now() + 600e3)) < 5000, 'snooze10 = 10 min');
await dispatch('notificationclick', { action: 'tomorrow', notification: notification({ id: 10 }) });
const tomorrow = new Date(untilOf(fetches.at(-1)));
assert.ok(tomorrow.getHours() === 9 && tomorrow.getMinutes() === 0 && tomorrow.getDate() !== new Date().getDate(), 'tomorrow 09:00 local');
await dispatch('notificationclick', { action: 'tonight', notification: notification({ id: 10 }) });
const tonight = untilOf(fetches.at(-1)), at20 = new Date(); at20.setHours(20, 0, 0, 0);
assert.ok(tonight === at20.getTime() || Math.abs(tonight - (Date.now() + 7200e3)) < 5000, 'tonight 20:00 or +2h');

apiStatus = 401;
await dispatch('notificationclick', { action: 'done', notification: notification({ id: 10, url: '/' }) });
assert.equal(focused, 1, 'expired session opens the app');
apiStatus = 200;

windows = [];
await dispatch('notificationclick', { action: '', notification: notification({ url: '/' }) });
assert.equal(opened, '/');

const apiEvent = { request: { method: 'GET', url: 'http://x/api/reminders' } };
await dispatch('fetch', apiEvent);
assert.equal(apiEvent.responded, undefined, 'API requests bypass the SW');

console.log('✓ sw.js push / notificationclick / activate / fetch');
