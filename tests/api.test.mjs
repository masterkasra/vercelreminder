import assert from 'node:assert/strict';
import webpush from 'web-push';

const store = globalThis.__fakeRedisStore = new Map();
const versions = globalThis.__fakeRedisVersions = new Map();
process.env.TELEGRAM_BOT_TOKEN = 'TEST';
process.env.OPENROUTER_API_KEY = 'OR';

// --- mocks ---
const tgCalls = [];
const aiCalls = [];
let tgStatus = () => 200;
let onTelegram = null;
globalThis.fetch = async (url, opts) => {
  const body = opts && opts.body ? JSON.parse(opts.body) : {};
  if (String(url).includes('openrouter')) {
    aiCalls.push(body);
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '{"title":"x","y":1405,"m":6,"d":22,"h":9,"min":0}' } }] }) };
  }
  const method = url.split('/').pop();
  tgCalls.push({ method, body });
  if (onTelegram && method === 'sendMessage') { const hook = onTelegram; onTelegram = null; await hook(body); }
  const status = method === 'sendMessage' ? tgStatus(body) : 200;
  const results = { getMe: { username: 'nirvana_bot' }, getWebhookInfo: { url: 'https://app.example/api/webhook' } };
  return { ok: status < 300, status, text: async () => 'mock', json: async () => ({ ok: status < 300, result: results[method] || true }) };
};
const pushCalls = [];
webpush.sendNotification = async (sub, payload, options) => {
  pushCalls.push({ endpoint: sub.endpoint, payload: JSON.parse(payload), options });
  if (sub.endpoint.includes('expired')) { const e = new Error('gone'); e.statusCode = 410; throw e; }
  if (sub.endpoint.includes('hang')) return new Promise(() => {}); // a push service that never answers
  return { statusCode: 201 };
};

function call(handler, { method = 'GET', query = {}, body = {}, headers = {}, token } = {}) {
  return new Promise((resolve, reject) => {
    const res = {
      statusCode: 200,
      status(c) { this.statusCode = c; return this; },
      json(d) { resolve({ status: this.statusCode, body: d }); return this; },
      send(d) { resolve({ status: this.statusCode, body: d }); return this; }
    };
    const h = { ...headers, ...(token ? { authorization: `Bearer ${token}` } : {}) };
    Promise.resolve(handler({ method, query, body, headers: h }, res)).catch(reject);
  });
}
const lastCode = chatId => {
  const msg = [...tgCalls].reverse().find(c => c.method === 'sendMessage' && String(c.body.chat_id) === String(chatId) && /🔐/.test(c.body.text));
  return msg && msg.body.text.match(/(\d{6})/)[1];
};

const { default: auth } = await import('../api/auth.js');
const { default: reminders } = await import('../api/reminders.js');
const { default: cron } = await import('../api/cron.js');
const { default: webhook } = await import('../api/webhook.js');
const { default: push } = await import('../api/push.js');
const { default: ai } = await import('../api/ai.js');
const { default: settingsApi } = await import('../api/settings.js');
const toFa = s => String(s).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);
const secretHeaders = () => ({ 'x-telegram-bot-api-secret-token': webhookSecret() });
const say = (chat, text) => call(webhook, { method: 'POST', headers: secretHeaders(), body: { message: { chat: { id: chat }, text } } });
const press = (chat, data, text = 'msg') => call(webhook, { method: 'POST', headers: secretHeaders(), body: { callback_query: { id: 'cb', data, message: { chat: { id: chat }, message_id: 9, text } } } });
const lastEdit = () => [...tgCalls].reverse().find(c => c.method === 'editMessageText');
const { webhookSecret } = await import('../lib/telegram.js');
const list = chat => JSON.parse(store.get(`reminders:${chat}`) || '[]');
const realNow = Date.now;
let tokenA;

