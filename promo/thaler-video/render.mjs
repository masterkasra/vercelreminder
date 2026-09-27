// Renders index.html frame by frame in headless Chromium and encodes an Instagram/Telegram-ready MP4.
//
//   node render.mjs                 full video -> out/thaler-promo.mp4
//   node render.mjs --stills 2,7,12 PNG stills only (quick visual check)
//
// Env: FFMPEG (path to ffmpeg), WORKERS (parallel pages, default 3), CHROMIUM (browser binary).
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, 'out');
mkdirSync(out, { recursive: true });
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const WORKERS = +(process.env.WORKERS || 3);
const args = process.argv.slice(2);
const stills = args.includes('--stills') ? args[args.indexOf('--stills') + 1].split(',').map(Number) : null;

const run = (cmd, argv, opts = {}) => new Promise((res, rej) => {
  const p = spawn(cmd, argv, { stdio: ['ignore', 'inherit', 'inherit'], ...opts });
  p.on('exit', c => (c === 0 ? res() : rej(new Error(`${cmd} exited ${c}`))));
});

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM || undefined,
  args: ['--force-color-profile=srgb', '--disable-lcd-text', '--font-render-hinting=none'],
});

async function openPage() {
  const ctx = await browser.newContext({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.error('page error:', e.message));
  await page.goto(pathToFileURL(join(here, 'index.html')).href);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 30000 });
  const cdp = await ctx.newCDPSession(page);
  const shot = async () => Buffer.from((await cdp.send('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true })).data, 'base64');
  const meta = await page.evaluate(() => window.__meta);
  return { page, shot, meta };
}

if (stills) {
  const { page, shot, meta } = await openPage();
  // Seek forward through every frame so GSAP captures start values in order.
  let f = 0;
  for (const t of stills) {
    const target = Math.round(t * meta.fps);
    for (; f <= target; f++) await page.evaluate(x => window.__seek(x), f / meta.fps);
    writeFileSync(join(out, `still-${String(t).replace('.', '_')}.png`), await shot());
    console.log('still', t);
  }
  await browser.close();
  process.exit(0);
}

const probe = await openPage();
const { fps, duration } = probe.meta;
await probe.page.context().close();
const total = Math.round(fps * duration);
const per = Math.ceil(total / WORKERS);
const started = Date.now();
let done = 0;

async function worker(k) {
  const from = k * per, to = Math.min(total, from + per);
  if (from >= to) return null;
  const { page, shot } = await openPage();
  for (let f = 0; f < from; f++) await page.evaluate(x => window.__seek(x), f / fps); // warm-up
  const seg = join(out, `seg${k}.mp4`);
  const ff = spawn(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'png', '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '15', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-level', '4.2',
    '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', seg], { stdio: ['pipe', 'inherit', 'inherit'] });
  const closed = new Promise((res, rej) => ff.on('exit', c => (c === 0 ? res() : rej(new Error('ffmpeg segment failed')))));
  for (let f = from; f < to; f++) {
    await page.evaluate(x => window.__seek(x), f / fps);
    const buf = await shot();
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if (++done % 30 === 0) console.log(`${done}/${total} frames  ${((Date.now() - started) / 1000).toFixed(0)}s`);
  }
  ff.stdin.end();
  await closed;
  await page.context().close();
  return seg;
}

const segs = (await Promise.all(Array.from({ length: WORKERS }, (_, k) => worker(k)))).filter(Boolean);
await browser.close();

const list = join(out, 'segments.txt');
writeFileSync(list, segs.map(s => `file '${s}'`).join('\n'));
const silent = join(out, 'video-silent.mp4');
await run(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', silent]);
segs.forEach(s => rmSync(s));
rmSync(list);

const music = join(out, 'music.wav');
const final = join(out, 'thaler-promo.mp4');
const muxArgs = ['-y', '-loglevel', 'error', '-i', silent];
if (existsSync(music)) muxArgs.push('-i', music, '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-af', 'loudnorm=I=-14:TP=-1.5:LRA=9', '-shortest');
muxArgs.push('-c:v', 'copy', '-movflags', '+faststart', final);
await run(FFMPEG, muxArgs);
console.log(`done: ${final} in ${((Date.now() - started) / 1000).toFixed(0)}s`);
