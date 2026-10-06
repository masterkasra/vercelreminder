// Standalone Node server for hosts other than Vercel (Render, Koyeb, a VPS, Docker...).
// Serves the static PWA and runs the same api/*.js handlers with a Vercel-compatible req/res, so no code changes are needed.
// Start with `npm start`; the port comes from $PORT (default 3000).
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const MAX_BODY = 5 * 1024 * 1024; // attachments are ≤ 1 MB before base64
const API_ROUTES = new Set(['ai', 'auth', 'cron', 'push', 'reminders', 'settings', 'support', 'webhook']);
const STATIC_FILES = new Set(['/index.html', '/styles.css', '/sw.js', '/manifest.json']);
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.png': 'image/png' };

const handlers = new Map();
async function loadHandler(name) {
  if (!handlers.has(name)) handlers.set(name, (await import(`./api/${name}.js`)).default);
  return handlers.get(name);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY) { reject(Object.assign(new Error('Payload Too Large'), { status: 413 })); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

// The small subset of Vercel's helpers that the handlers use: status(), json(), send()
function vercelResponse(res) {
  res.status = code => { res.statusCode = code; return res; };
  res.json = data => { if (!res.headersSent) res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(data)); return res; };
  res.send = data => {
    if (data !== null && typeof data === 'object' && !Buffer.isBuffer(data)) return res.json(data);
    if (!res.headersSent && !res.getHeader('Content-Type')) res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end(data === undefined ? '' : String(data)); return res;
  };
  return res;
}

async function serveApi(name, url, req, res) {
  const handler = await loadHandler(name);
  req.query = Object.fromEntries(url.searchParams);
  const raw = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) ? await readBody(req) : '';
  if (raw && String(req.headers['content-type'] || '').includes('application/json')) {
    try { req.body = JSON.parse(raw); } catch { return vercelResponse(res).status(400).json({ error: 'Invalid JSON' }); }
  } else req.body = raw || undefined;
  await handler(req, vercelResponse(res));
}

async function serveStatic(pathname, res) {
  const file = pathname === '/' ? '/index.html' : pathname;
  if (!STATIC_FILES.has(file) && !/^\/icons\/[\w-]+\.png$/.test(file)) return false;
  const body = await readFile(path.join(ROOT, file)).catch(() => null);
  if (!body) return false;
  res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
  // The service worker and the page must update immediately; icons can be cached
  res.setHeader('Cache-Control', file.startsWith('/icons/') ? 'public, max-age=86400' : 'no-cache');
  res.end(body);
  return true;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const api = url.pathname.match(/^\/api\/([a-z]+)\/?$/);
    if (api && API_ROUTES.has(api[1])) return await serveApi(api[1], url, req, res);
    if (req.method === 'GET' && url.pathname === '/healthz') return res.end('ok');
    if ((req.method === 'GET' || req.method === 'HEAD') && await serveStatic(url.pathname, res)) return;
    res.statusCode = 404; res.end('Not Found');
  } catch (err) {
    console.error('Server error', req.url, err);
    if (!res.headersSent) { res.statusCode = err.status || 500; res.end(err.status ? err.message : 'Internal Server Error'); }
    else res.end();
  }
});

server.listen(PORT, () => console.log(`Nirvana listening on http://localhost:${PORT}`));