// ---------- auth.js ----------
{
  assert.equal((await call(auth)).body.botUsername, 'nirvana_bot');
  const reg = { action: 'register', email: 'Kasra@Example.com', password: 'secret1', firstName: 'کسری', chatId: '222' };
  assert.equal((await call(auth, { method: 'POST', body: { ...reg, chatId: 'abc' } })).status, 400, 'non-numeric chat id');
  assert.equal((await call(auth, { method: 'POST', body: { ...reg, password: '123' } })).status, 400, 'short password');

  const r1 = await call(auth, { method: 'POST', body: reg });
  assert.equal(r1.body.needsVerification, true, JSON.stringify(r1.body));
  assert.ok(!store.has('user:kasra@example.com'), 'account only created after verification');
  const code = lastCode(222);
  assert.ok(code, 'code sent to the chat id');

  const bad = await call(auth, { method: 'POST', body: { action: 'verify', email: 'kasra@example.com', code: '000000' === code ? '111111' : '000000' } });
  assert.equal(bad.status, 400);
  const ok = await call(auth, { method: 'POST', body: { action: 'verify', email: 'kasra@example.com', code } });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.match(ok.body.token, /^[a-f0-9]{64}$/);
  assert.equal(ok.body.user.chatId, '222');
  assert.ok(!('passwordHash' in ok.body.user) && !('password' in ok.body.user), 'no password in response');
  const stored = JSON.parse(store.get('user:kasra@example.com'));
  assert.match(stored.passwordHash, /^scrypt:/); assert.equal(stored.chatVerified, true);
  assert.equal(store.get('chatowner:222'), 'kasra@example.com');
  tokenA = ok.body.token;

  const wrong = await call(auth, { method: 'POST', body: { action: 'login', email: 'kasra@example.com', password: 'nope' } });
  const unknown = await call(auth, { method: 'POST', body: { action: 'login', email: 'ghost@example.com', password: 'nope' } });
  assert.equal(wrong.status, 401); assert.equal(wrong.body.error, unknown.body.error, 'no account enumeration');
  const login = await call(auth, { method: 'POST', body: { action: 'login', email: 'kasra@example.com', password: 'secret1' } });
  assert.match(login.body.token, /^[a-f0-9]{64}$/, 'verified user logs in directly');

  // legacy account with plaintext password and unverified chat id
  store.set('user:old@example.com', JSON.stringify({ email: 'old@example.com', password: 'plain123', chatId: '333', firstName: 'قدیمی' }));
  const legacy = await call(auth, { method: 'POST', body: { action: 'login', email: 'old@example.com', password: 'plain123' } });
  assert.equal(legacy.body.needsVerification, true);
  const migrated = JSON.parse(store.get('user:old@example.com'));
  assert.ok(migrated.passwordHash && !('password' in migrated), 'plaintext password migrated to hash');
  const legacyOk = await call(auth, { method: 'POST', body: { action: 'verify', email: 'old@example.com', code: lastCode(333) } });
  assert.ok(legacyOk.body.token);

  // hijack attempt: someone else registers with the victim's chat id
  const hijack = await call(auth, { method: 'POST', body: { ...reg, email: 'attacker@example.com' } });
  assert.equal(hijack.status, 400, 'claimed chat id rejected');

  // brute force
  let last;
  for (let i = 0; i < 11; i++) last = await call(auth, { method: 'POST', body: { action: 'login', email: 'brute@example.com', password: 'x' } });
  assert.equal(last.status, 429, 'login rate limited');

  // unreachable chat id
  tgStatus = () => 400;
  const unreachable = await call(auth, { method: 'POST', body: { ...reg, email: 'new@example.com', chatId: '999' } });
  assert.equal(unreachable.status, 400); assert.ok(unreachable.body.error.includes('@nirvana_bot'));
  tgStatus = () => 200;

  // logout revokes the session
  const tmp = (await call(auth, { method: 'POST', body: { action: 'login', email: 'kasra@example.com', password: 'secret1' } })).body.token;
  await call(auth, { method: 'POST', body: { action: 'logout' }, token: tmp });
  assert.equal((await call(reminders, { token: tmp })).status, 401, 'revoked token rejected');
  console.log('✓ auth.js');
}

// ---------- reminders.js ----------
{
  assert.equal((await call(reminders, { query: { chat_id: '222' } })).status, 401, 'chat_id alone is no longer enough');
  assert.equal((await call(reminders, { token: 'f'.repeat(64) })).status, 401);

  const t = tokenA;
  const base = { action: 'add', id: 1, title: 'a', datetime: '2026-01-01T10:00:00.000Z', priority: 'medium', tag: 'work', subtasks: [{ text: 's', done: false }] };
  const file = { name: 'x.png', type: 'image/png', data: 'data:image/png;base64,AAAA' };
  assert.equal((await call(reminders, { method: 'POST', token: t, body: { ...base, datetime: 'nope' } })).status, 400);
  assert.equal((await call(reminders, { method: 'POST', token: t, body: { ...base, title: '  ' } })).status, 400);
  assert.equal((await call(reminders, { method: 'POST', token: t, body: { ...base, attachment: { name: 'x', data: 'javascript:alert(1)' } } })).status, 400);

  await call(reminders, { method: 'POST', token: t, body: { ...base, attachment: file } });
  await call(reminders, { method: 'POST', token: t, body: base }); // retry from offline queue
  let items = (await call(reminders, { token: t })).body;
  assert.equal(items.length, 1, 'duplicate add ignored');
  assert.deepEqual(items[0].attachment, { name: 'x.png', type: 'image/png', size: file.data.length });
  assert.equal((await call(reminders, { token: t, query: { attachment: '1' } })).body.data, file.data);

  const s = list('222'); s[0].sent = true; s[0].advanceSent = true; store.set('reminders:222', JSON.stringify(s));
  await call(reminders, { method: 'POST', token: t, body: { ...base, action: 'edit', subtasks: [{ text: 's', done: true }], attachment: items[0].attachment } });
  assert.equal(list('222')[0].sent, true, 'subtask toggle keeps sent');
  assert.ok(store.has('attachment:222:1'), 'unchanged attachment kept');
  await call(reminders, { method: 'POST', token: t, body: { ...base, action: 'edit', datetime: '2026-01-02T10:00:00.000Z', attachment: null } });
  assert.equal(list('222')[0].sent, false, 'datetime change resets sent');
  assert.ok(!store.has('attachment:222:1') && list('222')[0].attachment === null, 'attachment removed');

  await call(reminders, { method: 'POST', token: t, body: { action: 'complete', id: 1, completed: true } });
  await call(reminders, { method: 'POST', token: t, body: { action: 'complete', id: 1, completed: true } });
  assert.equal(list('222')[0].completed, true);
  const before = realNow();
  await call(reminders, { method: 'POST', token: t, body: { action: 'snooze', id: 1, minutes: 60 } });
  assert.ok(Math.abs(new Date(list('222')[0].datetime).getTime() - (before + 3600e3)) < 5000);
  const until = new Date(realNow() + 5 * 3600e3).toISOString();
  await call(reminders, { method: 'POST', token: t, body: { action: 'snooze', id: 1, until } });
  assert.equal(list('222')[0].datetime, until, 'snooze to a browser-computed time');
  await call(reminders, { method: 'POST', token: t, body: { action: 'snooze', id: 1, until: '2000-01-01T00:00:00Z' } });
  assert.ok(Math.abs(new Date(list('222')[0].datetime).getTime() - (realNow() + 3600e3)) < 5000, 'past until falls back to 1h');

  // concurrent writer between read and write -> WATCH retry keeps both changes
  globalThis.__fakeRedisBeforeExec = async () => {
    const cur = list('222'); cur.push({ id: 77, title: 'from telegram', datetime: '2026-02-01T00:00:00.000Z' });
    store.set('reminders:222', JSON.stringify(cur)); versions.set('reminders:222', (versions.get('reminders:222') || 0) + 1);
  };
  await call(reminders, { method: 'POST', token: t, body: { ...base, id: 2, title: 'b' } });
  assert.deepEqual(list('222').map(r => r.id).sort(), [1, 2, 77], 'no lost update');

  // old reminders with the file inside the list are migrated on read
  const legacy = list('222'); legacy.find(r => r.id === 2).attachment = file; store.set('reminders:222', JSON.stringify(legacy));
  items = (await call(reminders, { token: t })).body;
  assert.ok(!items.find(r => r.id === 2).attachment.data && store.has('attachment:222:2'), 'inline attachment migrated');

  await call(reminders, { method: 'POST', token: t, body: { action: 'delete', id: 2 } });
  assert.ok(!store.has('attachment:222:2') && !list('222').some(r => r.id === 2), 'delete removes attachment');
  assert.equal((await call(reminders, { method: 'PUT', token: t })).status, 405);
  store.set('reminders:222', '[]');
  console.log('✓ reminders.js');
}

// ---------- push.js + ai.js ----------
{
  const k1 = (await call(push)).body.publicKey, k2 = (await call(push)).body.publicKey;
  assert.ok(k1 && k1 === k2 && store.has('config:vapid'), 'VAPID keys auto-generated once');
  assert.equal((await call(push, { method: 'POST', body: { action: 'subscribe' } })).status, 401);
  const sub = ep => ({ action: 'subscribe', subscription: { endpoint: ep, keys: { p256dh: 'a', auth: 'b' } } });
  assert.equal((await call(push, { method: 'POST', token: tokenA, body: sub('http://evil.local/x') })).status, 400);
  for (const ep of ['https://push.example/ok', 'https://push.example/expired', 'https://push.example/ok']) await call(push, { method: 'POST', token: tokenA, body: sub(ep) });
  assert.equal(JSON.parse(store.get('push:222')).length, 2);
  const tp = await call(push, { method: 'POST', token: tokenA, body: { action: 'test' } });
  assert.deepEqual([tp.status, tp.body.devices, tp.body.delivered], [200, 2, 1], JSON.stringify(tp.body));
  assert.deepEqual(tp.body.results.map(r => [r.service, r.ok, r.expired]).sort(), [['push.example', false, true], ['push.example', true, false]]);
  assert.ok(tp.body.results.every(r => /^[a-f0-9]{12}$/.test(r.id) && !('endpoint' in r)), 'short ids, no raw endpoints');
  assert.ok(pushCalls.every(c => c.payload.tag === 'nirvana-test-push' && c.options.urgency === 'high' && c.options.timeout === 10000), 'high urgency + timeout');
  assert.equal(JSON.parse(store.get('push:222')).length, 1, 'expired subscription removed by test push');
  const t0 = realNow();
  const delayed = await call(push, { method: 'POST', token: tokenA, body: { action: 'test', delaySeconds: 1 } });
  assert.ok(delayed.status === 200 && delayed.body.delivered === 1 && realNow() - t0 >= 950, 'delayed test waits, then sends');
  await call(push, { method: 'POST', token: tokenA, body: sub('https://push.example/expired') }); // restore for the cron test
  pushCalls.length = 0;

  // a push service that never responds must not hang the request, and is dropped after 5 failures in a row
  const { sendPush: rawSend, recordPushResults, endpointId } = await import('../lib/push.js');
  const started = realNow();
  const hung = await rawSend([{ endpoint: 'https://hang.push.example/x', keys: { p256dh: 'a', auth: 'b' } }], { title: 't' });
  assert.ok(realNow() - started < 13000 && hung[0].ok === false && /timeout/.test(hung[0].error), 'timed out: ' + JSON.stringify(hung[0]));
  store.set('push:900', JSON.stringify([{ endpoint: 'https://a', keys: {} }, { endpoint: 'https://b', keys: {} }]));
  for (let i = 0; i < 5; i++) await recordPushResults('900', [{ endpoint: 'https://a', ok: false }, { endpoint: 'https://b', ok: true }]);
  assert.deepEqual(JSON.parse(store.get('push:900')).map(s => s.endpoint), ['https://b'], 'failing subscription dropped after 5');
  await recordPushResults('900', [{ endpoint: 'https://b', ok: false }]);
  assert.equal(JSON.parse(store.get('push:900'))[0].failures, 1);
  await recordPushResults('900', [{ endpoint: 'https://b', ok: true }]);
  assert.equal(JSON.parse(store.get('push:900'))[0].failures, 0, 'success resets the counter');
  assert.equal(endpointId('https://a'), (await import('node:crypto')).createHash('sha256').update('https://a').digest('hex').slice(0, 12));
  pushCalls.length = 0;

  assert.equal((await call(ai, { method: 'POST', body: { text: 'x' } })).status, 401, 'AI needs login');
  const r = await call(ai, { method: 'POST', token: tokenA, body: { text: 'فردا "ساعت" ۹ جلسه', lang: 'fa', today: { y: 1405, m: 6, d: 21 } } });
  assert.equal(r.status, 200); assert.ok(r.body.candidates[0].content.parts[0].text.includes('title'));
  assert.ok(aiCalls[0].messages[0].content.includes(JSON.stringify('فردا "ساعت" ۹ جلسه')) && aiCalls[0].messages[0].content.includes('Jalali'));
  let last; for (let i = 0; i < 30; i++) last = await call(ai, { method: 'POST', token: tokenA, body: { text: 'x', lang: 'en' } });
  assert.equal(last.status, 429, 'AI rate limited');
  console.log('✓ push.js / ai.js');
}

// ---------- password reset ----------
{
  const email = 'old@example.com';
  const oldToken = (await call(auth, { method: 'POST', body: { action: 'login', email, password: 'plain123' } })).body.token;
  assert.ok(oldToken);
  const unknown = await call(auth, { method: 'POST', body: { action: 'forgot', email: 'nobody@example.com' } });
  const known = await call(auth, { method: 'POST', body: { action: 'forgot', email } });
  assert.equal(unknown.status, 200); assert.equal(unknown.body.message, known.body.message, 'no account enumeration');
  const code = lastCode(333);
  assert.ok(tgCalls.at(-1).body.text.includes('بازیابی'));
  assert.equal((await call(auth, { method: 'POST', body: { action: 'verify', email, code } })).status, 400, 'reset code is not a login code');
  assert.equal((await call(auth, { method: 'POST', body: { action: 'reset', email, code, newPassword: '123' } })).status, 400, 'short new password');
  const reset = await call(auth, { method: 'POST', body: { action: 'reset', email, code: toFa(code), newPassword: 'brandnew1' } });
  assert.equal(reset.status, 200, JSON.stringify(reset.body));
  assert.equal((await call(reminders, { token: oldToken })).status, 401, 'old sessions revoked');
  assert.equal((await call(reminders, { token: reset.body.token })).status, 200);
  assert.equal((await call(auth, { method: 'POST', body: { action: 'login', email, password: 'plain123' } })).status, 401, 'old password rejected');
  assert.equal((await call(auth, { method: 'POST', body: { action: 'reset', email, code, newPassword: 'again123' } })).status, 400, 'code is single-use');
  console.log('✓ password reset');
}

// ---------- settings.js ----------
{
  assert.equal((await call(settingsApi, {})).status, 401);
  assert.deepEqual((await call(settingsApi, { token: tokenA })).body, { dailySummary: true, summaryHour: 8, tzOffsetMinutes: -210, pushDevices: 2, cronLastRun: null });
  const p = await call(settingsApi, { method: 'POST', token: tokenA, body: { summaryHour: 7, tzOffsetMinutes: 60, dailySummary: 'yes' } });
  assert.deepEqual(p.body, { dailySummary: true, summaryHour: 7, tzOffsetMinutes: 60 }, 'invalid fields ignored');
  assert.equal((await call(settingsApi, { method: 'POST', token: tokenA, body: { summaryHour: 99 } })).status, 400);
  store.delete('settings:222');
  console.log('✓ settings.js');
}

// ---------- cron.js ----------
{
  const NOW = Date.parse('2025-09-22T06:31:00Z'); // 1404/06/31 10:01 Tehran
  Date.now = () => NOW;
  store.set('reminders:222', JSON.stringify([
    { id: 10, title: 'pay <rent> & _bills_ *now*', desc: 'x<y', datetime: '2025-09-22T06:30:00.000Z', priority: 'high', recurring: 'monthly', advanceNotice: 0, completed: false, sent: false, advanceSent: false, subtasks: [{ text: 'a', done: true }], attachment: { name: 'bill.pdf', type: 'application/pdf', size: 10 } },
    { id: 11, title: 'daily', datetime: '2025-09-22T06:00:00.000Z', recurring: 'daily', advanceNotice: 0, completed: false, sent: false },
    { id: 12, title: 'advance', datetime: '2025-09-24T06:00:00.000Z', recurring: 'none', advanceNotice: 2, completed: false, sent: false, advanceSent: false },
    { id: 13, title: 'future', datetime: '2025-09-30T06:00:00.000Z', recurring: 'none', advanceNotice: 0, completed: false, sent: false },
    { id: 14, title: 'done', datetime: '2025-09-22T06:00:00.000Z', recurring: 'none', completed: true, sent: false }
  ]));
  store.set('settings:222', JSON.stringify({ dailySummary: false })); // summary is tested separately below
  store.set('attachment:222:10', JSON.stringify({ name: 'bill.pdf', type: 'application/pdf', data: 'data:application/pdf;base64,QQ==' }));
  onTelegram = async () => { const cur = list('222'); cur.push({ id: 99, title: 'added mid-cron', datetime: '2030-01-01T00:00:00.000Z' }); store.set('reminders:222', JSON.stringify(cur)); };
  tgCalls.length = 0;

  process.env.CRON_SECRET = 's3cret';
  assert.equal((await call(cron, {})).status, 401, 'CRON_SECRET enforced');
  const r = await call(cron, { headers: { authorization: 'Bearer s3cret', host: 'app.example' } });
  delete process.env.CRON_SECRET;
  assert.equal(r.status, 200, JSON.stringify(r.body));

  const setHook = tgCalls.find(c => c.method === 'setWebhook');
  assert.deepEqual(setHook.body, { url: 'https://app.example/api/webhook', secret_token: webhookSecret() }, 'webhook re-registered with secret');
  assert.equal(store.get('config:webhook_secured'), '1');
  assert.equal(store.get('config:last_cron_run'), String(NOW), 'last cron run recorded');
  assert.equal((await call(settingsApi, { token: tokenA })).body.cronLastRun, NOW, 'exposed in settings');
  assert.deepEqual(tgCalls.find(c => c.method === 'setMyCommands').body.commands.map(c => c.command), ['today', 'list', 'summary', 'id', 'help'], 'bot menu registered');

  const msgs = tgCalls.filter(c => c.method === 'sendMessage');
  assert.equal(msgs.length, 3);
  const m10 = msgs.find(m => m.body.text.includes('rent'));
  assert.equal(m10.body.parse_mode, 'HTML');
  assert.ok(m10.body.text.includes('pay &lt;rent&gt; &amp; _bills_ *now*'));
  assert.deepEqual(m10.body.reply_markup.inline_keyboard.flat().map(b => b.callback_data), ['complete_10', 'snz10m_10', 'snz1h_10', 'snztonight_10', 'snztomorrow_10']);

  const after = list('222'); const byId = id => after.find(x => x.id === id);
  assert.ok(byId(99), 'reminder added during cron survived');
  assert.equal(byId(10).sent, true); assert.equal(byId(10).recurrenceSpawned, true);
  assert.equal(byId(12).advanceSent, true); assert.ok(!byId(13).sent); assert.ok(!byId(14).sent);
  const copies = after.filter(x => ![10, 11, 12, 13, 14, 99].includes(x.id));
  assert.equal(copies.length, 2);
  copies.forEach(c => assert.ok(Number.isSafeInteger(c.id)));
  const monthly = copies.find(c => c.title.startsWith('pay'));
  assert.equal(monthly.datetime, '2025-10-22T06:30:00.000Z', '31 Shahrivar -> 30 Mehr');
  assert.equal(store.get(`attachment:222:${monthly.id}`), store.get('attachment:222:10'), 'attachment copied to next occurrence');

  assert.equal(pushCalls.length, 6);
  const p10 = pushCalls.find(p => p.payload.body.includes('rent'));
  assert.equal(p10.payload.tag, `nirvana-10-due-${Date.parse('2025-09-22T06:30:00.000Z')}`);
  assert.deepEqual(p10.payload.data, { id: 10 }, 'no chat id in push payload');
  assert.deepEqual(p10.payload.actions.map(a => a.action), ['done', 'snooze', 'snooze10', 'tonight', 'tomorrow']);
  assert.equal(p10.options.vapidDetails.subject, 'https://app.example');
  assert.equal(p10.options.vapidDetails.publicKey, JSON.parse(store.get('config:vapid')).publicKey);
  assert.deepEqual(JSON.parse(store.get('push:222')).map(s => s.endpoint), ['https://push.example/ok'], 'expired subscription removed');

  tgCalls.length = 0;
  await call(cron, {});
  assert.equal(tgCalls.length, 0, 'no duplicate sends, no second setWebhook');

  // snooze via Telegram -> due again -> no second monthly copy
  await call(webhook, { method: 'POST', headers: { 'x-telegram-bot-api-secret-token': webhookSecret() }, body: { callback_query: { id: 'cb1', data: 'snooze_10', message: { chat: { id: 222 }, message_id: 5, text: 'orig' } } } });
  Date.now = () => NOW + 2 * 3600e3;
  await call(cron, {});
  assert.equal(list('222').filter(x => x.title.startsWith('pay')).length, 2);

  Date.now = () => NOW;
  store.set('reminders:333', JSON.stringify([{ id: 1, title: 't', datetime: '2025-09-22T06:00:00.000Z', completed: false, sent: false }]));
  tgStatus = () => 502; await call(cron, {});
  assert.equal(list('333')[0].sent, false, '5xx retried');
  tgStatus = () => 400; await call(cron, {});
  assert.equal(list('333')[0].sent, true, '400 given up');
  tgStatus = () => 200;
  console.log('✓ cron.js');
}

// ---------- morning summary ----------
{
  store.set('reminders:666', JSON.stringify([
    { id: 1, title: 'overdue <x>', datetime: '2025-09-20T06:00:00.000Z', completed: false, sent: true },
    { id: 2, title: 'lunch', datetime: '2025-09-22T09:00:00.000Z', completed: false, sent: false }, // 12:30 Tehran
    { id: 3, title: 'tomorrow task', datetime: '2025-09-23T09:00:00.000Z', completed: false, sent: false },
    { id: 4, title: 'finished', datetime: '2025-09-22T08:00:00.000Z', completed: true }
  ]));
  const to666 = () => tgCalls.filter(c => c.method === 'sendMessage' && String(c.body.chat_id) === '666');

  Date.now = () => Date.parse('2025-09-22T04:29:00Z'); // 07:59 Tehran
  tgCalls.length = 0; await call(cron, {});
  assert.equal(to666().length, 0, 'not before the chosen hour');

  Date.now = () => Date.parse('2025-09-22T04:35:00Z'); // 08:05 Tehran
  tgCalls.length = 0; await call(cron, {});
  assert.equal(to666().length, 1, 'sent at 8');
  const s = to666()[0].body;
  assert.ok(s.text.includes('صبح بخیر') && s.text.includes('overdue &lt;x&gt;') && s.text.includes('lunch'));
  assert.ok(!s.text.includes('tomorrow task') && !s.text.includes('finished'));
  assert.ok(s.text.includes('۱۲:۳۰'), 'times in Tehran time');
  assert.equal(s.reply_markup.inline_keyboard[0][0].callback_data, 'ld_t_1');

  tgCalls.length = 0; await call(cron, {});
  assert.equal(to666().length, 0, 'once per day');

  Date.now = () => Date.parse('2025-09-23T08:00:00Z'); // next day 11:30 Tehran, outside 8..10
  tgCalls.length = 0; await call(cron, {});
  assert.ok(!to666().some(c => /صبح بخیر/.test(c.body.text)), 'no late summary');
  Date.now = realNow;
  console.log('✓ morning summary');
}

// ---------- webhook.js ----------
{
  Date.now = realNow;
  const secretHeader = { 'x-telegram-bot-api-secret-token': webhookSecret() };
  assert.equal((await call(webhook, { method: 'POST', body: { message: { chat: { id: 1 }, text: 'x' } } })).status, 401, 'forged update rejected once secured');

  store.set('reminders:444', JSON.stringify([{ id: 1757700000000.123, title: 'old float id', datetime: '2026-01-01T00:00:00.000Z', completed: false, sent: true }]));
  tgCalls.length = 0;
  await call(webhook, { method: 'POST', headers: secretHeader, body: { callback_query: { id: 'cb', data: 'complete_1757700000000.123', message: { chat: { id: 444 }, message_id: 1, text: 'msg' } } } });
  assert.equal(list('444')[0].completed, true);
  assert.ok(tgCalls.some(c => c.method === 'answerCallbackQuery'));

  await call(webhook, { method: 'POST', headers: secretHeader, body: { message: { chat: { id: 555 }, text: '/start' } } });
  assert.ok(tgCalls.at(-1).body.text.includes('555'), '/start replies with chat id');

  Date.now = () => Date.parse('2026-09-12T21:00:00Z'); // 00:30 on 13 Sep in Tehran, still 12 Sep in UTC
  await call(webhook, { method: 'POST', headers: secretHeader, body: { message: { chat: { id: 555 }, text: 'خرید نان فردا ساعت ۱۸:۳۰' } } });
  assert.equal(list('555')[0].title, 'خرید نان');
  assert.equal(list('555')[0].datetime, '2026-09-14T15:00:00.000Z');
  await call(webhook, { method: 'POST', headers: secretHeader, body: { message: { chat: { id: 555 }, text: 'تست امروز ساعت 9:05' } } });
  assert.equal(list('555')[1].datetime, '2026-09-13T05:35:00.000Z');
  assert.ok(tgCalls.at(-1).body.text.includes('09:05'));
  Date.now = realNow;
  console.log('✓ webhook.js');
}

// ---------- bot commands & buttons ----------
{
  store.set('reminders:666', JSON.stringify([
    { id: 1, title: 'overdue <x>', datetime: '2025-09-20T06:00:00.000Z', completed: false, sent: true },
    { id: 2, title: 'lunch', datetime: '2025-09-22T09:00:00.000Z', completed: false, sent: false },
    { id: 3, title: 'call mom', datetime: '2025-09-22T04:00:00.000Z', completed: false, sent: true }
  ]));
  store.delete('settings:666');
  Date.now = () => Date.parse('2025-09-22T04:35:00Z'); // 08:05 Tehran

  tgCalls.length = 0;
  await say(666, '/today@nirvana_bot');
  const today = tgCalls.at(-1).body;
  assert.equal(today.parse_mode, 'HTML');
  assert.ok(today.text.includes('کارهای امروز') && today.text.includes('overdue &lt;x&gt;'));
  assert.equal(today.reply_markup.inline_keyboard.length, 3);

  tgCalls.length = 0;
  await press(666, 'ld_t_2');
  assert.equal(list('666').find(r => r.id === 2).completed, true);
  assert.equal(lastEdit().body.reply_markup.inline_keyboard.length, 2, 'list re-rendered without the done item');
  assert.ok(tgCalls.some(c => c.method === 'answerCallbackQuery' && c.body.text.includes('lunch')));

  tgCalls.length = 0;
  store.set('attachment:666:1', JSON.stringify({ name: 'a', data: 'data:,x' }));
  await press(666, 'lx_t_1');
  assert.ok(!list('666').some(r => r.id === 1) && store.has('trash:666:1') && !store.has('attachment:666:1'), 'deleted to trash');
  const undo = tgCalls.find(c => c.method === 'sendMessage');
  assert.equal(undo.body.reply_markup.inline_keyboard[0][0].callback_data, 'restore_1');
  await press(666, 'restore_1');
  assert.ok(list('666').some(r => r.id === 1) && store.has('attachment:666:1') && !store.has('trash:666:1'), 'restored with attachment');
  assert.ok(lastEdit().body.text.includes('بازگردانده'));
  await press(666, 'restore_1');
  assert.ok(tgCalls.at(-1).body.text.includes('مهلت'), 'restore only once');

  await press(666, 'snztomorrow_3', 'due msg');
  assert.equal(list('666').find(r => r.id === 3).datetime, '2025-09-23T05:30:00.000Z', 'tomorrow 09:00 Tehran');
  await press(666, 'snztonight_3', 'due msg');
  assert.equal(list('666').find(r => r.id === 3).datetime, '2025-09-22T16:30:00.000Z', 'tonight 20:00 Tehran');
  await press(666, 'snz10m_3', 'due msg');
  assert.equal(list('666').find(r => r.id === 3).datetime, '2025-09-22T04:45:00.000Z');
  assert.ok(lastEdit().body.text.startsWith('due msg') && lastEdit().body.text.includes('۰۸:۱۵'), 'note shows local time');
  Date.now = () => Date.parse('2025-09-22T16:10:00Z'); // 19:40 Tehran: too close to 20:00
  await press(666, 'snztonight_3', 'due msg');
  assert.equal(list('666').find(r => r.id === 3).datetime, '2025-09-22T18:10:00.000Z', 'late "tonight" = +2h');

  // a user in another timezone (getTimezoneOffset 60 = UTC-1)
  store.set('settings:666', JSON.stringify({ tzOffsetMinutes: 60 }));
  Date.now = () => Date.parse('2025-09-22T12:00:00Z'); // 11:00 local
  await press(666, 'snztomorrow_3', 'due msg');
  assert.equal(list('666').find(r => r.id === 3).datetime, '2025-09-23T10:00:00.000Z', 'tomorrow 09:00 in UTC-1');
  store.delete('settings:666');

  await say(666, '/summary off');
  assert.equal(JSON.parse(store.get('settings:666')).dailySummary, false);
  assert.ok(tgCalls.at(-1).body.text.includes('خاموش'));
  await say(666, '/summary ۷');
  const st = JSON.parse(store.get('settings:666'));
  assert.equal(st.dailySummary, true); assert.equal(st.summaryHour, 7);
  assert.ok(tgCalls.at(-1).body.text.includes('۰۷:۰۰'));
  await say(666, '/summary banana');
  assert.ok(tgCalls.at(-1).body.text.includes('استفاده'));

  await say(666, '/list');
  assert.ok(tgCalls.at(-1).body.text.includes('کارهای باز'));
  await say(666, '/help');
  assert.ok(tgCalls.at(-1).body.text.includes('/today'));
  await say(666, '/whatever');
  assert.ok(tgCalls.at(-1).body.text.includes('نمی‌شناسم'));

  store.set('reminders:777', '[]');
  await say(777, '/today');
  assert.ok(tgCalls.at(-1).body.text.includes('کاری ندارید') && !tgCalls.at(-1).body.reply_markup, 'empty list has no buttons');
  Date.now = realNow;
  console.log('✓ bot commands & buttons');
}

// ---------- deployment without a bot token ----------
{
  const saved = process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_BOT_TOKEN;
  const reg = await call(auth, { method: 'POST', body: { action: 'register', email: 'nobot@example.com', password: 'secret1', chatId: '8888' } });
  assert.equal(reg.status, 503, 'no unverified registration without a bot');
  assert.ok(!store.has('user:nobot@example.com') && !store.has('chatowner:8888'), 'nothing created');
  store.set('user:unverified@example.com', JSON.stringify({ email: 'unverified@example.com', password: 'plain123', chatId: '9999' }));
  assert.equal((await call(auth, { method: 'POST', body: { action: 'login', email: 'unverified@example.com', password: 'plain123' } })).status, 503, 'unverified account cannot skip verification');
  assert.ok(!store.has('chatowner:9999'));
  assert.equal((await call(auth, { method: 'POST', body: { action: 'login', email: 'kasra@example.com', password: 'secret1' } })).status, 200, 'verified accounts still log in');
  process.env.TELEGRAM_BOT_TOKEN = saved;
  console.log('✓ no bot token');
}

console.log('\nAll server tests passed');
process.exit(0);
